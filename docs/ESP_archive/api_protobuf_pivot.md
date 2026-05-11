# Bridge API v2: Protobuf Pivot Plan

This document describes the architectural change from JSON-over-WebSocket to
nanopb protobuf-over-binary-WebSocket with ChaCha20-Poly1305 session
encryption. The pivot happens before the add-on client is built, eliminating
any migration cost.

Source of truth for the new protocol: `bridge_api_v1.proto` (the `.proto` file).
The JSON examples in `bridge_api_v1.md` remain as historical reference.

## Why

1. **Wire efficiency.** The current topology snapshot is ~3.4 KB in JSON for 3
   nodes. The same data in protobuf is ~700 bytes — a 5x reduction. Every MAC
   address drops from 17 bytes to 6, every schema hash from 71 bytes to 32.

2. **Code elimination.** 806 lines of hand-rolled JSON serialization and
   parsing (54% of the API codebase) are replaced by nanopb-generated codec
   code. The `.proto` file becomes the schema source of truth — no more
   spec-vs-implementation drift.

3. **Encryption.** The current protocol authenticates with HMAC-SHA256 then
   sends all subsequent messages as plaintext JSON on the LAN. The pivot adds
   ChaCha20-Poly1305 encryption derived from the auth nonces, at the cost of
   ~100-150 LOC. No new library dependencies (mbedTLS is already in ESP-IDF).

4. **Serial transport readiness.** Binary length-prefixed framing is simpler
   than JSON-over-COBS/SLIP for the planned UART transport. The same protobuf
   messages work over both WebSocket and serial.

5. **Extensibility.** Adding a new command means adding a field or message to
   the `.proto`, running `generate_proto.sh`, and updating encode/decode calls.
   Standard protobuf tooling (`betterproto`, `protobufjs`, `protoc`) generates
   client codecs automatically.

6. **Client cost zero.** No add-on client code exists yet. The pivot has no
   backward compatibility concerns.

## Architecture

```
┌──────────────┐                         ┌──────────────┐
│   Add-on /   │   WebSocket binary      │    Bridge    │
│   Browser    │◄───────────────────────►│   ESP32-C5   │
└──────────────┘                           └──────────────┘

Wire format (plaintext auth phase):
  Binary WS frame → Envelope protobuf (auth.challenge/response/ok)

Wire format (encrypted phase, after auth.ok):
  Binary WS frame → [4-byte LE counter][ChaCha20-Poly1305 ciphertext+tag]
                                                    │
                                         decrypts to → Envelope protobuf

Envelope protobuf:
  { version, message_type, optional_id, payload_bytes }

  payload_bytes decoded by message_type:
    TOPOLOGY_GET → TopologyGet
    TOPOLOGY_SNAPSHOT → TopologySnapshot
    AUTH_CHALLENGE → AuthChallenge
    ...

Session key derivation (after HMAC auth succeeds):
  session_key = HKDF-SHA256(
      ikm  = api_key_bytes,
      salt = server_nonce || client_nonce,
      info = "esp-tree-ws-v1-session",
      len  = 32
  )
  Independent counters: bridge→client starts at 0, client→bridge starts at 0.
```

## Wire Protocol

### Connection State Machine

```
CONNECTING → UNAUTHENTICATED (plaintext Envelope) → AUTHENTICATED (encrypted frames)
```

### Plaintext Frame (Auth Phase)

```
[protobuf Envelope bytes]
```

Wrapped in a WebSocket binary frame. No additional framing needed — WebSocket
provides message boundaries.

### Encrypted Frame (Post-Auth)

```
[4 bytes: counter, little-endian] [ChaCha20-Poly1305 ciphertext] [16 bytes: Poly1305 tag]
```

The ciphertext decrypts to protobuf `Envelope` bytes. Counter starts at 0 for
each direction (bridge→client, client→bridge). On decryption failure, close
the connection.

No framing byte is needed — the state machine determines whether a frame is
plaintext or encrypted.

## Session Encryption

Key derivation is identical on both sides after `auth.ok`:

```python
session_key = HKDF-SHA256(
    ikm  = api_key_bytes,
    salt = server_nonce_32bytes + client_nonce_32bytes,
    info = b"esp-tree-ws-v1-session",
    len  = 32
)

# Per-frame encryption
counter   = uint32_le, incrementing per direction
nonce     = counter.to_bytes(12, 'little')   # 4-byte counter + 8 zero bytes
aad       = b""                                # no additional authenticated data
ciphertext, tag = ChaCha20-Poly1305(key=session_key, nonce=nonce, aad=aad, plaintext=plaintext)
# Send: counter_bytes + ciphertext + tag
```

Both `HKDF-SHA256` and `ChaCha20-Poly1305` are in mbedTLS (already in
ESP-IDF). The existing `espnow_crypto` module already wraps mbedTLS for HMAC
and HKDF. We extend it with a ChaCha20-Poly1305 wrapper.

No new library dependencies.

## Protobuf Schema

All v1 message types map to protobuf messages. A single `bridge_api_v1.proto`
file defines:

- **`MessageType` enum** — numeric IDs for dispatch (replacing current type strings)
- **`Envelope` message** — outer wrapper (`version`, `type`, optional `id`, `payload` as `bytes`)
- **Auth messages** — `AuthChallenge`, `AuthResponse`, `AuthOk`
- **Bridge messages** — `BridgeInfoRequest`, `BridgeInfoResult`, `BridgeHeartbeat`
- **Topology messages** — `TopologyGet`, `TopologySnapshot`, `TopologyChanged`
- **Remote events** — `RemoteAvailability`, `RemoteState`, `RemoteSchemaChanged`, `RemoteMetadataChanged`
- **Cache messages** — `CacheInvalidate`, `CacheInvalidateResult`
- **OTA messages** — `OtaStart`, `OtaAccepted`, `OtaAck`, `OtaNack`, `OtaFlow`, `OtaStatus`, `OtaStatusResult`, `OtaAbort`, `OtaAborted`, `OtaResume`, `OtaResumeAccepted`, `OtaResumeRejected`
- **Error message** — `Error`

OTA binary chunk data becomes a proto message (replacing the separate `ET`
header format):

```protobuf
message OtaChunk {
  uint32 job_id = 1;
  uint32 sequence = 2;
  uint32 firmware_offset = 3;
  bytes payload = 4;
  uint32 flags = 5;       // bit 0: final_chunk
  uint32 payload_crc32 = 6;
}
```

MAC addresses use `bytes` (6 raw bytes) instead of `"AA:BB:CC:DD:EE:FF"`
strings — saving ~11 bytes per MAC at the cost of hex formatting on the client
display side.

## File Changes

### DELETE

| File | Reason |
|------|--------|
| `bridge_api_messages.h` | Replaced by nanopb-generated `bridge_api_v1.pb.h` |
| `bridge_api_messages.cpp` | 224 lines of hand-rolled JSON — replaced by proto encode |

### GENERATE (pre-generated, committed to repo)

| File | Source |
|------|--------|
| `bridge_api_v1.proto` | Written by hand, source of truth for schema |
| `bridge_api_v1.pb.h` | Generated by `protoc` + nanopb |
| `bridge_api_v1.pb.c` | Generated by `protoc` + nanopb |

### NEW

| File | Purpose |
|------|---------|
| `bridge_proto_codec.h` / `.cpp` | Thin wrapper: construct `Envelope`, encode/decode payload by `MessageType`, frame read/write |
| `bridge_session_crypto.h` / `.cpp` | HKDF key derivation from auth nonces, ChaCha20-Poly1305 encrypt/decrypt, counter management |
| `generate_proto.sh` | Script to run `protoc` + nanopb generator locally, output goes into `components/esp_tree_bridge/` |

### MODIFY

| File | Change |
|------|--------|
| `bridge_api_types.h` | Remove JSON envelope struct, add `MessageType` enum values matching proto, add crypto session state struct |
| `bridge_api_auth.h` / `.cpp` | Add session key derivation method (`derive_session_key()`) after successful HMAC verification |
| `bridge_api_router.h` / `.cpp` | Replace 133-line JSON parser with proto decode + dispatch by `MessageType`. Replace 211-line JSON event builders with proto encode calls. Router interface stays: `handle_authenticated_frame(data, len)` |
| `bridge_api_ws.h` / `.cpp` | Change from text frames to binary frames. Add encrypt/decrypt calls via `bridge_session_crypto`. Keep WebSocket upgrade logic (SHA-1 + base64 accept key). |
| `bridge_api_ota_frame.h` | Refactor: OTA chunk header becomes proto `OtaChunk` message, current packed struct is replaced |
| `esp_tree_bridge.h` / `.cpp` | Replace `api_bridge_info_json()` and `api_topology_snapshot_json()` with proto message construction. Replace JSON event emission with proto encode + encrypt. Add `bridge_session_crypto_` member. |
| `__init__.py` | Add nanopb library dependency |

### Code Volume Estimate

| What | Current LOC | New LOC |
|------|------------|---------|
| JSON serialization (messages.cpp + parts of bridge.cpp) | ~462 | 0 (proto-generated) |
| JSON parsing (router.cpp) | ~133 | ~30 (proto decode dispatch) |
| Message construction from bridge state | varies | ~200 (filling proto structs) |
| WebSocket transport (ws.cpp) | ~410 | ~380 (similar, binary frames) |
| Auth (auth.cpp) | ~100 | ~130 (+ session key derivation) |
| Session crypto | 0 | ~100 (new) |
| Proto codec wrapper | 0 | ~150 (new) |
| **Total API code** | ~1,470 | ~(1,000 + nanopb generated) |

Nanopb-generated code for ~25 message types: estimated ~800-1,200 lines of C.
But it's generated, not maintained by hand.

## Nanopb Build Integration

1. **Install once on dev machine:** `protoc` + nanopb generator
2. **`generate_proto.sh`:**
   ```bash
   #!/bin/bash
   protoc --nanopb_out=components/esp_tree_bridge/ \
     -I components/esp_tree_bridge/ \
     components/esp_tree_bridge/bridge_api_v1.proto
   # Commit the generated .pb.h/.pb.c files
   ```
3. **ESPHome build:** Just compiles the committed `.pb.c`/`.pb.h` files — no
   `protoc` needed in Docker image.
4. **Schema changes:** Edit `.proto` → run `generate_proto.sh` → commit
   generated files → update C++ encode/decode calls. Since v1 message types are
   stabilizing, this should be infrequent.

This is the same approach ESPHome uses for `api_pb2.h`/`api_pb2.cpp`.

## What Stays Unchanged

```
bridge_api_auth.h / .cpp      → KEEP, add derive_session_key()
bridge_api_ws.h / .cpp        → MODIFY (text → binary frames, add crypto calls)
bridge_api_types.h             → MODIFY (remove JSON structs, add proto enums)
bridge_api_router.h / .cpp    → REWRITE (JSON → proto), interface stays similar
bridge_api_messages.h / .cpp  → DELETE (replaced by proto-generated)
bridge_api_ota_frame.h        → MODIFY (packed struct → proto OtaChunk)
esp_tree_bridge.h / .cpp     → MODIFY (JSON builders → proto construction)
```

## Client Implications

### Python Add-On (Not Yet Built)

- Use `betterproto` or standard `protobuf` library
- Compile `.proto` → Python classes
- Session crypto: `cryptography` library (ChaCha20-Poly1305 + HKDF) — already available
- Clean API: `client.send(TopologyGet())` → automatically encoded, encrypted, framed

### Browser UI

- Use `protobufjs` (~15KB minified) for lightweight proto decode
- WebSocket binary frames → decrypt → decode → render
- Auth: same HMAC-SHA256 challenge-response, then derive session key
- Can be deferred to post-v2

### Serial Transport (Future)

- Same proto messages, different framing: `[varint length][CRC16][protobuf Envelope bytes]`
- Plaintext over UART (physical security by USB cable attachment)
- OR: derive session key from a challenge over UART too

## Implementation Phases

### Phase A: Proto Schema and Nanopb Setup

- Write `bridge_api_v1.proto`
- Set up `generate_proto.sh`
- Generate and commit `.pb.h`/`.pb.c`
- Verify nanopb compiles in ESPHome Docker build

### Phase B: Proto Codec and Auth

- Write `bridge_proto_codec.h`/`.cpp` (Envelope encode/decode/dispatch)
- Modify `bridge_api_auth` to add `derive_session_key()`
- Write `bridge_session_crypto.h`/`.cpp` (ChaCha20-Poly1305, counter management)
- Test auth + key derivation in host-side unit tests

### Phase C: Transport Rewrite

- Modify `bridge_api_ws` for binary WebSocket frames + encrypt/decrypt
- Modify `bridge_api_router` for proto decode dispatch
- Replace `bridge_api_messages` with proto message construction
- Replace OTA binary frame with proto `OtaChunk`
- Delete JSON serialization/parsing code

### Phase D: Hardware Integration and Test

- Flash bridge, test with updated `test_bridge_api.py`
- Verify auth, topology, events, OTA over encrypted proto
- Remove JSON code paths
- Update `bridge_api_v1.md` to reference `.proto` as source of truth

## Open Decisions

| # | Decision | Default | Notes |
|---|----------|---------|-------|
| 1 | Nonce sizes for auth | 32 bytes | Consistent with current implementation |
| 2 | MAC address encoding in proto | `bytes` (6 raw bytes) | More efficient, ~11 bytes saved per MAC, less readable in debug |
| 3 | JSON legacy API alongside proto? | Hard cutover | No client code to migrate |
| 4 | Auth messages plaintext or encrypted? | Plaintext | Nonces must be exchanged to derive session key |
| 5 | Counter nonce width | 32-bit (4B frames per direction) | Far beyond session lifetime |
| 6 | Browser UI support in v2? | Deferred | Get proto + add-on working first |

## Comparison to Alternatives Considered

### ESPHome Native API (Protobuf + Noise + TCP 6053)

Not suitable because:
- Message types are entirely hardcoded (IDs 1-131, no extensibility)
- Brings in TCP server, Noise encryption, entity controllers, entire HA integration
- Can't define custom message types like `TopologySnapshot` or `RemoteAvailability`
- Wrong domain model (HA entity management, not bridge/topology/OTA management)
- No WebSocket support (browser UI requires separate path)

### Custom Binary Codec (Not Protobuf-Compatible)

Simpler (~300 LOC) but:
- Every client implementation must reverse-engineer the format
- No standard tooling for Python, JS, Go, Rust
- Schema must be documented separately from the format definition
- `.proto` is self-documenting and auto-generates codecs

### Noise Protocol Framework (Instead of HMAC + Session Encryption)

More theoretically sound (forward secrecy, authenticated DH) but:
- Adds `noise-c` + `libsodium` dependencies (~34KB flash)
- ~500-700 LOC additional implementation
- Forward secrecy is theater for a LAN device with a shared PSK
- HMAC-SHA256 auth + HKDF-derived session encryption achieves the same
  practical security with 0 new deps and ~100 LOC

### Current JSON + WebSocket (Status Quo)

Works but:
- 54% of API codebase is hand-rolled JSON serialization/parsing
- ~5x wire overhead vs protobuf
- Multiple `std::string` concatenations per message on 320KB SRAM device
- JSON-over-serial requires COBS/SLIP framing (more complex than length-prefix)
- The browser UI argument is weak — `protobufjs` is well-established