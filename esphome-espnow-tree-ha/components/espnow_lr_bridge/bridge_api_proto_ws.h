#pragma once

#include "bridge_api_proto_messages.h"
#include "espnow_lr_common/espnow_types.h"

#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {

class ESPNowLRBridge;

namespace bridge_api {

class BridgeApiProtoWsTransport {
 public:
  explicit BridgeApiProtoWsTransport(ESPNowLRBridge *bridge);
  ~BridgeApiProtoWsTransport();

  BridgeApiProtoWsTransport(const BridgeApiProtoWsTransport &) = delete;
  BridgeApiProtoWsTransport &operator=(const BridgeApiProtoWsTransport &) = delete;

  bool register_with_web_server();
  void loop();

  bool has_authenticated_client() const;
  bool send_binary(const std::vector<uint8_t> &payload);
  void close_client();

  void emit_heartbeat(uint32_t uptime_ms);
  void emit_topology_changed(const char *reason, const uint8_t *mac);
  void emit_remote_availability(const uint8_t *mac, bool online, const char *reason, int8_t rssi,
                                uint32_t offline_s, const uint8_t *parent_mac, uint8_t hop_count);
  void emit_remote_state(const uint8_t *mac, const espnow_entity_schema_t &entity,
                         const std::vector<uint8_t> &value, espnow_field_type_t type);
  void emit_remote_schema_changed(const uint8_t *mac, const std::string &schema_hash);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
