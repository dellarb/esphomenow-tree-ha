#include <cstddef>
#include <cstdint>

struct __attribute__((packed)) espnow_heartbeat_t {
  uint32_t uptime_seconds;
  uint32_t expected_contact_interval_seconds;
  uint8_t parent_mac[6];
  uint8_t hops_to_bridge;
  uint8_t direct_child_count;
  uint16_t total_child_count;
};

int main() {
  static_assert(sizeof(espnow_heartbeat_t) == 18, "heartbeat payload size changed unexpectedly");
  return offsetof(espnow_heartbeat_t, parent_mac) == 8 ? 0 : 1;
}
