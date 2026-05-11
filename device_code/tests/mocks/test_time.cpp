#include "test_time.h"
#include <cstdint>
#include <random>

namespace test {

static uint32_t g_mock_time_ms = 0;
static uint32_t g_mock_random_seed = 12345;
static std::mt19937 g_mock_rng(g_mock_random_seed);

uint32_t mock_time_ms() {
  return g_mock_time_ms;
}

uint32_t mock_random() {
  return g_mock_rng();
}

void set_mock_time_ms(uint32_t t) {
  g_mock_time_ms = t;
}

void advance_mock_time_ms(uint32_t delta) {
  g_mock_time_ms += delta;
}

void set_mock_random_seed(uint32_t seed) {
  g_mock_random_seed = seed;
  g_mock_rng.seed(seed);
}

void reset_mock_state() {
  g_mock_time_ms = 0;
  g_mock_random_seed = 12345;
  g_mock_rng.seed(g_mock_random_seed);
}

}