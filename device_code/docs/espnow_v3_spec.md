**ESP-NOW LR Protocol**

**with Relay Support - v3 Specification**

_Implementation-Ready Protocol Reference_

April 2026

**1\. Purpose and Scope**

The intent of this project is to provide a way to extend wifi network reach with ESPNOW for esphome devices. The model is that esphome devices can be defined with an external compoenent of this project and use a bridge esp32 device flashed with esphome to bridge between wifi/home assistant and a network of esp32 nodes using espnow to communicate. All devices will be flashsable from esphome menu in home asssitant using USB and auto populate into home assistant device menu via the bridge which will expose them using mqtt.

This document is the definitive implementation reference for the ESP-NOW LR protocol with relay support. It supersedes all prior specifications and design notes. An implementer should be able to build a conforming bridge, relay, or leaf node from this document alone.

The protocol enables battery-friendly or always-on ESP32 sensor and actuator nodes to communicate with a central Home Assistant bridge over distances exceeding normal Wi-Fi range, using ESP-NOW Long Range (LR) mode and an optional tree of relay nodes to extend coverage further.

The priority 

**NOTE:** All prior versions of the protocol are deprecated. A full reflash of all nodes is required when upgrading from v1. There is no backward compatibility.
**NOTE:** Do not modify repo/file structure without discussion. Likewise no changes to demo yaml without instruction. Use compile.sh in project root to test builds.

**2\. Design Principles**

- Zero per-device configuration - nodes discover and join automatically using only a shared PSK and network ID
- Tree topology, not mesh - each node has exactly one parent; no loop prevention needed
- Blind relays - relays forward encrypted blobs without terminating sessions; they cannot read payload content
- End-to-end session security - only bridge and leaf share session keys; relays see ciphertext only
- Lightweight network authentication - a PSK tag on every packet lets relays filter noise without per-session state
- Self-healing - every failure mode eventually resolves through the retry-then-rediscover loop without manual intervention
- Deterministic and low power - no flooding, no mesh convergence, predictable timing

**3\. Node Roles**

**3.1 Bridge**

- Single root of the tree
- Connected to Wi-Fi and MQTT
- Maintains end-to-end sessions with all leaf nodes
- Publishes Home Assistant MQTT discovery and state
- Maintains routing table: leaf_mac → next_hop_mac
- Identifies leaves by leaf_mac from packet header, never by ESP-NOW sender MAC

**3.2 Remote**

A Remote is a participant in the network and can play both the role of a relay or leaf at the same time depending on esphome yaml configuration. It has identical codebase

**Leaf - Universal Role of All Remotes**

- Sensor/actuator node with no Wi-Fi connection
- Communicates exclusively via ESP-NOW LR
- Maintains a single end-to-end session with the bridge
- Selects parent (bridge or relay) based on `preferred_parents_` list order (if populated), hop count, and RSSI
- Handles its own retry and rediscover logic
- All ESPHOME sensors and actuators

**Relay - Remote may be a relay if enabled and selected by a leaf**

- Forwards packets upstream (toward bridge) and downstream (toward leaves)
- Does NOT terminate sessions - relays never derive or hold session keys
- Validates PSK tag on every packet before forwarding
- Maintains routing table: leaf_mac → next_hop_mac (downstream) and a single parent (upstream)
- Stores temporary reverse paths during join flow to enable JOIN_ACK delivery
- Has configurable capacity limits (max children)

**ESP82xx Leaf Limitations**

ESP8266 modules (including ESP-12E) running the Arduino ESP-NOW stack **cannot transmit ESP-NOW unicast frames reliably**. They can transmit broadcast frames and receive both unicast and broadcast frames. This has two protocol-level implications:

1. **Leaf-only operation:** ESP82xx nodes **may not act as relays**. A relay must be able to receive a broadcast frame, check the PARENT_CHECK routing metadata, and re-transmit it upstream via unicast to its own parent. ESP82xx cannot send unicast, so it cannot fulfill the relay forward role. An ESP82xx configured as a relay would need to re-broadcast upstream packets, creating cascading relay storms. ESP82xx nodes are leaf-only by protocol constraint.

2. **PARENT_CHECK broadcast mode:** All encrypted upstream frames from ESP82xx leaves are sent as 802.11 broadcast. A 6-byte `parent_mac` field in the extended header identifies the selected parent relay. Only the parent relay processes and forwards each packet — non-parent relays drop it immediately. This suppresses the relay storm that would otherwise occur when every in-range relay receives and forwards every ESP82xx broadcast. See Section 13.9 for the full relay filtering rules.

**4\. Topology**

The network is a tree rooted at the bridge. Each remote node has exactly one parent at any time. All non-bridge nodes use the same codebase. A node may operate as a leaf remote only (end of tree), or as a relay-capable remote. A node currently acting as a parent for others is not an edge leaf for topology description purposes.

| **Path**                      | **hops_to_bridge value** | **Description**   |
| ----------------------------- | ------------------------ | ----------------- |
| Leaf → Bridge (direct)        | 1                        | No relay involved |
| Leaf → Relay → Bridge         | 2                        | One relay hop     |
| Leaf → Relay → Relay → Bridge | 3                        | Two relay hops    |

**NOTE:** hops_to_bridge uses conventional networking semantics where a directly connected node is 1 hop away. A leaf talking directly to the bridge is 1 hop; each relay in the path adds one more hop.

**5\. Identity Model**

This is a critical change from v1.

**CRITICAL:** The ESP-NOW sender MAC identifies the previous radio hop only, not the originating leaf. All nodes MUST use leaf_mac from the packet header as canonical leaf identity.

- leaf_mac is set by the leaf and carried unchanged through all relay hops
- Bridge and relays route and track leaves by leaf_mac
- MQTT topics, session keys, and routing table entries are all keyed on leaf_mac
- The ESP-NOW sender MAC (previous hop) is used only for: (a) sending replies back one hop, and (b) populating the upstream next-hop in routing tables

**6\. Packet Format**

**6.1 Frame Layout**

Every ESP-NOW frame uses the following structure. Byte positions are absolute from the start of the ESP-NOW payload.

| **Bytes** | **Field**                | **Auth Coverage**               | **Notes**                                                                                                                       |
| --------- | ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0         | protocol_version (uint8) | EXCLUDED from all auth          | **IMPORTANT: This is THIS APPLICATION's protocol version (frame format, key derivation, session management, packet types, etc.). It is NOT the ESP-NOW protocol version per ESP IDF docs. Our application protocol version is independent from the ESP-NOW protocol version.**<br><br>Must equal ESPNOW_PROTOCOL_VER (3)<br><br>No auth always 1<sup>st</sup> packet to allow devices to identify version mismatch |
| 1         | hop_count (uint8)        | EXCLUDED from all auth          | **bit 7** = direction flag (0=upstream/leaf→bridge, 1=downstream/bridge→leaf), **bit 6** = PARENT_CHECK flag (1=extended header with parent_mac[6] follows), **bits 5-4** = reserved (send as 0), **bits 3-0** = hop count (0-15, hard protocol limit 8). Mutable - direction preserved and count incremented by each relay. PARENT_CHECK bit is preserved through relay hops. No auth as needs to be modified without session. |
| 2         | packet_type (uint8)      | PSK tag + session tag           | See packet type table                                                                                                           |
| 3-8       | leaf_mac\[6\]            | PSK tag + session tag           | True leaf identity - never the relay MAC                                                                                        |
| 9-12      | tx_counter (uint32 LE)   | PSK tag + session tag           | Sender's packet counter, little-endian                                                                                          |
| 13-16     | psk_tag\[4\]             | N/A (is the tag)                | HMAC-SHA256(PSK, bytes 2-12 + payload), first 4 bytes                                                                           |
| 17-22     | parent_mac\[6\]           | EXCLUDED from all auth          | Present only when PARENT_CHECK bit (bit 6 of hop_count) is set. Carried unencrypted between header and payload. Set to selected parent MAC by sending leaf; zeroed by parent relay before forwarding. Not covered by PSK tag or session tag. |
| 17+       | payload                  | session tag (encrypted packets) | Packet-specific, may be encrypted. When PARENT_CHECK is set, payload starts at byte 23 (after parent_mac); otherwise starts at byte 17.                                                                                               |
| last 8    | session_tag\[8\]         | N/A (is the tag)                | Session-encrypted packets only. Absent on unencrypted packets                                                                   |

**6.2 PSK Tag Computation**

The PSK tag is computed over the authenticated header region and the payload. Protocol version (byte 0) is excluded because it allows devices to check protocol mismatch in all future updates. Hop_count (byte 1) is always excluded because it changes at every relay. The optional parent_mac field (when PARENT_CHECK is set) is not covered by the PSK tag — it is transit metadata only.

psk_tag = first_4_bytes( HMAC-SHA256(PSK, bytes\[2..12\] || payload) )

**NOTE:** Receivers MUST NOT include byte 0 or 1 (protocol version or hop count) when computing or verifying the PSK tag. When PARENT_CHECK is set, the parent_mac bytes (bytes 17-22) are NOT part of the authenticated region — the payload pointer for PSK verification starts at the actual payload after parent_mac. This is the only mutable field in the frame. **NOTE: protocol_version refers to THIS APPLICATION's protocol version, NOT the ESP-NOW protocol version per ESP IDF docs.**

**6.3 Session Tag Computation**

The session tag authenticates encrypted packets end-to-end between bridge and leaf. Relays do not verify or compute session tags. The parent_mac field (when PARENT_CHECK is set) is not covered by the session tag.

session_tag = first_8_bytes( HMAC-SHA256(session_key, bytes\[2..12\] || ciphertext) )

The session tag covers the same authenticated region as the PSK tag (bytes 2-12) plus the encrypted payload ciphertext. It is appended after the payload as the last 8 bytes of the frame. When PARENT_CHECK is set, the parent_mac bytes (bytes 17-22) are not included in the ciphertext region — the ciphertext for session tag computation starts after parent_mac.

**6.4 Payload Encryption**

Encrypted packets use AES-CTR mode via mbedTLS. The session key is the AES key and the tx_counter is the CTR nonce.

keystream = AES-CTR(session_key, nonce=tx_counter_as_16_bytes_LE)

ciphertext = plaintext XOR keystream\[0:payload_len\]

**NOTE:** Decryption is identical - apply AES-CTR with the same key and counter to recover plaintext. The (session_key, tx_counter) pair must never be reused; the per-join session key and monotonic tx_counter together guarantee this.

**6.5 Frame Size Budget**

ESP-NOW maximum payload depends on radio version:

| **Radio** | **Max ESP-NOW Payload** | **Chip Examples** |
|-----------|------------------------|-------------------|
| V1 | 250 bytes | ESP32 (original) |
| V2 | 1470 bytes | ESP32-C5, ESP32-C6, ESP32-C3 |

Radio version is detected at runtime via `esp_now_get_version()` (IDF >= 5.4). V1-only builds (IDF < 5.4) always use 250 bytes.

Fixed overhead per frame:

| **Component**                        | **Size (bytes)** |
| ------------------------------------ | ---------------- |
| Frame header incl. PSK tag (bytes 0-16) | 17           |
| session_tag (encrypted packets only) | 8                |
| Total overhead (encrypted, no PARENT_CHECK) | 25           |
| Total overhead (unencrypted)         | 17               |

**PARENT_CHECK overhead (broadcast-type ESP82xx leaves only):**

When PARENT_CHECK bit is set in hop_count, a 6-byte `parent_mac` field is inserted after the header:

| **Component**                        | **Size (bytes)** |
| ------------------------------------ | ---------------- |
| parent_mac (PARENT_CHECK frames only) | 6               |
| Total overhead (encrypted, PARENT_CHECK) | 31           |
| Total overhead (unencrypted, PARENT_CHECK) | 23        |

**Per-session MTU (no per-path MTU):**

MTU is negotiated once at session creation via `session_flags` in JOIN/JOIN_ACK:

```
session_max_payload = (leaf_session_flags & V2_MTU) && (bridge_session_flags & V2_MTU)
                      ? ESPNOW_V2_MAX_PAYLOAD : ESPNOW_V1_MAX_PAYLOAD
```

This value is fixed for the session lifetime. There is no dynamic MTU upgrade/downgrade based on hop_count bits.

| **Session Type** | **Available encrypted payload** | **Max entity fragment** |
|-----------------|-------------------------------|------------------------|
| V1 (250 bytes), no PARENT_CHECK | 225 bytes | 220 bytes |
| V1 (250 bytes), PARENT_CHECK | 219 bytes | 214 bytes |
| V2 (1470 bytes), no PARENT_CHECK | 1445 bytes | 1440 bytes |
| V2 (1470 bytes), PARENT_CHECK | 1439 bytes | 1434 bytes |

**NOTE:** Maximum encrypted payload per frame depends on session MTU and whether PARENT_CHECK is set. ESP82xx leaves always use V1 (250 bytes) and PARENT_CHECK on encrypted upstream frames. ESP32 leaves use V2 (1470 bytes) without PARENT_CHECK. With the 5-byte fragment envelope, each fragment carries up to 220 bytes (V1) or 1440 bytes (V2) of value data. Longer payloads are split across multiple frames — see Section 8.3.

**7\. Session Key Derivation**

A fresh session key is derived on every join cycle. Keys are never reused across sessions.

session_key = HKDF-SHA256(PSK, bridge_nonce\[16\] || remote_nonce\[16\])

- PSK is the 32-byte pre-shared key configured identically on bridge and all leaves
- bridge_nonce is generated fresh by the bridge on each accepted JOIN (16 bytes, from esp_fill_random)
- remote_nonce is generated fresh by the leaf on each discover cycle (16 bytes, from esp_fill_random)
- remote_nonce is generated by the leaf on each discover cycle and sent in JOIN (not in DISCOVER)
- bridge_nonce is generated fresh by the bridge on each accepted JOIN and returned in JOIN_ACK
- Session key derivation: remote derives session key only after receiving JOIN_ACK.bridge_nonce; bridge derives session key after generating bridge_nonce for that JOIN
- After each accepted JOIN, bridge_nonce changes, invalidating all prior session keys
- After leaf rediscover, remote_nonce changes, deriving a new session key even with the same bridge_nonce

**8\. Packet Types and Payloads**

**8.1 Packet Type Reference**

| **Type**           | **Value** | **Encrypted** | **PSK Auth** | **Direction**             | **Description**                 |
| ------------------ | --------- | ------------- | ------------ | ------------------------- | ------------------------------- |
| PKT_DISCOVER       | 0x00      | No            | Yes          | Leaf → Bridge (broadcast) | Join request broadcast          |
| PKT_DISCOVER_ANNOUNCE | 0x01    | No            | Yes          | Bridge/Relay → Leaf (unicast)   | Parent candidate announcement   |
| PKT_JOIN           | 0x02      | No            | Yes          | Leaf → Bridge (unicast)   | Session establishment           |
| PKT_JOIN_ACK       | 0x03      | No            | Yes          | Bridge → Leaf (unicast)   | Join confirmation / completion gate |
| PKT_STATE          | 0x04      | Yes           | Yes          | Leaf → Bridge (unicast)   | Entity value update             |
| PKT_ACK             | 0x05      | Yes           | Yes          | Bidirectional (unicast)    | ack_type matches packet type being acked; result + ref_tx_counter |
| PKT_COMMAND          | 0x06      | Yes           | Yes          | Bridge → Leaf (unicast)   | Command delivery                 |
| PKT_CONFIG           | 0x07      | Yes           | Yes          | Bridge → Leaf (unicast)   | Management channel command       |
| PKT_SCHEMA_REQUEST | 0x08      | Yes           | Yes          | Bridge → Leaf (unicast)   | Request entity schema           |
| PKT_SCHEMA_PUSH    | 0x09      | Yes           | Yes          | Leaf → Bridge (unicast)   | One entity schema               |
| PKT_HEARTBEAT      | 0x10      | Yes           | Yes          | Leaf → Bridge (unicast)   | Liveness + route TTL refresh |
| PKT_DEAUTH         | 0x11      | No            | Yes          | Bridge → Leaf (unicast)   | Out-of-session rejoin signal    |
| PKT_FILE_TRANSFER  | 0x12      | Yes           | Yes          | Bridge → Leaf (unicast)   | OTA file control (ANNOUNCE/END/ABORT) |
| PKT_FILE_DATA      | 0x13      | Yes           | Yes          | Bridge → Leaf (unicast)   | OTA chunked file data          |

**OTA Notes:**
- PKT_FILE_TRANSFER and PKT_FILE_DATA are downstream-only (bridge → leaf)
- OTA uses the unified PKT_ACK with `ack_type = PKT_FILE_TRANSFER (0x12)` for all acknowledgments
- Relays forward OTA packets using standard leaf_mac routing
- See Section 21 for full OTA protocol details

**8.2 Payload Structures**

**PKT_DISCOVER - Leaf → Bridge (broadcast)**

Sent unencrypted. PSK tag included. tx_counter = 0

| **Field**          | **Size** | **Description**                                              |
| ------------------ | -------- | ------------------------------------------------------------ |
| network_id\[32\]   | 32       | Null-padded network identifier string                        |
| network_id_len     | 1        | Actual length of network_id (0-32)                           |
| capability_flags   | 1        | Remote capabilities (reserved for future use)                 |

**PKT_DISCOVER_ANNOUNCE - Bridge/Relay → Leaf (unicast via reverse path)**

Sent unencrypted. PSK tag included. The announce is jittered before transmit to reduce collisions when multiple candidates answer the same discover.

| **Field**               | **Size** | **Description**                                                         |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| network_id\[32\]        | 32       | Null-padded network identifier                                          |
| network_id_len          | 1        | Actual length                                                           |
| responder_mac\[6\]      | 6        | MAC of the candidate parent being advertised (responder_role 0=bridge, 1=relay) |
| responder_role          | 1        | 0 = bridge, 1 = relay                                                   |
| hops_to_bridge          | 1        | Candidate hop distance to bridge                                        |
| bridge_reachable        | 1        | 1 = candidate can reach the bridge                                      |
| flags                   | 1        | Reserved for future selection hints                                     |

**PKT_JOIN - Leaf → Bridge (unicast, PSK authenticated)**

tx_counter = 1 (first JOIN after DISCOVER). JOIN is PSK-authenticated, not session-encrypted; the session key is derived after the bridge replies with JOIN_ACK carrying bridge_nonce.

| **Field**          | **Size** | **Description**                                                                            |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| remote_nonce\[16\] | 16       | Fresh nonce generated by leaf - bridge uses this together with bridge_nonce to derive session key |
| schema_hash        | 32       | SHA-256 over identity (node_id, node_label, firmware_epoch, project_name, project_version) and all entity schema structs. Cache key for schema exchange. |
| hops_to_bridge     | 1        | Hop count to bridge learned from DISCOVER_ANNOUNCE - informs bridge of leaf depth for diagnostics |
| dirty_count        | 1        | Number of dirty entities on the leaf at join time. Bridge uses this to decide: 0 = go directly to COMPLETE; >0 = enter SEND_STATE phase to push dirty state before COMPLETE |
| session_flags      | 1        | Device capability flags. Bit 0 = ESPNOW_SESSION_FLAG_V2_MTU (device has V2 radio). Determines session MTU at join time. Bits 1-7 reserved. |

**PKT_JOIN_ACK - Bridge → Leaf (unicast, PSK authenticated)**

| **Field**      | **Size** | **Description**                                                                 |
| -------------- | -------- | ------------------------------------------------------------------------------- |
| accepted       | 1        | 1 = accepted, 0 = rejected                                                      |
| reason         | 1        | 0 = ok, 1 = rejected, 2 = protocol mismatch, 3 = WAIT (join in progress)        |
| stage          | 1        | 1 = schema refresh in progress, 2 = send state (bridge is fresh), 100 = join complete (bridge has schema cache) |
| bridge_nonce   | 16       | Fresh random nonce generated by bridge for this join cycle                      |
| session_flags  | 1        | Device capability flags. Bit 0 = ESPNOW_SESSION_FLAG_V2_MTU (bridge has V2 radio). Determines session MTU at join time. Bits 1-7 reserved. |

**Join Flow - WAIT Rejection:**

When a leaf attempts to JOIN while another join is already in progress for that leaf session, the bridge rejects with `accepted=0, reason=3, stage=0`. This tells the leaf to wait before retrying. The leaf should:

1. Wait 10 seconds before retrying the join
2. After 4 consecutive WAIT rejections, return to discovery instead of retrying indefinitely

**Session State Tracking:**

The bridge maintains a `join_in_progress_` flag per session to track ongoing join operations. If a leaf crashes during schema refresh or state sync and retries, the bridge will reject with WAIT until the previous operation completes (via heartbeat or timeout).

**PKT_HEARTBEAT - Remote → Bridge (unicast, session-encrypted, PSK authenticated)**

**NOTE:** Heartbeat is session-encrypted. Relays forward the ciphertext opaquely without attempting to read the payload — route TTL is a flat constant (route_ttl_seconds), not derived from heartbeat fields. The bridge decrypts heartbeat on receipt.

**Scheduling:** Heartbeat is a periodic maintenance packet. Once the configured interval elapses, the remote must send one heartbeat at the next safe opportunity after it has entered NORMAL. Other outbound packets must not reset or postpone the heartbeat deadline, but heartbeat does not pre-empt an in-flight protocol task.

| **Field**                         | **Size** | **Description**                                                   |
| --------------------------------- | -------- | ----------------------------------------------------------------- |
| uptime_seconds                    | 4        | Leaf uptime in seconds (uint32)                                   |
| expected_contact_interval_seconds | 4        | Leaf's configured heartbeat interval in seconds                   |
| parent_mac                        | 6        | Immediate upstream parent MAC. Direct bridge children set this to the bridge MAC. |
| direct_child_count                | 1        | Number of direct children (relay nodes only; leaves set to 0)     |
| total_child_count                 | 2        | Total children (direct + behind-others, relay nodes only; leaves set to 0) |
| remote_rssi_dbm                   | 1        | Leaf's measured RSSI to its parent (-128 = not yet heard, -127..0 = dBm) |

**PKT_STATE - Leaf → Bridge (unicast, encrypted)**

STATE carries entity values using the fragment envelope. May span multiple
frames for variable-length values. See Section 8.3 for fragmentation details.

**PKT_ACK - Bidirectional (unicast, encrypted)**

`PKT_ACK` is a unified acknowledgment packet. The `ack_type` field is set to
the packet type value of the message being acknowledged — for example, a PKT_STATE
is acked with `ack_type = 0x04`, a PKT_COMMAND with `ack_type = 0x06`. This
keeps the discriminator self-consistent and eliminates per-type ACK packet types.

| Field            | Size   | Description                                    |
|------------------|--------|------------------------------------------------|
| `ack_type`       | 1      | Packet type value of the message being acked  |
| `result`          | 1      | 0=success, 1=fail, 2=invalid, 3=busy          |
| `ref_tx_counter` | 4      | `tx_counter` of the message being acked        |

**ACK for PKT_STATE (ack_type=0x04):** Sent by the bridge after reassembling a
logical STATE message and confirming MQTT delivery. End-to-end delivery guarantee
from leaf to Home Assistant; the bridge does not send ACK(STATE) until MQTT publish
is confirmed by the broker.

| **Field**   | **Size** | **Description**                              |
| ----------- | -------- | -------------------------------------------- |
| (trailing)  | 0        | No trailing payload — only fixed 6-byte header |

**ACK for PKT_COMMAND (ack_type=0x06):** Sent by the leaf after receiving and
applying a command. The leaf echoes the command's `message_tx_base` as
`ref_tx_counter`, allowing the bridge to correlate with its pending command queue.

| **Field**   | **Size** | **Description**                              |
| ----------- | -------- | -------------------------------------------- |
| field_index | 1        | Echo of the commanded field index            |
| result      | 1        | 0 = applied, 1 = rejected, 2 = unknown field |

**PKT_CONFIG - Bridge → Leaf (unicast, encrypted)**

CONFIG carries management operations that are not ESPHome entity commands. The
packet is always session-encrypted and uses downstream routing (`hop_count` bit 7
set). Relays forward it opaquely using the normal `leaf_mac` route. If the
target `leaf_mac` is the relay itself, the relay handles the command locally.

The fixed CONFIG header is followed by `payload_len` command-specific bytes:

| **Field**     | **Size** | **Description**                                 |
| ------------- | -------- | ----------------------------------------------- |
| command       | 1        | `CFG_CMD_*` command code                        |
| flags         | 1        | Reserved; send as 0                             |
| payload_len   | 1        | Number of bytes following the fixed header      |
| payload       | 0..217   | Command-specific payload, no fragmentation      |

Command codes:

| **Command**                  | **Value** | **Payload**                                  | **Behavior** |
| ---------------------------- | --------- | -------------------------------------------- | ------------ |
| CFG_CMD_REBOOT               | 0x01      | empty                                        | ACK, then `App.safe_reboot()` |
| CFG_CMD_OTA_ENABLE           | 0x02      | reserved                                     | Stub: `CFG_RESULT_UNSUPPORTED` |
| CFG_CMD_WIFI_CONNECT         | 0x03      | reserved                                     | Stub: `CFG_RESULT_UNSUPPORTED` |
| CFG_CMD_HEARTBEAT_INTERVAL   | 0x04      | uint32 little-endian seconds, range 5-3600   | Runtime heartbeat interval update |
| CFG_CMD_FORCE_REDISCOVER     | 0x05      | empty                                        | ACK, then full discovery sweep |
| CFG_CMD_SET_PARENT_MAC       | 0x06      | flags(1) + parent_mac[6]                     | Update preferred parent list and rediscover |
| CFG_CMD_RELAY                | 0x07      | enable(1), 0 or 1                            | Runtime relay mode toggle |

`CFG_CMD_SET_PARENT_MAC` defines `SET_PARENT_MAC_FLAG_CLEAR = 0x01`, which clears
the existing preferred parent list before inserting the supplied MAC. Unknown
flags are invalid.

CONFIG ACKs use the unified `PKT_ACK` header with `ack_type = PKT_CONFIG (0x07)`.
The ACK payload is 7 bytes: the 6-byte `espnow_ack_t` plus a 1-byte
`command_echo` trailing field. `ref_tx_counter` is the CONFIG packet's
`tx_counter`.

| **Result**                  | **Value** | **Description**                  |
| --------------------------- | --------- | -------------------------------- |
| CFG_RESULT_OK               | 0         | Command accepted                 |
| CFG_RESULT_REJECTED         | 1         | Remote refused the command       |
| CFG_RESULT_UNSUPPORTED      | 2         | Unsupported command              |
| CFG_RESULT_INVALID_PAYLOAD  | 3         | Invalid payload length or value  |
| CFG_RESULT_BUSY             | 4         | Remote is not in NORMAL state    |

Disruptive commands MUST be ACKed before execution. The bridge retries CONFIG
delivery every 500 ms up to 3 retries and treats a matching ACK as delivery
confirmation even if the command later causes the session to disappear.

**PKT_SCHEMA_REQUEST - Bridge → Leaf (unicast, encrypted)**

| **Field**           | **Size** | **Description**                                                  |
| ------------------- | -------- | ---------------------------------------------------------------- |
| descriptor_type     | 1        | 0 = identity descriptor, 1 = entity descriptor                  |
| descriptor_index    | 1        | 0-based index of the descriptor to send next (0 for identity)    |

**PKT_SCHEMA_PUSH - Leaf → Bridge (unicast, encrypted)**

SCHEMA_PUSH carries descriptors using the fragment envelope. May span multiple
frames depending on ESPHome entity configuration. See Section 8.3 for fragmentation details.

The bridge drives schema exchange by issuing sequential SCHEMA_REQUESTs and
reassembles fragments before processing. There is no batching. SCHEMA_PUSH is
schema-only; initial state is populated later by normal STATE traffic after JOIN completes.

**Identity Descriptor (descriptor_type=0):**

The identity descriptor carries the node's identity information and is sent before entity descriptors during schema refresh.

| **Field**             | **Size** | **Description**                                      |
| --------------------- | -------- | ----------------------------------------------------- |
| node_id[32]           | 32       | Machine identity from esphome.name (null-padded)      |
| node_label[64]        | 64       | Human-readable device label (null-padded)            |
| firmware_epoch     | 4        | Firmware epoch (uint32, little-endian)                             |
| total_entities        | 1        | Total entity count on this leaf                      |

**Entity Schema Struct (`espnow_schema_push_t`):**

| **Field**             | **Size** | **Description**                                      |
| --------------------- | -------- | ----------------------------------------------------- |
| entity_index          | 1        | This entity's 0-based index                          |
| total_entities        | 1        | Total entity count on this leaf                      |
| entity_type           | 1        | espnow_field_type_t value                            |
| entity_name[32]       | 32       | Field name, null-padded                             |
| entity_unit[8]        | 8        | Unit of measurement, null-padded                    |
| entity_id[32]         | 32       | Entity identifier for MQTT topic                     |
| entity_options[145]   | 145      | Optional metadata blob (fan traits, light modes, etc.)|

**Included in schema hash:** node_id + node_label + firmware_epoch (uint32) + project_name + project_version + the full 222-byte entity schema struct for each entity. State changes after join do not invalidate the schema cache; only schema metadata changes trigger re-exchange.

Current capability keys used by the bridge and remote:

- `FAN`: `speed_count=<n>;oscillation=0|1;direction=0|1;presets=name|name|...`
- `LIGHT`: `color_modes=onoff|brightness|white|color_temp|rgb|rgbw|rgbww;min_mireds=<f>;max_mireds=<f>;effects=name|name|...`

These keys drive Home Assistant discovery. The bridge must only advertise controls that are present in `entity_options`.

**8.3 Fragmentation**

STATE, COMMAND, and SCHEMA_PUSH packets carry variable-length payloads using a
common fragment envelope defined by `espnow_entity_packet_header_t` (5 bytes).

**8.3.1 Fragment Envelope**

| Field          | Size | Description                                                               |
| -------------- | ---- | ------------------------------------------------------------------------- |
| entity_index   | 1    | Entity index for STATE/COMMAND; descriptor_index for SCHEMA_PUSH          |
| flags          | 1    | Bit 0 = MORE_FRAGMENTS; bit 1 = MORE_DIRTY (used during initial state sync); remaining bits reserved (send as 0) |
| fragment_index | 1    | Zero-based index within the logical message                              |
| fragment_count | 1    | Total fragment count for this logical message                            |
| value_len      | 1    | Number of payload bytes in this fragment                                  |

**8.3.2 Fragment Assembly Rules**

- Sender sets `MORE_FRAGMENTS` (bit 0 of flags) on all fragments **except** the last
- During initial state sync (after JOIN_ACK stage=2), sender sets `MORE_DIRTY` (bit 1 of flags) on the **last fragment** of each STATE message if additional dirty entities remain to be sent. When `MORE_DIRTY` is absent from the last fragment, the bridge knows all dirty state has been delivered and sends JOIN_ACK stage=100 to transition the leaf to NORMAL.
- `fragment_count` is constant across all fragments of a logical message
- `fragment_index` is zero-based; valid range is 0 to `fragment_count - 1`
- Receiver tolerates duplicate or out-of-order fragment arrival
- Logical message is processed only after all fragments are received and reassembled
- Partial assemblies exceeding implementation limits or timing out are dropped

**8.3.3 Maximum Fragment Size**

- Maximum encrypted payload per fragment: **220 bytes** for V1 paths, **1440 bytes** for V2 paths
- Per-session runtime: `max_entity_fragment = session_max_payload - 17 (header) - 8 (session_tag) - 5 (fragment envelope)`
- A SCHEMA_PUSH entity schema struct (222 bytes with 145-byte entity_options) always fits in a single V1 fragment
- `value_len` in the entity packet header stays `uint8_t` — for V2 fragments exceeding 255 bytes, the authoritative length is derived from `plaintext_len - sizeof(espnow_entity_packet_header_t)`, not the header field

**8.3.4 SCHEMA_PUSH Payload Structure**

SCHEMA_PUSH carries descriptor payloads (identity or entity schema) inside the fragment envelope.
The `espnow_schema_push_t` struct (222 bytes) is the payload value for entity SCHEMA_PUSH:

| Field             | Size | Description                                           |
| ----------------- | ---- | ----------------------------------------------------- |
| descriptor_type   | 1    | 0 = identity descriptor, 1 = entity descriptor        |
| descriptor_index  | 1    | Index of this descriptor (0 for identity)             |
| entity_index      | 1    | This entity's 0-based index                          |
| total_entities    | 1    | Total entity count on this leaf                      |
| entity_type       | 1    | espnow_field_type_t value                             |
| entity_name[32]   | 32   | Field name, null-padded                              |
| entity_unit[8]     | 8    | Unit of measurement, null-padded                     |
| entity_id[32]     | 32   | Entity identifier for MQTT topic                     |
| entity_options[145] | 145 | Entity-specific metadata (fan traits, light modes, etc.) |
| **Total**         | **222** |                                                    |

Identity descriptor uses `espnow_identity_push_t` (205 bytes):

| Field                | Size | Description                                      |
| -------------------- | ---- | ------------------------------------------------ |
| descriptor_type      | 1    | 0 = identity                                     |
| descriptor_index     | 1    | 0                                                |
| esphome_name[32]     | 32   | Machine identity (esphome.name), null-padded     |
| node_label[64]       | 64   | Human-readable device label, null-padded          |
| firmware_epoch       | 4    | Firmware epoch (uint32, little-endian)           |
| project_name[32]     | 32   | ESPHome project name, null-padded                |
| project_version[16]  | 16   | Project version string, null-padded              |
| total_entities       | 1    | Total entity count on this leaf                  |
| max_frame_payload    | 2    | Max frame payload (LE, diagnostic)               |
| chip_model           | 4    | Chip model identifier (uint32)                   |
| build_date[16]       | 16   | Build date string, null-padded                  |
| build_time[16]       | 16   | Build time string, null-padded                   |
| firmware_md5[16]     | 16   | MD5 of running firmware partition                |
| **Total**            | **205** |                                              |

**PKT_DEAUTH - Bridge → Leaf (unicast, unencrypted, PSK authenticated)**

| **Field**               | **Size** | **Description**                                                   |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| reason                  | 1        | 1 = Not Joined (reserved for future use if more needed)           |
| response_to_packet_type | 1        | Packet type that triggered DEAUTH (HEARTBEAT, STATE, ACK(ACK_COMMAND)) |
| response_to_tx_counter  | 4        | tx_counter of the triggering uplink packet                        |
| request_fingerprint     | 4        | Truncated HMAC of triggering uplink packet (see below)            |

Note request_fingerprint calculation = request_fingerprint = first_4_bytes(  
HMAC-SHA256(PSK, uplink_bytes\[2..12\] || uplink_payload))

This is of the packet that the bridge is responding to

**9\. Entity Value Encoding**

The `value[...]` field in STATE and COMMAND uses the following encoding by entity type.
The payload is variable-length; only the bytes required for the current entity value are
transmitted. Fragmentation behavior is defined in Section 8.3.

| **Entity Type** | **Type Code** | **Value Encoding**                         |
| --------------- | ------------- | ------------------------------------------ |
| SENSOR          | 0x01          | float (4 bytes IEEE 754 LE)                |
| SWITCH          | 0x02          | uint8_t: 0=OFF, 1=ON                       |
| BINARY          | 0x03          | uint8_t: 0=OFF, 1=ON                       |
| BUTTON          | 0x04          | uint8_t: always 1 (trigger)                |
| NUMBER          | 0x05          | float (4 bytes IEEE 754 LE)                |
| TEXT            | 0x06          | UTF-8 bytes, not null padded               |
| TEXT_SENSOR     | 0x14          | UTF-8 bytes, not null padded               |
| CLIMATE         | 0x07          | Entity-specific compact binary struct      |
| COVER           | 0x08          | Compact binary payload                     |
| LIGHT           | 0x09          | Compact binary payload                     |
| FAN             | 0x0A          | Compact binary payload                     |
| LOCK            | 0x0B          | Compact binary payload                     |
| ALARM           | 0x0C          | Compact binary payload                     |
| SELECT          | 0x0D          | uint8_t: option index                      |
| EVENT           | 0x0E          | UTF-8 event type string                    |
| HUMIDIFIER      | 0x0F          | Compact binary payload                     |
| DEHUMIDIFIER    | 0x10          | Compact binary payload                     |
| VALVE           | 0x11          | Compact binary payload                     |
| TIME            | 0x12          | Compact binary payload                     |
| DATETIME        | 0x13          | Compact binary payload                     |

**10\. Security Model**

**10.1 Two-Layer Authentication**

| **Layer**             | **Mechanism**                                      | **Who validates**               | **Protects against**                     |
| --------------------- | -------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| PSK Tag (4 bytes)     | HMAC-SHA256(PSK, header+payload)\[0:4\]            | All nodes (bridge, relay, leaf) | Noise, random traffic, non-network nodes |
| Session Tag (8 bytes) | HMAC-SHA256(session_key, header+ciphertext)\[0:8\] | Bridge and leaf only            | Spoofing, replay, session hijacking      |

**10.2 Compromise Model**

A node with knowledge of the PSK can:

- Forge PSK-tag-valid packets - causing relays to forward them
- Mount a denial-of-service or work amplification attack against the bridge

A node with knowledge of the PSK CANNOT:

- Forge session-authenticated packets (STATE, COMMAND, JOIN) - session key is derived per-join from PSK + two nonces, so PSK alone is insufficient
- Replay prior session packets - session key changes on every join cycle; captured packets fail auth after rejoin
- Control or impersonate any leaf to Home Assistant

**NOTE:** This compromise model is explicitly accepted. PSK is a network-wide secret shared across all nodes. Protecting against a compromised node requires per-node keys (not in scope for v2).

**10.3 Replay Protection**

- tx_counter is monotonically increasing per sender per session
- Bridge and leaves track last_seen_counter per peer and drop packets with counter <= last_seen
- Counter resets to 0 on each rediscover/rejoin, but session_key also changes, so prior captures are useless
- Relays do not check tx_counter - they pass through any PSK-valid packet

**10.4 Not-Joined Policy**

When the bridge receives a PSK-valid packet from a leaf but has **no active session**, it MUST respond with a PKT_DEAUTH packet. This replaces the prior NACK based behaviour.

**Bridge MUST:**

- Send DEAUTH **only as a direct response** to any of: HEARTBEAT, STATE, ACK
- Include: triggering packet type, triggering tx_counter, request_fingerprint

**Bridge MUST NOT:**

- Send DEAUTH proactively
- Send DEAUTH without a triggering uplink packet
- Send DEAUTH for in-session failures (use ACK result instead)

**Security Note**

DEAUTH is PSK-authenticated but not session-authenticated. Replay protection is achieved by binding DEAUTH to a specific uplink request via tx_counter and request_fingerprint.

**10.5 DEAUTH Validation (Remote)**

When a leaf receives a PKT_DEAUTH, it MUST validate:

**Step 1 - PSK Tag:** Verify PSK tag, If invalid → DROP

**Step 2 - Identity:** Verify leaf_mac matches self, If not → DROP

**Step 3 - Match Outstanding Request**

Leaf MUST track the most recent outbound packet that was one of HEARTBEAT, STATE, ACK(ACK_COMMAND):

outstanding_request = {  
packet_type,  
tx_counter,  
request_fingerprint  
}

DEAUTH MUST match:

- response_to_packet_type == outstanding.packet_type
- response_to_tx_counter == outstanding.tx_counter
- request_fingerprint == outstanding.request_fingerprint

If any mismatch → DROP

**Step 4 - Accept DEAUTH**

If all checks pass:

Leaf MUST:

- Clear session state
- Stop all retries
- Transition to DISCOVERING state

**11\. Routing**

**11.1 Routing Table Structure**

All nodes maintain a routing table although remotes may only have one route to their parent if they haven't been selected as a relay and are a true leaf. Entry structure:

| **Field**         | **Description**                                                        |
| ----------------- | ---------------------------------------------------------------------- |
| leaf_mac[6]       | Canonical leaf identity (from packet header)                            |
| next_hop_mac[6]   | MAC of the next node toward the leaf (downstream) or parent (upstream) |
| expiry_timestamp  | Route expires at this time; refreshed on valid upstream packets        |

**11.2 Route Lifecycle**

| **Event**                    | **Action**                                                                    | **TTL**                                        |
| ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| JOIN received by relay       | Create/refresh route: leaf_mac → sender MAC                                    | route_ttl_seconds (default 172800)               |
| JOIN_ACK forwarded by relay  | No TTL change — route already extended                                        | route_ttl_seconds (unchanged)                   |
| Post-join HEARTBEAT received | Refresh route TTL                                                            | route_ttl_seconds (unchanged)                  |
| Any valid upstream packet    | Refresh route TTL                                                             | route_ttl_seconds (unchanged)                  |
| Route expires                | Entry removed. Missing route = drop downstream packets. Leaf must rediscover. | -                                              |

**NOTE:** DISCOVER is local-only and never forwarded. Relays do not create routes from DISCOVER. Route creation happens only on JOIN. DISCOVER_ANNOUNCE is sent directly to the discovering leaf without involving relay forwarding.

**11.3 Route Expiry**

All routes use a flat TTL: `expiry = route_ttl_seconds` from the time of creation or refresh (default 172800s / 48h). There is no per-route or per-heartbeat computation.



**11.4 Upstream Routing**

- All nodes forward upstream packets to their single configured parent
- Relay increments hop_count before forwarding
- Relay refreshes the route for the leaf_mac on any valid upstream packet

**11.5 Downstream Routing**

- Look up leaf_mac in routing table
- If found: forward to next_hop_mac
- If not found: DROP. Do not broadcast. Do not NACK.
- Missing downstream route means the leaf has not joined or the route has expired - leaf will rediscover
- Relay increments hop_count before forwarding

**12\. Packet Processing Pipeline**

Every received packet MUST be processed in this exact order. Deviation is a protocol violation.

| **Step** | **Check**                                                            | **On Failure** |
| -------- | -------------------------------------------------------------------- | -------------- |
| 1        | Frame length >= minimum (13 + 4 psk_tag = 17 bytes)                  | DROP silently  |
| 2        | protocol_version == ESPNOW_PROTOCOL_VER (3) **NOTE: This is our application protocol version, NOT the ESP-NOW protocol version per ESP IDF docs.**                       | DROP silently  |
| 3        | packet_type is a known value                                         | DROP silently  |
| 4        | PSK tag valid: recompute HMAC over bytes\[2..12\] + payload, compare | DROP silently  |
| 5        | hop_count >= max_hops (default 5)                                     | DROP silently  |
| 6        | Dispatch to packet-type handler                                      | -              |

**NOTE:** Steps 1-5 must complete before any packet-type-specific logic runs. This ensures relays spend minimal CPU on invalid traffic.

For encrypted packets, the packet-type handler additionally:

- Retrieves session key for leaf_mac
- Verifies session tag (8-byte HMAC over bytes\[1..12\] + ciphertext)
- Decrypts payload using AES-CTR(session_key, tx_counter)
- Verifies tx_counter > last_seen_counter for this leaf (replay check)
- Updates last_seen_counter

**13\. Remote Behaviour as Relay**

**13.1 Relay DISCOVER Handling**

A relay MUST NOT accept children or forward packets as a relay until it has entered NORMAL state (i.e., `normal_ == true`). This ensures the relay has completed its own join cycle and has a stable route to the bridge before accepting downstream nodes.

- Until `normal_ == true`: DISCOVER requests from children are silently dropped
- This prevents relaying packets before the relay has established its own session and upstream route

When a relay receives a valid DISCOVER from a child node:

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Check sender MAC within a short time window - if the same sender MAC sent a DISCOVER recently (within 500ms), suppress duplicate
- Send DISCOVER_ANNOUNCE directly back to the sender (relays do NOT forward DISCOVER upstream)
- Increment hop_count in DISCOVER_ANNOUNCE to reflect relay's distance to bridge

**NOTE:** DISCOVER is never forwarded by relays. A full relay does not send any DISCOVER_ANNOUNCE. The leaf will retry and may reach the bridge via a different relay or directly.

**13.2b Bridge DISCOVER_ANNOUNCE Handling**

- When multiple bridges share the same channel, they may receive the same DISCOVER broadcast and respond simultaneously, causing upstream collisions
- Apply a small random jitter (0–20ms) before transmitting each DISCOVER_ANNOUNCE to deconflict with other bridges on the same channel

**13.3 DISCOVER_ANNOUNCE Handling (Remote/Leaf)**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Record the candidate parent from the announce (responder_mac, hops_to_bridge, RSSI)
- Continue collecting announces across the full discovery sweep before selecting parent
- Do NOT forward DISCOVER_ANNOUNCE - it is a direct response to the sender only

**13.4 JOIN Handling**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Create route: leaf_mac → sender MAC with route_ttl_seconds TTL
- Store reverse path: leaf_mac → sender MAC
- Increment hop_count and forward upstream
- On first JOIN from a leaf, generate fresh bridge_nonce and derive session key

**13.5 JOIN_ACK Handling**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Look up leaf_mac in routing table
- If found: forward downstream to next_hop_mac
- If not found: DROP - no route to leaf
- `JOIN_ACK(stage=1)` means schema refresh is in progress
- `JOIN_ACK(stage=2)` means remote should send state (bridge is fresh, no cached state)
- `JOIN_ACK(stage=100)` means join complete; remote transitions to NORMAL and pushes any dirty entities via its normal iteration loop; the next HEARTBEAT is the completion acknowledgement
- On successful forward of `JOIN_ACK(stage=100)`, route now awaits HEARTBEAT to refresh TTL

**13.6 HEARTBEAT Handling**

**Relay (upstream forwarding):**
- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Relays do NOT verify session_tag or decrypt — HEARTBEAT is forwarded as opaque ciphertext
- Refresh route: expiry = route_ttl_seconds from now (relay refreshes on any valid upstream packet)
- Increment hop_count and forward upstream

**Bridge (end-to-end):**
- Validate packet per packet handling rules (protocol, psk-tag, session-tag etc.)
- Verify session tag and decrypt payload
- Refresh route: expiry = route_ttl_seconds from now
- Update expiry_timestamp for that leaf
- HEARTBEAT is the completion acknowledgement after JOIN_ACK(stage=100) and refreshes the route TTL to 48h on all relays in the path.

**13.7 All Other Upstream Packets (STATE, ACK(ACK_COMMAND), SCHEMA_PUSH)**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Refresh route TTL for leaf_mac to route_ttl_seconds
- Increment hop_count and forward upstream
- Relay does NOT decrypt or inspect payload

**13.8 All Downstream Packets (ACK(ACK_STATE), COMMAND, SCHEMA_REQUEST, JOIN_ACK)**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Look up leaf_mac in routing table
- If found: forward to next_hop_mac
- If not found: DROP silently

**13.9 PARENT_CHECK Relay Filtering (Broadcast Storm Suppression)**

**Why this exists:** ESP82xx hardware cannot transmit ESP-NOW unicast frames reliably — broadcast TX is the only reliable path. Without PARENT_CHECK, every relay in RF range would receive and forward every ESP82xx broadcast packet, creating a relay storm (N broadcast-type leaves × M in-range relays = N×M redundant packets per send interval). PARENT_CHECK ensures only the selected parent relay processes each broadcast packet.

This subsection applies to all upstream frames from **broadcast-type nodes** (ESP82xx leaves) that have the PARENT_CHECK bit set in hop_count. ESP32 leaves do not use PARENT_CHECK.

**PARENT_CHECK Extended Header:** When bit 6 of hop_count is set, a 6-byte `parent_mac` field follows the frame header (bytes 17-22). The sending leaf sets `parent_mac` to its selected parent's MAC. All encrypted upstream packets from ESP82xx leaves include this header; only DISCOVER is sent without it (pre-session, no parent yet).

**Relay Receive Rules:** When a relay receives an upstream frame with PARENT_CHECK set:

1. Extract `parent_mac` from bytes 17-22
2. If `parent_mac != my_mac && parent_mac != all-zeros`: **DROP** — this leaf selected a different parent; do not forward, do not log, do not update route table
3. If `parent_mac == my_mac`: I am the parent — process locally, then zero `parent_mac` and forward upstream to my parent
4. If `parent_mac == all-zeros`: Parent already handled this packet — forward upstream unchanged

**Parent Relay Forward:** When the selected parent relay forwards the packet upstream:
- Zero the `parent_mac` field in the frame buffer
- Preserve the PARENT_CHECK bit in hop_count
- Forward upstream to the relay's own parent via unicast

**Subsequent Relay Forward:** When a relay receives a frame with `parent_mac == all-zeros`:
- Forward upstream unchanged (PARENT_CHECK bit is preserved, parent_mac stays zeroed)
- This is identical to normal upstream relay behavior

**Bridge Receive:** The bridge receives frames with `parent_mac == all-zeros` (parent relay already zeroed it). The bridge can also receive direct broadcasts from ESP82xx leaves in RF range where `parent_mac == bridge_mac` — this is valid and processed locally. Frames with `parent_mac != bridge_mac && parent_mac != all-zeros` are dropped.

**PSK Tag with PARENT_CHECK:** The PSK tag covers bytes 2-12 (pkt_type + leaf_mac + tx_counter) and the payload. The `parent_mac` bytes (17-22) are NOT in the authenticated region. The parent relay zeroing parent_mac does not invalidate the PSK tag. Similarly, the session tag covers bytes 2-12 and ciphertext only — parent_mac is not included.

**Why This Works:** Non-parent relays drop the frame immediately on receipt — no forwarding, no route table update, no logging. This eliminates the relay storm where all in-range relays forwarded every ESP82xx broadcast. Only the selected parent relay processes and forwards each packet.

**14\. Bridge Behaviour**

**14.1 Session Management**

- Bridge generates a fresh bridge_nonce per accepted JOIN (stored in RAM for that join only, not NVS)
- Bridge is stateless across reboots - no session state is persisted
- Each leaf session is keyed by leaf_mac and holds: session_key, tx_counter, schema_hash, entity list, last_seen
- Bridge maintains routing table: leaf_mac → sender_mac (the ESP-NOW MAC of the last upstream hop)

**14.2 Upstream Processing**

- Identify leaf by leaf_mac from packet header
- Update route: leaf_mac → sender_mac (the immediate ESP-NOW sender, used for downstream replies)
- For encrypted packets: verify session tag, decrypt, process
- For STATE: validate tx_counter, update entity state, publish to MQTT, send ACK(ACK_STATE)
- For HEARTBEAT: update last_seen, update diagnostics, and if a `JOIN_ACK(stage=100)` is pending treat the heartbeat as the completion acknowledgement

**14.3 Downstream Processing**

- Look up leaf_mac in routing table to get next_hop_mac
- Send frame with hop_count = 0 to next_hop_mac
- If route not found: DROP - leaf must rediscover

**14.4 Join Flow**

Join proceeds conditionally based on whether the bridge has a cached schema for the remote:

**Schema Cache HIT (`JOIN_ACK(stage=100)` or `JOIN_ACK(stage=2)`)**
- On JOIN: check schema_hash against cached hash for this remote `node_id` AND check `dirty_count` from the JOIN packet
- If cache matches AND `dirty_count == 0`: send `JOIN_ACK(stage=100)` directly — no state push needed, join complete
- If cache matches AND `dirty_count > 0`: send `JOIN_ACK(stage=2)` — remote must push its dirty entities before join completes
  - Remote sends STATE for each dirty entity, setting `MORE_DIRTY=1` on the last fragment while more dirty entities remain, and `MORE_DIRTY=0` on the final dirty entity's last fragment
  - Bridge watches for the last STATE with `MORE_DIRTY=0` on its last fragment, then sends `JOIN_ACK(stage=100)`
- Remote transitions to NORMAL only after receiving `JOIN_ACK(stage=100)`
- Bridge marks the session fully joined on receipt of the first HEARTBEAT after `stage=100`

**Schema Cache MISS — Stage 1: Schema Refresh (`JOIN_ACK(stage=1)`)**
- If schema_hash does not match cache: send `JOIN_ACK(stage=1)`, then begin SCHEMA_REQUEST sequence
- Before entity descriptors, bridge requests the identity schema first using `SCHEMA_REQUEST(descriptor_type=IDENTITY, descriptor_index=0)`
- After identity, bridge continues with entity schema requests in order
- Bridge reassembles SCHEMA_PUSH fragments before processing
- Bridge publishes MQTT discovery for each entity immediately after the corresponding schema is assembled
- Bridge clears stale entities if schema changed

**Schema Cache MISS — Stage 2: State Sync (`JOIN_ACK(stage=2)`)**
- After all schema entities are received, bridge sends `JOIN_ACK(stage=2)`
- `JOIN_ACK(stage=2)` means the bridge is fresh and has no cached state — remote MUST mark all entities dirty and send all current state
- Remote sends entity states 1-by-1, each acknowledged with `ACK(ACK_STATE)`
- On each STATE's last fragment, remote sets `MORE_DIRTY=1` if additional dirty entities remain; `MORE_DIRTY=0` on the final dirty entity's last fragment signals completion
- Bridge tracks `MORE_DIRTY` state from received STATE packets and sends `JOIN_ACK(stage=100)` only after receiving a STATE with `MORE_DIRTY=0` on its last fragment

**Join Complete (`JOIN_ACK(stage=100)`)**
- `JOIN_ACK(stage=100)` signals join complete
- Remote transitions to NORMAL and sends HEARTBEAT
- Bridge marks the session fully joined on receipt of the first HEARTBEAT after `stage=100`

**Note:** Zero-entity leaves with a cache hit receive `JOIN_ACK(stage=100)` immediately. Zero-entity leaves with a cache miss skip state sync after schema exchange and also receive `JOIN_ACK(stage=100)`.

**Dirty Entity Semantics:** On fresh boot, all entities start dirty (constructor default). The remote only marks an entity clean on `ACK(ACK_STATE)` confirming end-to-end MQTT delivery. On rejoin after session loss, `entity_records_` are preserved — only genuinely unacknowledged entities remain dirty. If the bridge is fresh (no cache, stage=2), `mark_all_entities_dirty_()` is called to force a full state push.

**Schema hash covers:** node_id (32 bytes) + node_label (64 bytes) + firmware_epoch (4 bytes) + project_name (32 bytes) + project_version (16 bytes) + the full 222-byte entity schema struct for each entity. State changes after join do not invalidate the schema cache; only schema metadata changes trigger re-exchange.

**HA identity rule:** Home Assistant device and entity identity should be keyed from `node_id`, not the ESP-NOW radio MAC. This matches ESPHome replacement behavior more closely: keeping the same YAML `esphome.name` preserves the logical device across hardware swaps, while `node_label` remains display-only.

**14.5 Not-Joined Silence**

When the bridge receives a PSK-valid packet from a leaf but has **no active session**, it MUST respond with a PKT_DEAUTH packet. This replaces the prior NACK based behaviour. See DEAUTH references.

**15\. Leaf Behaviour**

**15.1 Parent Selection**

Leaf collects DISCOVER_ANNOUNCE responses from all potential parents (bridge or relays) during the discovery window and selects from the full pool by:

- **preferred_parents_** (if populated): ordered list of preferred parent MACs. Index 0 = highest preference. A preferred parent with RSSI ≥ -85 dBm auto-wins and adoption completes immediately after collection window. If no preferred parent meets the RSSI threshold, normal selection runs among all candidates.
- **Normal selection** (when no preferred parent auto-wins): lower hops_to_bridge (prefer fewer hops to bridge) → higher RSSI (prefer stronger signal at equal hop count)

Selection is performed by `select_parent_candidate_()` after each DISCOVER_ANNOUNCE during the collection window. The first preferred parent with adequate signal (RSSI ≥ -85 dBm) triggers `sweep_complete_ = true`, ending the collection window early.

When `preferred_parents_` is empty, all candidates are treated equally and normal selection (hops → RSSI) applies.

**15.2 Lifecycle - Always-On**

| **State**     | **Action**                                                                                   | **Next State**                     |
| ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| IDLE          | Initialize ESP-NOW LR, generate remote_nonce                                                   | DISCOVERING                        |
| DISCOVERING   | Broadcast DISCOVER on all channels, collect DISCOVER_ANNOUNCEs, select parent                   | JOINING                            |
| JOINING       | Derive session_key, send JOIN to selected parent                                               | JOINED                             |
| JOINED        | Receive `JOIN_ACK(stage=1)`. Stay joined but not normal; wait for schema refresh.            | JOINED                             |
| JOINED        | Receive `JOIN_ACK(stage=2)` (cache hit + dirty state OR bridge fresh). Mark dirty entities. Send STATE for each dirty entity with MORE_DIRTY flags. | STATE_SYNC                        |
| STATE_SYNC    | Receive `JOIN_ACK(stage=2)`. Bridge is fresh — mark all entities dirty. Send STATE for each dirty entity, 1-by-1 with ACK. Sets MORE_DIRTY=1 on last fragment while more remain, MORE_DIRTY=0 on final dirty entity's last fragment. | NORMAL (after stage=100)         |
| NORMAL        | Receive `JOIN_ACK(stage=100)`. Send HEARTBEAT immediately. Push dirty entities (all on fresh boot, only unacked on rejoin with cache hit) via normal iteration loop. | NORMAL (or DISCOVERING on failure) |

**NOTE:** The transition to NORMAL MUST be driven by `JOIN_ACK(stage=100)` from the bridge. The remote must not emit HEARTBEAT or STATE before that status arrives. The first HEARTBEAT after `JOIN_ACK(stage=100)` is the completion acknowledgement and refreshes the route TTL to 48h on all relays in the path.

**NOTE:** When a schema cache hit with `dirty_count > 0` occurs, `JOIN_ACK(stage=2)` is sent. The remote's entity dirty flags determine which states are pushed during STATE_SYNC — on fresh boot all entities start dirty; on rejoin only unacknowledged entities remain dirty. `MORE_DIRTY=0` on the last dirty entity's last fragment signals the bridge to send `JOIN_ACK(stage=100)`. When `dirty_count == 0`, `JOIN_ACK(stage=100)` is sent directly.

**15.3 Retry and Timeout Constants**

| **Packet** | **Interval** | **Jitter** | **Retries** | **On Exhaustion** |
| ----------- | ------------ | ---------- | ------------------- | ----------------------------------------------------- |
| DISCOVER | 100ms | ±50ms | 5 per channel sweep | Restart sweep |
| JOIN | 300ms | ±50ms | 3 | Restart from DISCOVER |
| STATE | 300ms | ±50ms | 3 | Increment fail count; if >= 3 consecutive: rediscover |
| SCHEMA_PUSH | - | - | N/A | Bridge drives - no leaf retry |
| JOIN_ACK(stage=100) | 200ms | ±50ms | 3 retries | Bridge retries; if no HEARTBEAT after 3 retries: session preserved, join_in_progress cleared |
| ACK(ACK_COMMAND)   | 300ms     | ±50ms     | 3           | Drop - bridge resends if needed |
| HEARTBEAT | - | - | 1 (no retry) | Not retried |

- packet_fail_count resets to 0 on any successful STATE exchange
- A missing ACK(ACK_STATE) after all retries increments packet_fail_count

**15.4 Heartbeat Sending Rule**

Heartbeat is scheduled on a fixed deadline after NORMAL is reached. Once the configured interval elapses, the remote sends one HEARTBEAT at the next safe opportunity even if other packets were sent during the interval.

**16\. Protocol Flow Diagrams**

**16.1 Discovery and Join Flow (with one relay)**

Leaf Relay Bridge

────────────────────────────────────────────────────────────────────

generate remote_nonce

DISCOVER (broadcast, local only) ──►

validate

// Relay: send DISCOVER_ANNOUNCE directly back (no forwarding)

◄── DISCOVER_ANNOUNCE (direct reply if relay eligible)

select parent (best RSSI / fewest hops)

JOIN (unicast, PSK authenticated) ──►

// Relay: create route leaf→sender (route_ttl_seconds)

hop_count++ → forward ──────────►

// Bridge: generate bridge_nonce

// Bridge: derive session_key from nonces

◄── JOIN_ACK(bridge_nonce, stage=1 or 2)

// Remote: derive session_key only now, after receiving bridge_nonce

look up leaf_mac

◄── JOIN_ACK ──────────── forward downstream

// --- if stage=1: schema exchange ---
SCHEMA_REQUEST(descriptor_type=IDENTITY, descriptor_index=0) ───────►
◄── SCHEMA_PUSH(descriptor_type=IDENTITY, ...)
SCHEMA_REQUEST(descriptor_type=ENTITY, descriptor_index=0) ──────────►
◄── SCHEMA_PUSH(descriptor_type=ENTITY, index=0, total=N)
SCHEMA_REQUEST(descriptor_type=ENTITY, descriptor_index=1) ──────────►
◄── SCHEMA_PUSH(descriptor_type=ENTITY, index=1, total=N)
... repeat for all entities ...
◄── SCHEMA_PUSH(descriptor_type=ENTITY, index=N-1, total=N)

// --- after schema complete (no cache): bridge is fresh ---
◄── JOIN_ACK(stage=2)  (bridge needs all state)

STATE(entity=0) ──►
◄── ACK(ACK_STATE)
STATE(entity=1) ──►
◄── ACK(ACK_STATE)
... all entities, 1-by-1 with ACK ...

◄── JOIN_ACK(stage=100)  (all state received)

HEARTBEAT (mandatory, immediate on 100) ──►

═════════════ NORMAL OPERATION ══════

... remote pushes remaining dirty entities in normal loop ...

// --- OR: schema cache HIT: join complete immediately ---
◄── JOIN_ACK(stage=100)  (schema cached, join complete)

HEARTBEAT (mandatory, immediate on 100) ──►

═════════════ NORMAL OPERATION ══════

... remote pushes dirty entities in normal loop (all on fresh boot, only unacked on rejoin) ...

HEARTBEAT (mandatory, immediate on 100) ──►

refresh route TTL = route_ttl_seconds

hop_count++ → forward ──────────►

update diagnostics

═════════════ NORMAL OPERATION ══════

STATE (encrypted) ──────►

refresh route TTL

forward ────────────────────────►

decrypt, validate

publish to MQTT

◄── ACK(ACK_STATE)

forward ◄────────────────────────

◄── ACK(ACK_STATE) ───────────

**16.2 Schema and State Exchange Flow**

Bridge Leaf

────────────────────────────────────────────────────────────────────

JOIN_ACK(stage=1) sent (schema refresh required)

SCHEMA_REQUEST(descriptor_type=IDENTITY, descriptor_index=0) ───────►

◄── SCHEMA_PUSH(descriptor_type=IDENTITY, ...)

SCHEMA_REQUEST(descriptor_type=ENTITY, descriptor_index=0) ────────────►

◄── SCHEMA_PUSH(descriptor_type=ENTITY, index=0, total=N, entity data)

publish MQTT discovery for entity 0

SCHEMA_REQUEST(descriptor_type=ENTITY, descriptor_index=1) ────────────►

◄── SCHEMA_PUSH(descriptor_type=ENTITY, index=1, total=N, entity data)

publish MQTT discovery for entity 1

... repeat for each entity ...

SCHEMA_REQUEST(descriptor_type=ENTITY, descriptor_index=N-1) ──────────►

◄── SCHEMA_PUSH(descriptor_type=ENTITY, index=N-1, total=N, entity data)

entity_index == total_entities: schema complete

cache schema_hash for leaf_mac

◄── JOIN_ACK(stage=2)   (bridge is fresh, needs all state)

// --- state sync: remote-driven, 1-by-1 ---
// (bridge has no schema cache and no state for this remote)

STATE(entity=0) ──────────────────────────────►
◄── ACK(ACK_STATE)
STATE(entity=1) ──────────────────────────────►
◄── ACK(ACK_STATE)
... one state per entity, waiting for ACK each ...

◄── JOIN_ACK(stage=100)  (all state received, join complete)

── Zero entities special case ──

◄── JOIN_ACK(stage=100)  (no schema, no state)

── Schema cache HIT ──

// Bridge has cached schema and MQTT discovery already published
// Remote only needs to push dirty entities via normal loop

◄── JOIN_ACK(stage=100)  (join complete immediately)

HEARTBEAT ──►

═════════════ NORMAL OPERATION ══════

// Remote pushes dirty entities in normal iteration loop
// All entities dirty on fresh boot, only unacked on rejoin

**16.3 Failure and Recovery**

| **Failure**                      | **Detection**                                                                                                  | **Recovery**                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bridge reboot                    | Leaf sends STATE / HEARTBEAT, receives DEAUTH <br>Immediate rediscover → Fast JOIN if that fails then DISCOVER | packet_fail_count >= 3 → rediscover. Bridge gets fresh JOIN.                           |
| Relay failure                    | Leaf sends STATE, no ACK after retries (route broken)                                                          | packet_fail_count >= 3 → rediscover. Leaf may select different relay or go direct.     |
| JOIN_ACK(stage=2 or 100) lost  | No response after retries. Bridge: retries JOIN_ACK up to 3 times. Leaf: treats timeout as failure.         | Bridge retries JOIN_ACK; leaf restarts from DISCOVER on exhaustion.                    |
| Route expired at relay           | Downstream packet cannot be delivered                                                                          | DROP. Bridge retries → no ACK → bridge queues. Leaf rediscovers on next STATE failure. |
| DISCOVER suppressed (relay full) | No DISCOVER_ANNOUNCE received                                                                                  | Leaf retries. Eventually tries next channel / different relay.                         |

**17\. MQTT Integration**

**17.1 Topic Structure**

All MQTT topics use `esp-tree/` as the root prefix. The bridge publishes HA MQTT discovery payloads (retain=yes) to `homeassistant/{domain}/{node_key}_{field}/config` using ESPHome's `~` shorthand for state/command topics.

| **Topic**                                     | **Retain** | **Description**           |
| --------------------------------------------- | ---------- | ------------------------- |
| homeassistant/{domain}/{node_key}_{field}/config | Yes      | HA MQTT discovery payload |
| esp-tree/{node_key}/{field}/state   | No         | Current entity state      |
| esp-tree/{node_key}/{field}/set     | No         | Command from HA to bridge |
| esp-tree/{node_key}/availability    | No         | online / offline          |
| esp-tree/bridge/{bridge_mac}/{suffix}/state | No | Bridge diagnostics        |
| esp-tree/{node_key}/diagnostic/{suffix}/state | No | Remote diagnostics        |

**17.2 Entity Domain Mapping**

| **ESP-NOW Type** | **HA Domain**       | **Commandable** |
| ---------------- | ------------------- | --------------- |
| SENSOR           | sensor              | No              |
| SWITCH           | switch              | Yes             |
| BINARY           | binary_sensor       | No              |
| BUTTON           | button              | No              |
| NUMBER           | number              | Yes             |
| TEXT             | text                | Yes             |
| TEXT_SENSOR      | sensor              | No              |
| COVER            | cover               | Yes             |
| LIGHT            | light               | Yes             |
| FAN              | fan                 | Yes             |
| LOCK             | lock                | Yes             |
| ALARM            | alarm_control_panel | Yes             |
| SELECT           | select              | Yes             |
| VALVE            | valve               | Yes             |
| EVENT            | event               | No              |

Planned but not yet implemented end to end:

- `CLIMATE`
- `HUMIDIFIER`
- `DEHUMIDIFIER`
- `TIME`
- `DATETIME`

**17.3 Bridge Diagnostic Entities**

| **Entity**                 | **Type** | **Purpose**                                 |
| -------------------------- | -------- | ------------------------------------------- |
| espnow_bridge_uptime       | sensor   | Bridge uptime in seconds                    |
| espnow_bridge_nodes_joined | sensor   | Count of currently joined leaves            |
| {mac}\_last_seen           | sensor   | Timestamp of last upstream packet from leaf |
| {mac}\_rssi                | sensor   | RSSI of last packet from leaf               |
| {mac}\_uptime              | sensor   | Leaf uptime in seconds (from HEARTBEAT)     |
| {mac}\_hops                | sensor   | Current hops_to_bridge for this leaf        |

**17.4 MQTT QoS and Delivery Guarantees**

All MQTT publications from the bridge to Home Assistant use QoS 1 (at-least-once delivery) to ensure messages are confirmed by the MQTT broker before the bridge considers delivery complete.

| **Message Type**       | **QoS** | **Rationale**                                                       |
| ---------------------- | ------- | -------------------------------------------------------------------- |
| MQTT Discovery         | 1       | Must arrive for HA to configure entity; retried if broker doesn't ack |
| Entity State          | 1       | Critical for HA state consistency; retried if broker doesn't ack      |
| Availability (online/offline) | 1   | HA uses this to mark entity availability                             |
| Bridge/Remote Diagnostics | 1     | Diagnostic data; QoS 1 ensures no gaps in logging                    |

**17.4.1 Sequential Discovery with MQTT Confirmation**

During schema exchange (Phase 1 of join), the bridge gates each `SCHEMA_REQUEST` until the MQTT discovery for the previous entity is confirmed. This prevents MQTT queue overflow during multi-entity joins and ensures HA has fully processed each discovery before the next one arrives.

**Flow Diagram:**
```
Remote              Bridge                      MQTT Broker            HA
   │                  │                             │                  │
   │──SCHEMA_PUSH(0)─►│                             │                  │
   │                  │ publish discovery(0) qos=1►│                  │
   │                  │◄─────────PUBACK─────────────│                  │
   │                  │ (MQTT confirmed)            │                  │
   │◄─SCHEMA_REQUEST(1)│                             │                  │
   │                  │                             │                  │
   │──SCHEMA_PUSH(1)─►│                             │                  │
   │                  │ publish discovery(1) qos=1►│                  │
   │                  │◄─────────PUBACK─────────────│                  │
   │◄─SCHEMA_REQUEST(2)│                             │                  │
   │                  │                             │                  │
   │──── ... ─────────│                             │                  │
   │                  │                             │                  │
   │──SCHEMA_PUSH(N-1)►│                           │                  │
   │                  │ publish discovery(N-1) qos=1►│                  │
   │                  │◄─────────PUBACK─────────────│                  │
   │◄─JOIN_ACK(stage=2)│                          │                  │
   │   (bridge is fresh, needs state)               │                  │
```

**Timeout Handling:** If MQTT discovery does not receive PUBACK within 2 seconds, the bridge re-requests the same entity schema via `SCHEMA_REQUEST` for that entity index, allowing the remote to retransmit the schema data.

**17.4.2 Deferred ACK(ACK_STATE) with MQTT Confirmation**

During state sync (after JOIN_ACK stage=2 for fresh bridge) and during normal operation, `ACK(ACK_STATE)` is sent to the remote only after the MQTT publish for that entity succeeds. This provides end-to-end delivery confirmation from the remote to HA.

**Flow Diagram:**
```
Remote              Bridge                      MQTT Broker            HA
   │                  │                             │                  │
   │──STATE(entity=0)─►│                           │                  │
   │                  │ publish state(0) qos=1───►│                  │
   │                  │◄─────────PUBACK───────────│                  │
   │                  │ (MQTT confirmed)           │                  │
    │◄──ACK(ACK_STATE)──│                             │                  │
    │                  │                             │                  │
    │──STATE(entity=1)─►│                             │                  │
    │                  │                             │                  │
    │◄──ACK(ACK_STATE)──│                             │                  │
```

**Timeout Handling:** If MQTT publish times out (2 second timeout), `ACK(ACK_STATE)` is not sent. The remote's existing retry mechanism (300ms interval, 3 retries) will resend the STATE packet, allowing the bridge to retry the MQTT publish.

**State Dirty Flag:** The `state_dirty` flag is only cleared after successful MQTT QoS 1 publish. If MQTT publish fails, the flag remains set and the state will be retried in the next `sync_mqtt_entities_()` loop iteration.

**MQTT Reconnection:** When MQTT reconnects, the bridge marks all entities' `discovery_dirty` and `state_dirty` flags as true. This causes re-publication of both discovery config and cached state values to the broker, ensuring Home Assistant has current state even if the broker restarted.

**17.4.3 MQTT Publish Synchronous Blocking**

MQTT QoS 1 publish calls are **synchronous and blocking** - they wait for PUBACK before returning. This ensures the bridge has broker confirmation before proceeding. Under heavy MQTT traffic or WiFi congestion, this can introduce latency but guarantees delivery tracking.

**18\. Implementation Constants**

| **Constant**                     | **Value** | **Notes**                                                 |
| -------------------------------- | --------- | --------------------------------------------------------- |
| ESPNOW_PROTOCOL_VER           | 3         | Increment on breaking changes. v1 and v2 nodes are incompatible. |
| ESPNOW_PSK_TAG_LEN            | 4         | PSK HMAC truncated to 4 bytes                             |
| ESPNOW_SESSION_TAG_LEN        | 8         | Session HMAC truncated to 8 bytes                         |
| ESPNOW_V1_MAX_PAYLOAD         | 250       | ESP-NOW V1 radio max payload (ESP32 original)             |
| ESPNOW_V2_MAX_PAYLOAD         | 1470      | ESP-NOW V2 radio max payload (C5, C6, C3 with IDF >= 5.4) |
| ESPNOW_MAX_PAYLOAD            | 250       | Alias for V1 max — used as pre-session default only         |
| ESPNOW_SCHEMA_OPTIONS_LEN     | 145       | Max entity_options length (strnlen bound on receive). SCHEMA_PUSH struct is now 77 bytes fixed header + variable-length entity_options. Single-fragment TX when 77 + entity_options_len <= 220. |
| ESPNOW_SCHEMA_HASH_LEN        | 222       | Bytes of schema struct included in hash. Schema hash covers node_id + node_label + firmware_epoch (uint32) + project_name + project_version + full entity schema struct per entity. |
| ESPNOW_HEADER_CORE_LEN        | 12        | Authenticated region: bytes 2-12 (excludes protocol_version and hop_count)                 |
| ESPNOW_HEADER_WITH_PSK_TAG_LEN | 17       | Full frame header including PSK tag (bytes 0-16)                                          |
| ESPNOW_MAX_HOPS_DEFAULT        | 5         | Maximum hop_count before dropping                         |
| ESPNOW_HOPS_LIMIT             | 8         | Hard protocol limit for hop count (4-bit field allows 0-15) |
| ESPNOW_HOPS_PARENT_CHECK_BIT | 0x40      | Bit 6 of hop_count: PARENT_CHECK flag — 1=extended header with parent_mac[6] follows      |
| ESPNOW_HOPS_COUNT_MASK        | 0x0F      | Bits 3-0 of hop_count: count value mask                  |
| ESPNOW_SESSION_FLAG_V2_MTU   | 0x01      | session_flags bit 0: device has V2 radio; determines per-session MTU at join time |
| ESPNOW_ROUTE_TTL_DEFAULT_SECONDS | 172800  | Flat route TTL default (48 hours)                                                  |
| ESPNOW_DISCOVER_TTL_MS        | 5000      | Route TTL created by DISCOVER (5 seconds — pending entries only; relay route creation is on JOIN) |
| ESPNOW_HEARTBEAT_INTERVAL_S   | 60        | Default heartbeat interval (seconds)                      |
| ESPNOW_DISCOVER_INTERVAL_MS   | 100       | Interval between DISCOVER broadcasts                      |
| ESPNOW_DISCOVER_RETRIES       | 5         | DISCOVER attempts per channel before moving on            |
| ESPNOW_MAX_RETRIES            | 4         | Unified retry count for STATE, COMMAND, JOIN, radio failures |
| ESPNOW_RETRY_INTERVAL_MS       | 200       | Base retry interval (see backoff table below)             |
| ESPNOW_RETRY_JITTER_MS        | 50        | Jitter added to retry intervals (±50ms)                  |
| ESPNOW_ACK_TIMEOUT_MS         | 300       | General ACK timeout                                       |
| ESPNOW_SCHEMA_REQ_INTERVAL_MS | --       | DEPRECATED: schema req now uses unified backoff (see below)  |
| ESPNOW_SCHEMA_REQ_RETRIES     | --       | DEPRECATED: schema req now uses ESPNOW_MAX_RETRIES       |
| ESPNOW_MAX_PENDING_DISCOVER | 8 | Max pending DISCOVER reverse-path entries per relay |
| MQTT_CONFIRM_TIMEOUT_MS | 2000 | MQTT QoS 1 publish timeout before retry/reexchange |
| ESPNOW_JOIN_COMPLETE_RETRY_INTERVAL_MS | -- | DEPRECATED: JOIN_COMPLETE now uses unified backoff |
| ESPNOW_HEARTBEAT_WAIT_AFTER_COMPLETE_MS | 200 | Wait for HEARTBEAT after sending JOIN_ACK(stage=100) |
| ESPNOW_STATE_SYNC_TIMEOUT_MS | 30000 | State sync timeout (session stuck waiting for STATE after JOIN_ACK stage=2) |

**Unified Retry Backoff:** STATE, COMMAND, SCHEMA_REQUEST, JOIN_COMPLETE, and radio link failures all use the same fixed backoff sequence: 200ms → 400ms → 800ms → 1600ms (with ±50ms jitter). After 4 failed attempts (exhausting `ESPNOW_MAX_RETRIES`), behavior differs by context:
- Leaf STATE failure → fast rejoin (clears session, restarts discovery)
- Bridge COMMAND failure → mark leaf offline, clear leaf's pending commands
- Leaf JOIN failure → restart full discovery cycle
- Radio link failure (leaf) → fast rejoin

**Entity Dirty Flag Semantics:** Remote `EntityRecord.dirty` defaults to `true`. On fresh boot all entities are dirty and will be pushed. An entity is marked clean only on `ACK(ACK_STATE)` confirming end-to-end MQTT delivery. On rejoin after session loss, `entity_records_` are preserved — only genuinely unacknowledged entities remain dirty. When the bridge is fresh (no schema cache, `JOIN_ACK stage=2`), `mark_all_entities_dirty_()` forces a full state push. When the bridge has a schema cache hit (`JOIN_ACK stage=100` directly), the remote pushes only its naturally dirty entities via the normal iteration loop.

**Bridge MQTT Reconnection:** On MQTT reconnect, the bridge marks all `MqttEntityRecord` entries with `state_dirty = true` and `discovery_dirty = true`, causing re-publication of cached state values and discovery config to the broker.

**19\. Chip ID Mapping**

The chip ID is encoded in the ESP-IDF OTA app image header at **offset 12-13** (2 bytes, little-endian). This is part of the `esp_image_header_t` structure and is the definitive chip type identifier used for OTA flashing validation.

**19.1 ESP-IDF OTA Image Header Structure**

| **Offset** | **Size** | **Field**            | **Description**                                      |
| ---------- | -------- | -------------------- | ---------------------------------------------------- |
| 0          | 1        | magic                | Magic byte (0xE9) — valid ESP32-family image         |
| 1          | 1        | segment_count        | Number of memory segments in the image               |
| 2          | 1        | spi_mode             | Flash read mode (0=QIO, 1=QOUT, 2=DIO, 3=DOUT)       |
| 3          | 1        | spi_size/speed       | Bits 7-4: flash size; Bits 3-0: flash frequency      |
| 4-7        | 4        | entry_addr           | Application entry point address                      |
| 8          | 1        | wp_pin               | WP pin configuration                                 |
| 9-11       | 3        | spi_pin_drv          | SPI pin drive settings                               |
| **12-13**  | **2**    | **chip_id**          | **Chip identification (little-endian)**               |
| 14         | 1        | min_chip_rev         | Minimum chip revision (deprecated)                   |
| 15-16      | 2        | min_chip_rev_full    | Min chip revision (major*100 + minor)               |
| 17-18      | 2        | max_chip_rev_full    | Max chip revision (major*100 + minor)                |
| 19-22      | 4        | reserved             | Reserved                                             |
| 23         | 1        | hash_appended        | 1 = SHA256 digest appended after header              |

**19.2 Chip ID Values (esp_chip_id_t enum)**

| **Chip ID** | **Chip Name** | **Notes**                                |
| ----------- | ------------- | ---------------------------------------- |
| 0x0000      | ESP32         | Original dual-core ESP32                 |
| 0x0002      | ESP32-S2      | Single-core, Xtensa LX6                  |
| 0x0005      | ESP32-C3      | RISC-V, single-core, Wi-Fi 4             |
| 0x0009      | ESP32-S3      | Dual-core Xtensa LX7, Wi-Fi 4             |
| 0x000C      | ESP32-C2      | RISC-V, single-core, low cost            |
| 0x000D      | ESP32-C6      | RISC-V, single-core, Wi-Fi 6             |
| 0x0010      | ESP32-H2      | RISC-V, single-core, IEEE 802.15.4/BLE   |
| 0x0012      | ESP32-P4      | Xtensa LX8, high performance            |
| 0x0014      | ESP32-C61     | RISC-V, single-core, Wi-Fi 6             |
| 0x0017      | ESP32-C5      | RISC-V, dual-band (2.4/5 GHz), Wi-Fi 6   |
| 0x0019      | ESP32-H21     | RISC-V, single-core, BLE 5.3             |
| 0x001C      | ESP32-H4      | RISC-V, single-core, BLE 5.3             |
| 0x001F      | ESP32-S3/FH   | ESP32-S3 with flash homing              |

**19.3 Project Board-to-Chip Mapping**

The following chip IDs are used in this project's OTA images:

| **Board (YAML)**        | **chip_id** | **OTA File**                  |
| ----------------------- | ----------- | ----------------------------- |
| esp32-c5-devkitc-1      | 0x0017      | espnow-bridge-c5.ota.bin      |
| esp32dev               | 0x0000      | espnow-remote.ota.bin, espnow-remote-2.ota.bin |
| esp32-c3-devkitm-1     | 0x0005      | espnow-remote-aqua.ota.bin, espnow-remote-leaf.ota.bin, espnow-remote-us1.ota.bin |

**19.4 Why Consistency Matters for OTA Flashing**

When flashing firmware via ESPHome or esptool.py, the chip ID in the OTA image header must match the actual hardware. If there is a mismatch:

1. **esptool.py validation** — The ROM bootloader verifies `IMAGE_CHIP_ID` against the actual chip. A mismatch causes flash failure with error like "image chip id mismatch".

2. **ESPHome OTA** — The ESPHome runtime OTA component validates the chip ID before writing. A mismatch prevents OTA update from succeeding.

3. **Partition selection** — Different chips have different OTA partition layouts. Writing an ESP32-C3 image to an ESP32-C5 partition scheme will fail.

**CRITICAL:** When creating new demo boards or modifying existing ones:
- Ensure the `esp32.board` and `esp32.variant` in the YAML match the actual hardware
- The compiled OTA image's chip ID at offset 12-13 must match the target chip
- Never mix chip IDs in the same binary — each chip type requires its own build

**19.5 Extracting Chip ID from OTA Binaries**

To inspect a compiled OTA image's chip ID:

```bash
hexdump -C -n 16 espnow-remote.ota.bin
# Bytes 12-13 (0-indexed) are the chip_id as little-endian uint16

# Example output:
# 00000000  e9 06 02 20 40 21 08 40  ee 00 00 00 00 00 00 00
#                                         ^^ ^^ = 0x0000 = ESP32
```

Python one-liner:
```python
chip_id = int.from_bytes(open('espnow-remote.ota.bin','rb').read()[12:14], 'little')
```

**19.6 Common Pitfalls**

- **Byte swap errors** — The chip_id is little-endian. Reading bytes 12 and 13 as a big-endian uint16 produces an incorrect value.
- **Confusing byte[1] with chip_id** — Byte 1 is `segment_count` (number of memory segments), not the chip type.
- **Using esptool IMAGE_CHIP_ID** — The esptool.py `IMAGE_CHIP_ID` constants (e.g., ESP32-S3 = 9) are ROM-level chip identifiers and are **not the same** as the OTA image header chip_id field (where ESP32-S3 = 0x0009). Always use the `esp_chip_id_t` enum values (0x0009 for ESP32-S3) when working with OTA image headers.

**21\. OTA Over ESP-NOW**

**21.1 Overview**

OTA over ESP-NOW allows the bridge to flash firmware onto remote leaf nodes via the ESP-NOW LR protocol, with support for multi-hop relay paths. The transfer is initiated by an external source (WebSocket client or CLI) connected to the bridge.

**Design Principles:**
- Source-agnostic bridge manager — any data source can feed chunks (WebSocket currently implemented)
- Capped/negotiated chunk size per transfer so jumbo frames can be added later with minimal recoding
- Sliding window with cumulative ACKs for efficient, ordered delivery
- MD5 integrity checking
- Reboot-to-new-firmware only after successful MD5 verification and COMPLETE ACK handoff

**21.2 Packet Types for OTA**

OTA uses two packet types:

| **Type**       | **Value** | **Encrypted** | **PSK Auth** | **Direction**       | **Description**                      |
| -------------- | --------- | ------------- | ------------ | ------------------ | ------------------------------------ |
| PKT_FILE_TRANSFER | 0x12   | Yes           | Yes          | Bridge → Leaf      | Control: ANNOUNCE, END, ABORT        |
| PKT_FILE_DATA  | 0x13      | Yes           | Yes          | Bridge → Leaf      | Chunked file data                    |

All OTA acknowledgments from the leaf use the unified `PKT_ACK` with `ack_type = PKT_FILE_TRANSFER`. No separate ACK packet type is used.

**21.3 File Transfer Constants**

| **Constant**                              | **Value** | **Notes**                                             |
| ----------------------------------------- | --------- | ----------------------------------------------------- |
| ESPNOW_FILE_ACTION_STORE               | 0x00      | Store file only (future)                              |
| ESPNOW_FILE_ACTION_OTA_FLASH           | 0x01      | Flash firmware via ESP OTA                            |
| ESPNOW_FILE_ACTION_EXECUTE             | 0x02      | Execute after download (future)                       |
| ESPNOW_FILE_ACTION_DISPLAY             | 0x03      | Display update (future)                              |
| ESPNOW_FILE_PHASE_ANNOUNCE             | 0x00      | Transfer announcement phase                           |
| ESPNOW_FILE_PHASE_END                  | 0x01      | Transfer end phase                                    |
| ESPNOW_FILE_PHASE_ABORT                | 0x02      | Transfer abort phase                                 |
| ESPNOW_FILE_ACK_ACCEPT                 | 0x00      | Leaf accepted the transfer                            |
| ESPNOW_FILE_ACK_REJECT                 | 0x01      | Leaf rejected (reason in trailing)                    |
| ESPNOW_FILE_ACK_PROGRESS               | 0x02      | Cumulative ACK + progress percent                     |
| ESPNOW_FILE_ACK_COMPLETE               | 0x03      | Leaf completed action (result in trailing)            |
| ESPNOW_FILE_ACK_ABORT                  | 0x04      | Leaf aborted (reason in trailing)                     |
| ESPNOW_FILE_REJECT_BUSY                | 0x01      | Leaf is already receiving                             |
| ESPNOW_FILE_REJECT_NO_SPACE            | 0x02      | Partition too small                                  |
| ESPNOW_FILE_REJECT_UNSUPPORTED        | 0x03      | Action or parameters unsupported                     |
| ESPNOW_FILE_REJECT_ALREADY             | 0x04      | Already receiving a transfer                         |
| ESPNOW_FILE_REJECT_DEEP_SLEEP          | 0x05      | Leaf is in deep sleep                                |
| ESPNOW_FILE_REJECT_CHIP_MISMATCH       | 0x06      | Chip ID mismatch (future/deferred)                   |
| ESPNOW_FILE_COMPLETE_SUCCESS           | 0x00      | MD5 match, ready to boot new image                   |
| ESPNOW_FILE_COMPLETE_MD5_MISMATCH     | 0x01      | MD5 verification failed                              |
| ESPNOW_FILE_COMPLETE_FLASH_ERROR       | 0x02      | esp_ota_end() failed                                 |
| ESPNOW_FILE_COMPLETE_WRITE_ERROR      | 0x03      | esp_ota_write() failed                              |
| ESPNOW_FILE_COMPLETE_ABORTED           | 0x04      | Transfer was aborted before completion                |
| ESPNOW_FILE_ABORT_USER                | 0x00      | Abort requested by user/source                       |
| ESPNOW_FILE_ABORT_TIMEOUT             | 0x01      | No activity timeout                                  |
| ESPNOW_FILE_ABORT_SESSION_LOST         | 0x02      | Leaf session lost during transfer                    |
| ESPNOW_FILE_ABORT_SEND_FAILURE        | 0x03      | Failed to send frame                                |
| ESPNOW_FILE_ABORT_FLASH_ERROR         | 0x04      | Flash operation error                               |
| ESPNOW_FILE_DATA_MAX_FRAME_SIZE       | ESPNOW_MAX_PAYLOAD (250) | Max frame size for V1; V2 overrides with session value |
| ESPNOW_FILE_DATA_HEADER_OVERHEAD       | 33        | PSK tag (4) + file_data_header (8) + session tag (8) + header core (13) |
| ESPNOW_FILE_DEFAULT_CHUNK_SIZE         | 217       | 250 - 33 bytes for V1                              |
| ESPNOW_FILE_DEFAULT_CHUNK_SIZE_V2      | 1437      | 1470 - 33 bytes for V2                              |
| ESPNOW_FILE_DEFAULT_WINDOW_SIZE       | 16        | Sliding window slot count. **Note:** Actual implementation uses 32 based on field testing; this value may be tuned per deployment.                           |
| ESPNOW_FILE_ACK_INTERVAL              | 4         | Send PROGRESS ACK every N delivered chunks          |
| ESPNOW_FILE_ANNOUNCE_TIMEOUT_MS       | 5000      | Announce retransmit timeout                         |
| ESPNOW_FILE_ACK_TIMEOUT_MS            | 3000      | Data chunk retry timeout                            |
| ESPNOW_FILE_MAX_RETRIES               | 3         | Max data chunk retries before abort                 |

**21.4 Payload Structures**

**PKT_FILE_TRANSFER Payload Structures:**

`espnow_file_announce_t` (37 bytes) — ANNOUNCE phase:
| **Field**     | **Size** | **Description**                              |
| ------------- | -------- | --------------------------------------------- |
| phase         | 1        | ESPNOW_FILE_PHASE_ANNOUNCE (0x00)          |
| file_size     | 4        | Total file size in bytes                     |
| md5[16]       | 16       | MD5 digest of entire file                    |
| chunk_size   | 2        | Requested chunk size (negotiated on ACCEPT)   |
| window_size  | 1        | Sliding window size                          |
| action        | 1        | File action (OTA_FLASH, STORE, etc.)          |
| file_id[12]  | 12       | Null-padded file identifier string           |

`espnow_file_end_t` (1 byte) — END phase:
| **Field** | **Size** | **Description**                          |
| --------- | -------- | --------------------------------------- |
| phase     | 1        | ESPNOW_FILE_PHASE_END (0x01)         |

`espnow_file_abort_t` (2 bytes) — ABORT phase:
| **Field** | **Size** | **Description**                          |
| --------- | -------- | --------------------------------------- |
| phase     | 1        | ESPNOW_FILE_PHASE_ABORT (0x02)       |
| reason    | 1        | Abort reason code                        |

**PKT_FILE_DATA Payload Structure:**

`espnow_file_data_header_t` (8 bytes) + chunk data:
| **Field**   | **Size** | **Description**                                      |
| ----------- | -------- | ---------------------------------------------------- |
| sequence    | 4        | Zero-based chunk sequence number                      |
| offset      | 4        | File offset of this chunk (sequence × chunk_size)   |
| chunk_data  | variable | Raw file bytes (up to ESPNOW_FILE_DEFAULT_CHUNK_SIZE) |

**21.5 OTA ACK (PKT_ACK with ack_type=PKT_FILE_TRANSFER)**

All OTA acknowledgments use the unified `espnow_ack_t` header plus trailing data:

| **Field**        | **Size** | **Description**                                     |
| ---------------- | -------- | --------------------------------------------------- |
| ack_type         | 1        | PKT_FILE_TRANSFER (0x12)                            |
| result           | 1        | ACCEPT / REJECT / PROGRESS / COMPLETE / ABORT      |
| ref_tx_counter   | 4        | tx_counter of the ANNOUNCE packet being acked      |
| trailing         | variable | Result-specific data (see below)                   |

**Trailing Data by Result:**

| **ACK Result**     | **Trailing Size** | **Trailing Fields**                                      |
| ------------------ | ---------------- | -------------------------------------------------------- |
| ACCEPT             | 3 bytes          | negotiated_chunk_size (2) + action (1)                   |
| REJECT             | 2 bytes          | action (1) + reject_reason (1)                          |
| PROGRESS           | 5 bytes          | acked_sequence (4) + progress_pct (1)                   |
| COMPLETE           | 2 bytes          | action (1) + result (1)                                 |
| ABORT              | 1 byte           | abort_reason (1)                                        |

**21.6 Transfer Flow Summary**

1. Source connects to bridge WebSocket and sends `start` with MAC, file size, MD5, action
2. Bridge sends `PKT_FILE_TRANSFER` ANNOUNCE to target leaf (downstream)
3. Leaf responds with `PKT_ACK(FILE_TRANSFER, ACCEPT, ref_tx_counter, negotiated_chunk_size + action)`
4. Bridge enters STREAMING state, slides window requesting chunks from source
5. Bridge sends `PKT_FILE_DATA` chunks downstream (each encrypted with session key)
6. Leaf ACKs with `PKT_ACK(FILE_TRANSFER, PROGRESS, ref_tx_counter, acked_sequence + progress_pct)` every ESPNOW_FILE_ACK_INTERVAL chunks
7. When all chunks acknowledged, bridge sends `PKT_FILE_TRANSFER` END
8. Leaf verifies MD5, flashes, responds with `PKT_ACK(FILE_TRANSFER, COMPLETE, ...)`
9. On SUCCESS, leaf schedules reboot; bridge reports completion to source

**21.7 Relay Handling**

OTA packets are forwarded using the standard leaf_mac routing table:
- `PKT_FILE_TRANSFER` and `PKT_FILE_DATA` use downstream direction (hop_count bit 7 = 1)
- Relay looks up leaf_mac → next_hop_mac and forwards
- Relay does not inspect OTA payloads — opaque ciphertext passthrough
- Upstream `PKT_ACK` packets use upstream direction (hop_count bit 7 = 0) and are routed toward bridge

**21.8 Constraints and Limits**

- V1 paths use 250-byte ESP-NOW frames; V2 paths use up to 1470 bytes
- Maximum chunk size for V1: **217 bytes** (250 - 33 byte overhead)
- Maximum chunk size for V2: **1437 bytes** (1470 - 33 byte overhead), ~6.6x throughput improvement
- Chunk size is negotiated per-transfer using the session's `session_max_payload`
- Web-based OTA (via bridge HTTP API) caps chunk size to 750 bytes to fit within ESPHome's 1024-byte POST body limit (`CONFIG_HTTPD_MAX_REQ_HDR_LEN`). Non-web sources (MQTT, future APIs) use full V2 chunk size.
- Negotiated chunk size may be smaller if leaf advertises lower `max_frame_payload`
- Old firmware remains bootable after: power loss mid-transfer, timeout, MD5 mismatch, or wrong image rejected by esp_ota_end()
- Remote does not reboot before COMPLETE ACK has a chance to transmit

**Known Issues and Constraints**

| **Issue**                         | **Status**            | **Detail**                                                                                                         |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| entity_options size               | RESOLVED               | Defined as 145 bytes. Sized to allow single-fragment SCHEMA_PUSH (222 bytes total struct). Prior code used 148 bytes (2-fragment SCHEMA_PUSH). |
| Multi-bridge active               | Not supported         | Multiple bridges with same PSK/network_id must not be simultaneously active. Supported as passive failover only.   |
| Bridge stateless on reboot        | By design             | Stale HA entities from prior sessions must be manually cleared. Schema cache is RAM-only.                          |
| Per-node key compromise isolation | Out of scope v2       | PSK compromise affects all nodes. Per-node keys are a v3 consideration.                                            |
| Deep-sleep command delivery       | Out of scope v2       | Commands arriving while leaf is sleeping are queued in RAM with TTL. No NVS persistence.                           |
| OTA for leaves                    | IMPLEMENTED           | OTA over ESP-NOW is implemented (see Section 21). V1 uses 217-byte chunks, V2 uses up to 1437-byte chunks. Web OTA caps at 750 bytes for HTTP POST body limit. |

**22\. V2 Radio Coexistence and Per-Session MTU**

**22.1 MTU Negotiation**

MTU is a per-session property negotiated once at JOIN/JOIN_ACK time via the `ESPNOW_SESSION_FLAG_V2_MTU` bit in session_flags. There is no per-path MTU signaling through hop_count bits — bit 6 of hop_count is now PARENT_CHECK.

The session MTU is determined by the **weaker radio** in the session:

- ESP32-C5, ESP32-C6, ESP32-C3 (V2 capable) set `ESPNOW_SESSION_FLAG_V2_MTU` in their JOIN session_flags
- Original ESP32 (V1) does not set this bit
- Bridge and leaf must **both** be V2-capable for the session to use 1470-byte frames
- If either endpoint is V1-only, the session uses 250-byte frames

**22.2 V1 <-> V2 Session Matrix**

| Bridge | Leaf | Session MTU | Notes |
|--------|------|-------------|-------|
| V2 | V2 | 1470 bytes | Both V2-capable |
| V2 | V1 | 250 bytes | Leaf limits to V1 |
| V1 | V2 | 250 bytes | Bridge limits to V1 |
| V1 | V1 | 250 bytes | Both V1 |

Broadcast-type ESP82xx leaves always use 250 bytes (V1 only radio) and always set PARENT_CHECK on encrypted upstream frames. ESP32 leaves use V2 MTU when the bridge is also V2-capable, with no PARENT_CHECK bit.

**22.2 V2 Radio Detection**

Radio version is detected at component init after `esp_now_init()`:

```c
uint32_t espnow_version = 1;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 4, 0)
esp_now_get_version(&espnow_version);
#endif
if (espnow_version >= 2) {
    protocol_.set_session_flags(ESPNOW_SESSION_FLAG_V2_MTU);
}
```

| IDF Version | Chip | `esp_now_get_version()` | Result |
|-------------|------|-------------------------|--------|
| >= v5.4 | C5/C6 | Returns 2 | V2 capable |
| >= v5.4 | ESP32 (original) | Returns 1 | V1 only |
| < v5.4 | Any | Not available (compile-time skip) | V1 only |

**22\. Deprecated and Removed**

The following are no longer valid in v3. Any code implementing these must be removed.

| **Removed Item**                  | **Replaced By**                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sender MAC as leaf identity       | leaf_mac field in packet header (bytes 3-8)                                                               |
| Old 6-byte header                 | New 13-byte header including hop_count and leaf_mac                                                       |
| Standalone NACK (PKT_NACK)        | Standalone NACK (PKT_NACK)<br><br>Replaced by PKT_DEAUTH (PSK-authenticated, request-bound rejoin signal) |
| Encrypted HEARTBEAT               | Unencrypted HEARTBEAT with PSK tag                                                                        |
| Route-ID based relay design       | leaf_mac keyed routing table                                                                              |
| Mesh assumptions                  | Strict tree topology                                                                                      |
| XOR keystream encryption          | AES-CTR via mbedTLS                                                                                       |
| 8-byte session tag only           | 4-byte PSK tag + 8-byte session tag                                                                       |
| espnow_discover_t on-wire size 49 | New DISCOVER payload (33 bytes): network_id, network_id_len, capability_flags. No remote_nonce. |
| old DISCOVER_ACK containing bridge_nonce | DISCOVER_ANNOUNCE: no nonce, carries responder info instead |
| old relay forwarding DISCOVER | Relays send DISCOVER_ANNOUNCE directly; do not forward DISCOVER |
| V2_MTU bit (bit 6 of hop_count) | PARENT_CHECK bit (bit 6 of hop_count) for ESP82xx relay storm suppression; per-session MTU via session_flags |
| Per-path MTU from hop_count V2_MTU bit | Per-session MTU negotiated at JOIN via ESPNOW_SESSION_FLAG_V2_MTU in session_flags |
| ESPNOW_HOPS_V2_MTU_BIT constant | ESPNOW_HOPS_PARENT_CHECK_BIT constant (same bit position, different meaning) |
| espnow_route_v2_capable() inline function | Session MTU determined once at session creation from session_flags |
| Dynamic MTU upgrade/downgrade on received frames | Fixed MTU for entire session lifetime |
