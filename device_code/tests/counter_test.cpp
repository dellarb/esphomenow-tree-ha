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
  expect(counter_is_newer(5, 4), "counter advances");
  expect(!counter_is_newer(4, 5), "counter rollback rejected");
  expect(counter_is_newer(0, 0xFFFFFFFF), "wrap-around: 0 > 0xFFFFFFFF");
  expect(!counter_is_newer(0xFFFFFFFF, 0), "wrap-around: 0xFFFFFFFF > 0 rejected");
  expect(counter_is_newer(100, 99), "typical advance");
  expect(!counter_is_newer(99, 100), "replay rejected");
  expect(counter_is_newer(1, 0), "single step advance");
  expect(counter_is_newer(0x7FFFFFFF, 0x7FFFFFFE), "int max minus 1");
  expect(!counter_is_newer(0x7FFFFFFE, 0x7FFFFFFF), "int max minus 1 rollback");

  return failures == 0 ? 0 : 1;
}