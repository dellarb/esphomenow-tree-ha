#include "bridge_api_proto_ws.h"
#include "bridge_api_auth.h"
#include "espnow_lr_bridge.h"
#include "espnow_lr_common/espnow_crypto.h"

#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <mutex>

#if USE_ESP32
#include <esp_http_server.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <mbedtls/base64.h>
#include <mbedtls/sha1.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#endif

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

namespace {

static const char *const TAG = "bridge_api_proto_ws";
static constexpr const char *kWsGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

static bool constant_time_equal(const uint8_t *a, const uint8_t *b, size_t len) {
  uint8_t diff = 0;
  for (size_t i = 0; i < len; ++i) diff |= static_cast<uint8_t>(a[i] ^ b[i]);
  return diff == 0;
}

#if USE_ESP32
static bool read_exact(int fd, uint8_t *data, size_t len) {
  size_t offset = 0;
  while (offset < len) {
    const int ret = recv(fd, data + offset, len - offset, 0);
    if (ret > 0) {
      offset += static_cast<size_t>(ret);
      continue;
    }
    if (ret == 0) return false;
    if (errno == EINTR) continue;
    if (errno == EAGAIN || errno == EWOULDBLOCK) return false;
    return false;
  }
  return true;
}

static bool send_exact(int fd, const uint8_t *data, size_t len) {
  size_t offset = 0;
  while (offset < len) {
    const int ret = send(fd, data + offset, len - offset, 0);
    if (ret > 0) {
      offset += static_cast<size_t>(ret);
      continue;
    }
    if (ret == 0) return false;
    if (errno == EINTR) continue;
    return false;
  }
  return true;
}

static std::string websocket_accept_key(const std::string &client_key) {
  const std::string input = client_key + kWsGuid;
  uint8_t digest[20]{};
  if (mbedtls_sha1(reinterpret_cast<const unsigned char *>(input.data()), input.size(), digest) != 0) return "";

  unsigned char encoded[32]{};
  size_t encoded_len = 0;
  if (mbedtls_base64_encode(encoded, sizeof(encoded), &encoded_len, digest, sizeof(digest)) != 0) return "";
  return std::string(reinterpret_cast<const char *>(encoded), encoded_len);
}
#endif

}  // namespace

struct BridgeApiProtoWsTransport::Impl {
  explicit Impl(ESPNowLRBridge *bridge) : bridge(bridge) {}

  ESPNowLRBridge *bridge{nullptr};
  bool registered{false};
  int active_fd{-1};
  bool connected{false};
  bool authenticated{false};
  uint32_t last_heartbeat_ms{0};
  uint32_t last_status_log_ms{0};
  uint32_t bytes_sent_since_last_log{0};
  uint32_t bytes_received_since_last_log{0};
  std::array<uint8_t, runtime_pb::kRuntimeServerNonceBytes> server_nonce{};
  mutable std::mutex mutex;
  std::mutex send_mutex;
  static constexpr uint32_t STATUS_LOG_INTERVAL_MS = 30000;

#if USE_ESP32
  struct WsTaskContext {
    Impl *impl{nullptr};
    httpd_req_t *req{nullptr};
    int fd{-1};
  };

  static void ws_task_trampoline(void *arg) {
    auto *ctx = static_cast<WsTaskContext *>(arg);
    if (ctx == nullptr || ctx->impl == nullptr) {
      vTaskDelete(nullptr);
      return;
    }
    ctx->impl->run_socket_task(ctx);
    vTaskDelete(nullptr);
  }

  class ManualWsHandler : public AsyncWebHandler {
   public:
    explicit ManualWsHandler(Impl *impl) : impl_(impl) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_GET) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      request->url_to(url_buf);
      return strcmp(url_buf, runtime_pb::kRuntimeWebSocketPath) == 0;
    }

    void handleRequest(AsyncWebServerRequest *request) override { impl_->run_socket_session(request); }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }

   private:
    Impl *impl_;
  };
#endif

  bool has_authenticated_client() const {
    std::lock_guard<std::mutex> lock(mutex);
    return connected && authenticated && active_fd >= 0;
  }

  bool register_with_web_server() {
#if USE_ESP32
    if (registered) return true;
    if (web_server_base::global_web_server_base == nullptr) return false;
    web_server_base::global_web_server_base->add_handler(new ManualWsHandler(this));
    registered = true;
    ESP_LOGI(TAG, "Registered bridge API protobuf endpoint at %s", runtime_pb::kRuntimeWebSocketPath);
    return true;
#else
    registered = true;
    ESP_LOGW(TAG, "Protobuf runtime websocket is only implemented for ESP32/web_server_idf builds");
    return true;
#endif
  }

#if USE_ESP32
  void run_socket_session(AsyncWebServerRequest *request) {
    auto key = request->get_header("Sec-WebSocket-Key");
    if (!key.has_value()) {
      request->send(400, "text/plain", "Missing WebSocket key");
      return;
    }
    if (bridge == nullptr || !bridge->api_has_key_configured()) {
      request->send(503, "text/plain", "Bridge API key is not configured");
      return;
    }

    httpd_req_t *req = *request;
    httpd_req_t *async_req = nullptr;
    const int fd = httpd_req_to_sockfd(req);

    {
      std::lock_guard<std::mutex> lock(mutex);
      if (connected) {
        httpd_resp_set_status(req, "409 Conflict");
        httpd_resp_send(req, "Runtime protobuf client already connected", HTTPD_RESP_USE_STRLEN);
        return;
      }
      connected = true;
      authenticated = false;
      active_fd = fd;
      fill_random_bytes(server_nonce.data(), server_nonce.size());
    }

    const std::string accept = websocket_accept_key(key.value());
    if (accept.empty() || httpd_req_async_handler_begin(req, &async_req) != ESP_OK || async_req == nullptr) {
      finish_session(fd);
      return;
    }

    httpd_resp_set_status(async_req, "101 Switching Protocols");
    httpd_resp_set_hdr(async_req, "Upgrade", "websocket");
    httpd_resp_set_hdr(async_req, "Connection", "Upgrade");
    httpd_resp_set_hdr(async_req, "Sec-WebSocket-Accept", accept.c_str());
    httpd_resp_set_hdr(async_req, "Sec-WebSocket-Protocol", runtime_pb::kRuntimeProtocol);
    httpd_resp_send(async_req, nullptr, 0);

    auto *ctx = new WsTaskContext{this, async_req, fd};
    BaseType_t task_ok = xTaskCreate(ws_task_trampoline, "bridge_api_pb", 7168, ctx, 3, nullptr);
    if (task_ok != pdPASS) {
      delete ctx;
      finish_session(fd);
      httpd_req_async_handler_complete(async_req);
    }
  }

  void run_socket_task(WsTaskContext *ctx) {
    send_auth_challenge();
    read_loop(ctx->fd);
    finish_session(ctx->fd);
    httpd_req_async_handler_complete(ctx->req);
    delete ctx;
  }

  bool read_frame(int fd, uint8_t &opcode, std::vector<uint8_t> &payload) {
    uint8_t header[2]{};
    if (!read_exact(fd, header, sizeof(header))) return false;
    const bool final = (header[0] & 0x80) != 0;
    opcode = header[0] & 0x0F;
    const bool masked = (header[1] & 0x80) != 0;
    uint64_t len = header[1] & 0x7F;
    if (!final || !masked) return false;
    if (len == 126) {
      uint8_t ext[2]{};
      if (!read_exact(fd, ext, sizeof(ext))) return false;
      len = (static_cast<uint16_t>(ext[0]) << 8) | ext[1];
    } else if (len == 127) {
      return false;
    }
    if (len > runtime_pb::kRuntimeMaxFrameBytes) return false;

    uint8_t mask[4]{};
    if (!read_exact(fd, mask, sizeof(mask))) return false;
    payload.resize(static_cast<size_t>(len));
    if (len > 0 && !read_exact(fd, payload.data(), payload.size())) return false;
    for (size_t i = 0; i < payload.size(); ++i) payload[i] ^= mask[i & 3U];
    return true;
  }

  bool send_frame(uint8_t opcode, const uint8_t *payload, size_t len) {
    int fd = -1;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (!connected || active_fd < 0) return false;
      fd = active_fd;
    }
    if (len > runtime_pb::kRuntimeMaxFrameBytes) return false;

    std::lock_guard<std::mutex> send_lock(send_mutex);
    uint8_t header[4]{};
    size_t header_len = 0;
    header[0] = 0x80 | (opcode & 0x0F);
    if (len < 126) {
      header[1] = static_cast<uint8_t>(len);
      header_len = 2;
    } else if (len <= 0xFFFF) {
      header[1] = 126;
      header[2] = static_cast<uint8_t>((len >> 8) & 0xFF);
      header[3] = static_cast<uint8_t>(len & 0xFF);
      header_len = 4;
    } else {
      return false;
    }
    return send_exact(fd, header, header_len) && (len == 0 || send_exact(fd, payload, len));
  }

  void read_loop(int fd) {
    while (is_active_fd(fd)) {
      fd_set read_fds;
      FD_ZERO(&read_fds);
      FD_SET(fd, &read_fds);
      timeval tv{};
      tv.tv_sec = 1;
      tv.tv_usec = 0;
      int ret = select(fd + 1, &read_fds, nullptr, nullptr, &tv);
      if (ret < 0) break;
      if (ret == 0) continue;

      uint8_t opcode = 0;
      std::vector<uint8_t> payload;
      if (!read_frame(fd, opcode, payload)) break;
      if (opcode == 0x8) {
        send_frame(0x8, payload.data(), payload.size());
        break;
      }
      if (opcode == 0x9) {
        send_frame(0xA, payload.data(), payload.size());
        continue;
      }
      if (opcode == 0x1) {
        std::vector<uint8_t> err;
        runtime_pb::error_envelope(err, "", "text_frames_unsupported", "Runtime API accepts binary protobuf frames only");
        send_frame(0x2, err.data(), err.size());
        break;
      }
      if (opcode != 0x2) break;
      handle_binary(payload);
      {
        std::lock_guard<std::mutex> lock(mutex);
        bytes_received_since_last_log += payload.size();
      }
    }
  }
#endif

  bool is_active_fd(int fd) const {
    std::lock_guard<std::mutex> lock(mutex);
    return connected && active_fd == fd;
  }

  void finish_session(int fd) {
    std::lock_guard<std::mutex> lock(mutex);
    if (active_fd != fd) return;
    connected = false;
    authenticated = false;
    active_fd = -1;
    ESP_LOGI(TAG, "Bridge API protobuf client disconnected");
  }

  bool send_binary(const std::vector<uint8_t> &payload) {
#if USE_ESP32
    bool ok;
    if (payload.empty()) {
      ok = send_frame(0x2, nullptr, 0);
    } else {
      ok = send_frame(0x2, payload.data(), payload.size());
    }
    if (ok && !payload.empty()) {
      std::lock_guard<std::mutex> lock(mutex);
      bytes_sent_since_last_log += payload.size();
    }
    return ok;
#else
    (void)payload;
    return false;
#endif
  }

  void send_auth_challenge() {
    std::vector<uint8_t> frame;
    std::array<uint8_t, runtime_pb::kRuntimeServerNonceBytes> nonce{};
    {
      std::lock_guard<std::mutex> lock(mutex);
      nonce = server_nonce;
    }
    const std::string bridge_mac = bridge == nullptr ? "" : bridge->api_runtime_bridge_mac();
    runtime_pb::envelope(frame, "", runtime_pb::AUTH_CHALLENGE, [&](runtime_pb::Writer &w) {
      w.bytes(1, nonce.data(), nonce.size());
      w.varint(2, runtime_pb::kRuntimeApiVersion);
      w.varint(3, runtime_pb::kRuntimeApiVersion);
      w.string(4, runtime_pb::kRuntimeProtocol);
      w.string(5, bridge_mac);
    });
    send_binary(frame);
  }

  bool verify_auth_response(const runtime_pb::ParsedAuthResponse &response) {
    if (bridge == nullptr || response.client_kind != "ha_integration" ||
        response.client_nonce.empty() || response.hmac_sha256.size() != runtime_pb::kRuntimeHmacBytes) {
      return false;
    }
    std::array<uint8_t, runtime_pb::kRuntimeServerNonceBytes> nonce{};
    {
      std::lock_guard<std::mutex> lock(mutex);
      nonce = server_nonce;
    }
    const std::string server_nonce_hex = BridgeApiAuth::bytes_to_lower_hex(nonce.data(), nonce.size());
    const std::string client_nonce_hex = BridgeApiAuth::bytes_to_lower_hex(response.client_nonce.data(), response.client_nonce.size());
    const std::string input = std::string(runtime_pb::kRuntimeProtocol) + "|" +
                              runtime_pb::kRuntimeProtocolVersionLabel + "|" + response.client_kind + "|" +
                              server_nonce_hex + "|" + client_nonce_hex;
    uint8_t digest[runtime_pb::kRuntimeHmacBytes]{};
    const std::string &api_key = bridge->api_key();
    espnow_crypto_hmac_sha256(reinterpret_cast<const uint8_t *>(api_key.data()), api_key.size(),
                              reinterpret_cast<const uint8_t *>(input.data()), input.size(), digest);
    return constant_time_equal(digest, response.hmac_sha256.data(), sizeof(digest));
  }

  void handle_binary(const std::vector<uint8_t> &payload) {
    runtime_pb::ParsedEnvelope env;
    if (!runtime_pb::parse_envelope(payload.data(), payload.size(), env) ||
        (env.api_version != 0 && env.api_version != runtime_pb::kRuntimeApiVersion)) {
      std::vector<uint8_t> err;
      runtime_pb::error_envelope(err, "", "invalid_envelope", "Invalid protobuf envelope");
      send_binary(err);
      return;
    }

    if (!has_authenticated_client()) {
      if (env.msg_field != runtime_pb::AUTH_RESPONSE) {
        std::vector<uint8_t> err;
        runtime_pb::auth_failed_envelope(err, env.request_id, "auth_required", "Authenticate before sending runtime requests");
        send_binary(err);
        close_client();
        return;
      }
      runtime_pb::ParsedAuthResponse response;
      if (!runtime_pb::parse_auth_response(env.msg_data, env.msg_len, response) || !verify_auth_response(response)) {
        std::vector<uint8_t> err;
        runtime_pb::auth_failed_envelope(err, env.request_id, "auth_failed", "Authentication failed");
        send_binary(err);
        close_client();
        return;
      }
      {
        std::lock_guard<std::mutex> lock(mutex);
        authenticated = true;
        last_heartbeat_ms = millis();
      }
      std::vector<uint8_t> ok;
      bridge->api_runtime_encode_auth_ok(env.request_id, ok);
      send_binary(ok);
      return;
    }

    if (env.msg_field == runtime_pb::CLIENT_HELLO) {
      std::vector<uint8_t> snapshot;
      bridge->api_runtime_encode_full_snapshot(env.request_id, snapshot);
      send_binary(snapshot);
    } else if (env.msg_field == runtime_pb::PING) {
      const uint64_t monotonic = runtime_pb::ping_monotonic_ms(env.msg_data, env.msg_len);
      std::vector<uint8_t> pong;
      runtime_pb::envelope(pong, env.request_id, runtime_pb::PONG, [&](runtime_pb::Writer &w) {
        w.varint(1, monotonic);
      });
      send_binary(pong);
    } else if (env.msg_field == runtime_pb::COMMAND_REQUEST) {
      runtime_pb::ParsedCommandRequest request;
      std::vector<uint8_t> result;
      if (!runtime_pb::parse_command_request(env.msg_data, env.msg_len, request)) {
        runtime_pb::error_envelope(result, env.request_id, "invalid_command", "Invalid command request");
      } else {
        bridge->api_runtime_handle_command(env.request_id, request, result);
      }
      send_binary(result);
    } else if (env.msg_field == runtime_pb::CONFIG_COMMAND_REQUEST) {
      runtime_pb::ParsedConfigCommandRequest request;
      std::vector<uint8_t> result;
      if (!runtime_pb::parse_config_command_request(env.msg_data, env.msg_len, request)) {
        runtime_pb::error_envelope(result, env.request_id, "invalid_config_command", "Invalid config command request");
      } else {
        bridge->api_runtime_handle_config_command(env.request_id, request, result);
      }
      send_binary(result);
    } else {
      std::vector<uint8_t> err;
      runtime_pb::error_envelope(err, env.request_id, "unsupported_message", "Unsupported runtime request");
      send_binary(err);
    }
  }

  void close_client() {
#if USE_ESP32
    int fd = -1;
    {
      std::lock_guard<std::mutex> lock(mutex);
      fd = active_fd;
      connected = false;
      authenticated = false;
    }
    if (fd >= 0) {
      send_frame(0x8, nullptr, 0);
      shutdown(fd, SHUT_RDWR);
    }
#endif
  }

  void emit_status_log_if_due() {
    if (bridge == nullptr) return;
    const uint32_t now = millis();
    bool should_log = false;
    uint32_t kb_sent = 0;
    uint32_t kb_recv = 0;
    bool client_connected = false;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (last_status_log_ms == 0 || now - last_status_log_ms >= STATUS_LOG_INTERVAL_MS) {
        should_log = true;
        last_status_log_ms = now;
        kb_sent = bytes_sent_since_last_log / 1024;
        kb_recv = bytes_received_since_last_log / 1024;
        client_connected = connected && authenticated;
        bytes_sent_since_last_log = 0;
        bytes_received_since_last_log = 0;
      }
    }
    if (should_log) {
      ESP_LOGI(TAG, "Protobuf API: client_connected=%d kb_sent=%u kb_recv=%u", client_connected ? 1 : 0, kb_sent,
               kb_recv);
    }
  }

  void emit_heartbeat_if_due() {
    if (!has_authenticated_client() || bridge == nullptr) return;
    const uint32_t now = millis();
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (last_heartbeat_ms != 0 && now - last_heartbeat_ms < runtime_pb::kRuntimeHeartbeatIntervalMs) return;
      last_heartbeat_ms = now;
    }
    emit_status_log_if_due();
    std::vector<uint8_t> frame;
    bridge->api_runtime_encode_bridge_heartbeat(frame);
    send_binary(frame);
  }
};

BridgeApiProtoWsTransport::BridgeApiProtoWsTransport(ESPNowLRBridge *bridge) : impl_(new Impl(bridge)) {}
BridgeApiProtoWsTransport::~BridgeApiProtoWsTransport() = default;
bool BridgeApiProtoWsTransport::register_with_web_server() { return impl_->register_with_web_server(); }
void BridgeApiProtoWsTransport::loop() {
  impl_->emit_status_log_if_due();
  impl_->emit_heartbeat_if_due();
}
bool BridgeApiProtoWsTransport::has_authenticated_client() const { return impl_->has_authenticated_client(); }
bool BridgeApiProtoWsTransport::send_binary(const std::vector<uint8_t> &payload) { return impl_->send_binary(payload); }
void BridgeApiProtoWsTransport::close_client() { impl_->close_client(); }

void BridgeApiProtoWsTransport::emit_heartbeat(uint32_t uptime_ms) {
  (void)uptime_ms;
  impl_->emit_heartbeat_if_due();
}

void BridgeApiProtoWsTransport::emit_topology_changed(const char *reason, const uint8_t *mac) {
  if (!has_authenticated_client() || impl_->bridge == nullptr) return;
  std::vector<uint8_t> frame;
  impl_->bridge->api_runtime_encode_topology_changed(reason, mac, frame);
  impl_->send_binary(frame);
}

void BridgeApiProtoWsTransport::emit_remote_availability(const uint8_t *mac, bool online, const char *reason,
                                                         int8_t rssi, uint32_t offline_s,
                                                         const uint8_t *parent_mac, uint8_t hop_count) {
  if (!has_authenticated_client() || impl_->bridge == nullptr) return;
  std::vector<uint8_t> frame;
  impl_->bridge->api_runtime_encode_remote_availability(mac, online, reason, rssi, offline_s, parent_mac, hop_count, frame);
  impl_->send_binary(frame);
}

void BridgeApiProtoWsTransport::emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity,
                                                  const std::vector<uint8_t> &value, espnow_field_type_t type) {
  if (!has_authenticated_client() || impl_->bridge == nullptr || value.empty()) return;
  std::vector<uint8_t> frame;
  impl_->bridge->api_runtime_encode_remote_state(mac, entity, value, type, frame);
  impl_->send_binary(frame);
}

void BridgeApiProtoWsTransport::emit_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash) {
  if (!has_authenticated_client() || impl_->bridge == nullptr) return;
  std::vector<uint8_t> frame;
  impl_->bridge->api_runtime_encode_remote_schema_changed(mac, schema_hash, frame);
  impl_->send_binary(frame);
}

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
