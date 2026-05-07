#pragma once

#include "espnow_lr_common/espnow_types.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {

class FileReceiver {
 public:
  struct AnnounceResponse {
    bool accepted{false};
    uint8_t reject_reason{ESPNOW_FILE_REJECT_UNSUPPORTED};
    uint16_t negotiated_chunk_size{0};
  };

  struct ChunkResponse {
    bool accepted{true};
    uint8_t abort_reason{ESPNOW_FILE_ABORT_FLASH_ERROR};
  };

  class ActionHandler {
   public:
    virtual ~ActionHandler() = default;
    virtual AnnounceResponse on_announce(uint32_t file_size, const uint8_t md5[16],
                                         uint16_t chunk_size, uint8_t window_size,
                                         uint8_t action, const char *file_id) = 0;
    virtual ChunkResponse on_data(uint32_t sequence, uint32_t offset,
                                   const uint8_t *data, size_t len) = 0;
    virtual uint8_t on_end() = 0;
    virtual void on_abort(uint8_t reason) = 0;
    virtual bool is_receiving() const = 0;
    virtual bool wants_restart_after_complete() const { return false; }
  };

  using send_ack_fn_t = std::function<bool(const uint8_t *payload, size_t len)>;

  FileReceiver();

  void set_send_ack_fn(send_ack_fn_t fn) { send_ack_fn_ = std::move(fn); }
  void set_announce_tx_counter(uint32_t tx_counter) { announce_tx_counter_ = tx_counter; }
  void set_local_mac(const uint8_t *mac);
  void set_ota_enabled(bool enabled) { ota_enabled_ = enabled; }
  void set_deep_sleep_active(bool active) { deep_sleep_active_ = active; }
  void set_max_chunk_size(uint16_t max_chunk);

  void register_handler(uint8_t action, ActionHandler *handler);

  bool handle_file_transfer(const uint8_t *payload, size_t len);
  bool handle_file_data(const uint8_t *payload, size_t len);
  void loop();
  void abort(uint8_t reason, bool notify_sender = true);

  bool is_receiving() const { return false; }

 private:
  std::array<uint8_t, 6> local_mac_{};
  send_ack_fn_t send_ack_fn_;
  bool ota_enabled_{false};
  bool deep_sleep_active_{false};
  uint16_t max_chunk_size_{ESPNOW_FILE_DEFAULT_CHUNK_SIZE};
  uint32_t announce_tx_counter_{0};
};

}  // namespace espnow_lr
}  // namespace esphome
