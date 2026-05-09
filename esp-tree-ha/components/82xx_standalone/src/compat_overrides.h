#pragma once
#include <Arduino.h>
#include <user_interface.h>

// Log macros
#undef ESP_LOGE
#undef ESP_LOGW
#undef ESP_LOGI
#undef ESP_LOGD
#undef ESP_LOGV
#undef ESP_LOGCONFIG
#define ESP_LOGE(tag, fmt, ...) Serial.printf("[E][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGW(tag, fmt, ...) Serial.printf("[W][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGI(tag, fmt, ...) Serial.printf("[I][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGD(tag, fmt, ...) Serial.printf("[D][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGV(tag, fmt, ...) Serial.printf("[V][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGCONFIG(tag, fmt, ...) Serial.printf("[C][%s] " fmt "\n", tag, ##__VA_ARGS__)

#ifdef __cplusplus

// ESP-IDF → Arduino shims
typedef int esp_err_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_WIFI_NOT_STARTED -2
#define ESP_ERR_WIFI_CONN -3
#define WIFI_SECOND_CHAN_NONE 0
using wifi_second_chan_t = int;
inline void esp_wifi_get_channel(uint8_t* ch, wifi_second_chan_t*) { *ch = wifi_get_channel(); }
inline int esp_wifi_set_channel(uint8_t ch, wifi_second_chan_t) {
  wifi_set_channel(ch);
  return 0;
}

// Type needed by ESP-IDF code
struct wifi_protocols_t { int ghz_2g; };
inline void esp_wifi_set_protocols(int, wifi_protocols_t*) {}

// Radio protocol macros
#define WIFI_PROTOCOL_11B 1
#define WIFI_PROTOCOL_11G 2
#define WIFI_PROTOCOL_11N 4

// ESPHome WiFi stub
namespace esphome { namespace wifi {
  struct WiFiComponent {
    bool is_connected() const { return false; }
    bool has_sta() const { return false; }
  };
  extern WiFiComponent* global_wifi_component;
}}
inline esphome::wifi::WiFiComponent* esphome::wifi::global_wifi_component = nullptr;

// ESPHome App stub
namespace esphome { struct Application { void safe_reboot() { ESP.restart(); } }; }
#define App (esphome::Application{})

#endif // __cplusplus
