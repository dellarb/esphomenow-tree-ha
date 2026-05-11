**ESP-NOW LR Protocol**

**with Relay Support - v2 Specification**

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
- Selects parent (bridge or relay) based on RSSI and hop count
- Handles its own retry and rediscover logic
- All ESPHOME sensors and actuators

**Relay - Remote may be a relay if enabled and selected by a leaf**

- Forwards packets upstream (toward bridge) and downstream (toward leaves)
- Does NOT terminate sessions - relays never derive or hold session keys
- Validates PSK tag on every packet before forwarding
- Maintains routing table: leaf_mac → next_hop_mac (downstream) and a single parent (upstream)
- Stores temporary reverse paths during join flow to enable JOIN_ACK delivery
- Has configurable capacity limits (max children)

**4\. Topology**

The network is a tree rooted at the bridge. Each remote node has exactly one parent at any time. All non-bridge nodes use the same codebase. A node may operate as a leaf remote only (end of tree), or as a relay-capable remote. A node currently acting as a parent for others is not an edge leaf for topology description purposes.

| **Path**                      | **hops_to_bridge value** | **Description**   |
| ----------------------------- | ------------------------ | ----------------- |
| Leaf → Bridge (direct)        | 0                        | No relay involved |
| Leaf → Relay → Bridge         | 1                        | One relay hop     |
| Leaf → Relay → Relay → Bridge | 2                        | Two relay hops    |

**NOTE:** hops_to_bridge counts relay jumps only. A direct leaf-to-bridge path is 0 hops regardless of radio distance.

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
| 0         | protocol_version (uint8) | EXCLUDED from all auth          | Must equal ESPNOW_LR_PROTOCOL_VER (2)<br><br>No auth always 1<sup>st</sup> packet to allow devices to identify version mismatch |
| 1         | hop_count (uint8)        | EXCLUDED from all auth          | Mutable - incremented by each relay<br><br>No auth as needs to be modified without session                                      |
| 2         | packet_type (uint8)      | PSK tag + session tag           | See packet type table                                                                                                           |
| 3-8       | leaf_mac\[6\]            | PSK tag + session tag           | True leaf identity - never the relay MAC                                                                                        |
| 9-12      | tx_counter (uint32 LE)   | PSK tag + session tag           | Sender's packet counter, little-endian                                                                                          |
| 13-16     | psk_tag\[4\]             | N/A (is the tag)                | HMAC-SHA256(PSK, bytes 2-12 + payload), first 4 bytes                                                                           |
| 17+       | payload                  | session tag (encrypted packets) | Packet-specific, may be encrypted                                                                                               |
| last 8    | session_tag\[8\]         | N/A (is the tag)                | Session-encrypted packets only. Absent on unencrypted packets                                                                   |

**6.2 PSK Tag Computation**

The PSK tag is computed over the authenticated header region and the payload. Protocol version (byte 0) is excluded because it allows devices to check protocol mismatch in all future updates. Hop_count (byte 1) is always excluded because it changes at every relay.

psk_tag = first_4_bytes( HMAC-SHA256(PSK, bytes\[2..12\] || payload) )

**NOTE:** Receivers MUST NOT include byte 0 or 1 (protocol version or hop count) when computing or verifying the PSK tag. This is the only mutable field in the frame.

**6.3 Session Tag Computation**

The session tag authenticates encrypted packets end-to-end between bridge and leaf. Relays do not verify or compute session tags.

session_tag = first_8_bytes( HMAC-SHA256(session_key, bytes\[2..12\] || ciphertext) )

The session tag covers the same authenticated region as the PSK tag (bytes 2-12) plus the encrypted payload ciphertext. It is appended after the payload as the last 8 bytes of the frame.

**6.4 Payload Encryption**

Encrypted packets use AES-CTR mode via mbedTLS. The session key is the AES key and the tx_counter is the CTR nonce.

keystream = AES-CTR(session_key, nonce=tx_counter_as_16_bytes_LE)

ciphertext = plaintext XOR keystream\[0:payload_len\]

**NOTE:** Decryption is identical - apply AES-CTR with the same key and counter to recover plaintext. The (session_key, tx_counter) pair must never be reused; the per-join session key and monotonic tx_counter together guarantee this.

**6.5 Frame Size Budget**

ESP-NOW maximum payload is 250 bytes. Fixed overhead per frame:

| **Component**                        | **Size (bytes)** |
| ------------------------------------ | ---------------- |
| hop_count + header (bytes 0-12)      | 13               |
| psk_tag                              | 4                |
| session_tag (encrypted packets only) | 8                |
| Total overhead (encrypted)           | 25               |
| Total overhead (unencrypted)         | 17               |
| Available for payload (encrypted)    | 225              |
| Available for payload (unencrypted)  | 233              |

**NOTE:** SCHEMA_PUSH uses the entity packet header envelope (same as STATE/COMMAND) and may be fragmented across multiple frames. See section 8.2 for details.

**7\. Session Key Derivation**

A fresh session key is derived on every join cycle. Keys are never reused across sessions.

session_key = HKDF-SHA256(PSK, bridge_nonce\[16\] || remote_nonce\[16\])

- PSK is the 32-byte pre-shared key configured identically on bridge and all leaves
- bridge_nonce is generated fresh by the bridge on each boot (16 bytes, from esp_fill_random)
- remote_nonce is generated fresh by the leaf on each discover cycle (16 bytes, from esp_fill_random)
- Both nonces are exchanged in plaintext during DISCOVER / DISCOVER_ACK
- After bridge reboot, bridge_nonce changes, invalidating all prior session keys
- After leaf rediscover, remote_nonce changes, deriving a new session key even with the same bridge_nonce

**8\. Packet Types and Payloads**

**8.1 Packet Type Reference**

| **Type**           | **Value** | **Encrypted** | **PSK Auth** | **Direction**             | **Description**                 |
| ------------------ | --------- | ------------- | ------------ | ------------------------- | ------------------------------- |
| PKT_DISCOVER       | 0x00      | No            | Yes          | Leaf → Bridge (broadcast) | Join request broadcast          |
| PKT_DISCOVER_ACK   | 0x01      | No            | Yes          | Bridge → Leaf (unicast)   | Bridge responds with nonce      |
| PKT_JOIN           | 0x02      | Yes           | Yes          | Leaf → Bridge (unicast)   | Session establishment           |
| PKT_JOIN_ACK       | 0x03      | Yes           | Yes          | Bridge → Leaf (unicast)   | Join confirmation / completion gate |
| PKT_STATE          | 0x04      | Yes           | Yes          | Leaf → Bridge (unicast)   | Entity value update             |
| PKT_STATE_ACK      | 0x05      | Yes           | Yes          | Bridge → Leaf (unicast)   | State receipt + result          |
| PKT_COMMAND        | 0x06      | Yes           | Yes          | Bridge → Leaf (unicast)   | Actuator command                |
| PKT_COMMAND_ACK    | 0x07      | Yes           | Yes          | Leaf → Bridge (unicast)   | Command confirmation            |
| PKT_SCHEMA_REQUEST | 0x08      | Yes           | Yes          | Bridge → Leaf (unicast)   | Request entity schema           |
| PKT_SCHEMA_PUSH    | 0x09      | Yes           | Yes          | Leaf → Bridge (unicast)   | One entity schema               |
| PKT_HEARTBEAT      | 0x10      | No            | Yes          | Leaf → Bridge (unicast)   | Liveness + interval declaration |
| PKT_DEAUTH         | 0x11      | No            | Yes          | Bridge → Leaf (unicast)   | Out-of-session rejoin signal    |

**NOTE:** Standalone NACK (PKT_NACK) is removed and partially replaced by DEAUTH

**8.2 Payload Structures**

**PKT_DISCOVER - Leaf → Bridge (broadcast)**

Sent unencrypted. PSK tag included. tx_counter = 0

| **Field**          | **Size** | **Description**                                              |
| ------------------ | -------- | ------------------------------------------------------------ |
| network_id\[32\]   | 32       | Null-padded network identifier string                        |
| network_id_len     | 1        | Actual length of network_id (0-32)                           |
| remote_nonce\[16\] | 16       | Fresh random nonce generated by leaf for this discover cycle |

**PKT_DISCOVER_ACK - Bridge → Leaf (unicast via relay reverse path)**

Sent unencrypted. PSK tag included. hop_count from the DISCOVER packet is echoed back so the leaf knows its hop distance.

| **Field**          | **Size** | **Description**                                                         |
| ------------------ | -------- | ----------------------------------------------------------------------- |
| network_id\[32\]   | 32       | Null-padded network identifier                                          |
| network_id_len     | 1        | Actual length                                                           |
| bridge_mac\[6\]    | 6        | Bridge MAC for leaf validation                                          |
| bridge_nonce\[16\] | 16       | Fresh random nonce generated by bridge                                  |
| hops_to_bridge     | 1        | hop_count from the received DISCOVER - leaf uses this to know its depth |

**PKT_JOIN - Leaf → Bridge (unicast, encrypted)**

tx_counter = 1 (first post-session-key packet). Session key must be derived before sending.

| **Field**          | **Size** | **Description**                                                                            |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| remote_nonce\[16\] | 16       | Echo of the nonce sent in DISCOVER - bridge uses this to derive session key                |
| node_id\[32\]      | 32       | Stable machine identity derived from YAML `esphome.name` (null-padded). Used for HA identity and schema cache keying. |
| node_label\[64\]   | 64       | Human-readable device label (null-padded)                                                  |
| schema_hash        | 32       | SHA-256 over all concatenated SCHEMA_PUSH schema structs. Hash covers the full 223-byte schema struct. Cache key for schema exchange. |
| hops_to_bridge     | 1        | hop_count from DISCOVER_ACK - informs bridge of leaf depth for diagnostics                 |

**PKT_JOIN_ACK - Bridge → Leaf (unicast, encrypted)**

| **Field** | **Size** | **Description** |
| ------------- | -------- | -------------------------------------------------------------- |
| accepted | 1 | 1 = accepted, 0 = rejected |
| reason | 1 | 0 = ok, 1 = rejected, 2 = protocol mismatch, 3 = WAIT (join in progress) |
| stage | 1 | 1 = schema refresh in progress, 2 = send state, 100 = join complete |

**Join Flow - WAIT Rejection:**

When a leaf attempts to JOIN while another join is already in progress for that leaf session, the bridge rejects with `accepted=0, reason=3, stage=0`. This tells the leaf to wait before retrying. The leaf should:

1. Wait 10 seconds before retrying the join
2. After 3 consecutive WAIT rejections, return to discovery instead of retrying indefinitely

**Session State Tracking:**

The bridge maintains a `join_in_progress_` flag per session to track ongoing join operations. If a leaf crashes during schema refresh or state sync and retries, the bridge will reject with WAIT until the previous operation completes (via heartbeat or timeout).

**PKT_HEARTBEAT - Remote → Bridge (unicast, unencrypted, PSK authenticated)**

**NOTE:** Heartbeat is unencrypted to allow relays to extract expected_contact_interval_seconds and update route TTLs without session state.

**Scheduling:** Heartbeat is a periodic maintenance packet. Once the configured interval elapses, the remote must send one heartbeat at the next safe opportunity after it has entered NORMAL. Other outbound packets must not reset or postpone the heartbeat deadline, but heartbeat does not pre-empt an in-flight protocol task.

| **Field**                         | **Size** | **Description**                                                   |
| --------------------------------- | -------- | ----------------------------------------------------------------- |
| uptime_seconds                    | 4        | Leaf uptime in seconds (uint32)                                   |
| expected_contact_interval_seconds | 4        | Leaf's configured heartbeat interval in seconds                   |
| parent_mac                        | 6        | Immediate upstream parent MAC. Direct bridge children set this to the bridge MAC. |
| hops_to_bridge                    | 1        | Current hop count to bridge (uint8)                               |
| direct_child_count                | 1        | Number of direct children (relay nodes only; leaves set to 0)     |
| total_child_count                  | 2        | Total children (direct + behind-others, relay nodes only; leaves set to 0) |

**PKT_STATE - Leaf → Bridge (unicast, encrypted)**

One entity per STATE packet. v1 multi-field batching remains removed. STATE payloads are variable length and may be fragmented across multiple packets for the same entity.

| **Field**     | **Size** | **Description**                                                                 |
| ------------- | -------- | ------------------------------------------------------------------------------- |
| entity_index  | 1        | Entity index for this logical update                                            |
| flags         | 1        | Bit 0 = `MORE_FRAGMENTS`; remaining bits reserved and must be sent as 0         |
| fragment_index| 1        | Zero-based fragment index for this logical message                              |
| fragment_count| 1        | Total fragment count for this logical message                                   |
| value_len     | 1        | Number of value bytes carried in this packet                                    |
| value[...]    | value_len| Raw binary value fragment. Encoding depends on entity type (see section 9).     |

Maximum encrypted STATE/COMMAND plaintext is 225 bytes, so the largest single entity fragment is 220 bytes.

**PKT_STATE_ACK - Bridge → Leaf (unicast, encrypted)**

STATE_ACK is message-level, not fragment-level. The bridge sends exactly one ACK after it has received and reassembled every fragment for the logical STATE message.

| **Field**  | **Size** | **Description**                                            |
| ---------- | -------- | ---------------------------------------------------------- |
| rx_counter | 4        | tx_counter of the first fragment for the logical STATE message being acknowledged |
| result     | 1        | 0 = ok, 1 = entity unknown, 2 = value rejected             |

**PKT_COMMAND - Bridge → Leaf (unicast, encrypted)**

COMMAND uses the same variable-length payload header as STATE:

| **Field**      | **Size** | **Description**                                     |
| -------------- | -------- | --------------------------------------------------- |
| entity_index   | 1        | Entity index to command                             |
| flags          | 1        | Bit 0 = `MORE_FRAGMENTS`; remaining bits reserved   |
| fragment_index | 1        | Zero-based fragment index for this logical message  |
| fragment_count | 1        | Total fragment count for this logical message       |
| value_len      | 1        | Number of value bytes carried in this packet        |
| value[...]     | value_len| New value fragment - same encoding as STATE         |

**PKT_COMMAND_ACK - Leaf → Bridge (unicast, encrypted)**

| **Field**   | **Size** | **Description**                              |
| ----------- | -------- | -------------------------------------------- |
| field_index | 1        | Echo of the commanded field index            |
| result      | 1        | 0 = applied, 1 = rejected, 2 = unknown field |

**PKT_SCHEMA_REQUEST - Bridge → Leaf (unicast, encrypted)**

| **Field**       | **Size** | **Description**                          |
| --------------- | -------- | ---------------------------------------- |
| requested_index | 1        | 0-based index of the entity to send next |

**PKT_SCHEMA_PUSH - Leaf → Bridge (unicast, encrypted)**

**NOTE:** SCHEMA_PUSH carries exactly one entity across 1-N fragments using the `espnow_entity_packet_header_t` envelope (same as STATE/COMMAND). The bridge drives schema exchange by issuing sequential SCHEMA_REQUESTs and reassembles fragments before processing. There is no batching. SCHEMA_PUSH is schema-only; initial state is populated later by normal STATE traffic after JOIN completes.

**Wire Format:**

Each SCHEMA_PUSH frame uses the entity packet header:

| **Field**             | **Size** | **Description**                                                                 |
| --------------------- | -------- | ------------------------------------------------------------------------------- |
| entity_index          | 1        | This entity's 0-based index                                                     |
| flags                 | 1        | Bit 0 = `MORE_FRAGMENTS`; remaining bits reserved                               |
| fragment_index        | 1        | Zero-based fragment index for this logical message                              |
| fragment_count        | 1        | Total fragment count for this logical SCHEMA_PUSH message                        |
| value_len             | 1        | Number of schema bytes carried in this fragment                                 |
| value[...]            | varies   | Fragment of `espnow_schema_push_t` (up to 220 bytes per fragment)               |

**Schema Struct (`espnow_schema_push_t`):**

| **Field**             | **Size** | **Description**                                                                 |
| --------------------- | -------- | ------------------------------------------------------------------------------- |
| entity_index          | 1        | This entity's 0-based index                                                     |
| total_entities        | 1        | Total entity count on this leaf                                                 |
| entity_type           | 1        | espnow_field_type_t value                                                       |
| entity_name[32]       | 32       | Field name, null-padded                                                        |
| entity_unit[8]       | 8        | Unit of measurement, null-padded                                               |
| entity_options[180]   | 180      | Optional metadata blob. Carries compact entity-specific capabilities (fan traits, light color modes, etc.) |

**Prefix size: 223 bytes.** `SCHEMA_PUSH` uses fragmentation on the wire because the fixed schema struct exceeds the per-fragment payload budget.

**Included in schema hash:** the full 223-byte fixed schema struct (`entity_index` through `entity_options`). State changes after join do not invalidate the schema cache.

**Frame size examples:**
- Minimum two-fragment SCHEMA_PUSH in this implementation: 17 + (5+220) + 8 + 17 + (5+3) + 8 bytes total across 2 ESP-NOW frames

Current capability keys used by the bridge and remote:

- `FAN`: `speed_count=<n>;oscillation=0|1;direction=0|1;presets=name|name|...`
- `LIGHT`: `color_modes=onoff|brightness|white|color_temp|rgb|rgbw|rgbww;min_mireds=<f>;max_mireds=<f>;effects=name|name|...`

These keys drive Home Assistant discovery. The bridge must only advertise controls that are present in `entity_options`.

**PKT_DEAUTH - Bridge → Leaf (unicast, unencrypted, PSK authenticated)**

| **Field**               | **Size** | **Description**                                                   |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| reason                  | 1        | 1 = Not Joined (reserved for future use if more needed)           |
| response_to_packet_type | 1        | Packet type that triggered DEAUTH (HEARTBEAT, STATE, COMMAND_ACK) |
| response_to_tx_counter  | 4        | tx_counter of the triggering uplink packet                        |
| request_fingerprint     | 4        | Truncated HMAC of triggering uplink packet (see below)            |

Note request_fingerprint calculation = request_fingerprint = first_4_bytes(  
HMAC-SHA256(PSK, uplink_bytes\[2..12\] || uplink_payload))

This is of the packet that the bridge is responding to

**9\. Entity Value Encoding**

The `value[...]` field in STATE and COMMAND uses the following encoding by entity type. The payload is variable-length; only the bytes required for the current entity value are transmitted.

| **Entity Type** | **Type Code** | **Value Encoding**                         | **Fragmentation** |
| --------------- | ------------- | ------------------------------------------ | ----------------- |
| SENSOR          | 0x01          | float (4 bytes IEEE 754 LE)                | Optional          |
| SWITCH          | 0x02          | uint8_t: 0=OFF, 1=ON                       | Optional          |
| BINARY          | 0x03          | uint8_t: 0=OFF, 1=ON                       | Optional          |
| BUTTON          | 0x04          | uint8_t: always 1 (trigger)                | Optional          |
| NUMBER          | 0x05          | float (4 bytes IEEE 754 LE)                | Optional          |
| TEXT            | 0x06          | UTF-8 bytes, not null padded               | Yes               |
| TEXT_SENSOR     | 0x14          | UTF-8 bytes, not null padded               | Yes               |
| CLIMATE         | 0x07          | Entity-specific compact binary struct      | Optional          |
| COVER           | 0x08          | Compact binary payload                     | Optional          |
| LIGHT           | 0x09          | Compact binary payload                     | Optional          |
| FAN             | 0x0A          | Compact binary payload                     | Optional          |
| LOCK            | 0x0B          | Compact binary payload                     | Optional          |
| ALARM           | 0x0C          | Compact binary payload                     | Optional          |
| SELECT          | 0x0D          | uint8_t: option index                      | Optional          |
| EVENT           | 0x0E          | UTF-8 event type string                    | Optional          |
| HUMIDIFIER      | 0x0F          | Compact binary payload                     | Optional          |
| DEHUMIDIFIER    | 0x10          | Compact binary payload                     | Optional          |
| VALVE           | 0x11          | Compact binary payload                     | Optional          |
| TIME            | 0x12          | Compact binary payload                     | Optional          |
| DATETIME        | 0x13          | Compact binary payload                     | Optional          |

Fragmentation: `flags & 0x01` is set on all but the final fragment for a logical value. The receiver accumulates fragments by `entity_index`, `fragment_index`, and `fragment_count`, tolerates duplicate or out-of-order fragment arrival, and processes the update only after the full message has been reassembled.

Partial fragment assemblies must be dropped if they exceed implementation caps or if they expire before all fragments arrive.

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

- Send DEAUTH **only as a direct response** to any of: HEARTBEAT, STATE, COMMAND_ACK
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

Leaf MUST track the most recent outbound packet that was one of HEARTBEAT, STATE, COMMAND_ACK:

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
| leaf_mac\[6\]     | Canonical leaf identity (from packet header)                           |
| next_hop_mac\[6\] | MAC of the next node toward the leaf (downstream) or parent (upstream) |
| expiry_timestamp  | Route expires at this time; refreshed on valid upstream packets        |
| ttl_seconds       | Current TTL value used for this entry                                  |

**11.2 Route Lifecycle**

| **Event**                    | **Action**                                                                    | **TTL**                                        |
| ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| DISCOVER received by relay   | Create/refresh route: leaf_mac → upstream sender MAC                          | 5 seconds                                      |
| JOIN received by relay       | Extend route TTL (route already exists from DISCOVER)                         | 60 seconds (default heartbeat interval)        |
| JOIN_ACK forwarded by relay  | No TTL change - route already extended                                        | 60 seconds (unchanged)                         |
| Post-join HEARTBEAT received | Refresh route with proper long-lived TTL                                      | clamp(3 × expected_contact_interval, 60s, 24h) |
| Any valid upstream packet    | Refresh route TTL to current long-lived value                                 | clamp(3 × interval, 60s, 24h)                  |
| Route expires                | Entry removed. Missing route = drop downstream packets. Leaf must rediscover. | -                                              |

**NOTE:** Route creation during DISCOVER is an intentional exception to the 'JOIN creates routes' principle. DISCOVER entries are always short-lived and serve only to return the DISCOVER_ACK to the leaf. JOIN always overwrites a DISCOVER entry for the same leaf_mac.

**11.3 Route Expiry Formula**

expiry = clamp(3 × expected_contact_interval_seconds, min=60s, max=86400s)

expected_contact_interval_seconds is carried in the HEARTBEAT payload. Until the first HEARTBEAT arrives after JOIN, the relay uses the 60-second JOIN-extension TTL as a safe default.

**11.4 Upstream Routing**

- All nodes forward upstream packets to their single configured parent
- Relay increments hop_count before forwarding
- Relay refreshes the route for the leaf_mac on any valid upstream packet

**11.5 Downstream Routing**

- Look up leaf_mac in routing table
- If found: forward to next_hop_mac
- If not found: DROP. Do not broadcast. Do not NACK.
- Missing downstream route means the leaf has not joined or the route has expired - leaf will rediscover

**12\. Packet Processing Pipeline**

Every received packet MUST be processed in this exact order. Deviation is a protocol violation.

| **Step** | **Check**                                                            | **On Failure** |
| -------- | -------------------------------------------------------------------- | -------------- |
| 1        | Frame length >= minimum (13 + 4 psk_tag = 17 bytes)                  | DROP silently  |
| 2        | protocol_version == ESPNOW_LR_PROTOCOL_VER (2)                       | DROP silently  |
| 3        | packet_type is a known value                                         | DROP silently  |
| 4        | PSK tag valid: recompute HMAC over bytes\[2..12\] + payload, compare | DROP silently  |
| 5        | hop_count < max_hops (default 4)                                     | DROP silently  |
| 6        | Dispatch to packet-type handler                                      | -              |

**NOTE:** Steps 1-5 must complete before any packet-type-specific logic runs. This ensures relays spend minimal CPU on invalid traffic.

For encrypted packets, the packet-type handler additionally:

- Retrieves session key for leaf_mac
- Verifies session tag (8-byte HMAC over bytes\[1..12\] + ciphertext)
- Decrypts payload using AES-CTR(session_key, tx_counter)
- Verifies tx_counter > last_seen_counter for this leaf (replay check)
- Updates last_seen_counter

**13\. Remote Behaviour as Relay**

**13.1 Capacity**

| **Setting**          | **Default** | **Notes**                                                                                |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| relay_enabled        | true        | Allow user config of relay behaviour - eg. battery or sleeping nodes shouldn't be relays |
| max_children         | 6           | Maximum number of direct child nodes (leaves or relays)                                  |
| max_hops             | 4           | Maximum hop_count before dropping                                                        |
| max_discover_pending | 8           | Maximum pending DISCOVER reverse-path entries (5s TTL)                                   |

Capacity settings should be able to be configured by yaml in esphome when configuring the remote under esp_tree_remote: but default to the above if not specifically

**13.2 Relay Readiness**

A relay MUST NOT accept children or forward packets as a relay until it has entered NORMAL state (i.e., `normal_ == true`). This ensures the relay has completed its own join cycle and has a stable route to the bridge before accepting downstream nodes.

- Until `normal_ == true`: `can_accept_child_()` returns `false`; DISCOVER requests are silently dropped
- This prevents relaying packets before the relay has established its own session and upstream route

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Check (leaf_mac, remote_nonce) pair - if seen recently (within 5s), suppress duplicate forward
- Check capacity: if at max_children and leaf_mac is not already a known child, suppress
- Create short-lived route: leaf_mac → sender_mac 5sec
- Increment hop_count and forward upstream to parent with a small jitter to deconflict with other relays

**NOTE:** DISCOVER suppression if full is intentional. A full relay does not send any response. The leaf will retry and may reach the bridge via a different relay or directly.

**13.2b Bridge DISCOVER_ACK Handling**

- When multiple bridges share the same channel, they may receive the same upstream DISCOVER and respond simultaneously, causing upstream collisions
- Apply a small random jitter (0–20ms) before transmitting each DISCOVER_ACK to deconflict with other bridges on the same channel

**13.3 DISCOVER_ACK Handling**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Look up leaf_mac in routing table
- If found: forward to next_hop_mac (the sender MAC from the original DISCOVER)
- If not found: DROP - the DISCOVER entry has expired (5s TTL exceeded)
- Do not increment hop_count on downstream packets

**13.4 JOIN Handling**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Look up leaf_mac in routing table (must exist from DISCOVER phase)
- Extend route TTL to 60 seconds (join-extension TTL) & reset expiry_timestamp for that route
- Store reverse path: leaf_mac → sender_mac (may already be correct from DISCOVER entry)
- Increment hop_count and forward upstream

**13.5 JOIN_ACK Handling**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Look up leaf_mac in routing table
- If found: forward downstream to next_hop_mac
- If not found: DROP - JOIN extension TTL has expired
- `JOIN_ACK(status=1)` means schema refresh is in progress
- `JOIN_ACK(status=2)` means remote should send state (schema was cached or just completed)
- `JOIN_ACK(status=100)` means join complete; the next HEARTBEAT is the completion acknowledgement
- On successful forward of `JOIN_ACK(status=100)`, route now awaits HEARTBEAT to set long-lived TTL

**13.6 HEARTBEAT Handling**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Extract expected_contact_interval_seconds from plaintext payload
- Refresh route: expiry = clamp(3 × interval, 60s, 24h)
- Update expiry_timestamp for that leaf
- Increment hop_count and forward upstream

**NOTE:** HEARTBEAT is the event that transitions a route from the temporary 60s join-extension TTL to the proper self-sustaining long-lived TTL. Until the post-join HEARTBEAT arrives, the route is on borrowed time.

**13.7 All Other Upstream Packets (STATE, COMMAND_ACK, SCHEMA_PUSH)**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Refresh route TTL for leaf_mac (using current long-lived TTL if known, else 60s)
- Increment hop_count and forward upstream
- Relay does NOT decrypt or inspect payload

**13.8 All Downstream Packets (STATE_ACK, COMMAND, SCHEMA_REQUEST, JOIN_ACK)**

- Validate packet per packet handling rules (protocol, psk-tag etc.)
- Look up leaf_mac in routing table
- If found: forward to next_hop_mac
- If not found: DROP silently

**14\. Bridge Behaviour**

**14.1 Session Management**

- Bridge generates a single bridge_nonce on boot (stored in RAM, not NVS)
- Bridge is stateless across reboots - no session state is persisted
- Each leaf session is keyed by leaf_mac and holds: session_key, tx_counter, schema_hash, entity list, last_seen
- Bridge maintains routing table: leaf_mac → sender_mac (the ESP-NOW MAC of the last upstream hop)

**14.2 Upstream Processing**

- Identify leaf by leaf_mac from packet header
- Update route: leaf_mac → sender_mac (the immediate ESP-NOW sender, used for downstream replies)
- For encrypted packets: verify session tag, decrypt, process
- For STATE: validate tx_counter, update entity state, publish to MQTT, send STATE_ACK
- For HEARTBEAT: update last_seen, update diagnostics, and if a `JOIN_ACK(status=100)` is pending treat the heartbeat as the completion acknowledgement

**14.3 Downstream Processing**

- Look up leaf_mac in routing table to get next_hop_mac
- Send frame with hop_count = 0 to next_hop_mac
- If route not found: DROP - leaf must rediscover

**14.4 Join Flow (Three-Phase)**

Join proceeds in three phases after the initial JOIN packet:

**Phase 1 - Schema Exchange (status=1)**
- On JOIN: check schema_hash against cached hash for this remote `node_id`
- If no match or no cache: send `JOIN_ACK(status=1)`, then begin SCHEMA_REQUEST sequence
- Schema exchange: bridge sends SCHEMA_REQUEST(index=0), leaf responds SCHEMA_PUSH(index=0, total=N) — leaf may use 1-N fragments
- Bridge reassembles SCHEMA_PUSH fragments before processing
- Bridge publishes MQTT discovery for each entity immediately
- Bridge clears stale entities if schema changed

**Phase 2 - State Sync (status=2)**
- After all schema entities received (or if schema was cached), bridge sends `JOIN_ACK(status=2)`
- Bridge tracks state_received_count; remote sends all entity states 1-by-1, each acknowledged
- Bridge sends `JOIN_ACK(status=100)` only after all STATE packets are received
- Cached schema path: bridge sends `JOIN_ACK(status=2)` immediately after JOIN (no schema exchange)

**Phase 3 - Normal (status=100)**
- `JOIN_ACK(status=100)` signals join complete; remote transitions to NORMAL and sends HEARTBEAT
- Bridge marks session fully joined on receipt of first HEARTBEAT after `status=100`

**Note:** If schema_hash matches cache, bridge skips schema exchange and sends `JOIN_ACK(status=2)` directly. Zero-entity leaves skip state sync and receive `JOIN_ACK(status=100)` immediately.

**Schema hash covers the full 223 bytes of each `espnow_schema_push_t`** (entity_index through entity_options). State changes after join do not invalidate the schema cache; only schema metadata changes trigger re-exchange.

**HA identity rule:** Home Assistant device and entity identity should be keyed from `node_id`, not the ESP-NOW radio MAC. This matches ESPHome replacement behavior more closely: keeping the same YAML `esphome.name` preserves the logical device across hardware swaps, while `node_label` remains display-only.

**14.5 Not-Joined Silence**

When the bridge receives a PSK-valid packet from a leaf but has **no active session**, it MUST respond with a PKT_DEAUTH packet. This replaces the prior NACK based behaviour. See DEAUTH references.

**15\. Leaf Behaviour**

**15.1 Parent Selection**

Leaf collects DISCOVER_ACK responses from multiple potential parents (bridge or relays) during the discovery window and selects by:

- Primary: lower hops_to_leaf (prefer fewer hops to bridge)
- Secondary: higher RSSI (prefer stronger signal at equal hop count)

**15.2 Lifecycle - Always-On**

| **State**     | **Action**                                                                                   | **Next State**                     |
| ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| IDLE          | Initialize ESP-NOW LR, generate remote_nonce                                                   | DISCOVERING                        |
| DISCOVERING   | Broadcast DISCOVER on all channels, collect ACKs, select parent                                | JOINING                            |
| JOINING       | Derive session_key, send JOIN to selected parent                                               | JOINED                             |
| JOINED        | Receive `JOIN_ACK(status=1)`. Stay joined but not normal; wait for schema refresh.            | JOINED                             |
| STATE_SYNC    | Receive `JOIN_ACK(status=2)`. Mark all entities dirty. Send STATE for each dirty entity, 1-by-1 with ACK. | NORMAL (after status=100)         |
| NORMAL        | Receive `JOIN_ACK(status=100)`. Send HEARTBEAT immediately, then send STATE on entity change. | NORMAL (or DISCOVERING on failure) |

**NOTE:** The transition to NORMAL MUST be driven by `JOIN_ACK(status=100)` from the bridge. The remote must not emit HEARTBEAT or STATE before that status arrives. The first HEARTBEAT after `JOIN_ACK(status=100)` is the completion acknowledgement and sets the long-lived route TTL on all relays in the path.

**15.3 Retry and Timeout Constants**

| **Packet** | **Interval** | **Jitter** | **Retries** | **On Exhaustion** |
| ----------- | ------------ | ---------- | ------------------- | ----------------------------------------------------- |
| DISCOVER | 100ms | ±50ms | 5 per channel sweep | Restart sweep |
| JOIN | 300ms | ±50ms | 3 | Restart from DISCOVER |
| STATE | 300ms | ±50ms | 3 | Increment fail count; if >= 3 consecutive: rediscover |
| SCHEMA_PUSH | - | - | N/A | Bridge drives - no leaf retry |
| JOIN_ACK(status=100) | 200ms | ±50ms | 3 retries | Bridge retries; if no HEARTBEAT after 3 retries: session preserved, join_in_progress cleared |
| COMMAND_ACK | 300ms | ±50ms | 3 | Drop - bridge resends if needed |
| HEARTBEAT | - | - | 1 (no retry) | Not retried |

- packet_fail_count resets to 0 on any successful STATE exchange
- A missing STATE_ACK after all retries increments packet_fail_count

**15.4 Heartbeat Sending Rule**

Heartbeat is scheduled on a fixed deadline after NORMAL is reached. Once the configured interval elapses, the remote sends one HEARTBEAT at the next safe opportunity even if other packets were sent during the interval.

**16\. Protocol Flow Diagrams**

**16.1 Discovery and Join Flow (with one relay)**

Leaf Relay Bridge

───────────────────────────────────────────────────────────────────

generate remote_nonce

DISCOVER (broadcast) ──►

validate

store route: leaf→sender(5s TTL)

hop_count++ → forward ──────────►

generate bridge_nonce

◄── DISCOVER_ACK (unicast)

look up leaf_mac in route

◄── DISCOVER_ACK ──────── forward to stored sender

select parent (best RSSI / fewest hops)

derive session_key = HKDF(PSK, bridge_nonce||remote_nonce)

JOIN (unicast, encrypted) ──►

extend route TTL to 60s

store reverse path

hop_count++ → forward ──────────►

verify session_tag

check schema_hash

◄── JOIN_ACK(status=1)   (no cache)  or
◄── JOIN_ACK(status=2)   (cache hit)

look up leaf_mac

◄── JOIN_ACK ──────────── forward downstream

// --- if status=1: schema exchange ---
SCHEMA_REQUEST(index=0) ◄── ────────────────────────────
◄── SCHEMA_PUSH(index=0, total=N)
SCHEMA_REQUEST(index=1) ────────────────────────────►
◄── SCHEMA_PUSH(index=1, total=N)
... repeat for all entities ...
◄── SCHEMA_PUSH(index=N-1, total=N)

// --- after schema complete or cache hit ---
◄── JOIN_ACK(status=2)  (send state)

STATE(entity=0) ──►
◄── STATE_ACK
STATE(entity=1) ──►
◄── STATE_ACK
... send each dirty entity, wait for ACK ...

◄── JOIN_ACK(status=100)  (all state received)

HEARTBEAT (mandatory, immediate on 100) ──►

extract interval

set route TTL = clamp(3×interval,60s,24h)

hop_count++ → forward ──────────►

update diagnostics

═════════════ NORMAL OPERATION ══════

STATE (encrypted) ──────►

refresh route TTL

forward ────────────────────────►

decrypt, validate

publish to MQTT

◄── STATE_ACK

forward ◄────────────────────────

◄── STATE_ACK ───────────

**16.2 Schema and State Exchange Flow**

Bridge Leaf

───────────────────────────────────────────────────────────────────

JOIN_ACK(status=1) sent (schema refresh required)

SCHEMA_REQUEST(index=0) ──────────────────────────────►

◄── SCHEMA_PUSH(index=0, total=N, entity data)

publish MQTT discovery for entity 0

SCHEMA_REQUEST(index=1) ──────────────────────────────►

◄── SCHEMA_PUSH(index=1, total=N, entity data)

publish MQTT discovery for entity 1

... repeat for each entity ...

SCHEMA_REQUEST(index=N-1) ────────────────────────────►

◄── SCHEMA_PUSH(index=N-1, total=N, entity data)

entity_index == total_entities: schema complete

cache schema_hash for leaf_mac

◄── JOIN_ACK(status=2)   (send state)

// --- state sync: remote-driven, 1-by-1 ---

STATE(entity=0) ──────────────────────────────►
◄── STATE_ACK
STATE(entity=1) ──────────────────────────────►
◄── STATE_ACK
... one state per entity, waiting for ACK each ...

◄── JOIN_ACK(status=100)  (all state received)

── Zero entities special case ──

◄── JOIN_ACK(status=100)  (no schema, no state)

HEARTBEAT ──►

═════════════ NORMAL OPERATION ══════

**16.3 Failure and Recovery**

| **Failure**                      | **Detection**                                                                                                  | **Recovery**                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bridge reboot                    | Leaf sends STATE / HEARTBEAT, receives DEAUTH <br>Immediate rediscover → Fast JOIN if that fails then DISCOVER | packet_fail_count >= 3 → rediscover. Bridge gets fresh JOIN.                           |
| Relay failure                    | Leaf sends STATE, no ACK after retries (route broken)                                                          | packet_fail_count >= 3 → rediscover. Leaf may select different relay or go direct.     |
| JOIN_ACK(status=2 or 100) lost  | No response after retries. Bridge: retries JOIN_ACK up to 3 times. Leaf: treats timeout as failure.         | Bridge retries JOIN_ACK; leaf restarts from DISCOVER on exhaustion.                    |
| Route expired at relay           | Downstream packet cannot be delivered                                                                          | DROP. Bridge retries → no ACK → bridge queues. Leaf rediscovers on next STATE failure. |
| DISCOVER suppressed (relay full) | No DISCOVER_ACK received                                                                                       | Leaf retries. Eventually tries next channel / different relay.                         |

**17\. MQTT Integration**

**17.1 Topic Structure**

All MQTT topics use leaf_mac as the stable identifier. Topics remain the same regardless of which bridge the leaf is currently joined to.

| **Topic**                                     | **Retain** | **Description**           |
| --------------------------------------------- | ---------- | ------------------------- |
| homeassistant/{domain}/{mac}\_{field}/config  | Yes        | HA MQTT discovery payload |
| homeassistant/{domain}/{mac}\_{field}/state   | No         | Current entity state      |
| homeassistant/{domain}/{mac}\_{field}/command | No         | Command from HA to bridge |
| homeassistant/{domain}/{mac}/availability     | No         | online / offline          |

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
   │◄─JOIN_ACK(status=2)│                          │                  │
   │   (send state)    │                             │                  │
```

**Timeout Handling:** If MQTT discovery does not receive PUBACK within 2 seconds, the bridge re-requests the same entity schema via `SCHEMA_REQUEST` for that entity index, allowing the remote to retransmit the schema data.

**17.4.2 Deferred STATE_ACK with MQTT Confirmation**

During state sync (Phase 2 of join) and normal operation, `STATE_ACK` is sent to the remote only after the MQTT publish for that entity succeeds. This provides end-to-end delivery confirmation from the remote to HA.

**Flow Diagram:**
```
Remote              Bridge                      MQTT Broker            HA
   │                  │                             │                  │
   │──STATE(entity=0)─►│                           │                  │
   │                  │ publish state(0) qos=1───►│                  │
   │                  │◄─────────PUBACK───────────│                  │
   │                  │ (MQTT confirmed)           │                  │
   │◄──STATE_ACK──────│                             │                  │
   │                  │                             │                  │
   │──STATE(entity=1)─►│                           │                  │
   │                  │ publish state(1) qos=1───►│                  │
   │                  │◄─────────PUBACK───────────│                  │
   │◄──STATE_ACK──────│                             │                  │
```

**Timeout Handling:** If MQTT publish times out (2 second timeout), `STATE_ACK` is not sent. The remote's existing retry mechanism (300ms interval, 3 retries) will resend the STATE packet, allowing the bridge to retry the MQTT publish.

**State Dirty Flag:** The `state_dirty` flag is only cleared after successful MQTT QoS 1 publish. If MQTT publish fails, the flag remains set and the state will be retried in the next `sync_mqtt_entities_()` loop iteration.

**17.4.3 MQTT Publish Synchronous Blocking**

MQTT QoS 1 publish calls are **synchronous and blocking** - they wait for PUBACK before returning. This ensures the bridge has broker confirmation before proceeding. Under heavy MQTT traffic or WiFi congestion, this can introduce latency but guarantees delivery tracking.

**18\. Implementation Constants**

| **Constant**                     | **Value** | **Notes**                                                 |
| -------------------------------- | --------- | --------------------------------------------------------- |
| ESPNOW_LR_PROTOCOL_VER           | 2         | Increment on breaking changes. v1 nodes are incompatible. |
| ESPNOW_LR_HEADER_LEN             | 12        | Bytes 1-12 (excludes hop_count at byte 0)                 |
| ESPNOW_LR_PSK_TAG_LEN            | 4         | PSK HMAC truncated to 4 bytes                             |
| ESPNOW_LR_SESSION_TAG_LEN        | 8         | Session HMAC truncated to 8 bytes                         |
| ESPNOW_LR_MAX_PAYLOAD            | 250       | ESP-NOW hard limit in bytes                               |
| ESPNOW_LR_SCHEMA_OPTIONS_LEN     | 180       | entity_options field in SCHEMA_PUSH. Do not increase.     |
| ESPNOW_LR_SCHEMA_HASH_LEN        | 223       | Bytes of schema struct included in hash. Schema hash covers the full fixed schema struct. |
| ESPNOW_LR_MAX_HOPS               | 4         | Maximum hop_count before dropping                         |
| ESPNOW_LR_MAX_CHILDREN           | 6         | Default relay capacity                                    |
| ESPNOW_LR_DISCOVER_TTL_MS        | 5000      | Route TTL created by DISCOVER (5 seconds)                 |
| ESPNOW_LR_JOIN_EXT_TTL_S         | 60        | Route TTL extension on JOIN (seconds)                     |
| ESPNOW_LR_HEARTBEAT_INTERVAL_S   | 60        | Default heartbeat interval (seconds)                      |
| ESPNOW_LR_DISCOVER_INTERVAL_MS   | 100       | Interval between DISCOVER broadcasts                      |
| ESPNOW_LR_DISCOVER_RETRIES       | 5         | DISCOVER attempts per channel before moving on            |
| ESPNOW_LR_JOIN_INTERVAL_MS       | 300       | JOIN retry interval                                       |
| ESPNOW_LR_JOIN_RETRIES           | 3         | JOIN attempts before restarting DISCOVER                  |
| ESPNOW_LR_STATE_INTERVAL_MS      | 250       | STATE retry interval                                      |
| ESPNOW_LR_STATE_RETRIES          | 3         | STATE attempts before incrementing fail count             |
| ESPNOW_LR_MAX_CONSEC_FAILS       | 3         | Consecutive STATE failures before rediscover              |
| ESPNOW_LR_ACK_TIMEOUT_MS         | 300       | General ACK timeout                                       |
| ESPNOW_LR_SCHEMA_REQ_INTERVAL_MS | 200       | SCHEMA_REQUEST retry interval                             |
| ESPNOW_LR_SCHEMA_REQ_RETRIES | 3 | SCHEMA_REQUEST attempts per entity |
| ESPNOW_LR_MAX_PENDING_DISCOVER | 8 | Max pending DISCOVER reverse-path entries per relay |
| MQTT_CONFIRM_TIMEOUT_MS | 2000 | MQTT QoS 1 publish timeout before retry/reexchange |
| ESPNOW_LR_JOIN_COMPLETE_RETRY_INTERVAL_MS | 200 | JOIN_ACK(status=100) retry interval |
| ESPNOW_LR_HEARTBEAT_WAIT_AFTER_COMPLETE_MS | 200 | Wait for HEARTBEAT after sending JOIN_ACK(status=100) |
| ESPNOW_LR_STATE_SYNC_TIMEOUT_MS | 30000 | State sync timeout (session stuck waiting for STATE) |

**19\. Known Issues and Constraints**

| **Issue**                         | **Status**            | **Detail**                                                                                                         |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| entity_options drift              | RESOLVED in this spec | Defined as 180 bytes. Code must be reconciled to match. Prior code used ~64 bytes; 180 is the new canonical value. |
| Multi-bridge active               | Not supported         | Multiple bridges with same PSK/network_id must not be simultaneously active. Supported as passive failover only.   |
| Bridge stateless on reboot        | By design             | Stale HA entities from prior sessions must be manually cleared. Schema cache is RAM-only.                          |
| OTA for leaves                    | Out of scope v2       | Physical flash only for leaf nodes.                                                                                |
| Per-node key compromise isolation | Out of scope v2       | PSK compromise affects all nodes. Per-node keys are a v3 consideration.                                            |
| Deep-sleep command delivery       | Out of scope v2       | Commands arriving while leaf is sleeping are queued in RAM with TTL. No NVS persistence.                           |

**20\. Deprecated and Removed**

The following are no longer valid in v2. Any code implementing these must be removed.

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
| espnow_discover_t on-wire size 49 | New DISCOVER payload - same fields, header moved to common header                                         |
