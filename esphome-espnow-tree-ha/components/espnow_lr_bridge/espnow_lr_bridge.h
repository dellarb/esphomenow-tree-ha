#pragma once

#include "esphome/core/component.h"
#include "esphome/core/application.h"
#include "bridge_protocol.h"
#include "bridge_ota_manager.h"
#include "bridge_api_types.h"
#include "bridge_api_ws.h"
#include "esphome/components/mqtt/custom_mqtt_device.h"

#include <esp_idf_version.h>
#include <esp_now.h>

#include <array>
#include <deque>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

namespace esphome {
namespace espnow_lr {

enum class CommandRouteKind : uint8_t {
  PRIMARY = 0,
  FAN_SPEED,
  FAN_OSCILLATION,
  FAN_DIRECTION,
};

struct MqttEntityRecord {
  std::array<uint8_t, 6> leaf_mac{};
  std::string node_id;
  BridgeEntitySchema schema{};
  uint8_t total_entities{0};
  bool discovery_dirty{true};
  bool discovery_published{false};
  bool first_state_publish_pending{false};
  bool state_dirty{false};
  bool command_subscribed{false};
  uint32_t discovery_published_ms{0};
  std::vector<uint8_t> current_value;
  espnow_field_type_t current_type{FIELD_TYPE_SENSOR};
  std::string text_value;
  bool pending_state_ack_{false};
  uint32_t pending_ack_message_tx_base_{0};
  uint8_t pending_ack_entity_index_{0};
  uint32_t pending_ack_queued_ms_{0};
  std::array<uint8_t, 6> ack_next_hop_mac_{};
};

class ESPNowLRBridge : public Component, public mqtt::CustomMQTTDevice, public bridge_api::BridgeFacade {
 public:
  ESPNowLRBridge();

  void set_network_id(const std::string &network_id) { network_id_ = network_id; }
  void set_psk(const std::string &psk) { psk_ = psk; }
  void set_heartbeat_interval(uint16_t heartbeat_interval) { heartbeat_interval_ = heartbeat_interval; }
  void set_mqtt_discovery_prefix(const std::string &mqtt_discovery_prefix) { mqtt_discovery_prefix_ = mqtt_discovery_prefix; }
  void set_espnow_mode(const std::string &mode) { espnow_mode_ = mode; }
  void set_espnow_mode_lr() { espnow_mode_ = "lr"; }
  void set_espnow_mode_regular() { espnow_mode_ = "regular"; }
  void set_ota_over_espnow(bool enabled) { ota_over_espnow_ = enabled; }
  void set_force_v1_packet_size(bool v) { force_v1_packet_size_ = v; }
  void set_bridge_friendly_name(const std::string &name) { bridge_friendly_name_ = name; }
  void set_api_key(const std::string &api_key) { api_key_ = api_key; }
  void setup() override;
  void loop() override;
  float get_setup_priority() const override { return setup_priority::AFTER_WIFI; }
  void dump_config() override;

  uint8_t get_active_remote_count() const { return protocol_.get_active_remote_count(); }
  bool api_has_key_configured() const { return !api_key_.empty(); }
  const std::string &api_key() const { return api_key_; }

  std::string api_bridge_info_json() const override;
  std::string api_topology_snapshot_json(const std::string &request_payload_json) const override;

 protected:
  bool setup_transport_();
  bool send_frame_(const uint8_t *mac, const uint8_t *frame, size_t frame_len);
  esp_err_t send_frame_result_(const uint8_t *mac, const uint8_t *frame, size_t frame_len);
  bool add_peer_(const uint8_t *mac, bool lr_mode);
  void note_peer_activity_(const uint8_t *mac);
  bool is_peer_protected_(const uint8_t *mac) const;
  bool evict_stale_peer_(const uint8_t *preferred_mac);
  bool init_wifi_and_espnow_();
  void handle_received_frame_(const uint8_t *mac, const uint8_t *data, size_t len, int8_t rssi);
  void handle_send_status_(const uint8_t *mac, bool success);
  void drain_received_frames_();

  void queue_discovery_(const uint8_t *mac, const BridgeEntitySchema &entity, uint8_t total_entities, bool is_commandable);
  void queue_state_(const uint8_t *mac, const BridgeEntitySchema &entity, const std::vector<uint8_t> &value,
                    espnow_field_type_t type, const std::string &text_value, uint32_t message_tx_base,
                    const uint8_t *next_hop_mac);
  void queue_availability_(const uint8_t *mac, bool online);
  void queue_clear_entities_(const uint8_t *mac, const std::vector<BridgeEntitySchema> &old_entities);

  void sync_mqtt_entities_();
  void do_publish_discovery_(MqttEntityRecord &rec);
  bool do_publish_state_(MqttEntityRecord &rec);
  void send_deferred_state_ack_(MqttEntityRecord &rec);
  void do_publish_bridge_diag_(uint32_t uptime_s, uint8_t remotes_online);
  std::string build_topology_json_() const;
  std::string build_remote_info_json_(const uint8_t *mac) const;
  std::string mac_colon_string_(const uint8_t *mac) const;

  void do_clear_entity_(const uint8_t *mac, const BridgeEntitySchema &entity);

  void publish_bridge_diag_discovery_();
  void publish_bridge_diag_state_();
  void publish_remote_diag_discovery_(const uint8_t *mac);
  void publish_remote_diag_state_(const uint8_t *mac);
  void publish_remote_diag_state_cached_(const uint8_t *mac, const std::string &node_key);
  void queue_remote_diag_refresh_(const uint8_t *mac);
  void check_diag_publish_rr_();
  void publish_force_rejoin_button_discovery_();
  void handle_force_rejoin_command_(const std::string &payload);
  void log_airtime_status_();

  void schema_complete_(const uint8_t *mac, uint8_t total_entities);
  void on_discovery_confirmed_(const uint8_t *mac, uint8_t entity_index, bool success);
  void subscribe_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity);
  void handle_command_message_(const std::string &topic, const std::string &payload);
  std::string remote_display_name_(const uint8_t *mac) const;
  std::string node_key_(const uint8_t *mac) const;
  std::string entity_object_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string default_entity_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string entity_component_(espnow_field_type_t type) const;
  std::string availability_topic_(const uint8_t *mac) const;
  std::string state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_speed_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_speed_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_oscillation_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_oscillation_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_direction_state_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string fan_direction_command_topic_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string unique_id_(const uint8_t *mac, const BridgeEntitySchema &entity) const;
  std::string bridge_state_topic_(const char *suffix) const;
  std::string remote_diag_state_topic_(const uint8_t *mac, const char *suffix) const;
  bool decode_command_payload_(const BridgeEntitySchema &entity, CommandRouteKind route_kind, const std::string &payload,
                               std::vector<uint8_t> &value, const std::vector<uint8_t> &current_value) const;
  std::string encode_state_payload_(const BridgeEntitySchema &entity, const std::vector<uint8_t> &value,
                                    espnow_field_type_t type) const;
  static std::string mac_key_string_(const uint8_t *mac);
  static std::string slugify_name_(std::string input);
  static void register_instance_(ESPNowLRBridge *instance);
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
  static void on_data_received_(const esp_now_recv_info_t *info, const uint8_t *data, int len);
  static void on_data_sent_(const esp_now_send_info_t *tx_info, esp_now_send_status_t status);
#else
  static void on_data_received_(const uint8_t *mac, const uint8_t *data, int len);
  static void on_data_sent_(const uint8_t *mac, esp_now_send_status_t status);
#endif

  std::string entity_record_key_(const uint8_t *mac, uint8_t entity_index) const;

  BridgeProtocol protocol_;
  std::string network_id_;
  std::string psk_;
  std::string api_key_;
  std::string espnow_mode_{"lr"};
  std::string mqtt_discovery_prefix_{"homeassistant"};
  std::string bridge_friendly_name_{"ESP-NOW LR Bridge"};
  uint16_t heartbeat_interval_{ESPNOW_LR_HEARTBEAT_INTERVAL_S};
  bool protocol_ready_{false};
  bool transport_ready_{false};
  uint32_t rx_packets_{0};
  uint32_t rx_dropped_{0};
  uint32_t rx_dropped_while_disallowed_{0};
  uint32_t tx_ok_{0};
  uint32_t tx_fail_{0};
  std::array<uint8_t, 6> sta_mac_{};
  struct PendingRxFrame {
    std::array<uint8_t, 6> mac{};
    std::vector<uint8_t> data;
    int8_t rssi{0};
  };
  static constexpr size_t MAX_PENDING_RX_FRAMES = 64;
  static constexpr size_t RX_BUFFER_WATERMARK_PCT = 80;
  std::deque<PendingRxFrame> pending_rx_frames_;
  SemaphoreHandle_t pending_rx_mutex_{nullptr};
  std::map<std::string, uint32_t> peer_last_used_ms_;
  struct CommandRoute {
    std::array<uint8_t, 6> leaf_mac{};
    uint8_t entity_index{0};
    CommandRouteKind route_kind{CommandRouteKind::PRIMARY};
  };
  std::map<std::string, CommandRoute> command_routes_;
  std::set<std::string> subscribed_topics_;

  std::map<std::string, MqttEntityRecord> mqtt_entities_;
  std::deque<std::pair<std::array<uint8_t, 6>, bool>> availability_queue_;
  bool mqtt_was_connected_{false};

  struct RemoteDiagCache {
    int8_t rssi{-127};
    uint32_t tx_packets{0};
    uint32_t rx_packets{0};
    uint8_t hops{0};
    uint8_t direct_children{0};
    uint8_t total_children{0};
    uint32_t firmware_epoch{0};
    std::string esphome_name;
    std::string project_name;
    std::string project_version;
    uint32_t chip_model{0};
    uint32_t last_publish_ms{0};
  };

  bool bridge_diag_discovery_published_{false};
  std::set<std::string> remote_diag_discovery_published_;
  std::set<std::string> remote_diag_refresh_pending_;
  std::set<std::string> first_remote_diag_publish_pending_;
  std::map<std::string, RemoteDiagCache> remote_diag_cache_;
  static constexpr uint32_t DIAG_CHECK_INTERVAL_MS{250};
  static constexpr uint32_t DIAG_SPACING_MS{250};
  static constexpr uint32_t DIAG_MIN_INTERVAL_MS{10000};
  static constexpr uint32_t DIAG_JITTER_MS{50};
  static constexpr uint32_t FIRST_STATE_PUBLISH_GRACE_MS{200};
  uint32_t last_published_bridge_diag_ms_{0};
  uint32_t diag_last_any_publish_ms_{0};
  size_t diag_rr_index_{0};
  uint32_t next_diag_check_ms_{0};
  std::map<std::string, uint32_t> remote_diag_last_publish_ms_;
  std::map<std::string, uint32_t> delayed_diag_refresh_pending_;
  static constexpr uint32_t DIAG_DELAYED_REFRESH_DELAY_MS{1000};

  struct AirtimeStats {
    uint32_t tx_packets{0};
    uint32_t rx_packets{0};
    uint64_t tx_airtime_us{0};
    uint64_t rx_airtime_us{0};
    int64_t rssi_sum{0};
    uint32_t rssi_count{0};
    uint32_t window_start_ms{0};
  };
  AirtimeStats rolling_airtime_;
  uint32_t airtime_window_start_ms_{0};
  static constexpr uint32_t AIRTIME_REPORT_INTERVAL_MS{30000};

  int8_t last_published_bridge_rssi_{-127};
  uint32_t last_published_bridge_uptime_s_{0};
  uint32_t last_published_remotes_online_{0xFFFFFFFF};
  uint32_t last_published_remotes_direct_{0};
  uint8_t last_published_wifi_channel_{0};
  int last_published_ram_pct_{-1};
  int last_published_cpu_pct_{-1};

  static ESPNowLRBridge *active_instance_;
  // Whether the bridge should process incoming ESP-NOW frames. This is set when
  // both Wi-Fi and MQTT are connected to avoid acting on frames when the
  // system cannot publish or respond.
  bool espnow_allowed_{false};

  // --- Topology Web Server ---
  void register_web_handler_();
  void register_ota_web_handlers_();
  std::string get_ip_string() const;
  bool web_handler_registered_{false};
  bool api_ws_handler_registered_{false};
  std::unique_ptr<bridge_api::BridgeApiWsTransport> api_ws_;
  bool ota_web_handlers_registered_{false};
  bool ota_over_espnow_{false};
  bool force_v1_packet_size_{false};
  std::unique_ptr<ESPNowOTAManager> ota_manager_;
  std::vector<uint8_t> ota_upload_buf_;
  size_t ota_upload_expected_size_{0};
  size_t ota_upload_received_{0};
  uint32_t ota_upload_last_activity_ms_{0};
  bool ota_upload_complete_{false};
  bool ota_upload_failed_{false};
  bool ota_upload_session_pending_{false};
  std::array<uint8_t, 6> ota_upload_target_mac_{};
  std::array<uint8_t, 16> ota_upload_md5_{};
  std::string ota_upload_error_msg_;
  std::set<uint32_t> ota_requested_sequences_;
  uint16_t ota_requested_chunk_size_{0};
  struct OtaChunkStage {
    size_t total{0};
    std::vector<uint8_t> data;
  };
  std::map<uint32_t, OtaChunkStage> ota_chunk_stages_;
  void feed_ota_upload_chunks_();
  void reset_ota_upload_state_(bool release_memory = false);

  std::string force_rejoin_command_topic_;
  bool force_rejoin_button_discovery_published_{false};

  uint64_t cpu_last_publish_time_us_{0};
  uint64_t cpu_last_idle_runtime_{0};

  mutable uint32_t snapshot_sequence_{0};

  static constexpr uint32_t LOOP_TIME_BUDGET_MS{200};
  uint32_t loop_enter_ms_{0};
  bool loop_budget_exceeded_() const { return (millis() - loop_enter_ms_) >= LOOP_TIME_BUDGET_MS; }
};

}  // namespace espnow_lr
}  // namespace esphome
