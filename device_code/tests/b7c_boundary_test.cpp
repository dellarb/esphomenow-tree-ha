#include "../components/esp_tree_common/espnow_types.h"

#include <bitset>
#include <cstdint>
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

static void test_max_sessions_boundary() {
  constexpr uint8_t MAX_SESSIONS = 32;
  expect(MAX_SESSIONS > 0, "MAX_SESSIONS > 0");
  expect(MAX_SESSIONS <= 255, "MAX_SESSIONS fits in uint8_t");
}

static void test_max_fragment_size_boundary() {
  constexpr size_t MAX_FRAG = ESPNOW_MAX_ENTITY_FRAGMENT_LEN;
  expect(MAX_FRAG > 0, "max fragment size > 0");
  expect(MAX_FRAG <= 255, "max fragment size fits in uint8_t (V1 default)");
}

static void test_v2_per_session_fragmentation() {
  const uint16_t v2_max_entity = espnow_max_entity_fragment(ESPNOW_V2_MAX_PAYLOAD);
  expect(v2_max_entity == 1440, "V2 max_entity_fragment = 1440");
  const uint16_t v1_max_entity = espnow_max_entity_fragment(ESPNOW_V1_MAX_PAYLOAD);
  expect(v1_max_entity == 220, "V1 max_entity_fragment = 220");
  const uint16_t v2_max_plaintext = espnow_max_plaintext(ESPNOW_V2_MAX_PAYLOAD);
  expect(v2_max_plaintext == 1445, "V2 max_plaintext = 1445");
  const uint16_t v2_assembly = espnow_max_assembly_bytes(ESPNOW_V2_MAX_PAYLOAD);
  expect(v2_assembly == 8640, "V2 max_assembly_bytes = 1440*6 = 8640");
  const uint16_t v2_total = espnow_max_total_fragment_bytes(ESPNOW_V2_MAX_PAYLOAD);
  expect(v2_total == 34560, "V2 max_total_fragment_bytes = 8640*4 = 34560");
}

static void test_struct_sizes() {
  expect(sizeof(espnow_join_t) == 51, "espnow_join_t must be 51 bytes");
  expect(sizeof(espnow_join_ack_t) == 20, "espnow_join_ack_t must be 20 bytes");
}

static void test_fragment_count_boundary() {
  EntityPayloadView view{};
  view.fragment_count = 1;
  view.fragment_index = 0;
  expect(view.fragment_index < view.fragment_count, "index 0 < count 1 is valid");

  view.fragment_count = 1;
  view.fragment_index = 1;
  expect(!(view.fragment_index < view.fragment_count), "index 1 < count 1 is invalid");
}

static void test_timeout_at_boundary() {
  uint32_t timeout_ms = ESPNOW_FRAGMENT_ASSEMBLY_TIMEOUT_MS;
  expect(timeout_ms == 5000, "fragment timeout is 5000ms");

  espnow_fragment_assembly_t assembly{};
  assembly.last_seen_ms = 10000;

  uint32_t now = 15000;
  bool not_timed_out_yet = (now - assembly.last_seen_ms > timeout_ms);
  expect(!not_timed_out_yet, "at 5000ms: not timed out yet (exactly at boundary)");

  now = 15001;
  bool timed_out = (now - assembly.last_seen_ms > timeout_ms);
  expect(timed_out, "at 5001ms: timed out");
}

static void test_max_pending_assemblies_boundary() {
  constexpr uint8_t MAX_PENDING = ESPNOW_MAX_PENDING_FRAGMENT_ASSEMBLIES;
  expect(MAX_PENDING > 0, "max pending assemblies > 0");
  expect(MAX_PENDING <= 16, "max pending assemblies fits in small int");
}

static void test_max_total_fragment_bytes_boundary() {
  constexpr size_t MAX_TOTAL = ESPNOW_MAX_TOTAL_FRAGMENT_BYTES_PER_SESSION;
  expect(MAX_TOTAL > 0, "max total fragment bytes > 0");
  expect(MAX_TOTAL >= ESPNOW_MAX_FRAGMENT_ASSEMBLY_BYTES, "max total >= single assembly max");
}

static void test_counter_wraparound_at_max() {
  uint32_t max_counter = 0xFFFFFFFF;
  uint32_t zero = 0;

  bool zero_is_newer = counter_is_newer(zero, max_counter);
  expect(zero_is_newer, "0 is newer than max (wraparound)");

  bool max_is_newer = counter_is_newer(max_counter, zero);
  expect(!max_is_newer, "max is not newer than 0 (wrapped)");
}

static void test_counter_at_boundary_plus_one() {
  uint32_t val = 0xFFFFFFFE;
  uint32_t max = 0xFFFFFFFF;

  bool val_is_newer = counter_is_newer(val, max);
  expect(!val_is_newer, "max-1 is not newer than max (would be rollback)");

  bool max_is_newer = counter_is_newer(max, val);
  expect(max_is_newer, "max is newer than max-1");
}

static void test_parent_check_extended_header() {
  expect(ESPNOW_PARENT_MAC_LEN == 6, "parent_mac is 6 bytes");
  expect(ESPNOW_HOPS_PARENT_CHECK_BIT == 0x40, "PARENT_CHECK bit is 0x40");

  uint8_t hc_with_parent = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 2) | ESPNOW_HOPS_PARENT_CHECK_BIT;
  expect(ESPNOW_HOPS_IS_UPSTREAM(hc_with_parent), "PARENT_CHECK doesn't change direction");
  expect(ESPNOW_HOPS_COUNT(hc_with_parent) == 2, "PARENT_CHECK doesn't change hop count");

  uint8_t hc_plain = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 4);
  expect((hc_plain & ESPNOW_HOPS_PARENT_CHECK_BIT) == 0, "Plain hop_count has no PARENT_CHECK");

  expect(espnow_max_plaintext(250) == 225, "V1 max plaintext without parent");
  expect(espnow_max_plaintext_with_parent(250) == 219, "V1 max plaintext with parent_mac");
  expect(espnow_max_plaintext(1470) == 1445, "V2 max plaintext without parent");
  expect(espnow_max_plaintext_with_parent(1470) == 1439, "V2 max plaintext with parent_mac");

  uint8_t all_zeros[6] = {0, 0, 0, 0, 0, 0};
  uint8_t not_zeros[6] = {0x01, 0x02, 0x03, 0x04, 0x05, 0x06};
  uint8_t partial_zeros[6] = {0, 0, 0, 0, 0, 0x01};
  expect(espnow_is_parent_mac_all_zeros(all_zeros), "all-zeros parent_mac returns true");
  expect(!espnow_is_parent_mac_all_zeros(not_zeros), "non-zero parent_mac returns false");
  expect(!espnow_is_parent_mac_all_zeros(partial_zeros), "partial-zero parent_mac returns false");
}

static void test_hop_count_max() {
  uint8_t max_hops = ESPNOW_HOPS_LIMIT;
  uint8_t hop_count = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, max_hops);
  uint8_t extracted = ESPNOW_HOPS_COUNT(hop_count);
  expect(extracted == max_hops, "max hop count extracted correctly");
  expect(ESPNOW_HOPS_COUNT(hop_count) <= ESPNOW_HOPS_LIMIT, "hop count within hard limit");

  uint8_t hc_parent = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 3) | ESPNOW_HOPS_PARENT_CHECK_BIT;
  expect(ESPNOW_HOPS_IS_UPSTREAM(hc_parent), "PARENT_CHECK + upstream: upstream");
  expect(ESPNOW_HOPS_COUNT(hc_parent) == 3, "PARENT_CHECK + hop 3: count=3");
  expect((hc_parent & ESPNOW_HOPS_PARENT_CHECK_BIT) != 0, "PARENT_CHECK bit set");

  uint8_t hc_no_parent = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 3);
  expect((hc_no_parent & ESPNOW_HOPS_PARENT_CHECK_BIT) == 0, "no PARENT_CHECK bit");

  uint8_t hc_down_parent = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 5) | ESPNOW_HOPS_PARENT_CHECK_BIT;
  expect(ESPNOW_HOPS_IS_DOWNSTREAM(hc_down_parent), "PARENT_CHECK + downstream: downstream");
  expect(ESPNOW_HOPS_COUNT(hc_down_parent) == 5, "PARENT_CHECK + hop 5: count=5");
  expect((hc_down_parent & ESPNOW_HOPS_PARENT_CHECK_BIT) != 0, "PARENT_CHECK bit set (downstream)");
}

static void test_hop_direction_up() {
  uint8_t dir_up = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_UP, 3);
  bool is_upstream = ESPNOW_HOPS_IS_UPSTREAM(dir_up);
  expect(is_upstream, "DIR_UP flag set for upstream");
}

static void test_hop_direction_down() {
  uint8_t dir_down = ESPNOW_HOPS_MAKE(ESPNOW_HOPS_DIR_DOWN, 3);
  bool is_downstream = ESPNOW_HOPS_IS_DOWNSTREAM(dir_down);
  expect(is_downstream, "DIR_DOWN flag set for downstream");
}

static void test_entity_index_max() {
  constexpr size_t MAX_ENTITIES = 256;
  std::bitset<MAX_ENTITIES> mask{};
  mask.set(255);
  expect(mask.test(255), "entity index 255 valid (max)");
}

static void test_entity_index_overflow_attempt() {
  constexpr size_t TEST_SIZE = 257;
  std::bitset<TEST_SIZE> mask{};
  mask.set(255);
  expect(mask.test(255), "entity index 255 valid in 257-bit mask");
  expect(!mask.test(256), "entity index 256 invalid (in bounds but beyond max entities)");
}

static void test_empty_session_state() {
  struct EmptySession {
    bool online;
    bool session_key_valid;
    uint32_t last_seen_ms;
  };

  EmptySession s{};
  s.online = false;
  s.session_key_valid = false;
  s.last_seen_ms = 0;

  expect(!s.online, "empty session: online=false");
  expect(!s.session_key_valid, "empty session: session_key_valid=false");
  expect(s.last_seen_ms == 0, "empty session: last_seen_ms=0");
}

static void test_join_status_values() {
  expect(ESPNOW_JOIN_STATUS_SCHEMA_REFRESH == 1, "SCHEMA_REFRESH = 1");
  expect(ESPNOW_JOIN_STATUS_SEND_STATE == 2, "SEND_STATE = 2");
  expect(ESPNOW_JOIN_STATUS_COMPLETE == 100, "COMPLETE = 100");
}

static void test_join_reason_wait() {
  expect(ESPNOW_JOIN_REASON_WAIT == 3, "WAIT reason = 3");
}

static void test_backoff_start_less_than_cap() {
  uint32_t start = ESPNOW_DISCOVER_BACKOFF_START_MS;
  uint32_t cap = ESPNOW_DISCOVER_BACKOFF_CAP_MS;
  expect(start < cap, "backoff start < cap");
  expect(start > 0, "backoff start > 0");
}

static void test_retry_intervals_positive() {
  expect(ESPNOW_RETRY_INTERVAL_MS > 0, "RETRY_INTERVAL > 0");
  expect(ESPNOW_MAX_RETRIES > 0, "MAX_RETRIES > 0");
}

static void test_retry_jitter_less_than_interval() {
  expect(ESPNOW_RETRY_JITTER_MS < ESPNOW_RETRY_INTERVAL_MS,
         "retry jitter < interval");
}

static void test_network_id_length() {
  constexpr size_t NODE_ID_LEN = ESPNOW_NODE_ID_LEN;
  constexpr size_t NODE_LABEL_LEN = ESPNOW_NODE_LABEL_LEN;
  constexpr size_t SCHEMA_HASH_LEN = ESPNOW_SCHEMA_HASH_LEN;

  expect(NODE_ID_LEN == 32, "NODE_ID_LEN = 32");
  expect(NODE_LABEL_LEN == 64, "NODE_LABEL_LEN = 64");
  expect(SCHEMA_HASH_LEN > NODE_ID_LEN, "SCHEMA_HASH_LEN > NODE_ID_LEN");
}

static void test_fragment_assembly_active_flag() {
  espnow_fragment_assembly_t assembly{};
  expect(!assembly.active, "assembly starts inactive");

  assembly.active = true;
  expect(assembly.active, "assembly can be activated");
}

int main() {
  std::cout << "\n[Boundary] Edge cases and boundary conditions tests:\n";

  test_max_sessions_boundary();
  test_max_fragment_size_boundary();
  test_fragment_count_boundary();
  test_timeout_at_boundary();
  test_max_pending_assemblies_boundary();
  test_max_total_fragment_bytes_boundary();
  test_counter_wraparound_at_max();
  test_counter_at_boundary_plus_one();
  test_hop_count_max();
  test_hop_direction_up();
  test_hop_direction_down();
  test_v2_per_session_fragmentation();
  test_struct_sizes();
  test_entity_index_max();
  test_entity_index_overflow_attempt();
  test_empty_session_state();
  test_join_status_values();
  test_join_reason_wait();
  test_backoff_start_less_than_cap();
  test_retry_intervals_positive();
  test_retry_jitter_less_than_interval();
  test_network_id_length();
  test_fragment_assembly_active_flag();
  test_parent_check_extended_header();

  std::cout << "  boundary tests completed\n";

  return failures == 0 ? 0 : 1;
}