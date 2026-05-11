# Bridge Lite Specification

## Overview

`bridge_lite` is a new ESPHome external component under `components/` that implements a **passive radio relay**. It eliminates the bridge's autonomous protocol engine — all radio traffic is mirrored to a Home Assistant addon via encrypted protobuf over WebSocket. The addon is the protocol brain (session management, encryption, state machines, MQTT discovery). The ESP is a thin pipe: validate PSK tag, forward frames, transmit on command.

**Core motivation:** Reduce the bridge codebase by ~80% by avoiding maintaining both a radio protocol engine and an API protocol on the ESP. The addon handles all protocol logic; the ESP just shuttles bytes.

---

## Architecture

```
Remote ──ESP-NOW──► ESP (bridge_lite) ──WebSocket──► HA Addon ──MQTT──► Home Assistant
                         │                              │
                    PSK tag check              Full protocol engine:
                    Ring buffer                Session key derivation
                    Peer add/evict             Join/schema/state machines
                    esp_now_send()             Encryption/decryption
                                               Heartbeat/offline detection
                                               MQTT auto-discovery
                                               Command dispatch + retry
```

### What the ESP Does

1. Initialize WiFi + ESP-NOW
2. Validate PSK tag on every received frame (4-byte truncated HMAC-SHA256)
3. Forward valid frames to addon via protobuf over WebSocket
4. Accept `RadioSend` commands from addon → `esp_now_send()`
5. Auto-add ESP-NOW peers from received frames; LRU-evict stale peers on outbound when slots full
6. Maintain a 100-frame ring buffer for inbound frames when addon is disconnected
7. Send `BridgeHello` on connection, `BridgeStatus` every 30s, `SendResult` per outbound frame
8. Authenticate + encrypt the WebSocket with PSK-derived ChaCha20-Poly1305

### What the ESP Does NOT Do

- No session management, encryption, or key derivation (beyond PSK tag validation)
- No MQTT
- No protocol state machines (discover, join, schema, state-sync)
- No heartbeat timeout tracking
- No command queue or retry logic
- No entity discovery or state publishing
- No topology page, no OTA manager
- No schema cache

---

## Proto Schema

File: `components/bridge_lite/proto/espnow_bridge.proto`

```protobuf
syntax = "proto3";

message BridgeHello {
  bytes bridge_mac = 1;
  string espnow_mode = 2;      // "lr" or "regular"
  uint32 max_peers = 3;
  string version = 4;
  uint32 max_inflight = 5;     // flow control window
}

message RadioFrame {
  bytes src_mac = 1;           // sender MAC from frame header
  bytes raw_frame = 2;         // complete frame bytes (header + payload + tags)
  bool psk_tag_valid = 3;     // already validated by ESP
  int32 rssi = 4;              // signal strength from RX callback
  uint32 timestamp_ms = 5;    // ESP millis() when received
}

message RadioSend {
  bytes dst_mac = 1;           // radio destination MAC (not in frame payload)
  bytes raw_frame = 2;         // pre-encrypted frame ready for esp_now_send()
  bool lr_mode = 3;            // use LR PHY mode for this peer
  uint32 seq = 4;              // sequence number for SendResult matching
}

message SendResult {
  uint32 seq = 1;              // matches RadioSend.seq
  bool success = 2;
  string error = 3;            // optional error detail
}

message BridgeStatus {
  int32 wifi_rssi = 1;
  uint32 uptime_s = 2;
  uint32 free_heap = 3;
  uint32 peers_connected = 4;  // current peer slot count
  uint32 rx_queue_fill = 5;    // frames in ring buffer
}

message BridgeMessage {
  oneof payload {
    BridgeHello hello = 1;
    RadioFrame frame = 2;
    RadioSend send = 3;
    SendResult result = 4;
    BridgeStatus status = 5;
  }
}
```

---

## WebSocket Transport

### Endpoint

`ws://<bridge-ip>/esp-tree/lite/v1/ws` — distinct from the active bridge's `/esp-tree/v1/ws`.

### Connection

- **Single connection only** — second client gets rejected (409 Conflict)
- **Addon connects to bridge** — bridge is the WebSocket server, addon is the client
- **Bridge discovery** — mDNS (`_espnowlr._tcp`) with manual IP fallback in addon config

### Handshake

1. Addon opens WebSocket connection
2. Bridge sends `BridgeHello` protobuf message (unencrypted at this point)
3. Auth + encryption established (see Authentication & Encryption below)
4. Bridge sends any buffered frames from ring buffer
5. Normal operation begins

### Frame Framing

- Each WebSocket binary frame = one serialized `BridgeMessage`
- No additional framing needed (WebSocket provides message boundaries)
- For future serial transport: SLIP or COBS encoding around each serialized `BridgeMessage`

---

## Authentication & Encryption

PSK-derived ChaCha20-Poly1305 with per-direction counters. Extends the existing HMAC challenge-response pattern.

### Handshake

1. Bridge sends 32-byte random `server_nonce` (hex-encoded JSON: `{"type":"auth_challenge","nonce":"<hex>"}`)
2. Addon sends 32-byte random `client_nonce` + HMAC-SHA256 response (JSON: `{"type":"auth_response","nonce":"<hex>","hmac":"<hex>"}`)
3. Bridge validates HMAC
4. Both sides derive session key: `HKDF-SHA256(api_key, server_nonce || client_nonce, "esp-tree-lite-v1-session")`
5. Two independent ChaCha20-Poly1305 keys derived from session key: one for bridge→addon, one for addon→bridge
6. Subsequent WebSocket binary frames are: `[4-byte counter LE][ChaCha20-Poly1305 ciphertext][16-byte Poly1305 tag]`
7. Independent 32-bit counters per direction, starting at 0
8. On disconnect, both sides discard session keys

### Security Properties

| Property | Status |
|----------|--------|
| Confidentiality | ChaCha20 encryption on all post-auth frames |
| Integrity | Poly1305 MAC prevents tampering |
| Replay protection | Monotonic per-direction counters reject replayed frames |
| Forward secrecy | Not provided — PSK compromise reveals all sessions (acceptable for shared-PSK LAN device) |
| Per-frame overhead | 20 bytes (4-byte counter + 16-byte tag) |
| Libraries | mbedTLS (already in ESP-IDF) provides HKDF, ChaCha20, Poly1305 |

### Rationale

The three alternatives considered were:

1. **HMAC auth only (current bridge)** — No encryption after handshake. LAN observers can read all frames. No injection protection after auth. Not acceptable for passive mode where the addon sends encrypted radio commands.
2. **Noise_NNpsk0 (ESPHome native API)** — Maximum security with forward secrecy via X25519 DH. But ~34KB flash, ~4-6KB RAM, 2 RTT handshake, ~500-700 LOC. Forward secrecy is theater for a shared-PSK LAN device.
3. **TLS (wss://)** — Standard but ~40-60KB RAM, slow handshake on ESP32, certificate management burden.

PSK + ChaCha20-Poly1305 provides the same practical security as Noise for a LAN IoT device, at ~2-3KB flash, ~200B RAM, and ~100-150 LOC.

---

## Flow Control

- `BridgeHello.max_inflight` tells the addon the maximum number of unacked `RadioSend` messages (e.g. 8)
- Addon tracks outstanding `seq` numbers against incoming `SendResult` messages
- If addon has `max_inflight` unacked sends, it must wait for a `SendResult` before sending more
- This is the sole backpressure mechanism — no separate queue status messages
- The same mechanism serves all outbound traffic: commands, heartbeats, OTA chunks. The bridge doesn't differentiate.

---

## Ring Buffer

- **Size**: 100 frames, hardcoded
- **Behavior**: When addon is disconnected, valid received frames are written to a circular buffer
- **On reconnect**: Buffer contents are sent to addon after `BridgeHello`, oldest first
- **Overflow**: Oldest frames are dropped (overwritten by newest)
- **On fresh connect**: Buffer starts empty (no stale data across sessions)

---

## ESP-NOW Peer Management

The bridge auto-adds peers from received frames and on outbound sends. This mirrors the current bridge behavior — learn from inbound, add just-in-time for outbound, evict stale when slots are full.

1. **Inbound**: Every frame from a new MAC → auto-add as ESP-NOW peer
2. **Outbound**: Before `esp_now_send()`, check if peer exists → add if needed → if peer slots full, LRU-evict the stalest peer and retry
3. **No session-awareness**: The bridge does not know which peers are "active" — eviction is pure LRU by timestamp (no `is_peer_protected_()` check, since the ESP has no session knowledge)
4. **LR mode**: Set per `RadioSend.lr_mode` flag (PHY mode is a per-peer ESP-NOW setting)

---

## Component Structure

```
components/bridge_lite/
  __init__.py                  # YAML config schema + component registration
  bridge_lite.h                # Main component class
  bridge_lite.cpp              # Setup/loop: WiFi, ESP-NOW, PSK tag, RX queue, peer mgmt
  transport.h                  # BridgeTransport abstract interface
  transport_ws.h               # WebSocket server transport (implements BridgeTransport)
  transport_ws.cpp             # WebSocket server implementation
  proto/
    espnow_bridge.proto        # Proto schema
  nanopb/
    espnow_bridge.pb.h         # Generated
    espnow_bridge.pb.c         # Generated
```

### Dependencies

- `wifi`
- `web_server` (for WebSocket server via `web_server_base`)
- `esp_tree_common` (PSK tag validation, frame type constants)

### NOT Depended On

- `mqtt`
- `esp_tree_bridge` (no shared code beyond `esp_tree_common`)

---

## YAML Config

```yaml
esp_tree_bridge_lite:
  network_id: "my_network"      # Required. Must match remotes.
  psk: "0123456789abcdef..."   # Required. 64 hex chars = 32 bytes.
  espnow_mode: "lr"            # Optional. "lr" or "regular". Default: "lr"
  api_key: ""                  # Optional. WS auth key. Default: "" (disabled)
```

Only 4 config keys. Everything else is driven by the addon.

---

## Demo YAML

```yaml
# demos/espnow-bridge-lite.yml
substitutions:
  name: espnow-bridge-lite

esphome:
  name: ${name}
  external_components:
    - source:
        type: local
        path: /external

esp_tree_bridge_lite:
  network_id: !secret network_id
  psk: !secret psk
  api_key: !secret api_key

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

web_server:
  port: 80
```

---

## Addon Responsibilities

The addon (in the `esphomenow-tree` HA addon) is the protocol brain. It:

- Establishes and authenticates the WebSocket connection to `bridge_lite`
- Derives session keys, encrypts/decrypts all protocol frames
- Runs the full ESP-NOW LR protocol state machine (discover, join, schema, state-sync, heartbeat, deauth)
- Publishes MQTT auto-discovery entities for each remote
- Publishes MQTT state updates
- Subscribes to MQTT command topics
- Constructs encrypted COMMAND frames and sends them via `RadioSend`
- Manages command retry with exponential backoff
- Detects remote offline via heartbeat timeout
- Manages OTA firmware delivery (packages FILE_TRANSFER frames, sends via `RadioSend`, tracks window)
- Publishes bridge diagnostics to MQTT (WiFi RSSI, uptime, heap from `BridgeStatus`)
- mDNS discovery of bridge with manual IP fallback

### MQTT Auto-Discovery (V1)

V1 uses MQTT auto-discovery — the same topic structure as the active bridge (`homeassistant/<component>/<node_key>/<object_id>/config`). New remotes appear as MQTT entities immediately with no user confirmation step.

A custom HACS integration with `config_flow` for "Discovered devices" UX is planned for V2.

---

## Message Flow Summary

| Message | Direction | Trigger |
|---------|-----------|---------|
| `BridgeHello` | ESP → Addon | On WebSocket connection |
| `RadioFrame` | ESP → Addon | Every valid RX frame |
| `BridgeStatus` | ESP → Addon | Every 30 seconds |
| `SendResult` | ESP → Addon | Per outbound frame (success/fail) |
| `RadioSend` | Addon → ESP | Addon wants to transmit a frame |
| `BridgeMessage` | Both | Envelope wrapping all messages (`oneof payload`) |

---

## What's Removed vs Active Bridge

| Feature | Active Bridge | Bridge Lite |
|---------|-------------|-------------|
| BridgeProtocol engine | ~1700 lines | Removed |
| Session management | Full state machine | Removed |
| Encryption/decryption | Full crypto suite | PSK tag validation only |
| MQTT | Hard dependency, all publishing | Removed |
| WebSocket API | JSON protocol | Protobuf binary protocol |
| Schema cache | Yes | Removed |
| Command queue + retry | Yes | Removed |
| Heartbeat timeout | Yes | Removed |
| Topology page | Yes | Removed |
| OTA manager | ~500 lines | Removed (addon drives) |
| Entity publishing | Yes | Removed |
| Force rejoin button | Yes | Removed |
| **Approximate line count** | ~5000 | ~400-500 |

---

## Future: Serial Transport

Serial is a future transport that replaces WiFi entirely. The design supports it via the `BridgeTransport` interface:

- Same `BridgeMessage` proto messages
- SLIP or COBS encoding for framing over byte stream
- The ESP would run no WiFi stack, no WebSocket server — just ESP-NOW + UART + protobuf
- A USB-dongle bridge would need only: ESP-NOW init + PSK + serial + protobuf encode/decode
- The transport swap is transparent to the addon (same proto messages, different framing)
- Both `bridge_lite` and the active `esp_tree_bridge` could gain serial support via the same `BridgeTransport` abstraction
- Serial would be a 100% WiFi replacement, not a parallel transport

Implementation is deferred — the `BridgeTransport` abstract interface ensures it can slot in later without redesigning the proto schema or the addon.

---

## Implementation Order

1. Proto schema + nanopb generation
2. `BridgeTransport` interface
3. `bridge_lite.h/.cpp` core: WiFi, ESP-NOW, PSK tag check, ring buffer, peer management
4. `transport_ws.h/.cpp`: WebSocket server with auth + ChaCha20-Poly1305
5. `__init__.py`: YAML config schema
6. Demo YAML: `demos/espnow-bridge-lite.yml`
7. Compile test with `./compile.sh`