#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace esphome {
namespace esp_tree {
namespace bridge_api {
namespace runtime_pb {

static constexpr uint32_t kRuntimeApiVersion = 2;
static constexpr const char *kRuntimeProtocol = "esp-tree-pb";
static constexpr const char *kRuntimeProtocolVersionLabel = "v2";
static constexpr const char *kRuntimeWebSocketPath = "/esp-tree/v2/pb";
static constexpr size_t kRuntimeServerNonceBytes = 16;
static constexpr size_t kRuntimeHmacBytes = 32;
static constexpr size_t kRuntimeMaxFrameBytes = 65536;
static constexpr uint32_t kRuntimeHeartbeatIntervalMs = 30000;

enum EnvelopeField : uint32_t {
  AUTH_CHALLENGE = 10,
  AUTH_RESPONSE = 11,
  AUTH_OK = 12,
  AUTH_FAILED = 13,
  CLIENT_HELLO = 14,
  FULL_SNAPSHOT = 15,
  EVENT_BATCH = 16,
  COMMAND_REQUEST = 17,
  COMMAND_RESULT = 18,
  CONFIG_COMMAND_REQUEST = 19,
  CONFIG_COMMAND_RESULT = 20,
  PING = 21,
  PONG = 22,
  ERROR = 99,
};

enum CommandStatus : uint32_t {
  COMMAND_STATUS_UNSPECIFIED = 0,
  COMMAND_STATUS_ACCEPTED = 1,
  COMMAND_STATUS_DELIVERED = 2,
  COMMAND_STATUS_FAILED = 3,
  COMMAND_STATUS_UNAVAILABLE = 4,
  COMMAND_STATUS_UNSUPPORTED = 5,
  COMMAND_STATUS_TIMEOUT = 6,
};

class Writer {
 public:
  explicit Writer(std::vector<uint8_t> &out) : out_(out) {}

  void varint(uint32_t field, uint64_t value);
  void sint32(uint32_t field, int32_t value);
  void sint64(uint32_t field, int64_t value);
  void boolean(uint32_t field, bool value);
  void fixed64(uint32_t field, uint64_t value);
  void string(uint32_t field, const std::string &value);
  void bytes(uint32_t field, const uint8_t *data, size_t len);
  void message(uint32_t field, const std::function<void(Writer &)> &builder);

 private:
  void tag(uint32_t field, uint8_t wire_type);
  void raw_varint(uint64_t value);
  std::vector<uint8_t> &out_;
};

struct ParsedEnvelope {
  std::string request_id;
  uint32_t api_version{0};
  uint32_t msg_field{0};
  const uint8_t *msg_data{nullptr};
  size_t msg_len{0};
};

struct ParsedAuthResponse {
  std::string client_kind;
  std::string client_name;
  std::vector<uint8_t> client_nonce;
  std::vector<uint8_t> hmac_sha256;
};

struct ParsedCommandArgument {
  std::string name;
  std::string value;
};

struct ParsedCommandRequest {
  std::string remote_mac;
  std::string object_id;
  std::string command;
  std::vector<ParsedCommandArgument> args;
};

struct ParsedConfigCommandRequest {
  std::string remote_mac;
  std::string command;
  uint32_t interval_seconds{0};
  std::string parent_mac;
  bool clear_parent{false};
  bool relay_enable{false};
};

bool parse_envelope(const uint8_t *data, size_t len, ParsedEnvelope &out);
bool parse_auth_response(const uint8_t *data, size_t len, ParsedAuthResponse &out);
bool parse_command_request(const uint8_t *data, size_t len, ParsedCommandRequest &out);
bool parse_config_command_request(const uint8_t *data, size_t len, ParsedConfigCommandRequest &out);
uint64_t ping_monotonic_ms(const uint8_t *data, size_t len);

void envelope(std::vector<uint8_t> &out, const std::string &request_id, uint32_t msg_field,
              const std::function<void(Writer &)> &builder);
void error_envelope(std::vector<uint8_t> &out, const std::string &request_id,
                    const std::string &code, const std::string &message);
void auth_failed_envelope(std::vector<uint8_t> &out, const std::string &request_id,
                          const std::string &code, const std::string &message);

}  // namespace runtime_pb
}  // namespace bridge_api
}  // namespace esp_tree
}  // namespace esphome
