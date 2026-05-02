#pragma once

#include "bridge_api_auth.h"
#include "bridge_api_router.h"
#include "bridge_api_types.h"

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {

class ESPNowLRBridge;

namespace bridge_api {

class BridgeApiWsTransport : public BridgeApiOutbound {
 public:
  explicit BridgeApiWsTransport(ESPNowLRBridge *bridge);
  ~BridgeApiWsTransport() override;

  BridgeApiWsTransport(const BridgeApiWsTransport &) = delete;
  BridgeApiWsTransport &operator=(const BridgeApiWsTransport &) = delete;

  bool register_with_web_server();
  void loop();

  bool has_authenticated_client() const;
  uint32_t active_client_id() const;

  void send_text(uint32_t client_id, const std::string &text) override;
  void close_client(uint32_t client_id) override;

  void emit_event(const std::string &event_json);
  void emit_heartbeat(uint32_t uptime_ms);
  void emit_topology_changed(const char *reason, const uint8_t *mac);
  void emit_remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                uint32_t last_seen_ms);
  void emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity, const std::vector<uint8_t> &value,
                         espnow_field_type_t type);
  void emit_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
