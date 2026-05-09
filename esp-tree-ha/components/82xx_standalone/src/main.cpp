#include "standalone_82xx.h"

using namespace esphome::esp_tree;

Standalone82xx remote;

static uint8_t led_idx, temp_idx, status_idx;
static const uint8_t BRIDGE_MAC[6] = {0xD0, 0xCF, 0x13, 0xEB, 0x81, 0x28};

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n=== ESP8266 Standalone ESPNOW Test ===");
  Serial.printf("Bridge target: %02X:%02X:%02X:%02X:%02X:%02X\n",
                BRIDGE_MAC[0], BRIDGE_MAC[1], BRIDGE_MAC[2],
                BRIDGE_MAC[3], BRIDGE_MAC[4], BRIDGE_MAC[5]);

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  bool ok = remote.init(
    "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    "myhouse",
    "esp12e-standalone",
    30,
    11  // channel
  );

  if (!ok) {
    Serial.println("[FATAL] Init failed, halting");
    while (1) { delay(1000); }
  }

  status_idx = remote.add_binary_sensor("Status", "status");
  led_idx = remote.add_switch("Board LED", "board_led");
  temp_idx = remote.add_sensor("Chip Temperature", "°C", "chip_temp");

  std::array<uint8_t, 6> pref;
  memcpy(pref.data(), BRIDGE_MAC, 6);
  remote.protocol().add_preferred_parent(pref);

  Serial.printf("Entities: led=%u status=%u temp=%u\n", led_idx, status_idx, temp_idx);
  Serial.println("[MAIN] Setup complete, entering loop");
}

void loop() {
  remote.loop();

  // Direct unicast test: send to bridge every 15s on ch=11
  static uint32_t last_unicast_test = 0;
  static uint32_t unicast_seq = 0;
  if (millis() - last_unicast_test > 15000) {
    last_unicast_test = millis();
    unicast_seq++;
    wifi_set_channel(11);
    uint8_t bcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    if (!esp_now_is_peer_exist(const_cast<uint8_t*>(BRIDGE_MAC))) {
      esp_now_add_peer(const_cast<uint8_t*>(BRIDGE_MAC), ESP_NOW_ROLE_COMBO, 11, nullptr, 0);
    }
    uint8_t test_frame[10] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00, 0x11, 0x22, 0x33};
    Serial.printf("[TEST #%u] Sending unicast to bridge ch=11\n", unicast_seq);
    int err = esp_now_send(const_cast<uint8_t*>(BRIDGE_MAC), test_frame, sizeof(test_frame));
    Serial.printf("[TEST #%u] esp_now_send returned %d\n", unicast_seq, err);
  }

  // Blink LED based on state
  static uint32_t last_blink = 0;
  if (millis() - last_blink > 1000) {
    last_blink = millis();
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  }

  // Report chip temperature every 30s
  static uint32_t last_temp = 0;
  if (millis() - last_temp > 30000) {
    last_temp = millis();
    float temp = 25.0f + (random(0, 80) / 10.0f);
    remote.update_entity(temp_idx, temp);
  }

  delay(5);
}
