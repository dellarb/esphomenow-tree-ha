#include "bridge_api_router.h"

#include <cstdio>
#include <cstring>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

namespace {

static bool skip_ws(const char *&p, const char *end) {
  while (p < end && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r'))
    ++p;
  return p < end;
}

static bool match_char(const char *&p, const char *end, char expected) {
  if (p >= end || *p != expected) return false;
  ++p;
  return true;
}

static bool read_number(const char *&p, const char *end, int &out) {
  if (p >= end) return false;
  bool negative = false;
  if (*p == '-') {
    negative = true;
    ++p;
  }
  if (p >= end || *p < '0' || *p > '9') return false;
  int value = 0;
  while (p < end && *p >= '0' && *p <= '9') {
    value = value * 10 + (*p - '0');
    ++p;
  }
  out = negative ? -value : value;
  return true;
}

static bool read_string(const char *&p, const char *end, std::string &out) {
  if (p >= end || *p != '"') return false;
  ++p;
  out.clear();
  while (p < end) {
    if (*p == '"') {
      ++p;
      return true;
    }
    if (*p == '\\') {
      ++p;
      if (p >= end) return false;
      switch (*p) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          ++p;
          uint32_t codepoint = 0;
          for (int i = 0; i < 4; ++i) {
            if (p >= end) return false;
            uint8_t nibble = 0;
            if (*p >= '0' && *p <= '9')
              nibble = static_cast<uint8_t>(*p - '0');
            else if (*p >= 'a' && *p <= 'f')
              nibble = static_cast<uint8_t>(*p - 'a' + 10);
            else if (*p >= 'A' && *p <= 'F')
              nibble = static_cast<uint8_t>(*p - 'A' + 10);
            else
              return false;
            codepoint = (codepoint << 4) | nibble;
            ++p;
          }
          --p;
          if (codepoint <= 0x7F) {
            out += static_cast<char>(codepoint);
          } else if (codepoint <= 0x7FF) {
            out += static_cast<char>(0xC0 | (codepoint >> 6));
            out += static_cast<char>(0x80 | (codepoint & 0x3F));
          } else {
            out += static_cast<char>(0xE0 | (codepoint >> 12));
            out += static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F));
            out += static_cast<char>(0x80 | (codepoint & 0x3F));
          }
          break;
        }
        default: return false;
      }
      ++p;
    } else {
      out += *p;
      ++p;
    }
  }
  return false;
}

static bool skip_value(const char *&p, const char *end) {
  if (p >= end) return false;
  if (*p == '"') {
    std::string dummy;
    return read_string(p, end, dummy);
  }
  if (*p == '{') {
    int depth = 1;
    ++p;
    while (p < end && depth > 0) {
      if (*p == '"') {
        std::string dummy;
        if (!read_string(p, end, dummy)) return false;
        continue;
      }
      if (*p == '{') ++depth;
      if (*p == '}') --depth;
      ++p;
    }
    return depth == 0;
  }
  if (*p == '[') {
    int depth = 1;
    ++p;
    while (p < end && depth > 0) {
      if (*p == '"') {
        std::string dummy;
        if (!read_string(p, end, dummy)) return false;
        continue;
      }
      if (*p == '[') ++depth;
      if (*p == ']') --depth;
      ++p;
    }
    return depth == 0;
  }
  while (p < end && *p != ',' && *p != '}' && *p != ']') ++p;
  return true;
}

}  // namespace

void BridgeApiRouter::handle_authenticated_text(uint32_t client_id, const std::string &text) {
  ApiEnvelope envelope;
  ParseStatus status = parse_envelope(text, envelope);
  if (status != ParseStatus::OK) {
    const char *code = nullptr;
    switch (status) {
      case ParseStatus::INVALID_JSON: code = error::INVALID_JSON; break;
      case ParseStatus::INVALID_ENVELOPE: code = error::INVALID_ENVELOPE; break;
      case ParseStatus::UNSUPPORTED_VERSION: code = error::UNSUPPORTED_VERSION; break;
      case ParseStatus::UNKNOWN_TYPE: code = error::UNKNOWN_TYPE; break;
      default: code = error::INVALID_JSON; break;
    }
    send_error_(client_id, envelope.id, code, "Invalid or unsupported request envelope");
    return;
  }
  route_request_(client_id, envelope);
}

ParseStatus BridgeApiRouter::parse_envelope(const std::string &text, ApiEnvelope &envelope) const {
  envelope = ApiEnvelope{};
  const char *p = text.c_str();
  const char *end = p + text.size();

  skip_ws(p, end);
  if (p >= end || *p != '{') return ParseStatus::INVALID_JSON;

  if (!match_char(p, end, '{')) return ParseStatus::INVALID_JSON;
  skip_ws(p, end);

  bool has_v = false, has_type = false;
  const char *payload_start = nullptr;
  const char *payload_end = nullptr;

  while (p < end && *p != '}') {
    std::string key;
    if (!read_string(p, end, key)) return ParseStatus::INVALID_JSON;
    skip_ws(p, end);
    if (!match_char(p, end, ':')) return ParseStatus::INVALID_JSON;
    skip_ws(p, end);

    if (key == "v") {
      int version = 0;
      if (!read_number(p, end, version)) return ParseStatus::INVALID_JSON;
      envelope.version = static_cast<uint8_t>(version);
      if (version != kApiVersion) return ParseStatus::UNSUPPORTED_VERSION;
      has_v = true;
    } else if (key == "type") {
      std::string type_val;
      if (!read_string(p, end, type_val)) return ParseStatus::INVALID_JSON;
      if (type_val.empty()) return ParseStatus::INVALID_ENVELOPE;
      envelope.type = type_val;
      has_type = true;
    } else if (key == "id") {
      std::string id_val;
      if (!read_string(p, end, id_val)) return ParseStatus::INVALID_JSON;
      envelope.id = id_val;
    } else if (key == "payload") {
      payload_start = p;
      if (!skip_value(p, end)) return ParseStatus::INVALID_JSON;
      payload_end = p;
    } else {
      if (!skip_value(p, end)) return ParseStatus::INVALID_JSON;
    }

    skip_ws(p, end);
    if (p < end && *p == ',') ++p;
    skip_ws(p, end);
  }

  if (!has_v || !has_type) return ParseStatus::INVALID_ENVELOPE;

  if (payload_start != nullptr && payload_end != nullptr && payload_end > payload_start) {
    envelope.payload_json.assign(payload_start, payload_end - payload_start);
  } else {
    envelope.payload_json = "{}";
  }

  return ParseStatus::OK;
}

void BridgeApiRouter::route_request_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (envelope.type == type::BRIDGE_INFO) {
    handle_bridge_info_(client_id, envelope);
  } else if (envelope.type == type::TOPOLOGY_GET) {
    handle_topology_get_(client_id, envelope);
  } else {
    send_error_(client_id, envelope.id, error::UNKNOWN_TYPE, "Unsupported message type: " + envelope.type);
  }
}

void BridgeApiRouter::handle_bridge_info_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }
  std::string payload = bridge_->api_bridge_info_json();
  if (payload.empty()) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not ready");
    return;
  }
  std::string response = BridgeApiMessages::bridge_info_result(envelope.id, payload);
  if (outbound_ != nullptr) {
    outbound_->send_text(client_id, response);
  }
}

void BridgeApiRouter::handle_topology_get_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }
  std::string payload = bridge_->api_topology_snapshot_json(envelope.payload_json);
  if (payload.empty()) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge failed to generate topology snapshot");
    return;
  }
  std::string response = BridgeApiMessages::topology_snapshot(envelope.id, payload);
  if (outbound_ != nullptr) {
    outbound_->send_text(client_id, response);
  }
}

void BridgeApiRouter::send_error_(uint32_t client_id, const std::string &id, const char *code,
                                  const std::string &message) {
  std::string error_json = BridgeApiMessages::error(id, code, message);
  if (outbound_ != nullptr) {
    outbound_->send_text(client_id, error_json);
  }
}

void BridgeApiRouter::broadcast_event_(const std::string &event_json) {
  if (outbound_ != nullptr && active_client_id_ != 0) {
    outbound_->send_text(active_client_id_, event_json);
  }
}

void BridgeApiRouter::emit_heartbeat(uint32_t uptime_ms) {
  broadcast_event_(BridgeApiMessages::bridge_heartbeat(uptime_ms));
}

void BridgeApiRouter::emit_topology_changed(const char *reason, const uint8_t *mac) {
  broadcast_event_(BridgeApiMessages::topology_changed(reason, mac));
}

void BridgeApiRouter::emit_remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                               uint32_t last_seen_ms) {
  broadcast_event_(BridgeApiMessages::remote_availability(mac, online, reason, rssi, last_seen_ms));
}

void BridgeApiRouter::emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity,
                                        const std::vector<uint8_t> &value, espnow_field_type_t type) {
  if (value.empty()) return;
  char mac_buf[20];
  snprintf(mac_buf, sizeof(mac_buf), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4],
           mac[5]);
  std::string mac_colon = mac_buf;

  std::string entity_key = entity.entity_id.empty() ? entity.entity_name : entity.entity_id;
  if (entity_key.empty()) return;

  std::string state_val = BridgeApiMessages::state_value_json(type, value.data(), value.size(),
                                                              entity.entity_options);

  std::string payload;
  payload.reserve(256);
  payload += "{\"mac\":\"";
  payload += mac_colon;
  payload += "\",\"state\":{\"";
  payload += BridgeApiMessages::escape_json(entity_key);
  payload += "\":";
  payload += state_val;
  payload += "}}";
  broadcast_event_(BridgeApiMessages::event(type::REMOTE_STATE, payload));
}

void BridgeApiRouter::emit_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash) {
  broadcast_event_(BridgeApiMessages::remote_schema_changed(mac, schema_hash));
}

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
