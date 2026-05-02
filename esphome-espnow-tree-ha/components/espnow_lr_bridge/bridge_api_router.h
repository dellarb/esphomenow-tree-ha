#pragma once

#include "bridge_api_messages.h"
#include "bridge_api_types.h"
#include "espnow_lr_common/espnow_types.h"

#include <cstdint>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

class BridgeApiOutbound {
 public:
  virtual ~BridgeApiOutbound() = default;
  virtual void send_text(uint32_t client_id, const std::string &text) = 0;
  virtual void close_client(uint32_t client_id) = 0;
};

class BridgeApiRouter {
 public:
  BridgeApiRouter() = default;
  BridgeApiRouter(BridgeFacade *bridge, BridgeApiOutbound *outbound) : bridge_(bridge), outbound_(outbound) {}

  void set_bridge(BridgeFacade *bridge) { bridge_ = bridge; }
  void set_outbound(BridgeApiOutbound *outbound) { outbound_ = outbound; }
  void set_active_client_id(uint32_t client_id) { active_client_id_ = client_id; }

  void handle_authenticated_text(uint32_t client_id, const std::string &text);

  void emit_heartbeat(uint32_t uptime_ms);
  void emit_topology_changed(const char *reason, const uint8_t *mac);
  void emit_remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                uint32_t last_seen_ms);
  void emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity, const std::vector<uint8_t> &value,
                         espnow_field_type_t type);
  void emit_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash);

  ParseStatus parse_envelope(const std::string &text, ApiEnvelope &envelope) const;

 private:
  void route_request_(uint32_t client_id, const ApiEnvelope &envelope);
  void handle_bridge_info_(uint32_t client_id, const ApiEnvelope &envelope);
  void handle_topology_get_(uint32_t client_id, const ApiEnvelope &envelope);
  void send_error_(uint32_t client_id, const std::string &id, const char *code, const std::string &message);
  void broadcast_event_(const std::string &event_json);

  BridgeFacade *bridge_{nullptr};
  BridgeApiOutbound *outbound_{nullptr};
  uint32_t active_client_id_{0};
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
