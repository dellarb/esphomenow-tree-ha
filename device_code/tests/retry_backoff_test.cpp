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
  expect(ESPNOW_DISCOVER_COLLECTION_WINDOW_MS == 40, "DISCOVER_COLLECTION_WINDOW_MS = 40");
  expect(ESPNOW_WIFI_DISCOVER_WAIT_MS == 15000, "WIFI_DISCOVER_WAIT_MS = 15000");
  expect(ESPNOW_DISCOVER_BACKOFF_START_MS == 500, "DISCOVER_BACKOFF_START_MS = 500");
  expect(ESPNOW_DISCOVER_BACKOFF_2_MS == 1000, "DISCOVER_BACKOFF_2_MS = 1000");
  expect(ESPNOW_DISCOVER_BACKOFF_3_MS == 2000, "DISCOVER_BACKOFF_3_MS = 2000");
  expect(ESPNOW_DISCOVER_BACKOFF_4_MS == 4000, "DISCOVER_BACKOFF_4_MS = 4000");
  expect(ESPNOW_DISCOVER_BACKOFF_CAP_MS == 6000, "DISCOVER_BACKOFF_CAP_MS = 6000");

  expect(ESPNOW_RETRY_INTERVAL_MS == 200, "RETRY_INTERVAL_MS = 200");
  expect(ESPNOW_RETRY_JITTER_MS == 50, "RETRY_JITTER_MS = 50");

  expect(ESPNOW_RETRY_INTERVAL_MS >= ESPNOW_RETRY_JITTER_MS * 2, "retry interval >= jitter * 2");

  expect(RETRY_BACKOFF_MS[0] == 200, "RETRY_BACKOFF[0] = 200 (preserves original base)");
  expect(RETRY_BACKOFF_MS[1] == 400, "RETRY_BACKOFF[1] = 400");
  expect(RETRY_BACKOFF_MS[2] == 800, "RETRY_BACKOFF[2] = 800");
  expect(RETRY_BACKOFF_MS[3] == 1600, "RETRY_BACKOFF[3] = 1600");
  expect(ESPNOW_MAX_RETRIES == 4, "MAX_RETRIES = 4 (unified retry limit)");

  return failures == 0 ? 0 : 1;
}
