#pragma once

#include "espnow_lr_common/espnow_types.h"

#include <esp_err.h>

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {

class ESPNowOTAManager {
 public:
  struct Config {
    uint8_t window_size{16};
    uint8_t max_chunk_attempts{10};
    uint8_t max_control_attempts{10};
    uint16_t min_chunk_size{64};
    uint32_t ack_timeout_ms{ESPNOW_LR_FILE_ACK_TIMEOUT_MS};
    uint32_t global_timeout_ms{900000};
    uint32_t no_mem_backoff_ms{5};
    uint32_t max_no_mem_backoff_ms{250};
    uint32_t remote_silence_timeout_ms{60000};
  };

  struct ChunkSlot {
    uint32_t sequence{0};
    std::vector<uint8_t> data;
    uint8_t attempt_count{0};
    uint32_t last_send_ms{0};
    uint32_t last_request_ms{0};
    bool requested{false};
    bool ready{false};
    bool sent{false};
  };

  struct WindowTracker {
    uint32_t last_acked_seq{UINT32_MAX};
    uint32_t next_seq_to_request{0};
    uint32_t next_seq_to_send{0};
    std::map<uint32_t, ChunkSlot> slots;

    void reset();
    uint32_t window_start() const;
    uint32_t inflight_count() const;
    bool window_full(uint8_t window_size) const;
    ChunkSlot *find(uint32_t sequence);
    const ChunkSlot *find(uint32_t sequence) const;
    void erase_acked(uint32_t acked_sequence);
  };

  using send_frame_fn_t = std::function<esp_err_t(const uint8_t *leaf_mac, espnow_packet_type_t type,
                                                  const uint8_t *payload, size_t len,
                                                  uint32_t *tx_counter_out)>;
  using request_chunk_fn_t = std::function<bool(uint32_t sequence, uint32_t offset, size_t length)>;
  using target_reachable_fn_t = std::function<bool(const uint8_t *leaf_mac)>;

  ESPNowOTAManager();
  explicit ESPNowOTAManager(Config config);

  void set_send_frame_fn(send_frame_fn_t fn) { send_frame_fn_ = std::move(fn); }
  void set_request_chunk_fn(request_chunk_fn_t fn) { request_chunk_fn_ = std::move(fn); }
  void set_target_reachable_fn(target_reachable_fn_t fn) { target_reachable_fn_ = std::move(fn); }

  bool start_transfer(const uint8_t *leaf_mac, uint32_t file_size, const uint8_t md5[16], uint8_t action,
                       uint16_t remote_max_frame_payload, const char *file_id = "ota.bin");

  bool on_source_chunk(uint32_t sequence, const uint8_t *data, size_t len);
  void on_source_abort(uint8_t reason = ESPNOW_LR_FILE_ABORT_USER);
  bool on_file_ack(const uint8_t *leaf_mac, const espnow_ack_t &ack_header, const uint8_t *trailing,
                   size_t trailing_len);
  void loop();
  std::string status_json() const;

  bool is_busy() const { return state_ != State::IDLE; }
  uint8_t progress_pct() const { return progress_pct_; }
  const std::string &last_error() const { return last_error_; }
  const WindowTracker &window() const { return window_; }
  uint16_t chunk_size() const { return negotiated_chunk_size_; }
  uint32_t file_size() const { return file_size_; }

 private:
  enum class State : uint8_t {
    IDLE = 0,
    ANNOUNCING,
    STREAMING,
    ENDING,
    ABORTING,
    COMPLETE,
    FAILED,
  };

  bool send_announce_();
  bool send_end_();
  bool send_abort_(uint8_t reason);
  bool send_chunk_(ChunkSlot &slot, bool retry);
  void request_window_chunks_();
  void pump_streaming_();
  void handle_accept_(const uint8_t *trailing, size_t trailing_len);
  void handle_progress_(const uint8_t *trailing, size_t trailing_len);
  void handle_complete_(const uint8_t *trailing, size_t trailing_len);
  void handle_reject_(const uint8_t *trailing, size_t trailing_len);
  void handle_abort_ack_(const uint8_t *trailing, size_t trailing_len);
  void fail_transfer_(uint8_t abort_reason, const std::string &message, bool notify_remote);
  void reset_();
  uint32_t calc_total_chunks_(uint16_t chunk_size) const;
  size_t expected_chunk_len_(uint32_t sequence) const;
  uint32_t chunk_offset_(uint32_t sequence) const;
  uint16_t clamp_chunk_size_(uint16_t remote_max_frame_payload) const;
  bool same_leaf_(const uint8_t *leaf_mac) const;
  std::string state_name_() const;
  std::string escape_json_(const std::string &value) const;

  Config config_{};
  send_frame_fn_t send_frame_fn_;
  request_chunk_fn_t request_chunk_fn_;
  target_reachable_fn_t target_reachable_fn_;

  State state_{State::IDLE};
  WindowTracker window_{};

  std::array<uint8_t, 6> leaf_mac_{};
  std::array<uint8_t, 16> md5_{};
  std::string file_id_;
  std::string last_error_;

  uint32_t file_size_{0};
  uint32_t total_chunks_{0};
  uint32_t transfer_started_ms_{0};
  uint32_t last_activity_ms_{0};
  uint32_t last_ack_received_ms_{0};
  uint32_t last_control_send_ms_{0};
  uint32_t announce_tx_counter_{0};
  uint32_t no_mem_backoff_until_ms_{0};
  uint16_t requested_chunk_size_{0};
  uint16_t negotiated_chunk_size_{0};
  uint16_t max_encrypted_plaintext_{0};
  uint8_t action_{0};
  uint8_t control_attempt_count_{0};
  uint8_t progress_pct_{0};
  uint8_t consecutive_no_mem_errors_{0};
  bool public_busy_{false};
  uint8_t public_progress_pct_{0};
  std::string public_state_{"IDLE"};
  std::array<uint8_t, 6> status_leaf_mac_{};

  void mark_no_mem_backoff_();
  void clear_no_mem_backoff_();
  bool target_reachable_() const;
  std::string format_mac_(const std::array<uint8_t, 6> &mac) const;
};

using BridgeFileManager = ESPNowOTAManager;

}  // namespace espnow_lr
}  // namespace esphome
