# ESP8266 Unicast ESP-NOW Failure — Comprehensive Findings

**Date:** 2026-05-09  
**Issue:** ESP8266/ESP-12E nodes can receive ESP-NOW traffic and can transmit ESP-NOW broadcast frames, but cannot reliably transmit ESP-NOW unicast frames to ESP32-C5 bridge/relay devices.  
**Current mitigation:** Force ESP8266 outbound ESP-NOW frames to use 802.11 broadcast destination while retaining protocol-level `leaf_mac`, counters, session data, and routing metadata.

---

## 1. Executive Summary

The investigation shows a directional ESP8266 ESP-NOW transmit failure:

- ESP8266 → ESP32-C5 **broadcast** works.
- ESP8266 → ESP32-C5 **unicast** fails.
- ESP8266 → ESP32 relay **unicast** also fails.
- ESP32-C5/relay → ESP8266 **unicast receive** works.
- ESP8266 standalone Arduino firmware shows the same failure as the ESPHome component.

This is therefore **not an ESPHome-specific problem**. It is also not explained by bridge-only behaviour, channel selection, peer channel setting, WiFi mode, ESP-NOW role, protocol payload correctness, PMK/encryption mismatch, or relay routing.

The strongest evidence is that ESP8266 unicast sends produce `TX CB status=FAIL`, meaning the ESP8266 does not receive a MAC-layer ACK, and the ESP32-C5 bridge does not receive those unicast frames through either the normal ESP-NOW callback or the promiscuous callback. In contrast, broadcast frames are processed correctly by the bridge.

The practical conclusion is:

> ESP8266 ESP-NOW unicast TX is defective or incompatible in this ESP8266 Arduino SDK / ESP32-C5 ESP-IDF environment. The failure occurs below the bridge's ESP-NOW software layer. Broadcast ESP-NOW TX is the only confirmed reliable ESP8266 → bridge path.

---

## 2. Hardware / Software Environment

| Component | Details |
|-----------|---------|
| ESP8266 node | ESP-12E module |
| ESP8266 framework | Arduino SDK 3.1.2 |
| ESP8266 board | `esp12e` |
| Bridge | ESP32-C5 DevKitC-1 |
| Bridge framework | ESP-IDF 5.x / ESPHome external component |
| ESP-NOW mode | `regular` |
| Channel | 11 during primary tests |
| Network ID | `myhouse` during tests |
| Primary bridge MAC tested | `D0:CF:13:EB:81:28` |
| Relay MAC tested | `F4:2D:C9:58:33:10` |
| ESP8266 observed source MAC issue | AP MAC `EC:FA:BC:63:17:00`; ESP-NOW radio source observed/aligned as `EE:FA:BC:63:17:00` |

---

## 3. Verified Working and Broken Paths

### 3.1 Working Paths

| Direction | Method | Result | Significance |
|-----------|--------|--------|--------------|
| ESP8266 → Bridge | `esp_now_send(FF:FF:FF:FF:FF:FF)` | Works | ESP8266 can transmit valid ESP-NOW broadcast frames. |
| ESP8266 → Bridge | Broadcast JOIN | Works | Bridge receives JOIN and replies with JOIN_ACK. |
| ESP8266 → Bridge | Broadcast SCHEMA / STATE / HEARTBEAT | Works | Full protocol path can operate using broadcast TX. |
| Bridge → ESP8266 | Unicast JOIN_ACK / SCHEMA_REQUEST | Works | ESP8266 RX path is functional. |
| Relay → ESP8266 | Forwarded ACK frames | Works | ESP8266 can receive via relay path. |
| Bridge receives ESP8266 HEARTBEAT | Broadcast workaround | Works | Bridge logs `[RX HEARTBEAT] EEFABC631700 len=43 rssi=-58`. |
| ESPHome component | Broadcast workaround + RSSI fix | Works | Device reached stable `NORMAL` state. |

### 3.2 Broken Paths

| Direction | Method | Result | Significance |
|-----------|--------|--------|--------------|
| ESP8266 → Bridge | `esp_now_send(D0:CF:13:EB:81:28)` | `TX CB status=FAIL` | No MAC-layer ACK. |
| ESP8266 → Relay | `esp_now_send(F4:2D:C9:58:33:10)` | `TX CB status=FAIL` | Not bridge-specific. |
| ESP8266 → Bridge | Raw 802.11 `wifi_send_pkt_freedom` | Not received by bridge | Raw frame workaround did not solve it. |
| ESP8266 → Bridge | 250 raw 802.11 format permutations | Zero reached ESP-NOW layer | Simple header/OUI mismatch is unlikely to be the whole cause. |
| ESP8266 → Bridge | ESPHome firmware unicast | Fails | Not fixed by ESPHome integration. |
| ESP8266 → Bridge | Standalone Arduino firmware unicast | Fails | Not caused by ESPHome WiFi management. |
| ESP8266 → Bridge | Explicit zero-key peer config | Breaks RX | Zero key is treated as encrypted, not as "no encryption". |

---

## 4. Core Symptom Pattern

The final reduced symptom matrix is:

| Capability | Status |
|------------|--------|
| ESP8266 broadcast TX | Working |
| ESP8266 unicast TX | Broken |
| ESP8266 RX from bridge | Working |
| ESP8266 RX from relay | Working |
| Bridge ESP-NOW RX from ESP8266 broadcast | Working |
| Bridge ESP-NOW RX from ESP8266 unicast | Broken |
| Bridge promiscuous capture of ESP8266 unicast | Not observed |
| Relay unicast target from ESP8266 | Broken |
| Standalone Arduino reproduction | Confirmed |

This asymmetry matters. It rules out a large class of protocol-level and application-level explanations.

---

## 5. Investigation Timeline / Experiment Matrix

### 5.1 Protocol Correctness Fixes

These fixes were required to make the protocol payload valid. They were important but did **not** solve ESP8266 unicast TX.

| Item | Before | After | Result |
|------|--------|-------|--------|
| `protocol_version` | `1` | `3` / `ESPNOW_PROTOCOL_VER` | Required for bridge acceptance. |
| `packet_type` | `0x06` / COMMAND | `0x02` / `PKT_JOIN` | Required for JOIN. |
| JOIN payload length | Header only / 17 bytes | Header + `espnow_join_t` / 68 bytes | Required for valid JOIN. |
| PSK tag | Missing | `espnow_crypto_psk_tag()` added | Required for authenticated protocol. |
| JOIN fields | Incomplete | `hops_to_bridge`, `dirty_count`, `session_flags` set | Required for correct protocol semantics. |

**Conclusion:** Payload correctness was necessary for broadcast JOIN/schema success, but payload correctness did not make ESP8266 unicast work.

---

### 5.2 Send Path Experiments

| Test | Detail | Result |
|------|--------|--------|
| Use `esp_now_send` instead of raw early-return path | Removed ESP8266 raw send early return and used SDK send path | Unicast still failed. |
| Broadcast only JOIN | Forced JOIN as broadcast | JOIN_ACK received, but subsequent schema path still exposed unicast failure. |
| Broadcast all frames | Forced all `send_frame_()` sends to `FF:FF:FF:FF:FF:FF` | Full join flow works. |
| Restore unicast for testing | Reverted broadcast workaround for diagnostic tests | Unicast failure reproduced. |

**Conclusion:** The working behaviour is specifically tied to ESP8266 broadcast transmission. Unicast remains broken even after the bridge knows the peer and session exists.

---

### 5.3 MAC / Peer Configuration Experiments

| Test | Detail | Result |
|------|--------|--------|
| Peer channel `0` | Let ESP8266 SDK use current channel | No improvement. |
| Peer channel `11` | Explicit channel matching bridge | No improvement. |
| Peer channel SDK default | Re-tested default add-peer behaviour | No improvement. |
| Add peer before unicast | Explicit peer registration before send | No improvement. |
| `sta_mac_` alignment | Set protocol local MAC to STA/source MAC (`ECFA` → `EEFA`) | Required for correct identity/session alignment. |
| Bridge/relay target swap | Tested bridge and relay destination MACs | Both failed as unicast targets. |

#### MAC Alignment Finding

In AP/STA mode, the ESP8266 source MAC used on-air for ESP-NOW was not the AP MAC initially assumed by the protocol identity. The observed/needed MAC was the STA-style MAC with bit 1 flipped:

```text
AP-style MAC:  EC:FA:BC:63:17:00
STA/source MAC: EE:FA:BC:63:17:00
```

Aligning `sta_mac_` / `leaf_mac` with the actual ESP-NOW source MAC was necessary so the bridge session and peer identity matched the radio source.

**Conclusion:** MAC identity alignment fixed protocol/session correctness but did not fix ESP8266 unicast TX.

---

### 5.4 WiFi Mode Experiments

| Mode / Setting | Result |
|----------------|--------|
| `WIFI_AP_STA` | Unicast failed. |
| `WIFI_STA` | Unicast failed. |
| `WIFI_AP` | Unicast failed. |
| `WiFi.setSleepMode(WIFI_NONE_SLEEP)` | Unicast failed. |
| `WiFi.forceSleepWake()` before send | Unicast failed. |
| `WiFi.setPhyMode(WIFI_PHY_MODE_11G)` | Unicast failed. |
| ESPHome WiFi component present | Unicast failed. |
| Standalone Arduino, no ESPHome WiFi lifecycle | Unicast failed. |

**Conclusion:** The issue is not explained by ESPHome radio management, AP beaconing, STA mode, AP_STA mode, power save, or basic PHY mode selection.

---

### 5.5 ESP-NOW Role Experiments

| ESP8266 Role | Result |
|--------------|--------|
| `ESP_NOW_ROLE_COMBO` | Unicast failed. |
| `ESP_NOW_ROLE_CONTROLLER` | Unicast failed. |
| `ESP_NOW_ROLE_SLAVE` | Unicast failed. |

**Conclusion:** ESP-NOW role selection does not explain the unicast failure.

---

### 5.6 Encryption / PMK / Key Configuration Experiments

This was explicitly tested because mismatched encryption settings can cause immediate packet drops.

| ESP8266 Peer Key Config | Meaning / SDK Behaviour | Result |
|-------------------------|-------------------------|--------|
| `esp_now_add_peer(mac, role, ch, nullptr, 0)` | No encryption | Correct setting; broadcast works; unicast still fails. |
| Explicit zeroed 16-byte key | Interpreted as encrypted with a zero key | Broke RX path; bridge unencrypted frames not received (`rx=0` style behaviour). |
| Bridge `peer.encrypt = false` | Explicit unencrypted peer | Correct bridge-side setting. |

Important finding:

> On ESP8266 Arduino ESP-NOW, `nullptr, 0` is the correct way to mean "unencrypted". A 16-byte zero key is **not** equivalent to no encryption; it causes the peer to expect encryption with a zero key.

**Conclusion:** The failure is not caused by encryption mismatch. The explicit zero-key test made things worse and was reverted.

---

### 5.7 802.11 Raw Frame / Format Experiments

Raw frame tests were used to check whether the issue could be bypassed by manually constructing 802.11 frames.

| Test | Detail | Result |
|------|--------|--------|
| FC bytes `88 08` | QoS/Data style attempt | No bridge receive. |
| FC bytes `08 88` | Data+Order style attempt | No bridge receive. |
| OUI type `0x04` | Initial type variant | No bridge receive. |
| OUI type `0x02` | ESP-IDF standard-ish variant | No bridge receive. |
| OUI type permutations | Tested `0x01`, `0x03`, `0x04`, `0x05`, `0x09` | No bridge receive. |
| Address 3/BSSID variants | Zero, sender, bridge modes | No bridge receive. |
| Duration variants | `0x0000`, `0x8000`, `0x0128` | No bridge receive. |
| Source MAC mode variants | Actual MAC vs zeros | No bridge receive. |
| Full permutation scan | 250 valid JOIN frames, PSK-tagged, protocol v3, 51-byte payload | Zero frames reached bridge ESP-NOW layer. |

**Interpretation:**  
The raw frame scan was broad enough that a simple 802.11 header/OUI-type mismatch is unlikely to be the full explanation. The failure is more consistent with malformed transmission at a lower level, driver/firmware rejection, missing/incorrect FCS, unsupported ESP8266 raw frame generation, or some C5 WiFi hardware/firmware receive filter interaction.

---

### 5.8 Promiscuous Mode Capture on Bridge

A promiscuous callback was added to the ESP32-C5 bridge using `esp_wifi_set_promiscuous(true)` and broad filtering. The intent was to determine whether ESP8266 unicast frames physically reached the C5 but were rejected above the WiFi layer.

#### Deployment Note

Initial OTA flashes via `./compile.sh espnow-bridge-c5 f` uploaded the binary but the new firmware did **not** take effect — the bridge continued running the old version (confirmed by absence of promiscuous init logs). Using `esphome run demos/espnow-bridge-c5.yml --device espnow-bridge-c5.local` instead triggered proper OTA partition validation and reboot.

#### Filter Configuration

| Filter | Result |
|--------|--------|
| `WIFI_PROMIS_FILTER_MASK_DATA` only | Zero frames captured — callback never fired |
| `WIFI_PROMIS_FILTER_MASK_ALL` | Frames captured from multiple devices |

The callback logged ALL frames with type info, then filtered for the Espressif OUI (`18:FE:34`) at bytes 25-27, with category `0x7F` at byte 24.

Observed:

| Observation | Meaning |
|-------------|---------|
| Promiscuous callback captured frames from other devices | Promiscuous mode itself was working. |
| Normal ESP-NOW callback received ESP8266 broadcast DISCOVER/JOIN | Broadcast path valid. |
| ESP8266 unicast frames did not appear in normal ESP-NOW callback | Expected from symptom. |
| ESP8266 unicast frames also did not appear in promiscuous callback | Strong evidence failure occurs below bridge ESP-NOW software layer. |
| ESP8266 TX callback reported `FAIL` | ESP8266 did not receive MAC-layer ACK. |

Important nuance:

- Broadcast frames may be consumed by the ESP-NOW path before promiscuous logging depending on filter/callback behaviour.
- The strongest point is not that broadcast did or did not appear in promiscuous logs.
- The strongest point is that unicast produced TX failure and was not visible to the bridge software stack at all.

**Conclusion:** ESP8266 unicast frames either are not transmitted as valid receivable 802.11 frames, or are dropped by ESP32-C5 WiFi hardware/firmware before normal or promiscuous callbacks. This places the issue below the bridge's ESP-NOW protocol handler.

---

### 5.10 ESP32 (Regular) Bridge Test

An ESP32 dev board was configured as a bridge (`esp_tree_bridge` component with promiscuous
mode, same as the C5 test) and deployed to the former `espnow-remote-prototype` device
(ESP32, board `esp32dev`, ESP-IDF framework).

| Test | Detail | Result |
|------|--------|--------|
| Bridge flashed via OTA | `esphome run` with device IP `10.1.1.142` | OTA completed, web server responsive |
| Bridge ESPNOW init with promiscuous | Same code as C5 | Bridge not responding to ESP8266 DISCOVER |
| ESP8266 discovery | Sweep across ch1-13 | No DISCOVER_ANNOUNCE received from ESP32 bridge |
| Bridge channel | Unknown (WiFi AP determines channel) | Likely mismatch with ESP8266 |

**Conclusion**: The ESP32 bridge did not respond to ESP8266 DISCOVER frames. This could be due to:
- WiFi channel mismatch between bridge's AP connection and ESP8266's sweep
- Promiscuous mode conflicting with ESPNOW init on regular ESP32
- OTA upload instability (timeouts at ~95%)

This test was inconclusive but suggests the ESP8266 unicast failure is not specific to the
C5 chip — any ESP32 family bridge may have similar issues with ESP8266 unicast.

A standalone Arduino firmware was created under `components/82xx_standalone/` to eliminate ESPHome as a variable.

Standalone firmware goals:

- No ESPHome lifecycle.
- No ESPHome WiFi management.
- No ESPHome component callbacks.
- Direct Arduino ESP8266 `esp_now_send` test.
- Same protocol structures/crypto where practical.
- Board LED switch and chip temperature/state-style test entities included for protocol exercise.

Standalone results:

| Test | Result |
|------|--------|
| Direct unicast `esp_now_send` to bridge | `TX CB status=FAIL`. |
| Direct unicast `esp_now_send` to relay | `TX CB status=FAIL`. |
| Direct broadcast `esp_now_send` | `TX CB status=SUCCESS`. |
| Broadcast DISCOVER/JOIN | Bridge responds. |
| Broadcast JOIN | JOIN_ACK received. |
| Broadcast SCHEMA/STATE | Bridge receives frames. |
| ACK path via relay | STATE_ACK observed via relay path. |

Standalone eliminated these hypotheses:

- ESPHome WiFi component interference.
- ESPHome channel scan/management interference.
- ESPHome AP beacon/lifecycle interference.
- ESPHome callback or component timing issue.
- ESPHome-specific build/configuration issue.

**Conclusion:** The ESP8266 unicast failure is reproducible outside ESPHome. It is an ESP8266 Arduino SDK / radio interoperability issue in this environment.

---

## 6. Root Cause Assessment

### 6.1 Confirmed Facts

The following are confirmed by testing:

1. ESP8266 broadcast ESP-NOW TX works.
2. ESP8266 unicast ESP-NOW TX fails to both bridge and relay.
3. ESP8266 RX works.
4. Bridge and relay TX to ESP8266 work.
5. ESPHome is not required to reproduce the failure.
6. The bridge receives and processes ESP8266 broadcast frames.
7. The bridge does not receive ESP8266 unicast frames through normal ESP-NOW callbacks.
8. Promiscuous capture did not show the ESP8266 unicast frames.
9. The ESP8266 TX callback reports failure for unicast, indicating no MAC-layer ACK.
10. Encryption mismatch was tested and ruled out.
11. Peer channel and ESP-NOW role changes did not fix unicast.
12. Raw frame generation/permutation did not produce a bridge-received frame.

### 6.2 Most Likely Root Cause

The most likely root cause is a defect or incompatibility in the ESP8266 Arduino SDK's ESP-NOW unicast transmit path when targeting ESP32-C5 / ESP-IDF receivers.

More precise wording:

> ESP8266 unicast transmission does not produce a valid receivable 802.11 frame at the ESP32-C5 radio/software boundary in this environment.

This may be due to one or more of:

- incorrect or missing FCS on the ESP8266 unicast path
- unsupported vendor action frame format
- invalid MAC header construction
- driver/firmware bug in ESP8266 unicast ESP-NOW
- C5 WiFi hardware/firmware filtering behaviour
- ACK timing or PHY compatibility issue
- raw frame generation limitations in `wifi_send_pkt_freedom`

### 6.3 What Is Not Proven

The FCS hypothesis is plausible, but not conclusively proven without an independent over-the-air capture from a third monitor-mode radio that includes or validates FCS.

Do **not** state as fact that FCS is definitely wrong. The correct conclusion is:

> The observed behaviour is consistent with a bad FCS or other PHY/MAC-level invalid frame, but the exact low-level defect remains unproven.

---

## 7. Eliminated Hypotheses

| Hypothesis | Status | Evidence |
|------------|--------|----------|
| ESPHome is interfering with WiFi | Eliminated | Standalone firmware reproduces unicast failure. |
| Bridge-specific issue | Eliminated | Unicast to relay also fails. |
| Peer not registered | Eliminated | Peer registration/channel changes did not help. |
| Wrong channel | Eliminated as primary cause | Channel `0`, channel `11`, and channel fix attempts did not restore unicast. |
| ESP-NOW role mismatch | Eliminated | COMBO/CONTROLLER/SLAVE all failed. |
| WiFi AP_STA mode issue | Eliminated | STA, AP, AP_STA all failed. |
| Power save issue | Eliminated as primary cause | Sleep disabled and wake calls did not help. |
| Encryption mismatch | Eliminated | `nullptr,0` confirmed correct; zero-key test broke RX. |
| Payload/protocol invalidity | Eliminated as primary cause | Same valid payload works over broadcast. |
| Simple OUI/header mismatch | Unlikely | 250 raw frame permutations failed. |
| ESP8266 cannot receive | Eliminated | JOIN_ACK/SCHEMA_REQUEST/STATE_ACK received. |
| Relay forwarding broken | Eliminated | Relay forwarded ACKs back to ESP8266. |

---

## 8. Working Mitigation

### 8.1 Force ESP8266 ESP-NOW TX to Broadcast

For ESP8266 builds, force the 802.11 destination passed to `esp_now_send()` to broadcast:

```cpp
static uint8_t bcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
const uint8_t *tx_mac = bcast;
int err = esp_now_send(const_cast<uint8_t *>(tx_mac),
                       const_cast<uint8_t *>(frame),
                       len);
```

This changes only the 802.11 destination used by the ESP8266 SDK. It does **not** change:

- protocol `leaf_mac`
- session identity
- packet counters
- schema hash
- PSK tag
- encrypted payload
- bridge-side session model
- relay routing based on protocol metadata

### 8.2 Required Companion Fixes

| Fix | Reason |
|-----|--------|
| Set ESP8266 protocol local MAC to actual ESP-NOW source MAC (`EEFA...`) | Bridge session identity must match radio sender. |
| Default `parent_link_rssi_ema_` to `-40` on ESP8266 | ESP8266 callback does not provide useful RSSI; `-127` caused endless topology refresh. |
| Keep peer key as `nullptr,0` | Correct unencrypted ESP8266 configuration. |
| Avoid explicit zero key | Causes encrypted peer expectation and breaks RX. |

### 8.3 Confirmed Result

With broadcast TX + MAC alignment + RSSI default fix:

```text
ESPNOW Join Complete to myhouse @ D0:CF:13:EB:81:28.
State: NORMAL.
Mode: Regular.
[TX HEARTBEAT] D0:CF:13:EB:81:28 (hops=0)
```

Bridge confirmed receipt:

```text
[RX HEARTBEAT] EEFABC631700 len=43 rssi=-58
```

---

## 9. Relay / Broadcast Impact Analysis

### 9.1 Can Relays Detect the Broadcast Destination?

At the ESP-NOW callback/protocol level, relays generally receive:

- sender/source MAC
- payload
- RSSI/metadata where available

They do **not** reliably receive the original 802.11 destination in the normal ESP-NOW callback. Therefore a broadcast-originated ESP8266 frame looks like any other upstream frame from the relay's protocol perspective.

### 9.2 Does Broadcast Cause a Packet Storm?

No, not in the current relay design.

The ESP8266 broadcasts once. Any relays that hear it may forward it upstream, but relay forwarding is upstream toward parent/bridge, not uncontrolled rebroadcast flooding.

Expected pattern:

```text
ESP8266 broadcast frame
  ├─ Bridge receives direct copy
  ├─ Relay A receives and forwards upstream
  └─ Relay B receives and forwards upstream
```

This creates linear duplication, not exponential mesh flooding.

### 9.3 Duplicate Handling at Bridge

| Frame Type | Duplicate Protection |
|------------|---------------------|
| JOIN | Same `remote_nonce` + `schema_hash` treated as retry; no duplicate session. |
| SCHEMA_PUSH | Fragment assembly bitmap ignores already-received fragments. |
| STATE | Fragment bitmap + `tx_counter` prevents duplicate processing. |
| HEARTBEAT | `tx_counter > last_seen_counter` style replay/duplicate rejection. |
| COMMAND_ACK / STATE_ACK | Counter/session matching. |

### 9.4 Traffic Amplification

For `N` relays in range, a single ESP8266 frame may produce up to `N + 1` bridge-visible copies.

For a low-rate ESP8266 sensor node:

| Traffic Type | Frequency | Amplification Impact |
|--------------|-----------|----------------------|
| DISCOVER/JOIN/SCHEMA | Join time only | Acceptable. |
| HEARTBEAT | e.g. every 30 seconds | Very low. |
| STATE | On change / sensor interval | Usually low. |

Example with two relays:

```text
1 heartbeat every 30s × 3 copies = 0.1 packets/sec
```

This is acceptable for low-throughput ESP8266 leaf nodes, but should be documented as a scaling consideration.

### 9.5 Potential Future Optimisation

If broadcast duplication becomes problematic, add a relay-visible routing hint for ESP8266 frames:

- unencrypted `parent_mac` or `intended_parent_mac` in clear header
- relays only forward if they are the selected parent
- retain PSK tag over clear header to prevent spoofed routing hints
- keep payload encrypted/session-authenticated as today

This was discussed but not implemented in the current fix.

---

## 10. Files / Code Areas Touched or Discussed

| File / Area | Purpose |
|-------------|---------|
| `components/espnow_82xx_remote/espnow_82xx_remote.cpp` | ESP8266 send path, peer add, broadcast workaround, MAC/channel handling. |
| `components/espnow_82xx_remote/espnow_82xx_remote.h` | Added/used join nonce and join attempt state fields during experiments. |
| `components/espnow_82xx_remote/remote_protocol.cpp` | RSSI default fix from `-127` to `-40` for ESP8266. |
| `components/82xx_standalone/` | Standalone Arduino diagnostic firmware proving issue outside ESPHome. |
| `components/esp_tree_bridge/esp_tree_bridge.cpp` | Promiscuous-mode capture experiments on C5 bridge. |
| `components/esp_tree_common/espnow_crypto.*` | PSK tag / payload correctness used in valid JOIN tests. |
| `docs/findings_8266_unicast.md` | This investigation record. |

---

## 11. Open Questions / Future Research

These are not required for the current working mitigation, but may be useful if attempting a true unicast fix.

### 11.1 Third-Radio Monitor Capture

Use a third ESP32 or WiFi adapter in monitor mode to capture ESP8266 unicast and broadcast frames over the air.

Goals:

- confirm whether unicast is physically transmitted
- compare broadcast vs unicast frame bytes
- inspect category/OUI/type/header fields
- determine whether FCS appears valid
- compare ESP8266 unicast against ESP32 unicast

### 11.2 Promiscuous Intercept / Inject Pipeline

A possible bridge-side workaround was proposed:

- run promiscuous sniffer alongside ESP-NOW
- parse ESP8266 vendor action frames directly
- inject payload into existing bridge ESP-NOW processing queue

Current blocker:

> ESP8266 unicast frames were not observed by the C5 promiscuous callback, so there is currently nothing to intercept.

This path is only viable if future monitor/capture work shows frames are present but filtered by the normal ESP-NOW callback.

### 11.3 Try Older / Alternative ESP8266 SDKs

Potential tests:

- older Arduino ESP8266 core versions
- NONOS SDK examples
- vendor SDK ESP-NOW examples
- different board definitions
- different flash/PHY calibration settings

### 11.4 Try Other ESP32 Receiver Families

The issue was observed against ESP32-C5 bridge and at least one relay target. It may be useful to test:

- ESP32 classic
- ESP32-S3
- ESP32-C3
- ESP32-C6
- ESP32-H2 if relevant

Goal:

- determine whether failure is C5-specific, ESP-IDF 5.5.x-specific, or general ESP8266 unicast TX incompatibility.

### 11.5 Parent-Filtered Broadcast Mode

If ESP8266 support is retained long-term, consider making broadcast mode an explicit compatibility mode:

```yaml
espnow_82xx:
  tx_mode: broadcast_compat
```

Possible refinements:

- relay-visible selected-parent MAC
- bridge duplicate counters
- diagnostic metric for duplicate copies
- warning when relay density is high

---

## 12. Final Conclusion

The investigation conclusively demonstrates that ESP8266 ESP-NOW unicast transmission is not reliable in the tested ESP8266 Arduino SDK / ESP32-C5 ESP-IDF environment.

The failure is reproducible:

- against bridge and relay destinations
- in ESPHome and standalone firmware
- across tested WiFi modes
- across tested ESP-NOW roles
- across peer channel settings
- with encryption mismatch ruled out
- with valid protocol payloads
- with raw frame attempts and broad frame-format permutations failing

The failure is directional:

- ESP8266 can receive unicast frames.
- ESP8266 can transmit broadcast frames.
- ESP8266 cannot transmit working unicast frames.

The most accurate technical conclusion is:

> ESP8266 unicast ESP-NOW TX does not produce a valid receivable frame for the ESP32-C5 bridge/relay path in this environment. The defect appears below the bridge's ESP-NOW software layer.

The confirmed working solution is:

> Force ESP8266 outbound ESP-NOW frames to broadcast, keep protocol identity/routing/session fields intact, align `leaf_mac` to the actual ESP-NOW source MAC, and apply the ESP8266 RSSI default fix to prevent rediscovery loops.

This workaround successfully reaches stable `NORMAL` state and allows JOIN, SCHEMA, STATE, ACK, and HEARTBEAT flows to operate.
