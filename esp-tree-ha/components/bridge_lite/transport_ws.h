#pragma once

#include "transport.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include <esp_err.h>
#include <esp_timer.h>

#if USE_ESP32
namespace esphome {
namespace web_server_idf {
class AsyncWebServerRequest;
}
namespace espnow_lr {
class BridgeLite;

class BridgeLiteWsTransport : public BridgeTransport {
 public:
  explicit BridgeLiteWsTransport(BridgeLite *bridge);
  ~BridgeLiteWsTransport() override;

  bool start() override;
  bool is_connected() override;
  bool send(const uint8_t *data, size_t len) override;
  void stop() override;
  void loop() override;

  bool register_with_web_server();

 protected:
  bool send_auth_challenge_();
  bool verify_auth_response_(const std::string &json);
  void derive_session_keys_(const std::vector<uint8_t> &client_nonce);

  bool encrypt_and_send_(const uint8_t *data, size_t len);
  bool decrypt_frame_(const uint8_t *data, size_t len, std::vector<uint8_t> &out);
  bool read_ws_frame_();
  std::string websocket_accept_key(const std::string &client_key);

  static std::string bytes_to_hex(const uint8_t *data, size_t len);
  static bool hex_to_bytes(const std::string &hex, std::vector<uint8_t> &out);
  static bool compute_hmac_sha256(const std::string &key, const std::string &data, std::string &out_hex);
  static void hkdf_sha256(const uint8_t *salt, size_t salt_len, const uint8_t *ikm, size_t ikm_len,
                          const uint8_t *info, size_t info_len, uint8_t *okm, size_t okm_len);

  void handle_ws_request(web_server_idf::AsyncWebServerRequest *request);

  BridgeLite *bridge_;
  bool running_{false};
  bool ws_registered_{false};
  bool connected_{false};
  int client_fd_{-1};
  uint64_t last_loop_ms_{0};

  std::vector<uint8_t> server_nonce_;
  std::vector<uint8_t> session_key_c2s_;
  std::vector<uint8_t> session_key_s2c_;
  uint32_t c2s_counter_{0};
  uint32_t s2c_counter_{0};

  bool auth_complete_{false};

  enum class AuthState {
    IDLE,
    CHALLENGE_SENT,
    AUTHENTICATED,
  };
  AuthState auth_state_{AuthState::IDLE};

  std::vector<uint8_t> rx_buf_;
  size_t rx_pos_{0};

  static constexpr const char *kWebSocketPath = "/espnow-tree/lite/v1/ws";
  static constexpr size_t MAX_PAYLOAD = 1400;
  static constexpr const char *SESSION_INFO = "espnow-tree-lite-v1-session";
  static constexpr const char *kWsGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
};

}  // namespace espnow_lr
}  // namespace esphome
#else
namespace esphome {
namespace espnow_lr {
class BridgeLite;

class BridgeLiteWsTransport : public BridgeTransport {
 public:
  explicit BridgeLiteWsTransport(BridgeLite *bridge);
  ~BridgeLiteWsTransport() override;

  bool start() override;
  bool is_connected() override;
  bool send(const uint8_t *data, size_t len) override;
  void stop() override;
  void loop() override;

  bool register_with_web_server();

 protected:
  bool encrypt_and_send_(const uint8_t *data, size_t len);
  bool decrypt_frame_(const uint8_t *data, size_t len, std::vector<uint8_t> &out);

  static std::string bytes_to_hex(const uint8_t *data, size_t len);
  static bool hex_to_bytes(const std::string &hex, std::vector<uint8_t> &out);

  BridgeLite *bridge_;
  bool running_{false};
  bool ws_registered_{false};
  bool connected_{false};
  int client_fd_{-1};
  uint64_t last_loop_ms_{0};

  std::vector<uint8_t> server_nonce_;
  std::vector<uint8_t> session_key_c2s_;
  std::vector<uint8_t> session_key_s2c_;
  uint32_t c2s_counter_{0};
  uint32_t s2c_counter_{0};

  bool auth_complete_{false};

  enum class AuthState {
    IDLE,
    CHALLENGE_SENT,
    AUTHENTICATED,
  };
  AuthState auth_state_{AuthState::IDLE};

  std::vector<uint8_t> rx_buf_;
  size_t rx_pos_{0};

  static constexpr const char *kWebSocketPath = "/espnow-tree/lite/v1/ws";
  static constexpr size_t MAX_PAYLOAD = 1400;
  static constexpr const char *SESSION_INFO = "espnow-tree-lite-v1-session";
  static constexpr const char *kWsGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
};

}  // namespace espnow_lr
}  // namespace esphome
#endif