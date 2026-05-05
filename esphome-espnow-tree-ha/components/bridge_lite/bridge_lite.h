#pragma once

#include "transport.h"
#include "transport_ws.h"

#include "esphome/core/component.h"

#include <array>
#include <deque>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include <esp_now.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

namespace esphome {
namespace espnow_lr {

static constexpr size_t RING_BUFFER_SIZE = 100;
static constexpr uint32_t STATUS_INTERVAL_MS = 30000;
static constexpr uint8_t MAX_ESPNOW_PEERS = 20;
static constexpr uint32_t MAX_INFLIGHT = 8;

struct RadioFrameBuffer {
  std::array<uint8_t, 6> src_mac{};
  std::vector<uint8_t> raw_frame;
  int8_t rssi{0};
  uint32_t timestamp_ms{0};
};

class BridgeLite : public Component {
 public:
  BridgeLite();

  void set_network_id(const std::string &network_id) { network_id_ = network_id; }
  void set_psk(const std::string &psk) { psk_ = psk; }
  void set_api_key(const std::string &api_key) { api_key_ = api_key; }
  void set_espnow_mode(const std::string &mode) { espnow_mode_ = mode; }

  void setup() override;
  void loop() override;
  float get_setup_priority() const override { return setup_priority::AFTER_WIFI; }

 protected:
  bool init_wifi_and_espnow_();
  bool add_peer_(const uint8_t *mac);
  void note_peer_activity_(const uint8_t *mac);
  bool evict_stale_peer_();
  void handle_received_frame_(const uint8_t *mac, const uint8_t *data, size_t len, int8_t rssi);
  void handle_send_result_(const uint8_t *mac, bool success);
  void send_bridge_hello_();
  void send_bridge_status_();
  void check_status_timer_();

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  static void on_data_received_(const esp_now_recv_info_t *info, const uint8_t *data, int len);
  static void on_data_sent_(const esp_now_send_info_t *tx_info, esp_now_send_status_t status);
#else
  static void on_data_received_(const uint8_t *mac, const uint8_t *data, int len);
  static void on_data_sent_(const uint8_t *mac, esp_now_send_status_t status);
#endif

  std::string network_id_;
  std::string psk_;
  std::string api_key_;
  std::string espnow_mode_{"lr"};

 public:
  const std::string &get_api_key() const { return api_key_; }

  std::array<uint8_t, 6> sta_mac_{};
  uint32_t start_time_ms_{0};
  uint32_t last_status_ms_{0};

  std::deque<RadioFrameBuffer> ring_buffer_;
  std::map<std::string, uint32_t> peer_last_used_ms_;

  SemaphoreHandle_t ring_mutex_{nullptr};

  std::unique_ptr<BridgeTransport> transport_;
  bool transport_connected_{false};

  static BridgeLite *active_instance_;
};

}  // namespace espnow_lr
}  // namespace esphome