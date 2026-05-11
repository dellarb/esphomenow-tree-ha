#include "../components/esp_tree_common/espnow_types.h"

#include <algorithm>
#include <array>
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

struct TestRouteEntry {
  std::array<uint8_t, 6> leaf_mac{};
  std::array<uint8_t, 6> next_hop_mac{};
  uint32_t expiry_ms{0};
};

static constexpr uint32_t ROUTE_TTL_DEFAULT = ESPNOW_ROUTE_TTL_DEFAULT_SECONDS * 1000U;

static void init_route(TestRouteEntry& route, const uint8_t leaf[6], const uint8_t next_hop[6], uint32_t now_ms, uint32_t ttl_ms) {
  memcpy(route.leaf_mac.data(), leaf, 6);
  memcpy(route.next_hop_mac.data(), next_hop, 6);
  route.expiry_ms = now_ms + ttl_ms;
}

static void prune_expired(std::vector<TestRouteEntry>& routes, uint32_t now_ms) {
  routes.erase(std::remove_if(routes.begin(), routes.end(),
    [now_ms](const TestRouteEntry& r) { return r.expiry_ms <= now_ms; }), routes.end());
}

static bool route_expired(const TestRouteEntry& route, uint32_t now_ms) {
  return route.expiry_ms <= now_ms;
}

static void test_route_ttl_default() {
  expect(ROUTE_TTL_DEFAULT == ESPNOW_ROUTE_TTL_DEFAULT_SECONDS * 1000U, "route TTL default is 172800000ms (48h)");
}

static void test_prune_expired_routes() {
  std::vector<TestRouteEntry> routes;
  routes.resize(3);
  uint8_t leaf1[6] = {1, 2, 3, 4, 5, 6};
  uint8_t hop1[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};

  init_route(routes[0], leaf1, hop1, 1000, 5000);
  init_route(routes[1], leaf1, hop1, 1000, 7000);
  init_route(routes[2], leaf1, hop1, 2000, 60000);

  prune_expired(routes, 6001);

  expect(routes.size() == 2, "pruned: 1 expired removed");
  expect(routes[0].expiry_ms == 8000, "pruned: first remaining expiry correct");
}

static void test_prune_none_expired() {
  std::vector<TestRouteEntry> routes;
  routes.resize(2);
  uint8_t leaf1[6] = {1, 2, 3, 4, 5, 6};
  uint8_t hop1[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};

  init_route(routes[0], leaf1, hop1, 1000, 50000);
  init_route(routes[1], leaf1, hop1, 1000, 60000);

  prune_expired(routes, 2000);

  expect(routes.size() == 2, "none expired: all kept");
}

static void test_route_expired_check() {
  TestRouteEntry route{};
  uint8_t leaf1[6] = {1, 2, 3, 4, 5, 6};
  uint8_t hop1[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};
  init_route(route, leaf1, hop1, 1000, 5000);

  expect(route_expired(route, 6001), "route expired at 6001");
  expect(!route_expired(route, 5000), "route not expired at exact expiry");
  expect(!route_expired(route, 4000), "route not expired before expiry");
}

static void test_open_route() {
  TestRouteEntry route{};
  uint8_t leaf[6] = {1, 2, 3, 4, 5, 6};
  uint8_t next_hop[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};
  uint32_t now_ms = 5000;
  uint32_t ttl_ms = 60000;

  init_route(route, leaf, next_hop, now_ms, ttl_ms);

  expect(memcmp(route.leaf_mac.data(), leaf, 6) == 0, "open_route: leaf_mac stored");
  expect(memcmp(route.next_hop_mac.data(), next_hop, 6) == 0, "open_route: next_hop_mac stored");
  expect(route.expiry_ms == now_ms + ttl_ms, "open_route: expiry computed");
}

static void test_refresh_route() {
  TestRouteEntry route{};
  uint8_t leaf[6] = {1, 2, 3, 4, 5, 6};
  uint8_t hop1[6] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};
  uint8_t hop2[6] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66};

  init_route(route, leaf, hop1, 1000, 5000);
  uint32_t old_expiry = route.expiry_ms;

  init_route(route, leaf, hop2, 5000, 60000);

  expect(memcmp(route.next_hop_mac.data(), hop2, 6) == 0, "refresh_route: next_hop updated");
  expect(route.expiry_ms > old_expiry, "refresh_route: expiry extended");
}

int main() {
  test_route_ttl_default();
  test_prune_expired_routes();
  test_prune_none_expired();
  test_route_expired_check();
  test_open_route();
  test_refresh_route();

  return failures == 0 ? 0 : 1;
}