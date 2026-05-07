#include "esp_tree_bridge.h"
#include "esp_tree_common/espnow_mac_utils.h"
#include "bridge_api_auth.h"
#include "bridge_api_messages.h"

#include "bridge_web_pages.h"
#include "esp_tree_common/espnow_crypto.h"
#define TAG BRIDGE_OTA_TAG

#include "esphome/components/mqtt/mqtt_client.h"
#include "esphome/components/json/json_util.h"
#include "esphome/core/log.h"
#include "esphome/components/wifi/wifi_component.h"
#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/components/network/ip_address.h"

#include <cstdlib>
#include <cmath>
#include <cstring>
#include <ctime>
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
namespace esp_tree {

// Yield delay inserted after publishes and ESP-NOW sends to prevent
// starving the MQTT client task. 1ms is enough for FreeRTOS to
// schedule higher-priority tasks (TCP/IP, MQTT) between our work.
static const uint8_t YIELD_MS = 1;

static const char *const TAG = "espnow";
ESPTreeBridge *ESPTreeBridge::active_instance_ = nullptr;

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
  snprintf(result, sizeof(result), "%s %d %04d %s", mon_str, day, year, time_str);
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
  return std::string("esp_tree_bridge_") + mac_hex(mac);
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

static const char *native_type_for_type(espnow_field_type_t type) {
  switch (type) {
    case FIELD_TYPE_SENSOR:
    case FIELD_TYPE_NUMBER:
      return "float";
    case FIELD_TYPE_SWITCH:
    case FIELD_TYPE_BINARY:
    case FIELD_TYPE_BUTTON:
    case FIELD_TYPE_HUMIDIFIER:
    case FIELD_TYPE_DEHUMIDIFIER:
      return "bool";
    case FIELD_TYPE_TEXT:
    case FIELD_TYPE_TEXT_SENSOR:
    case FIELD_TYPE_SELECT:
    case FIELD_TYPE_TIME:
    case FIELD_TYPE_DATETIME:
      return "string";
    case FIELD_TYPE_LIGHT:
    case FIELD_TYPE_FAN:
    case FIELD_TYPE_COVER:
    case FIELD_TYPE_VALVE:
    case FIELD_TYPE_CLIMATE:
    case FIELD_TYPE_LOCK:
    case FIELD_TYPE_ALARM:
    case FIELD_TYPE_EVENT:
      return "int";
    default:
      return "float";
  }
}

static bool parse_on(const std::string &payload) {
  return payload == "ON" || payload == "on" || payload == "1" || payload == "true";
}

static const char *config_result_string_(const ConfigAckResult &result) {
  if (result.no_session) return bridge_api::config_result::NO_SESSION;
  if (result.timed_out) return bridge_api::config_result::TIMEOUT;
  if (!result.acked) return bridge_api::config_result::TIMEOUT;
  switch (result.result) {
    case CFG_RESULT_OK:
      return bridge_api::config_result::OK;
    case CFG_RESULT_REJECTED:
      return bridge_api::config_result::REJECTED;
    case CFG_RESULT_UNSUPPORTED:
      return bridge_api::config_result::UNSUPPORTED;
    case CFG_RESULT_INVALID_PAYLOAD:
      return bridge_api::config_result::INVALID_PAYLOAD;
    case CFG_RESULT_BUSY:
      return bridge_api::config_result::BUSY;
    default:
      return bridge_api::config_result::REJECTED;
  }
}

static const char *project_name_() {
#ifdef ESPHOME_PROJECT_NAME
  return ESPHOME_PROJECT_NAME;
#else
  return "";
#endif
}

static const char *project_version_() {
#ifdef ESPHOME_PROJECT_VERSION
  return ESPHOME_PROJECT_VERSION;
#else
  return "";
#endif
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

ESPTreeBridge::ESPTreeBridge() = default;

void ESPTreeBridge::register_instance_(ESPTreeBridge *instance) { active_instance_ = instance; }

std::string ESPTreeBridge::mac_key_string_(const uint8_t *mac) { return mac_hex(mac); }

bool ESPTreeBridge::init_wifi_and_espnow_() {
  if (esp_now_init() != ESP_OK) return false;
  wifi_protocols_t protocols{};
  if (espnow_mode_ == "lr") {
    protocols.ghz_2g = WIFI_PROTOCOL_LR;
  } else {
    protocols.ghz_2g = WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N;
  }
  ESP_ERROR_CHECK(esp_wifi_set_protocols(WIFI_IF_STA, &protocols));
  ESP_LOGI(TAG, "ESP-NOW mode=%s, 2.4GHz protocol mask=0x%08x", espnow_mode_.c_str(), protocols.ghz_2g);
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 4, 0)
  if (!force_v1_packet_size_) {
    uint32_t espnow_version = 1;
    esp_now_get_version(&espnow_version);
    if (espnow_version >= 2) {
      protocol_.set_session_flags(ESPNOW_SESSION_FLAG_V2_MTU);
      ESP_LOGI(TAG, "ESP-NOW V2 radio detected (version=%u), enabling V2 MTU", static_cast<unsigned>(espnow_version));
    } else {
      ESP_LOGI(TAG, "ESP-NOW V1 radio (version=%u), MTU limited to %u bytes", static_cast<unsigned>(espnow_version), static_cast<unsigned>(ESPNOW_V1_MAX_PAYLOAD));
    }
  } else {
    ESP_LOGI(TAG, "force_v1_packet_size active, using V1 MTU (%u bytes)", static_cast<unsigned>(ESPNOW_V1_MAX_PAYLOAD));
  }
#else
  ESP_LOGI(TAG, "ESP-NOW V1 radio (IDF < 5.4), MTU limited to %u bytes", static_cast<unsigned>(ESPNOW_V1_MAX_PAYLOAD));
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

bool ESPTreeBridge::add_peer_(const uint8_t *mac) {
  if (mac == nullptr) return false;
  if (esp_now_is_peer_exist(mac)) {
    note_peer_activity_(mac);
    return true;
  }
  esp_now_peer_info_t peer{};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = current_wifi_channel_();
  peer.encrypt = false;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  peer.ifidx = WIFI_IF_STA;
#endif
  esp_err_t err = esp_now_add_peer(&peer);
  if (err == ESP_OK) {
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

uint8_t ESPTreeBridge::current_wifi_channel_() const {
  uint8_t primary = 1;
  wifi_second_chan_t secondary = WIFI_SECOND_CHAN_NONE;
  esp_wifi_get_channel(&primary, &secondary);
  return primary;
}

esp_err_t ESPTreeBridge::send_frame_result_(const uint8_t *mac, const uint8_t *frame, size_t frame_len) {
  if (!add_peer_(mac)) {
    ESP_LOGW(TAG, "ESP-NOW send aborted: no peer slot available for %s", mac_key_string_(mac).c_str());
    return ESP_FAIL;
  }
  rolling_airtime_.tx_airtime_us += calc_airtime_lr_us_(frame_len);
  rolling_airtime_.tx_packets++;
  note_peer_activity_(mac);
  const esp_err_t err = esp_now_send(mac, frame, frame_len);

  if (err != ESP_OK) {
    ESP_LOGW(TAG, "[TX] esp_now_send to %s failed err=%d", mac_key_string_(mac).c_str(), err);
  }
  return err;
}

bool ESPTreeBridge::send_frame_(const uint8_t *mac, const uint8_t *frame, size_t frame_len) {
  return send_frame_result_(mac, frame, frame_len) == ESP_OK;
}

void ESPTreeBridge::note_peer_activity_(const uint8_t *mac) {
  if (mac == nullptr) return;
  peer_last_used_ms_[mac_key_string_(mac)] = millis();
}

bool ESPTreeBridge::is_peer_protected_(const uint8_t *mac) const {
  if (mac == nullptr) return false;
  for (const auto &entry : protocol_.get_sessions()) {
    const auto &session = entry.second;
    if (!session.online) continue;
    if (memcmp(session.next_hop_mac.data(), mac, 6) == 0) return true;
    if (memcmp(session.leaf_mac.data(), mac, 6) == 0) return true;
  }
  return false;
}

bool ESPTreeBridge::evict_stale_peer_(const uint8_t *preferred_mac) {
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

void ESPTreeBridge::handle_received_frame_(const uint8_t *mac, const uint8_t *data, size_t len, int8_t rssi) {
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

void ESPTreeBridge::handle_send_status_(const uint8_t *mac, bool success) {
  if (success) {
    tx_ok_++;
  } else {
    tx_fail_++;
  }
}

void ESPTreeBridge::drain_received_frames_() {
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

std::string ESPTreeBridge::slugify_name_(std::string input) { return sanitize_object_id(std::move(input)); }

std::string ESPTreeBridge::node_key_(const uint8_t *mac) const {
  const BridgeSession *session = protocol_.get_session(mac);
  if (session != nullptr && !session->esphome_name.empty()) return slugify_name_(session->esphome_name);
  return mac_key_string_(mac);
}

std::string ESPTreeBridge::remote_display_name_(const uint8_t *mac) const {
  const BridgeSession *session = protocol_.get_session(mac);
  if (session != nullptr && !session->node_label.empty()) return session->node_label;
  if (session != nullptr && !session->esphome_name.empty()) return session->esphome_name;
  return std::string("ESP-NOW LR Remote ") + mac_key_string_(mac);
}

std::string ESPTreeBridge::entity_object_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
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

std::string ESPTreeBridge::default_entity_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  const std::string component = entity_component_(static_cast<espnow_field_type_t>(entity.entity_type));
  std::string slug = slugify_name_(entity.entity_name);
  if (slug.empty()) slug = entity_object_id_(mac, entity);
  return component + "." + slug;
}

std::string ESPTreeBridge::entity_component_(espnow_field_type_t type) const { return component_for_type(type); }

std::string ESPTreeBridge::availability_topic_(const uint8_t *mac) const {
  return "esp-tree/" + node_key_(mac) + "/availability";
}

std::string ESPTreeBridge::state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/state";
}

std::string ESPTreeBridge::command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/set";
}

std::string ESPTreeBridge::fan_speed_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/percentage_state";
}

std::string ESPTreeBridge::fan_speed_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/percentage_set";
}

std::string ESPTreeBridge::fan_oscillation_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/oscillation_state";
}

std::string ESPTreeBridge::fan_oscillation_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/oscillation_set";
}

std::string ESPTreeBridge::fan_direction_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/direction_state";
}

std::string ESPTreeBridge::fan_direction_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp-tree/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/direction_set";
}

std::string ESPTreeBridge::unique_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const {
  return "esp_tree_" + node_key_(mac) + "_" + entity_object_id_(mac, entity);
}

std::string ESPTreeBridge::bridge_state_topic_(const char *suffix) const {
  return "esp-tree/bridge/" + mac_key_string_(sta_mac_.data()) + "/" + suffix + "/state";
}

std::string ESPTreeBridge::remote_diag_state_topic_(const uint8_t *mac, const char *suffix) const {
  return "esp-tree/" + node_key_(mac) + "/diagnostic/" + suffix + "/state";
}

std::string ESPTreeBridge::encode_state_payload_(const BridgeEntitySchema &entity, const std::vector<uint8_t> &value,
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
        auto options = option_list(parse_options_map(entity.entity_options), "options");
        if (options.empty()) options = split_string(entity.entity_options, '|');
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

bool ESPTreeBridge::decode_command_payload_(const BridgeEntitySchema &entity, CommandRouteKind route_kind,
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
      value.resize(ESPNOW_MAX_ENTITY_FRAGMENT_LEN);
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

std::string ESPTreeBridge::entity_record_key_(const uint8_t *mac, uint8_t entity_index) const {
  return node_key_(mac) + "_" + std::to_string(entity_index);
}

void ESPTreeBridge::subscribe_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) {
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
      this->subscribe(topic, &ESPTreeBridge::handle_command_message_);
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

void ESPTreeBridge::queue_discovery_(const uint8_t *mac, const BridgeEntitySchema &entity, uint8_t total_entities,
                                      bool is_commandable) {
  const std::string key = entity_record_key_(mac, entity.entity_index);
  auto &rec = mqtt_entities_[key];
  memcpy(rec.leaf_mac.data(), mac, 6);
  rec.node_id = node_key_(mac);
  rec.schema = entity;
  rec.total_entities = total_entities;
  rec.discovery_published = false;
  rec.first_state_publish_pending = false;
  rec.discovery_published_ms = 0;
  rec.current_type = static_cast<espnow_field_type_t>(entity.entity_type);
  rec.command_subscribed = is_commandable;

  const std::string dev_key = node_key_(mac);
  auto &dev = mqtt_devices_[dev_key];
  if (dev.node_id.empty()) {
    memcpy(dev.leaf_mac.data(), mac, 6);
    dev.node_id = dev_key;
    dev.device_id = std::string("esp_tree_") + dev_key;
    dev.display_name = remote_display_name_(mac);
  }
  dev.entities[entity.entity_index] = entity;
  dev.total_entities = total_entities;
  dev.schema_complete = false;
  dev.discovery_dirty = true;
  dev.discovery_published = false;
}

void ESPTreeBridge::queue_state_(const uint8_t *mac, const BridgeEntitySchema &entity,
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
  if (api_proto_ws_ != nullptr) {
    api_proto_ws_->emit_remote_state(mac, entity, value, type);
  }
}

void ESPTreeBridge::queue_availability_(const uint8_t *mac, bool online, const char *reason) {
  std::array<uint8_t, 6> key{};
  memcpy(key.data(), mac, key.size());
  availability_queue_.push_back({key, online, reason});
  if (api_ws_ != nullptr) {
    const uint32_t now_ms = millis();
    const BridgeSession *session = protocol_.get_session(mac);
    const int8_t rssi = session == nullptr ? -127 : session->last_rssi;
    const uint32_t offline_s =
        (session == nullptr || online) ? 0 : ((now_ms / 1000) - session->last_seen_s);
    const uint8_t *parent_mac = session == nullptr ? mac : session->parent_mac.data();
    const uint8_t hop_count = session == nullptr ? 0 : session->hops_to_bridge;
    api_ws_->emit_remote_availability(mac, online, reason, rssi, offline_s, parent_mac, hop_count);
  }
  if (api_proto_ws_ != nullptr) {
    const uint32_t now_ms = millis();
    const BridgeSession *session = protocol_.get_session(mac);
    const int8_t rssi = session == nullptr ? -127 : session->last_rssi;
    const uint32_t offline_s =
        (session == nullptr || online) ? 0 : ((now_ms / 1000) - session->last_seen_s);
    const uint8_t *parent_mac = session == nullptr ? mac : session->parent_mac.data();
    const uint8_t hop_count = session == nullptr ? 0 : session->hops_to_bridge;
    api_proto_ws_->emit_remote_availability(mac, online, reason, rssi, offline_s, parent_mac, hop_count);
  }
  if (online) {
    queue_remote_diag_refresh_(mac);
  } else {
    remote_diag_refresh_pending_.erase(mac_key_string_(mac));
  }
}

void ESPTreeBridge::queue_clear_entities_(const uint8_t *mac, const std::vector<BridgeEntitySchema> &old_entities) {
  for (const auto &entity : old_entities) {
    const std::string key = entity_record_key_(mac, entity.entity_index);
    auto it = mqtt_entities_.find(key);
    if (it != mqtt_entities_.end()) {
      do_clear_entity_(mac, entity);
      mqtt_entities_.erase(it);
    }
  }

  const std::string nk = node_key_(mac);
  auto dev_it = mqtt_devices_.find(nk);
  if (dev_it != mqtt_devices_.end()) {
    for (const auto &entity : old_entities) {
      dev_it->second.entities.erase(entity.entity_index);
    }
    if (dev_it->second.entities.empty()) {
      do_clear_device_discovery_(mac);
    } else {
      dev_it->second.discovery_dirty = true;
      dev_it->second.discovery_published = false;
    }
  }
}

void ESPTreeBridge::build_entity_component_(JsonObject cmp, const uint8_t *mac, const BridgeEntitySchema &entity) {
  const auto type = static_cast<espnow_field_type_t>(entity.entity_type);
  cmp["p"] = component_for_type(type);
  cmp["unique_id"] = unique_id_(mac, entity);
  cmp["name"] = entity.entity_name;
  cmp["stat_t"] = state_topic_(mac, entity);

  if (!entity.entity_unit.empty()) cmp["unit_of_meas"] = entity.entity_unit;

  switch (type) {
    case FIELD_TYPE_SWITCH:
      cmp["ic"] = "mdi:toggle-switch";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["pl_on"] = "ON"; cmp["pl_off"] = "OFF";
      cmp["stat_on"] = "ON"; cmp["stat_off"] = "OFF";
      break;
    case FIELD_TYPE_BINARY:
      cmp["ic"] = "mdi:check-circle-outline";
      cmp["pl_on"] = "ON"; cmp["pl_off"] = "OFF";
      break;
    case FIELD_TYPE_LOCK:
      cmp["ic"] = "mdi:lock";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["pl_lock"] = "LOCK"; cmp["pl_unlk"] = "UNLOCK";
      cmp["stat_locked"] = "LOCKED"; cmp["stat_unlocked"] = "UNLOCKED";
      cmp["payload_lock"] = "LOCK"; cmp["payload_unlock"] = "UNLOCK";
      cmp["state_locked"] = "LOCKED"; cmp["state_unlocked"] = "UNLOCKED";
      break;
    case FIELD_TYPE_BUTTON:
      cmp["ic"] = "mdi:gesture-tap-button";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["command_topic"] = command_topic_(mac, entity);
      break;
    case FIELD_TYPE_COVER:
      cmp["ic"] = "mdi:window-shutter";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["pos_t"] = state_topic_(mac, entity);
      break;
    case FIELD_TYPE_VALVE:
      cmp["ic"] = "mdi:valve";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["pos_t"] = state_topic_(mac, entity);
      break;
    case FIELD_TYPE_FAN:
      cmp["ic"] = "mdi:fan";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["pl_on"] = "ON"; cmp["pl_off"] = "OFF";
      cmp["stat_on"] = "ON"; cmp["stat_off"] = "OFF";
      cmp["payload_on"] = "ON"; cmp["payload_off"] = "OFF";
      cmp["state_on"] = "ON"; cmp["state_off"] = "OFF";
      {
        const auto options = parse_options_map(entity.entity_options);
        const uint32_t speed_count = option_u32(options, "speed_count", 0);
        if (speed_count > 0) {
          cmp["pct_cmd_t"] = fan_speed_command_topic_(mac, entity);
          cmp["pct_stat_t"] = fan_speed_state_topic_(mac, entity);
          cmp["spd_rng_max"] = speed_count;
          cmp["percentage_command_topic"] = fan_speed_command_topic_(mac, entity);
          cmp["percentage_state_topic"] = fan_speed_state_topic_(mac, entity);
          cmp["speed_range_max"] = speed_count;
          cmp["speed_range_min"] = 1;
        }
        if (option_is_true(options, "oscillation")) {
          cmp["osc_cmd_t"] = fan_oscillation_command_topic_(mac, entity);
          cmp["osc_stat_t"] = fan_oscillation_state_topic_(mac, entity);
          cmp["oscillation_command_topic"] = fan_oscillation_command_topic_(mac, entity);
          cmp["oscillation_state_topic"] = fan_oscillation_state_topic_(mac, entity);
          cmp["payload_oscillation_on"] = "oscillate_on";
          cmp["payload_oscillation_off"] = "oscillate_off";
        }
        if (option_is_true(options, "direction")) {
          cmp["dir_cmd_t"] = fan_direction_command_topic_(mac, entity);
          cmp["dir_stat_t"] = fan_direction_state_topic_(mac, entity);
          cmp["direction_command_topic"] = fan_direction_command_topic_(mac, entity);
          cmp["direction_state_topic"] = fan_direction_state_topic_(mac, entity);
          cmp["payload_direction_forward"] = "forward";
          cmp["payload_direction_reverse"] = "reverse";
        }
      }
      break;
    case FIELD_TYPE_LIGHT:
      cmp["ic"] = "mdi:lightbulb";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["schema"] = "json";
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
        const auto color_mode_list = option_list(options, "color_modes");
        if (!color_mode_list.empty()) {
          JsonArray modes = cmp["supported_color_modes"].to<JsonArray>();
          for (const auto &mode : color_mode_list) modes.add(mode);
        }
        cmp["brightness"] = supports_brightness;
        cmp["brightness_scale"] = 255;
        if (supports_rgb) cmp["rgb"] = true;
        if (option_has_list_value(options, "color_modes", "color_temp")) {
          cmp["min_mireds"] = option_float(options, "min_mireds");
          cmp["max_mireds"] = option_float(options, "max_mireds");
          cmp["color_temp"] = supports_color_temp;
        }
        const auto effects = option_list(options, "effects");
        if (!effects.empty()) {
          cmp["effect"] = true;
          JsonArray effect_list = cmp["effect_list"].to<JsonArray>();
          for (const auto &effect : effects) effect_list.add(effect);
          effect_list.add("None");
        }
      }
      break;
    case FIELD_TYPE_ALARM:
      cmp["ic"] = "mdi:shield-home";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["payload_disarm"] = "DISARM";
      cmp["payload_arm_home"] = "ARM_HOME";
      cmp["payload_arm_away"] = "ARM_AWAY";
      cmp["payload_arm_night"] = "ARM_NIGHT";
      cmp["payload_arm_vacation"] = "ARM_VACATION";
      cmp["payload_arm_custom_bypass"] = "ARM_CUSTOM_BYPASS";
      cmp["payload_trigger"] = "TRIGGERED";
      {
        const auto options = parse_options_map(entity.entity_options);
        JsonArray supported = cmp["supported_features"].to<JsonArray>();
        const uint32_t features = option_u32(options, "features");
        if (features & 0x02) supported.add("arm_away");
        if (features & 0x01) supported.add("arm_home");
        if (features & 0x04) supported.add("arm_night");
        if (features & 0x20) supported.add("arm_vacation");
        if (features & 0x10) supported.add("arm_custom_bypass");
        if (features & 0x08) supported.add("trigger");
        cmp["code_disarm_required"] = option_is_true(options, "requires_code");
        cmp["code_arm_required"] = option_is_true(options, "requires_code_to_arm");
      }
      break;
    case FIELD_TYPE_NUMBER:
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["mode"] = "box";
      if (!entity.entity_options.empty()) {
        for (const auto &part : split_string(entity.entity_options, ';')) {
          const auto eq = part.find('=');
          if (eq == std::string::npos) continue;
          const auto k = part.substr(0, eq);
          const auto v = part.substr(eq + 1);
          if (k == "min") cmp["min"] = atof(v.c_str());
          if (k == "max") cmp["max"] = atof(v.c_str());
          if (k == "step") cmp["step"] = atof(v.c_str());
        }
      }
      break;
    case FIELD_TYPE_TEXT:
      cmp["ic"] = "mdi:text-box";
      cmp["cmd_t"] = command_topic_(mac, entity);
      cmp["mode"] = "text";
      break;
    case FIELD_TYPE_TEXT_SENSOR:
      cmp["ic"] = "mdi:text";
      break;
    case FIELD_TYPE_SELECT:
      cmp["ic"] = "mdi:format-list-bulleted";
      cmp["cmd_t"] = command_topic_(mac, entity);
      {
        JsonArray options_arr = cmp["options"].to<JsonArray>();
        if (!entity.entity_options.empty()) {
          auto select_options = option_list(parse_options_map(entity.entity_options), "options");
          if (select_options.empty()) select_options = split_string(entity.entity_options, '|');
          for (const auto &option : select_options) options_arr.add(option);
        }
      }
      break;
    case FIELD_TYPE_EVENT:
      {
        JsonArray event_types = cmp["event_types"].to<JsonArray>();
        if (!entity.entity_options.empty()) {
          auto options = option_list(parse_options_map(entity.entity_options), "options");
          if (options.empty()) options = split_string(entity.entity_options, '|');
          for (const auto &event_type : options) event_types.add(event_type);
        }
      }
      break;
    default:
      break;
  }
}

void ESPTreeBridge::publish_device_discovery_(const uint8_t *mac) {
  if (!is_connected()) return;
  const std::string nk = node_key_(mac);
  auto it = mqtt_devices_.find(nk);
  if (it == mqtt_devices_.end()) return;
  auto &dev = it->second;

  if (dev.entities.empty()) return;

  const std::string discovery_topic = mqtt_discovery_prefix_ + "/device/" + nk + "/config";
  const std::string avail_topic = availability_topic_(mac);
  const std::string connection_unique_id = dev.device_id + "_connection";
  const bool ok = publish_json(discovery_topic, [this, &dev, avail_topic, connection_unique_id](JsonObject root) {
    JsonObject device = root["dev"].to<JsonObject>();
    device["ids"] = dev.device_id;
    device["name"] = dev.display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);

    JsonObject origin = root["o"].to<JsonObject>();
    origin["name"] = "esp-tree-bridge";
    origin["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);

    JsonArray avty_arr = root["availability"].to<JsonArray>();
    JsonObject avty = avty_arr.add<JsonObject>();
    avty["topic"] = avail_topic;
    avty["payload_available"] = "online";
    avty["payload_not_available"] = "offline";

    JsonObject cmps = root["cmps"].to<JsonObject>();
    JsonObject connection = cmps["connection"].to<JsonObject>();
    connection["p"] = "binary_sensor";
    connection["unique_id"] = connection_unique_id;
    connection["name"] = "Connection";
    connection["stat_t"] = avail_topic;
    connection["pl_on"] = "online";
    connection["pl_off"] = "offline";
    connection["entity_category"] = "diagnostic";
  }, 1, true);

  for (auto &pair : dev.entities) {
    subscribe_command_topic_(mac, pair.second);
  }

  if (!ok) return;

  dev.discovery_dirty = false;
  dev.discovery_published = true;
  dev.discovery_published_ms = millis();
}

void ESPTreeBridge::do_publish_discovery_(MqttEntityRecord &rec) {
  if (!is_connected()) return;
  const uint8_t *mac = rec.leaf_mac.data();
  const BridgeEntitySchema &entity = rec.schema;
  const auto type = static_cast<espnow_field_type_t>(entity.entity_type);
  const std::string component = entity_component_(type);
  const std::string object_id = entity_object_id_(mac, entity);
  const std::string discovery_topic =
      mqtt_discovery_prefix_ + "/" + component + "/" + node_key_(mac) + "/" + object_id + "/config";
  const std::string device_id = std::string("esp_tree_") + node_key_(mac);
  const std::string display_name = remote_display_name_(mac);
  const bool ok = publish_json(discovery_topic, [this, mac, entity, type, device_id, display_name](JsonObject root) {
    root["default_entity_id"] = default_entity_id_(mac, entity);
    root["avty_t"] = availability_topic_(mac);
    root["pl_avail"] = "online";
    root["pl_not_avail"] = "offline";
    JsonObject origin = root["o"].to<JsonObject>();
    origin["name"] = "esp-tree-bridge";
    origin["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
    JsonObject device = root["device"].to<JsonObject>();
    device["ids"] = device_id;
    device["name"] = display_name;
    device["mf"] = "ESP-NOW LR";
    device["mdl"] = "Remote";
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
    build_entity_component_(root, mac, entity);
  }, 1, true);

  subscribe_command_topic_(mac, entity);
  if (!ok) return;

  rec.discovery_published = true;
  rec.first_state_publish_pending = false;
  rec.discovery_published_ms = millis();
  protocol_.on_discovery_confirmed_(mac, entity.entity_index, true);
}

void ESPTreeBridge::do_clear_device_discovery_(const uint8_t *mac) {
  if (!is_connected()) return;
  const std::string nk = node_key_(mac);
  publish(mqtt_discovery_prefix_ + "/device/" + nk + "/config", "", 1, true);
  mqtt_devices_.erase(nk);
}

bool ESPTreeBridge::do_publish_state_(MqttEntityRecord &rec) {
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
    if (mqtt_retry_count_ < 7) {
      mqtt_retry_count_++;
    }
    const uint16_t backoff_ms = MQTT_RETRY_BACKOFF_MS[std::min<size_t>(mqtt_retry_count_, 7)];
    mqtt_backoff_until_ms_ = millis() + backoff_ms;
    ESP_LOGW(TAG, "MQTT backoff %ums (retry %u)", backoff_ms, mqtt_retry_count_);
  }
  return ok;
}

void ESPTreeBridge::send_deferred_state_ack_(MqttEntityRecord &rec) {
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

void ESPTreeBridge::do_publish_bridge_diag_(uint32_t uptime_s, uint8_t remotes_online) {
  if (!is_connected()) return;
  publish_json("esp-tree/bridge/diagnostics", [this, uptime_s, remotes_online](JsonObject root) {
    root["uptime_seconds"] = uptime_s;
    root["remotes_online"] = remotes_online;
    root["rx_packets"] = rx_packets_;
    root["rx_dropped"] = rx_dropped_;
    root["tx_ok"] = tx_ok_;
    root["tx_fail"] = tx_fail_;
  }, 1, false);
}

void ESPTreeBridge::log_airtime_status_() {
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

ESP_LOGI(TAG, "up:%s | radio(%s):%.1f%% | tx:%u rx:%u | rssi:%ddBm | fail:%d%% | children:%u",
            format_uptime(uptime_s).c_str(), espnow_mode_.c_str(), busy_pct, total_tx, total_rx, avg_rssi, static_cast<int>(fail_pct), total_children);

  airtime_window_start_ms_ = now_ms;
  rolling_airtime_.tx_packets = 0;
  rolling_airtime_.rx_packets = 0;
  rolling_airtime_.tx_airtime_us = 0;
  rolling_airtime_.rx_airtime_us = 0;
  rolling_airtime_.rssi_sum = 0;
  rolling_airtime_.rssi_count = 0;
}

void ESPTreeBridge::log_ram_stats_() {
  multi_heap_info_t heap_info{};
  heap_caps_get_info(&heap_info, MALLOC_CAP_8BIT);
  const size_t total_used = heap_info.total_allocated_bytes;
  const size_t total_free = heap_info.total_free_bytes;
  const size_t total_heap = total_used + total_free;

  const size_t sessions_count = protocol_.get_sessions().size();
  const size_t schema_count = protocol_.get_schema_cache().size();
  const size_t schema_hash_count = protocol_.get_schema_hash_cache().size();
  const size_t pending_rx_count = pending_rx_frames_.size();
  const size_t ota_chunks_count = ota_chunk_stages_.size();
  const size_t mqtt_entities_count = mqtt_entities_.size();
  const size_t remote_diag_count = remote_diag_cache_.size();
  const size_t cmd_routes_count = command_routes_.size();

  constexpr size_t KB = 1024;
  const size_t sessions_kb = sessions_count * 2;
  const size_t schema_kb = schema_count * 5;
  const size_t pending_rx_kb = pending_rx_count * 2;
  const size_t ota_kb = ota_chunks_count * 1;

  ESP_LOGI(TAG,
           "RAM: free=%zu KB used=%zu KB total=%zu KB "
           "| largest_blk=%zu KB min_free=%zu KB blocks=%zu "
           "| sessions=%zu(%zuKB) schema=%zu hash=%zu rx=%zu(%zuKB) ota=%zu(%zuKB) "
           "| mqtt_ent=%zu remote_diag=%zu cmd_routes=%zu",
           total_free / KB, total_used / KB, total_heap / KB, heap_info.largest_free_block / KB,
           heap_info.minimum_free_bytes / KB, heap_info.allocated_blocks, sessions_count, sessions_kb,
           schema_count, schema_hash_count, pending_rx_count, pending_rx_kb, ota_chunks_count, ota_kb,
           mqtt_entities_count, remote_diag_count, cmd_routes_count);
}



std::string ESPTreeBridge::build_topology_json_() const {
  static const uint32_t OFFLINE_TIMEOUT_MS = 86400000;
  const uint32_t now_ms = millis();
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());

  const size_t num_sessions = protocol_.get_sessions().size();
  const size_t kReserveBytes = 2048 + num_sessions * 512;
  std::string json;
  json.reserve(kReserveBytes);
  json += "[";
  json += "{\"mac\":\"" + bridge_mac + "\",\"label\":\"" + bridge_friendly_name_ +
          "\",\"parent_mac\":\"\",\"online\":true,\"state\":5,\"hops\":0,\"uptime_s\":" +
          std::to_string(protocol_.bridge_uptime_s_) +
          ",\"route_v2_capable\":true,\"session_max_payload\":" +
          std::to_string(protocol_.bridge_session_flags() ? ESPNOW_V2_MAX_PAYLOAD : ESPNOW_V1_MAX_PAYLOAD) +
          ",\"bridge_session_flags\":" + std::to_string(protocol_.bridge_session_flags()) + "}";
  bool need_comma = true;

  for (const auto &entry : protocol_.get_sessions()) {
    const auto &session = entry.second;
    const uint32_t last_seen_ago = session.last_seen_s == 0 ? UINT32_MAX : (now_ms / 1000) - session.last_seen_s;
    const bool online = session.online.load();
    if (!online && last_seen_ago > OFFLINE_TIMEOUT_MS) continue;
    const std::string mac = mac_colon_string_(session.leaf_mac.data());
    const std::string label = session.node_label.empty() ? mac : session.node_label;
    const std::string parent = mac_colon_string_(session.parent_mac.data());
    const uint32_t offline_s = online ? 0 : ((now_ms / 1000) - session.last_seen_s);
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
            (online ? "" : ",\"offline_reason\":\"" + session.last_offline_reason + "\"") +
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

std::string ESPTreeBridge::build_remote_info_json_(const uint8_t *mac) const {
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

std::string ESPTreeBridge::api_bridge_info_json() const {
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string device_name = sanitize_object_id(App.get_name().str());
  const std::string esphome_version = ESPHOME_VERSION;

  std::string json;
  json.reserve(1024);
  json += "{\"api_version\":";
  json += std::to_string(bridge_api::kApiVersion);
  json += ",\"name\":\"";
  json += bridge_api::BridgeApiMessages::escape_json(device_name);
  json += "\",\"mac\":\"";
  json += bridge_api::BridgeApiMessages::escape_json(bridge_mac);
  json += "\",\"firmware\":{";
  json += "\"name\":\"";
  json += bridge_api::BridgeApiMessages::escape_json(device_name);
  json += "\",\"version\":\"";
  json += bridge_api::BridgeApiMessages::escape_json(esphome_version);
  json += "\",\"esphome_version\":\"";
  json += bridge_api::BridgeApiMessages::escape_json(esphome_version);
  json += "\"";
  json += ",\"features\":{";
  json += "\"topology\":true,";
  json += "\"events\":true,";
  json += "\"ota_ws\":true,";
  json += "\"config_ws\":true,";
  json += "\"mqtt_export\":true,";
  json += "\"legacy_http\":true";
  json += "},\"limits\":{";
  json += "\"max_json_bytes\":";
  json += std::to_string(bridge_api::kMaxJsonBytes);
  json += ",\"max_ws_chunk_size\":";
  json += std::to_string(bridge_api::kMaxWsChunkSize);
  json += ",\"ota_max_increment_kb\":";
  json += std::to_string(bridge_api::kOtaMaxIncrementKB);
  json += "}}";
  return json;
}

std::string ESPTreeBridge::api_topology_snapshot_json(const std::string &request_payload_json) const {
  static const uint32_t OFFLINE_TIMEOUT_MS = 86400000;
  const uint32_t now_ms = millis();

  snapshot_sequence_++;

  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string node_name = sanitize_object_id(App.get_name().str());

  std::string json;
  json += "{\"bridge\":{";
  json += "\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(bridge_mac) + "\",";
  json += "\"node_key\":\"" + bridge_api::BridgeApiMessages::escape_json(mac_key_string_(sta_mac_.data())) + "\",";
  json += "\"device_unique_id\":\"esp_tree_" + mac_key_string_(sta_mac_.data()) + "\",";
  json += "\"name\":\"" + bridge_api::BridgeApiMessages::escape_json(node_name) + "\",";
  json += "\"friendly_name\":\"" + bridge_api::BridgeApiMessages::escape_json(bridge_friendly_name_) + "\",";
  json += "\"manufacturer\":\"ESPHome\",";
  json += "\"model\":\"esp_tree_bridge\",";
  json += "\"sw_version\":\"" + bridge_api::BridgeApiMessages::escape_json(protocol_.bridge_identity().project_version) + "\",";
  json += "\"online\":true,";
  json += "\"parent_mac\":\"\",";
  json += "\"hop_count\":0,";
  json += "\"rssi\":\"N.A.\",";
  json += "\"last_seen_s\":" + std::to_string(now_ms / 1000) + ",";
  json += "\"uptime_s\":" + std::to_string(protocol_.bridge_uptime_s_) + ",";
  json += "\"identity\":{";
  json += "\"esphome_name\":\"" + bridge_api::BridgeApiMessages::escape_json(node_name) + "\",";
  json += "\"node_label\":\"" + bridge_api::BridgeApiMessages::escape_json(bridge_friendly_name_) + "\",";
  json += "\"project_name\":\"" + bridge_api::BridgeApiMessages::escape_json(protocol_.bridge_identity().project_name) + "\",";
  json += "\"project_version\":\"" + bridge_api::BridgeApiMessages::escape_json(protocol_.bridge_identity().project_version) + "\",";
  json += "\"firmware_epoch\":" + std::to_string(protocol_.bridge_identity().firmware_epoch) + ",";
  json += "\"chip_model\":" + std::to_string(protocol_.bridge_identity().chip_model) + ",";
  if (!network_id_.empty()) {
    json += "\"network_id\":\"" + bridge_api::BridgeApiMessages::escape_json(network_id_) + "\",";
  }
  std::string bridge_build_date = format_build_date_(protocol_.bridge_identity().build_date.c_str(),
                                                    protocol_.bridge_identity().build_time.c_str());
  json += "\"firmware_build_date\":\"" + bridge_build_date + "\",";
  uint8_t bridge_firmware_md5_bytes[16];
  memcpy(bridge_firmware_md5_bytes, protocol_.bridge_identity().firmware_md5.data(), sizeof(bridge_firmware_md5_bytes));
  std::string bridge_firmware_md5_hex = bridge_api::BridgeApiAuth::bytes_to_lower_hex(bridge_firmware_md5_bytes, sizeof(bridge_firmware_md5_bytes));
  json += "\"firmware_md5\":\"" + bridge_firmware_md5_hex + "\",";
  json += "\"schema_hash\":\"N.A.\"},";
  json += "\"session\":{";
  json += "\"joined\":true,";
  json += "\"schema_complete\":true,";
  json += "\"state_complete\":true,";
  json += "\"route_v2_capable\":" + std::string(protocol_.bridge_session_flags() ? "true" : "false") + ",";
  json += "\"session_flags\":" + std::to_string(protocol_.bridge_session_flags()) + ",";
  json += "\"max_payload\":0,";
  json += "\"max_entity_fragment\":0,";
  json += "\"refresh_pending\":false";
  json += "},\"radio\":{";
  json += "\"rssi\":\"N.A.\",";
  json += "\"last_seen_s\":" + std::to_string(now_ms / 1000) + ",";
  json += "\"hops_to_bridge\":0,";
  json += "\"parent_rssi\":\"N.A.\"},";
  json += "\"diagnostics\":{";
  json += "\"dirty_count\":0,";
  json += "\"retry_count\":0,";
  json += "\"last_error\":\"\"";
  json += "}},\"nodes\":[";

  bool first_node = true;
  for (const auto &entry : protocol_.get_sessions()) {
    const auto &session = entry.second;
    const uint32_t last_seen_ago = session.last_seen_s == 0 ? UINT32_MAX : (now_ms / 1000) - session.last_seen_s;
    const bool online = session.online.load();
    if (!online && last_seen_ago > OFFLINE_TIMEOUT_MS) continue;

    const std::string mac = mac_colon_string_(session.leaf_mac.data());
    const std::string mac_key = mac_key_string_(session.leaf_mac.data());
    const std::string parent_mac = mac_colon_string_(session.parent_mac.data());
    const std::string label = session.node_label.empty() ? mac : session.node_label;
    const std::string name = session.esphome_name.empty() ? mac_key : session.esphome_name;
    const std::string friendly_name = session.node_label.empty() ? mac : session.node_label;
    const std::string device_unique_id = "esp_tree_" + mac_key;
    const std::string node_key_str = mac_key;

    if (!first_node) json += ",";
    first_node = false;

    json += "{";
    json += "\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(mac) + "\",";
    json += "\"node_key\":\"" + bridge_api::BridgeApiMessages::escape_json(node_key_str) + "\",";
    json += "\"device_unique_id\":\"" + bridge_api::BridgeApiMessages::escape_json(device_unique_id) + "\",";
    json += "\"name\":\"" + bridge_api::BridgeApiMessages::escape_json(name) + "\",";
    json += "\"friendly_name\":\"" + bridge_api::BridgeApiMessages::escape_json(friendly_name) + "\",";
    json += "\"manufacturer\":\"ESPHome\",";
    json += "\"model\":\"esp_tree_remote\",";
    json += "\"sw_version\":\"" + bridge_api::BridgeApiMessages::escape_json(session.project_version) + "\",";
    json += "\"online\":" + std::string(online ? "true" : "false") + ",";
    const uint32_t offline_s = online ? 0 : (session.last_seen_s == 0 ? 0 : last_seen_ago);
    json += "\"offline_s\":" + std::to_string(offline_s) + ",";
    if (!online && !session.last_offline_reason.empty()) {
      json += "\"offline_reason\":\"" + bridge_api::BridgeApiMessages::escape_json(session.last_offline_reason) + "\",";
    }
    json += "\"parent_mac\":\"" + bridge_api::BridgeApiMessages::escape_json(parent_mac) + "\",";
    json += "\"hop_count\":" + std::to_string(session.hops_to_bridge) + ",";
    json += "\"rssi\":" + std::to_string(session.last_rssi) + ",";
    json += "\"last_seen_s\":" + std::to_string(session.last_seen_s) + ",";
    json += "\"uptime_s\":" + std::to_string(session.uptime_seconds) + ",";
    json += "\"direct_child_count\":" + std::to_string(session.direct_child_count) + ",";
    json += "\"total_child_count\":" + std::to_string(session.total_child_count) + ",";
    json += "\"can_relay\":" + std::string(session.online.load() && session.session_key_valid.load() ? "true" : "false") + ",";
    json += "\"relay_enabled\":" + std::string((session.direct_child_count > 0 || session.total_child_count > 0) ? "true" : "false") + ",";

    json += "\"identity\":{";
    json += "\"esphome_name\":\"" + bridge_api::BridgeApiMessages::escape_json(session.esphome_name) + "\",";
    json += "\"node_label\":\"" + bridge_api::BridgeApiMessages::escape_json(session.node_label) + "\",";
    json += "\"project_name\":\"" + bridge_api::BridgeApiMessages::escape_json(session.project_name) + "\",";
    json += "\"project_version\":\"" + bridge_api::BridgeApiMessages::escape_json(session.project_version) + "\",";
    json += "\"firmware_epoch\":" + std::to_string(session.firmware_epoch) + ",";
    json += "\"chip_model\":" + std::to_string(session.chip_model) + ",";
    std::string node_build_date;
    if (!session.build_date.empty() && !session.build_time.empty()) {
      node_build_date = format_build_date_(session.build_date.c_str(), session.build_time.c_str());
    }
    json += "\"firmware_build_date\":\"" + node_build_date + "\",";

    uint8_t firmware_md5_bytes[16];
    memcpy(firmware_md5_bytes, session.firmware_md5.data(), sizeof(firmware_md5_bytes));
    std::string firmware_md5_hex = bridge_api::BridgeApiAuth::bytes_to_lower_hex(firmware_md5_bytes, sizeof(firmware_md5_bytes));
    json += "\"firmware_md5\":\"" + firmware_md5_hex + "\",";

    uint8_t schema_hash_bytes[32];
    memcpy(schema_hash_bytes, session.schema_hash.data(), sizeof(schema_hash_bytes));
    std::string schema_hash_hex = bridge_api::BridgeApiAuth::bytes_to_lower_hex(schema_hash_bytes, sizeof(schema_hash_bytes));
    json += "\"schema_hash\":\"sha256:" + schema_hash_hex + "\"";

    json += "},";

    json += "\"session\":{";
    const bool joined = session.session_key_valid.load();
    const bool schema_complete = session.schema_received.load();
    const bool state_complete = schema_complete && !session.state_sync_pending.load();
    json += "\"joined\":" + std::string(joined ? "true" : "false") + ",";
    json += "\"schema_complete\":" + std::string(schema_complete ? "true" : "false") + ",";
    json += "\"state_complete\":" + std::string(state_complete ? "true" : "false") + ",";
    json += "\"route_v2_capable\":" + std::string(session.route_v2_capable ? "true" : "false") + ",";
    json += "\"session_flags\":" + std::to_string(session.leaf_session_flags) + ",";
    json += "\"max_payload\":" + std::to_string(session.session_max_payload) + ",";
    json += "\"max_entity_fragment\":" + std::to_string(session.max_entity_fragment) + ",";
    json += "\"refresh_pending\":false";
    json += "},";

    json += "\"radio\":{";
    json += "\"rssi\":" + std::to_string(session.last_rssi) + ",";
    json += "\"last_seen_s\":" + std::to_string(session.last_seen_s) + ",";
    json += "\"hops_to_bridge\":" + std::to_string(session.hops_to_bridge) + ",";
    json += "\"parent_rssi\":" + std::to_string(session.last_rssi);
    json += "},";

    json += "\"diagnostics\":{";
    json += "\"dirty_count\":0,";
    json += "\"retry_count\":0,";
    json += "\"last_error\":\"\",";
    json += "\"uptime_s\":" + std::to_string(session.uptime_seconds);
    json += "}";
    json += "}";
  }
  json += "]}";
  return json;
}

std::string ESPTreeBridge::api_node_schema_json(const std::string &mac_colon) const {
  std::string clean;
  for (char c : mac_colon) {
    if (c != ':' && c != '-' && c != ' ') clean += c;
  }
  uint8_t mac[6]{};
  if (!parse_mac_hex_(clean, mac)) {
    return "{\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(mac_colon) + "\",\"schema_hash\":null,\"schema\":null}";
  }

  auto it = protocol_.get_sessions().find(protocol_.mac_to_key_(mac));
  if (it == protocol_.get_sessions().end()) {
    return "{\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(mac_colon) + "\",\"schema_hash\":null,\"schema\":null}";
  }

  const auto &session = it->second;
  std::string json;
  json.reserve(4096);
  json += "{\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(mac_colon) + "\",";

  uint8_t schema_hash_bytes[32];
  memcpy(schema_hash_bytes, session.schema_hash.data(), sizeof(schema_hash_bytes));
  std::string schema_hash_hex = bridge_api::BridgeApiAuth::bytes_to_lower_hex(schema_hash_bytes, sizeof(schema_hash_bytes));
  json += "\"schema_hash\":\"sha256:" + schema_hash_hex + "\",";

  if (session.schema_received.load() && !session.schema_entities.empty()) {
    json += "\"schema\":{";
    json += "\"complete\":" + std::string(session.schema_received.load() ? "true" : "false") + ",";
    size_t valid_entities = 0;
    for (const auto &se : session.schema_entities) {
      if (se.entity_type != 0) valid_entities++;
    }
    json += "\"total_entities\":" + std::to_string(valid_entities) + ",";
    json += "\"entities\":[";
    bool first_entity = true;
    const std::string mac_key = mac_key_string_(mac);
    for (size_t i = 0; i < session.schema_entities.size(); ++i) {
      const auto &entity = session.schema_entities[i];
      if (entity.entity_type == 0) continue;
      if (!first_entity) json += ",";
      first_entity = false;
      const std::string entity_object = entity.entity_id.empty() ?
          sanitize_object_id(entity.entity_name) : entity.entity_id;
      const std::string entity_unique_id = "esp_tree_" + mac_key + "_" + entity_object;
      const std::string entity_key = entity.entity_id.empty() ? entity.entity_name : entity.entity_id;

      json += "{";
      json += "\"key\":\"" + bridge_api::BridgeApiMessages::escape_json(entity_key) + "\",";
      json += "\"entity_id\":\"" + bridge_api::BridgeApiMessages::escape_json(entity.entity_id) + "\",";
      json += "\"unique_id\":\"" + bridge_api::BridgeApiMessages::escape_json(entity_unique_id) + "\",";
      json += "\"entity_index\":" + std::to_string(entity.entity_index) + ",";
      json += "\"stable_identity\":" + std::string(entity.entity_id.empty() ? "false" : "true") + ",";
      json += "\"platform\":\"" + std::string(component_for_type(static_cast<espnow_field_type_t>(entity.entity_type))) + "\",";
      json += "\"name\":\"" + bridge_api::BridgeApiMessages::escape_json(entity.entity_name) + "\",";
      if (!entity.entity_unit.empty()) {
        json += "\"unit\":\"" + bridge_api::BridgeApiMessages::escape_json(entity.entity_unit) + "\",";
      }
      json += "\"native_type\":\"";
      json += native_type_for_type(static_cast<espnow_field_type_t>(entity.entity_type));
      json += "\"";
      json += "}";
    }
    json += "]}";
  } else {
    json += "\"schema\":null";
  }
  json += "}";
  return json;
}

std::string ESPTreeBridge::api_node_state_json(const std::string &mac_colon) const {
  std::string clean;
  for (char c : mac_colon) {
    if (c != ':' && c != '-' && c != ' ') clean += c;
  }
  uint8_t mac[6]{};
  if (!parse_mac_hex_(clean, mac)) {
    return "{\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(mac_colon) + "\",\"state\":{}}";
  }

  std::string json;
  json.reserve(2048);
  json += "{\"mac\":\"" + bridge_api::BridgeApiMessages::escape_json(mac_colon) + "\",\"state\":{";
  bool first = true;
  for (const auto &rec : mqtt_entities_) {
    if (memcmp(rec.second.leaf_mac.data(), mac, 6) != 0) continue;
    if (rec.second.current_value.empty()) continue;
    if (!first) json += ",";
    first = false;
    const std::string entity_key = rec.second.schema.entity_id.empty() ?
        rec.second.schema.entity_name : rec.second.schema.entity_id;
    json += "\"" + bridge_api::BridgeApiMessages::escape_json(entity_key) + "\":";
    json += bridge_api::BridgeApiMessages::state_value_json(
        rec.second.current_type,
        rec.second.current_value.data(),
        rec.second.current_value.size(),
        rec.second.schema.entity_options);
  }
  json += "}}";
  return json;
}

bool ESPTreeBridge::api_node_config_start(const std::string &mac_colon, uint8_t command,
                                           const std::vector<uint8_t> &payload,
                                           const std::string &command_name,
                                           bridge_api::NodeConfigCallback callback,
                                           std::string &immediate_result_out) {
  immediate_result_out.clear();

  std::string clean;
  for (char c : mac_colon) {
    if (c != ':' && c != '-' && c != ' ') clean += c;
  }
  uint8_t mac[6]{};
  if (!parse_mac_hex_(clean, mac)) {
    immediate_result_out = bridge_api::config_result::INVALID_PAYLOAD;
    return false;
  }

  if (memcmp(mac, sta_mac_.data(), 6) == 0) {
    immediate_result_out = bridge_api::config_result::NOT_REMOTE;
    return false;
  }

  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr || !session->online || !session->session_key_valid) {
    immediate_result_out = bridge_api::config_result::NO_SESSION;
    return false;
  }

  auto wrapped_callback = [callback, command_name](const ConfigAckResult &result) {
    if (callback) callback(config_result_string_(result), command_name);
  };

  const uint8_t *payload_data = payload.empty() ? nullptr : payload.data();
  if (!protocol_.send_config_to_leaf(mac, command, payload_data, payload.size(), wrapped_callback)) {
    immediate_result_out = bridge_api::config_result::NO_SESSION;
    return false;
  }
  return true;
}

std::string ESPTreeBridge::api_runtime_bridge_mac() const {
  return mac_colon_string_(sta_mac_.data());
}

namespace {

static std::string runtime_schema_hash_(const BridgeSession &session) {
  uint8_t schema_hash_bytes[32];
  memcpy(schema_hash_bytes, session.schema_hash.data(), sizeof(schema_hash_bytes));
  return "sha256:" + bridge_api::BridgeApiAuth::bytes_to_lower_hex(schema_hash_bytes, sizeof(schema_hash_bytes));
}

static std::string runtime_firmware_md5_(const BridgeSession &session) {
  uint8_t firmware_md5_bytes[16];
  memcpy(firmware_md5_bytes, session.firmware_md5.data(), sizeof(firmware_md5_bytes));
  return bridge_api::BridgeApiAuth::bytes_to_lower_hex(firmware_md5_bytes, sizeof(firmware_md5_bytes));
}

static std::string runtime_session_id_(const BridgeSession &session, const std::string &network_id) {
  std::string input;
  input.reserve(16 + 16 + 6 + network_id.size());
  input.append(reinterpret_cast<const char *>(session.bridge_nonce.data()), session.bridge_nonce.size());
  input.append(reinterpret_cast<const char *>(session.remote_nonce.data()), session.remote_nonce.size());
  input.append(reinterpret_cast<const char *>(session.leaf_mac.data()), session.leaf_mac.size());
  input += network_id;
  uint8_t digest[32]{};
  espnow_crypto_hmac_sha256(session.session_key.data(), session.session_key.size(),
                            reinterpret_cast<const uint8_t *>(input.data()), input.size(), digest);
  return bridge_api::BridgeApiAuth::bytes_to_lower_hex(digest, 8);
}

static uint64_t runtime_now_unix_ms_() {
  const time_t now = time(nullptr);
  return now <= 0 ? 0 : static_cast<uint64_t>(now) * 1000ULL;
}

static void runtime_write_capabilities_(bridge_api::runtime_pb::Writer &w) {
  w.boolean(1, true);
  w.boolean(2, true);
  w.boolean(3, true);
  w.boolean(4, true);
  w.boolean(5, true);
  w.boolean(6, true);
}

static bool runtime_entity_writable_(espnow_field_type_t type) {
  switch (type) {
    case FIELD_TYPE_SWITCH:
    case FIELD_TYPE_BUTTON:
    case FIELD_TYPE_NUMBER:
    case FIELD_TYPE_TEXT:
    case FIELD_TYPE_SELECT:
    case FIELD_TYPE_LIGHT:
    case FIELD_TYPE_FAN:
    case FIELD_TYPE_COVER:
    case FIELD_TYPE_VALVE:
    case FIELD_TYPE_LOCK:
    case FIELD_TYPE_ALARM:
      return true;
    default:
      return false;
  }
}

static void runtime_write_entity_state_(bridge_api::runtime_pb::Writer &w, const std::string &object_id,
                                        bool available, uint64_t observed_unix_ms,
                                        espnow_field_type_t type, const std::vector<uint8_t> &value,
                                        const std::string &options) {
  w.string(1, object_id);
  w.boolean(2, available);
  w.varint(3, observed_unix_ms);
  switch (type) {
    case FIELD_TYPE_SWITCH:
    case FIELD_TYPE_BINARY:
    case FIELD_TYPE_LOCK:
      w.boolean(10, !value.empty() && value[0] != 0);
      break;
    case FIELD_TYPE_COVER:
    case FIELD_TYPE_VALVE:
    case FIELD_TYPE_SELECT:
      w.sint64(11, value.empty() ? 0 : value[0]);
      break;
    case FIELD_TYPE_SENSOR:
    case FIELD_TYPE_NUMBER:
      w.fixed64(12, [&]() -> uint64_t {
        double d = static_cast<double>(decode_float(value.data(), value.size()));
        uint64_t bits = 0;
        memcpy(&bits, &d, sizeof(bits));
        return bits;
      }());
      break;
    case FIELD_TYPE_TEXT:
    case FIELD_TYPE_TEXT_SENSOR:
    case FIELD_TYPE_EVENT:
      w.string(13, std::string(reinterpret_cast<const char *>(value.data()), value.size()));
      break;
    default:
      w.string(13, bridge_api::BridgeApiMessages::state_value_json(type, value.data(), value.size(), options));
      break;
  }
}

}  // namespace

void ESPTreeBridge::api_runtime_encode_auth_ok(const std::string &request_id, std::vector<uint8_t> &out) const {
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string device_name = sanitize_object_id(App.get_name().str());
  const std::string build_date = format_build_date_(protocol_.bridge_identity().build_date.c_str(),
                                                    protocol_.bridge_identity().build_time.c_str());
  bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::AUTH_OK, [&](bridge_api::runtime_pb::Writer &w) {
    w.varint(1, bridge_api::runtime_pb::kRuntimeApiVersion);
    w.string(2, bridge_friendly_name_);
    w.message(3, [&](bridge_api::runtime_pb::Writer &b) {
      b.string(1, bridge_mac);
      b.string(2, device_name);
      b.string(3, bridge_friendly_name_);
      b.string(4, network_id_);
      b.string(5, "ESPHome");
      b.string(6, "esp_tree_bridge");
      b.string(7, protocol_.bridge_identity().project_name);
      b.string(8, protocol_.bridge_identity().project_version);
      b.string(9, build_date);
      b.string(10, bridge_api::runtime_pb::kRuntimeProtocol);
    });
    w.message(4, runtime_write_capabilities_);
  });
}

void ESPTreeBridge::api_runtime_encode_full_snapshot(const std::string &request_id, std::vector<uint8_t> &out) const {
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string bridge_name = sanitize_object_id(App.get_name().str());
  const std::string bridge_build_date = format_build_date_(protocol_.bridge_identity().build_date.c_str(),
                                                           protocol_.bridge_identity().build_time.c_str());
  const uint64_t now_ms = runtime_now_unix_ms_();
  const uint32_t now_s = millis() / 1000U;

  bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::FULL_SNAPSHOT,
                                   [&](bridge_api::runtime_pb::Writer &w) {
    w.message(1, [&](bridge_api::runtime_pb::Writer &b) {
      b.string(1, bridge_mac);
      b.string(2, bridge_name);
      b.string(3, bridge_friendly_name_);
      b.string(4, network_id_);
      b.string(5, "ESPHome");
      b.string(6, "esp_tree_bridge");
      b.string(7, protocol_.bridge_identity().project_name);
      b.string(8, protocol_.bridge_identity().project_version);
      b.string(9, bridge_build_date);
      b.string(10, bridge_api::runtime_pb::kRuntimeProtocol);
    });
    w.message(2, [&](bridge_api::runtime_pb::Writer &b) {
      b.boolean(1, true);
      b.sint32(2, 0);
      b.varint(3, protocol_.bridge_uptime_s_);
      b.varint(4, protocol_.get_active_remote_count());
    });

    for (const auto &entry : protocol_.get_sessions()) {
      const BridgeSession &session = entry.second;
      const bool online = session.online.load();
      const uint32_t offline_s = online || session.last_seen_s == 0 ? 0 : now_s - session.last_seen_s;
      const std::string remote_mac = mac_colon_string_(session.leaf_mac.data());
      const std::string parent_mac = mac_colon_string_(session.parent_mac.data());
      const std::string schema_hash = runtime_schema_hash_(session);
      const std::string session_id = runtime_session_id_(session, network_id_);
      const std::string build_date = (!session.build_date.empty() && !session.build_time.empty())
                                         ? format_build_date_(session.build_date.c_str(), session.build_time.c_str())
                                         : "";
      w.message(3, [&](bridge_api::runtime_pb::Writer &r) {
        r.message(1, [&](bridge_api::runtime_pb::Writer &id) {
          id.string(1, remote_mac);
          id.string(2, session.esphome_name);
          id.string(3, session.node_label.empty() ? remote_mac : session.node_label);
          id.string(4, "ESPHome");
          id.string(5, "esp_tree_remote");
          id.string(6, session.project_name);
          id.string(7, session.project_version);
          id.string(8, build_date);
          id.string(9, runtime_firmware_md5_(session));
          id.string(10, schema_hash);
          id.varint(11, session.schema_entities.size());
          id.string(12, chip_model_string(session.chip_model));
          id.boolean(13, session.online.load() && session.session_key_valid.load());
          id.boolean(14, session.direct_child_count > 0 || session.total_child_count > 0);
        });
        r.message(2, [&](bridge_api::runtime_pb::Writer &rt) {
          rt.boolean(1, online);
          rt.string(2, bridge_mac);
          rt.string(3, parent_mac);
          rt.varint(4, session.hops_to_bridge);
          rt.sint32(5, session.last_rssi);
          rt.varint(6, offline_s);
          rt.varint(7, session.last_seen_s == 0 ? 0 : static_cast<uint64_t>(session.last_seen_s) * 1000ULL);
          rt.string(8, session_id);
          rt.varint(9, session.last_seen_counter);
        });
        r.message(3, [&](bridge_api::runtime_pb::Writer &ds) {
          ds.string(1, schema_hash);
          for (const auto &entity : session.schema_entities) {
            if (entity.entity_type == 0) continue;
            const auto type = static_cast<espnow_field_type_t>(entity.entity_type);
            const std::string object_id = entity.entity_id.empty() ? sanitize_object_id(entity.entity_name) : entity.entity_id;
            ds.message(2, [&](bridge_api::runtime_pb::Writer &ed) {
              ed.string(1, object_id);
              ed.string(2, component_for_type(type));
              ed.string(3, entity.entity_name);
              ed.string(6, entity.entity_unit);
              ed.boolean(11, runtime_entity_writable_(type));
              ed.string(12, native_type_for_type(type));
              ed.string(13, entity.entity_options);
            });
          }
        });
        for (const auto &rec : mqtt_entities_) {
          if (memcmp(rec.second.leaf_mac.data(), session.leaf_mac.data(), 6) != 0) continue;
          if (rec.second.current_value.empty()) continue;
          const std::string object_id = rec.second.schema.entity_id.empty()
                                            ? sanitize_object_id(rec.second.schema.entity_name)
                                            : rec.second.schema.entity_id;
          r.message(4, [&](bridge_api::runtime_pb::Writer &st) {
            runtime_write_entity_state_(st, object_id, online, now_ms, rec.second.current_type,
                                        rec.second.current_value, rec.second.schema.entity_options);
          });
        }
      });
    }
    w.varint(4, now_ms);
  });
}

void ESPTreeBridge::api_runtime_encode_bridge_heartbeat(std::vector<uint8_t> &out) const {
  bridge_api::runtime_pb::envelope(out, "", bridge_api::runtime_pb::EVENT_BATCH, [&](bridge_api::runtime_pb::Writer &w) {
    w.message(1, [&](bridge_api::runtime_pb::Writer &event) {
      event.message(10, [&](bridge_api::runtime_pb::Writer &hb) {
        hb.string(1, mac_colon_string_(sta_mac_.data()));
        hb.varint(2, runtime_now_unix_ms_());
        hb.varint(3, protocol_.bridge_uptime_s_);
      });
    });
  });
}

void ESPTreeBridge::api_runtime_encode_topology_changed(const char *reason, const uint8_t *mac,
                                                         std::vector<uint8_t> &out) const {
  (void)reason;
  const BridgeSession *session = protocol_.get_session(mac);
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  bridge_api::runtime_pb::envelope(out, "", bridge_api::runtime_pb::EVENT_BATCH, [&](bridge_api::runtime_pb::Writer &w) {
    w.message(1, [&](bridge_api::runtime_pb::Writer &event) {
      event.message(15, [&](bridge_api::runtime_pb::Writer &topo) {
        topo.string(1, mac_colon_string_(mac));
        topo.string(2, bridge_mac);
        topo.string(3, session == nullptr ? "" : mac_colon_string_(session->parent_mac.data()));
        topo.varint(4, session == nullptr ? 0 : session->hops_to_bridge);
        topo.sint32(5, session == nullptr ? -127 : session->last_rssi);
        topo.varint(6, runtime_now_unix_ms_());
      });
    });
  });
}

void ESPTreeBridge::api_runtime_encode_remote_availability(const uint8_t *mac, bool online, const char *reason,
                                                            int8_t rssi, uint32_t offline_s,
                                                            const uint8_t *parent_mac, uint8_t hop_count,
                                                            std::vector<uint8_t> &out) const {
  const BridgeSession *session = protocol_.get_session(mac);
  const std::string session_id = session == nullptr ? "" : runtime_session_id_(*session, network_id_);
  const uint32_t tx = session == nullptr ? 0 : session->last_seen_counter;
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  bridge_api::runtime_pb::envelope(out, "", bridge_api::runtime_pb::EVENT_BATCH, [&](bridge_api::runtime_pb::Writer &w) {
    w.message(1, [&](bridge_api::runtime_pb::Writer &event) {
      event.message(11, [&](bridge_api::runtime_pb::Writer &av) {
        av.string(1, mac_colon_string_(mac));
        av.boolean(2, online);
        av.string(3, bridge_mac);
        av.string(4, session_id);
        av.varint(5, tx);
        av.varint(6, runtime_now_unix_ms_());
        av.sint32(7, rssi);
        av.varint(8, hop_count);
        av.string(9, reason == nullptr ? "" : reason);
      });
    });
  });
  (void)offline_s;
  (void)parent_mac;
}

void ESPTreeBridge::api_runtime_encode_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity,
                                                     const std::vector<uint8_t> &value, espnow_field_type_t type,
                                                     std::vector<uint8_t> &out) const {
  const BridgeSession *session = protocol_.get_session(mac);
  const std::string session_id = session == nullptr ? "" : runtime_session_id_(*session, network_id_);
  const uint32_t tx = session == nullptr ? 0 : session->last_seen_counter;
  const std::string object_id = entity.entity_id.empty() ? sanitize_object_id(entity.entity_name) : entity.entity_id;
  const uint64_t now_ms = runtime_now_unix_ms_();
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  bridge_api::runtime_pb::envelope(out, "", bridge_api::runtime_pb::EVENT_BATCH, [&](bridge_api::runtime_pb::Writer &w) {
    w.message(1, [&](bridge_api::runtime_pb::Writer &event) {
      event.message(12, [&](bridge_api::runtime_pb::Writer &state) {
        state.string(1, mac_colon_string_(mac));
        state.string(2, bridge_mac);
        state.string(3, session_id);
        state.varint(4, tx);
        state.message(5, [&](bridge_api::runtime_pb::Writer &st) {
          runtime_write_entity_state_(st, object_id, true, now_ms, type, value, entity.entity_options);
        });
        state.varint(6, now_ms);
      });
    });
  });
}

void ESPTreeBridge::api_runtime_encode_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash,
                                                              std::vector<uint8_t> &out) const {
  const BridgeSession *session = protocol_.get_session(mac);
  const std::string bridge_mac = mac_colon_string_(sta_mac_.data());
  const std::string session_id = session == nullptr ? "" : runtime_session_id_(*session, network_id_);
  bridge_api::runtime_pb::envelope(out, "", bridge_api::runtime_pb::EVENT_BATCH, [&](bridge_api::runtime_pb::Writer &w) {
    w.message(1, [&](bridge_api::runtime_pb::Writer &event) {
      event.message(13, [&](bridge_api::runtime_pb::Writer &schema) {
        schema.string(1, mac_colon_string_(mac));
        schema.string(2, bridge_mac);
        schema.string(3, session_id);
        schema.string(4, "");
        if (session != nullptr) {
          schema.message(5, [&](bridge_api::runtime_pb::Writer &snap) {
            snap.message(1, [&](bridge_api::runtime_pb::Writer &id) {
              id.string(1, mac_colon_string_(session->leaf_mac.data()));
              id.string(2, session->esphome_name);
              id.string(3, session->node_label.empty() ? mac_colon_string_(session->leaf_mac.data()) : session->node_label);
              id.string(10, schema_hash);
              id.varint(11, session->schema_entities.size());
            });
            snap.message(2, [&](bridge_api::runtime_pb::Writer &rt) {
              rt.boolean(1, session->online.load());
              rt.string(2, bridge_mac);
              rt.string(3, mac_colon_string_(session->parent_mac.data()));
              rt.varint(4, session->hops_to_bridge);
              rt.sint32(5, session->last_rssi);
              rt.string(8, session_id);
              rt.varint(9, session->last_seen_counter);
            });
            snap.message(3, [&](bridge_api::runtime_pb::Writer &ds) {
              ds.string(1, schema_hash);
              for (const auto &entity : session->schema_entities) {
                if (entity.entity_type == 0) continue;
                const auto type = static_cast<espnow_field_type_t>(entity.entity_type);
                ds.message(2, [&](bridge_api::runtime_pb::Writer &ed) {
                  ed.string(1, entity.entity_id.empty() ? sanitize_object_id(entity.entity_name) : entity.entity_id);
                  ed.string(2, component_for_type(type));
                  ed.string(3, entity.entity_name);
                  ed.string(6, entity.entity_unit);
                  ed.boolean(11, runtime_entity_writable_(type));
                  ed.string(12, native_type_for_type(type));
                  ed.string(13, entity.entity_options);
                });
              }
            });
          });
        }
      });
    });
  });
}

void ESPTreeBridge::api_runtime_handle_command(const std::string &request_id,
                                                const bridge_api::runtime_pb::ParsedCommandRequest &request,
                                                std::vector<uint8_t> &out) {
  std::string clean;
  for (char c : request.remote_mac) if (c != ':' && c != '-' && c != ' ') clean += c;
  uint8_t mac[6]{};
  bridge_api::runtime_pb::CommandStatus status = bridge_api::runtime_pb::COMMAND_STATUS_UNAVAILABLE;
  std::string error_code;
  std::string error_message;
  std::string session_id;

  if (!parse_mac_hex_(clean, mac)) {
    status = bridge_api::runtime_pb::COMMAND_STATUS_FAILED;
    error_code = "invalid_remote_mac";
    error_message = "Invalid remote MAC";
  } else {
    BridgeSession *session = protocol_.get_session(mac);
    if (session == nullptr || !session->online || !session->session_key_valid) {
      error_code = "remote_unavailable";
      error_message = "Remote session is unavailable";
    } else {
      session_id = runtime_session_id_(*session, network_id_);
      const BridgeEntitySchema *match = nullptr;
      for (const auto &entity : session->schema_entities) {
        if (entity.entity_type == 0) continue;
        const std::string object_id = entity.entity_id.empty() ? sanitize_object_id(entity.entity_name) : entity.entity_id;
        if (object_id == request.object_id) {
          match = &entity;
          break;
        }
      }
      if (match == nullptr) {
        status = bridge_api::runtime_pb::COMMAND_STATUS_UNSUPPORTED;
        error_code = "entity_not_found";
        error_message = "Entity object_id is not in the current remote schema";
      } else {
        std::string payload;
        if (request.command == "turn_on") payload = "ON";
        else if (request.command == "turn_off") payload = "OFF";
        else if (request.command == "press") payload = "PRESS";
        else if (request.command == "open") payload = "OPEN";
        else if (request.command == "close") payload = "CLOSE";
        else if (request.command == "stop") payload = "STOP";
        else if (request.command == "lock") payload = "LOCK";
        else if (request.command == "unlock") payload = "UNLOCK";
        else if (!request.args.empty()) payload = request.args.front().value;
        else payload = request.command;

        std::vector<uint8_t> current_value;
        const std::string key = entity_record_key_(mac, match->entity_index);
        auto it = mqtt_entities_.find(key);
        if (it != mqtt_entities_.end()) current_value = it->second.current_value;
        std::vector<uint8_t> value;
        if (!decode_command_payload_(*match, CommandRouteKind::PRIMARY, payload, value, current_value)) {
          status = bridge_api::runtime_pb::COMMAND_STATUS_UNSUPPORTED;
          error_code = "unsupported_command";
          error_message = "Command is not supported for this entity";
        } else if (!protocol_.send_command_to_leaf(mac, match->entity_index, value)) {
          status = bridge_api::runtime_pb::COMMAND_STATUS_FAILED;
          error_code = "send_failed";
          error_message = "Bridge failed to queue command";
        } else {
          status = bridge_api::runtime_pb::COMMAND_STATUS_ACCEPTED;
        }
      }
    }
  }

  bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::COMMAND_RESULT,
                                   [&](bridge_api::runtime_pb::Writer &w) {
    w.string(1, request.remote_mac);
    w.string(2, request.object_id);
    w.string(3, request.command);
    w.string(4, mac_colon_string_(sta_mac_.data()));
    w.string(5, session_id);
    w.varint(6, status);
    w.string(7, error_code);
    w.string(8, error_message);
  });
}

void ESPTreeBridge::api_runtime_handle_config_command(
    const std::string &request_id, const bridge_api::runtime_pb::ParsedConfigCommandRequest &request,
    std::vector<uint8_t> &out) {
  uint8_t command = 0;
  std::vector<uint8_t> payload;
  if (request.command == "reboot") {
    command = CFG_CMD_REBOOT;
  } else if (request.command == "heartbeat_interval") {
    command = CFG_CMD_HEARTBEAT_INTERVAL;
    payload.resize(4);
    uint32_t interval = request.interval_seconds;
    memcpy(payload.data(), &interval, sizeof(interval));
  } else if (request.command == "force_rediscover") {
    command = CFG_CMD_FORCE_REDISCOVER;
  } else if (request.command == "set_parent_mac") {
    command = CFG_CMD_SET_PARENT_MAC;
    payload.resize(7, 0);
    payload[0] = request.clear_parent ? SET_PARENT_MAC_FLAG_CLEAR : 0;
    std::string clean;
    for (char c : request.parent_mac) if (c != ':' && c != '-' && c != ' ') clean += c;
    if (!clean.empty() && !parse_mac_hex_(clean, payload.data() + 1)) {
      bridge_api::runtime_pb::error_envelope(out, request_id, "invalid_parent_mac", "Invalid parent MAC");
      return;
    }
  } else if (request.command == "relay") {
    command = CFG_CMD_RELAY;
    payload = {static_cast<uint8_t>(request.relay_enable ? 1 : 0)};
  } else {
    bridge_api::runtime_pb::error_envelope(out, request_id, "unsupported_config_command", "Unsupported config command");
    return;
  }

  std::string immediate;
  const bool ok = api_node_config_start(request.remote_mac, command, payload, request.command, nullptr, immediate);
  const auto status = ok ? bridge_api::runtime_pb::COMMAND_STATUS_ACCEPTED :
                          bridge_api::runtime_pb::COMMAND_STATUS_FAILED;
  bridge_api::runtime_pb::envelope(out, request_id, bridge_api::runtime_pb::CONFIG_COMMAND_RESULT,
                                   [&](bridge_api::runtime_pb::Writer &w) {
    w.string(1, request.remote_mac);
    w.string(2, request.command);
    w.string(3, mac_colon_string_(sta_mac_.data()));
    w.varint(5, status);
    w.string(7, immediate);
  });
}

bool ESPTreeBridge::api_ota_start(const std::string &target_mac_colon, uint32_t file_size,
                                    const std::string &md5_hex, const std::string &sha256_hex,
                                    const std::string &filename, uint16_t preferred_chunk_size,
                                    std::string &job_id_out, uint16_t &max_chunk_size_out,
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
  if (!ota_manager_->start_transfer(mac, file_size, md5, ESPNOW_FILE_ACTION_OTA_FLASH,
                                     remote_max, filename.empty() ? "ota.bin" : filename.c_str())) {
    ws_ota_start_error_ = ota_manager_->last_error().empty() ? "start_transfer failed" : ota_manager_->last_error().c_str();
    return false;
  }

  ws_ota_job_counter_++;
  char hex_buf[8];
  snprintf(hex_buf, sizeof(hex_buf), "%04x", ws_ota_job_counter_ & 0xFFFFu);
  ws_ota_job_id_ = hex_buf;
  job_id_out = ws_ota_job_id_;

  max_chunk_size_out = ota_manager_->chunk_size();

  ws_ota_job_state_ = bridge_api::OtaJobState::WAITING_FOR_LEAF;
  ws_ota_request_id_ = request_id;
  std::copy_n(mac, ws_ota_target_mac_.size(), ws_ota_target_mac_.begin());

  ESP_LOGI(TAG, "WS OTA started job=%s target=%s size=%u", ws_ota_job_id_.c_str(),
           target_mac_colon.c_str(), static_cast<unsigned>(file_size));

  (void) sha256_hex;
  return true;
}

std::string ESPTreeBridge::api_ota_status_json() const {
  if (ws_ota_job_state_ == bridge_api::OtaJobState::IDLE) {
    return "{\"active\":false,\"state\":\"idle\"}";
  }

  std::string state_str = bridge_api::ota_job_state_string(ws_ota_job_state_);
  std::string target_mac_str = mac_display(ws_ota_target_mac_.data());
  uint8_t progress = 0;
  uint16_t current_inc = 0;
  uint16_t total_inc = 0;
  uint8_t retransmit_round = 0;
  uint16_t buf_kb = bridge_api::kOtaMaxIncrementKB;
  if (ota_manager_ != nullptr) {
    progress = ota_manager_->progress_pct();
    current_inc = ota_manager_->current_increment();
    total_inc = ota_manager_->total_increments();
    retransmit_round = ota_manager_->retransmit_round();
    buf_kb = ota_manager_->buffer_size_kb();
    std::string mgr_state = ota_manager_->public_state();
    if (mgr_state == "TRANSFERRING") {
      state_str = "transferring";
    } else if (mgr_state == "VERIFYING") {
      state_str = "verifying";
    } else if (mgr_state == "SUCCESS") {
      state_str = "success";
    } else if (mgr_state == "FAIL") {
      state_str = "failed";
    }
  }

  std::string msg;
  if (ota_manager_ != nullptr && !ota_manager_->last_error().empty()) {
    msg = ota_manager_->last_error();
  }
  uint16_t status_chunk_sz = ota_manager_ != nullptr ? ota_manager_->chunk_size() : bridge_api::kMaxWsChunkSize;
  uint32_t status_total_chunks = ota_manager_ != nullptr ? ota_manager_->total_chunks() : 0u;

  std::string json;
  json.reserve(512);
  json += "{\"active\":true,";
  json += "\"job_id\":\"" + bridge_api::BridgeApiMessages::escape_json(ws_ota_job_id_) + "\",";
  json += "\"target_mac\":\"" + bridge_api::BridgeApiMessages::escape_json(target_mac_str) + "\",";
  json += "\"state\":\"" + bridge_api::BridgeApiMessages::escape_json(state_str) + "\",";
  json += "\"size\":" + std::to_string(ota_manager_ != nullptr ? static_cast<unsigned>(ota_manager_->file_size()) : 0u) + ",";
  json += "\"percent\":" + std::to_string(progress) + ",";
  json += "\"chunk_size\":" + std::to_string(status_chunk_sz) + ",";
  json += "\"total_chunks\":" + std::to_string(status_total_chunks) + ",";
  json += "\"current_increment\":" + std::to_string(current_inc) + ",";
  json += "\"total_increments\":" + std::to_string(total_inc) + ",";
  json += "\"retransmit_round\":" + std::to_string(retransmit_round) + ",";
  json += "\"buffer_size_kb\":" + std::to_string(buf_kb) + ",";
  json += "\"requested\":[";
  if (ota_manager_ != nullptr) {
    bool first = true;
    for (auto seq : ota_manager_->requested_sequences()) {
      if (!first) json += ",";
      json += std::to_string(seq);
      first = false;
    }
  }
  json += "],";
  json += "\"message\":\"" + bridge_api::BridgeApiMessages::escape_json(msg) + "\"}";
  return json;
}

bool ESPTreeBridge::api_ota_abort(const std::string &job_id, const std::string &reason) {
  if (ws_ota_job_state_ == bridge_api::OtaJobState::IDLE) return false;
  if (!job_id.empty() && job_id != ws_ota_job_id_) return false;

  if (ota_manager_ != nullptr && ota_manager_->is_busy()) {
    ota_manager_->on_source_abort(ESPNOW_FILE_ABORT_USER);
  }
  ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
  return true;
}

bool ESPTreeBridge::api_ota_inject_chunk(uint32_t sequence, const uint8_t *data, size_t len) {
  if (ws_ota_job_state_ != bridge_api::OtaJobState::TRANSFERRING) return false;
  if (ota_manager_ == nullptr) return false;
  return ota_manager_->on_source_chunk(sequence, data, len);
}

bool ESPTreeBridge::api_ota_has_active_job() const {
  return ws_ota_job_state_ != bridge_api::OtaJobState::IDLE;
}

std::string ESPTreeBridge::api_ota_active_job_id() const {
  return ws_ota_job_state_ != bridge_api::OtaJobState::IDLE ? ws_ota_job_id_ : "";
}

const char *ESPTreeBridge::api_ota_start_error() const {
  return ws_ota_start_error_;
}

void ESPTreeBridge::emit_ota_ws_events_() {
  if (api_ws_ == nullptr || !api_ws_->has_authenticated_client()) return;
  if (ws_ota_job_state_ == bridge_api::OtaJobState::IDLE) return;

  if (ws_ota_job_state_ == bridge_api::OtaJobState::WAITING_FOR_LEAF) {
    if (ota_manager_ != nullptr && ota_manager_->is_busy() &&
        ota_manager_->public_state() == "TRANSFERRING" &&
        ota_manager_prev_public_state_ != "TRANSFERRING") {
      std::string target_mac_str = mac_display(ws_ota_target_mac_.data());
      uint16_t chunk_sz = ota_manager_->chunk_size();
      uint32_t total_chks = ota_manager_->total_chunks();
      std::vector<uint32_t> requested;
      for (auto seq : ota_manager_->requested_sequences()) {
        requested.push_back(seq);
      }
      ESP_LOGI(TAG, "Sending ota_accepted with chunk_size=%u total_chunks=%u requested=%zu",
               static_cast<unsigned>(chunk_sz), static_cast<unsigned>(total_chks), requested.size());
      std::string response = bridge_api::BridgeApiMessages::ota_accepted(
          ws_ota_request_id_, ws_ota_job_id_, target_mac_str,
          chunk_sz, total_chks, requested);
      api_ws_->send_text(api_ws_->active_client_id(), response);
      ws_ota_job_state_ = bridge_api::OtaJobState::TRANSFERRING;
      ota_manager_prev_public_state_ = "TRANSFERRING";

      ws_ota_session_id_ = ws_ota_job_id_;

      ESP_LOGI(TAG, "Sending ota_chunk_request for session=%s sequences=%zu",
               ws_ota_session_id_.c_str(), requested.size());
      std::string chunk_req = bridge_api::BridgeApiMessages::ota_chunk_request(
          ws_ota_request_id_, ws_ota_session_id_, ws_ota_session_id_,
          requested, 0, 0, 0, 1);
      api_ws_->send_text(api_ws_->active_client_id(), chunk_req);
      return;
    }
    if (ota_manager_ == nullptr || !ota_manager_->is_busy()) {
      std::string error_json = bridge_api::BridgeApiMessages::error(
          ws_ota_request_id_, bridge_api::error::OTA_NOT_ACTIVE,
          "OTA transfer failed before leaf accepted");
      api_ws_->send_text(api_ws_->active_client_id(), error_json);
      ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
      ota_manager_prev_public_state_.clear();
      return;
    }
    if (ota_manager_ != nullptr) {
      ota_manager_prev_public_state_ = ota_manager_->public_state();
    }
    return;
  }

  if (ws_ota_job_state_ == bridge_api::OtaJobState::TRANSFERRING) {
    if (ota_manager_ == nullptr) {
      ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
      ota_manager_prev_public_state_.clear();
      return;
    }
    std::string current_state = ota_manager_->public_state();
    if (current_state == "SUCCESS" && ota_manager_prev_public_state_ != "SUCCESS") {
      std::string status = api_ota_status_json();
      api_ws_->send_text(api_ws_->active_client_id(),
          bridge_api::BridgeApiMessages::ota_status_result(ws_ota_request_id_, status));
      ws_ota_job_state_ = bridge_api::OtaJobState::SUCCESS;
      ota_manager_prev_public_state_ = "SUCCESS";
      return;
    }
    if (current_state == "FAIL" && ota_manager_prev_public_state_ != "FAIL") {
      std::string status = api_ota_status_json();
      api_ws_->send_text(api_ws_->active_client_id(),
          bridge_api::BridgeApiMessages::ota_status_result(ws_ota_request_id_, status));
      ws_ota_job_state_ = bridge_api::OtaJobState::FAILED;
      ota_manager_prev_public_state_ = "FAIL";
      return;
    }
    if (!ota_manager_->is_busy()) {
      ws_ota_job_state_ = bridge_api::OtaJobState::IDLE;
      ota_manager_prev_public_state_.clear();
      return;
    }
    ota_manager_prev_public_state_ = current_state;
    return;
  }
}

std::string ESPTreeBridge::mac_colon_string_(const uint8_t *mac) const { return mac_display(mac); }

std::string ESPTreeBridge::get_ip_string() const {
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

void ESPTreeBridge::register_web_handler_() {
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
      
      "if(n.uptime_s>0){var u=document.createElement('span');u.className='uptime';u.textContent='up ';var t=document.createElement('span');t.textContent=fmtU(n.uptime_s);u.appendChild(t);s.appendChild(u)}"
      "if(n.entity_count!==undefined){var e=document.createElement('span');e.className='entities';e.textContent=n.entity_count+' ent';s.appendChild(e)}"
      "if(n.rssi!==undefined){var r=document.createElement('span');r.className='rssi';r.textContent=n.rssi+' dBm';s.appendChild(r)}"
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
    ESPTreeBridge *bridge_;
    PageHandler(ESPTreeBridge *bridge) : bridge_(bridge) {}
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
    ESPTreeBridge *bridge_;
    JsonHandler(ESPTreeBridge *bridge) : bridge_(bridge) {}
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

  struct BridgeJsonHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    explicit BridgeJsonHandler(ESPTreeBridge *b) : bridge_(b) {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_GET && request->url_to(url_buf) == "/bridge.json";
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      std::string json = "{\"friendly_name\":\"";
      json += bridge_api::BridgeApiMessages::escape_json(bridge_->bridge_friendly_name_);
      json += "\",\"network_id\":\"";
      json += bridge_api::BridgeApiMessages::escape_json(bridge_->network_id_);
      json += "\",\"port\":80}";
      request->send(200, "application/json", json.c_str());
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  web_server_base::global_web_server_base->add_handler(new PageHandler(this));
  web_server_base::global_web_server_base->add_handler(new JsonHandler(this));
  web_server_base::global_web_server_base->add_handler(new BridgeJsonHandler(this));
}

void ESPTreeBridge::reset_ota_upload_state_(bool release_memory) {
  ota_upload_expected_size_ = 0;
  ota_upload_received_ = 0;
  ota_upload_last_activity_ms_ = 0;
  ota_upload_complete_ = false;
  ota_upload_failed_ = false;
  ota_upload_session_pending_ = false;
  ota_upload_target_mac_.fill(0);
  ota_upload_md5_.fill(0);
  ota_upload_error_msg_.clear();
  ota_chunk_stages_.clear();
  ota_upload_buf_.clear();
  if (release_memory) {
    ota_upload_buf_.shrink_to_fit();
  }
}

void ESPTreeBridge::do_clear_entity_(const uint8_t *mac, const BridgeEntitySchema &entity) {
  if (!is_connected()) return;
  const std::string component = entity_component_(static_cast<espnow_field_type_t>(entity.entity_type));
  const std::string discovery_topic =
      mqtt_discovery_prefix_ + "/" + component + "/" + node_key_(mac) + "/" + entity_object_id_(mac, entity) + "/config";
  publish(discovery_topic, "", 1, true);
}

void ESPTreeBridge::publish_bridge_diag_discovery_() {
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
  const bool ram_ok = publish_sensor("ram_usage", "RAM Usage", nullptr, nullptr, "measurement", "mdi:memory", 1);
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

void ESPTreeBridge::publish_bridge_diag_state_() {
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

void ESPTreeBridge::publish_remote_diag_discovery_(const uint8_t *mac) {
  if (!is_connected() || mac == nullptr) return;
  const std::string node_key = node_key_(mac);
  if (remote_diag_discovery_published_.count(node_key)) return;
  const std::string device_id = std::string("esp_tree_") + node_key;
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
                          device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
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
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
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
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
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
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
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
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
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
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
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
    device["sw"] = std::to_string(ESPNOW_PROTOCOL_VER);
  }, 1, true);
  if (ok && build_ok && esphome_name_ok && project_name_ok && project_version_ok && last_seen_ok && path_status_ok) remote_diag_discovery_published_.insert(node_key);
}

void ESPTreeBridge::publish_force_rejoin_button_discovery_() {
  if (!is_connected() || force_rejoin_button_discovery_published_) return;
  const std::string bridge_mac = mac_key_string_(sta_mac_.data());
  const std::string device_id = bridge_device_id_(sta_mac_.data());
  force_rejoin_command_topic_ = "esp-tree/bridge/" + bridge_mac + "/force_rejoin/set";

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

void ESPTreeBridge::handle_force_rejoin_command_(const std::string &payload) {
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

void ESPTreeBridge::publish_remote_diag_state_(const uint8_t *mac) {
  if (!is_connected() || mac == nullptr) return;
  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr) return;
  const uint32_t uptime_s = session->joined_ms != 0 ? (millis() - session->joined_ms) / 1000U : 0;
  const int8_t rssi = session->last_rssi;
  const int rssi_pct = rssi <= -100 ? 0 : (rssi >= -60 ? 100 : (rssi + 100) * 5 / 2);
  publish(remote_diag_state_topic_(mac, "uptime_since_join"), std::to_string(uptime_s), 1);
  delay(YIELD_MS);
  const uint32_t last_seen_s = session->last_seen_s != 0 ? (millis() / 1000) - session->last_seen_s : 0;
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
      strftime(date_buf, sizeof(date_buf), "%Y-%m-%d %H:%M:%S", tm_info);
    }
  }
  publish(remote_diag_state_topic_(mac, "firmware_build_date"), date_buf, 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "project_name"), session->project_name, 1);
  delay(YIELD_MS);
  publish(remote_diag_state_topic_(mac, "project_version"), session->project_version, 1);
  delay(YIELD_MS);
  const char *device_v = (session->leaf_session_flags & ESPNOW_SESSION_FLAG_V2_MTU) ? "V2" : "V1";
  const char *route_v = session->route_v2_capable ? "V2" : "V1";
  publish(remote_diag_state_topic_(mac, "path"), std::string(device_v) + "/" + route_v, 1);
}

void ESPTreeBridge::queue_remote_diag_refresh_(const uint8_t *mac) {
  if (mac == nullptr) return;
  const std::string key = mac_key_string_(mac);
  remote_diag_refresh_pending_.insert(key);
  first_remote_diag_publish_pending_.insert(key);
}

void ESPTreeBridge::handle_command_message_(const std::string &topic, const std::string &payload) {
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

void ESPTreeBridge::sync_mqtt_entities_() {
  const uint32_t now = millis();
  if (!is_connected()) return;

  if (mqtt_backoff_until_ms_ != 0 && now < mqtt_backoff_until_ms_) {
    return;
  }
  if (mqtt_backoff_until_ms_ != 0 && now >= mqtt_backoff_until_ms_) {
    mqtt_backoff_until_ms_ = 0;
  }

  const bool just_connected = is_connected() && !mqtt_was_connected_;
  if (just_connected) {
    mqtt_retry_count_ = 0;
    for (auto &pair : mqtt_devices_) {
      pair.second.discovery_dirty = true;
      pair.second.discovery_published = false;
      pair.second.schema_complete = true;
    }
    for (auto &pair : mqtt_entities_) {
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
    publish(availability_topic_(front.mac.data()), front.online ? "online" : "offline", 1);
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

  for (auto &pair : mqtt_devices_) {
    if (pair.second.discovery_dirty) {
      publish_device_discovery_(pair.second.leaf_mac.data());
      break;
    }
  }

  int states_processed = 0;
  for (auto &pair : mqtt_entities_) {
    if (loop_budget_exceeded_()) break;
    auto &rec = pair.second;
    const std::string dev_key = rec.node_id;
    bool dev_published = false;
    auto dev_it = mqtt_devices_.find(dev_key);
    if (dev_it != mqtt_devices_.end()) {
      dev_published = dev_it->second.discovery_published;
    }
    if (!rec.discovery_published && dev_published) {
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

  if (protocol_.get_joining_in_progress()) {
    std::array<uint8_t, 6> joining_leaf{};
    if (protocol_.get_joining_leaf_mac(joining_leaf.data())) {
      protocol_.check_and_complete_join_(joining_leaf.data());
    }
  }

  if (now >= next_diag_check_ms_) {
    check_diag_publish_rr_();
    next_diag_check_ms_ = now + DIAG_CHECK_INTERVAL_MS + (uint32_t)(esp_random() % (2 * DIAG_JITTER_MS)) - DIAG_JITTER_MS;
  }
}

void ESPTreeBridge::check_diag_publish_rr_() {
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

void ESPTreeBridge::publish_remote_diag_state_cached_(const uint8_t *mac, const std::string &node_key) {
  if (!is_connected() || mac == nullptr) return;
  const BridgeSession *session = protocol_.get_session(mac);
  if (session == nullptr) return;

  const uint32_t now = millis();
  const uint32_t uptime_s = session->joined_ms != 0 ? (now - session->joined_ms) / 1000U : 0;
  const int8_t rssi = session->last_rssi;
  const int rssi_pct = rssi <= -100 ? 0 : (rssi >= -60 ? 100 : (rssi + 100) * 5 / 2);
  const uint32_t last_seen_s = session->last_seen_s != 0 ? (now / 1000) - session->last_seen_s : 0;

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
        strftime(date_buf, sizeof(date_buf), "%Y-%m-%d %H:%M:%S", tm_info);
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

void ESPTreeBridge::schema_complete_(const uint8_t *mac, uint8_t total_entities) {
  const std::string nk = node_key_(mac);
  auto it = mqtt_devices_.find(nk);
  if (it != mqtt_devices_.end()) {
    it->second.schema_complete = true;
    it->second.discovery_dirty = true;
    it->second.discovery_published = false;
  }
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
  }
  if (api_proto_ws_ != nullptr) {
    const BridgeSession *session = protocol_.get_session(mac);
    if (session != nullptr) {
      uint8_t schema_hash_bytes[32];
      memcpy(schema_hash_bytes, session->schema_hash.data(), sizeof(schema_hash_bytes));
      api_proto_ws_->emit_remote_schema_changed(
          mac, "sha256:" + bridge_api::BridgeApiAuth::bytes_to_lower_hex(schema_hash_bytes, sizeof(schema_hash_bytes)));
    }
  }
  (void)total_entities;
}

void ESPTreeBridge::on_discovery_confirmed_(const uint8_t *mac, uint8_t entity_index, bool success) {
  protocol_.on_discovery_confirmed_(mac, entity_index, success);
}

bool ESPTreeBridge::setup_transport_() {
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
  protocol_.set_publish_availability_fn([this](const uint8_t *mac, bool online, const char *reason) { this->queue_availability_(mac, online, reason); });
  protocol_.set_publish_topology_changed_fn([this](const uint8_t *mac, const char *reason) {
    if (this->api_ws_ != nullptr) {
      this->api_ws_->emit_topology_changed(reason, mac);
    }
    if (this->api_proto_ws_ != nullptr) {
      this->api_proto_ws_->emit_topology_changed(reason, mac);
    }
  });
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
  force_rejoin_command_topic_ = "esp-tree/bridge/" + mac_key_string_(sta_mac_.data()) + "/force_rejoin/set";
  subscribe(force_rejoin_command_topic_, &ESPTreeBridge::handle_force_rejoin_command_);
  transport_ready_ = true;
  return true;
}

void ESPTreeBridge::setup() {
  if (!psk_.empty() && !network_id_.empty()) {
    protocol_ready_ = protocol_.init(psk_.c_str(), network_id_.c_str(), heartbeat_interval_) == 0;
  }
  if (!protocol_ready_) {
    this->mark_failed();
    return;
  }
  protocol_.set_bridge_identity(protocol_.bridge_identity().chip_model, App.get_build_time(), __DATE__, __TIME__,
                                project_name_(), project_version_(), {});
  if (!setup_transport_()) {
    this->mark_failed();
    return;
  }
  api_ws_ = std::make_unique<bridge_api::BridgeApiWsTransport>(this);
  api_proto_ws_ = std::make_unique<bridge_api::BridgeApiProtoWsTransport>(this);
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
  }
  this->set_interval("airtime_status", AIRTIME_REPORT_INTERVAL_MS, [this]() { this->log_airtime_status_(); });
  this->set_interval("ram_stats", 30000, [this]() { this->log_ram_stats_(); });
}

void ESPTreeBridge::loop() {
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
        ota_upload_last_activity_ms_ != 0 &&
        (millis() - ota_upload_last_activity_ms_) > 30000U) {
      ESP_LOGW(TAG, "Aborting OTA upload after stalled HTTP upload stream");
      ota_manager_->on_source_abort(ESPNOW_FILE_ABORT_TIMEOUT);
      reset_ota_upload_state_(true);
    }
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
  if (!api_proto_ws_handler_registered_ && api_proto_ws_ != nullptr && web_server_base::global_web_server_base != nullptr) {
    api_proto_ws_handler_registered_ = api_proto_ws_->register_with_web_server();
  }
  if (api_ws_ != nullptr) {
    api_ws_->loop();
  }
  if (api_proto_ws_ != nullptr) {
    api_proto_ws_->loop();
  }
  // --- V2 Web UI registrations (parallel, independent paths) ---
  if (!v2_auth_handlers_registered_ && web_server_base::global_web_server_base != nullptr) {
    register_v2_auth_handlers_();
    v2_auth_handlers_registered_ = true;
  }
  if (!v2_web_handlers_registered_ && web_server_base::global_web_server_base != nullptr) {
    register_v2_web_handlers_();
    v2_web_handlers_registered_ = true;
  }
}

void ESPTreeBridge::dump_config() {}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void ESPTreeBridge::on_data_received_(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (active_instance_ == nullptr || info == nullptr || info->src_addr == nullptr) return;
  int8_t rssi = (info->rx_ctrl != nullptr) ? info->rx_ctrl->rssi : 0;
  active_instance_->handle_received_frame_(info->src_addr, data, static_cast<size_t>(len), rssi);
}
void ESPTreeBridge::on_data_sent_(const esp_now_send_info_t *, esp_now_send_status_t status) {
  if (active_instance_ == nullptr) return;
  active_instance_->handle_send_status_(nullptr, status == ESP_NOW_SEND_SUCCESS);
}
#else
void ESPTreeBridge::on_data_received_(const uint8_t *mac, const uint8_t *data, int len) {
  if (active_instance_ == nullptr) return;
  ESP_LOGI(TAG, "[RX ALL] mac=%s len=%u first=0x%02X", mac_key_string_(mac).c_str(), static_cast<unsigned>(len), data[0]);
  active_instance_->handle_received_frame_(mac, data, static_cast<size_t>(len), 0);
}
void ESPTreeBridge::on_data_sent_(const uint8_t *, esp_now_send_status_t status) {
  if (active_instance_ == nullptr) return;
  active_instance_->handle_send_status_(nullptr, status == ESP_NOW_SEND_SUCCESS);
}
#endif

// --- V2 Web UI additions ---

static constexpr uint32_t V2_SESSION_TIMEOUT_MS = 86400000; // 24h
static constexpr size_t V2_TOKEN_HEX_BYTES = 16;             // 32 hex chars

static std::string v2_generate_token_() {
  uint8_t bytes[V2_TOKEN_HEX_BYTES];
  fill_random_bytes(bytes, sizeof(bytes));
  std::string hex;
  hex.reserve(V2_TOKEN_HEX_BYTES * 2);
  static const char *kHex = "0123456789abcdef";
  for (size_t i = 0; i < V2_TOKEN_HEX_BYTES; ++i) {
    hex += kHex[(bytes[i] >> 4) & 0x0F];
    hex += kHex[bytes[i] & 0x0F];
  }
  return hex;
}

void ESPTreeBridge::register_v2_auth_handlers_() {
  if (web_server_base::global_web_server_base == nullptr) return;

  struct LoginPageHandler : public AsyncWebHandler {
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_GET && request->url_to(url_buf) == std::string("/login");
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      request->send(200, "text/html; charset=utf-8", LOGIN_PAGE_HTML);
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct LoginHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    LoginHandler(ESPTreeBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_POST && request->url_to(url_buf) == std::string("/api/auth/login");
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      std::string key;
      if (request->hasArg("api_key")) {
        key = request->arg("api_key").c_str();
      }
      if (key.empty()) {
        request->send(400, "application/json", "{\"error\":\"empty api_key\"}");
        return;
      }

      const std::string &configured = bridge_->api_key();
      bool match = configured.size() == key.size();
      uint8_t diff = 0;
      for (size_t i = 0; i < configured.size() && i < key.size(); ++i) {
        diff |= static_cast<uint8_t>(configured[i] ^ key[i]);
      }
      if (!match || diff != 0) {
        request->send(401, "application/json", "{\"error\":\"invalid api_key\"}");
        return;
      }

      std::string token = v2_generate_token_();
      bridge_->v2_session_token_ = token;
      bridge_->v2_session_created_ms_ = millis();

      httpd_req_t *req = *request;
      std::string cookie = "espnow_session=" + token + "; Path=/; Max-Age=86400; SameSite=Lax";
      httpd_resp_set_hdr(req, "Set-Cookie", cookie.c_str());

      request->send(200, "application/json",
                    ("{\"status\":\"ok\",\"api_key\":\"" + key + "\"}").c_str());
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct LogoutHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    LogoutHandler(ESPTreeBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_POST && request->url_to(url_buf) == std::string("/api/auth/logout");
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      bridge_->v2_session_token_.clear();
      bridge_->v2_session_created_ms_ = 0;
      request->send(200, "application/json", "{\"status\":\"logged_out\"}");
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  web_server_base::global_web_server_base->add_handler(new LoginPageHandler());
  web_server_base::global_web_server_base->add_handler(new LoginHandler(this));
  web_server_base::global_web_server_base->add_handler(new LogoutHandler(this));

  struct TopologyHttpHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    explicit TopologyHttpHandler(ESPTreeBridge *b) : bridge_(b) {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_GET && request->url_to(url_buf) == std::string("/api/v1/topology");
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      if (!bridge_->v2_http_authenticate_(request)) {
        request->send(401, "application/json", "{\"error\":\"unauthorized\"}");
        return;
      }
      std::string json = bridge_->api_topology_snapshot_json("{}");
      request->send(200, "application/json", json.c_str());
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct BridgeInfoHttpHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    explicit BridgeInfoHttpHandler(ESPTreeBridge *b) : bridge_(b) {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_GET && request->url_to(url_buf) == std::string("/api/v1/bridge/info");
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      if (!bridge_->v2_http_authenticate_(request)) {
        request->send(401, "application/json", "{\"error\":\"unauthorized\"}");
        return;
      }
      std::string json = bridge_->api_bridge_info_json();
      request->send(200, "application/json", json.c_str());
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  struct NodeStateHttpHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    explicit NodeStateHttpHandler(ESPTreeBridge *b) : bridge_(b) {}
    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      if (request->method() != HTTP_GET) return false;
      request->url_to(url_buf);
      return strncmp(url_buf, "/api/v1/node/", 15) == 0;
    }
    void handleRequest(AsyncWebServerRequest *request) override {
      if (!bridge_->v2_http_authenticate_(request)) {
        request->send(401, "application/json", "{\"error\":\"unauthorized\"}");
        return;
      }
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      request->url_to(url_buf);
      const char *url = url_buf;
      const char *prefix = "/api/v1/node/";
      const char *suffix = "/state";
      const size_t prefix_len = 15;
      const size_t suffix_len = 7;
      size_t url_len = strlen(url);
      if (url_len <= prefix_len + suffix_len) {
        request->send(400, "application/json", "{\"error\":\"invalid path\"}");
        return;
      }
      std::string mac_with_slash(url + prefix_len, url_len - prefix_len - suffix_len);
      std::string mac_colon;
      for (char c : mac_with_slash) {
        if (c != '-' && c != ' ') mac_colon += c;
      }
      std::transform(mac_colon.begin(), mac_colon.end(), mac_colon.begin(), ::toupper);
      std::string json = bridge_->api_node_state_json(mac_colon);
      if (json.empty()) {
        request->send(404, "application/json", "{\"error\":\"node not found\"}");
        return;
      }
      request->send(200, "application/json", json.c_str());
    }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  web_server_base::global_web_server_base->add_handler(new TopologyHttpHandler(this));
  web_server_base::global_web_server_base->add_handler(new BridgeInfoHttpHandler(this));
  web_server_base::global_web_server_base->add_handler(new NodeStateHttpHandler(this));
}

bool ESPTreeBridge::v2_http_authenticate_(void *req) {
  if (api_key_.empty()) {
    return true;
  }
  auto *request = static_cast<AsyncWebServerRequest *>(req);
  if (request->hasArg("api_key")) {
    const std::string &configured = api_key_;
    std::string key = request->arg("api_key").c_str();
    if (key.size() != configured.size()) return false;
    uint8_t diff = 0;
    for (size_t i = 0; i < configured.size(); ++i) {
      diff |= static_cast<uint8_t>(configured[i] ^ key[i]);
    }
    return diff == 0;
  }
  return v2_verify_session_(request);
}

bool ESPTreeBridge::v2_verify_session_(void *req) {
  if (api_key_.empty()) {
    return true;
  }

  auto *request = static_cast<AsyncWebServerRequest *>(req);
  auto cookie_hdr = request->get_header("Cookie");
  if (!cookie_hdr.has_value()) {
    return false;
  }

  std::string cookie_str = cookie_hdr.value().c_str();
  auto start = cookie_str.find("espnow_session=");
  if (start == std::string::npos) {
    return false;
  }
  start += 15;
  auto end = cookie_str.find(';', start);
  if (end == std::string::npos) {
    end = cookie_str.size();
  }
  std::string token = cookie_str.substr(start, end - start);

  if (token.empty() || token != v2_session_token_) {
    return false;
  }
  if (millis() - v2_session_created_ms_ > V2_SESSION_TIMEOUT_MS) {
    v2_session_token_.clear();
    v2_session_created_ms_ = 0;
    return false;
  }
  return true;
}

void ESPTreeBridge::register_v2_web_handlers_() {
  if (web_server_base::global_web_server_base == nullptr) return;

  struct V2TopologyPageHandler : public AsyncWebHandler {
    ESPTreeBridge *bridge_;
    V2TopologyPageHandler(ESPTreeBridge *bridge) : bridge_(bridge) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->method() == HTTP_GET && request->url_to(url_buf) == std::string("/v2/topology");
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      if (!bridge_->v2_verify_session_(request)) {
        request->redirect("/login?redirect=/v2/topology");
        return;
      }
      request->send(200, "text/html; charset=utf-8", TOPOLOGY_V2_PAGE_HTML);
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }
  };

  web_server_base::global_web_server_base->add_handler(new V2TopologyPageHandler(this));
}

}  // namespace esp_tree
}  // namespace esphome
