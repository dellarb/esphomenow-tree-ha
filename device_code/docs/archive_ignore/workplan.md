# ESP-NOW LR Code Review Workplan

_Source: `docs/code_review.md` — validated against source code Apr 2026_

---

## Phase 1 — Protocol Correctness (P0)

| ID | Finding | Status | Notes |
|----|---------|--------|-------|
| B01 | Double JOIN_ACK on schema cache hit | **fixed** | handle_join_() returns early after COMPLETE, no more duplicate SEND_STATE |
| B03 | state_received_count compared with >= allows duplicates | **fixed** | Track received indices in bitmask (state_received_mask) instead of raw count; duplicate STATE packets ignored |
| F04 | crypto_crypt guards on g_psk_set not session_key | **fixed** | Removed g_psk_set guard; crypt() returns int (-1 on error); all 11 call sites updated |
| S04 | crypto_crypt silently zeroes on unset PSK | **fixed** | crypt() now returns error code; callers handle failure instead of silent zeroing |

---

## Phase 2 — Security Hardening (P1)

| ID | Finding | Status | Notes |
|----|---------|--------|-------|
| S03 | fill_random_bytes rand() fallback on non-ESP builds | **fixed** | Non-ESP path now uses /dev/urandom (lazy-open static FILE*), falls back to rand() only if urandom unavailable |
| S02 | derive_psk_from_string uses HMAC(key=input,data=input) | **fixed** | Replaced HMAC(input,input) with HKDF-Extract then HKDF-Expand using fixed info label; document as "lower-security" no longer needed |
| B02 | Session tag recomputed instead of using parse_frame_() output | **fixed** | All 4 handler call sites now receive session_tag from parse_frame_() instead of recomputing as payload+payload_len |
| F02 | Session map grows unbounded | **fixed** | Added SESSION_CLEANUP_INTERVAL_MS (60s) in loop() that erases offline sessions when size > MAX_SESSIONS (128) |
| F01 | Single bridge command queue | **fixed** | Replaced single-command slot with std::deque<PendingCommand> supporting queued commands from multiple HA entities; retries per-command via COMMAND_MAX_RETRIES |
| S01 | PSK tag 4-byte birthday bound | **fixed** | Documented trade-off at primary PSK tag call site in send_encrypted_; noted for future protocol revision |

---

## Phase 3 — Performance + Spec Alignment (P2)

| ID | Finding | Status | Notes |
|----|---------|--------|-------|
| P04 | AES-256 key expansion on every block | **fixed** | Hoisted aes256_key_expand() out of aes256_encrypt_block() into aes256_ctr_crypt(); key now expanded once per crypt call instead of ~15x per packet |
| P01 | std::vector heap alloc per received frame | **fixed** | Replaced std::vector in espnow_crypto_psk_tag, espnow_crypto_session_tag, and hkdf_expand with fixed-size stack buffers (97 bytes max) |
| F03 | Fragment assembly timeouts not applied to pending_schema_assemblies | **fixed** | Added idle-path pruning of schema assemblies in session cleanup block (runs every 60s); previously only pruned during active session iteration |
| B05 | schema_push entity_index+1>=total_entities uint8 wrap | **fixed** | Split combined guard into separate total_entities==0 early-return and entity_index check; prevents uint8_t wrap in the index comparison |
| B04 | get_uptime_s() uses static local variable | **fixed** | Replaced static local boot_epoch_ms with class member boot_epoch_ms_; initialized once in init() |
| O02 | schema_request_retries starts at 1 instead of 0 | **fixed** | Changed both initializers from 1 to 0; loop uses `< 3` so retries now go 0→1→2 (3 total) matching intended retry count |
| O03 | STATE_RETRY spec/code mismatch (250ms vs 300ms) | **fixed** | Changed ESPNOW_LR_STATE_RETRY_INTERVAL_MS from 250ms to 300ms to match spec table 15.3; also aligns STATE and COMMAND retry at 300ms |
| O01 | Spec/code HEADER_LEN mismatch (12 vs 17 vs 13) | **fixed** | Renamed HEADER_LEN→HEADER_WITH_PSK_TAG_LEN(17), HEADER_CORE_LEN→12; aligns with spec; updated MAX_ENCRYPTED_PLAINTEXT to use new name |

---

## Phase 4 — Code Hygiene (P3)

| ID | Finding | Status | Notes |
|----|---------|--------|-------|
| R01 | BridgeFragmentAssembly / RemoteFragmentAssembly duplicated | **fixed** | Consolidated both identical structs into espnow_fragment_assembly_t in espnow_types.h; added type aliases in both protocol headers |
| R02 | BridgeEntitySchema / RemoteEntitySchema duplicated | **fixed** | Consolidated: defined espnow_entity_schema_t in espnow_types.h; added type aliases in both protocol headers |
| R03 | queue_log / flush_log_queue duplicated | **skip** | flush_log_queue has protocol-specific entity name lookup and MAC/color formatting; consolidation would require significant abstraction |
| R04 | is_encrypted_packet / is_valid_packet_type duplicated | **fixed** | Moved to espnow_types.h as static inline functions; removed duplicate static definitions from both protocol .cpp files |
| R05 | fill_random_bytes / fragment_message_tx_base duplicated | **fixed** | fill_random_bytes moved to espnow_crypto.h/cpp; fragment_message_tx_base moved to espnow_types.h as inline |
| R06 | schema_push_prefix_len() dead code | **fixed** | Removed dead function; schema_push_payload_len() is the sole implementation |
| R07 | Bridge stub handlers return false | **fixed** | Replaced handle_state_ack_, handle_deauth_, handle_schema_request_ stubs with log_dropped_() helper |
| R08 | SchemaPushView / parse_schema_push_payload split | **fixed** | Documented as intentional split — remote constructs (binary struct), bridge parses (SchemaPushView) |
| P02 | flush_log_queue uses strstr instead of enum flag | **fixed** | Replaced strstr pattern matching with espnow_log_state_t enum; switch/case in flush_log_queue for both bridge and remote |
| P03 | fragment_assemblies_reserved_bytes O(n) per fragment | **fixed** | Added running total members (schema_reserved_bytes_, state_reserved_bytes_, pending_command_reserved_bytes_); removed O(n) scan |
| F05 | Planned entity types not guarded | **fixed** | Added runtime guard in publish_all_entities_() to skip unimplemented types (CLIMATE, HUMIDIFIER, DEHUMIDIFIER, TIME, DATETIME) |
| S05 | bridge_nonce fixed per bridge uptime | **fixed** | Documented by-design comment at bridge_nonce_ init: nonce reuse safe due to PSK session key binding |
| O04 | DISCOVER multi-channel sweep unclear | **fixed** | Documented multi-channel sweep (1-13) and bridge channel config expectation at esp_wifi_set_channel call site |

---

## Summary

| Tier | Count | Fixed | Remaining |
|------|-------|-------|-----------|
| P0 | 4 | B01, B03, F04, S04 | — |
| P1 | 6 | S03, S02, B02, F02, F01, S01 | — |
| P2 | 8 | P04, P01, F03, B05, B04, O02, O03, O01 | — |
| P3 | 13 | R01, R02, R04, R05, R06, R07, R08, P02, P03, F05, S05, O04 | R03 (skip) |
| **Total** | **30** | **28** | **1 skip** |
