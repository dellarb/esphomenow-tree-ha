#pragma once
// Stub – MD5 not needed for standalone test
namespace esphome { namespace md5 {
struct MD5Digest {
  void init() {}
  void add(const uint8_t*, size_t) {}
  void calculate() {}
  void get_bytes(uint8_t*) { memset(out, 0, 16); }
};
}} // namespace
