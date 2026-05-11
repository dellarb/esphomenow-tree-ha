# OTA Blast-then-Gaps Architecture Roadmap

## Overview

This document specifies the design for replacing the current sliding-window OTA file transfer protocol with a blast-then-gaps-with-increments protocol. The design was reached through a structured grill-me session resolving all major decision branches.

### Core Idea

1. **Blast**: Bridge sends all chunks for one increment (≤32KB) as fast as possible, with no per-chunk ACKs.
2. **BLAST_COMPLETE**: Bridge signals end of increment blast.
3. **GAPS**: Remote checks which chunks it received (bitmap), responds with missing chunks or an all-clear.
4. **Retransmit**: Bridge retransmits only missing chunks, then another BLAST_COMPLETE. Up to 10 rounds per increment.
5. **Flash write**: Remote writes a complete increment to flash via `esp_ota_write()` and sends all-clear.
6. **Advance**: Bridge starts next increment.
7. **END**: After all increments, bridge sends END. Remote verifies MD5 and reboots.

---

## Design Decisions (Final)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Flash write strategy | `esp_ota_begin()` + `esp_ota_write()` per increment (sequential writes) |
| Q2 | NOR flash double-write | Eliminated — increments are written atomically after all chunks received |
| Q3 | Increment buffering | Remote holds one increment (≤32KB) in RAM, writes to flash when complete |
| Q4 | Data header format | `uint32_t sequence` only (4 bytes). Derive increment/chunk-in-increment from sequence. Payload = 221 bytes |
| Q5 | Increment size | Negotiated: remote advertises `buffer_size_kb` in ACCEPT (based on actual free heap). Bridge picks `min(bridge_preference, remote_buffer)` |
| Q6 | ANNOUNCE carries | `file_size`, `md5`, `chunk_size`, `action`, `file_id` only. `window_size` removed |
| Q7 | ACCEPT carries | `chunk_size(2)` + `buffer_size_kb(1)` + `action(1)` = 4 bytes trailing |
| Q8 | Blast end signal | `ESPNOW_LR_FILE_PHASE_BLAST_COMPLETE (0x03)` — new phase byte with `increment_index` (uint16_t) |
| Q9 | Per-increment sync | Bridge sends BLAST_COMPLETE per increment. Remote responds with GAPS |
| Q10 | Remote flow control | GAPS ACK with empty bitmap = all received, flash write done, ready for next increment |
| Q11 | GAPS bitmap meaning | bit=1 means received. Bridge inverts to find gaps |
| Q12 | Bitmap byte order | LSB-first within each byte. bit 0 of byte 0 = chunk 0 in increment |
| Q13 | Increment identity | `increment_index` (uint16_t) in BLAST_COMPLETE; GAPS ACK correlates via `ref_tx_counter`; transfers >1GB rejected at ANNOUNCE |
| Q14 | Last increment handling | Both sides compute `chunks_in_last`. Partial increment. END after final all-clear |
| Q15 | Flash write failure | Retry once, then ABORT with FLASH_ERROR |
| Q16 | MD5 verification | Progressive MD5 via `md5_update()` as each increment is written to flash |
| Q17 | Relay transparency | Increment logic is endpoint-to-endpoint. Relay just forwards packets |
| Q18 | Source data flow | Stream from HTTP source (browser/CLI) via `/api/ota/chunk` per-increment |
| Q19 | Blast pacing | Adaptive based on `ESP_ERR_NO_MEM` backoff (same as current) |
| Q20 | ACK packet type | Reuse PKT_ACK with result code `0x05` (GAPS). Empty bitmap = INCREMENT_COMPLETE |
| Q21 | Timeouts | BLAST_COMPLETE ACK: 1000ms. Max BLAST_COMPLETE retries: 5 per increment. Max retransmit rounds: 10 per increment. 10s radio silence → ABORT. Global: 900s |
| Q22 | Exhausted retransmits | ABORT entire transfer |
| Q23 | HTTP chunk interface | Bridge requests per-increment sequences via `/api/ota/status`, browser delivers via `/api/ota/chunk` |
| Q24 | Blast-HTTP coupling | Bridge blasts as HTTP chunks arrive (stream) |
| Q25 | Protocol coexistence | Hard replace — remove old sliding-window protocol entirely |
| Q26 | ACCEPT negotiation | Remote sends `buffer_size_kb`. Bridge derives `increment_data_size` and `chunks_per_increment` |
| Q27 | Co-existence | None — hard replace of old protocol |

---

## Protocol Changes

### `espnow_types.h` Changes

#### New Constants

```c
#define ESPNOW_LR_FILE_PHASE_BLAST_COMPLETE 0x03
#define ESPNOW_LR_FILE_ACK_GAPS 0x05
#define ESPNOW_LR_BLAST_COMPLETE_TIMEOUT_MS 1000
#define ESPNOW_LR_MAX_BLAST_COMPLETE_RETRIES 5
#define ESPNOW_LR_MAX_RETRANSMIT_ROUNDS 10
#define ESPNOW_LR_RADIO_SILENCE_ABORT_MS 10000
```

#### Removed Constants

```c
// REMOVED:
#define ESPNOW_LR_FILE_DEFAULT_WINDOW_SIZE 32
#define ESPNOW_LR_FILE_ACK_INTERVAL 4
#define ESPNOW_LR_FILE_ACK_TIMEOUT_MS 3000
```

#### Modified Structs

**`espnow_file_announce_t`** — remove `window_size`, shrink from 37 to 36 bytes:

```c
typedef struct {
    uint8_t phase;          // 0x00
    uint32_t file_size;
    uint8_t md5[16];
    uint16_t chunk_size;    // bridge's proposed max chunk (derived from session max_frame_payload - overhead)
    uint8_t action;
    uint8_t file_id[12];
} espnow_file_announce_t;   // 36 bytes
```

**`espnow_file_data_header_t`** — remove `offset`, shrink from 8 to 4 bytes:

```c
typedef struct {
    uint32_t sequence;
} espnow_file_data_header_t;  // 4 bytes
```

**`espnow_file_blast_complete_t`** — new struct, 3 bytes:

```c
typedef struct {
    uint8_t phase;           // = ESPNOW_LR_FILE_PHASE_BLAST_COMPLETE (0x03)
    uint16_t increment_index; // 0-based, sufficient for files up to ~1GB at 32KB increments
} espnow_file_blast_complete_t;  // 3 bytes
```

The `increment_index` field (uint16_t) allows the remote to distinguish a retry BLAST_COMPLETE for the current increment from a stale retry of a previous increment. If a GAPS ACK (all-clear) was lost in transit, the bridge retries BLAST_COMPLETE. The remote checks `increment_index` against `current_increment_` — if it matches, re-send the all-clear; if it is for a previous increment, ignore or re-send the previous increment's all-clear.

The bridge rejects any transfer where `file_size > 1GB` at ANNOUNCE time, ensuring `increment_index` never wraps.

#### New ACCEPT Trailing Payload

When the remote sends ACCEPT (`ESPNOW_LR_FILE_ACK_ACCEPT`), the trailing bytes after `espnow_ack_t` are:

```
chunk_size(2 bytes, uint16_t) + buffer_size_kb(1 byte, uint8_t) + action(1 byte, uint8_t)
```

Total ACCEPT trailing = 4 bytes (was 3).

#### Updated Overhead Constants

```c
#define ESPNOW_LR_FILE_DATA_HEADER_OVERHEAD \
  (ESPNOW_LR_HEADER_WITH_PSK_TAG_LEN + sizeof(espnow_file_data_header_t) + ESPNOW_LR_SESSION_TAG_LEN)
  // = 17 + 4 + 8 = 29

#define ESPNOW_LR_FILE_DEFAULT_CHUNK_SIZE \
  (ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE - ESPNOW_LR_FILE_DATA_HEADER_OVERHEAD)
  // = 250 - 29 = 221
```

The `static_assert` must be updated:

```c
static_assert(ESPNOW_LR_FILE_DEFAULT_CHUNK_SIZE == 221,
               "ESPNOW_LR_FILE_DEFAULT_CHUNK_SIZE must be 221 bytes");
```

#### GAPS ACK Bitmap Format

The GAPS ACK uses PKT_ACK with `ack_type = PKT_FILE_TRANSFER` and `result = ESPNOW_LR_FILE_ACK_GAPS (0x05)`.

**Packet layout:**

```
[espnow_ack_t (6 bytes)]        — universal ACK header (ack_type, result, ref_tx_counter)
[gaps trailing payload]:
  bitmap_length (2 bytes, uint16_t, little-endian)  — total bitmap bytes that follow
  bitmap_data   (bitmap_length bytes)                — LSB-first, bit 0 of byte 0 = chunk 0 in increment
```

The `espnow_ack_t` (6 bytes) is the universal ACK header shared across all ACK types — it is NOT part of the GAPS-specific trailing payload. The GAPS-specific trailing begins with `bitmap_length`.

- If `bitmap_length == 0`: INCREMENT_COMPLETE — no bitmap data follows. Remote has all chunks, wrote to flash, ready for next increment. Total GAPS ACK plaintext = 6 + 2 = 8 bytes.
- If `bitmap_length > 0`: bitmap indicates which chunks were received (bit=1 received, bit=0 missing). Bridge inverts to find gaps.

The bitmap covers `chunks_per_increment` chunks (or `chunks_in_last_increment` for the final increment). The bitmap length in bytes is `ceil(chunks_in_increment / 8)`.

At 221-byte chunks and 32KB increments: ~148 chunks per increment → 19-byte bitmap. This easily fits in one ACK packet (up to 225 bytes of encrypted plaintext available, minus 6 for ack header and 2 for length = 217 bytes for bitmap data, covering up to 1736 chunks).

For larger increments or if future chunk sizes shrink, the bitmap can be up to 217 bytes (1736 chunks) in a single packet. No fragmentation protocol is needed for reasonable increment sizes.

#### File ACK Result Codes (Updated)

| Constant | Value | Meaning |
|----------|-------|---------|
| `ESPNOW_LR_FILE_ACK_ACCEPT` | 0x00 | Remote accepts transfer |
| `ESPNOW_LR_FILE_ACK_REJECT` | 0x01 | Remote rejects transfer |
| `ESPNOW_LR_FILE_ACK_PROGRESS` | 0x02 | **REMOVED** — no longer used |
| `ESPNOW_LR_FILE_ACK_COMPLETE` | 0x03 | Transfer complete (after END) |
| `ESPNOW_LR_FILE_ACK_ABORT` | 0x04 | Transfer aborted |
| `ESPNOW_LR_FILE_ACK_GAPS` | 0x05 | Bitmap of received chunks (empty = INCREMENT_COMPLETE) |

---

## ACK Correlation Rules

Each ACK uses the `ref_tx_counter` field in `espnow_ack_t` to reference the specific packet it responds to. The bridge must validate `ref_tx_counter` to reject stale or misattributed ACKs.

| ACK Type | `ref_tx_counter` References | Bridge Validation |
|----------|----------------------------|-------------------|
| ACCEPT | tx_counter of the ANNOUNCE packet | Must match `announce_tx_counter_` |
| GAPS (bitmap or empty) | tx_counter of the BLAST_COMPLETE packet | Must match `last_blast_complete_tx_counter_` for the current increment |
| COMPLETE | tx_counter of the END packet | Must match `end_tx_counter_` |
| ABORT | tx_counter of the triggering packet | Must match the relevant trigger |

### GAPS ACK Correlation Detail

When the bridge sends BLAST_COMPLETE, it records the tx_counter as `last_blast_complete_tx_counter_`. If BLAST_COMPLETE is retried (timeout, no GAPS ACK), each retry has a new tx_counter. The bridge updates `last_blast_complete_tx_counter_` to the most recent attempt.

When a GAPS ACK arrives, the bridge checks `ref_tx_counter`:
- If it matches `last_blast_complete_tx_counter_` — accept (response to latest attempt).
- If it matches a previous BLAST_COMPLETE attempt's tx_counter — also accept (response to an earlier attempt that was still in flight). The remote may have responded to the first attempt before receiving the retry.
- If it matches neither — ignore as stale.

The bridge must keep a small history of recent BLAST_COMPLETE tx_counters (at most `ESPNOW_LR_MAX_BLAST_COMPLETE_RETRIES + 1` = 6 entries) to handle this overlap.

### Lost All-Clear Scenario

If the remote's INCREMENT_COMPLETE (empty GAPS ACK) is lost in transit:
1. Bridge doesn't receive it, times out (1000ms), retries BLAST_COMPLETE for the same increment.
2. Remote receives the retry BLAST_COMPLETE, sees `increment_index` matches its already-completed increment.
3. Remote re-sends the INCREMENT_COMPLETE (empty GAPS ACK) with `ref_tx_counter` set to the retry's tx_counter.
4. Bridge receives the all-clear, advances to the next increment.

This is safe because the remote has already written the increment to flash — re-sending the all-clear is idempotent.

---

## Remote State Machine (`FileReceiver`)

```
IDLE → ANNOUNCED → RECEIVING → CHECKING → WRITING → RECEIVING → ... → WAITING_END → VERIFYING → COMPLETE → IDLE
                            ↑       │           │                  │
                            │       │           │                  │
                            └───────┘    (gaps found,        (next increment)
                                         retransmit round)
```

### States

**IDLE**
- No transfer active. All state reset.

**ANNOUNCED**
- Received ANNOUNCE packet. Validated file_size against partition size.
- If `file_size > 1GB` (1,073,741,824 bytes): REJECT with NO_SPACE.
- Called `esp_ota_begin()` (erases partition, opens sequential write handle).
- Initialized MD5 digest.
- Allocated `IncrementBuffer` based on negotiated `buffer_size_kb` (computed from `heap_caps_get_largest_free_block()` with safety margin — see Remote RAM Budget).
- Sent ACCEPT with `chunk_size`, `buffer_size_kb`, `action`.

**RECEIVING**
- Receiving FILE_DATA packets for current increment.
- Each chunk is validated (see Sequence Validation Rules below).
- If the bitmap bit for this chunk is already set (duplicate), silently ignore — do not increment `chunks_received_`, do not overwrite buffer data.
- If the bitmap bit is not set: store the chunk data in the increment buffer at `offset = chunk_in_increment * chunk_payload_size`, set the bitmap bit: `received_bitmap_[chunk_in_increment / 8] |= (1 << (chunk_in_increment % 8))`, increment `chunks_received_`.
- No ACKs sent during blast.

**CHECKING**
- Entered after BLAST_COMPLETE received with `increment_index` matching `current_increment_`.
- If `increment_index` does not match `current_increment_`: ignore the BLAST_COMPLETE (stale retry from previous increment) or re-send the all-clear if it matches a previously completed increment.
- Check bitmap: all chunks for current increment received (`chunks_received_ == chunks_expected`)?
  - **Yes**: transition to WRITING.
  - **No**: send GAPS ACK with the bitmap. Increment `retransmit_round_`. If `retransmit_round_ > 10`, ABORT. Otherwise transition back to RECEIVING.

**WRITING**
- Write the increment buffer to flash in slices of `chunk_payload_size` bytes, calling `delay(0)` between slices to yield to FreeRTOS and prevent WDT stalls:
  ```
  for each slice in increment buffer (chunk_payload_size bytes at a time, last slice may be shorter):
      esp_ota_write(ota_handle_, slice, slice_len)
      md5_update(slice, slice_len)
      delay(0)
  ```
- If any `esp_ota_write()` call fails, retry the entire increment write once (re-write from the start of the increment). If retry also fails, ABORT with FLASH_ERROR.
- Send GAPS ACK with empty bitmap (INCREMENT_COMPLETE).
- If this was the last increment, transition to WAITING_END.
- Otherwise, reset increment buffer for next increment, transition to RECEIVING.

**WAITING_END**
- Entered after the last increment is written and all-clear is sent.
- Waiting for END packet from bridge.
- FILE_DATA or BLAST_COMPLETE packets are ignored in this state (stale or from a previous transfer).
- On receiving END: transition to VERIFYING.
- Timeout: if no END received within a reasonable period, ABORT.

**VERIFYING**
- Entered only after END packet received from bridge in WAITING_END state.
- Finalize MD5: `md5_finish()` → compare with expected MD5 from ANNOUNCE.
- If MD5 mismatch: send COMPLETE ACK with result MD5_MISMATCH, ABORT.
- Call `esp_ota_end(ota_handle_)` (validates image header, checks partition).
- If `esp_ota_end` fails: send COMPLETE ACK with result FLASH_ERROR, ABORT.
- Call `esp_ota_set_boot_partition(update_partition_)`.
- Send COMPLETE ACK with result SUCCESS.
- Schedule reboot after 250ms.

### IncrementBuffer Structure

```cpp
struct IncrementBuffer {
    std::vector<uint8_t> data;            // pre-allocated to increment_data_size bytes
    std::vector<uint8_t> received_bitmap; // ceil(chunks / 8) bytes, LSB-first
    uint16_t chunks_received{0};
    uint16_t chunks_expected{0};           // chunks_per_increment (or fewer for last increment)
    uint8_t retransmit_round{0};
};
```

### Key Members (FileReceiver)

```cpp
const esp_partition_t *update_partition_{nullptr};
esp_ota_handle_t ota_handle_{0};
uint32_t file_size_{0};
uint8_t expected_md5_[16];
uint16_t chunk_payload_size_{0};        // negotiated chunk data size (221 for v1)
uint16_t buffer_size_kb_{0};            // remote's buffer budget from ACCEPT
uint16_t chunks_per_increment_{0};      // derived: floor(buffer_size_kb * 1024 / chunk_payload_size)
uint16_t total_increments_{0};          // derived: ceil(file_size / increment_data_size)
uint16_t current_increment_{0};
uint32_t total_bytes_written_{0};
uint8_t retransmit_round_{0};          // per-increment, reset on increment advance
IncrementBuffer increment_buf_;
```

### Lost All-Clear Recovery

If the remote sends an INCREMENT_COMPLETE (empty GAPS ACK) but the bridge doesn't receive it:

1. Bridge times out (1000ms), retries BLAST_COMPLETE for the same `increment_index`.
2. Remote receives the retry, sees `increment_index` matches its `current_increment_` (which it has already completed and written to flash).
3. Remote re-sends the INCREMENT_COMPLETE (empty GAPS ACK) with `ref_tx_counter` set to the retry's tx_counter.
4. Bridge receives the all-clear, advances to the next increment.

If the remote receives a BLAST_COMPLETE with `increment_index` less than `current_increment_` (a very delayed retry from a previous increment), it re-sends the all-clear for that previous increment. The bridge checks `ref_tx_counter` against its history and accepts it as valid.

### File Size Limit

The bridge rejects any OTA transfer where `file_size > 1GB` (1,073,741,824 bytes) at ANNOUNCE time. This ensures `increment_index` (uint16_t, max 65535) never wraps — at the minimum practical increment size of 8KB, 65535 increments covers ~512MB, and at 32KB increments covers over 2GB. The 1GB cap provides comfortable margin. The remote also validates file_size against its OTA partition size in the ACCEPT handler.

### Derived Values

```
increment_data_size = min(buffer_size_kb * 1024, preferred_increment_size)
chunks_per_increment = increment_data_size / chunk_payload_size
  // Note: integer division. increment_data_size may not be exactly divisible.
  // actual_increment_data_size = chunks_per_increment * chunk_payload_size
total_increments = ceil(file_size / actual_increment_data_size)
chunks_in_last_increment = (
    (file_size % actual_increment_data_size == 0)
    ? chunks_per_increment
    : ceil((file_size % actual_increment_data_size) / chunk_payload_size)
)
```

For a 32KB increment and 221-byte chunks:
- `chunks_per_increment` = floor(32768 / 221) = 148
- `actual_increment_data_size` = 148 * 221 = 32708 bytes
- Bitmap size = ceil(148 / 8) = 19 bytes
- Increment buffer RAM ≈ 32708 + 19 + overhead ≈ ~33KB

### Increment and Chunk Addressing

Each chunk has a global `sequence` number (0, 1, 2, ..., total_chunks - 1).

```
increment_index = sequence / chunks_per_increment
chunk_in_increment = sequence % chunks_per_increment
offset_in_buffer = chunk_in_increment * chunk_payload_size
bitmap_bit = chunk_in_increment
```

The bridge blasts all chunks with sequence numbers in `[increment_start, increment_end)` for the current increment, where:
```
increment_start = current_increment * chunks_per_increment
increment_end = min((current_increment + 1) * chunks_per_increment, total_chunks)
```

---

## Bridge State Machine (`ESPNowOTAManager`)

```
IDLE → ANNOUNCING → BLASTING → WAITING_GAPS → BLASTING → ... → ENDING → IDLE
                                ↑              │
                                │   (gaps found, retransmit)
                                │              │
                                └── WAITING_GAPS ← REWAIT (BLAST_COMPLETE retry)
```

Full state diagram with transitions:

```
IDLE
  │
  ├──[start_transfer()]──> ANNOUNCING
  │                          │
  │                    [receive ACCEPT]
  │                          │
  │                          v
  │                       BLASTING (increment 0)
  │                          │
  │                    [all increment chunks sent]
  │                          │
  │                          v
  │                       WAITING_GAPS
  │                          │
  │                    [receive GAPS ACK]
  │                       ├── empty bitmap → advance increment
  │                       │       │
  │                       │       ├── more increments? → BLASTING (next increment)
  │                       │       └── last increment? → ENDING
  │                       │
  │                       └── non-empty bitmap (gaps) → BLASTING (retransmit round)
  │                               │
  │                               └── track retransmit_round, ABORT if > 10
  │
  ├──[10s radio silence from remote] → ABORTING → IDLE
  ├──[max BLAST_COMPLETE retries exceeded] → ABORTING → IDLE
  └──[global timeout 900s] → ABORTING → IDLE

ENDING
  │
  ├──[send END]
  ├──[receive COMPLETE(success)] → COMPLETE → IDLE
  ├──[receive COMPLETE(fail)] → FAILED → IDLE
  └──[timeout] → ABORTING → IDLE
```

### States

**IDLE**
- No transfer active.

**ANNOUNCING**
- Sent ANNOUNCE packet to remote.
- Validate file_size <= 1GB (1,073,741,824 bytes). If exceeded, reject immediately without sending ANNOUNCE.
- Waiting for ACCEPT ACK.
- Retry ANNOUNCE up to `ESPNOW_LR_FILE_MAX_RETRIES` (3) with `ESPNOW_LR_FILE_ANNOUNCE_TIMEOUT_MS` (5000ms) timeout.
- On ACCEPT: compute increment parameters, transition to BLASTING.
- On REJECT: transition to IDLE with error.

**BLASTING**
- Requesting chunk sequences for current increment from HTTP source.
- Sending FILE_DATA packets as source chunks arrive.
- Handling `ESP_ERR_NO_MEM` from `esp_now_send()` with adaptive backoff.
- After all increment chunks have been sent: send BLAST_COMPLETE, transition to WAITING_GAPS.
- If retransmit round: only sending gap sequences from previous GAPS bitmap.

**WAITING_GAPS**
- Waiting for GAPS ACK from remote.
- Timeout: 1000ms. On timeout: retry BLAST_COMPLETE (up to 5 retries).
- On GAPS received:
  - Empty bitmap (INCREMENT_COMPLETE): advance to next increment.
    - If more increments: reset increment state, transition to BLASTING.
    - If last increment done: transition to ENDING.
  - Non-empty bitmap (gaps found): build retransmit set, increment retransmit round counter.
    - If `retransmit_round > 10`: ABORT.
    - Otherwise: transition to BLASTING for retransmit.
- Track `last_remote_activity_ms_` for radio silence detection (10s → ABORT).

**ENDING**
- Sent END packet.
- Waiting for COMPLETE ACK.
- Retry END up to `ESPNOW_LR_FILE_MAX_RETRIES` (3) times.
- On COMPLETE(success): transition to IDLE.
- On COMPLETE(fail): transition to IDLE with error.

### IncrementTracker Structure

```cpp
struct IncrementTracker {
    uint16_t current_increment{0};
    uint16_t total_increments{0};
    uint16_t chunks_per_increment{0};
    uint16_t chunks_in_last_increment{0};
    uint32_t total_chunks{0};

    uint8_t retransmit_round{0};           // per-increment, reset on increment advance
    uint8_t blast_complete_retries{0};     // per-WAITING_GAPS, reset on GAPS received
    uint32_t blast_complete_sent_ms{0};    // timestamp for BLAST_COMPLETE timeout
    uint32_t last_blast_complete_tx_counter{0};  // tx_counter of most recent BLAST_COMPLETE
    std::vector<uint32_t> blast_complete_tx_history; // recent BLAST_COMPLETE tx_counters for stale ACK detection

    std::vector<uint8_t> received_bitmap; // assembled from remote's GAPS ACK
    std::set<uint32_t> gap_sequences;      // derived from inverted bitmap
    std::set<uint32_t> requested_sequences; // sequences needed from HTTP source
    std::set<uint32_t> sent_sequences;     // sequences already sent over radio

    uint32_t last_remote_activity_ms{0};   // for radio silence detection
};
```

### Source Data Flow (Per Increment)

```
1. Bridge computes needed sequences for current increment:
   start = current_increment * chunks_per_increment
   end = min(start + chunks_per_increment, total_chunks)
   requested_sequences = {start, start+1, ..., end-1}

   For retransmit round:
   gap_sequences = {sequences where bitmap bit == 0}
   requested_sequences = gap_sequences

2. Bridge populates ota_requested_sequences_ with these sequences
   (exposed via /api/ota/status to the HTTP client)

3. HTTP client (browser/CLI) polls /api/ota/status, sees requested sequences,
   POSTs each chunk via /api/ota/chunk?seq=N&data=<base64>

4. Bridge's on_source_chunk() feeds each chunk to OTAManager

5. OTAManager sends FILE_DATA packets as chunks arrive (blast-as-they-arrive)

6. After all requested sequences have been sent → send BLAST_COMPLETE
```

---

## Complete Message Sequence (Happy Path)

```
Browser       Bridge                              Remote
  |             |                                    |
  | POST /api/ota/start              |               |
  | (target,size,md5) ──>|               |
  |             |                                    |
  |             |── ANNOUNCE ──────────────────────->|
  |             |   {phase=0x00, file_size, md5,    |
  |             |    chunk_size=221, action=0x01}   |
  |             |                                    | esp_ota_begin()
  |             |                                    | init MD5
  |             |                                    | alloc IncrementBuffer (32KB)
  |             |                                    |
  |             |<─── ACCEPT ────────────────────────|
  |             |   {result=0x00,                    |
  |             |    chunk_size=221,                 |
  |             |    buffer_size_kb=32,              |
  |             |    action=0x01}                    |
  |             |                                    |
  |             | Bridge computes:                   |
  |             |   chunks_per_inc = 148             |
  |             |   total_increments = ceil(N/148)   |
  |             |   current_increment = 0            |
  |             |                                    |
  | GET /api/ota/status              |               |
  |<── {requested:[0..147]} ──|               |
  |             |                                    |
  | POST /api/ota/chunk?seq=0 ──>|── FILE_DATA(0) ─>| mark bitmap, store in buffer
  | POST /api/ota/chunk?seq=1 ──>|── FILE_DATA(1) ─>| mark bitmap, store in buffer
  |    ...       |    ...                             |
  | POST /api/ota/chunk?seq=147 ─>|── FILE_DATA(147) ─>|
  |             |                                    |
  |             |── BLAST_COMPLETE ────────────────>|
  |             |   {phase=0x03, increment_index=0} |
  |             |                                    | Check bitmap:
  |             |                                    |   all 148 chunks received
  |             |                                    | esp_ota_write(32KB, sliced)
  |             |                                    | md5_update(32KB)
  |             |                                    | ~50-100ms
  |             |<─── GAPS ACK (bitmap_length=0) ───| INCREMENT_COMPLETE
  |             |                                    | Clear buffer, ready for next
  |             |                                    |
  |             | current_increment = 1              |
  |             |                                    |
  | GET /api/ota/status              |               |
  |<── {requested:[148..295]} ─|               |
  |    ... blast increment 1 ...                    |
  |             |                                    |
  |    ... blast increment K-1 (last) ...            |
  |             |                                    |
  |             |── BLAST_COMPLETE ────────────────>|
  |             |   {phase=0x03, increment_index=K-1}|
  |             |                                    | Check bitmap:
  |             |                                    | esp_ota_write(last_increment, sliced)
  |             |                                    | md5_update(last_increment)
  |             |<─── GAPS ACK (bitmap_length=0) ───|
  |             |                                    | [state: WAITING_END]
  |             |                                    |
  |             |── END ────────────────────────────>|
  |             |   {phase=0x01}                    |
  |             |                                    | [state: VERIFYING]
  |             |                                    | md5_finish()
  |             |                                    | compare MD5
  |             |                                    | esp_ota_end()
  |             |                                    | esp_ota_set_boot_partition()
  |             |                                    |
  |             |<─── COMPLETE ──────────────────────|
  |             |   {result=SUCCESS}                |
  |             |                                    | schedule reboot (250ms)
  |<── {state:SUCCESS} ──|               |
```

---

## Gap Retransmit Path

```
Bridge                              Remote
  |── BLAST_COMPLETE ────────────>|
  |   {phase=0x03, increment_index=N}
  |                                | Check bitmap:
  |                                |   chunks 47 and 103 missing
  |<─── GAPS ACK ─────────────────|
  |     (ref_tx_counter=<blast_complete_tx>,            |
  |      bitmap_length=19,          |
  |      bit 47=0, bit 103=0)       |
  |                                | (keeps increment buffer in RAM)
  |                                |
  | Bridge builds retransmit set:  |
  |   gap_sequences = {47, 103}    |
  | retransmit_round = 1           |
  |                                |
  | requests seq 47,103 from source|
  |                                |
  |── FILE_DATA(47) ─────────────>| mark bitmap, store in buffer
  |── FILE_DATA(103) ────────────>| mark bitmap, store in buffer
  |── BLAST_COMPLETE ────────────>|
  |   {phase=0x03, increment_index=N}
  |                                | Check bitmap:
  |                                |   all chunks received
  |                                | esp_ota_write()
  |<─── GAPS ACK (bitmap_length=0)─| INCREMENT_COMPLETE
  |   (ref_tx_counter=<new_blast_complete_tx>)
  |                                | Clear buffer
  | retransmit_round reset to 0    |
  | current_increment++            |
  | start next increment           |
```

---

## GAPS ACK Bitmap Detail

### Layout

```
Byte 0: bit 0 = chunk 0, bit 1 = chunk 1, ..., bit 7 = chunk 7
Byte 1: bit 0 = chunk 8, bit 1 = chunk 9, ..., bit 7 = chunk 15
...
Byte N: (partial) bit 0 = chunk N*8, ...
```

### Example: 148 chunks per increment

Bitmap length = ceil(148 / 8) = 19 bytes.

```
Byte  0: chunks   0-7
Byte  1: chunks   8-15
...
Byte 17: chunks 136-143
Byte 18: chunks 144-147 (only 4 bits used, bits 4-7 are padding/ignored)
```

The remote sets bit=1 for received chunks, bit=0 for missing chunks. The bridge inverts the bitmap to find which chunks to retransmit.

### Empty Bitmap (INCREMENT_COMPLETE)

When all chunks for the increment are received and written to flash, the remote sends:

```
espnow_ack_t:     {ack_type=PKT_FILE_TRANSFER, result=ESPNOW_LR_FILE_ACK_GAPS, ref_tx_counter=<blast_complete_tx>}
bitmap_length:    0  (uint16_t)
```

No bitmap data follows. This signals INCREMENT_COMPLETE — the remote is ready for the next increment.

### Non-Empty Bitmap (Gaps)

When some chunks are missing:

```
espnow_ack_t:     {ack_type=PKT_FILE_TRANSFER, result=ESPNOW_LR_FILE_ACK_GAPS, ref_tx_counter=<blast_complete_tx>}
bitmap_length:    19  (uint16_t)
bitmap_data:      [19 bytes, LSB-first, bit=1 for received chunks]
```

---

## Increment Addressing Detail

### Global Sequence to Increment/Chunk Mapping

Given:
- `chunk_payload_size` = 221 bytes (negotiated via session max_frame_payload)
- `buffer_size_kb` = remote's advertised buffer budget (e.g., 32)
- `increment_data_size` = min(buffer_size_kb * 1024, preferred_increment) — typically 32708 bytes
- `chunks_per_increment` = floor(increment_data_size / chunk_payload_size) — typically 148
- `total_chunks` = ceil(file_size / chunk_payload_size)
- `total_increments` = ceil(total_chunks / chunks_per_increment)

For any global sequence number `seq`:

```
increment_index     = seq / chunks_per_increment        (integer division)
chunk_in_increment  = seq % chunks_per_increment        (integer modulo)
offset_in_buffer    = chunk_in_increment * chunk_payload_size
bitmap_bit          = chunk_in_increment
bitmap_byte         = bitmap_bit / 8
bitmap_bit_in_byte = bitmap_bit % 8
```

For the last increment:
```
chunks_in_last_increment = total_chunks - (total_increments - 1) * chunks_per_increment
```

The last chunk in the file may be shorter than `chunk_payload_size`:
```
last_chunk_data_size = file_size - (total_chunks - 1) * chunk_payload_size
```

Both sides compute these values identically from the ANNOUNCE/ACCEPT parameters.

---

## Error Handling

### Per-Increment Error Limits

| Error Condition | Limit | Action |
|----------------|-------|--------|
| BLAST_COMPLETE retries (no GAPS ACK) | 5 per increment | ABORT |
| Retransmit rounds (gaps still present) | 10 per increment | ABORT |
| Flash write failure | 1 retry, then ABORT | ABORT with FLASH_ERROR |
| Global transfer timeout | 900 seconds | ABORT |
| Radio silence from remote | 10 seconds | ABORT |
| ANNOUNCE retries (no ACCEPT) | 3 retries, 5s timeout each | ABORT |
| END retries (no COMPLETE) | 3 retries | ABORT |
| File size > 1GB | Reject at ANNOUNCE | REJECT with NO_SPACE or UNSUPPORTED |

### ABORT Flow

Either side can initiate an ABORT at any time:

```
Bridge                              Remote
  |── FILE_TRANSFER {phase=ABORT, reason} ─>|
  |                                          | esp_ota_abort()
  |<─── ACK {result=ABORT} ────────────────|
  |                                          | reset state
  |  reset state                             |
```

Or remote-initiated:

```
Bridge                              Remote
  |<─── ACK {result=ABORT, reason} ────────|
  |  ABORT transfer                          | esp_ota_abort()
  |  reset state                             | reset state
```

### Flash Write Failure Recovery

On `esp_ota_write()` failure during WRITING state:

1. Retry the `esp_ota_write()` call once.
2. If retry also fails: send ABORT with reason `FLASH_ERROR`.
3. Remote calls `esp_ota_abort()` and resets state.

This is safe because the increment was fully received (all bits in bitmap set) before attempting the write. The `esp_ota_begin()`-opened handle can be aborted without corrupting the previous partition.

---

## REST API Changes

### `GET /api/ota/status`

Updated response format (key names updated from old `percent`/`error_msg` to match new UI — updated atomically with `ota_web_page.h`):

```json
{
  "state": "BLASTING",
  "current_increment": 2,
  "total_increments": 18,
  "total_chunks": 2664,
  "current_increment_chunks_sent": 47,
  "percent": 12,
  "retransmit_round": 0,
  "requested": [296, 297, 298, ...],
  "chunk_size": 221,
  "buffer_size_kb": 32,
  "error_msg": ""
}
```

Removed fields:
- `acked_sequence` (was for sliding window)
- `window_size` (was for sliding window)

Added fields:
- `current_increment` — which increment is currently being blasted
- `total_increments` — total number of increments for this file
- `current_increment_chunks_sent` — chunks sent in current increment blast
- `retransmit_round` — current retransmit round for this increment (0 = first blast)
- `buffer_size_kb` — remote's advertised buffer size

The `requested` array now contains all sequences for the current increment (or just the gap sequences during a retransmit round), rather than a sliding window of 32.

### `POST /api/ota/start`

Request encoding: **form-urlencoded POST body** (same as current implementation). Fields: `target` (MAC address string), `size` (decimal file size in bytes), `md5` (hex MD5 string).

The bridge now computes increment parameters after receiving ACCEPT from the remote.

### `POST /api/ota/chunk`

Request encoding: **query parameter `seq` (integer) + form-urlencoded POST body `data` (base64-encoded chunk bytes)** (same as current implementation). The bridge accepts chunks for any sequence currently in `requested_sequences_`.

### `POST /api/ota/abort`

No changes. Aborts the current transfer from either end.

### `POST /api/ota/upload`

This endpoint was never implemented. It is formally removed. The upload path is through `/api/ota/start` + `/api/ota/chunk`.

---

## Source Data Flow (Bridge → HTTP Client)

### Per-Increment Flow

1. BLASTING state begins for increment `N`.

2. Bridge computes needed sequences:
   ```
   start_seq = N * chunks_per_increment
   end_seq = min((N + 1) * chunks_per_increment, total_chunks)
   requested_sequences_ = {start_seq, ..., end_seq - 1}
   ```
   For retransmit round: `requested_sequences_ = gap_sequences` derived from received bitmap.

3. Bridge exposes `requested_sequences_` via `/api/ota/status`.

4. HTTP client (browser/CLI) polls `/api/ota/status`, sees `requested` array, POSTs each chunk via `/api/ota/chunk?seq=N&data=<base64>`.

5. Bridge's `on_source_chunk(seq, data, len)` feeds each chunk to the OTA manager, which sends it over ESP-NOW immediately.

6. After all sequences in `requested_sequences_` have been sent over the radio: bridge sends BLAST_COMPLETE.

7. Bridge transitions to WAITING_GAPS.

### Client-Side (Browser/CLI) Change

The browser JavaScript in `ota_web_page.h` needs updating:

- Remove sliding-window logic (request 32 chunks, wait for ACK, request more).
- New logic: request all chunks for current increment, deliver ASAP, wait for increment completion.
- Poll `/api/ota/status` for `current_increment` changes and `retransmit_round` updates.
- Display increment-based progress: "Increment 3/18, Round 0".

---

## Remote RAM Budget

The remote's `buffer_size_kb` in ACCEPT is NOT a hardcoded value — it must be computed dynamically from the available heap at the time ANNOUNCE is received. The remote calls `heap_caps_get_largest_free_block()` (or equivalent) and advertises a conservative fraction of that.

### Dynamic Buffer Sizing

```
largest_free_block = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)
buffer_size_kb = (largest_free_block * safety_margin) / 1024
// safety_margin = 0.5–0.75 (advertise 50-75% of largest free block)
// minimum: 8 KB (enough for ~36 chunks at 221 bytes)
// maximum: 64 KB (more than 64KB provides diminishing returns)
buffer_size_kb = clamp(buffer_size_kb, 8, 64)
```

The safety margin accounts for:
- Fragmentation: the largest free block may not be contiguous enough for the full allocation.
- Other allocations during the transfer (bitmap, tracking structs, stack).
- ESPHome components that may allocate during the OTA process (WiFi, MQTT buffers).

### Example at 32 KB Increment

| Item | Size |
|------|------|
| Increment data buffer | 32,708 bytes (148 * 221) |
| Bitmap | 19 bytes (ceil(148/8)) |
| Chunk tracking overhead | ~100 bytes |
| **Total OTA overhead** | **~32.8 KB** |

Conservative remotes (e.g., ESP32-C3 with ~60-80KB free) may advertise `buffer_size_kb = 8` for a ~8.2KB overhead, at the cost of more increments (more round-trips). ESP32-S3 or ESP32 with PSRAM may advertise 32-64KB.

### Increment Count vs Buffer Size

| File Size | 8 KB buffer | 16 KB buffer | 32 KB buffer |
|-----------|-------------|--------------|--------------|
| 64 KB | 8 increments | 4 increments | 2 increments |
| 256 KB | 32 increments | 16 increments | 8 increments |
| 1 MB | 128 increments | 64 increments | 32 increments |
| 2 MB | 256 increments | 128 increments | 64 increments |

Each increment has 1 RTT overhead (BLAST_COMPLETE + GAPS ACK). At ~5ms RTT, even 128 increments adds only ~640ms of protocol overhead.

---

## Performance Estimates

### Theoretical Throughput

At 500kbps LR PHY with 221-byte payload per frame:

| Metric | Value |
|--------|-------|
| Air time per frame | ~4ms (336 + 16*250 µs) |
| Effective data rate | ~55 KB/s (221 bytes / 4ms) |
| Chunks per second | ~250 |

### Transfer Time Estimates (32KB increments, clean link)

| File Size | Increments | Blast Time | RTT Overhead | Total |
|-----------|------------|------------|--------------|-------|
| 64 KB | 2 | ~1.2s | ~10ms | ~1.2s |
| 256 KB | 8 | ~4.7s | ~40ms | ~4.7s |
| 1 MB | 32 | ~18.8s | ~160ms | ~19.0s |
| 2 MB | 64 | ~37.7s | ~320ms | ~38.0s |

### Transfer Time Estimates (5% packet loss, 1 avg retransmit round per increment)

| File Size | Increments | Blast + Retransmit | RTT Overhead | Total |
|-----------|------------|-------------------|--------------|-------|
| 64 KB | 2 | ~1.3s | ~10ms | ~1.3s |
| 256 KB | 8 | ~5.2s | ~40ms | ~5.2s |
| 1 MB | 32 | ~20.7s | ~160ms | ~20.9s |
| 2 MB | 64 | ~41.4s | ~320ms | ~41.7s |

### Comparison with Old Sliding Window Protocol

| Metric | Sliding Window | Blast-then-Gaps |
|--------|---------------|------------------|
| Round-trips per 32KB | ~8 (ACK every 4 chunks, window=32) | 1 (BLAST_COMPLETE + GAPS) |
| Per-chunk ACK overhead | Every 4th chunk | None |
| 1MB transfer on clean link | ~25-30s | ~19s |
| Retransmission latency | 3s timeout per lost chunk | Per-increment, ~1-2ms per missing chunk |
| Remote RAM per window/increment | ~7KB (32 * 217) | ~33KB (148 * 221 + bitmap) |
| Protocol complexity | Cumulative ACK, window sliding, per-chunk retry | Simple bitmap, per-increment sync |

---

## Implementation Order

**All phases (1–9) are implemented within a single feature branch and merged as one atomic commit.** The old and new protocols cannot interoperate — they have different state machines, struct layouts, chunk sizes, and ACK semantics. There is no point in maintaining backward compatibility during the transition because old remotes cannot talk to a new bridge and vice versa.

**Important: intermediate commits within the feature branch will not compile.** Phase 1 removes constants and struct fields that the current bridge manager, file receiver, and protocol handlers still reference. Phases 2–6 rewrite those handlers to use the new protocol. The branch compiles only after all phases are complete. This is intentional and acceptable for a feature branch — do not attempt to keep the code compiling between phases.

**No backward compatibility shims.** Do not add temporary compatibility constants, dual-mode handlers, or protocol version switching. The old code is removed and replaced entirely. All devices on the network (bridge and remotes) must be updated together.

### Phase 1: Protocol Types (`espnow_types.h`)

1. Add new constants (`PHASE_BLAST_COMPLETE`, `ACK_GAPS`, timeouts)
2. Remove old constants (`DEFAULT_WINDOW_SIZE`, `ACK_INTERVAL`, `ACK_TIMEOUT_MS`)
3. Shrink `espnow_file_announce_t` (remove `window_size`)
4. Shrink `espnow_file_data_header_t` (remove `offset`)
5. Add `espnow_file_blast_complete_t` struct
6. Update overhead constants (`HEADER_OVERHEAD`, `DEFAULT_CHUNK_SIZE`)
7. Update `static_assert` from 217 to 221
8. Update `is_encrypted_packet()` if needed (BLAST_COMPLETE uses existing FILE_TRANSFER type)

### Phase 2: Remote Side (`remote_file_receiver.h/.cpp`)

1. Replace `FileReceiver` state machine with increment-based states: IDLE, ANNOUNCED, RECEIVING, CHECKING, WRITING, WAITING_END, VERIFYING, COMPLETE
2. Add `IncrementBuffer` struct (data vector + bitmap + counters)
3. Remove `receive_buffer_`, `acked_sequence_`, `chunks_since_last_ack_`
4. Add increment tracking members: `current_increment_`, `total_increments_`, `chunks_per_increment_`
5. Rewrite `handle_file_data()`: validate sequence bounds and data length, mark bitmap (only on 0→1 transition), store in increment buffer, silently ignore duplicates
6. Add `handle_blast_complete()`: validate `increment_index`, check bitmap, send GAPS or transition to WRITING
7. Add `write_increment_to_flash()`: `esp_ota_write()` in `chunk_payload_size` slices with `delay(0)` yields, retry entire increment once on failure
8. Add `send_gaps_ack()`: assemble bitmap, send PKT_ACK with result=GAPS
9. Add progressive MD5 per increment write
10. Keep `esp_ota_begin()` on ANNOUNCE, `esp_ota_end()` on END
11. Add WAITING_END state: wait for END after last increment all-clear
12. Add radio silence detection (10s)
13. Compute `buffer_size_kb` dynamically from `heap_caps_get_largest_free_block()` with safety margin

### Phase 3: Remote Protocol (`remote_protocol.h/.cpp`)

1. Add `handle_blast_complete_()`: dispatch BLAST_COMPLETE to FileReceiver
2. Add `send_gaps_ack_()`: construct and send GAPS ACK packet
3. Remove per-chunk PROGRESS ACK emission
4. Update ACK dispatch for GAPS result code

### Phase 4: Bridge OTA Manager (`bridge_ota_manager.h/.cpp`)

1. Replace state machine with increment-based states: IDLE, ANNOUNCING, BLASTING, WAITING_GAPS, ENDING
2. Replace `WindowTracker`/`ChunkSlot` with `IncrementTracker`
3. Remove all window-sliding, per-chunk retry, PROGRESS ACK logic
4. Add `handle_gaps_ack()`: parse bitmap, build retransmit set or advance increment
5. Add `send_blast_complete_()`: send per-increment BLAST_COMPLETE
6. Add increment iteration: advance to next increment after all-clear
7. Add per-increment timeout tracking (1000ms BLAST_COMPLETE ACK, 5 retries)
8. Add radio silence detection (10s → ABORT)
9. Source streaming: request per-increment sequences, blast as they arrive
10. Remove `last_acked_seq_`, `next_seq_to_send_`, sliding window logic

### Phase 5: Bridge Protocol (`bridge_protocol.h/.cpp`)

1. Add GAPS ACK handling (result=0x05): validate `ref_tx_counter` against BLAST_COMPLETE tx_counter history, dispatch to OTA manager
2. Add BLAST_COMPLETE sending function: record tx_counter in IncrementTracker history
3. Remove PROGRESS ACK handling
4. Update FILE_TRANSFER dispatch for new phase byte (0x03)

### Phase 6: Bridge REST API (`esp_tree_bridge.h/.cpp`)

1. Update `/api/ota/status` response format (see REST API Changes section)
2. Replace `ota_requested_sequences_` sliding window with per-increment set
3. Remove `feed_ota_upload_chunks_()` no-op
4. Update chunk size negotiation to use session `max_frame_payload`
5. Keep `/api/ota/chunk` endpoint (per-increment scoped)

### Phase 7: Web UI and CLI

1. Update `ota_web_page.h` JavaScript: increment-based progress display, remove window logic
2. Update `ota_web_page.h` JavaScript: increment-based progress display, remove window logic

### Phase 8: Tests (`tests/bridge_ota_manager_test.cpp`)

1. Rewrite tests for new state machine
2. Test: blast → BLAST_COMPLETE → GAPS empty → increment advance
3. Test: blast → BLAST_COMPLETE → GAPS with missing chunks → retransmit → all-clear
4. Test: BLAST_COMPLETE timeout and retry (up to 5)
5. Test: 10 retransmit rounds → ABORT
6. Test: 10s radio silence → ABORT
7. Test: flash write failure → retry → ABORT
8. Test: last increment partial (fewer chunks)
9. Test: ACCEPT negotiation (buffer_size_kb)
10. Test: GAPS ACK with stale `ref_tx_counter` is ignored
11. Test: Lost all-clear → bridge retries BLAST_COMPLETE → remote re-sends empty GAPS
12. Test: BLAST_COMPLETE with wrong `increment_index` is ignored by remote
13. Test: file_size > 1GB rejected at ANNOUNCE
14. Test: dynamic `buffer_size_kb` computation from heap

### Phase 9: Build Verification

1. Compile `espnow-remote` demo
2. Compile `espnow-bridge-c5` demo
3. Fix any compilation errors
4. Run host-side tests

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `static_assert` breakage across codebase | Update all asserts from 217→221 and struct size changes in one pass |
| Remote RAM pressure at 32KB increment | `buffer_size_kb` negotiation lets conservative remotes request smaller increments |
| Browser HTTP POST concurrency | Browser delivers chunks sequentially in a loop — no concurrency issue |
| `esp_ota_write()` failure mid-increment | Retry once, then ABORT. `esp_ota_abort()` cleanly rolls back |
| Last chunk shorter than `chunk_payload_size` | Remote must use `min(chunk_payload_size, file_size - seq * chunk_payload_size)` |
| Duplicate chunk in retransmit | Remote only increments `chunks_received_` on bitmap 0→1 transition. Duplicate chunks are silently ignored — data already in buffer. |
| Out-of-order HTTP chunk delivery | Bridge blasts as chunks arrive. Radio ordering may differ from HTTP ordering. Remote handles via bitmap marking — order within increment doesn't matter. |
| Relay forwarding | BLAST_COMPLETE is FILE_TRANSFER phase byte 0x03. Relay forwards transparently. |
| Mixed old/new firmware on network | Hard replace — no backward compatibility. All remotes and the bridge must be updated together in a single atomic commit. |
| Global transfer timeout at 900s | Sufficient for largest practical images (2MB at 50% loss ≈ 120s) |
| `esp_ota_write()` WDT stall on 32KB write | Write increment in `chunk_payload_size` slices with `delay(0)` yields between slices |
| Stale GAPS ACK from lost all-clear | `increment_index` in BLAST_COMPLETE + `ref_tx_counter` correlation in GAPS ACK resolves ambiguity. Bridge keeps tx_counter history for overlap. |
| File size > 1GB | Bridge rejects at ANNOUNCE time. Remote also validates against OTA partition size in ACCEPT handler. |

---

## Removed Functionality

The following are explicitly removed and must not be present in the new code:

- Sliding window tracker (`WindowTracker`, `ChunkSlot`)
- Per-chunk PROGRESS ACKs (result code 0x02)
- `acked_sequence_` cumulative ACK tracking
- `receive_buffer_` out-of-order chunk buffering (remote side)
- Per-chunk retry with timeout (3s `ESPNOW_LR_FILE_ACK_TIMEOUT_MS`)
- `ACK_INTERVAL` (every 4 chunks)
- `window_size` field in ANNOUNCE
- `offset` field in FILE_DATA header
- `ESPNOW_LR_FILE_DEFAULT_WINDOW_SIZE` constant
- `ESPNOW_LR_FILE_ACK_INTERVAL` constant
- `ESP_ERR_NO_MEM` backoff consuming retry budget (now budget-free)
- `/api/ota/upload` endpoint (never implemented, formally removed)
- `feed_ota_upload_chunks_()` no-op method