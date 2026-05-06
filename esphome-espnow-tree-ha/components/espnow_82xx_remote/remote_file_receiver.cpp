#include "remote_file_receiver.h"

#include "esphome/core/hal.h"
#include "esphome/core/log.h"

namespace esphome {
namespace espnow_lr {

static const char *const TAG = "espnow.file";

FileReceiver::FileReceiver() = default;

void FileReceiver::set_local_mac(const uint8_t *mac) {
  if (mac == nullptr) {
    return;
  }
  std::copy_n(mac, local_mac_.size(), local_mac_.begin());
}

void FileReceiver::set_max_chunk_size(uint16_t max_chunk) {
  max_chunk_size_ = max_chunk;
}

void FileReceiver::register_handler(uint8_t, ActionHandler *handler) {
  (void) handler;
}

bool FileReceiver::handle_file_transfer(const uint8_t *, size_t) {
  return false;
}

bool FileReceiver::handle_file_data(const uint8_t *, size_t) {
  return false;
}

void FileReceiver::loop() {}

void FileReceiver::abort(uint8_t, bool) {}

}  // namespace espnow_lr
}  // namespace esphome
