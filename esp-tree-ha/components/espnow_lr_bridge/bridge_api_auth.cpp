#include "bridge_api_auth.h"
#include "espnow_lr_common/espnow_crypto.h"

#include <algorithm>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

namespace {

static char lower_hex_digit(uint8_t value) {
  static constexpr char kDigits[] = "0123456789abcdef";
  return kDigits[value & 0x0F];
}

static char to_lower_ascii(char ch) {
  if (ch >= 'A' && ch <= 'Z') {
    return static_cast<char>(ch - 'A' + 'a');
  }
  return ch;
}

}  // namespace

bool BridgeApiAuth::has_api_key() const { return api_key_ != nullptr && !api_key_->empty(); }

AuthChallenge BridgeApiAuth::create_challenge() const {
  AuthChallenge challenge;
  fill_random_bytes(challenge.server_nonce.data(), challenge.server_nonce.size());
  challenge.server_nonce_hex = bytes_to_lower_hex(challenge.server_nonce.data(), challenge.server_nonce.size());
  return challenge;
}

std::string BridgeApiAuth::expected_hmac_hex(const std::string &client, const std::string &server_nonce_hex,
                                             const std::string &client_nonce) const {
  if (!has_api_key()) {
    return "";
  }

  const std::string input = std::string(kProtocolName) + "|" + kProtocolVersionLabel + "|" + client + "|" +
                            server_nonce_hex + "|" + client_nonce;
  uint8_t digest[kHmacDigestBytes]{};
  espnow_crypto_hmac_sha256(reinterpret_cast<const uint8_t *>(api_key_->data()), api_key_->size(),
                            reinterpret_cast<const uint8_t *>(input.data()), input.size(), digest);
  return bytes_to_lower_hex(digest, sizeof(digest));
}

bool BridgeApiAuth::verify_response(const AuthChallenge &challenge, const AuthResponse &response) const {
  if (!has_api_key() || challenge.server_nonce_hex.empty() || response.client.empty() || response.client_nonce.empty() ||
      response.hmac_hex.size() != kHmacHexChars || !is_lower_or_upper_hex(response.hmac_hex)) {
    return false;
  }

  std::string received = response.hmac_hex;
  std::transform(received.begin(), received.end(), received.begin(), to_lower_ascii);
  const std::string expected = expected_hmac_hex(response.client, challenge.server_nonce_hex, response.client_nonce);
  return expected.size() == kHmacHexChars && constant_time_equal(expected, received);
}

std::string BridgeApiAuth::bytes_to_lower_hex(const uint8_t *data, size_t len) {
  if (data == nullptr && len != 0) {
    return "";
  }

  std::string out;
  out.resize(len * 2);
  for (size_t i = 0; i < len; ++i) {
    out[i * 2] = lower_hex_digit(static_cast<uint8_t>(data[i] >> 4));
    out[i * 2 + 1] = lower_hex_digit(data[i]);
  }
  return out;
}

bool BridgeApiAuth::is_lower_or_upper_hex(const std::string &value) {
  for (char ch : value) {
    const bool is_digit = ch >= '0' && ch <= '9';
    const bool is_lower = ch >= 'a' && ch <= 'f';
    const bool is_upper = ch >= 'A' && ch <= 'F';
    if (!is_digit && !is_lower && !is_upper) {
      return false;
    }
  }
  return true;
}

bool BridgeApiAuth::constant_time_equal(const std::string &a, const std::string &b) {
  const size_t max_len = a.size() > b.size() ? a.size() : b.size();
  uint8_t diff = static_cast<uint8_t>(a.size() ^ b.size());
  for (size_t i = 0; i < max_len; ++i) {
    const uint8_t av = i < a.size() ? static_cast<uint8_t>(a[i]) : 0;
    const uint8_t bv = i < b.size() ? static_cast<uint8_t>(b[i]) : 0;
    diff |= static_cast<uint8_t>(av ^ bv);
  }
  return diff == 0;
}

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
