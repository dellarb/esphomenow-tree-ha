#include "bridge_lite.h"
#include "esp_tree_common/espnow_crypto.h"
#include "esp_tree_common/espnow_mac_utils.h"

#include "esphome/components/wifi/wifi_component.h"
#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/core/log.h"
#include "esphome/core/hal.h"

#include <esp_err.h>
#include <esp_wifi.h>
#include <esp_timer.h>
#include <esp_now.h>
#include <esp_heap_caps.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <cstring>

namespace esphome {
namespace esp_tree {

static const char *const TAG = "bridge_lite";

BridgeLite *BridgeLite::active_instance_ = nullptr;

BridgeLite::BridgeLite() = default;

void BridgeLite::setup() {
  active_instance_ = this;

  if (!init_wifi_and_espnow_()) {
    ESP_LOGE(TAG, "Failed to initialize WiFi and ESP-NOW");
    return;
  }

  if (espnow_crypto_init(psk_.c_str()) != 0) {
    ESP_LOGE(TAG, "Failed to initialize crypto with PSK");
    return;
  }

  ring_mutex_ = xSemaphoreCreateMutex();
  if (ring_mutex_ == nullptr) {
    ESP_LOGE(TAG, "Failed to create ring buffer mutex");
    return;
  }

  transport_ = std::make_unique<BridgeLiteWsTransport>(this);
  transport_->set_on_connected([this]() {
    this->transport_connected_ = true;
    this->send_bridge_hello_();
  });
  transport_->set_on_disconnected([this]() {
    this->transport_connected_ = false;
  });

  if (!transport_->start()) {
    ESP_LOGE(TAG, "Failed to start transport");
    return;
  }

  static_cast<BridgeLiteWsTransport *>(transport_.get())->register_with_web_server();

  start_time_ms_ = millis();
  last_status_ms_ = millis();

  ESP_LOGI(TAG, "Bridge Lite initialized");
}

void BridgeLite::loop() {
  if (transport_) {
    transport_->loop();
  }
  check_status_timer_();
}

bool BridgeLite::init_wifi_and_espnow_() {
  if (esp_now_init() != ESP_OK) {
    return false;
  }

  uint8_t protocol = (espnow_mode_ == "lr") ? WIFI_PROTOCOL_LR : WIFI_PROTOCOL_11N;
  wifi_protocols_t protocols{};
  protocols.ghz_2g = protocol;
  ESP_ERROR_CHECK(esp_wifi_set_protocols(WIFI_IF_STA, &protocols));

  uint8_t mac[6];
  if (esp_wifi_get_mac(WIFI_IF_STA, mac) != ESP_OK) {
    return false;
  }
  memcpy(sta_mac_.data(), mac, 6);

  esp_now_register_recv_cb(
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
      on_data_received_
#else
      on_data_received_
#endif
  );
  esp_now_register_send_cb(
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
      on_data_sent_
#else
      on_data_sent_
#endif
  );

  return true;
}

bool BridgeLite::add_peer_(const uint8_t *mac) {
  if (mac == nullptr) return false;

  if (esp_now_is_peer_exist(mac)) {
    note_peer_activity_(mac);
    return true;
  }

  esp_now_peer_info_t peer{};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = 0;
  peer.encrypt = false;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  peer.ifidx = WIFI_IF_STA;
#endif

  esp_err_t err = esp_now_add_peer(&peer);
  if (err == ESP_OK) {
    note_peer_activity_(mac);
    return true;
  }

  ESP_LOGW(TAG, "esp_now_add_peer failed, attempting eviction");
  if (!evict_stale_peer_()) {
    return false;
  }

  err = esp_now_add_peer(&peer);
  if (err == ESP_OK) {
    note_peer_activity_(mac);
    return true;
  }

  return false;
}

void BridgeLite::note_peer_activity_(const uint8_t *mac) {
  if (mac == nullptr) return;
  peer_last_used_ms_[mac_hex(mac)] = millis();
}

bool BridgeLite::evict_stale_peer_() {
  if (peer_last_used_ms_.empty()) return false;

  uint32_t oldest = 0;
  std::string oldest_key;

  for (const auto &entry : peer_last_used_ms_) {
    if (oldest == 0 || entry.second < oldest) {
      oldest = entry.second;
      oldest_key = entry.first;
    }
  }

  if (oldest_key.empty()) return false;

  std::array<uint8_t, 6> mac_bytes{};
  for (size_t i = 0; i < 6; i++) {
    mac_bytes[i] = static_cast<uint8_t>(std::stoi(oldest_key.substr(i * 2, 2), nullptr, 16));
  }

  esp_now_del_peer(mac_bytes.data());
  peer_last_used_ms_.erase(oldest_key);

  return true;
}

void BridgeLite::handle_received_frame_(const uint8_t *mac, const uint8_t *data, size_t len, int8_t rssi) {
  if (mac == nullptr || data == nullptr || len < 13) return;

  RadioFrameBuffer frame{};
  memcpy(frame.src_mac.data(), mac, 6);
  frame.raw_frame.assign(data, data + len);
  frame.rssi = rssi;
  frame.timestamp_ms = millis();

  if (xSemaphoreTake(ring_mutex_, pdMS_TO_TICKS(10)) == pdTRUE) {
    if (ring_buffer_.size() >= RING_BUFFER_SIZE) {
      ring_buffer_.pop_front();
    }
    ring_buffer_.push_back(frame);
    xSemaphoreGive(ring_mutex_);
  }
}

void BridgeLite::handle_send_result_(const uint8_t *mac, bool success) {
  (void) mac;
  (void) success;
}

void BridgeLite::send_bridge_hello_() {
  if (!transport_ || !transport_->is_connected()) return;

  ESP_LOGI(TAG, "Bridge connected, hello sent");
}

void BridgeLite::send_bridge_status_() {
  if (!transport_ || !transport_->is_connected()) return;

  ESP_LOGI(TAG, "Bridge status: heap=%u, peers=%zu", esp_get_free_heap_size(), peer_last_used_ms_.size());
}

void BridgeLite::check_status_timer_() {
  uint32_t now = millis();
  if (now - last_status_ms_ >= STATUS_INTERVAL_MS) {
    last_status_ms_ = now;
    if (transport_connected_ && transport_) {
      send_bridge_status_();
    }
  }
}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void BridgeLite::on_data_received_(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
#else
void BridgeLite::on_data_received_(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (active_instance_ == nullptr) return;

  const uint8_t *src_mac = nullptr;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  src_mac = info->src_addr;
#else
  src_mac = mac;
#endif

  int8_t rssi = -127;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  if (info->rx_ctrl) {
    rssi = info->rx_ctrl->rssi;
  }
#endif

  active_instance_->handle_received_frame_(src_mac, data, static_cast<size_t>(len), rssi);
}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void BridgeLite::on_data_sent_(const esp_now_send_info_t *tx_info, esp_now_send_status_t status) {
#else
void BridgeLite::on_data_sent_(const uint8_t *mac, esp_now_send_status_t status) {
#endif
  if (active_instance_ == nullptr) return;

#if ESP_IDF_VERSION < ESP_IDF_VERSION_VAL(5, 0, 0)
  const uint8_t *dst_mac = mac;
#else
  const uint8_t *dst_mac = nullptr;
#endif

  bool success = (status == ESP_NOW_SEND_SUCCESS);
  active_instance_->handle_send_result_(dst_mac, success);
}

}  // namespace esp_tree
}  // namespace esphome