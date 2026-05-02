#include "bridge_api_messages.h"
#include "espnow_lr_common/espnow_mac_utils.h"
#include "espnow_lr_common/espnow_types.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <sstream>
#include <unordered_map>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

namespace {

static std::vector<std::string> split_string(const std::string &input, char sep) {
  std::vector<std::string> result;
  std::string current;
  for (char ch : input) {
    if (ch == sep) {
      result.push_back(std::move(current));
      current.clear();
    } else {
      current += ch;
    }
  }
  result.push_back(std::move(current));
  return result;
}

static std::vector<std::string> parse_select_options(const std::string &entity_options) {
  std::vector<std::string> fallback = split_string(entity_options, '|');
  for (const auto &part : split_string(entity_options, ';')) {
    auto eq = part.find('=');
    if (eq == std::string::npos) continue;
    std::string key = part.substr(0, eq);
    if (key == "options") {
      std::string val = part.substr(eq + 1);
      std::vector<std::string> opts = split_string(val, '|');
      if (!opts.empty()) return opts;
    }
  }
  return fallback;
}

static std::string quoted_json_string(const std::string &raw) {
  return "\"" + BridgeApiMessages::escape_json(raw) + "\"";
}

static std::unordered_map<std::string, std::string> parse_options_map(const std::string &entity_options) {
  std::unordered_map<std::string, std::string> map;
  for (const auto &part : split_string(entity_options, ';')) {
    auto eq = part.find('=');
    if (eq == std::string::npos) continue;
    map[part.substr(0, eq)] = part.substr(eq + 1);
  }
  return map;
}

static std::vector<std::string> option_list(
    const std::unordered_map<std::string, std::string> &opts, const std::string &key) {
  auto it = opts.find(key);
  if (it == opts.end()) return {};
  return split_string(it->second, '|');
}

static bool option_has_list_value(
    const std::unordered_map<std::string, std::string> &opts, const std::string &key, const std::string &value) {
  auto it = opts.find(key);
  if (it == opts.end()) return false;
  for (const auto &v : split_string(it->second, '|')) {
    if (v == value) return true;
  }
  return false;
}

static const char *color_mode_name_json(uint8_t cm) {
  switch (cm) {
    case 1:  return "onoff";
    case 3:  return "brightness";
    case 7:  return "white";
    case 11: return "color_temp";
    case 19: return "color_temp";
    case 35: return "rgb";
    case 39: return "rgbw";
    case 47: return "rgbw";
    case 51: return "rgbww";
    default: return "brightness";
  }
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

static std::string build_light_state_json(const uint8_t *value, size_t value_len,
                                           const std::string &entity_options) {
  if (value_len < 1) return "{}";
  const auto opts = parse_options_map(entity_options);
  std::ostringstream ss;
  ss << "{";
  ss << "\"state\":" << (value[0] ? "true" : "false");
  if (value_len > 5) {
    ss << ",\"color_mode\":\"" << color_mode_name_json(value[5]) << "\"";
  } else if (value_len > 3 &&
             (option_has_list_value(opts, "color_modes", "rgb") ||
              option_has_list_value(opts, "color_modes", "rgbw") ||
              option_has_list_value(opts, "color_modes", "rgbww"))) {
    ss << ",\"color_mode\":\"rgb\"";
  } else if (value_len > 1 &&
             option_has_list_value(opts, "color_modes", "color_temp")) {
    ss << ",\"color_mode\":\"color_temp\"";
  } else {
    ss << ",\"color_mode\":\"brightness\"";
  }
  if (value_len > 1 &&
      (option_has_list_value(opts, "color_modes", "brightness") ||
       option_has_list_value(opts, "color_modes", "rgb") ||
       option_has_list_value(opts, "color_modes", "rgbw") ||
       option_has_list_value(opts, "color_modes", "rgbww") ||
       option_has_list_value(opts, "color_modes", "white") ||
       option_has_list_value(opts, "color_modes", "color_temp"))) {
    ss << ",\"brightness\":" << static_cast<int>(value[1]);
  }
  if (value_len > 3 &&
      (option_has_list_value(opts, "color_modes", "rgb") ||
       option_has_list_value(opts, "color_modes", "rgbw") ||
       option_has_list_value(opts, "color_modes", "rgbww"))) {
    uint8_t r = 0, g = 0, b = 0;
    hsv_u8_to_rgb(value[2], value[3], value[1], r, g, b);
    ss << ",\"color\":{\"r\":" << static_cast<int>(r)
       << ",\"g\":" << static_cast<int>(g)
       << ",\"b\":" << static_cast<int>(b) << "}";
  }
  if (value_len > 7) {
    const uint16_t ct = static_cast<uint16_t>(value[6]) | (static_cast<uint16_t>(value[7]) << 8);
    if (ct > 0) ss << ",\"color_temp\":" << ct;
  }
  if (value_len > 8 && value[8] > 0) {
    ss << ",\"white\":" << static_cast<int>(value[8]);
  }
  const auto effects = option_list(opts, "effects");
  if (!effects.empty() && value_len > 4) {
    if (value[4] > 0 && value[4] <= effects.size()) {
      ss << ",\"effect\":\"" << BridgeApiMessages::escape_json(effects[value[4] - 1]) << "\"";
    } else {
      ss << ",\"effect\":\"None\"";
    }
  }
  ss << "}";
  return ss.str();
}

static std::string build_fan_state_json(const uint8_t *value, size_t value_len) {
  if (value_len < 1) return "{}";
  std::ostringstream ss;
  ss << "{";
  ss << "\"state\":" << (value[0] ? "true" : "false");
  if (value_len > 1) ss << ",\"speed_level\":" << static_cast<int>(value[1]);
  if (value_len > 2) ss << ",\"oscillating\":" << (value[2] ? "true" : "false");
  if (value_len > 3) ss << ",\"direction\":\"" << (value[3] ? "reverse" : "forward") << "\"";
  ss << "}";
  return ss.str();
}

}  // namespace

std::string BridgeApiMessages::state_value_json(espnow_field_type_t type, const uint8_t *value, size_t value_len,
                                                const std::string &entity_options) {
  if (value == nullptr || value_len == 0) return "null";

  switch (type) {
    case FIELD_TYPE_SENSOR:
    case FIELD_TYPE_NUMBER: {
      if (value_len < sizeof(float)) return "0";
      float f = 0.0f;
      memcpy(&f, value, sizeof(f));
      std::ostringstream ss;
      ss << f;
      return ss.str();
    }
    case FIELD_TYPE_SWITCH:
    case FIELD_TYPE_BINARY:
    case FIELD_TYPE_BUTTON:
    case FIELD_TYPE_HUMIDIFIER:
    case FIELD_TYPE_DEHUMIDIFIER:
      return value[0] ? "true" : "false";
    case FIELD_TYPE_LIGHT:
      return build_light_state_json(value, value_len, entity_options);
    case FIELD_TYPE_FAN:
      return build_fan_state_json(value, value_len);
    case FIELD_TYPE_COVER:
    case FIELD_TYPE_VALVE: {
      int pct = value_len > 0 ? static_cast<int>(value[0]) : 0;
      return std::to_string(pct);
    }
    case FIELD_TYPE_LOCK: {
      if (value_len > 0 && value[0] == 1) return quoted_json_string("LOCKED");
      if (value_len > 0 && value[0] == 2) return quoted_json_string("JAMMED");
      return quoted_json_string("UNLOCKED");
    }
    case FIELD_TYPE_ALARM: {
      const char *state = "disarmed";
      if (value_len > 0) {
        switch (value[0]) {
          case 1:  state = "armed_home"; break;
          case 2:  state = "armed_away"; break;
          case 3:  state = "armed_night"; break;
          case 4:  state = "armed_vacation"; break;
          case 5:  state = "armed_custom_bypass"; break;
          case 6:  state = "triggered"; break;
          case 7:  state = "pending"; break;
          case 8:  state = "arming"; break;
          case 9:  state = "disarming"; break;
          default: state = "disarmed"; break;
        }
      }
      return quoted_json_string(state);
    }
    case FIELD_TYPE_SELECT: {
      if (!entity_options.empty() && value_len > 0) {
        auto options = parse_select_options(entity_options);
        if (value[0] < options.size()) {
          return quoted_json_string(options[value[0]]);
        }
      }
      return value_len > 0 ? std::to_string(value[0]) : "0";
    }
    case FIELD_TYPE_TEXT:
    case FIELD_TYPE_TEXT_SENSOR:
    case FIELD_TYPE_EVENT:
    case FIELD_TYPE_TIME:
    case FIELD_TYPE_DATETIME:
      return quoted_json_string(std::string(reinterpret_cast<const char *>(value), value_len));
    case FIELD_TYPE_CLIMATE:
    default:
      return "null";
  }
}

std::string BridgeApiMessages::escape_json(const std::string &value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (char ch : value) {
    switch (ch) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(ch) < 0x20) {
          char buf[8];
          snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned int>(static_cast<unsigned char>(ch)));
          out += buf;
        } else {
          out += ch;
        }
        break;
    }
  }
  return out;
}

std::string BridgeApiMessages::envelope(const char *type, const std::string &id, const std::string &payload_json) {
  std::string json;
  json.reserve(128 + payload_json.size());
  json += "{\"v\":1,\"type\":\"";
  json += type;
  json += "\"";
  if (!id.empty()) {
    json += ",\"id\":\"";
    json += escape_json(id);
    json += "\"";
  }
  json += ",\"payload\":";
  json += payload_json;
  json += "}";
  return json;
}

std::string BridgeApiMessages::event(const char *type, const std::string &payload_json) {
  return envelope(type, "", payload_json);
}

std::string BridgeApiMessages::error(const std::string &id, const char *code, const std::string &message,
                                     const std::string &details_json) {
  std::string payload;
  payload.reserve(128 + message.size() + details_json.size());
  payload += "{\"code\":\"";
  payload += escape_json(code);
  payload += "\",\"message\":\"";
  payload += escape_json(message);
  payload += "\"";
  if (details_json != "{}") {
    payload += ",\"details\":";
    payload += details_json;
  }
  payload += "}";
  return envelope(type::ERROR, id, payload);
}

std::string BridgeApiMessages::auth_challenge(const AuthChallenge &challenge) {
  std::string payload;
  payload.reserve(256);
  payload += "{\"server_nonce\":\"";
  payload += challenge.server_nonce_hex;
  payload += "\",\"protocol\":\"";
  payload += kProtocolName;
  payload += "\",\"min_version\":";
  payload += std::to_string(kApiVersion);
  payload += ",\"max_version\":";
  payload += std::to_string(kApiVersion);
  payload += "}";
  return envelope(type::AUTH_CHALLENGE, "", payload);
}

std::string BridgeApiMessages::auth_ok(const std::string &id) {
  std::string payload;
  payload.reserve(128);
  payload += "{\"api_version\":";
  payload += std::to_string(kApiVersion);
  payload += ",\"server\":\"espnow-tree-bridge\"}";
  return envelope(type::AUTH_OK, id, payload);
}

std::string BridgeApiMessages::bridge_heartbeat(uint32_t uptime_ms) {
  std::string payload;
  payload.reserve(64);
  payload += "{\"uptime_ms\":";
  payload += std::to_string(uptime_ms);
  payload += "}";
  return event(type::BRIDGE_HEARTBEAT, payload);
}

std::string BridgeApiMessages::bridge_info_result(const std::string &id, const std::string &info_payload_json) {
  return envelope(type::BRIDGE_INFO_RESULT, id, info_payload_json);
}

std::string BridgeApiMessages::topology_snapshot(const std::string &id, const std::string &snapshot_payload_json) {
  return envelope(type::TOPOLOGY_SNAPSHOT, id, snapshot_payload_json);
}

std::string BridgeApiMessages::topology_changed(const char *reason, const uint8_t *mac) {
  std::string mac_colon = mac_display(mac);
  std::string payload;
  payload.reserve(128);
  payload += "{\"reason\":\"";
  payload += escape_json(reason);
  payload += "\",\"mac\":\"";
  payload += escape_json(mac_colon);
  payload += "\"}";
  return event(type::TOPOLOGY_CHANGED, payload);
}

std::string BridgeApiMessages::remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                                   uint32_t last_seen_ms) {
  std::string mac_colon = mac_display(mac);
  std::string payload;
  payload.reserve(200);
  payload += "{\"mac\":\"";
  payload += escape_json(mac_colon);
  payload += "\",\"online\":";
  payload += (online ? "true" : "false");
  payload += ",\"reason\":\"";
  payload += escape_json(reason);
  payload += "\",\"rssi\":";
  payload += std::to_string(rssi);
  payload += ",\"last_seen_ms\":";
  payload += std::to_string(last_seen_ms);
  payload += "}";
  return event(type::REMOTE_AVAILABILITY, payload);
}

std::string BridgeApiMessages::remote_schema_changed(const uint8_t *mac, const std::string &schema_hash) {
  std::string mac_colon = mac_display(mac);
  std::string payload;
  payload.reserve(200);
  payload += "{\"mac\":\"";
  payload += escape_json(mac_colon);
  payload += "\",\"schema_hash\":\"";
  payload += escape_json(schema_hash);
  payload += "\"}";
  return event(type::REMOTE_SCHEMA_CHANGED, payload);
}

std::string BridgeApiMessages::ota_accepted(const std::string &id, const std::string &job_id,
                                             const std::string &target_mac, uint16_t max_chunk_size,
                                             uint8_t window_size, uint32_t next_sequence) {
  std::string payload;
  payload.reserve(256);
  payload += "{\"job_id\":\"";
  payload += escape_json(job_id);
  payload += "\",\"target_mac\":\"";
  payload += escape_json(target_mac);
  payload += "\",\"max_chunk_size\":";
  payload += std::to_string(max_chunk_size);
  payload += ",\"window_size\":";
  payload += std::to_string(window_size);
  payload += ",\"next_sequence\":";
  payload += std::to_string(next_sequence);
  payload += "}";
  return envelope(type::OTA_ACCEPTED, id, payload);
}

std::string BridgeApiMessages::ota_status_result(const std::string &id,
                                                  const std::string &status_payload_json) {
  return envelope(type::OTA_STATUS_RESULT, id, status_payload_json);
}

std::string BridgeApiMessages::ota_aborted(const std::string &id, const std::string &job_id,
                                            const std::string &reason) {
  std::string payload;
  payload.reserve(128);
  payload += "{\"job_id\":\"";
  payload += escape_json(job_id);
  payload += "\",\"reason\":\"";
  payload += escape_json(reason);
  payload += "\"}";
  return envelope(type::OTA_ABORTED, id, payload);
}

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
