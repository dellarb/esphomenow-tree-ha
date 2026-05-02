#include "bridge_api_ws.h"
#include "espnow_lr_bridge.h"

#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <deque>
#include <mutex>

#if USE_ESP32
#include <esp_http_server.h>
#include <mbedtls/base64.h>
#include <mbedtls/sha1.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#endif

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

namespace {

static const char *const TAG = "bridge_api_ws";
static constexpr const char *kWsGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
static constexpr size_t kMaxPendingTextFrames = 8;

static bool json_get_string_field(const std::string &json, const char *field, std::string &out) {
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

struct BridgeApiWsTransport::Impl {
  struct IncomingText {
    uint32_t client_id{0};
    std::string text;
  };

  explicit Impl(ESPNowLRBridge *bridge) : bridge(bridge), router(bridge, nullptr) {
    router.set_outbound(outbound);
    auth.set_api_key(&bridge->api_key());
  }

  ESPNowLRBridge *bridge{nullptr};
  BridgeApiWsTransport *outbound{nullptr};
  BridgeApiRouter router;
  BridgeApiAuth auth;
  bool registered{false};
  ClientSession session;
  int active_fd{-1};
  uint32_t last_heartbeat_ms{0};
  std::deque<IncomingText> incoming;
  std::mutex mutex;
  std::mutex send_mutex;

  bool is_active_client(uint32_t client_id) {
    std::lock_guard<std::mutex> lock(mutex);
    return session.client_id == client_id && session.auth_state != ClientAuthState::DISCONNECTED;
  }

  bool has_authenticated_client() {
    std::lock_guard<std::mutex> lock(mutex);
    return session.auth_state == ClientAuthState::AUTHENTICATED;
  }

  uint32_t active_client_id() {
    std::lock_guard<std::mutex> lock(mutex);
    return session.auth_state == ClientAuthState::AUTHENTICATED ? session.client_id : 0;
  }

  void push_text(uint32_t client_id, const std::string &text) {
    std::lock_guard<std::mutex> lock(mutex);
    if (session.client_id != client_id || session.auth_state == ClientAuthState::DISCONNECTED) return;
    if (incoming.size() >= kMaxPendingTextFrames) {
      ESP_LOGW(TAG, "Dropping websocket frame because API queue is full");
      return;
    }
    session.last_rx_ms = millis();
    incoming.push_back({client_id, text});
  }

  bool pop_text(IncomingText &text) {
    std::lock_guard<std::mutex> lock(mutex);
    if (incoming.empty()) return false;
    text = std::move(incoming.front());
    incoming.pop_front();
    return true;
  }

  void process_incoming() {
    IncomingText text;
    while (pop_text(text)) {
      handle_text(text.client_id, text.text);
    }
  }

  void handle_text(uint32_t client_id, const std::string &text) {
    ClientAuthState auth_state = ClientAuthState::DISCONNECTED;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (session.client_id != client_id) return;
      auth_state = session.auth_state;
    }

    ApiEnvelope envelope;
    ParseStatus status = router.parse_envelope(text, envelope);
    if (status != ParseStatus::OK) {
      send_text(client_id, BridgeApiMessages::error(envelope.id, error::INVALID_ENVELOPE,
                                                    "Invalid or unsupported request envelope"));
      close_client(client_id);
      return;
    }

    if (auth_state != ClientAuthState::AUTHENTICATED) {
      if (envelope.type != type::AUTH_RESPONSE) {
        send_text(client_id, BridgeApiMessages::error(envelope.id, error::AUTH_FAILED,
                                                      "Authenticate before sending bridge API requests"));
        close_client(client_id);
        return;
      }

      AuthResponse response;
      response.request_id = envelope.id;
      const bool payload_ok = json_get_string_field(envelope.payload_json, "client", response.client) &&
                              json_get_string_field(envelope.payload_json, "client_nonce", response.client_nonce) &&
                              json_get_string_field(envelope.payload_json, "hmac", response.hmac_hex);

      AuthChallenge challenge;
      {
        std::lock_guard<std::mutex> lock(mutex);
        challenge = session.challenge;
      }

      if (!payload_ok || !auth.verify_response(challenge, response)) {
        send_text(client_id, BridgeApiMessages::error(envelope.id, error::AUTH_FAILED, "Authentication failed"));
        close_client(client_id);
        return;
      }

      {
        std::lock_guard<std::mutex> lock(mutex);
        if (session.client_id != client_id) return;
        session.auth_state = ClientAuthState::AUTHENTICATED;
        session.authenticated_ms = millis();
        router.set_active_client_id(client_id);
        last_heartbeat_ms = millis();
      }
      ESP_LOGI(TAG, "Bridge API websocket client authenticated");
      send_text(client_id, BridgeApiMessages::auth_ok(envelope.id));
      return;
    }

    router.handle_authenticated_text(client_id, text);
  }

#if USE_ESP32
  class ManualWsHandler : public AsyncWebHandler {
   public:
    explicit ManualWsHandler(Impl *impl) : impl_(impl) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_GET) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      return request->url_to(url_buf) == kWebSocketPath;
    }

    void handleRequest(AsyncWebServerRequest *request) override { impl_->run_socket_session(request); }
    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }

   private:
    Impl *impl_;
  };

  bool register_with_web_server() {
    if (registered) return true;
    if (web_server_base::global_web_server_base == nullptr) return false;
    web_server_base::global_web_server_base->add_handler(new ManualWsHandler(this));
    registered = true;
    ESP_LOGI(TAG, "Registered bridge API websocket endpoint at %s", kWebSocketPath);
    return true;
  }

  void run_socket_session(AsyncWebServerRequest *request) {
    auto key = request->get_header("Sec-WebSocket-Key");
    if (!key.has_value()) {
      request->send(400, "text/plain", "Missing WebSocket key");
      return;
    }
    if (!auth.has_api_key()) {
      request->send(503, "text/plain", "Bridge API key is not configured");
      return;
    }

    httpd_req_t *req = *request;
    const int fd = httpd_req_to_sockfd(req);
    const uint32_t client_id = static_cast<uint32_t>(fd);

    {
      std::lock_guard<std::mutex> lock(mutex);
      if (session.auth_state != ClientAuthState::DISCONNECTED) {
        httpd_resp_set_status(req, "409 Conflict");
        httpd_resp_send(req, "Bridge API client already connected", HTTPD_RESP_USE_STRLEN);
        return;
      }
      session = ClientSession{};
      session.client_id = client_id;
      session.auth_state = ClientAuthState::CONNECTED_UNAUTHENTICATED;
      session.challenge = auth.create_challenge();
      session.connected_ms = millis();
      session.last_rx_ms = session.connected_ms;
      active_fd = fd;
    }

    const std::string accept = websocket_accept_key(key.value());
    if (accept.empty()) {
      close_client(client_id);
      return;
    }

    httpd_resp_set_status(req, "101 Switching Protocols");
    httpd_resp_set_hdr(req, "Upgrade", "websocket");
    httpd_resp_set_hdr(req, "Connection", "Upgrade");
    httpd_resp_set_hdr(req, "Sec-WebSocket-Accept", accept.c_str());
    httpd_resp_send(req, nullptr, 0);

    timeval timeout{};
    timeout.tv_sec = 1;
    timeout.tv_usec = 0;
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    ESP_LOGI(TAG, "Bridge API websocket client connected");
    send_text(client_id, BridgeApiMessages::auth_challenge(session.challenge));
    read_loop(client_id, fd);
    finish_session(client_id);
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
      uint8_t ext[8]{};
      if (!read_exact(fd, ext, sizeof(ext))) return false;
      len = 0;
      for (uint8_t byte : ext) len = (len << 8) | byte;
    }
    if (len > kMaxJsonBytes) return false;

    uint8_t mask[4]{};
    if (!read_exact(fd, mask, sizeof(mask))) return false;
    payload.resize(static_cast<size_t>(len));
    if (len > 0 && !read_exact(fd, payload.data(), payload.size())) return false;
    for (size_t i = 0; i < payload.size(); ++i) payload[i] ^= mask[i & 3U];
    return true;
  }

  bool send_frame(uint32_t client_id, uint8_t opcode, const uint8_t *payload, size_t len) {
    int fd = -1;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (session.client_id != client_id || session.auth_state == ClientAuthState::DISCONNECTED) return false;
      fd = active_fd;
    }
    if (fd < 0) return false;

    std::lock_guard<std::mutex> send_lock(send_mutex);
    uint8_t header[10]{};
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

  void send_text(uint32_t client_id, const std::string &text) {
    send_frame(client_id, 0x1, reinterpret_cast<const uint8_t *>(text.data()), text.size());
  }

  void read_loop(uint32_t client_id, int fd) {
    while (is_active_client(client_id)) {
      uint8_t opcode = 0;
      std::vector<uint8_t> payload;
      if (!read_frame(fd, opcode, payload)) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
        break;
      }
      if (opcode == 0x1) {
        push_text(client_id, std::string(reinterpret_cast<const char *>(payload.data()), payload.size()));
      } else if (opcode == 0x2) {
        send_text(client_id, BridgeApiMessages::error("", error::OTA_INVALID_CHUNK,
                                                      "Binary WebSocket frames are reserved for OTA"));
      } else if (opcode == 0x8) {
        send_frame(client_id, 0x8, payload.data(), payload.size());
        break;
      } else if (opcode == 0x9) {
        send_frame(client_id, 0xA, payload.data(), payload.size());
      }
    }
  }
#else
  bool register_with_web_server() {
    ESP_LOGW(TAG, "Bridge API websocket transport is only implemented for ESP32/web_server_idf builds");
    registered = true;
    return true;
  }
  void send_text(uint32_t, const std::string &) {}
#endif

  void close_client(uint32_t client_id) {
    int fd = -1;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (session.client_id != client_id || session.auth_state == ClientAuthState::DISCONNECTED) return;
      session.auth_state = ClientAuthState::CLOSED;
      fd = active_fd;
    }
#if USE_ESP32
    if (fd >= 0) {
      send_frame(client_id, 0x8, nullptr, 0);
      shutdown(fd, SHUT_RDWR);
    }
#endif
  }

  void finish_session(uint32_t client_id) {
    std::lock_guard<std::mutex> lock(mutex);
    if (session.client_id != client_id) return;
    session = ClientSession{};
    active_fd = -1;
    incoming.clear();
    router.set_active_client_id(0);
    ESP_LOGI(TAG, "Bridge API websocket client disconnected");
  }

  void emit_heartbeat_if_due() {
    uint32_t client_id = 0;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (session.auth_state != ClientAuthState::AUTHENTICATED) return;
      const uint32_t now = millis();
      if (last_heartbeat_ms != 0 && now - last_heartbeat_ms < kHeartbeatIntervalMs) return;
      last_heartbeat_ms = now;
      client_id = session.client_id;
    }
    (void) client_id;
    router.emit_heartbeat(millis());
  }
};

BridgeApiWsTransport::BridgeApiWsTransport(ESPNowLRBridge *bridge) : impl_(new Impl(bridge)) {
  impl_->outbound = this;
  impl_->router.set_outbound(this);
}

BridgeApiWsTransport::~BridgeApiWsTransport() = default;

bool BridgeApiWsTransport::register_with_web_server() { return impl_->register_with_web_server(); }

void BridgeApiWsTransport::loop() {
  impl_->process_incoming();
  impl_->emit_heartbeat_if_due();
}

bool BridgeApiWsTransport::has_authenticated_client() const { return impl_->has_authenticated_client(); }

uint32_t BridgeApiWsTransport::active_client_id() const { return impl_->active_client_id(); }

void BridgeApiWsTransport::send_text(uint32_t client_id, const std::string &text) { impl_->send_text(client_id, text); }

void BridgeApiWsTransport::close_client(uint32_t client_id) { impl_->close_client(client_id); }

void BridgeApiWsTransport::emit_event(const std::string &event_json) {
  const uint32_t client_id = active_client_id();
  if (client_id != 0) send_text(client_id, event_json);
}

void BridgeApiWsTransport::emit_heartbeat(uint32_t uptime_ms) { impl_->router.emit_heartbeat(uptime_ms); }

void BridgeApiWsTransport::emit_topology_changed(const char *reason, const uint8_t *mac) {
  impl_->router.emit_topology_changed(reason, mac);
}

void BridgeApiWsTransport::emit_remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                                    uint32_t last_seen_ms) {
  impl_->router.emit_remote_availability(mac, online, reason, rssi, last_seen_ms);
}

void BridgeApiWsTransport::emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity,
                                             const std::vector<uint8_t> &value, espnow_field_type_t type) {
  impl_->router.emit_remote_state(mac, entity, value, type);
}

void BridgeApiWsTransport::emit_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash) {
  impl_->router.emit_remote_schema_changed(mac, schema_hash);
}

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
