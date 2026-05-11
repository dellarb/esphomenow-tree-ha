#include "../components/esp_tree_common/espnow_types.h"

#include <cstdint>
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

int main() {
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 0) == 0x00, "upstream dir 0");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 0) == 0x80, "downstream dir 0");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 4) == 0x04, "upstream count 4");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 4) == 0x84, "downstream count 4");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 15) == 0x0F, "max count 15 upstream");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 15) == 0x8F, "max count 15 downstream");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 1) == 0x01, "upstream count 1");
  expect(ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 1) == 0x81, "downstream count 1");

  expect(ESPNOW_HOPS_COUNT(0x04) == 4, "count extracted from upstream");
  expect(ESPNOW_HOPS_COUNT(0x84) == 4, "count extracted from downstream");
  expect(ESPNOW_HOPS_COUNT(0x00) == 0, "count zero");
  expect(ESPNOW_HOPS_COUNT(0x0F) == 15, "count max");
  expect(ESPNOW_HOPS_COUNT(0x8F) == 15, "count max from downstream");

  expect(ESPNOW_HOPS_IS_UPSTREAM(0x00), "0x00 is upstream");
  expect(ESPNOW_HOPS_IS_UPSTREAM(0x04), "0x04 is upstream");
  expect(ESPNOW_HOPS_IS_UPSTREAM(0x0F), "0x0F is upstream");
  expect(!ESPNOW_HOPS_IS_UPSTREAM(0x80), "0x80 is not upstream");
  expect(!ESPNOW_HOPS_IS_UPSTREAM(0x84), "0x84 is not upstream");
  expect(!ESPNOW_HOPS_IS_UPSTREAM(0x8F), "0x8F is not upstream");

  expect(ESPNOW_HOPS_IS_DOWNSTREAM(0x80), "0x80 is downstream");
  expect(ESPNOW_HOPS_IS_DOWNSTREAM(0x84), "0x84 is downstream");
  expect(ESPNOW_HOPS_IS_DOWNSTREAM(0x8F), "0x8F is downstream");
  expect(!ESPNOW_HOPS_IS_DOWNSTREAM(0x00), "0x00 is not downstream");
  expect(!ESPNOW_HOPS_IS_DOWNSTREAM(0x04), "0x04 is not downstream");
  expect(!ESPNOW_HOPS_IS_DOWNSTREAM(0x0F), "0x0F is not downstream");

  expect(ESPNOW_HOPS_COUNT_MASK == 0x0F, "count mask is 0x0F");
  expect(ESPNOW_HOPS_DIR_BIT == 0x80, "direction bit is 0x80");
  expect(ESPNOW_HOPS_PARENT_CHECK_BIT == 0x40, "parent_check bit is 0x40");

  uint8_t upstream_3 = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 3);
  expect(ESPNOW_HOPS_IS_UPSTREAM(upstream_3), "upstream_3 is upstream");
  expect(ESPNOW_HOPS_COUNT(upstream_3) == 3, "upstream_3 count = 3");

  uint8_t downstream_2 = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 2);
  expect(ESPNOW_HOPS_IS_DOWNSTREAM(downstream_2), "downstream_2 is downstream");
  expect(ESPNOW_HOPS_COUNT(downstream_2) == 2, "downstream_2 count = 2");

  uint8_t upstream_parent = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 3) | ESPNOW_HOPS_PARENT_CHECK_BIT;
  expect(ESPNOW_HOPS_IS_UPSTREAM(upstream_parent), "upstream+parent is upstream");
  expect(ESPNOW_HOPS_COUNT(upstream_parent) == 3, "upstream+parent count = 3");
  expect((upstream_parent & ESPNOW_HOPS_PARENT_CHECK_BIT) != 0, "parent_check bit set");

  uint8_t downstream_plain = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 5);
  expect((downstream_plain & ESPNOW_HOPS_PARENT_CHECK_BIT) == 0, "no parent_check on plain downstream");

  return failures == 0 ? 0 : 1;
}