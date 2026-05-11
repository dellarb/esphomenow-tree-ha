# LoRa Transport Support — Roadmap

**Status: Draft / Planning**

**Date: May 2026**

**Goal:** Extend the ESP-NOW LR protocol to run over LoRa radios, enabling long-range remote deployments beyond what ESP-NOW LR can practically reach. The protocol layer (packet types, state machine, crypto, fragmentation, relay semantics) remains identical — only the transport layer changes.

---

## 1. Motivation

ESP-NOW LR provides ~1–2 km range in open environments using CSS modulation at 2.4 GHz. LoRa can extend this to 5–20 km depending on terrain, module power, and spreading factor. For remote sensors on rural properties, farm installations, or structures separated by heavy obstructions, LoRa is the practical choice.

The protocol already supports:
- Multi-hop relay forwarding
- PSK-based end-to-end encryption
- Automatic node discovery and reconnection
- Fragmented payloads for large entity states

All of this is radio-agnostic. LoRa support is a transport adapter, not a protocol redesign.

---

## 2. Design Principles

1. **Protocol parity** — All ESP-NOW LR packet types, state machine states, and crypto flow apply unchanged to LoRa.
2. **Transport abstraction** — Radio-specific code isolated behind a `LoraTransport` class. Protocol code calls `send()` / `recv()` without knowing which radio is used.
3. **Auto-discovery** — Remotes scan for bridge using the same DISCOVER → RESPONSE flow, adapted for LoRa channel structure.
4. **No flash persistence yet** — Bridge address and channel stored in memory only. Remotes re-discover on cold boot (same as ESP-NOW LR v1 behavior).
5. **Single relay hop** — LoRa relays are mains-powered only. No battery-powered relay nodes. Maximum one relay hop in the tree.
6. **Fragment negotiation** — Max payload size negotiated at join time based on bridge's advertised capability and remote's SF.

---

## 3. Hardware Model

### 3.1 Bridge (unchanged from ESP-NOW LR)

- Wi-Fi connected (station mode) for MQTT to Home Assistant
- **LoRa radio** added for communication with remotes
- No ESP-NOW involvement on the bridge when operating in LoRa mode
- Remains the single MQTT endpoint

### 3.2 Remote Nodes (mutually exclusive)

A remote is either:
- **ESP-NOW LR remote** — existing behavior, no LoRa radio
- **LoRa remote** — no Wi-Fi, LoRa radio only

Dual-band (Wi-Fi + LoRa) on a remote is out of scope.

### 3.3 Relay Nodes

- Mains-powered remotes may act as LoRa relays
- Maximum **one relay hop** between leaf and bridge
- Relay forwards encrypted blobs (does not terminate session)
- Same relay semantics as ESP-NOW LR (blind forward, PSK tag validation)

### 3.4 Target Region: Australia (AU915)

AU915 band parameters:

| Parameter | Value |
|-----------|-------|
| Frequency range | 915–928 MHz |
| Bandwidth options | 125 kHz / 500 kHz |
| Spreading Factors | SF7–SF12 |
| Max TX power | 30 dBm (1W) — typical modules cap at 20–22 dBm |
| Regulatory duty cycle | No strict legal limit (ACMA), 10% guideline recommended |

---

## 4. Addressing

### 4.1 DevAddr (replaces MAC)

| Transport | Address Size | Format |
|-----------|-------------|--------|
| ESP-NOW LR | 6 bytes | IEEE 802.11 MAC |
| LoRa | 4 bytes | DevAddr (LoRaWAN-style) |

The 17-byte frame header field `leaf_mac[6]` is replaced with:

```c
typedef struct __attribute__((packed)) {
    uint8_t  dev_addr[4];    // LoRa device address
    uint8_t  rf_region[2];  // Region marker (AU915), reserved for other regions
} esp_tree_addr_t;          // Still 6 bytes total — header size unchanged
```

When a LoRa remote boots for the first time, it generates a random 4-byte DevAddr. This is stored in memory (not flash for v1). The DevAddr persists for the session; a cold reboot generates a new one (same as ESP-NOW LR behavior where MAC is stable but session keys are not).

### 4.2 DevAddr Allocation

- Remote generates random 4-byte DevAddr on first boot (fresh nonce each boot)
- Bridge tracks remotes by DevAddr in its session table
- No central DevAddr registry required — bridge distinguishes remotes by (DevAddr + session_key)
- Relays forward by DevAddr lookup in their routing table (same as ESP-NOW LR leaf_mac routing)

---

## 5. Channel Model

### 5.1 LoRa Channel = 3-Tuple

Unlike Wi-Fi where "channel" is a single frequency, LoRa channels are defined by:

```
(channel) = (frequency MHz, spreading_factor, bandwidth kHz)
```

Example: `CH_EU868_SF10_125` = 868.2 MHz + SF10 + 125 kHz

### 5.2 Discovery vs Operational Channels

The bridge operates on two types of channels:

| Channel Type | Purpose | SF偏好 |
|-------------|---------|--------|
| **Discovery channel** | Remote scans here to find bridge via DISCOVER packet | SF10 (higher sensitivity, longer range) |
| **Operational channel** | Normal traffic after join (JOIN, STATE, HEARTBEAT, etc.) | SF7–SF10 (auto-negotiated) |

The bridge listens on the discovery channel continuously. When a DISCOVER is received, the bridge responds with a RESPONSE that includes the operational frequency and SF for that remote.

### 5.3 Channel Configuration (YAML)

**Bridge YAML config (explicit):**
```yaml
esp_tree_lora:
  discovery_channels:
    - freq: 916.2
      sf: 10
      bw: 125
    - freq: 916.4
      sf: 10
      bw: 125
  operational_channel:
    freq: 916.8
    sf: 9
    bw: 125
  tx_power: 20    # dBm (default 20)
```

**Remote YAML config (auto-discover):**
```yaml
esp_tree_lora:
  # No freq/sf specified — remote discovers from bridge RESPONSE
  # Remote scans discovery_channels list from YAML config
  discovery_channels:
    - freq: 916.2
      sf: 10
      bw: 125
    - freq: 916.4
      sf: 10
      bw: 125
```

---

## 6. Discovery Flow

Mirrors ESP-NOW LR DISCOVER → DISCOVER_ACK → JOIN flow, adapted for LoRa scanning.

### 6.1 Initial Discovery (no known bridge)

```
Remote boots (no stored bridge config)
    │
    ▼
Scan discovery_channels sequentially:
  For each channel:
    TX PKT_DISCOVER
    Wait LORA_DISCOVER_DWELL_MS (2000ms) for RESPONSE
    No response → next channel
    │
    ▼
Bridge receives DISCOVER on discovery channel
  TX PKT_DISCOVER_RESPONSE with (ops_freq, ops_sf, bridge_devaddr)
    │
    ▼
Remote receives RESPONSE
  Store (bridge_devaddr, ops_freq, ops_sf) in memory
  TX PKT_JOIN on ops_freq/ops_sf
    │
    ▼
Bridge receives JOIN
  Normal join flow → JOIN_ACK
    │
    ▼
Remote → NORMAL state
```

### 6.2 Fast Join (known bridge, stored in memory)

```
Remote boots (has stored bridge config)
    │
    ▼
TX PKT_JOIN directly on stored (ops_freq, ops_sf)
    │
    ▼
Success → NORMAL
Failure after 2 attempts → start_discovery_cycle_() (full channel scan)
```

This mirrors the ESP-NOW LR behavior where `fast_rejoin_` flag triggers immediate join attempt before full scan.

### 6.3 Signal Loss / Reconnection

Same logic as ESP-NOW LR remote:

```
consecutive_send_failures_ >= 4
    │
    ▼
start_route_recovery_cycle_()
  fast_rejoin_ = true
  discovery_current_channel_only_ = true  (try ops channel first)
    │
    ▼
2 fast attempts fail
    │
    ▼
fall back to full discovery scan (all discovery_channels)
```

### 6.4 Discovery Channel Scanning

Remote scans channels one at a time:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `LORA_DISCOVER_DWELL_MS` | 2000 | SF10 @ 125kHz DISCOVER fits in ~500ms; 2s gives margin for bridge response |
| Max scan time (worst case) | 8 channels × 2s = 16s | Acceptable for initial pairing |
| Scan interval between attempts | 500ms backoff (2000/4000/8000/16000ms cap) | Same as ESP-NOW LR discovery backoff |

---

## 7. State Machine

Identical to ESP-NOW LR — same states, same transitions, same triggers.

```
DISCOVERING  ──── bridge response ────►  JOINING
                                          │
                                    JOIN_ACK accepted
                                          │
                                          ▼
                                       JOINED
                                          │
                                   schema refresh complete
                                          ▼
                                    STATE_SYNC
                                          │
                                   all entities pushed
                                          ▼
                                      NORMAL
                                          │
                              signal loss detected
                                          ▼
                              start_route_recovery_cycle_()
```

| State | LoRa Behavior |
|-------|---------------|
| `DISCOVERING` | Scan discovery_channels, TX DISCOVER, wait for RESPONSE |
| `JOINING` | TX JOIN on operational channel, 4 retries with backoff |
| `JOINED` | Bridge requesting schema, no state push yet |
| `STATE_SYNC` | Push dirty entities, wait for ACK |
| `NORMAL` | Heartbeat, state updates, command handling |

---

## 8. Timing Parameters

LoRa airtime is significantly larger than ESP-NOW LR. All timeouts must be scaled accordingly.

| Constant | ESP-NOW LR | LoRa (planned) | Rationale |
|----------|-----------|-----------------|-----------|
| `LORA_ACK_TIMEOUT_MS` | 300 | 5000 | SF10 @ 125kHz packet ~1-2s airtime + processing |
| `LORA_MAX_RETRIES` | 4 | 4 | Same retry count |
| `LORA_RETRY_BACKOFF_MS[]` | 200, 400, 800, 1600 | 2000, 4000, 8000, 16000 | 10x scaling for LoRa airtime |
| `LORA_HEARTBEAT_INTERVAL_S` | 60 | 60 | Same — protocol-level, not radio-level |
| `LORA_DISCOVER_DWELL_MS` | 200 | 2000 | LoRa packet is much longer |
| `LORA_DISCOVER_BACKOFF_START_MS` | 500 | 2000 | SF10 DISCOVER is ~500ms, give margin |
| `LORA_DISCOVER_BACKOFF_CAP_MS` | 6000 | 16000 | Match retry backoff cap |
| `LORA_WAIT_REJECT_DELAY_MS` | 10000 | 10000 | Same — bridge-side decision |
| `LORA_TOPOLOGY_REFRESH_INTERVAL_MS` | 120000 | 120000 | Same — RSSI-based parent selection |

---

## 9. Fragmentation and MTU

### 9.1 LoRa MTU by Spreading Factor

| SF | Bandwidth | Max Payload (approx) | Notes |
|----|-----------|---------------------|-------|
| SF7 | 125 kHz | ~500 bytes | Fastest, shortest range |
| SF8 | 125 kHz | ~350 bytes | |
| SF9 | 125 kHz | ~250 bytes | |
| SF10 | 125 kHz | ~200 bytes | Typical discovery SF |
| SF11 | 125 kHz | ~150 bytes | |
| SF12 | 125 kHz | ~100 bytes | Longest range, slowest |

### 9.2 Fragment Negotiation

On `PKT_JOIN_ACK`, the bridge advertises its `max_payload_size` based on the operational SF it assigns to that remote. The remote uses this to compute `max_fragment_size`:

```
max_fragment = min(remote_max, bridge_max) - sizeof(fragment_envelope)
```

The fragment envelope (5 bytes) is the same as ESP-NOW LR:
```c
typedef struct __attribute__((packed)) {
    uint8_t  entity_index;
    uint8_t  flags;           // bit0=MORE_FRAGMENTS, bit1=MORE_DIRTY
    uint8_t  fragment_index;
    uint8_t  fragment_count;
    uint8_t  value_len;
} espnow_entity_packet_header_t;  // 5 bytes
```

### 9.3 Multi-Entity Packets

Same as ESP-NOW LR — multiple entities can be batched in a single packet up to `max_fragment_size`. The bridge processes entities sequentially.

---

## 10. Relay Support

### 10.1 Feasibility

LoRa relays are **feasible** but constrained by LoRa's half-duplex nature. A relay must:
1. Receive the full packet from upstream (leaf or another relay)
2. Buffer it
3. Wait for TX completion
4. Forward to downstream (bridge or another leaf)

At SF10, a 200-byte packet takes ~300–500ms to transmit. Relay latency is significant but manageable for the relay's own traffic. The relay cannot simultaneously listen while transmitting.

### 10.2 Constraints

| Constraint | Implication |
|------------|-------------|
| **Half-duplex** | Relay RX→TX turn-around adds latency |
| **Duty cycle** | Mains-powered relay only — no battery relay nodes |
| **Max 1 hop** | No relay chaining. Leaf → Relay → Bridge only |
| **Airtime budget** | Relay TXes as much as it RXes — watch 10% duty cycle guideline |

### 10.3 Relay Behavior

Identical to ESP-NOW LR relay:
- Validates PSK tag on every packet before forwarding
- Does NOT terminate sessions (no session key access)
- Maintains routing table: DevAddr → next_hop_DevAddr
- Supports downstream (leaf → relay → bridge) and upstream (bridge → relay → leaf) forwarding
- Stores reverse paths during join flow to deliver JOIN_ACK

### 10.4 Relay Route Selection

Bridge tracks relay candidates with their LoRa channel configuration. When a leaf sends DISCOVER, the bridge (or intermediate relay) responds with routing that includes the next-hop's frequency/SF.

---

## 11. Encryption

Same as ESP-NOW LR — no changes required.

### 11.1 Session Key Derivation

```
session_key = HKDF-SHA256(PSK, bridge_nonce || remote_nonce)
```

Both ends derive independently. Fresh per-join cycle.

### 11.2 Per-Packet Authentication

```
psk_tag = HMAC-SHA256(PSK, bytes[2..12] || payload)[0:4]
session_tag = HMAC-SHA256(session_key, bytes[2..12] || ciphertext)[0:8]
```

### 11.3 Per-Packet Encryption

AES-CTR with `tx_counter` as nonce.

### 11.4 Key Management

Same PSK approach as ESP-NOW LR — a shared secret configured in YAML/secrets.yaml. Each remote has the same PSK (no per-device unique keys for v1).

---

## 12. Transport Adapter Architecture

### 12.1 Class Hierarchy

```
remote_protocol.cpp    ← unchanged (calls LoraTransport)
espnow_crypto.cpp     ← unchanged
        │
        ▼
LoraTransport (interface)
  ├── send(packet, len, dest_devaddr)
  ├── recv(packet, &len, &src_devaddr)
  ├── set_channel(freq, sf, bw)
  ├── get_rssi()
  └── tx_power()
        │
        ▼
RadioLib (sx1262, sx1276, E220, Ra-01...)
```

### 12.2 LoraTransport Interface

```cpp
class LoraTransport {
public:
    virtual int begin() = 0;
    virtual int send(const uint8_t* data, size_t len, const uint8_t* dest_devaddr) = 0;
    virtual int recv(uint8_t* buffer, size_t* len, uint8_t* src_devaddr) = 0;
    virtual int set_channel(float freq_mhz, uint8_t sf, uint32_t bw_hz) = 0;
    virtual int8_t get_rssi() = 0;
    virtual int set_tx_power(int8_t dbm) = 0;
    virtual ~LoraTransport() = default;
};
```

### 12.3 Bridge-Side LoRa Receiver

The bridge's LoRa receiver must:
- Listen continuously on discovery channels
- Handle half-duplex TX (briefly switch to TX for RESPONSE, then back to RX)
- Track which discovery channel each DISCOVER arrived on to respond on that channel
- Pass received packets to `bridge_protocol.cpp` unchanged

---

## 13. File Structure

```
components/
  esp_tree_lora/                    ← NEW component
    __init__.py                      ← ESPHome component boilerplate
    lora_transport.h                 ← RadioLib wrapper + LoraTransport interface
    lora_transport.cpp
    lora_adapter.h                   ← DevAddr management + channel config
    lora_adapter.cpp
    lora_discovery.h                 ← Channel scanning + DISCOVER handling
    lora_discovery.cpp

demos/
  espnow-lora-bridge.yml             ← WiFi + LoRa bridge (explicit YAML config)
  espnow-lora-remote.yml             ← LoRa-only remote (auto-discover)
```

**Note:** `components/esp_tree_shared/` and `components/esp_tree_common/` are reused unchanged. Only `esp_tree_lora/` is new.

---

## 14. Resolved Design Decisions

The following were decided during design review:

### 14.1 Multi-channel Discovery — Fixed YAML List

**Decision:** Use YAML-defined fixed discovery channel list. Remotes scan sequentially through the list.

**Rationale:** Matches ESP-NOW LR's "configure and forget" model. Channel plan is static for the deployment. Remote YAML includes `discovery_channels` list. No dynamic advertisement from bridge needed.

### 14.2 Operational SF Selection — Fixed SF Per Remote

**Decision:** Bridge assigns a fixed SF to each remote at join time. No dynamic ADR.

**Rationale:** Simpler implementation. Suitable for stable environments (fixed obstructions, consistent path). ADR can be added in a future phase if conditions vary significantly seasonally.

### 14.3 Duty Cycle Management — No Active Monitoring

**Decision:** No explicit duty cycle tracking. Relays are mains-powered; trust they stay within 10% guideline.

**Rationale:** Small remote count (handful per relay) makes duty cycle issues unlikely. Active monitoring adds complexity with no near-term benefit. If scaling up, revisit this decision.

### 14.4 LoRa Module — RadioLib (Max Support)

**Decision:** Target RadioLib for maximum hardware compatibility across all supported modules.

**Rationale:** RadioLib presents a single unified API (send/recv/set_channel/get_rssi) regardless of underlying hardware (E220, SX1262, SX1276, Ra-01, RFM95, etc.). Code written against RadioLib works with any module RadioLib supports. No module-specific branching in `LoraTransport`.

**Implication:** Testing requires physical modules — code cannot be fully validated in simulation. Develop against the first available module; assume others work via the common API.

---

## 15. Implementation Priority

### Phase 1 — Core Transport
1. `LoraTransport` class wrapping RadioLib
2. Basic send/recv on fixed channel
3. DevAddr assignment and header rewriting
4. Channel scanning for discovery

### Phase 2 — Protocol Integration
5. DISCOVER/RESPONSE/JOIN flow over LoRa
6. Session key derivation (reuse `espnow_crypto.cpp`)
7. Encrypted packet send/recv (reuse existing crypto)
8. Fragmentation handling with negotiated MTU

### Phase 3 — Bridge Integration
9. Bridge LoRa receiver listening on discovery channel
10. Bridge TX RESPONSE and JOIN_ACK over LoRa
11. MQTT ↔ LoRa state forwarding (reuse existing bridge code)
12. Relay forwarding support (upstream + downstream)

### Phase 4 — Polish
13. YAML config validation
14. Fast join memory persistence
15. Testing with real hardware (E220 or sx1262)

---

## 16. Relationship to ESP-NOW LR Protocol

This roadmap does not modify the ESP-NOW LR protocol documented in `docs/espnow_v3_spec.md`. The LoRa adapter is a parallel transport layer that speaks the same protocol. Changes to the protocol (packet types, state machine, crypto) apply to both transports simultaneously.

The protocol source of truth remains `components/esp_tree_common/espnow_types.h`.

---

## 17. References

- `docs/espnow_v3_spec.md` — Protocol specification (source of truth)
- `components/esp_tree_remote/remote_protocol.cpp` — Remote state machine implementation
- `components/esp_tree_bridge/bridge_protocol.cpp` — Bridge protocol handling
- `components/esp_tree_common/espnow_types.h` — Protocol constants and packet types
- RadioLib: https://github.com/jgromes/RadioLib
- AU915 LoRaWAN regional parameters (LoRa Alliance)