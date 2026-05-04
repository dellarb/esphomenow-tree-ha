#include "bridge_ota_manager.h"

#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>
#include <limits>
#include <sstream>
#include <utility>
#include <vector>

#ifndef ESP_ERR_ESPNOW_NO_MEM
#define ESP_ERR_ESPNOW_NO_MEM 0x3067
#endif

namespace esphome {
namespace espnow_lr {

namespace {

static const char *const TAG = "espnow.ota";
static constexpr size_t FILE_ID_LEN = 12;

static std::string reject_reason_to_string(uint8_t reason) {
  switch (reason) {
    case ESPNOW_LR_FILE_REJECT_BUSY:
      return "busy";
    case ESPNOW_LR_FILE_REJECT_NO_SPACE:
      return "no_space";
    case ESPNOW_LR_FILE_REJECT_UNSUPPORTED:
      return "unsupported_action";
    case ESPNOW_LR_FILE_REJECT_ALREADY:
      return "already_receiving";
    case ESPNOW_LR_FILE_REJECT_DEEP_SLEEP:
      return "deep_sleep";
    case ESPNOW_LR_FILE_REJECT_CHIP_MISMATCH:
      return "chip_mismatch";
    default:
      return "reject_unknown";
  }
}

static std::string complete_result_to_string(uint8_t result) {
  switch (result) {
    case ESPNOW_LR_FILE_COMPLETE_SUCCESS:
      return "success";
    case ESPNOW_LR_FILE_COMPLETE_MD5_MISMATCH:
      return "md5_mismatch";
    case ESPNOW_LR_FILE_COMPLETE_FLASH_ERROR:
      return "flash_error";
    case ESPNOW_LR_FILE_COMPLETE_WRITE_ERROR:
      return "write_error";
    case ESPNOW_LR_FILE_COMPLETE_ABORTED:
      return "aborted";
    default:
      return "complete_unknown";
  }
}

static std::string abort_reason_to_string(uint8_t reason) {
  switch (reason) {
    case ESPNOW_LR_FILE_ABORT_USER:
      return "user_abort";
    case ESPNOW_LR_FILE_ABORT_TIMEOUT:
      return "timeout";
    case ESPNOW_LR_FILE_ABORT_SESSION_LOST:
      return "session_lost";
    case ESPNOW_LR_FILE_ABORT_SEND_FAILURE:
      return "send_failure";
    case ESPNOW_LR_FILE_ABORT_FLASH_ERROR:
      return "flash_error";
    default:
      return "abort_unknown";
  }
}

}  // namespace

void ESPNowOTAManager::WindowTracker::reset() {
  last_acked_seq = UINT32_MAX;
  next_seq_to_request = 0;
  next_seq_to_send = 0;
  slots.clear();
}

uint32_t ESPNowOTAManager::WindowTracker::window_start() const {
  return last_acked_seq == UINT32_MAX ? 0U : last_acked_seq + 1U;
}

uint32_t ESPNowOTAManager::WindowTracker::inflight_count() const { return static_cast<uint32_t>(slots.size()); }

bool ESPNowOTAManager::WindowTracker::window_full(uint8_t window_size) const {
  return inflight_count() >= static_cast<uint32_t>(window_size);
}

ESPNowOTAManager::ChunkSlot *ESPNowOTAManager::WindowTracker::find(uint32_t sequence) {
  auto it = slots.find(sequence);
  return it == slots.end() ? nullptr : &it->second;
}

const ESPNowOTAManager::ChunkSlot *ESPNowOTAManager::WindowTracker::find(uint32_t sequence) const {
  auto it = slots.find(sequence);
  return it == slots.end() ? nullptr : &it->second;
}

void ESPNowOTAManager::WindowTracker::erase_acked(uint32_t acked_sequence) {
  auto it = slots.begin();
  while (it != slots.end() && it->first <= acked_sequence) {
    it = slots.erase(it);
  }
}

ESPNowOTAManager::ESPNowOTAManager() = default;

ESPNowOTAManager::ESPNowOTAManager(Config config) : config_(config) {}

bool ESPNowOTAManager::start_transfer(const uint8_t *leaf_mac, uint32_t file_size, const uint8_t md5[16], uint8_t action,
                                      uint16_t remote_max_frame_payload, const char *file_id) {
  if (leaf_mac == nullptr || md5 == nullptr || file_size == 0) {
    return false;
  }
  if (is_busy()) {
    last_error_ = "busy";
    return false;
  }
  if (!send_frame_fn_) {
    last_error_ = "send_frame_fn not configured";
    return false;
  }

  const uint16_t requested_chunk_size = clamp_chunk_size_(remote_max_frame_payload);
  if (requested_chunk_size < config_.min_chunk_size) {
    last_error_ = "remote chunk size below minimum";
    return false;
  }

  max_encrypted_plaintext_ = espnow_max_plaintext(remote_max_frame_payload);

  reset_();
  std::copy_n(leaf_mac, leaf_mac_.size(), leaf_mac_.begin());
  status_leaf_mac_ = leaf_mac_;
  std::copy_n(md5, md5_.size(), md5_.begin());
  file_size_ = file_size;
  requested_chunk_size_ = requested_chunk_size;
  negotiated_chunk_size_ = requested_chunk_size;
  action_ = action;
  file_id_ = file_id != nullptr ? file_id : "ota.bin";
  if (file_id_.size() > FILE_ID_LEN) {
    file_id_.resize(FILE_ID_LEN);
  }
  transfer_started_ms_ = millis();
  last_activity_ms_ = transfer_started_ms_;
  total_chunks_ = calc_total_chunks_(requested_chunk_size_);
  public_busy_ = true;
  public_progress_pct_ = 0;
  public_state_ = "START_RECEIVED";
  last_error_.clear();
  if (total_chunks_ == 0) {
    last_error_ = "invalid chunk geometry";
    public_busy_ = false;
    public_state_ = "FAIL";
    reset_();
    return false;
  }

  state_ = State::ANNOUNCING;
  if (!send_announce_() && state_ == State::IDLE) {
    return false;
  }
  return true;
}

bool ESPNowOTAManager::on_source_chunk(uint32_t sequence, const uint8_t *data, size_t len) {
  ESP_LOGI(TAG, "on_source_chunk: seq=%u len=%u state=%d negotiated_chunk=%u", static_cast<unsigned>(sequence),
           static_cast<unsigned>(len), static_cast<int>(state_), static_cast<unsigned>(negotiated_chunk_size_));
  if (state_ != State::STREAMING || data == nullptr) {
    return false;
  }
  if (sequence >= total_chunks_) {
    return false;
  }
  if (sequence < window_.window_start()) {
    return false;
  }
  if (window_.window_full(config_.window_size) && window_.find(sequence) == nullptr) {
    return false;
  }

  ChunkSlot *slot = window_.find(sequence);
  if (slot == nullptr) {
    return false;
  }
  if (!slot->requested) {
    return false;
  }

  const size_t expected_len = expected_chunk_len_(sequence);
  if (expected_len == 0 || len != expected_len) {
    ESP_LOGW(TAG, "Rejecting source chunk seq=%u len=%u expected=%u", static_cast<unsigned>(sequence),
             static_cast<unsigned>(len), static_cast<unsigned>(expected_len));
    return false;
  }

  slot->data.assign(data, data + static_cast<std::ptrdiff_t>(len));
  slot->ready = true;
  last_activity_ms_ = millis();
  pump_streaming_();
  return true;
}

void ESPNowOTAManager::on_source_abort(uint8_t reason) {
  if (!is_busy()) {
    return;
  }
  fail_transfer_(reason, abort_reason_to_string(reason), true);
}

bool ESPNowOTAManager::on_file_ack(const uint8_t *leaf_mac, const espnow_ack_t &ack_header, const uint8_t *trailing,
                                   size_t trailing_len) {
  if (!is_busy() || leaf_mac == nullptr) {
    return false;
  }
  if (ack_header.ack_type != PKT_FILE_TRANSFER) {
    return false;
  }
  if (!same_leaf_(leaf_mac)) {
    return false;
  }
  if (ack_header.ref_tx_counter != announce_tx_counter_) {
    ESP_LOGD(TAG, "Ignoring stale FILE ACK ref_tx=%u expected=%u", static_cast<unsigned>(ack_header.ref_tx_counter),
             static_cast<unsigned>(announce_tx_counter_));
    return false;
  }

  last_activity_ms_ = millis();
  switch (ack_header.result) {
    case ESPNOW_LR_FILE_ACK_ACCEPT:
      if (state_ == State::ANNOUNCING) {
        handle_accept_(trailing, trailing_len);
      }
      return true;

    case ESPNOW_LR_FILE_ACK_REJECT:
      handle_reject_(trailing, trailing_len);
      return true;

    case ESPNOW_LR_FILE_ACK_PROGRESS:
      if (state_ == State::STREAMING || state_ == State::ENDING) {
        handle_progress_(trailing, trailing_len);
      }
      return true;

    case ESPNOW_LR_FILE_ACK_COMPLETE:
      if (state_ == State::ENDING) {
        handle_complete_(trailing, trailing_len);
      }
      return true;

    case ESPNOW_LR_FILE_ACK_ABORT:
      handle_abort_ack_(trailing, trailing_len);
      return true;

    default:
      return false;
  }
}

void ESPNowOTAManager::loop() {
  if (!is_busy()) {
    return;
  }

  const uint32_t now = millis();
  if (!target_reachable_()) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SESSION_LOST, "target unreachable", false);
    return;
  }
  if (config_.global_timeout_ms > 0 && (now - transfer_started_ms_) > config_.global_timeout_ms) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_TIMEOUT, "transfer global timeout", true);
    return;
  }
  if (now < no_mem_backoff_until_ms_) {
    return;
  }

  switch (state_) {
    case State::ANNOUNCING:
      if (control_attempt_count_ == 0 || (now - last_control_send_ms_) >= config_.ack_timeout_ms) {
        if (!send_announce_() && state_ == State::IDLE) {
          return;
        }
      }
      break;

    case State::STREAMING:
      request_window_chunks_();
      pump_streaming_();
      for (auto &entry : window_.slots) {
        ChunkSlot &slot = entry.second;
        if (!slot.sent || now < slot.last_send_ms) {
          continue;
        }
        if ((now - slot.last_send_ms) < config_.ack_timeout_ms) {
          continue;
        }
        if (!send_chunk_(slot, true) && state_ == State::IDLE) {
          return;
        }
        if (millis() < no_mem_backoff_until_ms_) {
          return;
        }
      }
      if (window_.inflight_count() > 0 && config_.remote_silence_timeout_ms > 0 &&
          (now - last_ack_received_ms_) > config_.remote_silence_timeout_ms) {
        fail_transfer_(ESPNOW_LR_FILE_ABORT_TIMEOUT,
                        "remote ACK silence timeout: " + std::to_string(now - last_ack_received_ms_) + "ms",
                        true);
        return;
      }
      break;

    case State::ENDING:
      if (control_attempt_count_ == 0 || (now - last_control_send_ms_) >= config_.ack_timeout_ms) {
        if (!send_end_() && state_ == State::IDLE) {
          return;
        }
      }
      break;

    case State::ABORTING:
    case State::IDLE:
      break;
  }
}

std::string ESPNowOTAManager::status_json() const {
  std::ostringstream json;
  json << '{'
       << "\"state\":\"" << public_state_ << "\","
       << "\"busy\":" << (public_busy_ ? "true" : "false") << ','
       << "\"leaf_mac\":\"" << format_mac_(public_busy_ ? leaf_mac_ : status_leaf_mac_) << "\","
       << "\"file_size\":" << file_size_ << ','
       << "\"chunk_size\":" << negotiated_chunk_size_ << ','
       << "\"window_size\":" << static_cast<unsigned>(config_.window_size) << ','
       << "\"last_acked_seq\":";
  if (window_.last_acked_seq == UINT32_MAX) {
    json << -1;
  } else {
    json << window_.last_acked_seq;
  }
  json << ','
       << "\"next_seq_to_send\":" << window_.next_seq_to_send << ','
       << "\"next_seq_to_request\":" << window_.next_seq_to_request << ','
       << "\"inflight_slots\":" << window_.inflight_count() << ','
       << "\"total_chunks\":" << total_chunks_ << ','
       << "\"progress_pct\":" << static_cast<unsigned>(public_progress_pct_) << ','
       << "\"error\":\"" << escape_json_(last_error_) << "\""
       << '}';
  return json.str();
}

bool ESPNowOTAManager::send_announce_() {
  if (state_ != State::ANNOUNCING) {
    return false;
  }
  if (control_attempt_count_ >= config_.max_control_attempts) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_TIMEOUT, "announce retry limit exceeded", true);
    return false;
  }

  espnow_file_announce_t announce{};
  announce.phase = ESPNOW_LR_FILE_PHASE_ANNOUNCE;
  announce.file_size = file_size_;
  std::memcpy(announce.md5, md5_.data(), md5_.size());
  announce.chunk_size = requested_chunk_size_;
  announce.window_size = config_.window_size;
  announce.action = action_;
  if (!file_id_.empty()) {
    std::memcpy(announce.file_id, file_id_.data(),
                std::min(file_id_.size(), sizeof(announce.file_id)));
  }

  uint32_t tx_counter = 0;
  const esp_err_t err =
      send_frame_fn_(leaf_mac_.data(), PKT_FILE_TRANSFER, reinterpret_cast<const uint8_t *>(&announce),
                     sizeof(announce), &tx_counter);
  if (err == ESP_ERR_ESPNOW_NO_MEM) {
    mark_no_mem_backoff_();
    return false;
  }
  clear_no_mem_backoff_();
  if (err != ESP_OK) {
    fail_transfer_(err == ESP_ERR_NOT_FOUND ? ESPNOW_LR_FILE_ABORT_SESSION_LOST : ESPNOW_LR_FILE_ABORT_SEND_FAILURE,
                   err == ESP_ERR_NOT_FOUND ? "target unreachable" : "failed to send announce", false);
    return false;
  }

  announce_tx_counter_ = tx_counter;
  last_control_send_ms_ = millis();
  last_activity_ms_ = last_control_send_ms_;
  ++control_attempt_count_;
  ESP_LOGI(TAG, "Sent OTA announce tx=%u size=%u chunk=%u attempts=%u", static_cast<unsigned>(tx_counter),
           static_cast<unsigned>(file_size_), static_cast<unsigned>(requested_chunk_size_),
           static_cast<unsigned>(control_attempt_count_));
  return true;
}

bool ESPNowOTAManager::send_end_() {
  if (state_ != State::STREAMING && state_ != State::ENDING) {
    return false;
  }
  if (control_attempt_count_ >= config_.max_control_attempts) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_TIMEOUT, "end retry limit exceeded", true);
    return false;
  }

  espnow_file_end_t end_packet{};
  end_packet.phase = ESPNOW_LR_FILE_PHASE_END;

  uint32_t ignored_tx_counter = 0;
  const esp_err_t err =
      send_frame_fn_(leaf_mac_.data(), PKT_FILE_TRANSFER, reinterpret_cast<const uint8_t *>(&end_packet),
                     sizeof(end_packet), &ignored_tx_counter);
  if (err == ESP_ERR_ESPNOW_NO_MEM) {
    mark_no_mem_backoff_();
    return false;
  }
  clear_no_mem_backoff_();
  if (err != ESP_OK) {
    fail_transfer_(err == ESP_ERR_NOT_FOUND ? ESPNOW_LR_FILE_ABORT_SESSION_LOST : ESPNOW_LR_FILE_ABORT_SEND_FAILURE,
                   err == ESP_ERR_NOT_FOUND ? "target unreachable" : "failed to send end",
                   err != ESP_ERR_NOT_FOUND);
    return false;
  }

  state_ = State::ENDING;
  last_control_send_ms_ = millis();
  last_activity_ms_ = last_control_send_ms_;
  ++control_attempt_count_;
  return true;
}

bool ESPNowOTAManager::send_abort_(uint8_t reason) {
  if (!send_frame_fn_) {
    return false;
  }

  espnow_file_abort_t abort_packet{};
  abort_packet.phase = ESPNOW_LR_FILE_PHASE_ABORT;
  abort_packet.reason = reason;

  uint32_t ignored_tx_counter = 0;
  const esp_err_t err =
      send_frame_fn_(leaf_mac_.data(), PKT_FILE_TRANSFER, reinterpret_cast<const uint8_t *>(&abort_packet),
                     sizeof(abort_packet), &ignored_tx_counter);
  if (err == ESP_ERR_ESPNOW_NO_MEM) {
    mark_no_mem_backoff_();
    return false;
  }
  clear_no_mem_backoff_();
  return err == ESP_OK;
}

bool ESPNowOTAManager::send_chunk_(ChunkSlot &slot, bool retry) {
  if (slot.data.empty()) {
    return false;
  }
  if (slot.attempt_count >= config_.max_chunk_attempts) {
    ESP_LOGW(TAG, "chunk retry limit exceeded seq=%u attempts=%u chunk_size=%u "
             "last_acked_seq=%u next_seq_to_send=%u inflight=%u "
             "(remote ACK silence will trigger final failure)",
             slot.sequence, static_cast<unsigned>(slot.attempt_count), negotiated_chunk_size_,
             window_.last_acked_seq == UINT32_MAX ? -1 : window_.last_acked_seq,
             window_.next_seq_to_send, window_.inflight_count());
    return false;
  }

  std::vector<uint8_t> payload(sizeof(espnow_file_data_header_t) + slot.data.size(), 0);
  auto *header = reinterpret_cast<espnow_file_data_header_t *>(payload.data());
  header->sequence = slot.sequence;
  header->offset = chunk_offset_(slot.sequence);
  std::memcpy(payload.data() + sizeof(*header), slot.data.data(), slot.data.size());
  if (payload.size() > max_encrypted_plaintext_) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "chunk payload exceeds encrypted limit", true);
    return false;
  }

  uint32_t ignored_tx_counter = 0;
  const esp_err_t err =
      send_frame_fn_(leaf_mac_.data(), PKT_FILE_DATA, payload.data(), payload.size(), &ignored_tx_counter);
  if (err == ESP_ERR_ESPNOW_NO_MEM) {
    mark_no_mem_backoff_();
    return false;
  }
  clear_no_mem_backoff_();
  if (err == ESP_ERR_NOT_FOUND) {
    mark_no_mem_backoff_();
    return false;
  }
  if (err != ESP_OK) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "failed to send chunk", true);
    return false;
  }

  slot.sent = true;
  slot.last_send_ms = millis();
  ++slot.attempt_count;
  last_activity_ms_ = slot.last_send_ms;
  if (!retry && slot.sequence == window_.next_seq_to_send) {
    ++window_.next_seq_to_send;
  }
  return true;
}

void ESPNowOTAManager::request_window_chunks_() {
  if (state_ != State::STREAMING) {
    return;
  }

  const uint32_t window_end = std::min<uint32_t>(total_chunks_, window_.window_start() + config_.window_size);
  while (window_.next_seq_to_request < window_end) {
    const uint32_t sequence = window_.next_seq_to_request;
    if (window_.find(sequence) != nullptr) {
      ++window_.next_seq_to_request;
      continue;
    }

    ChunkSlot slot{};
    slot.sequence = sequence;
    slot.requested = true;
    slot.last_request_ms = millis();
    if (request_chunk_fn_) {
      const bool requested = request_chunk_fn_(sequence, chunk_offset_(sequence), expected_chunk_len_(sequence));
      if (!requested) {
        break;
      }
    }
    window_.slots.emplace(sequence, std::move(slot));
    ++window_.next_seq_to_request;
  }
}

void ESPNowOTAManager::pump_streaming_() {
  if (state_ != State::STREAMING) {
    return;
  }
  if (millis() < no_mem_backoff_until_ms_) {
    return;
  }
  if (window_.next_seq_to_send < window_.window_start()) {
    window_.next_seq_to_send = window_.window_start();
  }

  while (!window_.window_full(config_.window_size) || window_.next_seq_to_send < window_.next_seq_to_request) {
    ChunkSlot *slot = window_.find(window_.next_seq_to_send);
    if (slot == nullptr || !slot->ready || slot->sent) {
      break;
    }
    if (!send_chunk_(*slot, false) && state_ == State::IDLE) {
      return;
    }
    if (millis() < no_mem_backoff_until_ms_) {
      return;
    }
  }
}

void ESPNowOTAManager::handle_accept_(const uint8_t *trailing, size_t trailing_len) {
  if (trailing == nullptr || trailing_len < 3) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "malformed accept ack", true);
    return;
  }

  uint16_t negotiated_chunk_size = 0;
  std::memcpy(&negotiated_chunk_size, trailing, sizeof(negotiated_chunk_size));
  const uint8_t action = trailing[2];
  if (action != action_) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "accept ack action mismatch", true);
    return;
  }
  if (negotiated_chunk_size == 0 || negotiated_chunk_size > requested_chunk_size_) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "invalid negotiated chunk size", true);
    return;
  }

  negotiated_chunk_size_ = negotiated_chunk_size;
  total_chunks_ = calc_total_chunks_(negotiated_chunk_size_);
  if (total_chunks_ == 0) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "invalid negotiated geometry", true);
    return;
  }

  window_.reset();
  control_attempt_count_ = 0;
  progress_pct_ = 0;
  public_progress_pct_ = 0;
  public_state_ = "TRANSFERRING";
  state_ = State::STREAMING;
  last_ack_received_ms_ = millis();
  ESP_LOGI(TAG, "Accepted OTA announce negotiated_chunk=%u total_chunks=%u max_encrypted_plaintext=%u",
            static_cast<unsigned>(negotiated_chunk_size_), static_cast<unsigned>(total_chunks_),
            static_cast<unsigned>(max_encrypted_plaintext_));
  request_window_chunks_();
  pump_streaming_();
}

void ESPNowOTAManager::handle_progress_(const uint8_t *trailing, size_t trailing_len) {
  if (trailing == nullptr || trailing_len < 5) {
    return;
  }

  uint32_t acked_sequence = 0;
  std::memcpy(&acked_sequence, trailing, sizeof(acked_sequence));
  if (acked_sequence >= total_chunks_) {
    return;
  }
  if (window_.last_acked_seq != UINT32_MAX && acked_sequence <= window_.last_acked_seq) {
    ESP_LOGD(TAG, "Ignoring stale progress ack seq=%u last=%u", static_cast<unsigned>(acked_sequence),
             static_cast<unsigned>(window_.last_acked_seq));
    return;
  }
  if (window_.next_seq_to_send == 0 || acked_sequence >= window_.next_seq_to_send) {
    ESP_LOGW(TAG, "Ignoring future progress ack seq=%u next_seq_to_send=%u", static_cast<unsigned>(acked_sequence),
             static_cast<unsigned>(window_.next_seq_to_send));
    return;
  }

  window_.last_acked_seq = acked_sequence;
  window_.erase_acked(acked_sequence);
  if (window_.next_seq_to_send < window_.window_start()) {
    window_.next_seq_to_send = window_.window_start();
  }
  progress_pct_ = trailing[4];
  public_progress_pct_ = progress_pct_;
  last_ack_received_ms_ = millis();

  if (acked_sequence + 1U >= total_chunks_) {
    state_ = State::ENDING;
    public_state_ = "VERIFYING";
    control_attempt_count_ = 0;
    send_end_();
    return;
  }

  request_window_chunks_();
  pump_streaming_();
}

void ESPNowOTAManager::handle_complete_(const uint8_t *trailing, size_t trailing_len) {
  if (trailing == nullptr || trailing_len < 2) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "malformed complete ack", false);
    return;
  }
  if (trailing[0] != action_) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "complete ack action mismatch", false);
    return;
  }

  const uint8_t result = trailing[1];
  if (result == ESPNOW_LR_FILE_COMPLETE_SUCCESS) {
    progress_pct_ = 100;
    public_progress_pct_ = 100;
    public_busy_ = false;
    public_state_ = "SUCCESS";
    last_error_.clear();
    state_ = State::COMPLETE;
    reset_();
    return;
  }
  last_ack_received_ms_ = millis();
  fail_transfer_(ESPNOW_LR_FILE_ABORT_FLASH_ERROR, complete_result_to_string(result), false);
}

void ESPNowOTAManager::handle_reject_(const uint8_t *trailing, size_t trailing_len) {
  if (trailing == nullptr || trailing_len < 2) {
    fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, "malformed reject ack", false);
    return;
  }
  fail_transfer_(ESPNOW_LR_FILE_ABORT_SEND_FAILURE, reject_reason_to_string(trailing[1]), false);
}

void ESPNowOTAManager::handle_abort_ack_(const uint8_t *trailing, size_t trailing_len) {
  const uint8_t reason = (trailing != nullptr && trailing_len >= 1) ? trailing[0] : ESPNOW_LR_FILE_ABORT_TIMEOUT;
  fail_transfer_(reason, abort_reason_to_string(reason), false);
}

void ESPNowOTAManager::fail_transfer_(uint8_t abort_reason, const std::string &message, bool notify_remote) {
  ESP_LOGW(TAG, "OTA transfer failed: reason=%u notify_remote=%u msg=%s", static_cast<unsigned>(abort_reason),
           notify_remote ? 1U : 0U, message.c_str());
  last_error_ = message;
  public_busy_ = false;
  public_state_ = "FAIL";
  if (notify_remote && state_ != State::ABORTING) {
    state_ = State::ABORTING;
    send_abort_(abort_reason);
  }
  reset_();
}

void ESPNowOTAManager::reset_() {
  state_ = State::IDLE;
  window_.reset();
  file_size_ = 0;
  total_chunks_ = 0;
  transfer_started_ms_ = 0;
  last_activity_ms_ = 0;
  last_ack_received_ms_ = 0;
  last_control_send_ms_ = 0;
  announce_tx_counter_ = 0;
  no_mem_backoff_until_ms_ = 0;
  requested_chunk_size_ = 0;
  negotiated_chunk_size_ = 0;
  action_ = 0;
  control_attempt_count_ = 0;
  progress_pct_ = 0;
  consecutive_no_mem_errors_ = 0;
  file_id_.clear();
  leaf_mac_.fill(0);
  md5_.fill(0);
}

void ESPNowOTAManager::mark_no_mem_backoff_() {
  ++consecutive_no_mem_errors_;
  const uint8_t shift = static_cast<uint8_t>(std::min<uint8_t>(consecutive_no_mem_errors_ - 1U, 7U));
  uint32_t backoff_ms = config_.no_mem_backoff_ms;
  if (shift > 0) {
    const uint64_t expanded = static_cast<uint64_t>(backoff_ms) << shift;
    backoff_ms = static_cast<uint32_t>(std::min<uint64_t>(expanded, config_.max_no_mem_backoff_ms));
  }
  no_mem_backoff_until_ms_ = millis() + std::min(backoff_ms, config_.max_no_mem_backoff_ms);
}

void ESPNowOTAManager::clear_no_mem_backoff_() {
  consecutive_no_mem_errors_ = 0;
  no_mem_backoff_until_ms_ = 0;
}

bool ESPNowOTAManager::target_reachable_() const {
  return target_reachable_fn_ == nullptr || target_reachable_fn_(leaf_mac_.data());
}

uint32_t ESPNowOTAManager::calc_total_chunks_(uint16_t chunk_size) const {
  if (chunk_size == 0) {
    return 0;
  }
  return (file_size_ / chunk_size) + ((file_size_ % chunk_size) != 0U ? 1U : 0U);
}

size_t ESPNowOTAManager::expected_chunk_len_(uint32_t sequence) const {
  if (negotiated_chunk_size_ == 0 || sequence >= total_chunks_) {
    return 0;
  }
  const uint64_t offset = static_cast<uint64_t>(sequence) * negotiated_chunk_size_;
  if (offset >= file_size_) {
    return 0;
  }
  const uint64_t remaining = static_cast<uint64_t>(file_size_) - offset;
  return static_cast<size_t>(std::min<uint64_t>(remaining, negotiated_chunk_size_));
}

uint32_t ESPNowOTAManager::chunk_offset_(uint32_t sequence) const {
  const uint64_t offset = static_cast<uint64_t>(sequence) * negotiated_chunk_size_;
  if (offset > std::numeric_limits<uint32_t>::max()) {
    return std::numeric_limits<uint32_t>::max();
  }
  return static_cast<uint32_t>(offset);
}

uint16_t ESPNowOTAManager::clamp_chunk_size_(uint16_t remote_max_frame_payload) const {
  if (remote_max_frame_payload <= ESPNOW_LR_FILE_DATA_HEADER_OVERHEAD) {
    return 0;
  }
  const uint16_t remote_max_chunk =
      static_cast<uint16_t>(remote_max_frame_payload - ESPNOW_LR_FILE_DATA_HEADER_OVERHEAD);
  return remote_max_chunk;
}

bool ESPNowOTAManager::same_leaf_(const uint8_t *leaf_mac) const {
  return leaf_mac != nullptr && std::memcmp(leaf_mac_.data(), leaf_mac, leaf_mac_.size()) == 0;
}

std::string ESPNowOTAManager::state_name_() const {
  switch (state_) {
    case State::IDLE:
      return "IDLE";
    case State::ANNOUNCING:
      return "ANNOUNCING";
    case State::STREAMING:
      return "STREAMING";
    case State::ENDING:
      return "ENDING";
    case State::ABORTING:
      return "ABORTING";
    case State::COMPLETE:
      return "COMPLETE";
    case State::FAILED:
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

std::string ESPNowOTAManager::escape_json_(const std::string &value) const {
  std::string escaped;
  escaped.reserve(value.size());
  for (char ch : value) {
    if (ch == '\\' || ch == '"') {
      escaped.push_back('\\');
    }
    escaped.push_back(ch);
  }
  return escaped;
}

std::string ESPNowOTAManager::format_mac_(const std::array<uint8_t, 6> &mac) const {
  char buffer[18] = {0};
  std::snprintf(buffer, sizeof(buffer), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4],
                mac[5]);
  return buffer;
}

}  // namespace espnow_lr
}  // namespace esphome
