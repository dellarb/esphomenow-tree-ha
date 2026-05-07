#include "bridge_api_proto_messages.h"

#include <cstring>

namespace esphome {
namespace esp_tree {
namespace bridge_api {
namespace runtime_pb {

namespace {

static uint64_t zigzag32(int32_t value) {
  return (static_cast<uint32_t>(value) << 1) ^ static_cast<uint32_t>(value >> 31);
}

static uint64_t zigzag64(int64_t value) {
  return (static_cast<uint64_t>(value) << 1) ^ static_cast<uint64_t>(value >> 63);
}

static bool read_varint(const uint8_t *data, size_t len, size_t &pos, uint64_t &out) {
  out = 0;
  uint8_t shift = 0;
  while (pos < len && shift < 64) {
    const uint8_t byte = data[pos++];
    out |= static_cast<uint64_t>(byte & 0x7FU) << shift;
    if ((byte & 0x80U) == 0) return true;
    shift += 7;
  }
  return false;
}

static bool read_field(const uint8_t *data, size_t len, size_t &pos, uint32_t &field,
                       uint8_t &wire, const uint8_t *&value, size_t &value_len,
                       uint64_t &varint_value) {
  uint64_t tag = 0;
  if (!read_varint(data, len, pos, tag)) return false;
  field = static_cast<uint32_t>(tag >> 3);
  wire = static_cast<uint8_t>(tag & 0x07U);
  value = nullptr;
  value_len = 0;
  varint_value = 0;
  if (wire == 0) {
    return read_varint(data, len, pos, varint_value);
  }
  if (wire == 1) {
    if (pos + 8 > len) return false;
    value = data + pos;
    value_len = 8;
    pos += 8;
    return true;
  }
  if (wire == 2) {
    uint64_t n = 0;
    if (!read_varint(data, len, pos, n) || n > len - pos) return false;
    value = data + pos;
    value_len = static_cast<size_t>(n);
    pos += value_len;
    return true;
  }
  return false;
}

static std::string as_string(const uint8_t *data, size_t len) {
  return std::string(reinterpret_cast<const char *>(data), len);
}

static std::string value_to_string(uint8_t wire, const uint8_t *data, size_t len, uint64_t varint_value) {
  if (wire == 0) return std::to_string(varint_value);
  if (wire == 1 && len == 8) {
    double value = 0.0;
    std::memcpy(&value, data, sizeof(value));
    return std::to_string(value);
  }
  if (wire == 2) return as_string(data, len);
  return {};
}

}  // namespace

void Writer::tag(uint32_t field, uint8_t wire_type) { raw_varint((static_cast<uint64_t>(field) << 3) | wire_type); }

void Writer::raw_varint(uint64_t value) {
  while (value >= 0x80U) {
    out_.push_back(static_cast<uint8_t>(value | 0x80U));
    value >>= 7;
  }
  out_.push_back(static_cast<uint8_t>(value));
}

void Writer::varint(uint32_t field, uint64_t value) {
  tag(field, 0);
  raw_varint(value);
}

void Writer::sint32(uint32_t field, int32_t value) {
  tag(field, 0);
  raw_varint(zigzag32(value));
}

void Writer::sint64(uint32_t field, int64_t value) {
  tag(field, 0);
  raw_varint(zigzag64(value));
}

void Writer::boolean(uint32_t field, bool value) { varint(field, value ? 1 : 0); }

void Writer::fixed64(uint32_t field, uint64_t value) {
  tag(field, 1);
  for (uint8_t i = 0; i < 8; ++i) out_.push_back(static_cast<uint8_t>((value >> (8 * i)) & 0xFFU));
}

void Writer::string(uint32_t field, const std::string &value) {
  if (value.empty()) return;
  bytes(field, reinterpret_cast<const uint8_t *>(value.data()), value.size());
}

void Writer::bytes(uint32_t field, const uint8_t *data, size_t len) {
  if (data == nullptr && len != 0) return;
  tag(field, 2);
  raw_varint(len);
  if (len > 0) out_.insert(out_.end(), data, data + len);
}

void Writer::message(uint32_t field, const std::function<void(Writer &)> &builder) {
  std::vector<uint8_t> nested;
  nested.reserve(256);
  Writer nested_writer(nested);
  builder(nested_writer);
  bytes(field, nested.data(), nested.size());
}

bool parse_envelope(const uint8_t *data, size_t len, ParsedEnvelope &out) {
  out = ParsedEnvelope{};
  size_t pos = 0;
  while (pos < len) {
    uint32_t field = 0;
    uint8_t wire = 0;
    const uint8_t *value = nullptr;
    size_t value_len = 0;
    uint64_t varint_value = 0;
    if (!read_field(data, len, pos, field, wire, value, value_len, varint_value)) return false;
    if (field == 1 && wire == 2) out.request_id = as_string(value, value_len);
    else if (field == 2 && wire == 0) out.api_version = static_cast<uint32_t>(varint_value);
    else if (field >= 10 && wire == 2) {
      out.msg_field = field;
      out.msg_data = value;
      out.msg_len = value_len;
    }
  }
  return out.msg_field != 0;
}

bool parse_auth_response(const uint8_t *data, size_t len, ParsedAuthResponse &out) {
  out = ParsedAuthResponse{};
  size_t pos = 0;
  while (pos < len) {
    uint32_t field = 0;
    uint8_t wire = 0;
    const uint8_t *value = nullptr;
    size_t value_len = 0;
    uint64_t varint_value = 0;
    if (!read_field(data, len, pos, field, wire, value, value_len, varint_value)) return false;
    if (wire != 2) continue;
    if (field == 1) out.client_kind = as_string(value, value_len);
    else if (field == 2) out.client_name = as_string(value, value_len);
    else if (field == 3) out.client_nonce.assign(value, value + value_len);
    else if (field == 4) out.hmac_sha256.assign(value, value + value_len);
  }
  return !out.client_kind.empty() && !out.client_nonce.empty() && out.hmac_sha256.size() == kRuntimeHmacBytes;
}

bool parse_command_request(const uint8_t *data, size_t len, ParsedCommandRequest &out) {
  out = ParsedCommandRequest{};
  size_t pos = 0;
  while (pos < len) {
    uint32_t field = 0;
    uint8_t wire = 0;
    const uint8_t *value = nullptr;
    size_t value_len = 0;
    uint64_t varint_value = 0;
    if (!read_field(data, len, pos, field, wire, value, value_len, varint_value)) return false;
    if (wire == 2 && field == 1) out.remote_mac = as_string(value, value_len);
    else if (wire == 2 && field == 2) out.object_id = as_string(value, value_len);
    else if (wire == 2 && field == 3) out.command = as_string(value, value_len);
    else if (wire == 2 && field == 4) {
      ParsedCommandArgument arg;
      size_t apos = 0;
      while (apos < value_len) {
        uint32_t afield = 0;
        uint8_t awire = 0;
        const uint8_t *avalue = nullptr;
        size_t avalue_len = 0;
        uint64_t avarint = 0;
        if (!read_field(value, value_len, apos, afield, awire, avalue, avalue_len, avarint)) return false;
        if (afield == 1 && awire == 2) arg.name = as_string(avalue, avalue_len);
        else if (afield >= 10) arg.value = value_to_string(awire, avalue, avalue_len, avarint);
      }
      out.args.push_back(arg);
    }
  }
  return !out.remote_mac.empty() && !out.object_id.empty() && !out.command.empty();
}

bool parse_config_command_request(const uint8_t *data, size_t len, ParsedConfigCommandRequest &out) {
  out = ParsedConfigCommandRequest{};
  size_t pos = 0;
  while (pos < len) {
    uint32_t field = 0;
    uint8_t wire = 0;
    const uint8_t *value = nullptr;
    size_t value_len = 0;
    uint64_t varint_value = 0;
    if (!read_field(data, len, pos, field, wire, value, value_len, varint_value)) return false;
    if (field == 1 && wire == 2) out.remote_mac = as_string(value, value_len);
    else if (field == 2 && wire == 2) out.command = as_string(value, value_len);
    else if (field == 3 && wire == 0) out.interval_seconds = static_cast<uint32_t>(varint_value);
    else if (field == 4 && wire == 2) out.parent_mac = as_string(value, value_len);
    else if (field == 5 && wire == 0) out.clear_parent = varint_value != 0;
    else if (field == 6 && wire == 0) out.relay_enable = varint_value != 0;
  }
  return !out.remote_mac.empty() && !out.command.empty();
}

uint64_t ping_monotonic_ms(const uint8_t *data, size_t len) {
  size_t pos = 0;
  while (pos < len) {
    uint32_t field = 0;
    uint8_t wire = 0;
    const uint8_t *value = nullptr;
    size_t value_len = 0;
    uint64_t varint_value = 0;
    if (!read_field(data, len, pos, field, wire, value, value_len, varint_value)) return 0;
    if (field == 1 && wire == 0) return varint_value;
  }
  return 0;
}

void envelope(std::vector<uint8_t> &out, const std::string &request_id, uint32_t msg_field,
              const std::function<void(Writer &)> &builder) {
  out.clear();
  Writer writer(out);
  writer.string(1, request_id);
  writer.varint(2, kRuntimeApiVersion);
  writer.message(msg_field, builder);
}

void error_envelope(std::vector<uint8_t> &out, const std::string &request_id,
                    const std::string &code, const std::string &message) {
  envelope(out, request_id, ERROR, [&](Writer &w) {
    w.string(1, code);
    w.string(2, message);
  });
}

void auth_failed_envelope(std::vector<uint8_t> &out, const std::string &request_id,
                          const std::string &code, const std::string &message) {
  envelope(out, request_id, AUTH_FAILED, [&](Writer &w) {
    w.string(1, code);
    w.string(2, message);
  });
}

}  // namespace runtime_pb
}  // namespace bridge_api
}  // namespace esp_tree
}  // namespace esphome
