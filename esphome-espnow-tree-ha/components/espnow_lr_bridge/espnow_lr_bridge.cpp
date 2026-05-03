#include "espnow_lr_bridge.h"
#include "espnow_lr_common/espnow_mac_utils.h"
#include "bridge_api_auth.h"
#include "bridge_api_messages.h"
#include "ota_web_page.h"
#define TAG BRIDGE_OTA_TAG

#include "esphome/components/mqtt/mqtt_client.h"
#include "esphome/components/json/json_util.h"
#include "esphome/core/log.h"
#include "esphome/components/wifi/wifi_component.h"
#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/components/network/ip_address.h"

#include <cstdlib>
#include <cmath>
#include <algorithm>
#include <map>
#include <unordered_map>
#include <unordered_set>
#include <esp_err.h>
#include <esp_heap_caps.h>
#include <esp_timer.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <sstream>

namespace esphome {
namespace espnow_lr {

// Yield delay inserted after publishes and ESP-NOW sends to prevent
// starving the MQTT client task. 1ms is enough for FreeRTOS to
// schedule higher-priority tasks (TCP/IP, MQTT) between our work.
static const uint8_t YIELD_MS = 1;

static const char *const TAG = "espnow";
ESPNowLRBridge *ESPNowLRBridge::active_instance_ = nullptr;

namespace {

static constexpr uint8_t POSITION_COMMAND_SET_POSITION = 0;
static constexpr uint8_t POSITION_COMMAND_OPEN = 1;
static constexpr uint8_t POSITION_COMMAND_CLOSE = 2;
static constexpr uint8_t POSITION_COMMAND_STOP = 3;

constexpr uint8_t CM_ONOFF = 1;
constexpr uint8_t CM_BRIGHTNESS = 3;
constexpr uint8_t CM_WHITE = 7;
constexpr uint8_t CM_COLOR_TEMP = 11;
constexpr uint8_t CM_COLD_WARM = 19;
constexpr uint8_t CM_RGB = 35;
constexpr uint8_t CM_RGBW = 39;
constexpr uint8_t CM_RGB_CT = 47;
constexpr uint8_t CM_RGBWW = 51;

static const char *color_mode_name_(uint8_t cm) {
  switch (cm) {
    case CM_ONOFF:    return "onoff";
    case CM_BRIGHTNESS: return "brightness";
    case CM_WHITE:      return "white";
    case CM_COLOR_TEMP: return "color_temp";  // also covers COLD_WARM_WHITE
    case CM_COLD_WARM:
    case CM_RGB:        return "rgb";
    case CM_RGBW:       return "rgbw";
    case CM_RGB_CT:
    case CM_RGBWW:      return "rgbww";
    default: break;
  }
  return "brightness";
}

static uint32_t calc_airtime_lr_us_(size_t frame_bytes) {
  return 336 + 16 * static_cast<uint32_t>(frame_bytes);
}

static std::string format_uptime(uint32_t uptime_s) {
  if (uptime_s < 60) {
    return std::to_string(uptime_s) + "s";
  } else if (uptime_s < 3600) {
    return std::to_string(uptime_s / 60) + "m";
  } else if (uptime_s < 86400) {
    const uint32_t h = uptime_s / 3600;
    const uint32_t m = (uptime_s % 3600) / 60;
    if (m == 0) return std::to_string(h) + "h";
    char buf[16];
    snprintf(buf, sizeof(buf), "%.1fh", uptime_s / 3600.0f);
    return std::string(buf);
  } else {
    const uint32_t d = uptime_s / 86400;
    const uint32_t h = (uptime_s % 86400) / 3600;
    char buf[16];
    snprintf(buf, sizeof(buf), "%dd%dh", d, h);
    return std::string(buf);
  }
}
static std::string format_build_date_(const char *date_str, const char *time_str) {
  if (!date_str || !time_str) return "unknown";
  static const char *months[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};
  int month_idx = -1;
  int day = 0, year = 0;
  char mon_str[8] = {0};
  if (sscanf(date_str, "%7s %d %d", mon_str, &day, &year) != 3) return "unknown";
  for (int i = 0; i < 12; i++) {
    if (strcmp(mon_str, months[i]) == 0) { month_idx = i; break; }
  }
  if (month_idx < 0) return "unknown";
  char result[32] = {0};
  snprintf(result, sizeof(result), "%04d-%02d-%02d %s UTC", year, month_idx + 1, day, time_str);
  return std::string(result);
}


static float decode_float(const uint8_t* value, size_t value_len) {
  if (value_len < sizeof(float)) return 0.0f;
  float decoded = 0.0f;
  memcpy(&decoded, value, sizeof(decoded));
  return decoded;
}

static void encode_float(float input, uint8_t* out, size_t out_len) {
  memset(out, 0, out_len);
  memcpy(out, &input, sizeof(input));
}

static std::string sanitize_object_id(std::string input) {
  for (char &ch : input) {
    if ((ch >= 'A' && ch <= 'Z')) ch = static_cast<char>(ch - 'A' + 'a');
    if (!((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))) ch = '_';
  }
  return input;
}

static std::string get_esphome_device_name_() {
  return sanitize_object_id(App.get_name().str());
}

static std::string bridge_device_id_(const uint8_t *mac) {
  return std::string("espnow_lr_bridge_") + mac_hex(mac);
}

static bool parse_mac_hex_(const std::string &mac_hex_str, uint8_t mac[6]) {
  if (mac == nullptr || mac_hex_str.size() != 12) return false;
  unsigned values[6]{};
  if (sscanf(mac_hex_str.c_str(), "%2x%2x%2x%2x%2x%2x",
             &values[0], &values[1], &values[2], &values[3], &values[4], &values[5]) != 6) {
    return false;
  }
  for (size_t i = 0; i < 6; ++i) {
    mac[i] = static_cast<uint8_t>(values[i]);
  }
  return true;
}

static int parse_hex_nibble_(char ch) {
  if (ch >= '0' && ch <= '9') return ch - '0';
  if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
  if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
  return -1;
}

static bool parse_md5_hex_(const std::string &md5_hex, uint8_t md5[16]) {
  if (md5 == nullptr || md5_hex.size() != 32) return false;
  for (size_t i = 0; i < 16; ++i) {
    const int hi = parse_hex_nibble_(md5_hex[i * 2]);
    const int lo = parse_hex_nibble_(md5_hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) return false;
    md5[i] = static_cast<uint8_t>((hi << 4) | lo);
  }
  return true;
}

static bool decode_base64_(const std::string &input, std::vector<uint8_t> &out) {
  static constexpr int8_t kTable[256] = {
      -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
      62,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,62,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-2,-1,-1,
      -1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,63,
      -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1,
      -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
      -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
      -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
      -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1
  };

  out.clear();
  out.reserve((input.size() * 3U) / 4U);
  uint32_t accumulator = 0;
  int bits = 0;
  for (char ch : input) {
    const uint8_t byte = static_cast<uint8_t>(ch);
    const int8_t value = kTable[byte];
    if (value == -1) {
      if (ch == '\r' || ch == '\n' || ch == '\t') continue;
      return false;
    }
    if (value == -2) {
      continue;
    }
    accumulator = (accumulator << 6U) | static_cast<uint32_t>(value);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push_back(static_cast<uint8_t>((accumulator >> bits) & 0xFFU));
    }
  }
  return true;
}

static const char *component_for_type(espnow_field_type_t type) {
  switch (type) {
    case FIELD_TYPE_SENSOR: return "sensor";
    case FIELD_TYPE_SWITCH: return "switch";
    case FIELD_TYPE_BINARY: return "binary_sensor";
    case FIELD_TYPE_BUTTON: return "button";
    case FIELD_TYPE_NUMBER: return "number";
    case FIELD_TYPE_TEXT: return "text";
    case FIELD_TYPE_TEXT_SENSOR: return "sensor";
    case FIELD_TYPE_COVER: return "cover";
    case FIELD_TYPE_LIGHT: return "light";
    case FIELD_TYPE_FAN: return "fan";
    case FIELD_TYPE_LOCK: return "lock";
    case FIELD_TYPE_ALARM: return "alarm_control_panel";
    case FIELD_TYPE_SELECT: return "select";
    case FIELD_TYPE_EVENT: return "event";
    case FIELD_TYPE_VALVE: return "valve";
    default: return "sensor";
  }
}

static bool parse_on(const std::string &payload) {
  return payload == "ON" || payload == "on" || payload == "1" || payload == "true";
}

static const char *chip_model_string(uint32_t model) {
  switch (model) {
    case 1:  return "ESP32";
    case 2:  return "ESP32-S2";
    case 5:  return "ESP32-C3";
    case 9:  return "ESP32-S3";
    case 13: return "ESP32-C6";
    case 16: return "ESP32-H2";
    case 12: return "ESP32-C2";
    case 23: return "ESP32-C5";
    case 20: return "ESP32-C61";
    case 18: return "ESP32-P4";
    default: return "Unknown";
  }
}

static std::vector<std::string> split_string(const std::string &input, char sep) {
  std::vector<std::string> parts;
  std::string current;
  for (char ch : input) {
    if (ch == sep) {
      parts.push_back(current);
      current.clear();
    } else {
      current.push_back(ch);
    }
  }
  parts.push_back(current);
  return parts;
}

static std::map<std::string, std::string> parse_options_map(const std::string &input) {
  std::map<std::string, std::string> options;
  for (const auto &part : split_string(input, ';')) {
    const auto eq = part.find('=');
    if (eq == std::string::npos) continue;
    options[part.substr(0, eq)] = part.substr(eq + 1);
  }
  return options;
}

static bool option_is_true(const std::map<std::string, std::string> &options, const char *key) {
  const auto it = options.find(key);
  return it != options.end() && (it->second == "1" || it->second == "true" || it->second == "yes");
}

static std::vector<std::string> option_list(const std::map<std::string, std::string> &options, const char *key) {
  const auto it = options.find(key);
  if (it == options.end() || it->second.empty()) return {};
  return split_string(it->second, '|');
}

static bool option_has_list_value(const std::map<std::string, std::string> &options, const char *key, const char *value) {
  const auto values = option_list(options, key);
  return std::find(values.begin(), values.end(), value) != values.end();
}

static float option_float(const std::map<std::string, std::string> &options, const char *key, float fallback = 0.0f) {
  const auto it = options.find(key);
  return it == options.end() ? fallback : strtof(it->second.c_str(), nullptr);
}

static uint32_t option_u32(const std::map<std::string, std::string> &options, const char *key, uint32_t fallback = 0) {
  const auto it = options.find(key);
  return it == options.end() ? fallback : static_cast<uint32_t>(strtoul(it->second.c_str(), nullptr, 10));
}

static void hsv_u8_to_rgb(uint8_t h, uint8_t s, uint8_t v, uint8_t &r, uint8_t &g, uint8_t &b) {
  const float hue = (static_cast<float>(h) / 255.0f) * 360.0f;
  const float sat = static_cast<float>(s) / 255.0f;
  const float val = static_cast<float>(v) / 255.0f;
  const float c = val * sat;
  const float x = c * (1.0f - std::fabs(std::fmod(hue / 60.0f, 2.0f) - 1.0f));
  const float m = val - c;
  float rp = 0.0f, gp = 0.0f, bp = 0.0f;
  if (hue < 60.0f) {
    rp = c; gp = x;
  } else if (hue < 120.0f) {
    rp = x; gp = c;
  } else if (hue < 180.0f) {
    gp = c; bp = x;
  } else if (hue < 240.0f) {
    gp = x; bp = c;
  } else if (hue < 300.0f) {
    rp = x; bp = c;
  } else {
    rp = c; bp = x;
  }
  r = static_cast<uint8_t>(std::lround((rp + m) * 255.0f));
  g = static_cast<uint8_t>(std::lround((gp + m) * 255.0f));
  b = static_cast<uint8_t>(std::lround((bp + m) * 255.0f));
}

}  // namespace

ESPNowLRBridge::ESPNowLRBridge() = default;

void ESPNowLRBridge::register_instance_(ESPNowLRBridge *instance) { active_instance_ = instance; }

std::string ESPNowLRBridge::mac_key_string_(const uint8_t *mac) { return mac_hex(mac); }

bool ESPNowLRBridge::init_wifi_and_espnow_() {
  if (esp_now_init() != ESP_OK) return false;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 4, 0)
  if (!force_v1_packet_size_) {
    uint32_t espnow_version = 1;
    esp_now_get_version(&espnow_version);
    if (espnow_version >= 2) {
      protocol_.set_session_flags(ESPNOW_LR_SESSION_FLAG_V2_MTU);
      ESP_LOGI(TAG, "ESP-NOW V2 radio detected (version=%u), enabling V2 MTU", static_cast<unsigned>(espnow_version));
    } else {
      ESP_LOGI(TAG, "ESP-NOW V1 radio (version=%u), MTU limited to %u bytes", static_cast<unsigned>(espnow_version), static_cast<unsigned>(ESPNOW_LR_V1_MAX_PAYLOAD));
    }
  } else {
    ESP_LOGI(TAG, "force_v1_packet_size active, using V1 MTU (%u bytes)", static_cast<unsigned>(ESPNOW_LR_V1_MAX_PAYLOAD));
  }
#else
  ESP_LOGI(TAG, "ESP-NOW V1 radio (IDF < 5.4), MTU limited to %u bytes", static_cast<unsigned>(ESPNOW_LR_V1_MAX_PAYLOAD));
#endif
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

bool ESPNowLRBridge::add_peer_(const uint8_t *mac, bool lr_mode) {
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
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
    if (lr_mode) {
      esp_now_rate_config_t rate_cfg{};
      rate_cfg.phymode = WIFI_PHY_MODE_LR;
      rate_cfg.rate = WIFI_PHY_RATE_LORA_500K;
      rate_cfg.ersu = false;
      rate_cfg.dcm = false;
      esp_now_set_peer_rate_config(mac, &rate_cfg);
    }
#endif
    note_peer_activity_(mac);
    return true;
  }

  ESP_LOGW(TAG, "esp_now_add_peer failed for %s (err=%d), attempting stale peer eviction",
           mac_key_string_(mac).c_str(), static_cast<int>(err));
  if (!evict_stale_peer_(mac)) {
    return false;
  }

  err = esp_now_add_peer(&peer);
  if (err == ESP_OK) {
    note_peer_activity_(mac);
    return true;
  }

  ESP_LOGW(TAG, "esp_now_add_peer retry failed for %s (err=%d)",
           mac_key_string_(mac).c_str(), static_cast<int>(err));
  return false;
}

esp_err_t ESPNowLRBridge::send_frame_result_(const uint8_t *mac, const uint8_t *frame, size_t frame_len) {
  if (!add_peer_(mac, espnow_mode_ == "lr")) {
    ESP_LOGW(TAG, "ESP-NOW send aborted: no peer slot available for %s", mac_key_string_(mac).c_str());
    return ESP_FAIL;
  }
  rolling_airtime_.tx_airtime_us += calc_airtime_lr_us_(frame_len);
  rolling_airtime_.tx_packets++;
  note_peer_activity_(mac);
  return esp_now_send(mac, frame, frame_len);
}

bool ESPNowLRBridge::send_frame_(const uint8_t *mac, const uint8_t *frame, size_t frame_len) {
  return send_frame_result_(mac, frame, frame_len) == ESP_OK;
}

void ESPNowLRBridge::note_peer_activity_(const uint8_t *mac) {
  if (mac == nullptr) return;
  peer_last_used_ms_[mac_key_string_(mac)] = millis();
}

bool ESPNowLRBridge::is_peer_protected_(const uint8_t *mac) const {
  if (mac == nullptr) return false;
  for (const auto &entry : protocol_.get_sessions()) {
    const auto &session = entry.second;
    if (!session.online) continue;
    if (memcmp(session.next_hop_mac.data(), mac, 6) == 0) return true;
    if (memcmp(session.leaf_mac.data(), mac, 6) == 0) return true;
  }
  return false;
}

bool ESPNowLRBridge::evict_stale_peer_(const uint8_t *preferred_mac) {
  if (peer_last_used_ms_.empty()) return false;

  auto best_it = peer_last_used_ms_.end();
  for (auto it = peer_last_used_ms_.begin(); it != peer_last_used_ms_.end(); ++it) {
    uint8_t mac[6]{};
    if (!parse_mac_hex_(it->first, mac)) continue;
    if (preferred_mac != nullptr && memcmp(mac, preferred_mac, sizeof(mac)) == 0) continue;
    if (is_peer_protected_(mac)) continue;
    if (best_it == peer_last_used_ms_.end() || it->second < best_it->second) {
      best_it = it;
    }
  }

  if (best_it == peer_last_used_ms_.end()) return false;

  uint8_t evict_mac[6]{};
  if (!parse_mac_hex_(best_it->first, evict_mac)) {
    peer_last_used_ms_.erase(best_it);
    return false;
  }

  const std::string evict_mac_str = best_it->first;
  const uint32_t age_ms = millis() - best_it->second;
  peer_last_used_ms_.erase(best_it);
  esp_err_t err = esp_now_del_peer(evict_mac);
  if (err != ESP_OK) {
    ESP_LOGW(TAG, "esp_now_del_peer failed for stale peer %s (err=%d)", evict_mac_str.c_str(), static_cast<int>(err));
    return false;
  }

  ESP_LOGW(TAG, "Evicted stale ESP-NOW peer %s (idle %ums) to free peer slot", evict_mac_str.c_str(), age_ms);
  return true;
}

void ESPNowLRBridge::handle_received_frame_(const uint8_t *mac, const uint8_t *data, size_t len, int8_t rssi) {
  if (!espnow_allowed_) {
    rx_dropped_while_disallowed_++;
    ESP_LOGW(TAG, "ESP-NOW frame dropped: espnow_allowed_=false (Wi-Fi or MQTT disconnected)");
    return;
  }
  if (mac == nullptr || data == nullptr || len == 0) return;
  if (pending_rx_mutex_ == nullptr) {
    rx_dropped_++;
    return;
  }
  if (xSemaphoreTake(pending_rx_mutex_, 0) != pdTRUE) {
    rx_dropped_++;
    return;
  }
  const size_t rx_size = pending_rx_frames_.size();
  if (rx_size >= MAX_PENDING_RX_FRAMES) {
    xSemaphoreGive(pending_rx_mutex_);
    rx_dropped_++;
    return;
  }
  if (rx_size >= (MAX_PENDING_RX_FRAMES * RX_BUFFER_WATERMARK_PCT / 100)) {
    ESP_LOGW(TAG, "ESP-NOW RX buffer at %d%% (%zu/%zu frames)", RX_BUFFER_WATERMARK_PCT, rx_size,
             MAX_PENDING_RX_FRAMES);
  }
  PendingRxFrame frame{};
  memcpy(frame.mac.data(), mac, frame.mac.size());
  frame.data.assign(data, data + len);
  frame.rssi = rssi;
  pending_rx_frames_.push_back(std::move(frame));
  xSemaphoreGive(pending_rx_mutex_);
}

void ESPNowLRBridge::handle_send_status_(const uint8_t *mac, bool success) {
  if (success) {
    tx_ok_++;
  } else {
    tx_fail_++;
  }
}

void ESPNowLRBridge::drain_received_frames_() {
  if (pending_rx_mutex_ == nullptr) return;
  std::deque<PendingRxFrame> pending;
  if (xSemaphoreTake(pending_rx_mutex_, pdMS_TO_TICKS(10)) != pdTRUE) {
    ESP_LOGW(TAG, "Timeout waiting for pending_rx_mutex_ in drain_received_frames_");
    return;
  }
  pending.swap(pending_rx_frames_);
  xSemaphoreGive(pending_rx_mutex_);

  size_t i = 0;
  for (auto &frame : pending) {
    if (!protocol_.on_espnow_frame(frame.mac.data(), frame.data.data(), frame.data.size(), frame.rssi)) {
      rx_dropped_++;
      continue;
    }
    rx_packets_++;
    rolling_airtime_.rx_airtime_us += calc_airtime_lr_us_(frame.data.size());
    rolling_airtime_.rx_packets++;
    if (frame.rssi != 0) {
      rolling_airtime_.rssi_sum += frame.rssi;
      rolling_airtime_.rssi_count++;
    }
    if (++i % 5 == 0) delay(YIELD_MS);
  }
}

std::string ESPNowLRBridge::slugify_name_(std::string input) { return sanitize_object_id(std::move(input)); }

std::string ESPNowLRBridge::node_key_(const uint8_t *mac) const {
  const BridgeSession *session = protocol_.get_session(mac);
  if (session != nullptr && !session->esphome_name.empty()) return slugify_name_(session->esphome_name);
  return mac_key_string_(mac);
}

std::string ESPNowLRBridge::remote_display_name_(const uint8_t *mac) const {
  const BridgeSession *session = protocol_.get_session(mac);
  if (session != nullptr && !session->node_label.empty()) return session->node_label;
  if (session != nullptr && !session->esphome_name.empty()) return session->esphome_name;
  return std::string("ESP-NOW LR Remote ") + mac_key_string_(mac);
}

std::string ESPNowLRBridge::entity_object_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  std::string base;
  if (!entity.entity_id.empty()) {
    base = slugify_name_(entity.entity_id);
  } else {
    base = slugify_name_(entity.entity_name);
  }
  if (base.empty()) base = "entity";
  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr || entity.entity_index >= session->schema_entities.size()) return base;
  if (!entity.entity_id.empty()) {
    return base;
  }
  unsigned duplicate_index = 0;
  for (size_t i = 0; i <= entity.entity_index && i < session->schema_entities.size(); i++) {
    const auto &candidate = session->schema_entities[i];
    if (candidate.entity_type == 0) continue;
    if (slugify_name_(candidate.entity_name) == base) duplicate_index++;
  }
  if (duplicate_index > 1) base += "_" + std::to_string(duplicate_index);
  return base;
}

std::string ESPNowLRBridge::default_entity_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  const std::string component = entity_component_(static_cast<espnow_field_type_t>(entity.entity_type));
  std::string slug = slugify_name_(remote_display_name_(mac) + " " + entity.entity_name);
  if (slug.empty()) slug = entity_object_id_(mac, entity);
  return component + "." + slug;
}

std::string ESPNowLRBridge::entity_component_(espnow_field_type_t type) const { return component_for_type(type); }

std::string ESPNowLRBridge::availability_topic_(const uint8_t *mac) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/availability";
}

std::string ESPNowLRBridge::state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/state";
}

std::string ESPNowLRBridge::command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/set";
}

std::string ESPNowLRBridge::fan_speed_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/percentage_state";
}

std::string ESPNowLRBridge::fan_speed_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/percentage_set";
}

std::string ESPNowLRBridge::fan_oscillation_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/oscillation_state";
}

std::string ESPNowLRBridge::fan_oscillation_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/oscillation_set";
}

std::string ESPNowLRBridge::fan_direction_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/direction_state";
}

std::string ESPNowLRBridge::fan_direction_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/direction_set";
}

std::string ESPNowLRBridge::unique_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "espnow_lr_" + node_key_(mac) + "_" + entity_object_id_(mac, entity);
}

std::string ESPNowLRBridge::bridge_state_topic_(const char *suffix) const {
  return "espnow_esphome_tree/bridge/" + mac_key_string_(sta_mac_.data()) + "/" + suffix + "/state";
}

std::string ESPNowLRBridge::remote_diag_state_topic_(const uint8_t *mac, const char *suffix) const {
  return "espnow_esphome_tree/" + node_key_(mac) + "/diagnostic/" + suffix + "/state";
}

std::string ESPNowLRBridge::encode_state_payload_(const BridgeEntitySchema &entity, const std::vector<uint8_t> &value,
                                                  espnow_field_type_t type) const {
  switch (type) {
    case FIELD_TYPE_SENSOR:
    case FIELD_TYPE_NUMBER: {
      if (value.size() < sizeof(float)) return {};
      char buffer[32];
      snprintf(buffer, sizeof(buffer), "%g", decode_float(value.data(), value.size()));
      return buffer;
    }
    case FIELD_TYPE_SWITCH:
    case FIELD_TYPE_BINARY:
      return (!value.empty() && value[0]) ? "ON" : "OFF";
    case FIELD_TYPE_TEXT:
    case FIELD_TYPE_TEXT_SENSOR:
      return std::string(reinterpret_cast<const char *>(value.data()), value.size());
    case FIELD_TYPE_COVER:
    case FIELD_TYPE_VALVE:
      return std::to_string(!value.empty() ? value[0] : 0);
    case FIELD_TYPE_FAN:
      return (!value.empty() && value[0]) ? "ON" : "OFF";
    case FIELD_TYPE_LIGHT:
      return (!value.empty() && value[0]) ? "ON" : "OFF";
    case FIELD_TYPE_LOCK:
      return !value.empty() && value[0] == 1 ? "LOCKED" : (!value.empty() && value[0] == 2 ? "JAMMED" : "UNLOCKED");
    case FIELD_TYPE_SELECT:
      if (!entity.entity_options.empty()) {
        auto options = split_string(entity.entity_options, '|');
        if (!value.empty() && value[0] < options.size()) return options[value[0]];
      }
      return std::to_string(!value.empty() ? value[0] : 0);
    case FIELD_TYPE_ALARM:
      switch (!value.empty() ? value[0] : 0) {
        case 1: return "armed_home";
        case 2: return "armed_away";
        case 3: return "armed_night";
        case 4: return "armed_vacation";
        case 5: return "armed_custom_bypass";
        case 6: return "triggered";
        case 7: return "pending";
        case 8: return "arming";
        case 9: return "disarming";
        default: return "disarmed";
      }
    case FIELD_TYPE_BUTTON:
      return "press";
    case FIELD_TYPE_EVENT:
      return std::string(reinterpret_cast<const char *>(value.data()), value.size());
    default:
      return {};
  }
}

bool ESPNowLRBridge::decode_command_payload_(const BridgeEntitySchema &entity, CommandRouteKind route_kind,
                                             const std::string &payload, std::vector<uint8_t> &value,
                                             const std::vector<uint8_t> &current_value) const {
  value.clear();
  switch (static_cast<espnow_field_type_t>(entity.entity_type)) {
    case FIELD_TYPE_SWITCH:
      value = {static_cast<uint8_t>(parse_on(payload) ? 1 : 0)};
      return true;
    case FIELD_TYPE_NUMBER: {
      char *end = nullptr;
      const float parsed = strtof(payload.c_str(), &end);
      if (end == payload.c_str()) return false;
      value.resize(ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN);
      encode_float(parsed, value.data(), sizeof(parsed));
      return true;
    }
    case FIELD_TYPE_TEXT:
      value.assign(payload.begin(), payload.end());
      return true;
    case FIELD_TYPE_COVER:
    case FIELD_TYPE_VALVE:
      value.resize(2);
      if (payload == "OPEN") {
        value[0] = POSITION_COMMAND_OPEN;
        value[1] = 100;
      } else if (payload == "CLOSE") {
        value[0] = POSITION_COMMAND_CLOSE;
        value[1] = 0;
      } else if (payload == "STOP") {
        value[0] = POSITION_COMMAND_STOP;
        value[1] = 0;
      } else {
        value[0] = POSITION_COMMAND_SET_POSITION;
        value[1] = static_cast<uint8_t>(std::max(0, std::min(100, atoi(payload.c_str()))));
      }
      return true;
    case FIELD_TYPE_LOCK:
      value = {static_cast<uint8_t>((payload == "LOCK" || payload == "LOCKED") ? 1 : 0)};
      return true;
    case FIELD_TYPE_SELECT:
      value.resize(1);
      if (!entity.entity_options.empty()) {
        const auto parsed_options = parse_options_map(entity.entity_options);
        auto options = option_list(parsed_options, "options");
        if (options.empty()) options = split_string(entity.entity_options, '|');
        for (size_t i = 0; i < options.size(); i++) {
          if (options[i] == payload) {
            value[0] = static_cast<uint8_t>(i);
            return true;
          }
        }
      }
      value[0] = static_cast<uint8_t>(atoi(payload.c_str()));
      return true;
    case FIELD_TYPE_ALARM:
      if (!payload.empty() && payload[0] == '{') {
        return json::parse_json(payload, [&value](JsonObject root) -> bool {
          const char *state = root["state"];
          if (state == nullptr) return false;
          std::string command = state;
          std::string code;
          if (root["code"].is<const char *>()) code = root["code"].as<std::string>();
          value.resize(1 + code.size());
          if (command == "ARM_HOME") value[0] = 1;
          else if (command == "ARM_AWAY") value[0] = 2;
          else if (command == "ARM_NIGHT") value[0] = 3;
          else if (command == "ARM_VACATION") value[0] = 4;
          else if (command == "ARM_CUSTOM_BYPASS") value[0] = 5;
          else if (command == "TRIGGERED") value[0] = 6;
          else if (command == "PENDING") value[0] = 7;
          else value[0] = 0;
          if (!code.empty()) memcpy(value.data() + 1, code.data(), code.size());
          return true;
        });
      }
      value.resize(1);
      if (payload == "ARM_HOME") value[0] = 1;
      else if (payload == "ARM_AWAY") value[0] = 2;
      else if (payload == "ARM_NIGHT") value[0] = 3;
      else if (payload == "ARM_VACATION") value[0] = 4;
      else if (payload == "ARM_CUSTOM_BYPASS") value[0] = 5;
      else if (payload == "TRIGGERED") value[0] = 6;
      else if (payload == "PENDING") value[0] = 7;
      else value[0] = 0;
      return true;
    case FIELD_TYPE_FAN: {
      const auto options = parse_options_map(entity.entity_options);
      const uint32_t speed_count = option_u32(options, "speed_count", 0);
      switch (route_kind) {
        case CommandRouteKind::PRIMARY: {
          value.resize(4);
          if (current_value.size() >= 4) {
            value[0] = parse_on(payload) ? 1 : 0;
            value[1] = current_value[1];
            value[2] = current_value[2];
            value[3] = current_value[3];
          } else {
            value.assign(4, 0);
            value[0] = parse_on(payload) ? 1 : 0;
          }
          return true;
        }
        case CommandRouteKind::FAN_SPEED: {
          char *end = nullptr;
          const long parsed = strtol(payload.c_str(), &end, 10);
          if (end == payload.c_str()) return false;
          int pct = std::max(0, std::min(100, static_cast<int>(parsed)));
          int level = speed_count > 0 ? (pct * static_cast<int>(speed_count) + 50) / 100 : 0;
          level = std::max(0, std::min(static_cast<int>(speed_count), level));
          value.resize(4);
          if (current_value.size() >= 4) {
            value[0] = current_value[0];  // preserve state
            value[1] = static_cast<uint8_t>(level);
            value[2] = current_value[2];  // preserve oscillation
            value[3] = current_value[3];  // preserve direction
          } else {
            value.assign(4, 0);
            value[0] = (level > 0) ? 1 : 0;  // derive state from speed
            value[1] = static_cast<uint8_t>(level);
          }
          return true;
        }
        case CommandRouteKind::FAN_OSCILLATION: {
          bool osc_on = (payload == "oscillate_on" || payload == "ON" || payload == "on" || payload == "1");
          value.resize(4);
          if (current_value.size() >= 4) {
            value[0] = current_value[0];  // preserve state
            value[1] = current_value[1];  // preserve speed
            value[2] = osc_on ? 1 : 0;
            value[3] = current_value[3];  // preserve direction
          } else {
            value.assign(4, 0);
            value[2] = osc_on ? 1 : 0;
          }
          return true;
        }
        case CommandRouteKind::FAN_DIRECTION: {
          bool reverse = (payload == "reverse" || payload == "REVERSE");
          value.resize(4);
          if (current_value.size() >= 4) {
            value[0] = current_value[0];  // preserve state
            value[1] = current_value[1];  // preserve speed
            value[2] = current_value[2];  // preserve oscillation
            value[3] = reverse ? 1 : 0;
          } else {
            value.assign(4, 0);
            value[3] = reverse ? 1 : 0;
          }
          return true;
        }
      }
      return true;
    }
    case FIELD_TYPE_LIGHT:
      if (!payload.empty() && payload[0] == '{') {
        value.assign(9, 0);
        bool ok = false;
        bool has_state = false;
        bool has_non_state_update = false;
        const auto parsed_options = parse_options_map(entity.entity_options);
        const auto effects = option_list(parsed_options, "effects");
        return json::parse_json(payload, [&value, &ok, &effects, &has_state, &has_non_state_update](JsonObject root) -> bool {
          if (root["state"].is<const char *>()) {
            value[0] = parse_on(root["state"].as<std::string>()) ? 1 : 0;
            has_state = true;
            ok = true;
          }
          if (root["brightness"].is<int>()) {
            value[1] = static_cast<uint8_t>(std::max(0, std::min(255, root["brightness"].as<int>())));
            has_non_state_update = true;
            ok = true;
          }
          if (root["effect"].is<const char *>()) {
            const std::string effect = root["effect"].as<std::string>();
            for (size_t i = 0; i < effects.size(); i++) {
              if (effects[i] == effect) {
                value[4] = static_cast<uint8_t>(i);
                ok = true;
                break;
              }
            }
            if (effect == "None") {
              value[4] = 0;
              ok = true;
            }
            has_non_state_update = true;
            ok = true;
          }
          if (root["color"].is<JsonObject>()) {
            JsonObject color = root["color"].as<JsonObject>();
            const float r = static_cast<float>(color["r"] | 0) / 255.0f;
            const float g = static_cast<float>(color["g"] | 0) / 255.0f;
            const float b = static_cast<float>(color["b"] | 0) / 255.0f;
            const float max_v = std::max({r, g, b});
            const float min_v = std::min({r, g, b});
            const float delta = max_v - min_v;
            float hue = 0.0f;
            if (delta > 0.0001f) {
              if (max_v == r) hue = 60.0f * std::fmod(((g - b) / delta), 6.0f);
              else if (max_v == g) hue = 60.0f * (((b - r) / delta) + 2.0f);
              else hue = 60.0f * (((r - g) / delta) + 4.0f);
            }
            if (hue < 0.0f) hue += 360.0f;
            const float sat = max_v <= 0.0001f ? 0.0f : delta / max_v;
            value[2] = static_cast<uint8_t>(std::lround((hue / 360.0f) * 255.0f));
            value[3] = static_cast<uint8_t>(std::lround(sat * 255.0f));
            if (value[1] == 0) value[1] = static_cast<uint8_t>(std::lround(max_v * 255.0f));
            has_non_state_update = true;
            ok = true;
          }
          if (root["color_temp"].is<float>()) {
            const uint16_t ct = static_cast<uint16_t>(std::max(0.0f, std::min(65535.0f, root["color_temp"].as<float>())));
            value[6] = ct & 0xFF;
            value[7] = (ct >> 8) & 0xFF;
            has_non_state_update = true;
            ok = true;
          }
          if (root["white"].is<int>()) {
            value[8] = static_cast<uint8_t>(std::max(0, std::min(255, root["white"].as<int>())));
            has_non_state_update = true;
            ok = true;
          }
          if (!has_state && has_non_state_update) value[0] = 1;
          return ok;
        });
      }
      value.resize(9);
      value[0] = parse_on(payload) ? 1 : 0;
      value[1] = value[0] ? 255 : 0;
      return true;
    case FIELD_TYPE_BUTTON:
      value = {1};
      return true;
    default:
      return false;
  }
}

std::string ESPNowLRBridge::entity_record_key_(const uint8_t *mac, uint8_t entity_index) const {
  return node_key_(mac) + "_" + std::to_string(entity_index);
}

void ESPNowLRBridge::subscribe_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) {
  if (!is_connected()) return;
  const auto type = static_cast<espnow_field_type_t>(entity.entity_type);
  if (!(type == FIELD_TYPE_SWITCH || type == FIELD_TYPE_NUMBER || type == FIELD_TYPE_TEXT || type == FIELD_TYPE_COVER ||
        type == FIELD_TYPE_VALVE || type == FIELD_TYPE_LOCK || type == FIELD_TYPE_SELECT || type == FIELD_TYPE_ALARM ||
        type == FIELD_TYPE_FAN || type == FIELD_TYPE_LIGHT || type == FIELD_TYPE_BUTTON)) {
    return;
  }
  std::array<uint8_t, 6> leaf{};
  memcpy(leaf.data(), mac, 6);
  auto subscribe_route = [&](const std::string &topic, CommandRouteKind route_kind) {
    command_routes_[topic] = {leaf, entity.entity_index, route_kind};
    if (subscribed_topics_.insert(topic).second) {
      this->subscribe(topic, &ESPNowLRBridge::handle_command_message_);
    }
  };

  subscribe_route(command_topic_(mac, entity), CommandRouteKind::PRIMARY);
  if (type != FIELD_TYPE_FAN) return;

  const auto options = parse_options_map(entity.entity_options);
  if (option_u32(options, "speed_count", 0) > 0)
    subscribe_route(fan_speed_command_topic_(mac, entity), CommandRouteKind::FAN_SPEED);
  if (option_is_true(options, "oscillation"))
    subscribe_route(fan_oscillation_command_topic_(mac, entity), CommandRouteKind::FAN_OSCILLATION);
  if (option_is_true(options, "direction"))
    subscribe_route(fan_direction_command_topic_(mac, entity), CommandRouteKind::FAN_DIRECTION);
}

void ESPNowLRBridge::queue_discovery_(const uint8_t *mac, const BridgeEntitySchema &entity, uint8_t total_entities,
                                      bool is_commandable) {
  const std::string key = entity_record_key_(mac, entity.entity_index);
  auto &rec = mqtt_entities_[key];
  memcpy(rec.leaf_mac.data(), mac, 6);
  rec.node_id = node_key_(mac);
  rec.schema = entity;
  rec.total_entities = total_entities;
  rec.discovery_dirty = true;
  rec.discovery_published = false;
  rec.first_state_publish_pending = false;
  rec.discovery_published_ms = 0;
  rec.current_type = static_cast<espnow_field_type_t>(entity.entity_type);
  rec.command_subscribed = is_commandable;
}

void ESPNowLRBridge::queue_state_(const uint8_t *mac, const BridgeEntitySchema &entity,
                                  const std::vector<uint8_t> &value, espnow_field_type_t type,
                                  const std::string &text_value, uint32_t message_tx_base,
                                  const uint8_t *next_hop_mac) {
  const std::string key = entity_record_key_(mac, entity.entity_index);
  auto &rec = mqtt_entities_[key];
  memcpy(rec.leaf_mac.data(), mac, 6);
  if (rec.schema.entity_type == 0) rec.schema = entity;
  rec.current_value = value;
  rec.current_type = type;
  rec.text_value = text_value;
  rec.state_dirty = true;
  if (!rec.discovery_published) {
    rec.first_state_publish_pending = true;
    ESP_LOGW(TAG, "STATE for entity %u queued before discovery publish completed", entity.entity_index);
  }
  if (next_hop_mac != nullptr) {
    rec.pending_state_ack_ = true;
    rec.pending_ack_message_tx_base_ = message_tx_base;
    rec.pending_ack_entity_index_ = entity.entity_index;
    rec.pending_ack_queued_ms_ = millis();
    memcpy(rec.ack_next_hop_mac_.data(), next_hop_mac, 6);
  }
  if (api_ws_ != nullptr) {
    api_ws_->emit_remote_state(mac, entity, value, type);
  }
}

void ESPNowLRBridge::queue_availability_(const uint8_t *mac, bool online) {
  std::array<uint8_t, 6> key{};
  memcpy(key.data(), mac, key.size());
  availability_queue_.emplace_back(key, online);
  if (api_ws_ != nullptr) {
    const BridgeSession *session = protocol_.get_session(mac);
    const int8_t rssi = session == nullptr ? -127 : session->last_rssi;
    const uint32_t last_seen_ms = session == nullptr ? 0 : session->last_seen_ms;
    api_ws_->emit_remote_availability(mac, online, online ? "online" : "offline", rssi, last_seen_ms);
    api_ws_->emit_topology_changed(online ? "remote_online" : "remote_offline", mac);
  }
  if (online) {
    queue_remote_diag_refresh_(mac);
  } else {
    remote_diag_refresh_pending_.erase(mac_key_string_(mac));
  }
}

void ESPNowLRBridge::queue_clear_entities_(const uint8_t *mac, const std::vector<BridgeEntitySchema> &old_entities) {
  for (const auto &entity : old_entities) {
    const std::string key = entity_record_key_(mac, entity.entity_index);
    auto it = mqtt_entities_.find(key);
    if (it != mqtt_entities_.end()) {
      do_clear_entity_(mac, entity);
      mqtt_entities_.erase(it);
    }
  }
}

void ESPNowLRBridge::do_publish_discovery_(MqttEntityRecord &rec) {
  if (!is_connected()) return;
  const uint8_t *mac = rec.leaf_mac.data();
  const BridgeEntitySchema &entity = rec.schema;
  const auto type = static_cast<espnow_field_type_t>(entity.entity_type);
  const std::string component = entity_component_(type);
  const std::string object_id = entity_object_id_(mac, entity);
  const std::string discovery_topic =
      mqtt_discovery_prefix_ + "/" + component + "/" + node_key_(mac) + "/" + object_id + "/config";
  const std::string device_id = std::string("espnow_lr_") + node_key_(mac);
  const std::string display_name = remote_display_name_(mac);
  const bool ok = publish_json(discovery_topic, [this, mac, entity, type, component, device_id, display_name](JsonObject root) {
    root["name"] = entity.entity_name;
    root["uniq_id"] = unique_id_(mac, entity);
    root["default_entity_id"] = default_entity_id_(mac, entity);
    root["stat_t"] = state_topic_(mac, entity);
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
    if (!entity.entity_unit.empty()) root["unit_of_meas"] = entity.entity_unit;
    switch (type) {
      case FIELD_TYPE_SWITCH:
        root["ic"] = "mdi:toggle-switch";
        root["cmd_t"] = command_topic_(mac, entity);
        root["pl_on"] = "ON";
        root["pl_off"] = "OFF";
        root["stat_on"] = "ON";
        root["stat_off"] = "OFF";
        break;
      case FIELD_TYPE_BINARY:
        root["ic"] = "mdi:check-circle-outline";
        root["pl_on"] = "ON";
        root["pl_off"] = "OFF";
        break;
      case FIELD_TYPE_LOCK:
        root["ic"] = "mdi:lock";
        root["cmd_t"] = command_topic_(mac, entity);
        root["pl_lock"] = "LOCK";
        root["pl_unlk"] = "UNLOCK";
        root["stat_locked"] = "LOCKED";
        root["stat_unlocked"] = "UNLOCKED";
        root["payload_lock"] = "LOCK";
        root["payload_unlock"] = "UNLOCK";
        root["state_locked"] = "LOCKED";
        root["state_unlocked"] = "UNLOCKED";
        break;
      case FIELD_TYPE_BUTTON:
        root["ic"] = "mdi:gesture-tap-button";
        break;
      case FIELD_TYPE_COVER:
        root["ic"] = "mdi:window-shutter";
        root["cmd_t"] = command_topic_(mac, entity);
        root["pos_t"] = state_topic_(mac, entity);
        break;
      case FIELD_TYPE_VALVE:
        root["ic"] = "mdi:valve";
        root["cmd_t"] = command_topic_(mac, entity);
        root["pos_t"] = state_topic_(mac, entity);
        break;
      case FIELD_TYPE_FAN:
        root["ic"] = "mdi:fan";
        root["cmd_t"] = command_topic_(mac, entity);
        root["pl_on"] = "ON";
        root["pl_off"] = "OFF";
        root["stat_on"] = "ON";
        root["stat_off"] = "OFF";
        root["payload_on"] = "ON";
        root["payload_off"] = "OFF";
        root["state_on"] = "ON";
        root["state_off"] = "OFF";
        {
          const auto options = parse_options_map(entity.entity_options);
          const uint32_t speed_count = option_u32(options, "speed_count", 0);
          if (speed_count > 0) {
            root["pct_cmd_t"] = fan_speed_command_topic_(mac, entity);
            root["pct_stat_t"] = fan_speed_state_topic_(mac, entity);
            root["spd_rng_max"] = speed_count;
            root["percentage_command_topic"] = fan_speed_command_topic_(mac, entity);
            root["percentage_state_topic"] = fan_speed_state_topic_(mac, entity);
            root["speed_range_max"] = speed_count;
            root["speed_range_min"] = 1;
          }
          if (option_is_true(options, "oscillation")) {
            root["osc_cmd_t"] = fan_oscillation_command_topic_(mac, entity);
            root["osc_stat_t"] = fan_oscillation_state_topic_(mac, entity);
            root["oscillation_command_topic"] = fan_oscillation_command_topic_(mac, entity);
            root["oscillation_state_topic"] = fan_oscillation_state_topic_(mac, entity);
            root["payload_oscillation_on"] = "oscillate_on";
            root["payload_oscillation_off"] = "oscillate_off";
          }
          if (option_is_true(options, "direction")) {
            root["dir_cmd_t"] = fan_direction_command_topic_(mac, entity);
            root["dir_stat_t"] = fan_direction_state_topic_(mac, entity);
            root["direction_command_topic"] = fan_direction_command_topic_(mac, entity);
            root["direction_state_topic"] = fan_direction_state_topic_(mac, entity);
            root["payload_direction_forward"] = "forward";
            root["payload_direction_reverse"] = "reverse";
          }
        }
        break;
      case FIELD_TYPE_LIGHT:
        root["ic"] = "mdi:lightbulb";
        root["cmd_t"] = command_topic_(mac, entity);
        root["schema"] = "json";
        {
          const auto options = parse_options_map(entity.entity_options);
          const bool supports_brightness = option_has_list_value(options, "color_modes", "brightness") ||
                                           option_has_list_value(options, "color_modes", "rgb") ||
                                           option_has_list_value(options, "color_modes", "rgbw") ||
                                           option_has_list_value(options, "color_modes", "rgbww") ||
                                           option_has_list_value(options, "color_modes", "white") ||
                                           option_has_list_value(options, "color_modes", "color_temp");
          const bool supports_rgb = option_has_list_value(options, "color_modes", "rgb") ||
                                    option_has_list_value(options, "color_modes", "rgbw") ||
                                    option_has_list_value(options, "color_modes", "rgbww");
          const bool supports_color_temp = option_has_list_value(options, "color_modes", "color_temp");
          JsonArray modes = root["supported_color_modes"].to<JsonArray>();
          for (const auto &mode : option_list(options, "color_modes")) modes.add(mode);
          root["brightness"] = supports_brightness;
          root["brightness_scale"] = 255;
          if (supports_rgb) root["rgb"] = true;
          if (option_has_list_value(options, "color_modes", "color_temp")) {
            root["min_mireds"] = option_float(options, "min_mireds");
            root["max_mireds"] = option_float(options, "max_mireds");
            root["color_temp"] = supports_color_temp;
          }
          const auto effects = option_list(options, "effects");
          if (!effects.empty()) {
            root["effect"] = true;
            JsonArray effect_list = root["effect_list"].to<JsonArray>();
            for (const auto &effect : effects) effect_list.add(effect);
            effect_list.add("None");
          }
        }
        break;
      case FIELD_TYPE_ALARM:
        root["ic"] = "mdi:shield-home";
        root["cmd_t"] = command_topic_(mac, entity);
        root["payload_disarm"] = "DISARM";
        root["payload_arm_home"] = "ARM_HOME";
        root["payload_arm_away"] = "ARM_AWAY";
        root["payload_arm_night"] = "ARM_NIGHT";
        root["payload_arm_vacation"] = "ARM_VACATION";
        root["payload_arm_custom_bypass"] = "ARM_CUSTOM_BYPASS";
        root["payload_trigger"] = "TRIGGERED";
        {
          const auto options = parse_options_map(entity.entity_options);
          JsonArray supported = root["supported_features"].to<JsonArray>();
          const uint32_t features = option_u32(options, "features");
          if (features & 0x02) supported.add("arm_away");
          if (features & 0x01) supported.add("arm_home");
          if (features & 0x04) supported.add("arm_night");
          if (features & 0x20) supported.add("arm_vacation");
          if (features & 0x10) supported.add("arm_custom_bypass");
          if (features & 0x08) supported.add("trigger");
          root["code_disarm_required"] = option_is_true(options, "requires_code");
          root["code_arm_required"] = option_is_true(options, "requires_code_to_arm");
        }
        break;
      case FIELD_TYPE_NUMBER:
        root["cmd_t"] = command_topic_(mac, entity);
        root["mode"] = "box";
        if (!entity.entity_options.empty()) {
          for (const auto &part : split_string(entity.entity_options, ';')) {
            const auto eq = part.find('=');
            if (eq == std::string::npos) continue;
            const auto k = part.substr(0, eq);
            const auto v = part.substr(eq + 1);
            if (k == "min") root["min"] = atof(v.c_str());
            if (k == "max") root["max"] = atof(v.c_str());
            if (k == "step") root["step"] = atof(v.c_str());
          }
        }
        break;
      case FIELD_TYPE_TEXT:
        root["ic"] = "mdi:text-box";
        root["cmd_t"] = command_topic_(mac, entity);
        root["mode"] = "text";
        break;
      case FIELD_TYPE_TEXT_SENSOR:
        root["ic"] = "mdi:text";
        break;
      case FIELD_TYPE_SELECT:
        root["ic"] = "mdi:format-list-bulleted";
        root["cmd_t"] = command_topic_(mac, entity);
        if (!entity.entity_options.empty()) {
          JsonArray options = root["options"].to<JsonArray>();
          auto select_options = option_list(parse_options_map(entity.entity_options), "options");
          if (select_options.empty()) select_options = split_string(entity.entity_options, '|');
          for (const auto &option : select_options) options.add(option);
        }
        break;
      case FIELD_TYPE_EVENT:
        if (!entity.entity_options.empty()) {
          JsonArray event_types = root["event_types"].to<JsonArray>();
          auto options = option_list(parse_options_map(entity.entity_options), "options");
          for (const auto &event_type : options) event_types.add(event_type);
        }
        break;
      default:
        break;
    }
    if (type == FIELD_TYPE_SENSOR && !entity.entity_unit.empty()) {
      // sensor with unit — nothing extra needed
    }
  }, 1, true);
  if (ok) {
    protocol_.on_discovery_confirmed_(mac, entity.entity_index, true);
  }
  subscribe_command_topic_(mac, entity);
  rec.discovery_dirty = false;
  rec.discovery_published = true;
  rec.discovery_published_ms = millis();
}

bool ESPNowLRBridge::do_publish_state_(MqttEntityRecord &rec) {
  if (!is_connected()) {
    ESP_LOGW(TAG, "MQTT disconnected; deferring STATE publish for entity %u", rec.schema.entity_index);
    return false;
  }
  const uint8_t *mac = rec.leaf_mac.data();
  const BridgeEntitySchema &entity = rec.schema;
  const espnow_field_type_t type = rec.current_type;
  bool ok = true;
  if (type == FIELD_TYPE_BUTTON) {
    ok = publish_json(state_topic_(mac, entity), [=](JsonObject root) { root["event_type"] = "press"; }, 1, false);
    delay(YIELD_MS);
  } else if (type == FIELD_TYPE_EVENT) {
    ok = publish_json(state_topic_(mac, entity), [event_type = rec.text_value](JsonObject root) { root["event_type"] = event_type; }, 1, false);
    delay(YIELD_MS);
  } else if (type == FIELD_TYPE_FAN) {
    const auto options = parse_options_map(entity.entity_options);
    ok = publish(state_topic_(mac, entity), (!rec.current_value.empty() && rec.current_value[0]) ? "ON" : "OFF", 1);
    delay(YIELD_MS);
    if (ok && rec.current_value.size() > 1 && option_u32(options, "speed_count", 0) > 0) {
      uint32_t speed_count = option_u32(options, "speed_count", 0);
      uint8_t level = rec.current_value[1];
      if (level > speed_count) level = speed_count;
      int pct = (level * 100) / speed_count;
      ok = publish(fan_speed_state_topic_(mac, entity), std::to_string(pct), 1);
      delay(YIELD_MS);
    }
    if (ok && rec.current_value.size() > 2 && option_is_true(options, "oscillation")) {
      ok = publish(fan_oscillation_state_topic_(mac, entity), rec.current_value[2] ? "oscillate_on" : "oscillate_off", 1);
      delay(YIELD_MS);
    }
    if (ok && rec.current_value.size() > 3 && option_is_true(options, "direction")) {
      ok = publish(fan_direction_state_topic_(mac, entity), rec.current_value[3] ? "reverse" : "forward", 1);
      delay(YIELD_MS);
    }
  } else if (type == FIELD_TYPE_LIGHT) {
    const auto options = parse_options_map(entity.entity_options);
    ok = publish_json(state_topic_(mac, entity), [value = rec.current_value, options](JsonObject root) {
      root["state"] = (!value.empty() && value[0]) ? "ON" : "OFF";
      if (value.size() > 5) {
        root["color_mode"] = color_mode_name_(value[5]);
      } else if (value.size() > 3 &&
                 (option_has_list_value(options, "color_modes", "rgb") ||
                  option_has_list_value(options, "color_modes", "rgbw") ||
                  option_has_list_value(options, "color_modes", "rgbww"))) {
        root["color_mode"] = "rgb";
      } else if (value.size() > 1 &&
                 option_has_list_value(options, "color_modes", "color_temp")) {
        root["color_mode"] = "color_temp";
      } else {
        root["color_mode"] = "brightness";
      }
      if ((option_has_list_value(options, "color_modes", "brightness") || option_has_list_value(options, "color_modes", "rgb") ||
           option_has_list_value(options, "color_modes", "rgbw") || option_has_list_value(options, "color_modes", "rgbww") ||
           option_has_list_value(options, "color_modes", "white") || option_has_list_value(options, "color_modes", "color_temp")) &&
          value.size() > 1) {
        root["brightness"] = value[1];
      }
      if ((option_has_list_value(options, "color_modes", "rgb") || option_has_list_value(options, "color_modes", "rgbw") ||
           option_has_list_value(options, "color_modes", "rgbww")) && value.size() > 3) {
        uint8_t r = 0, g = 0, b = 0;
        hsv_u8_to_rgb(value[2], value[3], value[1], r, g, b);
        JsonObject color = root["color"].to<JsonObject>();
        color["r"] = r;
        color["g"] = g;
        color["b"] = b;
      }
      if (value.size() > 7) {
        const uint16_t ct = static_cast<uint16_t>(value[6] | (static_cast<uint16_t>(value[7]) << 8));
        if (ct > 0) root["color_temp"] = ct;
      }
      if (value.size() > 8 && value[8] > 0) {
        root["white"] = value[8];
      }
      const auto effects = option_list(options, "effects");
      if (!effects.empty() && value.size() > 4) {
        root["effect"] = value[4] > 0 && value[4] <= effects.size() ? effects[value[4] - 1] : "None";
      }
    }, 1, false);
    delay(YIELD_MS);
  } else if ((type == FIELD_TYPE_TEXT || type == FIELD_TYPE_TEXT_SENSOR) && !rec.text_value.empty()) {
    ok = publish(state_topic_(mac, entity), rec.text_value, 1);
    delay(YIELD_MS);
  } else {
    ok = publish(state_topic_(mac, entity), encode_state_payload_(entity, rec.current_value, type), 1);
    delay(YIELD_MS);
  }
  if (ok) {
    rec.text_value.clear();
    rec.state_dirty = false;
    rec.first_state_publish_pending = false;
  } else {
    ESP_LOGW(TAG, "MQTT STATE publish failed for entity %u", rec.schema.entity_index);
  }
  return ok;
}

void ESPNowLRBridge::send_deferred_state_ack_(MqttEntityRecord &rec) {
  if (!rec.pending_state_ack_) return;
  if (millis() - rec.pending_ack_queued_ms_ > 2000) {
    ESP_LOGW(TAG, "STATE_ACK timeout for entity %u", rec.pending_ack_entity_index_);
    rec.pending_state_ack_ = false;
    return;
  }
  if (protocol_.confirm_state_delivery_(rec.leaf_mac.data(), rec.pending_ack_entity_index_,
                                        rec.pending_ack_message_tx_base_, rec.ack_next_hop_mac_.data())) {
    rec.pending_state_ack_ = false;
  } else {
    ESP_LOGW(TAG, "Deferred STATE_ACK send failed for entity %u rx_counter=%u",
             rec.pending_ack_entity_index_, rec.pending_ack_message_tx_base_);
  }
}

void ESPNowLRBridge::do_publish_bridge_diag_(uint32_t uptime_s, uint8_t remotes_online) {
  if (!is_connected()) return;
  publish_json("espnow_esphome_tree/bridge/diagnostics", [this, uptime_s, remotes_online](JsonObject root) {
    root["uptime_seconds"] = uptime_s;
    root["remotes_online"] = remotes_online;
    root["rx_packets"] = rx_packets_;
    root["rx_dropped"] = rx_dropped_;
    root["tx_ok"] = tx_ok_;
    root["tx_fail"] = tx_fail_;
  }, 1, false);
}

void ESPNowLRBridge::log_airtime_status_() {
  const uint32_t now_ms = millis();
  if (airtime_window_start_ms_ == 0) {
    airtime_window_start_ms_ = now_ms;
    rolling_airtime_.window_start_ms = now_ms;
    return;
  }
  const uint32_t elapsed_ms = now_ms - airtime_window_start_ms_;
  if (elapsed_ms < AIRTIME_REPORT_INTERVAL_MS) return;

  const uint64_t total_airtime_us = rolling_airtime_.tx_airtime_us + rolling_airtime_.rx_airtime_us;
  const uint64_t window_duration_us = static_cast<uint64_t>(elapsed_ms) * 1000ULL;
  const float busy_pct = (window_duration_us > 0) ? (static_cast<float>(total_airtime_us) / static_cast<float>(window_duration_us)) * 100.0f : 0.0f;

  const uint32_t uptime_s = protocol_.bridge_uptime_s_;

  const int8_t avg_rssi = (rolling_airtime_.rssi_count > 0)
                              ? static_cast<int8_t>(rolling_airtime_.rssi_sum / static_cast<int64_t>(rolling_airtime_.rssi_count))
                              : 0;

  const uint32_t total_tx = rolling_airtime_.tx_packets;
  const uint32_t total_rx = rolling_airtime_.rx_packets;
  const float fail_pct = (tx_ok_ + tx_fail_ > 0) ? (static_cast<float>(tx_fail_) / static_cast<float>(tx_ok_ + tx_fail_)) * 100.0f : 0.0f;

  uint16_t total_children = 0;
  for (const auto &kv : remote_diag_cache_) {
    total_children += kv.second.total_children;
  }

  const char *mode_str = espnow_mode_ == "lr" ? "LR" : "R";
  ESP_LOGI(TAG, "up:%s | radio(%s):%.1f%% | tx:%u rx:%u | rssi:%ddBm | fail:%d%% | children:%u",
           format_uptime(uptime_s).c_str(), mode_str, busy_pct, total_tx, total_rx, avg_rssi, static_cast<int>(fail_pct), total_children);

  airtime_window_start_ms_ = now_ms;
  rolling_airtime_.tx_packets = 0;
  rolling_airtime_.rx_packets = 0;
  rolling_airtime_.tx_airtime_us = 0;
  rolling_airtime_.rx_airtime_us = 0;
  rolling_airtime_.rssi_sum = 0;
  rolling_airtime_.rssi_count = 0;
}

std::string ESPNowLRBridge::build_topology_json_() const {
  static const uint32_t OFFLINE_TIMEOUT_MS = 86400000;
  const uint32_t now_ms = millis();
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());

  std::string json = "[";
  json += "{\"mac\":\"" + bridge_mac + "\",\"label\":\"" + bridge_friendly_name_ +
          "\",\"parent_mac\":\"\",\"online\":true,\"state\":5,\"hops\":0,\"uptime_s\":" +
          std::to_string(protocol_.bridge_uptime_s_) +
          ",\"route_v2_capable\":true,\"session_max_payload\":" +
          std::to_string(protocol_.bridge_session_flags() ? ESPNOW_LR_V2_MAX_PAYLOAD : ESPNOW_LR_V1_MAX_PAYLOAD) +
          ",\"bridge_session_flags\":" + std::to_string(protocol_.bridge_session_flags()) + "}";
  bool need_comma = true;

  for (const auto &entry : protocol_.get_sessions()) {
    const auto &session = entry.second;
    const uint32_t last_seen_ago = session.last_seen_ms == 0 ? UINT32_MAX : (now_ms - session.last_seen_ms);
    const bool online = session.online.load();
    if (!online && last_seen_ago > OFFLINE_TIMEOUT_MS) continue;
    const std::string mac = mac_colon_string_(session.leaf_mac.data());
    const std::string label = session.node_label.empty() ? mac : session.node_label;
    const std::string parent = mac_colon_string_(session.parent_mac.data());
    const uint32_t offline_s = online ? 0 : ((now_ms - session.last_seen_ms) / 1000U);
    std::string build_date_str;
    if (!session.build_date.empty() && !session.build_time.empty()) {
      build_date_str = format_build_date_(session.build_date.c_str(), session.build_time.c_str());
    }
    if (need_comma) json += ",";
    json += "{\"mac\":\"" + mac + "\",\"label\":\"" + label +
            "\",\"parent_mac\":\"" + parent +
            "\",\"online\":" + (online ? "true" : "false") +
            ",\"state\":" + std::to_string(static_cast<uint8_t>(session.remote_state)) +
            ",\"hops\":" + std::to_string(session.hops_to_bridge) +
            ",\"offline_s\":" + std::to_string(offline_s) +
            ",\"uptime_s\":" + std::to_string(session.uptime_seconds) +
            ",\"entity_count\":" + std::to_string(session.schema_entities.size()) +
            ",\"firmware_version\":\"" + session.project_version + "\"" +
            ",\"esphome_name\":\"" + session.esphome_name + "\"" +
            ",\"project_name\":\"" + session.project_name + "\"" +
            ",\"firmware_build_date\":\"" + build_date_str + "\"" +
            ",\"chip_type\":" + std::to_string(session.chip_model) +
            ",\"chip_name\":\"" + chip_model_string(session.chip_model) + "\"" +
            ",\"rssi\":" + std::to_string(session.last_rssi) +
            ",\"route_v2_capable\":" + (session.route_v2_capable ? "true" : "false") +
            ",\"session_max_payload\":" + std::to_string(session.session_max_payload) +
            ",\"leaf_session_flags\":" + std::to_string(session.leaf_session_flags) +
            ",\"bridge_session_flags\":" + std::to_string(protocol_.bridge_session_flags()) + "}";
    need_comma = true;
  }
  json += "]";
  return json;
}

std::string ESPNowLRBridge::build_remote_info_json_(const uint8_t *mac) const {
  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr) {
    return "{}";
  }
  std::string json = "{";
  json += "\"label\":\"" + (session->node_label.empty() ? mac_key_string_(mac) : session->node_label) + "\",";
  json += "\"online\":" + std::string(session->online ? "true" : "false") + ",";
  json += "\"uptime_s\":" + std::to_string(session->uptime_seconds) + ",";
  json += "\"hops\":" + std::to_string(session->hops_to_bridge) + ",";
  json += "\"rssi\":" + std::to_string(session->last_rssi) + ",";
  json += "\"entity_count\":" + std::to_string(session->schema_entities.size()) + ",";
  json += "\"firmware_version\":\"" + session->project_version + "\",";
  json += "}";
  return json;
}

std::string ESPNowLRBridge::api_bridge_info_json() const {
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string device_name = sanitize_object_id(App.get_name().str());
  const std::string esphome_version = ESPHOME_VERSION;

  std::string json;
  json.reserve(1024);
  json += "{\"api_version\":";
  json += std::to_string(bridge_api::kApiVersion);
  json += ",\"name\":\"";
  json += device_name;
  json += "\",\"mac\":\"";
  json += bridge_mac;
  json += "\",\"firmware\":{";
  json += "\"name\":\"";
  json += device_name;
  json += "\",\"version\":\"";
  json += esphome_version;
  json += "\",\"esphome_version\":\"";
  json += esphome_version;
  json += "\"";
  json += "},\"features\":{";
  json += "\"topology\":true,";
  json += "\"events\":true,";
  json += "\"cache_invalidate\":true,";
  json += "\"ota_ws\":true,";
  json += "\"mqtt_export\":true,";
  json += "\"legacy_http\":true";
  json += "},\"limits\":{";
  json += "\"max_json_bytes\":";
  json += std::to_string(bridge_api::kMaxJsonBytes);
  json += ",\"max_ws_chunk_size\":";
  json += std::to_string(bridge_api::kMaxWsChunkSize);
  json += ",\"ota_window_size\":";
  json += std::to_string(bridge_api::kOtaWindowSize);
  json += "}}";
  return json;
}

std::string ESPNowLRBridge::api_topology_snapshot_json(const std::string &request_payload_json) const {
  static const uint32_t OFFLINE_TIMEOUT_MS = 86400000;
  const uint32_t now_ms = millis();

  snapshot_sequence_++;

  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string bridge_mac_key = mac_key_string_(sta_mac_.data());
  const std::string node_name = sanitize_object_id(App.get_name().str());

  std::string json;
  json.reserve(4096);
  json += "{\"bridge\":{";
  json += "\"mac\":\"" + bridge_mac + "\",";
  json += "\"name\":\"" + node_name + "\",";
  json += "\"uptime_s\":" + std::to_string(protocol_.bridge_uptime_s_) + ",";
  json += "\"uptime_ms\":" + std::to_string(now_ms) + ",";
  json += "\"snapshot_sequence\":" + std::to_string(snapshot_sequence_);
  json += "},\"nodes\":[";

  bool first_node = true;
  for (const auto &entry : protocol_.get_sessions()) {
    const auto &session = entry.second;
    const uint32_t last_seen_ago = session.last_seen_ms == 0 ? UINT32_MAX : (now_ms - session.last_seen_ms);
    const bool online = session.online.load();
    if (!online && last_seen_ago > OFFLINE_TIMEOUT_MS) continue;

    const std::string mac = mac_colon_string_(session.leaf_mac.data());
    const std::string mac_key = mac_key_string_(session.leaf_mac.data());
    const std::string parent_mac = mac_colon_string_(session.parent_mac.data());
    const std::string label = session.node_label.empty() ? mac : session.node_label;
    const std::string name = session.esphome_name.empty() ? mac_key : session.esphome_name;
    const std::string friendly_name = session.node_label.empty() ? mac : session.node_label;
    const std::string device_unique_id = "espnow_lr_" + mac_key;
    const std::string node_key_str = mac_key;

    if (!first_node) json += ",";
    first_node = false;

    json += "{";
    json += "\"mac\":\"" + mac + "\",";
    json += "\"node_key\":\"" + node_key_str + "\",";
    json += "\"device_unique_id\":\"" + device_unique_id + "\",";
    json += "\"name\":\"" + name + "\",";
    json += "\"friendly_name\":\"" + friendly_name + "\",";
    json += "\"manufacturer\":\"ESPHome\",";
    json += "\"model\":\"espnow_lr_remote\",";
    json += "\"sw_version\":\"" + session.project_version + "\",";
    json += "\"online\":" + std::string(online ? "true" : "false") + ",";
    json += "\"parent_mac\":\"" + parent_mac + "\",";
    json += "\"hop_count\":" + std::to_string(session.hops_to_bridge) + ",";
    json += "\"rssi\":" + std::to_string(session.last_rssi) + ",";
    json += "\"last_seen_ms\":" + std::to_string(session.last_seen_ms) + ",";
    json += "\"uptime_s\":" + std::to_string(session.uptime_seconds) + ",";

    json += "\"identity\":{";
    json += "\"esphome_name\":\"" + session.esphome_name + "\",";
    json += "\"node_label\":\"" + session.node_label + "\",";
    json += "\"project_name\":\"" + session.project_name + "\",";
    json += "\"project_version\":\"" + session.project_version + "\",";
    json += "\"firmware_epoch\":" + std::to_string(session.firmware_epoch) + ",";
    json += "\"chip_model\":" + std::to_string(session.chip_model) + ",";
    json += "\"build_date\":\"";
    if (session.build_date.empty()) json += "unknown"; else json += session.build_date;
    json += "\",\"build_time\":\"";
    if (session.build_time.empty()) json += "unknown"; else json += session.build_time;
    json += "\"},";

    uint8_t schema_hash_bytes[32];
    memcpy(schema_hash_bytes, session.schema_hash.data(), sizeof(schema_hash_bytes));
    std::string schema_hash_hex = bridge_api::BridgeApiAuth::bytes_to_lower_hex(schema_hash_bytes, sizeof(schema_hash_bytes));
    json += "\"schema_hash\":\"sha256:" + schema_hash_hex + "\",";

    if (session.schema_received.load() && !session.schema_entities.empty()) {
      json += "\"schema\":{";
      json += "\"complete\":" + std::string(session.schema_received.load() ? "true" : "false") + ",";
      json += "\"total_entities\":" + std::to_string(session.schema_entities.size()) + ",";
      json += "\"entities\":[";
      for (size_t i = 0; i < session.schema_entities.size(); ++i) {
        const auto &entity = session.schema_entities[i];
        if (entity.entity_type == 0) continue;
        if (i > 0) json += ",";
        const std::string entity_object = entity.entity_id.empty() ?
            sanitize_object_id(entity.entity_name) : entity.entity_id;
        const std::string entity_unique_id = "espnow_lr_" + mac_key + "_" + entity_object;
        const std::string entity_key = entity.entity_id.empty() ? entity.entity_name : entity.entity_id;

        json += "{";
        json += "\"key\":\"" + entity_key + "\",";
        json += "\"entity_id\":\"" + entity.entity_id + "\",";
        json += "\"unique_id\":\"" + entity_unique_id + "\",";
        json += "\"entity_index\":" + std::to_string(entity.entity_index) + ",";
        json += "\"stable_identity\":" + std::string(entity.entity_id.empty() ? "false" : "true") + ",";
        json += "\"platform\":\"" + std::string(component_for_type(static_cast<espnow_field_type_t>(entity.entity_type))) + "\",";
        json += "\"name\":\"" + entity.entity_name + "\",";
        if (!entity.entity_unit.empty()) {
          json += "\"unit\":\"" + entity.entity_unit + "\",";
        }
        json += "\"native_type\":\"float\"";
        json += "}";
      }
      json += "]},";
    } else {
      json += "\"schema\": null,";
    }

    json += "\"state\":{";
    bool first_state = true;
    for (const auto &rec : mqtt_entities_) {
      if (memcmp(rec.second.leaf_mac.data(), session.leaf_mac.data(), 6) != 0) continue;
      if (rec.second.current_value.empty()) continue;
      if (!first_state) json += ",";
      first_state = false;
      const std::string entity_key = rec.second.schema.entity_id.empty() ?
          rec.second.schema.entity_name : rec.second.schema.entity_id;
      json += "\"" + bridge_api::BridgeApiMessages::escape_json(entity_key) + "\":";
      json += bridge_api::BridgeApiMessages::state_value_json(
          rec.second.current_type,
          rec.second.current_value.data(),
          rec.second.current_value.size(),
          rec.second.schema.entity_options);
    }
    json += "},";

    json += "\"session\":{";
    json += "\"joined\":" + std::string(session.schema_received.load() ? "true" : "false") + ",";
    json += "\"schema_complete\":" + std::string(session.schema_received.load() ? "true" : "false") + ",";
    json += "\"state_complete\":" + std::string(session.schema_received.load() ? "true" : "false") + ",";
    json += "\"route_v2_capable\":" + std::string(session.route_v2_capable ? "true" : "false") + ",";
    json += "\"session_flags\":" + std::to_string(session.leaf_session_flags) + ",";
    json += "\"max_payload\":" + std::to_string(session.session_max_payload) + ",";
    json += "\"max_entity_fragment\":" + std::to_string(session.max_entity_fragment) + ",";
    json += "\"refresh_pending\":false";
    json += "},";

    json += "\"radio\":{";
    json += "\"rssi\":" + std::to_string(session.last_rssi) + ",";
    json += "\"last_seen_ms\":" + std::to_string(session.last_seen_ms) + ",";
    json += "\"hops_to_bridge\":" + std::to_string(session.hops_to_bridge) + ",";
    json += "\"parent_rssi\":" + std::to_string(session.last_rssi);
    json += "},";

    json += "\"diagnostics\":{";
    json += "\"dirty_count\":0,";
    json += "\"retry_count\":0,";
    json += "\"last_error\":\"\"";
    json += "}";
    json += "}";
  }
  json += "]}";
  return json;
}

bool ESPNowLRBridge::api_ota_start(const std::string &target_mac_colon, uint32_t file_size,
                                    const std::string &md5_hex, const std::string &sha256_hex,
                                    const std::string &filename, uint16_t preferred_chunk_size,
                                    std::string &job_id_out, uint16_t &max_chunk_size_out,
                                    uint8_t &window_size_out,
                                    const std::string &request_id) {
  ws_ota_start_error_ = nullptr;

  std::string clean;
  for (char c : target_mac_colon) {
    if (c != ':' && c != '-' && c != ' ') clean += c;
  }
  uint8_t mac[6]{};
  if (!parse_mac_hex_(clean, mac)) {
    ws_ota_start_error_ = "invalid target_mac";
    return false;
  }

  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr || !session->online) {
    ws_ota_start_error_ = "remote not found or offline";
    return false;
  }

  if (ota_manager_ == nullptr || ota_manager_->is_busy()) {
    ws_ota_start_error_ = "ota busy";
    return false;
  }

  uint16_t clamped = preferred_chunk_size;
  if (clamped == 0 || clamped > bridge_api::kMaxWsChunkSize)
    clamped = bridge_api::kMaxWsChunkSize;

  uint8_t md5[16]{};
  if (!parse_md5_hex_(md5_hex, md5)) {
    ws_ota_start_error_ = "invalid md5 hex";
    return false;
  }

  uint16_t remote_max = session->session_max_payload;
  if (!ota_manager_->start_transfer(mac, file_size, md5, ESPNOW_LR_FILE_ACTION_OTA_FLASH,
                                     remote_max, filename.empty() ? "ota.bin" : filename.c_str())) {
    ws_ota_start_error_ = ota_manager_->last_error().empty() ? "start_transfer failed" : ota_manager_->last_error().c_str();
    return false;
  }

  ws_ota_job_counter_++;
  char hex_buf[8];
  snprintf(hex_buf, sizeof(hex_buf), "%04x", ws_ota_job_counter_ & 0xFFFFu);
  ws_ota_job_id_ = hex_buf;
  job_id_out = ws_ota_job_id_;

  max_chunk_size_out = clamped;
  window_size_out = bridge_api::kOtaWindowSize;

  ws_ota_job_state_ = bridge_api::OtaJobState::WAITING_FOR_LEAF;
  ws_ota_request_id_ = request_id;
  std::copy_n(mac, ws_ota_target_mac_.size(), ws_ota_target_mac_.begin());

  ESP_LOGI(TAG, "WS OTA started job=%s target=%s size=%u", ws_ota_job_id_.c_str(),
           target_mac_colon.c_str(), static_cast<unsigned>(file_size));

  (void) sha256_hex;
  return true;
}

std::string ESPNowLRBridge::api_ota_status_json() const {
  if (ws_ota_job_state_ == bridge_api::OtaJobState::IDLE) {
    return "{\"active\":false,\"state\":\"idle\"}";
  }

  std::string state_str = bridge_api::ota_job_state_string(ws_ota_job_state_);
  std::string target_mac_str = mac_display(ws_ota_target_mac_.data());
  uint32_t next_seq = 0;
  uint32_t bytes_received = 0;
  uint8_t progress = 0;
  if (ota_manager_ != nullptr) {
    next_seq = ota_manager_->window().next_seq_to_request;
    bytes_received = next_seq * ota_manager_->chunk_size();
    progress = ota_manager_->progress_pct();
    if (ota_manager_->is_busy() && ota_manager_->window().inflight_count() > 0) {
      state_str = "transferring";
    }
  }

  char json[512];
  uint16_t status_chunk_sz = ota_manager_ != nullptr ? static_cast<unsigned>(ota_manager_->chunk_size()) : static_cast<unsigned>(bridge_api::kMaxWsChunkSize);
  ESP_LOGI(TAG, "Sending ota_status with chunk_size=%u", static_cast<unsigned>(status_chunk_sz));
  snprintf(json, sizeof(json),
           "{\"active\":true,\"job_id\":\"%s\",\"target_mac\":\"%s\",\"state\":\"%s\","
           "\"bytes_received\":%u,\"size\":%u,\"percent\":%u,"
           "\"next_sequence\":%u,\"window_size\":%u,\"max_chunk_size\":%u,\"message\":\"\"}",
           ws_ota_job_id_.c_str(), target_mac_str.c_str(), state_str.c_str(),
           static_cast<unsigned>(bytes_received),
           ota_manager_ != nullptr ? static_cast<unsigned>(ota_manager_->file_size()) : 0u,
           static_cast<unsigned>(progress),
           static_cast<unsigned>(next_seq),
           static_cast<unsigned>(bridge_api::kOtaWindowSize),
           status_chunk_sz);
  return json;
}

bool ESPNowLRBridge::api_ota_abort(const std::string &job_id, const std::string &reason) {
  if (ws_ota_job_state_ == bridge_api::OtaJobState::IDLE) return false;
  if (!job_id.empty() && job_id != ws_ota_job_id_) return false;

  if (ota_manager_ != nullptr && ota_manager_->is_busy()) {
    ota_manager_->on_source_abort(ESPNOW_LR_FILE_ABORT_USER);
  }
  ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
  return true;
}

bool ESPNowLRBridge::api_ota_inject_chunk(uint32_t sequence, const uint8_t *data, size_t len) {
  if (ws_ota_job_state_ != bridge_api::OtaJobState::TRANSFERRING) return false;
  if (ota_manager_ == nullptr) return false;
  return ota_manager_->on_source_chunk(sequence, data, len);
}

bool ESPNowLRBridge::api_ota_has_active_job() const {
  return ws_ota_job_state_ != bridge_api::OtaJobState::IDLE;
}

std::string ESPNowLRBridge::api_ota_active_job_id() const {
  return ws_ota_job_state_ != bridge_api::OtaJobState::IDLE ? ws_ota_job_id_ : "";
}

const char *ESPNowLRBridge::api_ota_start_error() const {
  return ws_ota_start_error_;
}

void ESPNowLRBridge::emit_ota_ws_events_() {
  if (api_ws_ == nullptr || !api_ws_->has_authenticated_client()) return;
  if (ws_ota_job_state_ == bridge_api::OtaJobState::IDLE) {
    ESP_LOGI(TAG, "emit_ota_ws_events: state=IDLE, returning early");
    return;
  }

  ESP_LOGI(TAG, "emit_ota_ws_events: state=%d is_busy=%d inflight=%u",
           static_cast<int>(ws_ota_job_state_),
           ota_manager_ != nullptr ? ota_manager_->is_busy() : -1,
           ota_manager_ != nullptr ? ota_manager_->window().inflight_count() : 0);

  if (ws_ota_job_state_ == bridge_api::OtaJobState::WAITING_FOR_LEAF) {
    if (ota_manager_ != nullptr && ota_manager_->is_busy() &&
        ota_manager_->window().inflight_count() > 0) {
      std::string target_mac_str = mac_display(ws_ota_target_mac_.data());
      uint16_t chunk_sz = ota_manager_->chunk_size();
      ESP_LOGI(TAG, "Sending ota_accepted with chunk_size=%u", static_cast<unsigned>(chunk_sz));
      std::string response = bridge_api::BridgeApiMessages::ota_accepted(
          ws_ota_request_id_, ws_ota_job_id_, target_mac_str,
          chunk_sz, bridge_api::kOtaWindowSize, 0);
      api_ws_->send_text(api_ws_->active_client_id(), response);
      ws_ota_job_state_ = bridge_api::OtaJobState::TRANSFERRING;
      return;
    }
    if (ota_manager_ == nullptr || !ota_manager_->is_busy()) {
      std::string error_json = bridge_api::BridgeApiMessages::error(
          ws_ota_request_id_, bridge_api::error::OTA_NOT_ACTIVE,
          "OTA transfer failed before leaf accepted");
      api_ws_->send_text(api_ws_->active_client_id(), error_json);
      ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
      return;
    }
    return;
  }

  if (ws_ota_job_state_ == bridge_api::OtaJobState::TRANSFERRING) {
    if (ota_manager_ == nullptr || !ota_manager_->is_busy()) {
      ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
      return;
    }
    return;
  }
}

std::string ESPNowLRBridge::mac_colon_string_(const uint8_t *mac) const { return mac_display(mac); }

std::string ESPNowLRBridge::get_ip_string() const {
  if (wifi::global_wifi_component == nullptr) {
    return "";
  }
  auto ips = wifi::global_wifi_component->get_ip_addresses();
  for (auto &ip : ips) {
    if (ip.is_set()) {
      char buf[network::IP_ADDRESS_BUFFER_SIZE];
      ip.str_to(buf);
      return std::string(buf);
    }
  }
  return "";
}

void ESPNowLRBridge::register_web_handler_() {
  if (web_server_base::global_web_server_base == nullptr) return;

  static const char *const kHtml =
      "<!DOCTYPE html><html><head><meta charset='utf-8'>"
      "<title>Topology</title>"
      "<style>"
      "*{margin:0;padding:0;box-sizing:border-box}"
      "body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:1.5em}"
      "h2{margin-bottom:1em;color:#00d4ff}"
      ".tree{list-style:none;padding-left:1.2em}"
      ".tree li{position:relative;padding:.35em 0 .35em 1.2em}"
      ".tree li::before{content:'';position:absolute;left:0;top:0;width:1px;height:100%;background:#444}"
      ".tree li::after{content:'';position:absolute;left:0;top:1.1em;width:1em;height:1px;background:#444}"
      ".tree>li::before,.tree>li::after{display:none}"
      ".tree li:last-child::before{height:1.1em}"
      ".node{display:inline-flex;align-items:center;gap:.5em;padding:.3em .7em;"
      "border-radius:6px;background:#16213e;border:1px solid #0f3460}"
      ".node.bridge{border-color:#00d4ff;background:#0f3460}"
      ".dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}"
      ".dot.on{background:#00e676}.dot.connecting{background:#888}.dot.off{background:#ff5252}"
      ".lbl{font-weight:600}.mac{font-size:.75em;color:#888}"
      ".badge{font-size:.7em;background:#ff5252;color:#fff;padding:1px 5px;border-radius:3px;margin-left:.3em}"
      ".badge.connecting{background:#888}"
      ".v2-badge{font-size:1.1em;margin-left:.4em}"
      ".uptime{font-size:.7em;color:#888;margin-left:.5em}"
      ".entities{font-size:.7em;color:#0af;margin-left:.5em}"
      ".ota-link{font-size:.7em;color:#00d4ff;text-decoration:none;margin-left:.5em}"
      ".ota-link:hover{text-decoration:underline}"
      ".rssi{font-size:.7em;color:#aaa;margin-left:.5em}"
      "</style></head><body>"
      "<h2 id='title'>Topology</h2>"
      "<ul class='tree' id='tree'></ul>"
      "<script>"
      "function fmt(s){if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m';return Math.floor(s/3600)+'h'}"
      "function fmtU(s){var r=[];if(s>=86400){var d=Math.floor(s/86400);s%=86400;r.push(d+'d')}if(s>=3600){var h=Math.floor(s/3600);s%=3600;if(h>0||r.length>0)r.push(h+'h')}if(s>=60){var m=Math.floor(s/60);s%=60;if(m>0||r.length>0)r.push(m+'m')}r.push(s+'s');return r.join('')}"
      "function build(data){"
      "var m={};data.forEach(function(n){m[n.mac]=n});"
      "var cm={};data.forEach(function(n){if(n.parent_mac){"
      "if(!cm[n.parent_mac])cm[n.parent_mac]=[];cm[n.parent_mac].push(n)}});"
      "function mk(n){var li=document.createElement('li');"
      "var s=document.createElement('span');s.className='node bridge';"
      "var d=document.createElement('span');d.className='dot '+(n.state===5?'on':'connecting');"
      "var l=document.createElement('span');l.className='lbl';l.textContent=n.label;"
      "var mac=document.createElement('span');mac.className='mac';mac.textContent=n.mac;"
      "s.appendChild(d);s.appendChild(l);s.appendChild(mac);"
      "if((n.leaf_session_flags&1)||(n.bridge_session_flags&1)){var vb=document.createElement('span');vb.className='v2-badge';vb.textContent='\xf0\x9f\x90\x98';s.appendChild(vb)}"
      "if(n.uptime_s>0){var u=document.createElement('span');u.className='uptime';u.textContent='up ';var t=document.createElement('span');t.textContent=fmtU(n.uptime_s);u.appendChild(t);s.appendChild(u)}"
      "if(n.entity_count!==undefined){var e=document.createElement('span');e.className='entities';e.textContent=n.entity_count+' ent';s.appendChild(e)}"
      "if(n.rssi!==undefined){var r=document.createElement('span');r.className='rssi';var p=n.rssi<=-100?0:(n.rssi>=-60?100:Math.round((n.rssi+100)*5/2));r.textContent=n.rssi+' dBm ('+p+'%)';s.appendChild(r)}"
      "if(n.hops!==0){var a=document.createElement('a');a.className='ota-link';a.href='/ota?mac='+encodeURIComponent(n.mac);a.textContent='OTA';s.appendChild(a)}"
      "if(!n.online){var b=document.createElement('span');b.className='badge'+(n.state>=1&&n.state<=4?' connecting':'');"
      "var st=['offline','discover','joining','joined','syncing','offline'];"
      "b.textContent=(st[n.state]||'offline')+' '+fmt(n.offline_s||0);s.appendChild(b)}"
      "li.appendChild(s);"
      "var ch=cm[n.mac];if(ch&&ch.length){var ul=document.createElement('ul');"
      "ul.className='tree';ch.forEach(function(c){ul.appendChild(mk(c))});li.appendChild(ul)}"
      "return li}"
      "var root=m[data[0].parent_mac]||data[0];"
      "if(!root||root.hops!==0)root=data.find(function(n){return n.hops===0})||data[0];"
      "document.getElementById('title').textContent=root.label+' Topology';"
      "var tree=document.getElementById('tree');tree.innerHTML='';"
      "tree.appendChild(mk(root))}"
      "function refresh(){fetch('/topology.json').then(function(r){return r.json()})"
      ".then(build).catch(function(){})}"
      "refresh();setInterval(refresh,5000)"
      "</script></body></html>";

  struct PageHandler : public AsyncWebHandler {
    ESPNowLRBridge *bridge_;
    PageHandler(ESPNowLRBridge *bridge) : bridge_(bridge) {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/topology";
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      request->send(200, "text/html; charset=utf-8", kHtml);
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct JsonHandler : public AsyncWebHandler {
    ESPNowLRBridge *bridge_;
    JsonHandler(ESPNowLRBridge *bridge) : bridge_(bridge) {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/topology.json";
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      std::string json = bridge_->build_topology_json_();
      request->send(200, "application/json", json.c_str());
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  web_server_base::global_web_server_base->add_handler(new PageHandler(this));
  web_server_base::global_web_server_base->add_handler(new JsonHandler(this));
}

void ESPNowLRBridge::feed_ota_upload_chunks_() {
  return;
}

void ESPNowLRBridge::reset_ota_upload_state_(bool release_memory) {
  ota_upload_expected_size_ = 0;
  ota_upload_received_ = 0;
  ota_upload_last_activity_ms_ = 0;
  ota_upload_complete_ = false;
  ota_upload_failed_ = false;
  ota_upload_session_pending_ = false;
  ota_upload_target_mac_.fill(0);
  ota_upload_md5_.fill(0);
  ota_upload_error_msg_.clear();
  ota_requested_sequences_.clear();
  ota_requested_chunk_size_ = 0;
  ota_chunk_stages_.clear();
  ota_upload_buf_.clear();
  if (release_memory) {
    ota_upload_buf_.shrink_to_fit();
  }
}

void ESPNowLRBridge::register_ota_web_handlers_() {
  if (!ota_over_espnow_) return;

  struct OtaPageHandler : public AsyncWebHandler {
    OtaPageHandler() {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_GET) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/ota";
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      request->send(200, "text/html; charset=utf-8", OTA_WEB_PAGE_HTML);
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct OtaStartHandler : public AsyncWebHandler {
    ESPNowLRBridge *bridge_;

    OtaStartHandler(ESPNowLRBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_POST) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/api/ota/start";
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      if (bridge_->ota_manager_ == nullptr) {
        request->send(500, "application/json", "{\"error\":\"ota not initialized\"}");
        return;
      }
      if (bridge_->ota_manager_->is_busy()) {
        request->send(409, "application/json", "{\"error\":\"ota already in progress\"}");
        return;
      }

      std::string target;
      std::string md5_hex;
      uint32_t file_size = 0;
      bool has_target = false;
      bool has_size = false;
      bool has_md5 = false;
      if (request->hasArg("target")) {
        target = request->arg("target").c_str();
        has_target = !target.empty();
      }
      if (request->hasArg("size")) {
        file_size = static_cast<uint32_t>(strtoul(request->arg("size").c_str(), nullptr, 10));
        has_size = file_size > 0;
      }
      if (request->hasArg("md5")) {
        md5_hex = request->arg("md5").c_str();
        has_md5 = !md5_hex.empty();
      }

      if (!has_target || !has_size || !has_md5) {
        request->send(400, "application/json", "{\"error\":\"missing target, size, or md5\"}");
        return;
      }

      std::string target_clean;
      for (char c : target) {
        if (c != ':' && c != '-' && c != ' ') target_clean += c;
      }
      std::transform(target_clean.begin(), target_clean.end(), target_clean.begin(), ::toupper);

      uint8_t mac[6]{};
      if (!parse_mac_hex_(target_clean, mac)) {
        request->send(400, "application/json", "{\"error\":\"invalid target mac\"}");
        return;
      }

      uint8_t md5[16]{};
      if (!parse_md5_hex_(md5_hex, md5)) {
        request->send(400, "application/json", "{\"error\":\"invalid md5\"}");
        return;
      }

      bridge_->reset_ota_upload_state_(true);
      bridge_->ota_upload_expected_size_ = file_size;
      bridge_->ota_upload_last_activity_ms_ = millis();
      bridge_->ota_upload_session_pending_ = true;
      bridge_->ota_upload_received_ = 0;
      std::copy_n(mac, bridge_->ota_upload_target_mac_.size(), bridge_->ota_upload_target_mac_.begin());
      std::copy_n(md5, bridge_->ota_upload_md5_.size(), bridge_->ota_upload_md5_.begin());

      const BridgeSession *session = bridge_->protocol_.get_session(mac);
      uint16_t remote_max = session ? session->session_max_payload : ESPNOW_LR_V1_MAX_PAYLOAD;
      if (!bridge_->ota_manager_->start_transfer(mac, file_size, md5, ESPNOW_LR_FILE_ACTION_OTA_FLASH,
                                                   remote_max, "ota.bin")) {
        std::string error = bridge_->ota_manager_->last_error();
        bridge_->reset_ota_upload_state_(true);
        request->send(409, "application/json", ("{\"error\":\"" + error + "\"}").c_str());
        return;
      }

      ESP_LOGI(TAG, "OTA browser-backed transfer started target=%s size=%u", target.c_str(),
               static_cast<unsigned>(file_size));
      request->send(200, "application/json", "{\"status\":\"started\"}");
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct OtaStatusHandler : public AsyncWebHandler {
    ESPNowLRBridge *bridge_;

    OtaStatusHandler(ESPNowLRBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_GET) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/api/ota/status";
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      if (bridge_->ota_manager_ == nullptr) {
        request->send(200, "application/json",
                      "{\"state\":\"IDLE\",\"percent\":0,\"active_target\":\"\",\"error_msg\":\"ota not initialized\"}");
        return;
      }
      std::string raw = bridge_->ota_manager_->status_json();
      std::string state_val;
      std::string leaf_mac_val;
      std::string error_val;
      int progress_pct_val = 0;

      auto extract_string = [&](const char *key) -> std::string {
        std::string needle = std::string("\"") + key + "\":\"";
        auto pos = raw.find(needle);
        if (pos == std::string::npos) return "";
        pos += needle.size();
        auto end = raw.find('"', pos);
        if (end == std::string::npos) return "";
        return raw.substr(pos, end - pos);
      };

      auto extract_int = [&](const char *key) -> int {
        std::string needle = std::string("\"") + key + "\":";
        auto pos = raw.find(needle);
        if (pos == std::string::npos) return 0;
        pos += needle.size();
        return static_cast<int>(strtol(raw.c_str() + pos, nullptr, 10));
      };

      int packets_sent_val = extract_int("next_seq_to_send");
      int packets_total_val = extract_int("total_chunks");

      state_val = extract_string("state");
      leaf_mac_val = extract_string("leaf_mac");
      error_val = extract_string("error");
      progress_pct_val = extract_int("progress_pct");
      if (progress_pct_val < 0) progress_pct_val = 0;
      if (packets_sent_val < 0) packets_sent_val = 0;
      if (packets_total_val < 0) packets_total_val = 0;
      std::string requested = "[";
      bool first_requested = true;
      for (uint32_t sequence : bridge_->ota_requested_sequences_) {
        if (!first_requested) requested += ",";
        requested += std::to_string(sequence);
        first_requested = false;
      }
      requested += "]";

      std::string response = "{\"state\":\"" + state_val + "\","
          "\"percent\":" + std::to_string(progress_pct_val) + ","
          "\"packets_sent\":" + std::to_string(packets_sent_val) + ","
          "\"packets_total\":" + std::to_string(packets_total_val) + ","
          "\"active_target\":\"" + leaf_mac_val + "\","
          "\"chunk_size\":" + std::to_string(bridge_->ota_requested_chunk_size_) + ","
          "\"requested\":" + requested + ","
          "\"error_msg\":\"" + error_val + "\"}";
      request->send(200, "application/json", response.c_str());
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct OtaAbortHandler : public AsyncWebHandler {
    ESPNowLRBridge *bridge_;

    OtaAbortHandler(ESPNowLRBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_POST) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/api/ota/abort";
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      if (bridge_->ota_manager_ == nullptr ||
          (!bridge_->ota_manager_->is_busy() && !bridge_->ota_upload_session_pending_)) {
        request->send(200, "application/json", "{\"status\":\"idle\"}");
        return;
      }
      if (bridge_->ota_manager_->is_busy()) {
        bridge_->ota_manager_->on_source_abort(ESPNOW_LR_FILE_ABORT_USER);
      }
      bridge_->reset_ota_upload_state_(true);
      request->send(200, "application/json", "{\"status\":\"aborting\"}");
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct OtaChunkHandler : public AsyncWebHandler {
    ESPNowLRBridge *bridge_;

    OtaChunkHandler(ESPNowLRBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_POST) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == "/api/ota/chunk";
    }

    bool deliver_source_chunk_(AsyncWebServerRequest *request, uint32_t seq, const std::vector<uint8_t> &chunk) {
      if (bridge_->ota_requested_sequences_.find(seq) == bridge_->ota_requested_sequences_.end()) {
        request->send(200, "application/json", "{\"status\":\"chunk_not_needed\"}");
        return true;
      }
      if (!bridge_->ota_manager_->on_source_chunk(seq, chunk.data(), chunk.size())) {
        request->send(409, "application/json", "{\"error\":\"chunk rejected\"}");
        return true;
      }
      bridge_->ota_requested_sequences_.erase(seq);
      bridge_->ota_chunk_stages_.erase(seq);
      bridge_->ota_upload_received_ += chunk.size();
      request->send(200, "application/json", "{\"status\":\"chunk_accepted\"}");
      return true;
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      if (bridge_->ota_manager_ == nullptr || !bridge_->ota_manager_->is_busy() || !bridge_->ota_upload_session_pending_) {
        request->send(409, "application/json", "{\"error\":\"no active ota transfer\"}");
        return;
      }
      if (!request->hasArg("seq") || !request->hasArg("data")) {
        request->send(400, "application/json", "{\"error\":\"missing seq or data\"}");
        return;
      }
      const uint32_t seq = static_cast<uint32_t>(strtoul(request->arg("seq").c_str(), nullptr, 10));
      std::vector<uint8_t> chunk;
      if (!decode_base64_(request->arg("data").c_str(), chunk) || chunk.empty()) {
        request->send(400, "application/json", "{\"error\":\"invalid chunk encoding\"}");
        return;
      }
      bridge_->ota_upload_last_activity_ms_ = millis();
      if (bridge_->ota_requested_sequences_.find(seq) == bridge_->ota_requested_sequences_.end()) {
        bridge_->ota_chunk_stages_.erase(seq);
        request->send(200, "application/json", "{\"status\":\"chunk_not_needed\"}");
        return;
      }

      if (!request->hasArg("offset") && !request->hasArg("total")) {
        deliver_source_chunk_(request, seq, chunk);
        return;
      }

      if (!request->hasArg("offset") || !request->hasArg("total")) {
        request->send(400, "application/json", "{\"error\":\"missing chunk part offset or total\"}");
        return;
      }
      const size_t offset = static_cast<size_t>(strtoul(request->arg("offset").c_str(), nullptr, 10));
      const size_t total = static_cast<size_t>(strtoul(request->arg("total").c_str(), nullptr, 10));
      if (total == 0 || total > bridge_->ota_requested_chunk_size_ || offset > total ||
          chunk.size() > (total - offset)) {
        request->send(400, "application/json", "{\"error\":\"invalid chunk part geometry\"}");
        return;
      }

      auto &stage = bridge_->ota_chunk_stages_[seq];
      if (offset == 0) {
        stage = {};
        stage.total = total;
        stage.data.reserve(total);
      }
      if (stage.total != total || stage.data.size() != offset) {
        bridge_->ota_chunk_stages_.erase(seq);
        request->send(409, "application/json", "{\"error\":\"chunk part out of order\"}");
        return;
      }
      stage.data.insert(stage.data.end(), chunk.begin(), chunk.end());
      if (stage.data.size() < stage.total) {
        request->send(200, "application/json", "{\"status\":\"chunk_part_accepted\"}");
        return;
      }

      std::vector<uint8_t> complete;
      complete.swap(stage.data);
      deliver_source_chunk_(request, seq, complete);
    }
    
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  web_server_base::global_web_server_base->add_handler(new OtaPageHandler());
  web_server_base::global_web_server_base->add_handler(new OtaStartHandler(this));
  web_server_base::global_web_server_base->add_handler(new OtaStatusHandler(this));
  web_server_base::global_web_server_base->add_handler(new OtaAbortHandler(this));
  web_server_base::global_web_server_base->add_handler(new OtaChunkHandler(this));
}

void ESPNowLRBridge::do_clear_entity_(const uint8_t *mac, const BridgeEntitySchema &entity) {
  if (!is_connected()) return;
  const std::string component = entity_component_(static_cast<espnow_field_type_t>(entity.entity_type));
  const std::string discovery_topic =
      mqtt_discovery_prefix_ + "/" + component + "/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/config";
  publish(discovery_topic, "", 1, true);
}

void ESPNowLRBridge::publish_bridge_diag_discovery_() {
  if (!is_connected() || bridge_diag_discovery_published_) return;
  const std::string bridge_mac = mac_key_string_(sta_mac_.data());
  const std::string device_id = bridge_device_id_(sta_mac_.data());

  auto publish_sensor = [&](const char *suffix, const char *name, const char *unit,
                            const char *device_class, const char *state_class, const char *icon, int suggested_precision = -1) -> bool {
    const std::string discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + bridge_mac + "/" + suffix + "/config";
    return publish_json(discovery_topic,
                        [&](JsonObject root) {
                          root["name"] = name;
                          root["uniq_id"] = device_id + "_" + suffix;
                          root["stat_t"] = bridge_state_topic_(suffix);
                          root["ent_cat"] = "diagnostic";
                          if (unit != nullptr) root["unit_of_meas"] = unit;
                          if (device_class != nullptr) root["dev_cla"] = device_class;
                          if (state_class != nullptr) root["stat_cla"] = state_class;
                          if (icon != nullptr) root["ic"] = icon;
                          if (suggested_precision >= 0) root["suggested_display_precision"] = suggested_precision;
                          JsonObject device = root["device"].to<JsonObject>();
                          device["ids"] = device_id;
                          device["name"] = bridge_friendly_name_;
                          device["mf"] = "ESP-NOW LR";
                          device["mdl"] = "Bridge";
                          std::string ip = get_ip_string();
                          if (!ip.empty()) {
                            device["cu"] = "http://" + ip + "/topology";
                          }
                        },
                        1, true);
  };

  auto publish_binary_sensor = [&](const char *suffix, const char *name, const char *icon) -> bool {
    const std::string discovery_topic = mqtt_discovery_prefix_ + "/binary_sensor/" + bridge_mac + "/" + suffix + "/config";
    return publish_json(discovery_topic,
                        [&](JsonObject root) {
                          root["name"] = name;
                          root["uniq_id"] = device_id + "_" + suffix;
                          root["stat_t"] = bridge_state_topic_(suffix);
                          root["ent_cat"] = "diagnostic";
                          root["pl_on"] = "ON";
                          root["pl_off"] = "OFF";
                          if (icon != nullptr) root["ic"] = icon;
                          JsonObject device = root["device"].to<JsonObject>();
                          device["ids"] = device_id;
                          device["name"] = bridge_friendly_name_;
                          device["mf"] = "ESP-NOW LR";
                          device["mdl"] = "Bridge";
                          std::string ip = get_ip_string();
                          if (!ip.empty()) {
                            device["cu"] = "http://" + ip + "/topology";
                          }
                        },
                        1, true);
  };

  const bool base_ok = publish_sensor("wifi_signal", "WiFi Signal", "dBm", "signal_strength", "measurement", "mdi:wifi") &&
                       publish_sensor("uptime", "Uptime", "s", "duration", "measurement", "mdi:timer-outline", 0) &&
                       publish_sensor("remotes_online", "Remotes Online", "remotes", nullptr, "measurement", "mdi:tree") &&
                       publish_sensor("remotes_direct", "Remotes Direct", "remotes", nullptr, "measurement", "mdi:account-group") &&
                       publish_binary_sensor("status", "Status", "mdi:check-network-outline") &&
                       publish_sensor("wifi_channel", "WiFi Channel", nullptr, nullptr, "measurement", "mdi:wifi", 0);
  std::string ip = get_ip_string();
  if (!ip.empty()) {
    publish(bridge_state_topic_("topology_url"), ip, 1);
  }
  publish_sensor("topology_url", "IP Address", nullptr, nullptr, nullptr, "mdi:ip");
  const bool ram_ok = publish_sensor("ram_usage", "RAM Usage", "%", "data_size", "measurement", "mdi:memory", 1);
#if CONFIG_ESP32_ESP_IDF_FRAMEWORK && configUSE_TRACE_FACILITY
  const bool cpu_ok = publish_sensor("cpu_load", "CPU Load", "%", nullptr, "measurement", "mdi:cpu-64-bit", 1);
  if (!cpu_ok) {
    ESP_LOGW(TAG, "Bridge CPU Load discovery publish failed; continuing with core bridge diagnostics");
  }
#endif
  if (!ram_ok) {
    ESP_LOGW(TAG, "Bridge RAM Usage discovery publish failed; continuing with core bridge diagnostics");
  }
  if (base_ok) bridge_diag_discovery_published_ = true;
}

void ESPNowLRBridge::publish_bridge_diag_state_() {
  if (!is_connected() || !bridge_diag_discovery_published_) return;
  int8_t wifi_rssi = -127;
  wifi_ap_record_t ap_info{};
  if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) wifi_rssi = ap_info.rssi;
  const uint32_t uptime_s = protocol_.bridge_uptime_s_;
  const uint32_t remotes_online = get_active_remote_count();
  const uint32_t remotes_direct = protocol_.get_direct_remote_count();
  if (wifi_rssi == last_published_bridge_rssi_ &&
      uptime_s == last_published_bridge_uptime_s_ &&
      remotes_online == last_published_remotes_online_) {
    return;
  }

  if (wifi_rssi != last_published_bridge_rssi_) {
    last_published_bridge_rssi_ = wifi_rssi;
    publish(bridge_state_topic_("wifi_signal"), std::to_string(wifi_rssi), 1);
    delay(YIELD_MS);
  }
  if (loop_budget_exceeded_()) return;
  if (uptime_s != last_published_bridge_uptime_s_) {
    last_published_bridge_uptime_s_ = uptime_s;
    publish(bridge_state_topic_("uptime"), std::to_string(uptime_s), 1);
    delay(YIELD_MS);
  }
  if (loop_budget_exceeded_()) return;
  if (remotes_online != last_published_remotes_online_) {
    last_published_remotes_online_ = remotes_online;
    publish(bridge_state_topic_("remotes_online"), std::to_string(remotes_online), 1);
    delay(YIELD_MS);
  }
  if (loop_budget_exceeded_()) return;
  if (remotes_direct != last_published_remotes_direct_) {
    last_published_remotes_direct_ = remotes_direct;
    publish(bridge_state_topic_("remotes_direct"), std::to_string(remotes_direct), 1);
    delay(YIELD_MS);
  }
  if (loop_budget_exceeded_()) return;
  const size_t free_heap = esp_get_free_heap_size();
  const size_t total_heap = heap_caps_get_total_size(MALLOC_CAP_8BIT);
  const int ram_pct = (total_heap > 0) ? static_cast<int>(100 - (100 * free_heap / total_heap)) : 0;
  if (ram_pct != last_published_ram_pct_) {
    last_published_ram_pct_ = ram_pct;
    publish(bridge_state_topic_("ram_usage"), std::to_string(ram_pct), 1);
    delay(YIELD_MS);
  }
  if (loop_budget_exceeded_()) return;
  uint8_t wifi_ch = 1;
  wifi_second_chan_t sec = WIFI_SECOND_CHAN_NONE;
  esp_wifi_get_channel(&wifi_ch, &sec);
  if (wifi_ch != last_published_wifi_channel_) {
    last_published_wifi_channel_ = wifi_ch;
    publish(bridge_state_topic_("wifi_channel"), std::to_string(wifi_ch), 1);
    delay(YIELD_MS);
  }
  if (loop_budget_exceeded_()) return;
#if CONFIG_ESP32_ESP_IDF_FRAMEWORK && configUSE_TRACE_FACILITY
  TaskHandle_t idle_handle = xTaskGetIdleTaskHandle();
  TaskStatus_t task_status;
  vTaskGetInfo(idle_handle, &task_status, pdTRUE, eInvalid);
  uint64_t now_us = esp_timer_get_time();
  uint64_t elapsed_us = (cpu_last_publish_time_us_ > 0) ? (now_us - cpu_last_publish_time_us_) : 0;
  uint64_t idle_delta_us = (cpu_last_idle_runtime_ > 0 && task_status.ulRunTimeCounter >= cpu_last_idle_runtime_)
                                ? (task_status.ulRunTimeCounter - cpu_last_idle_runtime_)
                                : 0;
  if (elapsed_us == 0) {
    idle_delta_us = 0;
  } else if (idle_delta_us > elapsed_us) {
    idle_delta_us = elapsed_us;
  }
  int cpu_pct = (elapsed_us > 0) ? static_cast<int>(100 * (elapsed_us - idle_delta_us) / elapsed_us) : 0;
  if (cpu_pct != last_published_cpu_pct_) {
    last_published_cpu_pct_ = cpu_pct;
    publish(bridge_state_topic_("cpu_load"), std::to_string(cpu_pct), 1);
    delay(YIELD_MS);
  }
  cpu_last_publish_time_us_ = now_us;
  cpu_last_idle_runtime_ = task_status.ulRunTimeCounter;
#endif
  if (loop_budget_exceeded_()) return;
  publish(bridge_state_topic_("status"), (transport_ready_ && protocol_ready_) ? "ON" : "OFF", 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  std::string ip = get_ip_string();
  if (!ip.empty()) {
    publish(bridge_state_topic_("topology_url"), ip, 1);
    delay(YIELD_MS);
  }
}

void ESPNowLRBridge::publish_remote_diag_discovery_(const uint8_t *mac) {
  if (!is_connected() || mac == nullptr) return;
  const std::string node_key = node_key_(mac);
  if (remote_diag_discovery_published_.count(node_key)) return;
  const std::string device_id = std::string("espnow_lr_") + node_key;
  const std::string display_name = remote_display_name_(mac);

  auto publish_sensor = [&](const char *suffix, const char *name, const char *unit,
                            const char *device_class, const char *state_class, const char *icon, int suggested_precision = -1) -> bool {
    const std::string discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_" + suffix + "/config";
    return publish_json(discovery_topic,
                        [&](JsonObject root) {
                          root["name"] = name;
                          root["uniq_id"] = device_id + "_diagnostic_" + suffix;
                          root["stat_t"] = remote_diag_state_topic_(mac, suffix);
                          root["avty_t"] = availability_topic_(mac);
                          root["pl_avail"] = "online";
                          root["pl_not_avail"] = "offline";
                          root["ent_cat"] = "diagnostic";
                          if (unit != nullptr) root["unit_of_meas"] = unit;
                          if (device_class != nullptr) root["dev_cla"] = device_class;
                          if (state_class != nullptr) root["stat_cla"] = state_class;
                          if (icon != nullptr) root["ic"] = icon;
                          if (suggested_precision >= 0) root["suggested_display_precision"] = suggested_precision;
                          JsonObject device = root["device"].to<JsonObject>();
                          device["ids"] = device_id;
                          device["name"] = display_name;
                          device["mf"] = "ESP-NOW LR";
                          device["mdl"] = "Remote";
                        },
                        1, true);
  };

  bool ok = publish_sensor("uptime_since_join", "Uptime Since Join", "s", "duration", "measurement", "mdi:timer-outline", 0) &&
            publish_sensor("rssi_dbm", "RSSI", "dBm", "signal_strength", "measurement", "mdi:wifi") &&
            publish_sensor("rssi_pct", "RSSI Percent", "%", nullptr, "measurement", "mdi:wifi-strength-2") &&
            publish_sensor("tx_packets", "TX Packets", "packets", nullptr, "total_increasing", "mdi:upload") &&
            publish_sensor("rx_packets", "RX Packets", "packets", nullptr, "total_increasing", "mdi:download") &&
            publish_sensor("hops_to_bridge", "Hops to Bridge", "hops", nullptr, "measurement", "mdi:counter") &&
            publish_sensor("chip_type", "Chip Type", nullptr, nullptr, nullptr, "mdi:chip") &&
            publish_sensor("esphome_name", "ESPHome Name", nullptr, nullptr, nullptr, "mdi:home") &&
            publish_sensor("child_remotes_direct", "Child Remotes Direct", "remotes", nullptr, "measurement", "mdi:account-group") &&
            publish_sensor("child_remotes_total", "Child Remotes Total", "remotes", nullptr, "measurement", "mdi:tree");
  const std::string last_seen_discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_last_seen/config";
  bool last_seen_ok = publish_json(last_seen_discovery_topic, [&](JsonObject root) {
    root["name"] = "Last Seen";
    root["uniq_id"] = device_id + "_diagnostic_last_seen";
    root["stat_t"] = remote_diag_state_topic_(mac, "last_seen");
    root["ent_cat"] = "diagnostic";
    root["unit_of_meas"] = "s";
    root["dev_cla"] = "duration";
    root["stat_cla"] = "measurement";
    root["ic"] = "mdi:timer-outline";
    root["suggested_display_precision"] = 0;
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
  }, 1, true);
  const std::string build_discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_firmware_build_date/config";
  bool build_ok = publish_json(build_discovery_topic, [&](JsonObject root) {
    root["name"] = "Firmware Build Date";
    root["uniq_id"] = device_id + "_diagnostic_firmware_build_date";
    root["stat_t"] = remote_diag_state_topic_(mac, "firmware_build_date");
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    root["ent_cat"] = "diagnostic";
    root["ic"] = "mdi:calendar-clock";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
  }, 1, true);
  const std::string esphome_name_discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_esphome_name/config";
  bool esphome_name_ok = publish_json(esphome_name_discovery_topic, [&](JsonObject root) {
    root["name"] = "ESPHome Name";
    root["uniq_id"] = device_id + "_diagnostic_esphome_name";
    root["stat_t"] = remote_diag_state_topic_(mac, "esphome_name");
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    root["ent_cat"] = "diagnostic";
    root["ic"] = "mdi:home";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
  }, 1, true);
  const std::string project_name_discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_project_name/config";
  bool project_name_ok = publish_json(project_name_discovery_topic, [&](JsonObject root) {
    root["name"] = "Project Name";
    root["uniq_id"] = device_id + "_diagnostic_project_name";
    root["stat_t"] = remote_diag_state_topic_(mac, "project_name");
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    root["ent_cat"] = "diagnostic";
    root["ic"] = "mdi:identifier";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
  }, 1, true);
  const std::string project_version_discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_project_version/config";
  bool project_version_ok = publish_json(project_version_discovery_topic, [&](JsonObject root) {
    root["name"] = "Project Version";
    root["uniq_id"] = device_id + "_diagnostic_project_version";
    root["stat_t"] = remote_diag_state_topic_(mac, "project_version");
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    root["ent_cat"] = "diagnostic";
    root["ic"] = "mdi:tag-outline";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
  }, 1, true);
  const std::string path_status_discovery_topic = mqtt_discovery_prefix_ + "/sensor/" + node_key + "/diagnostic_path/config";
  bool path_status_ok = publish_json(path_status_discovery_topic, [&](JsonObject root) {
    root["name"] = "Path Status";
    root["uniq_id"] = device_id + "_diagnostic_path";
    root["stat_t"] = remote_diag_state_topic_(mac, "path");
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    root["ent_cat"] = "diagnostic";
    root["ic"] = "mdi:access-point-network";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
  }, 1, true);
  if (ok && build_ok && esphome_name_ok && project_name_ok && project_version_ok && last_seen_ok && path_status_ok) remote_diag_discovery_published_.insert(node_key);
}

void ESPNowLRBridge::publish_force_rejoin_button_discovery_() {
  if (!is_connected() || force_rejoin_button_discovery_published_) return;
  const std::string bridge_mac = mac_key_string_(sta_mac_.data());
  const std::string device_id = bridge_device_id_(sta_mac_.data());
  force_rejoin_command_topic_ = "espnow_esphome_tree/bridge/" + bridge_mac + "/force_rejoin/set";

  const std::string discovery_topic = mqtt_discovery_prefix_ + "/button/" + bridge_mac + "/force_rejoin/config";
  publish_json(discovery_topic, [&](JsonObject root) {
    root["name"] = "Force Remote Rejoin";
    root["uniq_id"] = device_id + "_force_rejoin";
    root["cmd_t"] = force_rejoin_command_topic_;
    root["ent_cat"] = "diagnostic";
    root["icon"] = "mdi:refresh-circle";
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = bridge_friendly_name_;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Bridge";
  }, 1, true);
  force_rejoin_button_discovery_published_ = true;
}

void ESPNowLRBridge::handle_force_rejoin_command_(const std::string &payload) {
  if (payload.empty()) return;
  ESP_LOGW(TAG, "Force rejoin button pressed via MQTT");
  protocol_.invalidate_all_sessions();
  // Treat this as a bridge-side clean slate so stale routes and diagnostics do
  // not survive into the next session.
  // availability_queue_ is intentionally not cleared: invalidate_all_sessions()
  // publishes offline availability for each session, and those queued messages
  command_routes_.clear();
  remote_diag_discovery_published_.clear();
  remote_diag_refresh_pending_.clear();
}

void ESPNowLRBridge::publish_remote_diag_state_(const uint8_t *mac) {
  if (!is_connected() || mac == nullptr) return;
  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr) return;
  const uint32_t uptime_s = session->joined_ms != 0 ? (millis() - session->joined_ms) / 1000U : 0;
  const int8_t rssi = session->last_rssi;
  const int rssi_pct = rssi <= -100 ? 0 : (rssi >= -60 ? 100 : (rssi + 100) * 5 / 2);
  publish(remote_diag_state_topic_(mac, "uptime_since_join"), std::to_string(uptime_s), 1);
  delay(YIELD_MS);
  const uint32_t last_seen_s = session->last_seen_ms != 0 ? (millis() - session->last_seen_ms) / 1000U : 0;
  publish(remote_diag_state_topic_(mac, "last_seen"), std::to_string(last_seen_s), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "rssi_dbm"), std::to_string(rssi), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "rssi_pct"), std::to_string(rssi_pct), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "tx_packets"), std::to_string(session->tx_packets), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "rx_packets"), std::to_string(session->rx_packets), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "hops_to_bridge"), std::to_string(session->hops_to_bridge), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "chip_type"), chip_model_string(session->chip_model), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "esphome_name"), session->esphome_name, 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "child_remotes_direct"), std::to_string(session->direct_child_count), 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "child_remotes_total"), std::to_string(session->total_child_count), 1);
  delay(YIELD_MS);

  char date_buf[32] = {"unknown"};
  time_t epoch = static_cast<time_t>(session->firmware_epoch);
  if (epoch > 0) {
    struct tm *tm_info = gmtime(&epoch);
    if (tm_info != nullptr) {
      strftime(date_buf, sizeof(date_buf), "%Y-%m-%d %H:%M:%S UTC", tm_info);
    }
  }
  publish(remote_diag_state_topic_(mac, "firmware_build_date"), date_buf, 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "project_name"), session->project_name, 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "project_version"), session->project_version, 1);
  delay(YIELD_MS);
  const char *device_v = (session->leaf_session_flags & ESPNOW_LR_SESSION_FLAG_V2_MTU) ? "V2" : "V1";
  const char *route_v = session->route_v2_capable ? "V2" : "V1";
  publish(remote_diag_state_topic_(mac, "path"), std::string(device_v) + "/" + route_v, 1);
}

void ESPNowLRBridge::queue_remote_diag_refresh_(const uint8_t *mac) {
  if (mac == nullptr) return;
  const std::string key = mac_key_string_(mac);
  remote_diag_refresh_pending_.insert(key);
  first_remote_diag_publish_pending_.insert(key);
}

void ESPNowLRBridge::handle_command_message_(const std::string &topic, const std::string &payload) {
  const auto route_it = command_routes_.find(topic);
  if (route_it == command_routes_.end()) return;
  const auto &route = route_it->second;
  const auto *session = protocol_.get_session(route.leaf_mac.data());
  if (session == nullptr || route.entity_index >= session->schema_entities.size()) return;
  std::vector<uint8_t> value;
  const BridgeEntitySchema &entity = session->schema_entities[route.entity_index];
  // Look up the current state so fan subcommands can preserve existing state/speed/oscillation
  std::vector<uint8_t> current_value;
  const std::string key = entity_record_key_(route.leaf_mac.data(), route.entity_index);
  const auto it = mqtt_entities_.find(key);
  if (it != mqtt_entities_.end()) {
    current_value = it->second.current_value;
  }
  if (!decode_command_payload_(entity, route.route_kind, payload, value, current_value)) return;
  protocol_.send_command_to_leaf(route.leaf_mac.data(), route.entity_index, value);
}

void ESPNowLRBridge::sync_mqtt_entities_() {
  if (!is_connected()) return;

  const bool just_connected = is_connected() && !mqtt_was_connected_;
  if (just_connected) {
    for (auto &pair : mqtt_entities_) {
      pair.second.discovery_dirty = true;
      pair.second.discovery_published = false;
      pair.second.state_dirty = true;
    }
    bridge_diag_discovery_published_ = false;
    remote_diag_discovery_published_.clear();
    remote_diag_refresh_pending_.clear();
    first_remote_diag_publish_pending_.clear();
    delayed_diag_refresh_pending_.clear();
    force_rejoin_button_discovery_published_ = false;
    for (const auto &entry : protocol_.get_sessions()) {
      if (entry.second.online) queue_remote_diag_refresh_(entry.second.leaf_mac.data());
    }
  }
  mqtt_was_connected_ = is_connected();

  if (!bridge_diag_discovery_published_) {
    publish_bridge_diag_discovery_();
    delay(YIELD_MS);
    publish_force_rejoin_button_discovery_();
    delay(YIELD_MS);
    if (bridge_diag_discovery_published_) {
      publish_bridge_diag_state_();
      delay(YIELD_MS);
      return;
    }
    return;
  }

  if (!availability_queue_.empty()) {
    auto front = availability_queue_.front();
    availability_queue_.pop_front();
    publish(availability_topic_(front.first.data()), front.second ? "online" : "offline", 1);
    delay(YIELD_MS);
    return;
  }

  for (auto it = delayed_diag_refresh_pending_.begin(); it != delayed_diag_refresh_pending_.end(); ) {
    if (loop_budget_exceeded_()) break;
    if (millis() >= it->second) {
      uint8_t mac[6]{};
      for (int i = 0; i < 6; i++) {
        unsigned int byte = 0;
        sscanf(it->first.c_str() + i * 2, "%02x", &byte);
        mac[i] = static_cast<uint8_t>(byte);
      }
      const std::string node_key = node_key_(mac);
      if (remote_diag_discovery_published_.count(node_key)) {
        publish_remote_diag_state_cached_(mac, node_key);
        first_remote_diag_publish_pending_.erase(node_key);
      }
      delayed_diag_refresh_pending_.erase(it++);
    } else {
      ++it;
    }
  }

  for (auto it = remote_diag_refresh_pending_.begin(); it != remote_diag_refresh_pending_.end(); ++it) {
    uint8_t mac[6]{};
    for (int i = 0; i < 6; i++) {
      unsigned int byte = 0;
      sscanf(it->c_str() + i * 2, "%02x", &byte);
      mac[i] = static_cast<uint8_t>(byte);
    }
    const BridgeSession *session = protocol_.get_session(mac);
    if (session == nullptr || !session->online) {
      continue;
    }
    if (!remote_diag_discovery_published_.count(node_key_(mac))) {
      publish_remote_diag_discovery_(mac);
      return;
    }
    publish_remote_diag_state_(mac);
    std::string key_copy = *it;
    remote_diag_refresh_pending_.erase(it);
    first_remote_diag_publish_pending_.erase(key_copy);
    return;
  }

  int states_processed = 0;
  for (auto &pair : mqtt_entities_) {
    if (loop_budget_exceeded_()) break;
    auto &rec = pair.second;
    if (rec.discovery_dirty) {
      do_publish_discovery_(rec);
      break;
    }
    if (rec.state_dirty && rec.discovery_published) {
      if (rec.first_state_publish_pending) {
        const uint32_t now = millis();
        if (now - rec.discovery_published_ms < FIRST_STATE_PUBLISH_GRACE_MS) {
          continue;
        }
        rec.first_state_publish_pending = false;
      }
      bool mqtt_ok = do_publish_state_(rec);
      if (mqtt_ok && rec.pending_state_ack_) {
        send_deferred_state_ack_(rec);
      }
      if (++states_processed >= 2) {
        break;
      }
    }
  }

  const uint32_t now = millis();
  if (now >= next_diag_check_ms_) {
    check_diag_publish_rr_();
    next_diag_check_ms_ = now + DIAG_CHECK_INTERVAL_MS + (uint32_t)(esp_random() % (2 * DIAG_JITTER_MS)) - DIAG_JITTER_MS;
  }
}

void ESPNowLRBridge::check_diag_publish_rr_() {
  const uint32_t now = millis();
  const size_t total = 1 + remote_diag_discovery_published_.size();
  if (total == 0) return;

  if (now - diag_last_any_publish_ms_ < DIAG_SPACING_MS) return;

  diag_rr_index_ = (diag_rr_index_ + 1) % total;

  if (diag_rr_index_ == 0) {
    if (now - last_published_bridge_diag_ms_ >= DIAG_MIN_INTERVAL_MS) {
      publish_bridge_diag_state_();
      last_published_bridge_diag_ms_ = now;
      diag_last_any_publish_ms_ = now;
    }
  } else {
    auto it = remote_diag_discovery_published_.begin();
    std::advance(it, diag_rr_index_ - 1);
    const std::string &node_key = *it;

    auto last_it = remote_diag_last_publish_ms_.find(node_key);
    uint32_t last_ms = (last_it != remote_diag_last_publish_ms_.end()) ? last_it->second : 0;

    if (now - last_ms >= DIAG_MIN_INTERVAL_MS) {
      uint8_t mac[6]{};
      bool found = false;
      for (const auto &entry : protocol_.get_sessions()) {
        if (node_key_(entry.second.leaf_mac.data()) == node_key) {
          memcpy(mac, entry.second.leaf_mac.data(), 6);
          found = true;
          break;
        }
      }
      if (found) {
        publish_remote_diag_state_cached_(mac, node_key);
        remote_diag_last_publish_ms_[node_key] = now;
        diag_last_any_publish_ms_ = now;
      }
    }
  }
}

void ESPNowLRBridge::publish_remote_diag_state_cached_(const uint8_t *mac, const std::string &node_key) {
  if (!is_connected() || mac == nullptr) return;
  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr) return;

  const uint32_t now = millis();
  const uint32_t uptime_s = session->joined_ms != 0 ? (now - session->joined_ms) / 1000U : 0;
  const int8_t rssi = session->last_rssi;
  const int rssi_pct = rssi <= -100 ? 0 : (rssi >= -60 ? 100 : (rssi + 100) * 5 / 2);
  const uint32_t last_seen_s = session->last_seen_ms != 0 ? (now - session->last_seen_ms) / 1000U : 0;

  RemoteDiagCache cache;
  auto cache_it = remote_diag_cache_.find(node_key);
  if (cache_it != remote_diag_cache_.end()) {
    cache = cache_it->second;
  }

  bool first_publish = first_remote_diag_publish_pending_.count(node_key) > 0;

  if (!first_publish &&
      rssi == cache.rssi && session->tx_packets == cache.tx_packets && session->rx_packets == cache.rx_packets &&
      session->hops_to_bridge == cache.hops && session->direct_child_count == cache.direct_children &&
      session->total_child_count == cache.total_children && session->chip_model == cache.chip_model &&
      session->firmware_epoch == cache.firmware_epoch &&
      session->esphome_name == cache.esphome_name &&
      session->project_name == cache.project_name && session->project_version == cache.project_version) {
    publish(remote_diag_state_topic_(mac, "last_seen"), std::to_string(last_seen_s), 1);
    return;
  }

  publish(remote_diag_state_topic_(mac, "uptime_since_join"), std::to_string(uptime_s), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "last_seen"), std::to_string(last_seen_s), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "rssi_dbm"), std::to_string(rssi), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "rssi_pct"), std::to_string(rssi_pct), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "tx_packets"), std::to_string(session->tx_packets), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "rx_packets"), std::to_string(session->rx_packets), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "hops_to_bridge"), std::to_string(session->hops_to_bridge), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "chip_type"), chip_model_string(session->chip_model), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "esphome_name"), session->esphome_name, 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "child_remotes_direct"), std::to_string(session->direct_child_count), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;
  publish(remote_diag_state_topic_(mac, "child_remotes_total"), std::to_string(session->total_child_count), 1);
  delay(YIELD_MS);
  if (loop_budget_exceeded_()) return;

  if (session->firmware_epoch != cache.firmware_epoch) {
    char date_buf[32] = {"unknown"};
    time_t epoch = static_cast<time_t>(session->firmware_epoch);
    if (epoch > 0) {
      struct tm *tm_info = gmtime(&epoch);
      if (tm_info != nullptr) {
        strftime(date_buf, sizeof(date_buf), "%Y-%m-%d %H:%M:%S UTC", tm_info);
      }
    }
    publish(remote_diag_state_topic_(mac, "firmware_build_date"), date_buf, 1);
    delay(YIELD_MS);
    if (loop_budget_exceeded_()) return;
  }
  if (session->project_name != cache.project_name) {
    publish(remote_diag_state_topic_(mac, "project_name"), session->project_name, 1);
    delay(YIELD_MS);
    if (loop_budget_exceeded_()) return;
  }
  if (session->project_version != cache.project_version) {
    publish(remote_diag_state_topic_(mac, "project_version"), session->project_version, 1);
    delay(YIELD_MS);
  }

  RemoteDiagCache new_cache;
  new_cache.rssi = rssi;
  new_cache.tx_packets = session->tx_packets;
  new_cache.rx_packets = session->rx_packets;
  new_cache.hops = session->hops_to_bridge;
  new_cache.direct_children = session->direct_child_count;
  new_cache.total_children = session->total_child_count;
  new_cache.chip_model = session->chip_model;
  new_cache.firmware_epoch = session->firmware_epoch;
  new_cache.esphome_name = session->esphome_name;
  new_cache.project_name = session->project_name;
  new_cache.project_version = session->project_version;
  new_cache.last_publish_ms = now;
  remote_diag_cache_[node_key] = new_cache;
  first_remote_diag_publish_pending_.erase(node_key);
}

void ESPNowLRBridge::schema_complete_(const uint8_t *mac, uint8_t total_entities) {
  queue_availability_(mac, true);
  queue_remote_diag_refresh_(mac);
  delayed_diag_refresh_pending_[mac_key_string_(mac)] = millis() + DIAG_DELAYED_REFRESH_DELAY_MS;
  if (api_ws_ != nullptr) {
    const BridgeSession *session = protocol_.get_session(mac);
    if (session != nullptr) {
      uint8_t schema_hash_bytes[32];
      memcpy(schema_hash_bytes, session->schema_hash.data(), sizeof(schema_hash_bytes));
      api_ws_->emit_remote_schema_changed(
          mac, "sha256:" + bridge_api::BridgeApiAuth::bytes_to_lower_hex(schema_hash_bytes, sizeof(schema_hash_bytes)));
    }
    api_ws_->emit_topology_changed("schema_complete", mac);
  }
  (void)total_entities;
}

void ESPNowLRBridge::on_discovery_confirmed_(const uint8_t *mac, uint8_t entity_index, bool success) {
  protocol_.on_discovery_confirmed_(mac, entity_index, success);
}

bool ESPNowLRBridge::setup_transport_() {
  register_instance_(this);
  if (pending_rx_mutex_ == nullptr) {
    pending_rx_mutex_ = xSemaphoreCreateMutex();
    if (pending_rx_mutex_ == nullptr) {
      ESP_LOGE(TAG, "failed to create rx queue mutex");
      return false;
    }
  }
  if (!init_wifi_and_espnow_()) return false;
  esp_wifi_get_mac(WIFI_IF_STA, sta_mac_.data());
  protocol_.set_bridge_mac(sta_mac_.data());
  protocol_.set_publish_state_fn([this](const uint8_t *mac, const BridgeEntitySchema &entity, const std::vector<uint8_t> &value,
                                        espnow_field_type_t type, const std::string &text_value,
                                        uint32_t message_tx_base, const uint8_t *next_hop_mac) {
    this->queue_state_(mac, entity, value, type, text_value, message_tx_base, next_hop_mac);
  });
  protocol_.set_publish_discovery_fn([this](const uint8_t *mac, const BridgeEntitySchema &entity, uint8_t total_entities,
                                            bool is_commandable) {
    this->queue_discovery_(mac, entity, total_entities, is_commandable);
  });
  protocol_.set_publish_availability_fn([this](const uint8_t *mac, bool online) { this->queue_availability_(mac, online); });
  protocol_.set_publish_bridge_diag_fn([this](uint32_t uptime_s, uint8_t nodes_online) {
    this->do_publish_bridge_diag_(uptime_s, nodes_online);
  });
  protocol_.set_clear_entities_fn([this](const uint8_t *mac, const std::vector<BridgeEntitySchema> &old_entities) {
    this->queue_clear_entities_(mac, old_entities);
  });
  protocol_.set_schema_complete_fn([this](const uint8_t *mac, uint8_t total_entities) { this->schema_complete_(mac, total_entities); });
  protocol_.set_discovery_confirmed_fn([this](const uint8_t *mac, uint8_t entity_index, bool success) {
    this->on_discovery_confirmed_(mac, entity_index, success);
  });
  protocol_.set_send_fn([this](const uint8_t *mac, const uint8_t *frame, size_t frame_len) {
    return this->send_frame_(mac, frame, frame_len);
  });
  protocol_.set_send_err_fn([this](const uint8_t *mac, const uint8_t *frame, size_t frame_len) {
    return this->send_frame_result_(mac, frame, frame_len);
  });
  force_rejoin_command_topic_ = "espnow_esphome_tree/bridge/" + mac_key_string_(sta_mac_.data()) + "/force_rejoin/set";
  subscribe(force_rejoin_command_topic_, &ESPNowLRBridge::handle_force_rejoin_command_);
  transport_ready_ = true;
  return true;
}

void ESPNowLRBridge::setup() {
  if (!psk_.empty() && !network_id_.empty()) {
    protocol_ready_ = protocol_.init(psk_.c_str(), network_id_.c_str(), heartbeat_interval_) == 0;
  }
  if (!protocol_ready_) {
    this->mark_failed();
    return;
  }
  if (!setup_transport_()) {
    this->mark_failed();
    return;
  }
  api_ws_ = std::make_unique<bridge_api::BridgeApiWsTransport>(this);
  if (ota_over_espnow_) {
    ota_manager_ = std::make_unique<ESPNowOTAManager>();
    if (ota_manager_ == nullptr) {
      ESP_LOGE(TAG, "OTA over ESP-NOW requested but manager allocation failed");
      this->mark_failed();
      return;
    }
    protocol_.set_file_ack_fn([this](const uint8_t *leaf_mac, const espnow_ack_t &ack_header,
                                     const uint8_t *trailing, size_t trailing_len) -> bool {
      if (ota_manager_ == nullptr) return false;
      return ota_manager_->on_file_ack(leaf_mac, ack_header, trailing, trailing_len);
    });
    ota_manager_->set_send_frame_fn([this](const uint8_t *leaf_mac, espnow_packet_type_t type,
                                            const uint8_t *payload, size_t len,
                                            uint32_t *tx_counter_out) -> esp_err_t {
      return protocol_.send_ota_frame(leaf_mac, type, payload, len, tx_counter_out);
    });
    ota_manager_->set_target_reachable_fn([this](const uint8_t *leaf_mac) -> bool {
      const BridgeSession *session = protocol_.get_session(leaf_mac);
      return session != nullptr && session->online && session->session_key_valid;
    });
    ota_manager_->set_request_chunk_fn([this](uint32_t sequence, uint32_t, size_t) -> bool {
      ota_requested_sequences_.insert(sequence);
      if (ota_manager_ != nullptr) {
        ota_requested_chunk_size_ = ota_manager_->chunk_size();
      }
      return ota_upload_session_pending_ ||
             ws_ota_job_state_ != bridge_api::OtaJobState::IDLE;
    });
  }
  this->set_interval("airtime_status", AIRTIME_REPORT_INTERVAL_MS, [this]() { this->log_airtime_status_(); });
}

void ESPNowLRBridge::loop() {
  loop_enter_ms_ = millis();
  if (!transport_ready_) {
    ESP_LOGD(TAG, "bridge loop transport_ready=%d wifi_connected=%d", transport_ready_ ? 1 : 0,
             wifi::global_wifi_component->is_connected() ? 1 : 0);
  }

  // Determine whether we're allowed to process ESP-NOW frames. We require both
  // Wi-Fi and MQTT to be connected so that responses and MQTT publishes will
  // succeed. When this transitions from false -> true, emit an info-level log
  // so the user can see the bridge is now active.
  const bool ready_for_espnow = (wifi::global_wifi_component != nullptr && wifi::global_wifi_component->is_connected()) &&
                                (mqtt::global_mqtt_client != nullptr && mqtt::global_mqtt_client->is_connected());
  if (ready_for_espnow && !espnow_allowed_) {
    espnow_allowed_ = true;
    uint8_t wifi_ch;
    wifi_second_chan_t sec;
    esp_wifi_get_channel(&wifi_ch, &sec);
    ESP_LOGI(TAG, "ESP-NOW enabled: Wi-Fi and MQTT connected (Wi-Fi ch %u)", wifi_ch);
  } else if (!ready_for_espnow && espnow_allowed_) {
    // If either disconnects, stop processing frames until both are back.
    espnow_allowed_ = false;
    ESP_LOGW(TAG, "ESP-NOW disabled: waiting for Wi-Fi and MQTT");
  }

  drain_received_frames_();
  protocol_.loop();
  protocol_.flush_log_queue();
  if (ota_manager_ != nullptr) {
    ota_manager_->loop();
    emit_ota_ws_events_();
    if (ota_manager_->is_busy() && ota_upload_session_pending_ && ota_upload_expected_size_ > 0 && !ota_upload_complete_ &&
        !ota_requested_sequences_.empty() && ota_upload_last_activity_ms_ != 0 &&
        (millis() - ota_upload_last_activity_ms_) > 30000U) {
      ESP_LOGW(TAG, "Aborting OTA upload after stalled HTTP upload stream");
      ota_manager_->on_source_abort(ESPNOW_LR_FILE_ABORT_TIMEOUT);
      reset_ota_upload_state_(true);
    }
    feed_ota_upload_chunks_();
    if (!ota_manager_->is_busy() && !ota_upload_session_pending_ &&
        (ota_upload_expected_size_ != 0 || !ota_upload_buf_.empty() || ota_upload_received_ != 0)) {
      reset_ota_upload_state_(true);
    }
  }
  sync_mqtt_entities_();

  if (!web_handler_registered_ && web_server_base::global_web_server_base != nullptr) {
    register_web_handler_();
    web_handler_registered_ = true;
  }
  if (!api_ws_handler_registered_ && api_ws_ != nullptr && web_server_base::global_web_server_base != nullptr) {
    api_ws_handler_registered_ = api_ws_->register_with_web_server();
  }
  if (api_ws_ != nullptr) {
    api_ws_->loop();
  }
  if (!ota_web_handlers_registered_ && web_server_base::global_web_server_base != nullptr && ota_over_espnow_) {
    register_ota_web_handlers_();
    ota_web_handlers_registered_ = true;
  }
}

void ESPNowLRBridge::dump_config() {}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void ESPNowLRBridge::on_data_received_(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (active_instance_ == nullptr || info == nullptr || info->src_addr == nullptr) return;
  int8_t rssi = (info->rx_ctrl != nullptr) ? info->rx_ctrl->rssi : 0;
  active_instance_->handle_received_frame_(info->src_addr, data, static_cast<size_t>(len), rssi);
}
void ESPNowLRBridge::on_data_sent_(const esp_now_send_info_t *, esp_now_send_status_t status) {
  if (active_instance_ == nullptr) return;
  active_instance_->handle_send_status_(nullptr, status == ESP_NOW_SEND_SUCCESS);
}
#else
void ESPNowLRBridge::on_data_received_(const uint8_t *mac, const uint8_t *data, int len) {
  if (active_instance_ == nullptr) return;
  active_instance_->handle_received_frame_(mac, data, static_cast<size_t>(len), 0);
}
void ESPNowLRBridge::on_data_sent_(const uint8_t *, esp_now_send_status_t status) {
  if (active_instance_ == nullptr) return;
  active_instance_->handle_send_status_(nullptr, status == ESP_NOW_SEND_SUCCESS);
}
#endif

}  // namespace espnow_lr
}  // namespace esphome
