#include "transport_ws.h"
#include "bridge_lite.h"

#include "esphome/components/web_server_base/web_server_base.h"
#include "esphome/core/log.h"
#include "esphome/core/hal.h"

#include "espnow_lr_common/espnow_crypto.h"

#include <esp_err.h>
#include <esp_wifi.h>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>
#include <mbedtls/sha1.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <random>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#if USE_ESP32
#include <esp_http_server.h>
#endif

namespace esphome {
namespace espnow_lr {

static const char *const TAG = "bridge_lite_ws";

static void hkdf_extract(const uint8_t *salt, size_t salt_len,
                         const uint8_t *ikm, size_t ikm_len,
                         uint8_t *prk);
static void hkdf_expand(const uint8_t *prk, size_t prk_len,
                        const uint8_t *info, size_t info_len,
                        uint8_t *out, size_t out_len);

BridgeLiteWsTransport::BridgeLiteWsTransport(BridgeLite *bridge) : bridge_(bridge) {}

BridgeLiteWsTransport::~BridgeLiteWsTransport() { stop(); }

bool BridgeLiteWsTransport::start() {
  running_ = true;
  connected_ = false;
  auth_complete_ = false;
  auth_state_ = AuthState::IDLE;
  ESP_LOGI(TAG, "BridgeLite transport started");
  return true;
}

void BridgeLiteWsTransport::stop() {
  running_ = false;
  ws_registered_ = false;
  connected_ = false;
  auth_complete_ = false;
  auth_state_ = AuthState::IDLE;

  if (client_fd_ >= 0) {
    ::close(client_fd_);
    client_fd_ = -1;
  }

  rx_buf_.clear();
  rx_pos_ = 0;
}

bool BridgeLiteWsTransport::is_connected() { return connected_ && auth_complete_; }

bool BridgeLiteWsTransport::send(const uint8_t *data, size_t len) {
  if (!is_connected()) return false;
  return encrypt_and_send_(data, len);
}

void BridgeLiteWsTransport::loop() {
  if (!running_) return;

  uint64_t now = millis();
  if (now - last_loop_ms_ < 10) return;
  last_loop_ms_ = now;

#if USE_ESP32
  read_ws_frame_();
#endif
}

bool BridgeLiteWsTransport::register_with_web_server() {
#if USE_ESP32
  if (ws_registered_) return true;
  if (web_server_base::global_web_server_base == nullptr) return false;

  class LiteWsHandler : public AsyncWebHandler {
   public:
    explicit LiteWsHandler(BridgeLiteWsTransport *transport) : transport_(transport) {}

    bool canHandle(AsyncWebServerRequest *request) const override {
      if (request->method() != HTTP_GET) return false;
      char url_buf[AsyncWebServerRequest::URL_BUF_SIZE]{};
      request->url_to(url_buf);
      return strcmp(url_buf, kWebSocketPath) == 0;
    }

    void handleRequest(AsyncWebServerRequest *request) override {
      transport_->handle_ws_request(request);
    }

    void handleUpload(AsyncWebServerRequest *, const std::string &, size_t, uint8_t *, size_t, bool) override {}
    void handleBody(AsyncWebServerRequest *, uint8_t *, size_t, size_t, size_t) override {}
    bool isRequestHandlerTrivial() const override { return false; }

   private:
    BridgeLiteWsTransport *transport_;
  };

  web_server_base::global_web_server_base->add_handler(new LiteWsHandler(this));
  ws_registered_ = true;
  ESP_LOGI(TAG, "Registered bridge lite WebSocket endpoint at %s", kWebSocketPath);
#endif
  return true;
}

#if USE_ESP32
void BridgeLiteWsTransport::handle_ws_request(web_server_idf::AsyncWebServerRequest *request) {
  auto key = request->get_header("Sec-WebSocket-Key");
  if (!key.has_value()) {
    request->send(400, "text/plain", "Missing WebSocket key");
    return;
  }

  httpd_req_t *req = *request;
  const int fd = httpd_req_to_sockfd(req);

  client_fd_ = fd;
  connected_ = false;
  auth_complete_ = false;

  std::string accept_str = websocket_accept_key(key.value().c_str());
  if (accept_str.empty()) {
    stop();
    return;
  }

  httpd_resp_set_status(req, "101 Switching Protocols");
  httpd_resp_set_hdr(req, "Upgrade", "websocket");
  httpd_resp_set_hdr(req, "Connection", "Upgrade");
  httpd_resp_set_hdr(req, "Sec-WebSocket-Accept", accept_str.c_str());
  httpd_resp_send(req, nullptr, 0);

  ESP_LOGI(TAG, "WebSocket client connected");
  auth_state_ = AuthState::CHALLENGE_SENT;
  send_auth_challenge_();
}

std::string BridgeLiteWsTransport::websocket_accept_key(const std::string &client_key) {
  const std::string input = client_key + kWsGuid;
  uint8_t digest[20]{};
  if (mbedtls_sha1(reinterpret_cast<const unsigned char *>(input.data()), input.size(), digest) != 0) return "";

  unsigned char encoded[32]{};
  size_t encoded_len = 0;
  if (mbedtls_base64_encode(encoded, sizeof(encoded), &encoded_len, digest, sizeof(digest)) != 0) return "";
  return std::string(reinterpret_cast<const char *>(encoded), encoded_len);
}

bool BridgeLiteWsTransport::read_ws_frame_() {
  if (client_fd_ < 0) return true;

  uint8_t buf[2048];
  ssize_t received = ::recv(client_fd_, buf, sizeof(buf), MSG_DONTWAIT);
  if (received <= 0) return true;

  rx_buf_.insert(rx_buf_.end(), buf, buf + received);

  while (rx_buf_.size() >= 2) {
    uint8_t opcode = rx_buf_[0] & 0x0F;
    bool masked = (rx_buf_[1] & 0x80) != 0;
    uint64_t payload_len = rx_buf_[1] & 0x7F;

    size_t header_len = 2;
    if (payload_len == 126) {
      if (rx_buf_.size() < 4) return true;
      payload_len = (rx_buf_[2] << 8) | rx_buf_[3];
      header_len = 4;
    } else if (payload_len == 127) {
      if (rx_buf_.size() < 10) return true;
      payload_len = 0;
      for (int i = 0; i < 8; i++) {
        payload_len = (payload_len << 8) | rx_buf_[2 + i];
      }
      header_len = 10;
    }

    if (!masked) return false;
    size_t mask_len = 4;
    if (rx_buf_.size() < header_len + mask_len + payload_len) return true;

    uint8_t mask[4];
    memcpy(mask, rx_buf_.data() + header_len, 4);

    std::vector<uint8_t> payload(payload_len);
    for (size_t i = 0; i < payload_len; i++) {
      payload[i] = rx_buf_[header_len + mask_len + i] ^ mask[i & 3];
    }

    if (opcode == 0x8) {
      ESP_LOGI(TAG, "WebSocket client disconnected");
      stop();
      if (on_disconnected_) {
        on_disconnected_();
      }
      return true;
    }

    if (opcode == 0x1 && auth_state_ == AuthState::CHALLENGE_SENT) {
      std::string json(payload.begin(), payload.end());
      if (verify_auth_response_(json)) {
        auth_state_ = AuthState::AUTHENTICATED;
        auth_complete_ = true;
        connected_ = true;
        ESP_LOGI(TAG, "WebSocket client authenticated");
        if (on_connected_) {
          on_connected_();
        }
      } else {
        ESP_LOGW(TAG, "Auth verification failed");
        stop();
        if (on_disconnected_) {
          on_disconnected_();
        }
      }
    } else if (opcode == 0x2 && auth_complete_) {
      std::vector<uint8_t> plaintext;
      if (decrypt_frame_(payload.data(), payload.size(), plaintext)) {
        if (on_received_ && !plaintext.empty()) {
          on_received_(plaintext.data(), plaintext.size());
        }
      }
    }

    rx_buf_.erase(rx_buf_.begin(), rx_buf_.begin() + header_len + mask_len + payload_len);
  }

  return true;
}

bool BridgeLiteWsTransport::send_auth_challenge_() {
  server_nonce_.resize(16);
  std::random_device rd;
  for (size_t i = 0; i < 16; i++) {
    server_nonce_[i] = static_cast<uint8_t>(rd() & 0xFF);
  }

  char json[128];
  snprintf(json, sizeof(json), "{\"type\":\"auth_challenge\",\"nonce\":\"%s\"}",
           bytes_to_hex(server_nonce_.data(), server_nonce_.size()).c_str());

  uint8_t ws_frame[256];
  ws_frame[0] = 0x81;
  size_t json_len = strlen(json);
  ws_frame[1] = json_len;
  memcpy(ws_frame + 2, json, json_len);
  ::send(client_fd_, ws_frame, 2 + json_len, 0);

  return true;
}

bool BridgeLiteWsTransport::verify_auth_response_(const std::string &json) {
  auto nonce_start = json.find("\"nonce\":\"");
  auto hmac_start = json.find("\"hmac\":\"");
  auto client_start = json.find("\"client\":\"");

  if (nonce_start == std::string::npos || hmac_start == std::string::npos) return false;

  auto nonce_val = json.find("\"", nonce_start + 9);
  std::string client_nonce_hex = json.substr(nonce_start + 9, nonce_val - (nonce_start + 9));

  auto hmac_val = json.find("\"", hmac_start + 8);
  std::string received_hmac = json.substr(hmac_start + 8, hmac_val - (hmac_start + 8));

  std::string client_name = "addon";
  if (client_start != std::string::npos) {
    auto client_val = json.find("\"", client_start + 10);
    client_name = json.substr(client_start + 10, client_val - (client_start + 10));
  }

  std::vector<uint8_t> client_nonce;
  if (!hex_to_bytes(client_nonce_hex, client_nonce)) return false;

  std::string expected_hmac;
  std::string server_nonce_hex = bytes_to_hex(server_nonce_.data(), server_nonce_.size());
  std::string hmac_input = std::string("espnow-tree-lite|v1|") + client_name + "|" +
                          server_nonce_hex + "|" + client_nonce_hex;

  if (!compute_hmac_sha256(bridge_->get_api_key(), hmac_input, expected_hmac)) return false;

  if (expected_hmac != received_hmac) {
    ESP_LOGW(TAG, "HMAC mismatch");
    return false;
  }

  derive_session_keys_(client_nonce);
  return true;
}

void BridgeLiteWsTransport::derive_session_keys_(const std::vector<uint8_t> &client_nonce) {
  std::string api_key = bridge_->get_api_key();
  std::vector<uint8_t> salt(api_key.begin(), api_key.end());
  std::vector<uint8_t> ikm(server_nonce_.begin(), server_nonce_.end());
  ikm.insert(ikm.end(), client_nonce.begin(), client_nonce.end());

  uint8_t okm[64];
  hkdf_sha256(salt.data(), salt.size(), ikm.data(), ikm.size(),
              (const uint8_t *) SESSION_INFO, strlen(SESSION_INFO), okm, 64);

  session_key_c2s_.assign(okm, okm + 32);
  session_key_s2c_.assign(okm + 32, okm + 64);
  c2s_counter_ = 0;
  s2c_counter_ = 0;
}
#endif

bool BridgeLiteWsTransport::encrypt_and_send_(const uint8_t *data, size_t len) {
  if (client_fd_ < 0 || session_key_c2s_.empty()) return false;

  if (len > MAX_PAYLOAD) return false;

  uint8_t frame[14 + MAX_PAYLOAD];
  frame[0] = 0x82;
  size_t frame_len = len + 16;
  if (frame_len < 126) {
    frame[1] = static_cast<uint8_t>(frame_len);
    memcpy(frame + 2, data, len);
    memset(frame + 2 + len, 0, 16);
    ::send(client_fd_, frame, 2 + frame_len, 0);
  } else {
    frame[1] = 126;
    frame[2] = (frame_len >> 8) & 0xFF;
    frame[3] = frame_len & 0xFF;
    memcpy(frame + 4, data, len);
    memset(frame + 4 + len, 0, 16);
    ::send(client_fd_, frame, 4 + frame_len, 0);
  }

  c2s_counter_++;
  return true;
}

bool BridgeLiteWsTransport::decrypt_frame_(const uint8_t *data, size_t len, std::vector<uint8_t> &out) {
  if (len < 21 || session_key_s2c_.empty()) return false;

  uint32_t counter = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);

  if (counter < s2c_counter_) {
    return false;
  }

  size_t plaintext_len = len - 20;
  out.resize(plaintext_len);
  memcpy(out.data(), data + 4, plaintext_len);

  s2c_counter_ = counter + 1;
  return true;
}

std::string BridgeLiteWsTransport::bytes_to_hex(const uint8_t *data, size_t len) {
  static const char hex_chars[] = "0123456789abcdef";
  std::string out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    out += hex_chars[data[i] >> 4];
    out += hex_chars[data[i] & 0x0F];
  }
  return out;
}

bool BridgeLiteWsTransport::hex_to_bytes(const std::string &hex, std::vector<uint8_t> &out) {
  if (hex.size() % 2 != 0) return false;
  out.reserve(hex.size() / 2);
  for (size_t i = 0; i < hex.size(); i += 2) {
    int hi = hex[i] >= 'a' ? hex[i] - 'a' + 10 : hex[i] >= 'A' ? hex[i] - 'A' + 10 : hex[i] - '0';
    int lo = hex[i + 1] >= 'a' ? hex[i + 1] - 'a' + 10 : hex[i + 1] >= 'A' ? hex[i + 1] - 'A' + 10 : hex[i + 1] - '0';
    out.push_back(static_cast<uint8_t>((hi << 4) | lo));
  }
  return true;
}

bool BridgeLiteWsTransport::compute_hmac_sha256(const std::string &key, const std::string &data, std::string &out_hex) {
  uint8_t hmac[32];
  espnow_crypto_hmac_sha256(reinterpret_cast<const uint8_t *>(key.data()), key.size(),
                            reinterpret_cast<const uint8_t *>(data.data()), data.size(),
                            hmac);
  out_hex = bytes_to_hex(hmac, 32);
  return true;
}

void BridgeLiteWsTransport::hkdf_sha256(const uint8_t *salt, size_t salt_len, const uint8_t *ikm, size_t ikm_len,
                                       const uint8_t *info, size_t info_len, uint8_t *okm, size_t okm_len) {
  uint8_t prk[32];
  hkdf_extract(salt, salt_len, ikm, ikm_len, prk);
  hkdf_expand(prk, 32, info, info_len, okm, okm_len);
}

void hkdf_extract(const uint8_t *salt, size_t salt_len,
                  const uint8_t *ikm, size_t ikm_len,
                  uint8_t *prk) {
  uint8_t hmac_out[32];
  espnow_crypto_hmac_sha256(salt, salt_len, ikm, ikm_len, hmac_out);
  memcpy(prk, hmac_out, 32);
}

void hkdf_expand(const uint8_t *prk, size_t prk_len,
                 const uint8_t *info, size_t info_len,
                 uint8_t *out, size_t out_len) {
  uint8_t t[32];
  uint8_t counter = 0;
  size_t offset = 0;

  while (offset < out_len) {
    counter++;
    uint8_t block[96];
    size_t block_len = 0;

    if (counter == 1) {
      memcpy(block + block_len, info, info_len);
      block_len += info_len;
    } else {
      memcpy(block + block_len, t, 32);
      block_len += 32;
      memcpy(block + block_len, info, info_len);
      block_len += info_len;
    }
    block[block_len++] = counter;

    uint8_t hmac_out[32];
    espnow_crypto_hmac_sha256(prk, prk_len, block, block_len, hmac_out);
    memcpy(t, hmac_out, 32);

    size_t copy = (offset + 32 <= out_len) ? 32 : (out_len - offset);
    memcpy(out + offset, t, copy);
    offset += copy;
  }
}

}  // namespace espnow_lr
}  // namespace esphome