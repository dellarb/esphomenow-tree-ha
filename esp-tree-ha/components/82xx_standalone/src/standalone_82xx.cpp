#include "standalone_82xx.h"

#include <algorithm>
#include <cstring>

namespace esphome {
namespace esp_tree {

static const char* TAG = "standalone";
Standalone82xx* Standalone82xx::active_instance_ = nullptr;

Standalone82xx::Standalone82xx() = default;
Standalone82xx::~Standalone82xx() = default;

// ── Transport Setup ──────────────────────────────────────────────────────────

bool Standalone82xx::setup_transport_(uint8_t channel) {
  active_instance_ = this;
  espnow_channel_ = channel;

  WiFi.persistent(false);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);

  WiFi.mode(WIFI_STA);
  delay(100);

  ESP_LOGI(TAG, "WiFi mode=%d ch=%d", WiFi.getMode(), wifi_get_channel());
  wifi_set_channel(channel);
  delay(50);
  ESP_LOGI(TAG, "Set channel to %d, actual ch=%d", channel, wifi_get_channel());

  if (esp_now_init() != 0) {
    ESP_LOGE(TAG, "esp_now_init failed");
    return false;
  }
  ESP_LOGI(TAG, "esp_now_init OK");

  esp_now_set_self_role(ESP_NOW_ROLE_COMBO);
  esp_now_register_send_cb(on_data_sent_);
  esp_now_register_recv_cb(on_data_recv_);

  // Add broadcast peer
  uint8_t bcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  if (esp_now_add_peer(bcast, ESP_NOW_ROLE_COMBO, channel, nullptr, 0) != 0) {
    ESP_LOGE(TAG, "Failed to add broadcast peer");
    return false;
  }

  uint8_t mac[6];
  WiFi.macAddress(mac);
  // Flip bit 1 for STA MAC (esp_now_send uses STA interface as source)
  mac[0] |= 0x02;
  memcpy(sta_mac_.data(), mac, 6);
  protocol_.set_local_mac(sta_mac_.data());
  ESP_LOGI(TAG, "Leaf MAC = %02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  protocol_.set_relay_config(false, 0, 0);
  protocol_.set_send_fn([this](const uint8_t* m, const uint8_t* f, size_t fl) {
    return send_frame_(m, f, fl);
  });

  transport_ready_ = true;
  return true;
}

// ── Send Frame ──────────────────────────────────────────────────────────────

bool Standalone82xx::send_frame_(const uint8_t* mac, const uint8_t* frame, size_t frame_len) {
  if (mac == nullptr || frame == nullptr) return false;

  // ESP8266: force broadcast for all frames (unicast ESPNOW is broken)
  static uint8_t bcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  const uint8_t* tx_mac = bcast;

  // Ensure radio is on the right channel
  if (wifi_get_channel() != espnow_channel_) {
    wifi_set_channel(espnow_channel_);
  }

  if (!esp_now_is_peer_exist(const_cast<uint8_t*>(tx_mac))) {
    esp_now_add_peer(const_cast<uint8_t*>(tx_mac), ESP_NOW_ROLE_COMBO,
                     espnow_channel_, nullptr, 0);
  }

  auto pkt_type = frame_len >= 17
    ? static_cast<int>(reinterpret_cast<const espnow_frame_header_t*>(frame)->packet_type)
    : -1;
  int err = esp_now_send(const_cast<uint8_t*>(tx_mac), const_cast<uint8_t*>(frame),
                         static_cast<uint8_t>(frame_len));
  return err == 0;
}

// ── Peer Management ─────────────────────────────────────────────────────────

bool Standalone82xx::add_peer_(const uint8_t* mac, uint8_t channel) {
  if (mac == nullptr) return false;
  if (esp_now_is_peer_exist(const_cast<uint8_t*>(mac))) return true;
  return esp_now_add_peer(const_cast<uint8_t*>(mac), ESP_NOW_ROLE_COMBO,
                          channel, nullptr, 0) == 0;
}

// ── Init ────────────────────────────────────────────────────────────────────

bool Standalone82xx::init(const char* psk_hex, const char* network_id,
                          const char* esphome_name,
                          uint16_t heartbeat_interval_seconds, uint8_t channel) {
  psk_ = psk_hex;
  network_id_ = network_id;
  esphome_name_ = esphome_name;
  heartbeat_interval_ = heartbeat_interval_seconds;

  if (!setup_transport_(channel)) {
    ESP_LOGE(TAG, "Transport setup failed");
    return false;
  }

  int ret = protocol_.init(psk_hex, network_id, esphome_name_.c_str(),
                           esphome_name_.c_str(), 0, "", "", heartbeat_interval_);
  if (ret != 0) {
    ESP_LOGE(TAG, "Protocol init failed: %d", ret);
    return false;
  }
  protocol_ready_ = true;
  ESP_LOGI(TAG, "Standalone82xx init OK");
  return true;
}

// ── Loop ────────────────────────────────────────────────────────────────────

void Standalone82xx::loop() {
  drain_received_frames_();
  protocol_.loop();
  protocol_.flush_log_queue();
}

// ── Entity Registration ─────────────────────────────────────────────────────

static std::string auto_id(const char* name) {
  std::string id;
  for (const char* p = name; *p; p++) {
    char c = *p;
    if (c == ' ') c = '_';
    else if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')
      id += c;
  }
  return id.empty() ? "entity" : id;
}

uint8_t Standalone82xx::add_switch(const char* name, const char* entity_id) {
  return protocol_.register_entity(
      FIELD_TYPE_SWITCH, name, "",
      entity_id ? entity_id : auto_id(name).c_str());
}

uint8_t Standalone82xx::add_binary_sensor(const char* name, const char* entity_id) {
  return protocol_.register_entity(
      FIELD_TYPE_BINARY, name, "",
      entity_id ? entity_id : auto_id(name).c_str());
}

uint8_t Standalone82xx::add_button(const char* name, const char* entity_id) {
  return protocol_.register_entity(
      FIELD_TYPE_BUTTON, name, "",
      entity_id ? entity_id : auto_id(name).c_str());
}

uint8_t Standalone82xx::add_sensor(const char* name, const char* unit, const char* entity_id) {
  return protocol_.register_entity(
      FIELD_TYPE_SENSOR, name, unit ? unit : "",
      entity_id ? entity_id : auto_id(name).c_str());
}

void Standalone82xx::update_entity(uint8_t index, bool value) {
  uint8_t buf[1] = {static_cast<uint8_t>(value ? 1 : 0)};
  protocol_.on_entity_state_change(index, buf, 1);
}

void Standalone82xx::update_entity(uint8_t index, float value) {
  uint8_t buf[4];
  memcpy(buf, &value, 4);
  protocol_.on_entity_state_change(index, buf, 4);
}

// ── RX Handling ─────────────────────────────────────────────────────────────

void Standalone82xx::on_data_recv_(uint8_t* mac, uint8_t* data, uint8_t len) {
  if (active_instance_ == nullptr || mac == nullptr || data == nullptr) return;
  if (len < 17 || len > 1500) return;

  // Log all received frames
  auto pkt_type = reinterpret_cast<const espnow_frame_header_t*>(data)->packet_type;
  ESP_LOGI(TAG, "[RX] from=%02X:%02X:%02X:%02X:%02X:%02X len=%u pkt_type=0x%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5], len, pkt_type);

  if (active_instance_->rx_queue_.size() >= MAX_PENDING) return;

  PendingRxFrame f;
  memcpy(f.mac.data(), mac, 6);
  f.data.assign(data, data + len);
  active_instance_->rx_queue_.push_back(std::move(f));
}

void Standalone82xx::drain_received_frames_() {
  if (rx_queue_.empty()) return;
  auto frames = std::move(rx_queue_);
  rx_queue_.clear();
  for (auto& f : frames) {
    auto pkt_type = f.data.size() >= 17
      ? reinterpret_cast<const espnow_frame_header_t*>(f.data.data())->packet_type : 0;
    ESP_LOGI(TAG, "[DRAIN] from=%02X:%02X:%02X:%02X:%02X:%02X len=%u pkt=0x%02X",
             f.mac[0], f.mac[1], f.mac[2], f.mac[3], f.mac[4], f.mac[5],
             static_cast<unsigned>(f.data.size()), pkt_type);
    protocol_.on_espnow_frame(f.mac.data(), f.data.data(), f.data.size(), 0);
  }
}

// ── TX Callback ─────────────────────────────────────────────────────────────

void Standalone82xx::on_data_sent_(uint8_t* mac, uint8_t status) {
  if (active_instance_ == nullptr) return;
  char mac_str[24];
  if (mac) {
    snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  } else {
    snprintf(mac_str, sizeof(mac_str), "null");
  }
  ESP_LOGI(TAG, "[TX CB] mac=%s status=%s (0=SUCCESS)",
           mac_str, status == 0 ? "SUCCESS" : "FAIL");
}

}  // namespace esp_tree
}  // namespace esphome
