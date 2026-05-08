#include "bridge_api_router.h"
#include "bridge_api_ota_frame.h"

#include <cctype>
#include <cstdio>
#include <cstring>
#include <vector>

namespace esphome {
namespace esp_tree {
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

static bool is_valid_mac_format_(const std::string &mac_colon) {
  if (mac_colon.size() != 17) return false;
  for (size_t i = 0; i < 17; ++i) {
    if (i == 2 || i == 5 || i == 8 || i == 11 || i == 14) {
      if (mac_colon[i] != ':') return false;
    } else {
      char c = mac_colon[i];
      if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))) return false;
    }
  }
  return true;
}

static int parse_hex_nibble_(char ch) {
  if (ch >= '0' && ch <= '9') return ch - '0';
  if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
  if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
  return -1;
}

static bool parse_mac_bytes_(const std::string &input, uint8_t out[6]) {
  std::string compact;
  compact.reserve(12);
  for (char ch : input) {
    if (ch == ':' || ch == '-' || ch == ' ') continue;
    if (!std::isxdigit(static_cast<unsigned char>(ch))) return false;
    compact += ch;
  }
  if (compact.size() != 12) return false;
  for (size_t i = 0; i < 6; ++i) {
    const int hi = parse_hex_nibble_(compact[i * 2]);
    const int lo = parse_hex_nibble_(compact[i * 2 + 1]);
    if (hi < 0 || lo < 0) return false;
    out[i] = static_cast<uint8_t>((hi << 4) | lo);
  }
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

bool BridgeApiRouter::json_get_bool_field_(const std::string &json, const char *field, bool &out) const {
  const std::string needle = std::string("\"") + field + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return false;
  pos = json.find(':', pos + needle.size());
  if (pos == std::string::npos) return false;
  ++pos;
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\r' || json[pos] == '\n')) ++pos;
  if (json.compare(pos, 4, "true") == 0) {
    out = true;
    return true;
  }
  if (json.compare(pos, 5, "false") == 0) {
    out = false;
    return true;
  }
  return false;
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

  if (p >= end || *p != '}') return ParseStatus::INVALID_JSON;
  ++p;
  skip_ws(p, end);
  if (p != end) return ParseStatus::INVALID_JSON;

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
  } else if (envelope.type == type::NODE_SCHEMA_GET) {
    handle_node_schema_get_(client_id, envelope);
  } else if (envelope.type == type::NODE_STATE_GET) {
    handle_node_state_get_(client_id, envelope);
  } else if (envelope.type == type::NODE_STATE_SUBSCRIBE) {
    handle_node_state_subscribe_(client_id, envelope);
  } else if (envelope.type == type::NODE_STATE_UNSUBSCRIBE) {
    handle_node_state_unsubscribe_(client_id, envelope);
  } else if (envelope.type == type::NODE_CONFIG) {
    handle_node_config_(client_id, envelope);
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
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
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
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
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

  if (!bridge_->api_ota_start(target_mac, file_size, md5_hex, sha256_hex, filename,
                                preferred_chunk_size, job_id, max_chunk_size_out,
                                envelope.id)) {
    const char *err = bridge_->api_ota_start_error();
    const char *code = error::BRIDGE_NOT_READY;
    if (strcmp(err, "remote not found or offline") == 0) {
      code = error::REMOTE_NOT_FOUND;
    } else if (strcmp(err, "ota busy") == 0) {
      code = error::OTA_BUSY;
    } else if (strcmp(err, "invalid target_mac") == 0 ||
               strcmp(err, "invalid md5 hex") == 0) {
      code = error::INVALID_PAYLOAD;
    }
    send_error_(client_id, envelope.id, code, err);
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
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
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
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
  }
  (void) had_job;
}

std::string BridgeApiRouter::mac_to_node_key_(const std::string &mac_colon) {
  std::string node_key;
  node_key.reserve(12);
  for (char ch : mac_colon) {
    if (ch != ':') node_key += ch;
  }
  return node_key;
}

bool BridgeApiRouter::is_node_subscribed_(uint32_t client_id, const std::string &node_key) {
  if (client_subscriptions_ == nullptr) return false;
  std::lock_guard<std::mutex> lock(subscription_mutex_);
  auto it = client_subscriptions_->find(client_id);
  if (it == client_subscriptions_->end()) return false;
  return it->second.state_subscribed_nodes.count(node_key) > 0;
}

void BridgeApiRouter::subscribe_node_(uint32_t client_id, const std::string &node_key) {
  if (client_subscriptions_ == nullptr) return;
  std::lock_guard<std::mutex> lock(subscription_mutex_);
  (*client_subscriptions_)[client_id].state_subscribed_nodes.insert(node_key);
}

void BridgeApiRouter::unsubscribe_node_(uint32_t client_id, const std::string &node_key) {
  if (client_subscriptions_ == nullptr) return;
  std::lock_guard<std::mutex> lock(subscription_mutex_);
  auto it = client_subscriptions_->find(client_id);
  if (it != client_subscriptions_->end()) {
    it->second.state_subscribed_nodes.erase(node_key);
  }
}

void BridgeApiRouter::clear_client_subscriptions_(uint32_t client_id) {
  if (client_subscriptions_ == nullptr) return;
  std::lock_guard<std::mutex> lock(subscription_mutex_);
  client_subscriptions_->erase(client_id);
}

void BridgeApiRouter::handle_node_schema_get_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }

  std::string mac_colon;
  if (!json_get_string_field_(envelope.payload_json, "mac", mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing mac field");
    return;
  }

  if (!is_valid_mac_format_(mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Invalid mac format");
    return;
  }

  std::string schema_payload = bridge_->api_node_schema_json(mac_colon);
  std::string response = BridgeApiMessages::node_schema_result(envelope.id, mac_colon, schema_payload);
  if (outbound_ != nullptr) {
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
  }
}

void BridgeApiRouter::handle_node_state_get_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }

  std::string mac_colon;
  if (!json_get_string_field_(envelope.payload_json, "mac", mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing mac field");
    return;
  }

  if (!is_valid_mac_format_(mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Invalid mac format");
    return;
  }

  std::string state_payload = bridge_->api_node_state_json(mac_colon);
  std::string response = BridgeApiMessages::node_state_result(envelope.id, mac_colon, state_payload);
  if (outbound_ != nullptr) {
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
  }
}

void BridgeApiRouter::handle_node_state_subscribe_(uint32_t client_id, const ApiEnvelope &envelope) {
  std::string mac_colon;
  if (!json_get_string_field_(envelope.payload_json, "mac", mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing mac field");
    return;
  }

  if (!is_valid_mac_format_(mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Invalid mac format");
    return;
  }

  std::string node_key = mac_to_node_key_(mac_colon);

  subscribe_node_(client_id, node_key);

  std::string response = BridgeApiMessages::node_state_subscribed(envelope.id, mac_colon);
  if (outbound_ != nullptr) {
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
  }
}

void BridgeApiRouter::handle_node_state_unsubscribe_(uint32_t client_id, const ApiEnvelope &envelope) {
  std::string mac_colon;
  if (!json_get_string_field_(envelope.payload_json, "mac", mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing mac field");
    return;
  }

  if (!is_valid_mac_format_(mac_colon)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Invalid mac format");
    return;
  }

  std::string node_key = mac_to_node_key_(mac_colon);

  unsubscribe_node_(client_id, node_key);

  std::string response = BridgeApiMessages::node_state_unsubscribed(envelope.id, mac_colon);
  if (outbound_ != nullptr) {
    if (!outbound_->send_text(client_id, response)) {
      outbound_->close_client(client_id);
    }
  }
}

void BridgeApiRouter::handle_node_config_(uint32_t client_id, const ApiEnvelope &envelope) {
  if (bridge_ == nullptr) {
    send_error_(client_id, envelope.id, error::BRIDGE_NOT_READY, "Bridge not available");
    return;
  }

  std::string mac_colon;
  std::string command_name;
  if (!json_get_string_field_(envelope.payload_json, "mac", mac_colon) ||
      !json_get_string_field_(envelope.payload_json, "command", command_name)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Missing mac or command field");
    return;
  }

  uint8_t target_mac[6]{};
  if (!parse_mac_bytes_(mac_colon, target_mac)) {
    send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Invalid mac format");
    return;
  }
  (void) target_mac;

  uint8_t command = 0;
  std::vector<uint8_t> config_payload;

  if (command_name == "reboot") {
    command = CFG_CMD_REBOOT;
  } else if (command_name == "heartbeat_interval") {
    command = CFG_CMD_HEARTBEAT_INTERVAL;
    int interval = 0;
    if (!json_get_int_field_(envelope.payload_json, "interval_seconds", interval) || interval < 5 || interval > 3600) {
      send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "interval_seconds must be 5-3600");
      return;
    }
    config_payload.push_back(static_cast<uint8_t>(interval & 0xFF));
    config_payload.push_back(static_cast<uint8_t>((interval >> 8) & 0xFF));
    config_payload.push_back(static_cast<uint8_t>((interval >> 16) & 0xFF));
    config_payload.push_back(static_cast<uint8_t>((interval >> 24) & 0xFF));
  } else if (command_name == "force_rediscover") {
    command = CFG_CMD_FORCE_REDISCOVER;
  } else if (command_name == "set_parent_mac") {
    command = CFG_CMD_SET_PARENT_MAC;
    std::string parent_mac_str;
    uint8_t parent_mac[6]{};
    if (!json_get_string_field_(envelope.payload_json, "parent_mac", parent_mac_str) ||
        !parse_mac_bytes_(parent_mac_str, parent_mac)) {
      send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "Invalid parent_mac format");
      return;
    }
    bool clear = true;
    json_get_bool_field_(envelope.payload_json, "clear", clear);
    config_payload.push_back(clear ? SET_PARENT_MAC_FLAG_CLEAR : 0);
    config_payload.insert(config_payload.end(), parent_mac, parent_mac + 6);
  } else if (command_name == "relay") {
    command = CFG_CMD_RELAY;
    bool enable = false;
    if (!json_get_bool_field_(envelope.payload_json, "enable", enable)) {
      send_error_(client_id, envelope.id, error::INVALID_PAYLOAD, "enable must be boolean");
      return;
    }
    config_payload.push_back(enable ? 1 : 0);

    const std::string request_id = envelope.id;
    NodeConfigCallback callback = [this, client_id, request_id, enable](const std::string &result,
                                                                const std::string &command_result) {
      std::string msg;
      if (result == config_result::OK) {
        msg = enable ? "Relay Enabled Successfully" : "Relay Disabled Successfully";
      } else if (result == config_result::TIMEOUT) {
        msg = "Relay Command Timeout";
      } else if (result == config_result::NO_SESSION) {
        msg = "Remote Not Connected";
      } else if (result == config_result::REJECTED) {
        msg = "Relay Command Rejected";
      } else if (result == config_result::BUSY) {
        msg = "Relay Busy";
      } else {
        msg = "Relay Command Failed";
      }
      std::string response = BridgeApiMessages::node_config_result(request_id, msg, command_result);
      if (outbound_ != nullptr) {
        if (!outbound_->send_text(client_id, response)) {
          outbound_->close_client(client_id);
        }
      }
    };

    std::string immediate_result;
    if (!bridge_->api_node_config_start(mac_colon, command, config_payload, command_name, callback, immediate_result)) {
      if (immediate_result.empty()) immediate_result = "Remote Not Connected";
      std::string response = BridgeApiMessages::node_config_result(envelope.id, immediate_result, command_name);
      if (outbound_ != nullptr) {
        if (!outbound_->send_text(client_id, response)) {
          outbound_->close_client(client_id);
        }
      }
    }
    return;
  }

  const std::string request_id = envelope.id;
  NodeConfigCallback callback = [this, client_id, request_id](const std::string &result,
                                                              const std::string &command_result) {
    std::string response = BridgeApiMessages::node_config_result(request_id, result, command_result);
    if (outbound_ != nullptr) {
      if (!outbound_->send_text(client_id, response)) {
        outbound_->close_client(client_id);
      }
    }
  };

  std::string immediate_result;
  if (!bridge_->api_node_config_start(mac_colon, command, config_payload, command_name, callback, immediate_result)) {
    if (immediate_result.empty()) immediate_result = config_result::NO_SESSION;
    std::string response = BridgeApiMessages::node_config_result(envelope.id, immediate_result, command_name);
    if (outbound_ != nullptr) {
      if (!outbound_->send_text(client_id, response)) {
        outbound_->close_client(client_id);
      }
    }
  }
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
    if (!outbound_->send_text(client_id, error_json)) {
      outbound_->close_client(client_id);
    }
  }
}

void BridgeApiRouter::broadcast_event_(const std::string &event_json) {
  if (outbound_ != nullptr && active_client_id_ != 0) {
    if (!outbound_->send_text(active_client_id_, event_json)) {
      outbound_->close_client(active_client_id_);
    }
  }
}

void BridgeApiRouter::emit_heartbeat(uint32_t uptime_ms) {
  broadcast_event_(BridgeApiMessages::bridge_heartbeat(uptime_ms));
}

void BridgeApiRouter::emit_topology_changed(const char *reason, const uint8_t *mac) {
  broadcast_event_(BridgeApiMessages::topology_changed(reason, mac));
}

void BridgeApiRouter::emit_remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                                 uint32_t offline_s, const uint8_t *parent_mac,
                                                 uint8_t hop_count) {
  broadcast_event_(BridgeApiMessages::remote_availability(mac, online, reason, rssi, offline_s,
                                                          parent_mac, hop_count));
}

void BridgeApiRouter::emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity,
                                        const std::vector<uint8_t> &value, espnow_field_type_t type) {
  if (value.empty()) return;
  char mac_buf[20];
  snprintf(mac_buf, sizeof(mac_buf), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4],
           mac[5]);
  std::string mac_colon = mac_buf;
  std::string node_key = mac_to_node_key_(mac_colon);

  if (client_subscriptions_ != nullptr && active_client_id_ != 0 &&
      !is_node_subscribed_(active_client_id_, node_key)) {
    return;
  }

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
  char mac_buf[20];
  snprintf(mac_buf, sizeof(mac_buf), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4],
           mac[5]);
  std::string mac_colon = mac_buf;
  std::string node_key = mac_to_node_key_(mac_colon);

  if (client_subscriptions_ != nullptr && active_client_id_ != 0 &&
      !is_node_subscribed_(active_client_id_, node_key)) {
    return;
  }

  broadcast_event_(BridgeApiMessages::remote_schema_changed(mac, schema_hash));
}

}  // namespace bridge_api
}  // namespace esp_tree
}  // namespace esphome
