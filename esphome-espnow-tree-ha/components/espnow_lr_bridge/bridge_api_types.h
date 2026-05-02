#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

static constexpr uint8_t kApiVersion = 1;
static constexpr const char *kProtocolName = "espnow-tree-ws";
static constexpr const char *kProtocolVersionLabel = "v1";
static constexpr const char *kWebSocketPath = "/espnow-tree/v1/ws";

static constexpr size_t kServerNonceBytes = 16;
static constexpr size_t kHmacDigestBytes = 32;
static constexpr size_t kHmacHexChars = kHmacDigestBytes * 2;
static constexpr uint32_t kHeartbeatIntervalMs = 30000;
static constexpr size_t kMaxJsonBytes = 8192;
static constexpr size_t kMaxWsChunkSize = 2048;
static constexpr uint8_t kOtaWindowSize = 4;

namespace type {
static constexpr const char *AUTH_CHALLENGE = "auth.challenge";
static constexpr const char *AUTH_RESPONSE = "auth.response";
static constexpr const char *AUTH_OK = "auth.ok";
static constexpr const char *ERROR = "error";
static constexpr const char *BRIDGE_INFO = "bridge.info";
static constexpr const char *BRIDGE_INFO_RESULT = "bridge.info.result";
static constexpr const char *BRIDGE_HEARTBEAT = "bridge.heartbeat";
static constexpr const char *TOPOLOGY_GET = "topology.get";
static constexpr const char *TOPOLOGY_SNAPSHOT = "topology.snapshot";
static constexpr const char *TOPOLOGY_CHANGED = "topology.changed";
static constexpr const char *REMOTE_AVAILABILITY = "remote.availability";
static constexpr const char *REMOTE_STATE = "remote.state";
static constexpr const char *REMOTE_SCHEMA_CHANGED = "remote.schema_changed";
static constexpr const char *OTA_START = "ota.start";
static constexpr const char *OTA_ACCEPTED = "ota.accepted";
static constexpr const char *OTA_STATUS = "ota.status";
static constexpr const char *OTA_STATUS_RESULT = "ota.status.result";
static constexpr const char *OTA_ABORT = "ota.abort";
static constexpr const char *OTA_ABORTED = "ota.aborted";
}  // namespace type

namespace error {
static constexpr const char *AUTH_FAILED = "auth_failed";
static constexpr const char *INVALID_JSON = "invalid_json";
static constexpr const char *INVALID_ENVELOPE = "invalid_envelope";
static constexpr const char *UNSUPPORTED_VERSION = "unsupported_version";
static constexpr const char *UNKNOWN_TYPE = "unknown_type";
static constexpr const char *INVALID_PAYLOAD = "invalid_payload";
static constexpr const char *BRIDGE_NOT_READY = "bridge_not_ready";
static constexpr const char *REMOTE_NOT_FOUND = "remote_not_found";
static constexpr const char *OTA_BUSY = "ota_busy";
static constexpr const char *OTA_NOT_ACTIVE = "ota_not_active";
static constexpr const char *OTA_INVALID_CHUNK = "ota_invalid_chunk";
static constexpr const char *OTA_ABORTED = "ota_aborted";
static constexpr const char *CLIENT_ALREADY_CONNECTED = "client_already_connected";
static constexpr const char *INTERNAL_ERROR = "internal_error";
}  // namespace error

enum class ClientAuthState : uint8_t {
  DISCONNECTED = 0,
  CONNECTED_UNAUTHENTICATED,
  AUTHENTICATED,
  CLOSED,
};

enum class ParseStatus : uint8_t {
  OK = 0,
  INVALID_JSON,
  INVALID_ENVELOPE,
  UNSUPPORTED_VERSION,
  UNKNOWN_TYPE,
};

enum class OtaJobState : uint8_t {
  IDLE,
  WAITING_FOR_LEAF,
  TRANSFERRING,
  VERIFYING,
  SUCCESS,
  FAILED,
  ABORTED,
};

inline const char *ota_job_state_string(OtaJobState state) {
  switch (state) {
    case OtaJobState::IDLE:
      return "idle";
    case OtaJobState::WAITING_FOR_LEAF:
      return "waiting_for_leaf";
    case OtaJobState::TRANSFERRING:
      return "transferring";
    case OtaJobState::VERIFYING:
      return "verifying";
    case OtaJobState::SUCCESS:
      return "success";
    case OtaJobState::FAILED:
      return "failed";
    case OtaJobState::ABORTED:
      return "aborted";
    default:
      return "unknown";
  }
}

struct ApiEnvelope {
  uint8_t version{kApiVersion};
  std::string id;
  std::string type;
  std::string payload_json;
};

struct AuthChallenge {
  std::array<uint8_t, kServerNonceBytes> server_nonce{};
  std::string server_nonce_hex;
};

struct AuthResponse {
  std::string request_id;
  std::string client;
  std::string client_nonce;
  std::string hmac_hex;
};

struct ClientSession {
  uint32_t client_id{0};
  ClientAuthState auth_state{ClientAuthState::DISCONNECTED};
  AuthChallenge challenge{};
  uint32_t connected_ms{0};
  uint32_t authenticated_ms{0};
  uint32_t last_rx_ms{0};
};

struct BridgeFacade {
  virtual ~BridgeFacade() = default;
  virtual std::string api_bridge_info_json() const = 0;
  virtual std::string api_topology_snapshot_json(const std::string &request_payload_json) const = 0;

  virtual bool api_ota_start(const std::string &target_mac_colon,
                             uint32_t file_size, const std::string &md5_hex,
                             const std::string &sha256_hex,
                             const std::string &filename,
                             uint16_t preferred_chunk_size,
                             std::string &job_id_out,
                             uint16_t &max_chunk_size_out,
                             uint8_t &window_size_out,
                             const std::string &request_id) = 0;
  virtual std::string api_ota_status_json() const = 0;
  virtual bool api_ota_abort(const std::string &job_id,
                             const std::string &reason) = 0;
  virtual bool api_ota_inject_chunk(uint32_t sequence, const uint8_t *data,
                                    size_t len) = 0;
  virtual bool api_ota_has_active_job() const = 0;
  virtual std::string api_ota_active_job_id() const = 0;
  virtual const char *api_ota_start_error() const = 0;
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
