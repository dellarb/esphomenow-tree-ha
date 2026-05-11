#include "../components/esp_tree_common/espnow_types.h"

#include <algorithm>
#include <cstring>
#include <iostream>
#include <vector>

using namespace esphome::esp_tree;

static int failures = 0;

static void expect(bool cond, const char* msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

static void test_assembly_init() {
  espnow_fragment_assembly_t a{};
  expect(!a.active, "init: active=false");
  expect(a.bytes_received == 0, "init: bytes_received=0");
  expect(a.entity_index == 0, "init: entity_index=0");
}

static void test_assembly_single_fragment() {
  espnow_fragment_assembly_t a{};
  a.entity_index = 3;
  a.fragment_count = 1;
  a.active = true;
  a.message_tx_base = 50;
  a.first_seen_ms = 1000;
  a.last_seen_ms = 1000;
  a.bytes_received = 5;
  a.data = {1, 2, 3, 4, 5};
  a.lengths = {5};

  expect(a.active, "single fragment: active");
  expect(a.entity_index == 3, "single fragment: entity_index");
  expect(a.fragment_count == 1, "single fragment: count");
  expect(a.data.size() == 5, "single fragment: data size");
}

static void test_assembly_multi_fragment_orderly() {
  espnow_fragment_assembly_t a{};
  a.entity_index = 7;
  a.fragment_count = 3;
  a.active = true;
  a.message_tx_base = 100;

  std::vector<uint8_t> frag0 = {0xAA, 0xBB};
  std::vector<uint8_t> frag1 = {0xCC, 0xDD};
  std::vector<uint8_t> frag2 = {0xEE, 0xFF};

  a.data.insert(a.data.end(), frag0.begin(), frag0.end());
  a.lengths.push_back(static_cast<uint8_t>(frag0.size()));
  a.bytes_received += frag0.size();

  a.data.insert(a.data.end(), frag1.begin(), frag1.end());
  a.lengths.push_back(static_cast<uint8_t>(frag1.size()));
  a.bytes_received += frag1.size();

  a.data.insert(a.data.end(), frag2.begin(), frag2.end());
  a.lengths.push_back(static_cast<uint8_t>(frag2.size()));
  a.bytes_received += frag2.size();

  expect(a.bytes_received == 6, "multi-fragment: total bytes");
  expect(a.lengths.size() == 3, "multi-fragment: fragment count");

  uint8_t expected[] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};
  expect(a.data.size() == 6, "multi-fragment: data size correct");
  expect(memcmp(a.data.data(), expected, 6) == 0, "multi-fragment: reassembled bytes correct");
}

static void test_assembly_reassembly_three_fragments() {
  espnow_fragment_assembly_t assembly{};
  assembly.entity_index = 2;
  assembly.fragment_count = 3;
  assembly.active = true;
  assembly.message_tx_base = 200;

  const uint8_t f0[] = {0x11, 0x22, 0x33};
  const uint8_t f1[] = {0x44, 0x55};
  const uint8_t f2[] = {0x66, 0x77, 0x88, 0x99};

  assembly.data.insert(assembly.data.end(), f0, f0 + 3);
  assembly.lengths.push_back(3);
  assembly.bytes_received += 3;

  assembly.data.insert(assembly.data.end(), f1, f1 + 2);
  assembly.lengths.push_back(2);
  assembly.bytes_received += 2;

  assembly.data.insert(assembly.data.end(), f2, f2 + 4);
  assembly.lengths.push_back(4);
  assembly.bytes_received += 4;

  expect(assembly.bytes_received == 9, "three fragments: total 9 bytes");
  expect(assembly.lengths.size() == 3, "three fragments: 3 length entries");

  uint8_t expected[] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99};
  expect(memcmp(assembly.data.data(), expected, 9) == 0, "three fragments: complete reassembly");
}

static void test_assembly_timeout_detection() {
  uint32_t now = 7000;
  espnow_fragment_assembly_t a{};
  a.last_seen_ms = 1000;
  a.first_seen_ms = 1000;

  expect(now - a.last_seen_ms > ESPNOW_FRAGMENT_ASSEMBLY_TIMEOUT_MS, "timeout detected at 6000ms");
}

static void test_assembly_no_timeout_when_fresh() {
  uint32_t now = 3000;
  espnow_fragment_assembly_t a{};
  a.last_seen_ms = 2500;

  expect(now - a.last_seen_ms <= ESPNOW_FRAGMENT_ASSEMBLY_TIMEOUT_MS, "no timeout when fresh");
}

static void test_assembly_max_bytes_limit() {
  espnow_fragment_assembly_t a{};
  a.bytes_received = ESPNOW_MAX_FRAGMENT_ASSEMBLY_BYTES - 1;
  expect(a.bytes_received < ESPNOW_MAX_FRAGMENT_ASSEMBLY_BYTES, "under max bytes");

  a.bytes_received = ESPNOW_MAX_FRAGMENT_ASSEMBLY_BYTES;
  expect(a.bytes_received >= ESPNOW_MAX_FRAGMENT_ASSEMBLY_BYTES, "at max bytes");
}

static void test_assembly_max_pending_limit() {
  expect(ESPNOW_MAX_PENDING_FRAGMENT_ASSEMBLIES == 8, "max pending assemblies is 8");
}

static void test_assembly_total_bytes_per_session_limit() {
  expect(ESPNOW_MAX_TOTAL_FRAGMENT_BYTES_PER_SESSION == 4096, "max total bytes per session is 4096");
}

int main() {
  test_assembly_init();
  test_assembly_single_fragment();
  test_assembly_multi_fragment_orderly();
  test_assembly_reassembly_three_fragments();
  test_assembly_timeout_detection();
  test_assembly_no_timeout_when_fresh();
  test_assembly_max_bytes_limit();
  test_assembly_max_pending_limit();
  test_assembly_total_bytes_per_session_limit();

  return failures == 0 ? 0 : 1;
}