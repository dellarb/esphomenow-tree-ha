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
  expect(ESPNOW_JOIN_STATUS_SCHEMA_REFRESH == 1, "SCHEMA_REFRESH == 1");
  expect(ESPNOW_JOIN_STATUS_SEND_STATE == 2, "SEND_STATE == 2");
  expect(ESPNOW_JOIN_STATUS_COMPLETE == 100, "COMPLETE == 100");
  expect(ESPNOW_JOIN_REASON_WAIT == 3, "WAIT == 3");

  expect(ESPNOW_JOIN_STATUS_COMPLETE > ESPNOW_JOIN_STATUS_SCHEMA_REFRESH, "COMPLETE > SCHEMA_REFRESH");
  expect(ESPNOW_JOIN_STATUS_COMPLETE > ESPNOW_JOIN_STATUS_SEND_STATE, "COMPLETE > SEND_STATE");
  expect(ESPNOW_JOIN_STATUS_SCHEMA_REFRESH != ESPNOW_JOIN_STATUS_SEND_STATE, "SCHEMA_REFRESH != SEND_STATE");
  expect(ESPNOW_JOIN_REASON_WAIT != ESPNOW_JOIN_STATUS_COMPLETE, "WAIT != COMPLETE");

  return failures == 0 ? 0 : 1;
}