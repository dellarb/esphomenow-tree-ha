#pragma once

#include "bridge_api_types.h"

#include <cstddef>
#include <cstdint>
#include <string>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

class BridgeApiAuth {
 public:
  BridgeApiAuth() = default;

  void set_api_key(const std::string *api_key) { api_key_ = api_key; }
  bool has_api_key() const;

  AuthChallenge create_challenge() const;

  // HMAC input:
  //   espnow-tree-ws|v1|<client>|<server_nonce_hex>|<client_nonce>
  //
  // HMAC key:
  //   configured api_key bytes
  //
  // Output:
  //   lowercase hex HMAC-SHA256 digest
  //
  // Implementation should call:
  //   espnow_crypto_hmac_sha256(api_key.data(), api_key.size(),
  //                             input.data(), input.size(), digest)
  std::string expected_hmac_hex(const std::string &client, const std::string &server_nonce_hex,
                                const std::string &client_nonce) const;

  bool verify_response(const AuthChallenge &challenge, const AuthResponse &response) const;

  static std::string bytes_to_lower_hex(const uint8_t *data, size_t len);
  static bool is_lower_or_upper_hex(const std::string &value);
  static bool constant_time_equal(const std::string &a, const std::string &b);

 private:
  const std::string *api_key_{nullptr};
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
