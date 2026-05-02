#include "remote_file_receiver.h"

#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <algorithm>
#include <array>
#include <cstring>
#include <limits>
#include <utility>
#include <vector>

#if defined(ARDUINO_ARCH_ESP8266)
#include <user_interface.h>
#elif defined(ESP_PLATFORM)
#include <esp_err.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#endif

namespace esphome {
namespace espnow_lr {

namespace {

static const char *const TAG = "espnow.file";
static constexpr uint8_t kEspImageMagic = 0xE9;
static constexpr uint32_t kRestartDelayMs = 250;
static constexpr uint32_t kFileStreamInactivityTimeoutMs = 30000U;

static uint32_t calc_expected_total(uint32_t file_size, uint16_t chunk_size) {
  if (chunk_size == 0) {
    return 0;
  }
  return (file_size / chunk_size) + ((file_size % chunk_size) != 0 ? 1U : 0U);
}

static size_t calc_expected_chunk_len(uint32_t file_size, uint16_t chunk_size, uint32_t sequence,
                                      uint32_t expected_total) {
  if (chunk_size == 0 || expected_total == 0 || sequence >= expected_total) {
    return 0;
  }
  const uint64_t offset = static_cast<uint64_t>(sequence) * static_cast<uint64_t>(chunk_size);
  if (offset >= file_size) {
    return 0;
  }
  const uint64_t remaining = static_cast<uint64_t>(file_size) - offset;
  return static_cast<size_t>(std::min<uint64_t>(remaining, chunk_size));
}

static uint32_t calc_chunk_offset(uint32_t sequence, uint16_t chunk_size) {
  const uint64_t offset = static_cast<uint64_t>(sequence) * static_cast<uint64_t>(chunk_size);
  if (offset > std::numeric_limits<uint32_t>::max()) {
    return std::numeric_limits<uint32_t>::max();
  }
  return static_cast<uint32_t>(offset);
}

}  // namespace

FileReceiver::FileReceiver() {
  this->register_handler(ESPNOW_LR_FILE_ACTION_OTA_FLASH, &ota_flash_handler_);
}

void FileReceiver::set_local_mac(const uint8_t *mac) {
  if (mac == nullptr) {
    return;
  }
  std::copy_n(mac, local_mac_.size(), local_mac_.begin());
}

void FileReceiver::set_max_chunk_size(uint16_t max_chunk) {
  max_chunk_size_ = max_chunk;
  ota_flash_handler_.set_max_chunk_size(max_chunk);
}

void FileReceiver::register_handler(uint8_t action, ActionHandler *handler) {
  if (handler == nullptr) {
    handlers_.erase(action);
    return;
  }
  handlers_[action] = handler;
}

bool FileReceiver::handle_file_transfer(const uint8_t *payload, size_t len) {
  if (payload == nullptr || len < 1) {
    return false;
  }

  last_activity_ms_ = millis();
  switch (payload[0]) {
    case ESPNOW_LR_FILE_PHASE_ANNOUNCE:
      if (len != sizeof(espnow_file_announce_t)) {
        ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE with invalid length=%u",
                 static_cast<unsigned>(len));
        return false;
      }
      return this->handle_announce_(*reinterpret_cast<const espnow_file_announce_t *>(payload));

    case ESPNOW_LR_FILE_PHASE_END:
      if (len != sizeof(espnow_file_end_t)) {
        ESP_LOGW(TAG, "Rejecting FILE_TRANSFER END with invalid length=%u",
                 static_cast<unsigned>(len));
        return false;
      }
      return this->handle_end_(*reinterpret_cast<const espnow_file_end_t *>(payload));

    case ESPNOW_LR_FILE_PHASE_ABORT:
      if (len != sizeof(espnow_file_abort_t)) {
        ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ABORT with invalid length=%u",
                 static_cast<unsigned>(len));
        return false;
      }
      return this->handle_abort_(*reinterpret_cast<const espnow_file_abort_t *>(payload));

    default:
      ESP_LOGW(TAG, "Rejecting FILE_TRANSFER with unknown phase=0x%02X", payload[0]);
      return false;
  }
}

bool FileReceiver::handle_announce_(const espnow_file_announce_t &announce) {
  if (!ota_enabled_ && announce.action == ESPNOW_LR_FILE_ACTION_OTA_FLASH) {
    ESP_LOGW(TAG, "Rejecting OTA ANNOUNCE because OTA-over-ESP-NOW is disabled");
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_UNSUPPORTED);
  }
  if (deep_sleep_active_) {
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE because deep sleep is active");
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_DEEP_SLEEP);
  }
  if (state_ != State::IDLE || (active_handler_ != nullptr && active_handler_->is_receiving())) {
    if (state_ == State::ANNOUNCED &&
        memcmp(file_id_, announce.file_id, sizeof(announce.file_id)) == 0 &&
        file_size_ == announce.file_size &&
        action_ == announce.action &&
        memcmp(last_announce_md5_, announce.md5, 16) == 0) {
      ESP_LOGI(TAG, "Duplicate announce for active transfer, re-sending accept");
      return this->send_ack_accept_(chunk_size_, action_) ? true : false;
    }
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE because a transfer is already active");
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_ALREADY);
  }
  if (announce.file_size == 0 || announce.chunk_size == 0 || announce.window_size == 0) {
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE with invalid parameters size=%u chunk=%u window=%u",
             static_cast<unsigned>(announce.file_size), static_cast<unsigned>(announce.chunk_size),
             static_cast<unsigned>(announce.window_size));
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_UNSUPPORTED);
  }
  if (announce.window_size > ESPNOW_LR_FILE_DEFAULT_WINDOW_SIZE) {
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE with unsupported window=%u (max=%u)",
             static_cast<unsigned>(announce.window_size),
             static_cast<unsigned>(ESPNOW_LR_FILE_DEFAULT_WINDOW_SIZE));
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_UNSUPPORTED);
  }

  auto handler_it = handlers_.find(announce.action);
  if (handler_it == handlers_.end() || handler_it->second == nullptr) {
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE for unsupported action=0x%02X", announce.action);
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_UNSUPPORTED);
  }

  char file_id[sizeof(announce.file_id) + 1] = {0};
  std::memcpy(file_id, announce.file_id, sizeof(announce.file_id));

  AnnounceResponse response = handler_it->second->on_announce(announce.file_size, announce.md5,
                                                              announce.chunk_size, announce.window_size,
                                                              announce.action, file_id);
  if (!response.accepted) {
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE for action=0x%02X reason=%u",
             announce.action, static_cast<unsigned>(response.reject_reason));
    return this->send_ack_reject_(announce.action, response.reject_reason);
  }

  if (response.negotiated_chunk_size == 0 ||
      response.negotiated_chunk_size > announce.chunk_size ||
      response.negotiated_chunk_size > max_chunk_size_) {
    ESP_LOGW(TAG, "Rejecting FILE_TRANSFER ANNOUNCE due to invalid negotiated chunk=%u",
             static_cast<unsigned>(response.negotiated_chunk_size));
    handler_it->second->on_abort(ESPNOW_LR_FILE_ABORT_FLASH_ERROR);
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_UNSUPPORTED);
  }

  const uint32_t expected_total = calc_expected_total(announce.file_size, response.negotiated_chunk_size);
  if (expected_total == 0) {
    handler_it->second->on_abort(ESPNOW_LR_FILE_ABORT_FLASH_ERROR);
    return this->send_ack_reject_(announce.action, ESPNOW_LR_FILE_REJECT_UNSUPPORTED);
  }

  active_handler_ = handler_it->second;
  file_size_ = announce.file_size;
  chunk_size_ = response.negotiated_chunk_size;
  window_size_ = announce.window_size;
  action_ = announce.action;
  std::memcpy(file_id_, announce.file_id, sizeof(file_id_));
  expected_total_ = expected_total;
  acked_sequence_ = UINT32_MAX;
  chunks_since_last_ack_ = 0;
  last_ack_sent_ms_ = 0;
  receive_buffer_.clear();
  state_ = State::ANNOUNCED;
  std::memcpy(last_announce_md5_, announce.md5, 16);

  const bool ack_sent = this->send_ack_accept_(chunk_size_, action_);
  if (!ack_sent) {
    active_handler_->on_abort(ESPNOW_LR_FILE_ABORT_SEND_FAILURE);
    this->reset_();
    return false;
  }

  ESP_LOGI(TAG, "Accepted FILE_TRANSFER action=0x%02X size=%u chunk=%u window=%u chunks=%u",
           static_cast<unsigned>(action_), static_cast<unsigned>(file_size_),
           static_cast<unsigned>(chunk_size_), static_cast<unsigned>(window_size_),
           static_cast<unsigned>(expected_total_));
  return true;
}

bool FileReceiver::handle_end_(const espnow_file_end_t &end_packet) {
  if (end_packet.phase != ESPNOW_LR_FILE_PHASE_END) {
    return false;
  }
  if (state_ == State::IDLE || active_handler_ == nullptr) {
    ESP_LOGW(TAG, "Ignoring FILE_TRANSFER END with no active transfer");
    return false;
  }
  if (!all_chunks_received_()) {
    ESP_LOGW(TAG, "Aborting FILE_TRANSFER END because chunks are still missing");
    this->abort(ESPNOW_LR_FILE_ABORT_TIMEOUT, true);
    return true;
  }

  const uint8_t current_action = action_;
  const uint8_t result = active_handler_->on_end();
  const bool should_restart = (result == ESPNOW_LR_FILE_COMPLETE_SUCCESS) &&
                              active_handler_->wants_restart_after_complete();
  bool ack_sent = false;
  if (should_restart) {
    for (int i = 0; i < 5; i++) {
      ack_sent = this->send_ack_complete_(action_, result);
      delay(1000);
    }
  } else {
    ack_sent = this->send_ack_complete_(action_, result);
  }
  this->reset_();
  if (should_restart && ack_sent) {
    this->schedule_restart_();
  }

  ESP_LOGI(TAG, "Completed FILE_TRANSFER action=0x%02X result=%u",
           static_cast<unsigned>(current_action), static_cast<unsigned>(result));
  return ack_sent;
}

bool FileReceiver::handle_abort_(const espnow_file_abort_t &abort_packet) {
  if (abort_packet.phase != ESPNOW_LR_FILE_PHASE_ABORT) {
    return false;
  }
  if (state_ == State::IDLE || active_handler_ == nullptr) {
    return true;
  }

  ESP_LOGW(TAG, "Peer aborted FILE_TRANSFER reason=%u", static_cast<unsigned>(abort_packet.reason));
  active_handler_->on_abort(abort_packet.reason);
  this->reset_();
  return true;
}

bool FileReceiver::handle_file_data(const uint8_t *payload, size_t len) {
  if (payload == nullptr || len < sizeof(espnow_file_data_header_t)) {
    return false;
  }
  if ((state_ != State::ANNOUNCED && state_ != State::STREAMING) || active_handler_ == nullptr) {
    ESP_LOGW(TAG, "Dropping FILE_DATA without an active transfer");
    return false;
  }

  const auto *header = reinterpret_cast<const espnow_file_data_header_t *>(payload);
  const uint8_t *data = payload + sizeof(*header);
  const size_t data_len = len - sizeof(*header);

  if (header->sequence >= expected_total_) {
    ESP_LOGW(TAG, "Dropping FILE_DATA seq=%u beyond expected_total=%u",
             static_cast<unsigned>(header->sequence), static_cast<unsigned>(expected_total_));
    return false;
  }

  const uint32_t expected_offset = calc_chunk_offset(header->sequence, chunk_size_);
  if (expected_offset == std::numeric_limits<uint32_t>::max() || header->offset != expected_offset) {
    ESP_LOGW(TAG, "Dropping FILE_DATA seq=%u due to offset mismatch got=%u expected=%u",
             static_cast<unsigned>(header->sequence), static_cast<unsigned>(header->offset),
             static_cast<unsigned>(expected_offset));
    return false;
  }

  const size_t expected_len = calc_expected_chunk_len(file_size_, chunk_size_, header->sequence, expected_total_);
  if (expected_len == 0 || data_len != expected_len) {
    ESP_LOGW(TAG, "Dropping FILE_DATA seq=%u due to length mismatch got=%u expected=%u",
             static_cast<unsigned>(header->sequence), static_cast<unsigned>(data_len),
             static_cast<unsigned>(expected_len));
    return false;
  }

  last_activity_ms_ = millis();
  uint32_t delivered_chunks = 0;

  if (acked_sequence_ == UINT32_MAX) {
    if (header->sequence == 0) {
      if (!this->deliver_chunk_(0, data, data_len, delivered_chunks)) {
        return false;
      }
      if (!this->flush_buffered_chunks_(delivered_chunks)) {
        return false;
      }
    } else {
      if (header->sequence >= window_size_) {
        ESP_LOGW(TAG, "Dropping FILE_DATA seq=%u outside initial window=%u",
                 static_cast<unsigned>(header->sequence), static_cast<unsigned>(window_size_));
        return false;
      }
      if (receive_buffer_.find(header->sequence) == receive_buffer_.end()) {
        receive_buffer_.emplace(header->sequence, BufferedChunk{header->sequence, std::vector<uint8_t>(data, data + data_len)});
      }
      return true;
    }
  } else {
    if (header->sequence <= acked_sequence_) {
      return this->send_ack_progress_(acked_sequence_, progress_pct_());
    }

    const uint32_t next_expected = acked_sequence_ + 1;
    const uint64_t window_limit = static_cast<uint64_t>(next_expected) + static_cast<uint64_t>(window_size_);
    if (header->sequence >= window_limit) {
      ESP_LOGW(TAG, "Dropping FILE_DATA seq=%u outside receive window start=%u size=%u",
               static_cast<unsigned>(header->sequence), static_cast<unsigned>(next_expected),
               static_cast<unsigned>(window_size_));
      return false;
    }

    if (header->sequence == next_expected) {
      if (!this->deliver_chunk_(header->sequence, data, data_len, delivered_chunks)) {
        return false;
      }
      if (!this->flush_buffered_chunks_(delivered_chunks)) {
        return false;
      }
    } else if (receive_buffer_.find(header->sequence) == receive_buffer_.end()) {
      receive_buffer_.emplace(header->sequence,
                              BufferedChunk{header->sequence, std::vector<uint8_t>(data, data + data_len)});
    }
  }

  if (delivered_chunks == 0 || state_ == State::IDLE) {
    return true;
  }

  if (all_chunks_received_() || chunks_since_last_ack_ >= ESPNOW_LR_FILE_ACK_INTERVAL) {
    return this->send_ack_progress_(acked_sequence_, progress_pct_());
  }
  return true;
}

void FileReceiver::loop() {
  this->perform_restart_if_due_();

  if (state_ == State::IDLE || active_handler_ == nullptr) {
    return;
  }

  const uint32_t now = millis();
  const uint32_t timeout_ms = (state_ == State::ANNOUNCED)
                                  ? ESPNOW_LR_FILE_ANNOUNCE_TIMEOUT_MS
                                  : std::max<uint32_t>(ESPNOW_LR_FILE_ACK_TIMEOUT_MS * ESPNOW_LR_FILE_MAX_RETRIES,
                                                       kFileStreamInactivityTimeoutMs);

  if ((now - last_activity_ms_) > timeout_ms) {
    ESP_LOGW(TAG, "Aborting FILE_TRANSFER due to inactivity timeout");
    this->abort(ESPNOW_LR_FILE_ABORT_TIMEOUT, true);
  }
}

void FileReceiver::abort(uint8_t reason, bool notify_sender) {
  if (active_handler_ != nullptr) {
    active_handler_->on_abort(reason);
  }
  if (notify_sender) {
    this->send_ack_abort_(reason);
  }
  this->reset_();
}

bool FileReceiver::deliver_chunk_(uint32_t sequence, const uint8_t *data, size_t len, uint32_t &delivered_chunks) {
  if (active_handler_ == nullptr || data == nullptr) {
    return false;
  }

  const uint32_t offset = calc_chunk_offset(sequence, chunk_size_);
  if (offset == std::numeric_limits<uint32_t>::max()) {
    this->abort(ESPNOW_LR_FILE_ABORT_FLASH_ERROR, true);
    return false;
  }

  ChunkResponse response = active_handler_->on_data(sequence, offset, data, len);
  if (!response.accepted) {
    ESP_LOGE(TAG, "FILE_DATA delivery failed seq=%u abort_reason=%u",
             static_cast<unsigned>(sequence), static_cast<unsigned>(response.abort_reason));
    this->abort(response.abort_reason, true);
    return false;
  }

  acked_sequence_ = sequence;
  state_ = State::STREAMING;
  ++chunks_since_last_ack_;
  ++delivered_chunks;
  last_activity_ms_ = millis();
  delay(0);
  return true;
}

bool FileReceiver::flush_buffered_chunks_(uint32_t &delivered_chunks) {
  while (active_handler_ != nullptr && acked_sequence_ != UINT32_MAX) {
    const uint32_t next_expected = acked_sequence_ + 1;
    auto it = receive_buffer_.find(next_expected);
    if (it == receive_buffer_.end()) {
      break;
    }

    std::vector<uint8_t> chunk = std::move(it->second.data);
    receive_buffer_.erase(it);
    if (!this->deliver_chunk_(next_expected, chunk.data(), chunk.size(), delivered_chunks)) {
      return false;
    }
  }
  return true;
}

bool FileReceiver::send_ack_(uint8_t result, const uint8_t *trailing, size_t trailing_len) {
  if (!send_ack_fn_) {
    return false;
  }

  std::vector<uint8_t> payload(sizeof(espnow_ack_t) + trailing_len, 0);
  auto *ack = reinterpret_cast<espnow_ack_t *>(payload.data());
  ack->ack_type = PKT_FILE_TRANSFER;
  ack->result = result;
  ack->ref_tx_counter = announce_tx_counter_;
  if (trailing_len > 0 && trailing != nullptr) {
    std::memcpy(payload.data() + sizeof(*ack), trailing, trailing_len);
  }

  const bool sent = send_ack_fn_(payload.data(), payload.size());
  if (sent) {
    last_ack_sent_ms_ = millis();
    if (result == ESPNOW_LR_FILE_ACK_PROGRESS) {
      chunks_since_last_ack_ = 0;
    }
  }
  return sent;
}

bool FileReceiver::send_ack_accept_(uint16_t chunk_size, uint8_t action) {
  std::array<uint8_t, 3> trailing{};
  std::memcpy(trailing.data(), &chunk_size, sizeof(chunk_size));
  trailing[2] = action;
  return this->send_ack_(ESPNOW_LR_FILE_ACK_ACCEPT, trailing.data(), trailing.size());
}

bool FileReceiver::send_ack_reject_(uint8_t action, uint8_t reason) {
  const uint8_t trailing[2] = {action, reason};
  return this->send_ack_(ESPNOW_LR_FILE_ACK_REJECT, trailing, sizeof(trailing));
}

bool FileReceiver::send_ack_progress_(uint32_t acked_sequence, uint8_t progress_pct) {
  std::array<uint8_t, 5> trailing{};
  std::memcpy(trailing.data(), &acked_sequence, sizeof(acked_sequence));
  trailing[4] = progress_pct;
  return this->send_ack_(ESPNOW_LR_FILE_ACK_PROGRESS, trailing.data(), trailing.size());
}

bool FileReceiver::send_ack_complete_(uint8_t action, uint8_t result) {
  const uint8_t trailing[2] = {action, result};
  return this->send_ack_(ESPNOW_LR_FILE_ACK_COMPLETE, trailing, sizeof(trailing));
}

bool FileReceiver::send_ack_abort_(uint8_t reason) {
  const uint8_t trailing[1] = {reason};
  return this->send_ack_(ESPNOW_LR_FILE_ACK_ABORT, trailing, sizeof(trailing));
}

bool FileReceiver::all_chunks_received_() const {
  return expected_total_ > 0 && acked_sequence_ != UINT32_MAX && (acked_sequence_ + 1) == expected_total_;
}

uint8_t FileReceiver::progress_pct_() const {
  if (file_size_ == 0 || acked_sequence_ == UINT32_MAX) {
    return 0;
  }

  const uint64_t delivered_bytes = std::min<uint64_t>(
      file_size_, (static_cast<uint64_t>(acked_sequence_) + 1ULL) * static_cast<uint64_t>(chunk_size_));
  if (delivered_bytes >= file_size_) {
    return 100;
  }

  uint8_t pct = static_cast<uint8_t>((delivered_bytes * 100ULL) / file_size_);
  if (pct >= 100) {
    pct = 99;
  }
  return pct;
}

void FileReceiver::reset_() {
  state_ = State::IDLE;
  active_handler_ = nullptr;
  file_size_ = 0;
  chunk_size_ = 0;
  window_size_ = ESPNOW_LR_FILE_DEFAULT_WINDOW_SIZE;
  action_ = 0;
  std::memset(file_id_, 0, sizeof(file_id_));
  std::memset(last_announce_md5_, 0, sizeof(last_announce_md5_));
  announce_tx_counter_ = 0;
  acked_sequence_ = UINT32_MAX;
  expected_total_ = 0;
  last_activity_ms_ = 0;
  last_ack_sent_ms_ = 0;
  chunks_since_last_ack_ = 0;
  receive_buffer_.clear();
}

void FileReceiver::schedule_restart_() {
  restart_pending_ = true;
  restart_due_ms_ = millis() + kRestartDelayMs;
}

void FileReceiver::perform_restart_if_due_() {
  if (!restart_pending_) {
    return;
  }
  if (static_cast<int32_t>(millis() - restart_due_ms_) < 0) {
    return;
  }

  restart_pending_ = false;
  ESP_LOGI(TAG, "Restarting after OTA COMPLETE ACK handoff");
#if defined(ARDUINO_ARCH_ESP8266)
  delay(50);
  ESP.restart();
#elif defined(ESP_PLATFORM)
  delay(50);
  esp_restart();
#endif
}

FileReceiver::AnnounceResponse FileReceiver::OTAFlashHandler::on_announce(uint32_t file_size, const uint8_t md5[16],
                                                                          uint16_t chunk_size, uint8_t window_size,
                                                                          uint8_t action, const char *file_id) {
  (void) window_size;
  (void) action;
  (void) file_id;

  AnnounceResponse response{};
  if (state_ != State::IDLE) {
    response.reject_reason = ESPNOW_LR_FILE_REJECT_ALREADY;
    return response;
  }
  if (file_size == 0 || chunk_size == 0) {
    response.reject_reason = ESPNOW_LR_FILE_REJECT_UNSUPPORTED;
    return response;
  }

  const uint16_t negotiated_chunk_size = std::min<uint16_t>(chunk_size, max_chunk_size_);
  if (negotiated_chunk_size == 0) {
    response.reject_reason = ESPNOW_LR_FILE_REJECT_UNSUPPORTED;
    return response;
  }

#if defined(ARDUINO_ARCH_ESP8266)
  // TODO(esp8266): Implement OTA-over-ESP-NOW using Arduino UpdaterClass.
  // ESPHome excludes Updater.cpp from the build, so we need a custom impl.
  // Pending that, reject OTA announce for ESP8266 targets.
  response.reject_reason = ESPNOW_LR_FILE_REJECT_UNSUPPORTED;
#elif defined(ESP_PLATFORM)
  update_partition_ = esp_ota_get_next_update_partition(nullptr);
  if (update_partition_ == nullptr) {
    response.reject_reason = ESPNOW_LR_FILE_REJECT_UNSUPPORTED;
    return response;
  }
  if (file_size > update_partition_->size) {
    response.reject_reason = ESPNOW_LR_FILE_REJECT_NO_SPACE;
    return response;
  }

  ota_handle_ = 0;
  const esp_err_t begin_err = esp_ota_begin(update_partition_, file_size, &ota_handle_);
  if (begin_err != ESP_OK) {
    ESP_LOGE(TAG, "esp_ota_begin failed: %s", esp_err_to_name(begin_err));
    response.reject_reason = ESPNOW_LR_FILE_REJECT_BUSY;
    return response;
  }
#else
  static esp_partition_t host_partition{4U * 1024U * 1024U};
  update_partition_ = &host_partition;
  ota_handle_ = 1;
  if (file_size > update_partition_->size) {
    response.reject_reason = ESPNOW_LR_FILE_REJECT_NO_SPACE;
    return response;
  }
#endif

  if (!begin_md5_()) {
#if defined(ESP_PLATFORM)
    esp_ota_abort(ota_handle_);
#endif
    ota_handle_ = 0;
    update_partition_ = nullptr;
    response.reject_reason = ESPNOW_LR_FILE_REJECT_BUSY;
    return response;
  }

  file_size_ = file_size;
  chunk_size_ = negotiated_chunk_size;
  total_written_ = 0;
  restart_requested_ = false;
  expected_md5_.fill(0);
  std::memcpy(expected_md5_.data(), md5, expected_md5_.size());
  state_ = State::RECEIVING;

  response.accepted = true;
  response.negotiated_chunk_size = negotiated_chunk_size;
  return response;
}

FileReceiver::ChunkResponse FileReceiver::OTAFlashHandler::on_data(uint32_t sequence, uint32_t offset,
                                                                   const uint8_t *data, size_t len) {
  (void) sequence;
  (void) offset;

  ChunkResponse response{};
  if (state_ != State::RECEIVING || data == nullptr || len == 0) {
    response.accepted = false;
    response.abort_reason = ESPNOW_LR_FILE_ABORT_FLASH_ERROR;
    return response;
  }

  if (total_written_ == 0 && data[0] != kEspImageMagic) {
    ESP_LOGE(TAG, "Rejecting OTA image with invalid magic byte 0x%02X", data[0]);
    response.accepted = false;
    response.abort_reason = ESPNOW_LR_FILE_ABORT_FLASH_ERROR;
    return response;
  }

#if defined(ARDUINO_ARCH_ESP8266)
  // TODO(esp8266): OTA-over-ESP-NOW not implemented — ESP8266 rejects OTA data.
  (void) data;
  (void) len;
  response.accepted = false;
  response.abort_reason = ESPNOW_LR_FILE_ABORT_FLASH_ERROR;
#elif defined(ESP_PLATFORM)
  const esp_err_t write_err = esp_ota_write(ota_handle_, data, len);
  if (write_err != ESP_OK) {
    ESP_LOGE(TAG, "esp_ota_write failed: %s", esp_err_to_name(write_err));
    response.accepted = false;
    response.abort_reason = ESPNOW_LR_FILE_ABORT_FLASH_ERROR;
    return response;
  }
#endif

  if (!update_md5_(data, len)) {
    response.accepted = false;
    response.abort_reason = ESPNOW_LR_FILE_ABORT_FLASH_ERROR;
    return response;
  }

  total_written_ += static_cast<uint32_t>(len);
  delay(0);
  return response;
}

uint8_t FileReceiver::OTAFlashHandler::on_end() {
  if (state_ != State::RECEIVING) {
    return ESPNOW_LR_FILE_COMPLETE_ABORTED;
  }

  state_ = State::VERIFYING;
  if (total_written_ != file_size_) {
#if defined(ESP_PLATFORM)
    esp_ota_abort(ota_handle_);
#endif
    reset_state_();
    return ESPNOW_LR_FILE_COMPLETE_WRITE_ERROR;
  }

  uint8_t computed_md5[16] = {0};
  if (!finish_md5_(computed_md5)) {
#if defined(ESP_PLATFORM)
    esp_ota_abort(ota_handle_);
#endif
    reset_state_();
    return ESPNOW_LR_FILE_COMPLETE_FLASH_ERROR;
  }

  if (std::memcmp(computed_md5, expected_md5_.data(), expected_md5_.size()) != 0) {
#if defined(ESP_PLATFORM)
    esp_ota_abort(ota_handle_);
#endif
    reset_state_();
    return ESPNOW_LR_FILE_COMPLETE_MD5_MISMATCH;
  }

#if defined(ESP_PLATFORM)
  const esp_err_t end_err = esp_ota_end(ota_handle_);
  if (end_err != ESP_OK) {
    ESP_LOGE(TAG, "esp_ota_end failed: %s", esp_err_to_name(end_err));
    reset_state_();
    return ESPNOW_LR_FILE_COMPLETE_FLASH_ERROR;
  }

  const esp_err_t set_boot_err = esp_ota_set_boot_partition(update_partition_);
  if (set_boot_err != ESP_OK) {
    ESP_LOGE(TAG, "esp_ota_set_boot_partition failed: %s", esp_err_to_name(set_boot_err));
    reset_state_();
    return ESPNOW_LR_FILE_COMPLETE_FLASH_ERROR;
  }
#endif
  // NOTE: ESP8266 OTA-over-ESP-NOW not implemented (see on_announce TODO).
  // If ESP8266 ever calls on_end() for OTA it means something is wrong,
  // since on_announce already rejects all OTA. Still, we guard here.

  reset_state_();
  restart_requested_ = true;
  return ESPNOW_LR_FILE_COMPLETE_SUCCESS;
}

void FileReceiver::OTAFlashHandler::on_abort(uint8_t reason) {
  (void) reason;
#if defined(ESP_PLATFORM)
  if (state_ != State::IDLE && ota_handle_ != 0) {
    esp_ota_abort(ota_handle_);
  }
#endif
  reset_state_();
}

void FileReceiver::OTAFlashHandler::reset_state_() {
  state_ = State::IDLE;
  file_size_ = 0;
  chunk_size_ = 0;
  total_written_ = 0;
  restart_requested_ = false;
  expected_md5_.fill(0);
  update_partition_ = nullptr;
  ota_handle_ = 0;
  md5_active_ = false;
}

bool FileReceiver::OTAFlashHandler::begin_md5_() {
  md5_digest_.init();
  md5_active_ = true;
  return true;
}

bool FileReceiver::OTAFlashHandler::update_md5_(const uint8_t *data, size_t len) {
  if (!md5_active_) {
    return false;
  }
  md5_digest_.add(data, len);
  return true;
}

bool FileReceiver::OTAFlashHandler::finish_md5_(uint8_t out[16]) {
  if (!md5_active_) {
    return false;
  }
  md5_digest_.calculate();
  md5_digest_.get_bytes(out);
  md5_active_ = false;
  return true;
}

}  // namespace espnow_lr
}  // namespace esphome
