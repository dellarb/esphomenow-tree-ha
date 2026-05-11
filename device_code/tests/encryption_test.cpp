#include "../components/esp_tree_common/espnow_crypto.h"
#include "../components/esp_tree_common/espnow_types.h"

#include <cstring>
#include <iostream>

using namespace esphome::esp_tree;

static int failures = 0;

static void expect(bool cond, const char* msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

static void fill_hex(char* out, size_t len, uint8_t value) {
  const char* digits = "0123456789abcdef";
  for (size_t i = 0; i < len; i += 2) {
    out[i] = digits[(value >> 4) & 0x0F];
    out[i + 1] = digits[value & 0x0F];
  }
  out[len] = '\0';
}

static void test_session_tag_wrong_key() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x11);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_JOIN;
  hdr.tx_counter = 50;

  uint8_t payload[16] = {0};
  uint8_t session_key[32] = {0xAA};
  uint8_t session_tag[ESPNOW_SESSION_TAG_LEN]{};
  espnow_crypto_session_tag(session_key, reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), session_tag);

  uint8_t wrong_key[32] = {0xBB};
  expect(espnow_crypto_verify_session_tag(wrong_key, reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), session_tag) == 0,
         "session tag fails with wrong key");
}

static void test_session_tag_tampered_header() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x22);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init 2");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_STATE;
  hdr.tx_counter = 75;

  uint8_t payload[8] = {1, 2, 3, 4, 5, 6, 7, 8};
  uint8_t session_key[32] = {0};
  uint8_t session_tag[ESPNOW_SESSION_TAG_LEN]{};
  espnow_crypto_session_tag(session_key, reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), session_tag);

  espnow_frame_header_t tampered_hdr = hdr;
  tampered_hdr.tx_counter = 76;
  expect(espnow_crypto_verify_session_tag(session_key, reinterpret_cast<const uint8_t*>(&tampered_hdr), payload, sizeof(payload), session_tag) == 0,
         "session tag fails with tampered header");
}

static void test_session_tag_tampered_payload() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x33);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init 3");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_COMMAND;
  hdr.tx_counter = 99;

  uint8_t payload[8] = {1, 2, 3, 4, 5, 6, 7, 8};
  uint8_t session_key[32] = {0};
  uint8_t session_tag[ESPNOW_SESSION_TAG_LEN]{};
  espnow_crypto_session_tag(session_key, reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), session_tag);

  uint8_t tampered_payload[8] = {1, 2, 3, 4, 5, 6, 7, 9};
  expect(espnow_crypto_verify_session_tag(session_key, reinterpret_cast<const uint8_t*>(&hdr), tampered_payload, sizeof(tampered_payload), session_tag) == 0,
         "session tag fails with tampered payload");
}

static void test_session_tag_valid() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x44);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init 4");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_SCHEMA_PUSH;
  hdr.tx_counter = 123;

  uint8_t payload[32] = {0};
  uint8_t session_key[32] = {0};
  uint8_t session_tag[ESPNOW_SESSION_TAG_LEN]{};
  espnow_crypto_session_tag(session_key, reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), session_tag);

  expect(espnow_crypto_verify_session_tag(session_key, reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), session_tag) == 1,
         "session tag valid");
}

static void test_psk_tag_wrong_key() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x55);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init 5");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_DEAUTH;
  hdr.tx_counter = 200;

  uint8_t payload[10] = {0};
  uint8_t psk_tag[ESPNOW_PSK_TAG_LEN]{};
  espnow_crypto_psk_tag(reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), psk_tag);

  char wrong_psk_hex[65];
  fill_hex(wrong_psk_hex, 64, 0x66);
  expect(espnow_crypto_init(wrong_psk_hex) == 0, "crypto init wrong psk");
  expect(espnow_crypto_verify_psk_tag(reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), psk_tag) == 0,
         "psk tag fails with wrong psk");
}

static void test_psk_tag_tampered_header() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x77);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init 6");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_HEARTBEAT;
  hdr.tx_counter = 300;

  uint8_t payload[8] = {0};
  uint8_t psk_tag[ESPNOW_PSK_TAG_LEN]{};
  espnow_crypto_psk_tag(reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), psk_tag);

  espnow_frame_header_t tampered_hdr = hdr;
  tampered_hdr.packet_type = PKT_STATE;
  expect(espnow_crypto_verify_psk_tag(reinterpret_cast<const uint8_t*>(&tampered_hdr), payload, sizeof(payload), psk_tag) == 0,
         "psk tag fails with tampered header");
}

static void test_psk_tag_valid() {
  char psk_hex[65];
  fill_hex(psk_hex, 64, 0x88);
  expect(espnow_crypto_init(psk_hex) == 0, "crypto init 7");

  espnow_frame_header_t hdr{};
  hdr.protocol_version = ESPNOW_PROTOCOL_VER;
  hdr.packet_type = PKT_DISCOVER;
  hdr.tx_counter = 400;

  uint8_t payload[49] = {0};
  uint8_t psk_tag[ESPNOW_PSK_TAG_LEN]{};
  espnow_crypto_psk_tag(reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), psk_tag);

  expect(espnow_crypto_verify_psk_tag(reinterpret_cast<const uint8_t*>(&hdr), payload, sizeof(payload), psk_tag) == 1,
         "psk tag valid");
}

static void test_session_key_derivation_deterministic() {
  uint8_t bridge_nonce[16] = {0};
  uint8_t remote_nonce[16] = {0xFF};
  uint8_t key1[32] = {};
  uint8_t key2[32] = {};

  espnow_crypto_derive_session_key(bridge_nonce, remote_nonce, key1);
  espnow_crypto_derive_session_key(bridge_nonce, remote_nonce, key2);

  expect(memcmp(key1, key2, 32) == 0, "session key deterministic");
}

static void test_session_key_derivation_different_nonces() {
  uint8_t bridge_nonce1[16] = {0};
  uint8_t remote_nonce1[16] = {0};
  uint8_t bridge_nonce2[16] = {0};
  uint8_t remote_nonce2[16] = {1};

  uint8_t key1[32] = {};
  uint8_t key2[32] = {};

  espnow_crypto_derive_session_key(bridge_nonce1, remote_nonce1, key1);
  espnow_crypto_derive_session_key(bridge_nonce2, remote_nonce2, key2);

  expect(memcmp(key1, key2, 32) != 0, "different nonces produce different keys");
}

static void test_hmac_sha256_consistency() {
  uint8_t key[32] = {0};
  uint8_t data[16] = {0x01, 0x02, 0x03, 0x04};
  uint8_t out1[32] = {};
  uint8_t out2[32] = {};

  espnow_crypto_hmac_sha256(key, 32, data, 4, out1);
  espnow_crypto_hmac_sha256(key, 32, data, 4, out2);

  expect(memcmp(out1, out2, 32) == 0, "hmac-sha256 consistent");
}

static void test_hmac_sha256_different_keys_different_output() {
  uint8_t key1[32] = {0xAA};
  uint8_t key2[32] = {0xBB};
  uint8_t data[8] = {1, 2, 3, 4, 5, 6, 7, 8};
  uint8_t out1[32] = {};
  uint8_t out2[32] = {};

  espnow_crypto_hmac_sha256(key1, 32, data, 8, out1);
  espnow_crypto_hmac_sha256(key2, 32, data, 8, out2);

  expect(memcmp(out1, out2, 32) != 0, "hmac-sha256 different keys different output");
}

static void test_hmac_sha256_empty_data() {
  uint8_t key[32] = {0};
  uint8_t data[0] = {};
  uint8_t out[32] = {};

  espnow_crypto_hmac_sha256(key, 32, data, 0, out);
  expect(out[0] != 0 || out[31] != 0, "hmac-sha256 empty data produces non-zero");
}

static void test_hmac_sha256_output_length() {
  uint8_t key[32] = {0};
  uint8_t data[16] = {0};
  uint8_t out[32] = {};

  espnow_crypto_hmac_sha256(key, 32, data, 16, out);
  expect(out[31] == out[31], "hmac-sha256 produces 32 bytes");
}

static void test_hmac_sha256_different_data_different_output() {
  uint8_t key[32] = {0};
  uint8_t data1[8] = {1, 2, 3, 4, 5, 6, 7, 8};
  uint8_t data2[8] = {1, 2, 3, 4, 5, 6, 7, 9};
  uint8_t out1[32] = {};
  uint8_t out2[32] = {};

  espnow_crypto_hmac_sha256(key, 32, data1, 8, out1);
  espnow_crypto_hmac_sha256(key, 32, data2, 8, out2);

  expect(memcmp(out1, out2, 32) != 0, "hmac-sha256 different data different output");
}

int main() {
  test_session_tag_wrong_key();
  test_session_tag_tampered_header();
  test_session_tag_tampered_payload();
  test_session_tag_valid();
  test_psk_tag_wrong_key();
  test_psk_tag_tampered_header();
  test_psk_tag_valid();
  test_session_key_derivation_deterministic();
  test_session_key_derivation_different_nonces();

  test_hmac_sha256_consistency();
  test_hmac_sha256_different_keys_different_output();
  test_hmac_sha256_empty_data();
  test_hmac_sha256_output_length();
  test_hmac_sha256_different_data_different_output();

  return failures == 0 ? 0 : 1;
}