#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <iostream>
#include <vector>
#include "../components/components/esp_tree_common/cobs_codec.h"

using namespace esphome::esp_tree;

static int failures = 0;

static void expect(bool cond, const char *msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

static size_t cobs_max_encoded(size_t len) {
  return len + len / 254 + 2;
}

static void test_empty_round_trip() {
  std::vector<uint8_t> encoded(cobs_max_encoded(0) + 1);
  size_t enc_len = cobs_encode(nullptr, 0, encoded.data());
  expect(enc_len == 1, "empty encode length should be 1");

  std::vector<uint8_t> decoded(enc_len + 1);
  size_t dec_len = 0;
  bool ok = cobs_decode(encoded.data(), enc_len, decoded.data(), dec_len);
  expect(ok, "empty decode should succeed");
  expect(dec_len == 0, "empty decode should produce 0 bytes");
}

static void test_simple_round_trip() {
  std::vector<uint8_t> input = {0x01, 0x02, 0x03, 0x04, 0x05};
  std::vector<uint8_t> encoded(cobs_max_encoded(input.size()));
  size_t enc_len = cobs_encode(input.data(), input.size(), encoded.data());
  expect(enc_len > 0, "simple encode should produce output");

  std::vector<uint8_t> decoded(input.size() + 1);
  size_t dec_len = 0;
  bool ok = cobs_decode(encoded.data(), enc_len, decoded.data(), dec_len);
  expect(ok, "simple decode should succeed");
  expect(dec_len == input.size(), "simple decode length matches");
  expect(memcmp(decoded.data(), input.data(), input.size()) == 0, "simple round-trip matches");
}

static void test_with_zeroes() {
  std::vector<uint8_t> input = {0x01, 0x00, 0x02, 0x00, 0x00, 0x03};
  std::vector<uint8_t> encoded(cobs_max_encoded(input.size()));
  size_t enc_len = cobs_encode(input.data(), input.size(), encoded.data());
  expect(enc_len > 0, "zeroes encode should produce output");

  std::vector<uint8_t> decoded(input.size() + 1);
  size_t dec_len = 0;
  bool ok = cobs_decode(encoded.data(), enc_len, decoded.data(), dec_len);
  expect(ok, "zeroes decode should succeed");
  expect(dec_len == input.size(), "zeroes decode length matches");
  expect(memcmp(decoded.data(), input.data(), input.size()) == 0, "zeroes round-trip matches");
}

static void test_long_round_trip() {
  std::vector<uint8_t> input(10000);
  for (size_t i = 0; i < input.size(); i++) {
    input[i] = (i % 100 == 0) ? 0x00 : static_cast<uint8_t>(i & 0xFF);
  }

  std::vector<uint8_t> encoded(cobs_max_encoded(input.size()));
  size_t enc_len = cobs_encode(input.data(), input.size(), encoded.data());
  expect(enc_len > 0, "long encode should produce output");

  std::vector<uint8_t> decoded(input.size() + 1);
  size_t dec_len = 0;
  bool ok = cobs_decode(encoded.data(), enc_len, decoded.data(), dec_len);
  expect(ok, "long decode should succeed");
  expect(dec_len == input.size(), "long decode length matches");
  expect(memcmp(decoded.data(), input.data(), input.size()) == 0, "long round-trip matches");
}

static void test_max_frame_round_trip() {
  std::vector<uint8_t> input(65536);
  for (size_t i = 0; i < input.size(); i++) {
    input[i] = static_cast<uint8_t>(i & 0xFF);
  }

  std::vector<uint8_t> encoded(cobs_max_encoded(input.size()));
  size_t enc_len = cobs_encode(input.data(), input.size(), encoded.data());
  expect(enc_len > 0, "max frame encode should produce output");
  expect(enc_len <= kMaxWireFrameBytes, "max frame encoded fits in kMaxWireFrameBytes");

  std::vector<uint8_t> decoded(input.size() + 1);
  size_t dec_len = 0;
  bool ok = cobs_decode(encoded.data(), enc_len, decoded.data(), dec_len);
  expect(ok, "max frame decode should succeed");
  expect(dec_len == input.size(), "max frame decode length matches");
  expect(memcmp(decoded.data(), input.data(), input.size()) == 0, "max frame round-trip matches");
}

static void test_golden_file_decode() {
  std::vector<uint8_t> input = {
    0x08, 0x01, 0x12, 0x0A, 0x0A, 0x19, 0x4D, 0x61,
    0x63, 0x3A, 0x41, 0x41, 0x42, 0x42, 0x43, 0x43,
    0x10, 0xFF, 0x18, 0x01, 0x20, 0x01
  };

  std::vector<uint8_t> encoded(cobs_max_encoded(input.size()));
  size_t enc_len = cobs_encode(input.data(), input.size(), encoded.data());
  expect(enc_len > 0, "golden encode should produce output");

  std::vector<uint8_t> decoded(input.size() + 1);
  size_t dec_len = 0;
  bool ok = cobs_decode(encoded.data(), enc_len, decoded.data(), dec_len);
  expect(ok, "golden decode should succeed");
  expect(dec_len == input.size(), "golden decode length matches");
  expect(memcmp(decoded.data(), input.data(), input.size()) == 0, "golden round-trip matches");
}

static void test_decode_failure_cases() {
  size_t dec_len = 0;
  std::vector<uint8_t> output(256);

  bool ok = cobs_decode(nullptr, 0, output.data(), dec_len);
  expect(!ok, "decode empty input should fail");

  std::vector<uint8_t> zero_code = {0x00};
  ok = cobs_decode(zero_code.data(), 1, output.data(), dec_len);
  expect(!ok, "decode with code byte 0 should fail");

  std::vector<uint8_t> overrun = {0x05, 0x01, 0x02};
  ok = cobs_decode(overrun.data(), 3, output.data(), dec_len);
  expect(!ok, "decode with overrunning code should fail");
}

int main() {
  test_empty_round_trip();
  test_simple_round_trip();
  test_with_zeroes();
  test_long_round_trip();
  test_max_frame_round_trip();
  test_golden_file_decode();
  test_decode_failure_cases();
  if (failures != 0) {
    std::cerr << failures << " failure(s)\n";
    return 1;
  }
  return 0;
}