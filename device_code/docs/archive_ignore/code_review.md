**1. Functionality Gaps**

**Single bridge command queue** - BridgeProtocol holds only one set of pending*command*\* fields. If two HA entities on different leaves send commands in quick succession, the second command silently overwrites the first with no queuing, no notification, and no error. Multi-leaf deployments with commandable entities will silently drop commands under load.

**Session map grows unbounded** - sessions*is a std::map that is populated by ensure_session*() on every DISCOVER packet. Sessions are marked offline but never erased. A deployment running for weeks will accumulate every MAC that has ever broadcast a DISCOVER, including noise traffic or decommissioned nodes, slowly consuming heap.

**Fragment assembly timeouts not applied to pending_schema_assemblies** correctly - the bridge loop() does prune them by last_seen_ms, but pending_schema_assemblies entries are only created while schema exchange is in flight. If a node leaves mid-schema-exchange and never returns, the entry survives until the next DISCOVER (which clears the map). The defined ESPNOW_LR_FRAGMENT_ASSEMBLY_TIMEOUT_MS constant is never respected for schema assemblies in the idle path between sessions.

**espnow_crypto_crypt refuses to operate if g_psk_set == 0** - but g*psk_set only reflects whether the PSK key was successfully loaded, not whether the \_session key* passed in is valid. If espnow_crypto_init is called with a plain-text PSK that gets hashed (the non-hex path), g_psk_set is set to 1, but the espnow_crypto_crypt function still guards on g_psk_set even though it operates on the caller-supplied session_key argument, not g_psk. The guard is conceptually wrong - it should be removed or the API redesigned. The current behaviour silently writes zeros if g_psk_set is 0, which would corrupt encrypted frames silently rather than returning an error.

**Planned entity types not guarded** - The spec documents CLIMATE, HUMIDIFIER, DEHUMIDIFIER, TIME, DATETIME as "not yet implemented end to end". There is no static assertion, compile-time warning, or runtime guard if a remote registers one of these types. The bridge will receive schema for it, emit MQTT discovery for an unknown domain, and HA will likely reject it silently.

**2. Performance Issues**

**std::vector heap allocation on every received frame** - espnow_crypto_psk_tag, espnow_crypto_session_tag, and hkdf_expand each allocate std::vector&lt;uint8_t&gt; on the heap per call, which happens on every received frame. On ESP32 with a FreeRTOS heap this causes fragmentation over time, and the allocation latency adds to the ISR/callback processing time. These should use stack buffers since the sizes are fixed and small (11 + payload_len, max 250 bytes total).

**flush_log_queue() called every loop iteration** - the log queue is flushed in the main loop(), but uses string comparisons like strstr(pending*state_log_msg*, "JOINED") and strstr(..., "NORMAL") on every state transition log message. While not a hot path, it's an unnecessary pattern when an enum or flag would be cleaner and faster.

**fragment*assemblies_reserved_bytes*() iterates the entire assembly map** - this is called on every fragment received to check the per-session byte cap. For the configured maximum of 8 pending assemblies it's trivial, but it's O(n) on every incoming fragment rather than maintaining a running total.

**AES-256 key expansion on every block** - the custom aes256_ctr_crypt implementation calls aes256_key_expand() inside aes256_encrypt_block() on every 16-byte block. For a 225-byte max payload this means key expansion is performed ~15 times per packet. The round keys should be expanded once per espnow_crypto_crypt() call. This is a significant CPU waste on the ESP32-C3 which has no AES hardware acceleration available through this path (it uses mbedTLS for HMAC but the custom AES CTR implementation bypasses it).

**3. Bugs and Edge Cases**

**Double JOIN_ACK on schema cache hit** - In handle*join*(), when the schema cache matches (line ~500), the bridge sends JOIN*ACK(status=COMPLETE) via send_join_ack*(). The code then falls through and, if total_entities > 0, sends a second JOIN_ACK(status=SEND_STATE). The remote receives COMPLETE first, transitions to NORMAL and sends a HEARTBEAT, then receives SEND_STATE which is a protocol violation. This would cause the remote to re-enter STATE_SYNC from NORMAL state unexpectedly. The fix is to not fall through once COMPLETE is sent, or send SEND_STATE instead of COMPLETE initially and gate the final COMPLETE on state sync.

**Session tag passed as payload + payload_len** - In handle*join*() and other handlers, validate*session_packet*() is called as validate*session_packet*(session, header, payload, payload*len, payload + payload_len, plaintext). This passes the session tag as a pointer that has already had payload_len subtracted (in parse_frame*). The pointer arithmetic is correct _only if_ payload*len was already stripped of the session tag by parse_frame*. Looking at parse*frame*: it does reduce payload_len by ESPNOW_LR_SESSION_TAG_LEN and sets session_tag = frame + len - ESPNOW_LR_SESSION_TAG_LEN. But the handlers ignore the session_tag output from parse_frame_entirely and recompute it as payload + payload_len - which is the same thing, since payload = frame + sizeof(header) and payload_len is already trimmed. This is correct but fragile; if parse_frame_logic changes, these call sites will silently break. The discarded session_tag output parameter should be used.

**state_received_count compared against total_entities using >= but counts may mismatch** - if the remote sends the same entity STATE twice (e.g., due to retry after a lost ACK), state*received_count is incremented again and may reach total_entities prematurely, triggering send_join_complete*() before all entities have been received. The bridge should track _which_ entity indices have been received, not just a raw count.

**get_uptime_s() uses a static local variable initialised at first call** - if get_uptime_s() is called before the device has been running (or called from multiple contexts), the boot_epoch_ms static is captured at first call, which may not be the actual boot time. If loop() calls this early and millis() wraps (at ~49 days), the result underflows silently. A class member initialised in init() would be more reliable.

**schema_push.entity_index + 1 >= schema_push.total_entities terminates schema on wrong condition** - if total_entities is 0 (empty leaf), the check entity_index + 1 >= 0 wraps to entity_index + 1 >= 0 which for uint8_t is always true. The zero-entity case is handled earlier but only in the JOIN path, not if a malformed SCHEMA_PUSH with total_entities = 0 somehow arrives.

**4. Security**

**PSK tag is only 4 bytes (32 bits)** - per the spec this is explicitly accepted, but a birthday collision is achievable with ~65,000 crafted frames, giving an attacker relay forwarding capability. For the current scope this is a known trade-off, but it should be documented at the call site not just in the spec.

**derive_psk_from_string() uses HMAC-SHA256(input, input)** - when a plain-text PSK is provided (not 64 hex chars), the function computes HMAC-SHA256(key=input, data=input). Using the key and data as the same value is non-standard and weakens the KDF. A proper approach would be HKDF with a fixed salt and the string as IKM. More practically, since the hex path is recommended, this fallback should at minimum be documented as lower-security.

**fill_random_bytes falls back to rand() on non-ESP builds** - rand() without a seed is deterministic and produces the same sequence on every run in test environments. Nonces derived this way would completely break the security model in CI/simulation builds. It should use a cryptographic RNG even in test builds (e.g., /dev/urandom).

**espnow_crypto_crypt silently zeroes output on unset PSK** - instead of returning an error, it writes zeros to the output buffer. A caller that doesn't check the guard state will transmit a zero-padded plaintext, which is worse than failing loudly. The function should return a bool/int error code.

**Session keys are re-derived from the same bridge_nonce across all joins during a bridge uptime** - if a leaf repeatedly rejoins (e.g., due to packet loss), the session key only changes because the remote_nonce changes. The bridge_nonce is fixed until bridge reboot. This is by design per section 7, but it means a passive attacker who captures nonces can re-derive any session key for the current bridge lifetime if they know the PSK.

**5. Redundant Functions, Classes, or Variables**

**BridgeFragmentAssembly and RemoteFragmentAssembly are identical structs** - they have the same fields, the same types, and the same semantics, defined separately in bridge*protocol.h and remote_protocol.h. The only difference is the type alias used in the map. Both could be a single espnow_fragment_assembly_t in espnow_types.h, with the static helper functions (store_fragment*, fragment*assembly_complete*, assemble*fragment_payload*, etc.) shared via the common component. Currently these ~100 lines of fragment logic are duplicated verbatim across both .cpp files.

**BridgeEntitySchema and RemoteEntitySchema are identical** - both contain entity_index, entity_type, entity_name, entity_unit, entity_options. Same consolidation applies.

**queue*log* and flush_log_queue() are duplicated** - the entire logging infrastructure (ring buffer, PacketLogEntry, queue*log*, flush*log_queue(), queue_state_log*()) is copied verbatim into both bridge_protocol.cpp and remote_protocol.cpp. This should live in the common layer.

**is_encrypted_packet() and is_valid_packet_type() are duplicated** - identical free functions in both bridge_protocol.cpp and remote_protocol.cpp anonymous namespaces.

**fill*random_bytes() and fragment_message_tx_base*() are duplicated** - same pattern.

**schema_push_prefix_len() and schema_push_payload_len() in espnow_types.h are identical** - both return sizeof(espnow_schema_push_t). One of them is dead code.

**handle*state_ack*, handle*command*, handle*deauth*, handle*schema_request* on the bridge return false unconditionally** - these are declared as handler methods but are stubs that will never be called in a valid protocol flow on the bridge side. They should either be removed from the dispatch table or replaced with a single logged-drop function to make the intent explicit.

**SchemaPushView** struct is defined in espnow_types.h and used in the remote but has a corresponding parse_schema_push_payload() that is only called from the bridge side. The remote processes schema via the fragment assembly path and never calls this helper. It is either dead on the remote or represents missing schema validation.

**6. Other**

**Spec/code constant mismatch** - ESPNOW*LR_HEADER_LEN is defined as 17 in espnow_types.h but the spec (section 18) says ESPNOW_LR_HEADER_LEN = 12. The spec footnote says "bytes 1-12 (excludes hop_count at byte 0)", which is the \_core* header without PSK tag, but the struct including PSK tag is 17 bytes. The constant ESPNOW_LR_HEADER_CORE_LEN = 13 in code is also inconsistent with the spec's stated 12. This naming confusion between core header and full-header-with-PSK-tag will cause confusion for anyone extending the code.

**schema_request_retries starts at 1 instead of 0 on first request** - in handle*join*(), the first schema request is set with session.schema_request_retries = 1. This means the retry loop in loop() uses < 3 as the limit, giving only 2 additional retries instead of 3, mismatching ESPNOW_LR_SCHEMA_REQ_RETRIES = 3.

**STATE_RETRY_INTERVAL_MS constant in spec is 250ms, but code defines ESPNOW_LR_COMMAND_RETRY_INTERVAL_MS as 250 in espnow_types.h and spec table 15.3 lists STATE retry as 300ms** - small mismatch; the code and spec are inconsistent and should be reconciled.

**DISCOVER multi-channel sweep** - the spec describes DISCOVER as broadcast on "all channels" with 5 retries per channel, but the remote's channel sweep logic uses channel*index* without any list of configured channels to sweep. Without knowing what channels are populated in the ESPHome YAML, it's unclear whether all relevant channels are actually tried or only the current WiFi channel of the bridge.

---

## Implementation Tracker

_Validated against source code Apr 2026. 4 findings removed from original review: (1) "No TEXT_SENSOR domain mapping" — inaccurate, component_for_type() handles it; (2) "ENTITY_VALUE_LEN never referenced" — inaccurate, 30+ references exist; (3-4) Secrets-related findings excluded per project decision._

| ID | Finding | S | Pri | Status | Files | Fix Approach | Owner |
|----|---------|---|-----|--------|-------|-------------|-------|
| F01 | Single bridge command queue | 1 | P1 | open | bridge_protocol.h/cpp | Add std::deque of pending commands, process sequentially | |
| F02 | Session map grows unbounded | 1 | P1 | open | bridge_protocol.h/cpp | Add max-session cap + erase offline sessions in loop() | |
| F03 | Fragment assembly timeouts for schema | 1 | P2 | open | bridge_protocol.cpp | Apply FRAGMENT_ASSEMBLY_TIMEOUT_MS cleanup in loop() regardless of session state | |
| F04 | crypto_crypt guards on g_psk_set not session_key | 1 | P1 | open | espnow_crypto.cpp | Remove g_psk_set guard from crypt(), or make it return error code | |
| F05 | Planned entity types not guarded | 1 | P3 | **fixed** | bridge_protocol.cpp | Guard added in publish_all_entities_() to skip CLIMATE, HUMIDIFIER, DEHUMIDIFIER, TIME, DATETIME | |
| P01 | std::vector heap alloc per frame | 2 | P2 | open | espnow_crypto.cpp | Replace 3 std::vector allocs with stack uint8_t[] buffers (max 261 bytes) | |
| P02 | flush_log_queue strstr pattern | 2 | P3 | **fixed** | espnow_types.h, bridge_protocol.h/cpp, remote_protocol.h/cpp | espnow_log_state_t enum replaces strstr; switch/case in flush_log_queue | |
| P03 | fragment_assemblies_reserved_bytes O(n) | 2 | P3 | **fixed** | bridge_protocol.h/cpp, remote_protocol.h/cpp | Running total members (schema/state_reserved_bytes_, pending_command_reserved_bytes_); O(n) scan removed | |
| P04 | AES-256 key expansion per block | 2 | P2 | open | espnow_crypto.cpp | Hoist aes256_key_expand() out of aes256_encrypt_block(), expand once in aes256_ctr_crypt() | |
| B01 | Double JOIN_ACK on schema cache hit | 3 | P0 | open | bridge_protocol.cpp | Add early return after sending COMPLETE, or send SEND_STATE instead and defer COMPLETE | |
| B02 | Session tag recomputed as payload+payload_len | 3 | P1 | open | bridge_protocol.cpp, remote_protocol.cpp | Use session_tag output from parse_frame_() instead of recomputing | |
| B03 | state_received_count duplicates | 3 | P0 | open | bridge_protocol.cpp | Track received entity indices in bitmask instead of raw count | |
| B04 | get_uptime_s() static local | 3 | P2 | open | remote_protocol.cpp | Move boot_epoch_ms to class member, initialise in init() | |
| B05 | schema_push entity_index+1>=total_entities uint8 wrap | 3 | P2 | open | bridge_protocol.cpp | Add explicit total_entities==0 guard in handle_schema_push_() | |
| S01 | PSK tag 4-byte birthday bound | 4 | P1 | open | espnow_types.h, espnow_crypto.cpp | Document trade-off at call site; consider 8-byte tag in future protocol ver | |
| S02 | derive_psk_from_string HMAC(key=input,data=input) | 4 | P1 | open | espnow_crypto.cpp | Switch to HKDF(salt=fixed, ikm=input), or document as lower-security fallback | |
| S03 | fill_random_bytes rand() fallback | 4 | P1 | open | espnow_crypto.cpp | Use /dev/urandom or std::random_device on non-ESP builds | |
| S04 | crypto_crypt silently zeroes on unset PSK | 4 | P1 | open | espnow_crypto.cpp | Change return type to int, return -1 on unset PSK; audit callers | |
| S05 | bridge_nonce fixed per uptime | 4 | P3 | **fixed** | bridge_protocol.cpp | Documented by-design comment at bridge_nonce_ init: nonce reuse safe due to PSK session key binding | |
| R01 | BridgeFragmentAssembly/RemoteFragmentAssembly dup | 5 | P3 | **fixed** | bridge_protocol.h, remote_protocol.h, espnow_types.h | Consolidated both identical structs into espnow_fragment_assembly_t in espnow_types.h; type aliases in both protocol headers | |
| R02 | BridgeEntitySchema/RemoteEntitySchema dup | 5 | P3 | **fixed** | bridge_protocol.h, remote_protocol.h, espnow_types.h | Defined espnow_entity_schema_t in espnow_types.h; type aliases in both protocol headers | |
| R03 | queue_log/flush_log_queue duplicated | 5 | P3 | **skip** | bridge_protocol.cpp, remote_protocol.cpp | flush_log_queue has protocol-specific entity name lookup and MAC/color formatting; consolidation requires significant abstraction | |
| R04 | is_encrypted_packet/is_valid_packet_type dup | 5 | P3 | **fixed** | espnow_types.h, bridge_protocol.cpp, remote_protocol.cpp | Moved to espnow_types.h as static inline; removed duplicate static definitions | |
| R05 | fill_random_bytes/fragment_message_tx_base dup | 5 | P3 | **fixed** | espnow_crypto.h/cpp, espnow_types.h, bridge_protocol.cpp, remote_protocol.cpp | fill_random_bytes in crypto; fragment_message_tx_base in types as inline | |
| R06 | schema_push_prefix_len dead code | 5 | P3 | **fixed** | espnow_types.h | Removed dead function; schema_push_payload_len() is sole implementation | |
| R07 | Bridge stub handlers return false | 5 | P3 | **fixed** | bridge_protocol.h/cpp | handle_state_ack_, handle_deauth_, handle_schema_request_ replaced with log_dropped_() helper | |
| R08 | SchemaPushView/parse_schema_push_payload split | 5 | P3 | **fixed** | espnow_types.h, remote_protocol.cpp | Documented as intentional: remote constructs binary, bridge parses SchemaPushView | |
| O01 | Spec/code HEADER_LEN mismatch | 6 | P2 | open | espnow_types.h, spec | Align spec and code: rename to HEADER_WITH_PSK_TAG_LEN or update spec | |
| O02 | schema_request_retries off-by-one | 6 | P2 | open | bridge_protocol.cpp | Change initial value from 1 to 0 in handle_join_() and handle_schema_push_() | |
| O03 | STATE_RETRY spec/code mismatch | 6 | P2 | open | espnow_types.h, spec | Reconcile: code says 250ms, spec says 300ms for STATE retry | |
| O04 | DISCOVER multi-channel sweep unclear | 6 | P3 | **fixed** | remote_protocol.cpp | Documented multi-channel sweep (WiFi 1-13) and bridge channel config expectation at wifi_set_channel call | |

### Suggested Implementation Order

**Phase 1 — Protocol correctness (P0)**
- B01 → B03 → F04/S04 (these interact: fix crypto error returns first, then protocol flow bugs)

**Phase 2 — Security hardening (P1)**
- S03 → S02 → S04 → B02 → F02 → F01 → S01

**Phase 3 — Performance + spec alignment (P2)**
- P04 → P01 → F03 → B05 → B04 → O02 → O03 → O01

**Phase 4 — Code hygiene (P3)**
- ~~R01+R02~~ ✅ (consolidate structs) → ~~R03~~ ⛔ (skip — protocol-specific) → R04+R05 ✅ → R06+R07 ✅ → P02+P03 ✅ → F05 ✅ → S05 ✅ → O04 ✅
