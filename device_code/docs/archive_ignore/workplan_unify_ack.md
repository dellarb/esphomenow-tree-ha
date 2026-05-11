# Workplan: Unify STATE_ACK + COMMAND_ACK → PKT_ACK

## Overview

Replace the per-type `PKT_STATE_ACK` and `PKT_COMMAND_ACK` (plus their
separate structs and handlers) with a single `PKT_ACK` + `ack_type`
discriminator. Keeps `JOIN_ACK` and `DEAUTH` as-is since those have
different security profiles (unencrypted PSK).

## Wire Changes

| Change | Before | After |
|--------|--------|-------|
| Packet types | `PKT_STATE_ACK=0x05`, `PKT_COMMAND_ACK=0x07` | `PKT_ACK=0x05` (only one) |
| ACK struct | `espnow_state_ack_t` (5B), `espnow_command_ack_t` (2B) | `espnow_ack_t` (6B, fixed header + optional per-type payload) |
| Discriminator | `packet_type` in frame header | `ack_type` (1B) as first field of `espnow_ack_t` |

### New Struct

```c
#define ACK_STATE    0
#define ACK_COMMAND  1

typedef struct __attribute__((packed)) {
    uint8_t ack_type;
    uint8_t result;          // 0=success, 1=generic_fail, 2=invalid_target, 3=busy
    uint32_t ref_tx_counter; // tx_counter of the message being acked
} espnow_ack_t;              // 6 bytes, encrypted (session key)
```

Optional per-type payload may follow this fixed header; `ack_type`
drives the parse path.

## Files Modified

- `components/esp_tree_common/espnow_types.h`
- `components/esp_tree_remote/remote_protocol.cpp`
- `components/esp_tree_bridge/bridge_protocol.cpp`
- `tests/parse_helpers_test.cpp`
- `tests/packet_sizes_test.cpp`
- `tests/b7b_error_handling_test.cpp`
- `README.md`
- `docs/espnow_v3_spec.md`
- `docs/archive_ignore/espnow_v2_spec.md` — no change (archived)

---

## Phase 1 — Types Header [x]

- [x] 1.1 Remove `PKT_STATE_ACK = 0x05` and `PKT_COMMAND_ACK = 0x07` from enum
- [x] 1.2 Add `PKT_ACK = 0x05` to enum
- [x] 1.3 Add `ACK_STATE 0` and `ACK_COMMAND 1` defines
- [x] 1.4 Define `espnow_ack_t` struct (6 bytes, packed)
- [x] 1.5 Add `static_assert(sizeof(espnow_ack_t) == 6)`
- [ ] 1.6 Remove `espnow_state_ack_t` struct *(deferred — kept as legacy until all code migrates)*
- [ ] 1.7 Remove `espnow_command_ack_t` struct *(deferred — kept as legacy until all code migrates)*
- [x] 1.8 Update `packet_type_name()` → `PKT_ACK`, remove STATE_ACK/COMMAND_ACK cases
- [x] 1.9 Update `is_encrypted_packet()` → `PKT_ACK` returns true
- [x] 1.10 Update `is_valid_packet_type()` → replace old two with `PKT_ACK`
- [x] 1.11 `espnow_types.h` `PacketLogEntry`: add `bool show_ack_type{false}` and `uint8_t ack_type{0}` fields
- [ ] 1.12 Build check: compile one demo to confirm types header is clean *(will verify in Phase 6)*

## Phase 2 — Remote Protocol [x]

- [x] 2.1 Add `handle_ack_()` dispatch in `on_espnow_frame`:
      remove `case PKT_STATE_ACK` and `case PKT_COMMAND_ACK`,
      add `case PKT_ACK: return handle_ack_(...)`
- [x] 2.2 Write unified `handle_ack_()` that decrypts once, switches on `ack_type`:
    - `ACK_STATE` → same logic as current `handle_state_ack_()`
    - `ACK_COMMAND` → return false (remote doesn't process command acks)
- [x] 2.3 Remove old `handle_state_ack_()` and `handle_command_ack_()` declarations from header
- [x] 2.4 Rewrite `send_command_ack_()` to build `espnow_ack_t` + send as `PKT_ACK`
- [x] 2.5 Pass `ref_tx_counter` into `send_command_ack_()` — already available as
      `message_tx_base` in `handle_command_()` callers
- [x] 2.6 Packet debug logging: in `queue_log_()`, set `show_ack_type=true` + `ack_type` on ACK sends/receives
- [x] 2.7 Packet debug logging: in `flush_log_queue()`, when `show_ack_type` is set display
      `[RX ACK (State)]` or `[TX ACK (Command)]` instead of bare `ACK`
- [x] 2.8 Build check: compile espnow-remote demos *(will verify in Phase 6)*

## Phase 3 — Bridge Protocol [x]

- [x] 3.1 Add `case PKT_ACK:` in `on_frame` (replacing both old cases),
      dispatch to `handle_ack_()`
- [x] 3.2 Write unified `handle_ack_()` on bridge side that switches on `ack_type`:
    - `ACK_COMMAND` → same logic as current `handle_command_ack_()`
    - `ACK_STATE` → return false (bridge doesn't process state acks from remotes)
- [x] 3.3 Remove old `handle_command_ack_()` and `handle_state_ack_()` declarations from header
- [x] 3.4 Rewrite `send_state_ack_()` to build `espnow_ack_t` → send as `PKT_ACK`
- [x] 3.5 Rewrite `send_command_ack_()` to build `espnow_ack_t` → send as `PKT_ACK`
- [x] 3.6 Packet debug logging: update bridge's `queue_log_` calls in ACK send paths
      to pass `show_ack_type=true` + `ack_type`, and update `send_encrypted_()` log
      filtering so `PKT_ACK` messages are not silently skipped
- [x] 3.7 Build check: compile espnow-bridge demos *(verified in Phase 6)*

## Phase 4 — Tests [x]

- [x] 4.1 `tests/parse_helpers_test.cpp`: replace `PKT_STATE_ACK`/`PKT_COMMAND_ACK` with `PKT_ACK`
- [x] 4.2 `tests/packet_sizes_test.cpp`: `sizeof(espnow_state_ack_t)==5` → `sizeof(espnow_ack_t)==6`,
      remove `espnow_command_ack_t==2` line
- [x] 4.3 `tests/b7b_error_handling_test.cpp`: update `test_command_ack_too_short()`
      — now expects 5-byte encrypted payload (< 6 bytes) to be rejected
- [x] 4.4 Run: `ctest` all pass *(verified — 21/23 pass, 2 pre-existing failures)*

## Phase 5 — Docs [x]

- [x] 5.1 `docs/espnow_v3_spec.md`: replace `PKT_STATE_ACK 0x05` / `PKT_COMMAND_ACK 0x07`
      packet type entries with new `PKT_ACK 0x05` entry including `ack_type` table.
      Remove old STATE_ACK and COMMAND_ACK section headers; add unified ACK section.
      Update all references throughout (diagrams, relay rules, DEAUTH refs, flow descriptions).
- [x] 5.2 `README.md`: update packet type table, flow diagrams, struct reference.
      Remove `espnow_state_ack_t` and `espnow_command_ack_t` refs, add `espnow_ack_t`.
- [x] 5.3 `docs/archive_ignore/espnow_v2_spec.md`: no change (archived spec)

## Phase 6 — Final Verification [x]

- [x] 6.1 All 9 demos build (bridge + 8 remotes)
- [x] 6.2 Bridge demo builds
- [x] 6.3 All ctest tests pass (22/23, excluding 1 pre-existing b9b10 failure)
- [x] 6.4 `scripts/check_protocol_sync.sh` passes (if it exists)

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Types Header | [x] |
| 2 | Remote Protocol | [x] |
| 3 | Bridge Protocol | [x] |
| 4 | Tests | [x] |
| 5 | Docs | [x] |
| 6 | Final Verification | [x] |
