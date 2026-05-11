#include "../components/esp_tree_common/espnow_types.h"

#include <cstdint>
#include <iostream>

using namespace esphome::esp_tree;

static int failures = 0;

static void expect(bool cond, const char* msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

int main() {
  expect(static_cast<uint8_t>(espnow_log_state_t::NONE) == 0, "NONE = 0");
  expect(static_cast<uint8_t>(espnow_log_state_t::DISCOVERING) == 1, "DISCOVERING = 1");
  expect(static_cast<uint8_t>(espnow_log_state_t::JOINING) == 2, "JOINING = 2");
  expect(static_cast<uint8_t>(espnow_log_state_t::JOINED) == 3, "JOINED = 3");
  expect(static_cast<uint8_t>(espnow_log_state_t::STATE_SYNC) == 4, "STATE_SYNC = 4");
  expect(static_cast<uint8_t>(espnow_log_state_t::NORMAL) == 5, "NORMAL = 5");
  expect(static_cast<uint8_t>(espnow_log_state_t::PROVIDING_RELAY) == 6, "PROVIDING_RELAY = 6");

  return failures == 0 ? 0 : 1;
}