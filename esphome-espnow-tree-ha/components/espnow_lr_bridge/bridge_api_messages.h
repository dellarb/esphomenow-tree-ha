#pragma once

#include "bridge_api_types.h"
#include "espnow_lr_common/espnow_types.h"

#include <cstdint>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

class BridgeApiMessages {
 public:
  static std::string escape_json(const std::string &value);

  static std::string state_value_json(espnow_field_type_t type, const uint8_t *value, size_t value_len,
                                      const std::string &entity_options);

  static std::string envelope(const char *type, const std::string &id, const std::string &payload_json);
  static std::string event(const char *type, const std::string &payload_json);

  static std::string error(const std::string &id, const char *code, const std::string &message,
                           const std::string &details_json = "{}");

  static std::string auth_challenge(const AuthChallenge &challenge);
  static std::string auth_ok(const std::string &id);

  static std::string bridge_heartbeat(uint32_t uptime_ms);

  static std::string bridge_info_result(const std::string &id, const std::string &info_payload_json);

  static std::string topology_snapshot(const std::string &id, const std::string &snapshot_payload_json);

  static std::string topology_changed(const char *reason, const uint8_t *mac);
  static std::string remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                         uint32_t last_seen_ms);
  static std::string remote_schema_changed(const uint8_t *mac, const std::string &schema_hash);
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
