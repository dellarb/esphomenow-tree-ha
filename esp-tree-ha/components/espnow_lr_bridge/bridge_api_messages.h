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
                                         uint32_t offline_s, const uint8_t *parent_mac, uint8_t hop_count);
  static std::string remote_schema_changed(const uint8_t *mac, const std::string &schema_hash);

  static std::string node_schema_result(const std::string &id, const std::string &mac,
                                       const std::string &schema_payload_json);
  static std::string node_state_result(const std::string &id, const std::string &mac,
                                        const std::string &state_payload_json);
  static std::string node_state_subscribed(const std::string &id, const std::string &mac);
  static std::string node_state_unsubscribed(const std::string &id, const std::string &mac);
  static std::string node_config_result(const std::string &id, const std::string &result,
                                        const std::string &command);

  static std::string ota_accepted(const std::string &id, const std::string &job_id,
                                   const std::string &target_mac, uint16_t max_chunk_size,
                                   uint32_t total_chunks,
                                   const std::vector<uint32_t> &requested);
  static std::string ota_chunk_request(const std::string &id, const std::string &job_id,
                                        const std::string &session_id,
                                        const std::vector<uint32_t> &sequences,
                                        uint32_t chunks_sent, uint32_t chunks_confirmed,
                                        uint16_t current_increment, uint16_t total_increments);
  static std::string ota_status_result(const std::string &id, const std::string &status_payload_json);
  static std::string ota_aborted(const std::string &id, const std::string &job_id,
                                 const std::string &reason);
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
