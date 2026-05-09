#pragma once

#include "remote_protocol.h"

#include <ESP8266WiFi.h>
#include <espnow.h>
#include <array>
#include <functional>
#include <string>
#include <vector>

namespace esphome {
namespace esp_tree {

class Standalone82xx {
 public:
  Standalone82xx();
  ~Standalone82xx();

  bool init(const char* psk_hex, const char* network_id, const char* esphome_name,
            uint16_t heartbeat_interval_seconds, uint8_t channel);
  void loop();
  const char* state_name() const { return protocol_.state_name(); }
  bool has_parent() const { return protocol_.has_parent(); }
  RemoteProtocol& protocol() { return protocol_; }

  uint8_t add_switch(const char* name, const char* entity_id = nullptr);
  uint8_t add_binary_sensor(const char* name, const char* entity_id = nullptr);
  uint8_t add_button(const char* name, const char* entity_id = nullptr);
  uint8_t add_sensor(const char* name, const char* unit = "", const char* entity_id = nullptr);

  void update_entity(uint8_t index, bool value);
  void update_entity(uint8_t index, float value);

 private:
  bool setup_transport_(uint8_t channel);
  bool send_frame_(const uint8_t* mac, const uint8_t* frame, size_t frame_len);
  bool add_peer_(const uint8_t* mac, uint8_t channel = 11);
  void drain_received_frames_();

  static void on_data_sent_(uint8_t* mac, uint8_t status);
  static void on_data_recv_(uint8_t* mac, uint8_t* data, uint8_t len);

  RemoteProtocol protocol_;
  std::string psk_;
  std::string network_id_;
  std::string esphome_name_;
  uint16_t heartbeat_interval_{30};
  bool protocol_ready_{false};
  bool transport_ready_{false};
  std::array<uint8_t, 6> sta_mac_{};

  struct PendingRxFrame {
    std::array<uint8_t, 6> mac{};
    std::vector<uint8_t> data;
  };
  static constexpr size_t MAX_PENDING = 16;
  std::vector<PendingRxFrame> rx_queue_;

  static Standalone82xx* active_instance_;
  uint8_t espnow_channel_{11};
};

}  // namespace esp_tree
}  // namespace esphome
