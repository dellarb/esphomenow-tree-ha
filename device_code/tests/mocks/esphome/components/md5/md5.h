#pragma once

#include <openssl/md5.h>

#include <cstddef>
#include <cstdint>

namespace esphome {
namespace md5 {

class MD5Digest {
 public:
  void init() {
    MD5_Init(&ctx_);
    finalized_ = false;
  }

  void add(const uint8_t *data, size_t len) {
    if (data != nullptr && len > 0) {
      MD5_Update(&ctx_, data, len);
    }
  }

  void calculate() {
    if (!finalized_) {
      MD5_Final(digest_, &ctx_);
      finalized_ = true;
    }
  }

  void get_bytes(uint8_t out[16]) const {
    if (out == nullptr) {
      return;
    }
    for (size_t i = 0; i < 16; ++i) {
      out[i] = digest_[i];
    }
  }

 private:
  MD5_CTX ctx_{};
  uint8_t digest_[16]{};
  bool finalized_{false};
};

}  // namespace md5
}  // namespace esphome
