# ESP82xx OTA/File Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring full OTA/Flash and file transfer functionality from `esp_tree_remote` into `espnow_82xx_remote` for ESP8266.

**Architecture:** The `FileReceiver` class in esp82xx is currently a stub that returns `false` for all handlers. We need to port the full increment-based flash buffer management with retransmit support from `esp_tree_remote`. Key challenge: ESP8266 lacks ESP-IDF's `esp_ota_ops.h` APIs, so we need Arduino-style flash writing via `ESPhttpUpdate` or direct flash via `SPIFFS`/`LittleFS`.

**Tech Stack:** ESP8266 Arduino, ESPHome, ESPNOW

---

## File Inventory

### New File: `components/espnow_82xx_remote/remote_file_receiver.cpp` (replacement)
Currently a 38-line stub. Replace with full 903-line implementation from `esp_tree_remote/remote_file_receiver.cpp`, with these modifications:
- Replace `#if defined(ESP_PLATFORM)` OTA code with `#ifdef USE_ESP8266` Arduino flash API
- OTAFlashHandler uses `ESPhttpUpdate` or direct `SPIFFS` write instead of IDF's `esp_ota_begin`/`esp_ota_write`
- No IDF5 wifi_protocols_t, no FreeRTOS semaphores
- Simpler restart: `ESP.restart()` instead of `esp_restart()`

### Modify: `components/espnow_82xx_remote/remote_file_receiver.h`
Add:
- `IncrementBuffer` struct (from esp_tree_remote)
- `OTAFlashHandler` inner class with `on_announce`, `on_data`, `on_end`, `on_abort`
- State machine enum (`IDLE`, `ANNOUNCED`, `RECEIVING`, `CHECKING`, `WRITING`, `WAITING_END`, `VERIFYING`, `COMPLETE`)
- `send_ack_fn_t` binding with proper signature
- `set_blast_complete_tx_counter()` method
- `IncrementBuffer` methods

### Modify: `components/espnow_82xx_remote/remote_protocol.h`
Update `ActionHandler::on_announce` signature to match:
```cpp
// Current (wrong):
virtual AnnounceResponse on_announce(uint32_t file_size, const uint8_t md5[16],
                                     uint16_t chunk_size, uint8_t window_size,
                                     uint8_t action, const char *file_id) = 0;
// Should be (from esp_tree_remote):
virtual AnnounceResponse on_announce(uint32_t file_size, const uint8_t md5[16],
                                     uint16_t chunk_size, uint8_t action,
                                     const char *file_id, uint16_t &buffer_size_kb) = 0;
```

### Modify: `components/espnow_82xx_remote/__init__.py`
Add `ota_over_espnow` config option if missing (already present, but `ota_enabled_` flag not wired to FileReceiver properly). Verify `set_ota_enabled(true)` actually enables OTA.

---

## Task Breakdown

### Task 1: Replace remote_file_receiver.h

**Files:**
- Modify: `components/espnow_82xx_remote/remote_file_receiver.h:1-72`

- [ ] **Step 1: Replace header content**

Replace the entire file with the full header from `esp_tree_remote/remote_file_receiver.h`, but:
1. Remove `#include <esp_ota_ops.h>` and `#include <esp_partition.h>` (ESPIDF only)
2. Change `ActionHandler::on_announce` signature from:
   ```cpp
   virtual AnnounceResponse on_announce(uint32_t file_size, const uint8_t md5[16],
                                        uint16_t chunk_size, uint8_t window_size,
                                        uint8_t action, const char *file_id) = 0;
   ```
   To:
   ```cpp
   virtual AnnounceResponse on_announce(uint32_t file_size, const uint8_t md5[16],
                                        uint16_t chunk_size, uint8_t action,
                                        const char *file_id, uint16_t &buffer_size_kb) = 0;
   ```
3. Change `ActionHandler::on_data` signature from:
   ```cpp
   virtual ChunkResponse on_data(uint32_t sequence, uint32_t offset,
                                 const uint8_t *data, size_t len) = 0;
   ```
   To:
   ```cpp
   virtual ChunkResponse on_data(uint32_t sequence,
                                 const uint8_t *data, size_t len) = 0;
   ```
4. Add stub struct for non-ESP8266 builds at top:
   ```cpp
   #if !defined(USE_ESP8266)
   struct esp_partition_t {
     size_t size{0};
   };
   using esp_ota_handle_t = uintptr_t;
   #endif
   ```
5. Add `OTAFlashHandler` inner class declaration
6. Add `IncrementBuffer` struct
7. Add all missing state machine members

### Task 2: Replace remote_file_receiver.cpp

**Files:**
- Modify: `components/espnow_82xx_remote/remote_file_receiver.cpp:1-38`

- [ ] **Step 1: Replace cpp content**

Replace the 38-line stub with the full 903-line implementation from `esp_tree_remote/remote_file_receiver.cpp`, applying these ESP8266-specific changes:

1. Replace `#if defined(ESP_PLATFORM)` with `#ifdef USE_ESP8266` for flash/OTA sections
2. In `OTAFlashHandler::on_announce()` (around line 698-735 in esp_tree_remote):
   - Remove `esp_ota_get_next_update_partition()` call
   - Remove `esp_ota_begin()` call
   - For ESP8266, use `ESPhttpUpdate` class or direct flash writing via `SPIFFS`
   - Calculate buffer based on `ESP.getFreeHeap()` instead of `heap_caps_get_largest_free_block()`
3. In `OTAFlashHandler::on_data()` (around line 783-791):
   - Replace `esp_ota_write()` with `ESPhttpUpdate.write()` or direct flash buffer
   - Remove magic byte check or keep it (validates .bin starts with 0xE9)
4. In `OTAFlashHandler::on_end()` (around line 835-848):
   - Remove `esp_ota_end()` and `esp_ota_set_boot_partition()`
   - For ESP8266, this may be a no-op or use `ESPhttpUpdate.end()`
5. In `OTAFlashHandler::on_abort()` (around line 856-864):
   - Remove `esp_ota_abort()` call
6. In `perform_restart_if_due_()` (around line 659-673):
   - Replace `esp_restart()` with `ESP.restart()`
7. Keep `IncrementBuffer` implementation unchanged (pure C++)

### Task 3: Update remote_protocol.h to match ActionHandler signatures

**Files:**
- Modify: `components/espnow_82xx_remote/remote_protocol.h:54-65`

- [ ] **Step 1: Update ActionHandler interface in remote_protocol.h**

The `ActionHandler` interface in `remote_file_receiver.h` has a different `on_announce` signature. Since `remote_protocol.h` (via `remote_protocol.cpp` line 405) binds to `FileReceiver::OTAFlashHandler`, the signatures must match.

Update the interface to use the esp_tree_remote signature:
```cpp
virtual AnnounceResponse on_announce(uint32_t file_size, const uint8_t md5[16],
                                     uint16_t chunk_size, uint8_t action,
                                     const char *file_id, uint16_t &buffer_size_kb) = 0;
virtual ChunkResponse on_data(uint32_t sequence,
                               const uint8_t *data, size_t len) = 0;
```

### Task 4: Verify integration

**Files:**
- Read: `components/espnow_82xx_remote/remote_protocol.cpp:400-420`
- Read: `components/espnow_82xx_remote/remote_protocol.cpp:1455-1490`

- [ ] **Step 1: Verify FileReceiver initialization**

Check that `file_receiver_.set_send_ack_fn`, `file_receiver_.set_ota_enabled`, `file_receiver_.set_local_mac`, and `file_receiver_.set_max_chunk_size` are all called with correct signatures.

- [ ] **Step 2: Verify handle_file_transfer_ and handle_file_data_**

These should already pass through to `file_receiver_` correctly. Verify the code path calls `file_receiver_.handle_file_transfer()` and `file_receiver_.handle_file_data()` with decrypted payload.

---

## Key Architectural Decisions

### Flash Backend for ESP8266
Two options:
1. **ESPhttpUpdate** - Uses HTTP to flash OTA partition, but requires the binary to be hosted somewhere. Our use case is direct ESPNOW transfer, so this doesn't fit.
2. **Direct flash write** - Write incoming chunks to a buffer, write to flash via `SPIFFS` or `EEPROM` at end. The existing esp_tree_remote OTAFlashHandler writes chunks incrementally to IDF OTA handle.

For ESP8266, we can use a buffer approach:
- Buffer up to `buffer_size_kb` of chunks in RAM
- When buffer is full or transfer ends, write to flash via `SPIFFS` or `LittleFS` update partition
- Since ESP8266 has limited RAM (~80KB), keep `ESPNOW_MAX_INCREMENT_KB` at 8KB

### Restart Mechanism
ESP8266 uses `ESP.restart()` which is already in the codebase (line 1325).

### Missing: `esp_partition_t` and `esp_ota_handle_t`
These are ESP-IDF types. For ESP8266 builds, we don't need them since we're not using IDF OTA. Add stub typedefs in the header:
```cpp
#if !defined(USE_ESP8266)
struct esp_partition_t { size_t size{0}; };
using esp_ota_handle_t = uintptr_t;
#endif
```

---

## Testing Approach

1. **Compile test**: `./compile.sh <esp82xx-demo> bf` - ensure no compile errors
2. **OTA test**: With a bridge running, trigger OTA to an ESP8266 node and verify:
   - Announce/ACK exchange works
   - Chunks transfer without gaps
   - MD5 verification passes
   - Device reboots into new firmware
3. **Partial transfer test**: Interrupt OTA mid-transfer, verify clean abort

---

## Spec Coverage

| Requirement | Task |
|-------------|------|
| FileReceiver full implementation | Task 1, Task 2 |
| OTAFlashHandler for ESP8266 | Task 2 |
| Increment buffer management | Task 1, Task 2 |
| ACK negotiation | Task 2 |
| Retransmit on gaps | Task 2 |
| MD5 verification | Task 2 |
| Restart after OTA | Task 2 |
| Protocol signature alignment | Task 3 |