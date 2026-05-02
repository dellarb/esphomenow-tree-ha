#include "bridge_api_router.h"
#include "bridge_api_ota_frame.h"

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

bool BridgeApiRouter::json_get_string_field_(const std::string &json, const char *field, std::string &out) const {
  const std::string needle = std::string("\"") + field + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return false;
  pos = json.find(':', pos + needle.size());
  if (pos == std::string::npos) return false;
  ++pos;
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\r' || json[pos] == '\n')) ++pos;
  if (pos >= json.size() || json[pos] != '"') return false;
  ++pos;

  out.clear();
  while (pos < json.size()) {
    char ch = json[pos++];
    if (ch == '"') return true;
    if (ch != '\\') {
      out += ch;
      continue;
    }
    if (pos >= json.size()) return false;
    ch = json[pos++];
    switch (ch) {
      case '"': out += '"'; break;
      case '\\': out += '\\'; break;
      case '/': out += '/'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      default: return false;
    }
  }
  return false;
}

bool BridgeApiRouter::json_get_int_field_(const std::string &json, const char *field, int &out) const {
  const std::string needle = std::string("\"") + field + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return false;
  pos = json.find(':', pos + needle.size());
  if (pos == std::string::npos) return false;
  ++pos;
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\r' || json[pos] == '\n')) ++pos;
  if (pos >= json.size()) return false;
  if (json[pos] == '"') return false;

  char *end = nullptr;
  const long val = strtol(json.c_str() + pos, &end, 10);
  if (end == json.c_str() + pos) return false;
  out = static_cast<int>(val);
  return true;
}

bool BridgeApiRouter::parse_ota_start_payload_(const std::string &payload_json,
                                                std::string &target_mac, uint32_t &file_size,
                                                std::string &md5_hex, std::string &sha256_hex,
                                                std::string &filename, uint16_t &preferred_chunk_size) const {
  if (!json_get_string_field_(payload_json, "target_mac", target_mac)) return false;

  int size_int = 0;
  if (!json_get_int_field_(payload_json, "size", size_int) || size_int <= 0) return false;
  file_size = static_cast<uint32_t>(size_int);

  if (!json_get_string_field_(payload_json, "md5", md5_hex)) return false;

  json_get_string_field_(payload_json, "sha256", sha256_hex);

  json_get_string_field_(payload_json, "filename", filename);

  int pcs = 0;
  json_get_int_field_(payload_json, "preferred_chunk_size", pcs);
  preferred_chunk_size = static_cast<uint16_t>(pcs > 0 ? pcs : 0);

  return true;
}

bool BridgeApiRouter::parse_ota_abort_payload_(const std::string &payload_json,
                                                std::string &job_id, std::string &reason) const {
  if (!json_get_string_field_(payload_json, "job_id", job_id)) return false;
  json_get_string_field_(payload_json, "reason", reason);
  return true;
}

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
  } else if (envelope.type == type::OTA_START) {
    handle_ota_start_(client_id, envelope);
  } else if (envelope.type == type::OTA_STATUS) {
    handle_ota_status_(client_id, envelope);
  } else if (envelope.type == type::OTA_ABORT) {
    handle_ota_abort_(client_id, envelope);
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

void BridgeApiRouter::handle_ota_start_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }

  std::string target_mac;
  uint32_t file_size = 0;
  std::string md5_hex;
  std::string sha256_hex;
  std::string filename;
  uint16_t preferred_chunk_size = 0;

  if (!parse_ota_start_payload_(envelope.payload_json, target_mac, file_size, md5_hex, sha256_hex,
                                 filename, preferred_chunk_size)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing or invalid ota.start fields");
    return;
  }

  std::string job_id;
  uint16_t max_chunk_size_out = 0;
  uint8_t window_size_out = 0;

  if (!bridge_->api_ota_start(target_mac, file_size, md5_hex, sha256_hex, filename,
                              preferred_chunk_size, job_id, max_chunk_size_out, window_size_out,
                              envelope.id)) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Failed to start OTA transfer");
    return;
  }
}

void BridgeApiRouter::handle_ota_status_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }
  std::string status_payload = bridge_->api_ota_status_json();
  std::string response = BridgeApiMessages::ota_status_result(envelope.id, status_payload);
  if (outbound_ != nullptr) {
    outbound_->send_text(client_id, response);
  }
}

void BridgeApiRouter::handle_ota_abort_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }

  std::string job_id;
  std::string reason;

  if (!parse_ota_abort_payload_(envelope.payload_json, job_id, reason)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing job_id in ota.abort payload");
    return;
  }

  if (reason.empty()) reason = "user";

  bool had_job = bridge_->api_ota_abort(job_id, reason);
  std::string response = BridgeApiMessages::ota_aborted(envelope.id, job_id,
                                                         reason);
  if (outbound_ != nullptr) {
    outbound_->send_text(client_id, response);
  }
  (void) had_job;
}

void BridgeApiRouter::handle_binary_chunk(uint32_t client_id, const uint8_t *data, size_t len) {
  if (bridge_ == nullptr || outbound_ == nullptr) return;

  if (!bridge_->api_ota_has_active_job()) {
    send_error_(client_id, "", error::OTA_NOT_ACTIVE, "No active OTA job");
    return;
  }

  OtaChunkView view;
  OtaChunkDecodeStatus status = BridgeApiOtaFrame::decode(data, len, kMaxWsChunkSize, view);
  if (status != OtaChunkDecodeStatus::OK) {
    send_error_(client_id, "", error::OTA_INVALID_CHUNK, "Invalid binary chunk frame");
    return;
  }

  if (!bridge_->api_ota_inject_chunk(view.header.sequence, view.payload, view.payload_len)) {
    send_error_(client_id, "", error::OTA_INVALID_CHUNK, "Chunk rejected by OTA manager");
    return;
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
