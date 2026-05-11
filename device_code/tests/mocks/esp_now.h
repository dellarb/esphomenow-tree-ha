#pragma once

#define ESP_IDF_VERSION_MAJOR 5
#define ESP_IDF_VERSION_MINOR 2
#define ESP_IDF_VERSION_PATCH 0
#define ESP_IDF_VERSION_VAL(major, minor, patch) (((major) << 16) | ((minor) << 8) | (patch))
#define ESP_IDF_VERSION ESP_IDF_VERSION_VAL(ESP_IDF_VERSION_MAJOR, ESP_IDF_VERSION_MINOR, ESP_IDF_VERSION_PATCH)

typedef int32_t esp_err_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_NOT_FOUND 2
#define ESP_ERR_NO_MEM 4

enum espnow_send_status_t {
  ESPNOW_SEND_SUCCESS = 0,
  ESPNOW_SEND_MASTER_DATA_MULTICAST = 0x01,
  ESPNOW_SEND_FAIL = 0x10
};

typedef enum {
  ESPNOW_ACK_ERROR = 0,
  ESPNOW_ACK_SUCCESS = 1,
  ESPNOW_ACK_NO_ACK = 2,
} espnow_ack_status_t;

typedef struct {
  uint8_t ltk[32];
  uint8_t peer_addr[6];
  uint8_t ltk_len;
  bool is_multicast;
} espnow_peer_info_t;

typedef void (*esp_now_send_cb_t)(const uint8_t* mac, espnow_send_status_t status);
typedef void (*esp_now_recv_cb_t)(const uint8_t* mac, const uint8_t* data, int len);

esp_err_t esp_now_init(void);
esp_err_t esp_now_deinit(void);
esp_err_t esp_now_register_send_cb(esp_now_send_cb_t cb);
esp_err_t esp_now_unregister_send_cb(void);
esp_err_t esp_now_register_recv_cb(esp_now_recv_cb_t cb);
esp_err_t esp_now_unregister_recv_cb(void);
esp_err_t esp_now_add_peer(const uint8_t* mac, uint8_t role, const uint8_t* key, int key_len, void* info);
esp_err_t esp_now_mod_peer(uint8_t if_idx, const uint8_t* mac, uint8_t role, const uint8_t* key, int key_len, void* info);
esp_err_t esp_now_del_peer(const uint8_t* mac);
int esp_now_get_peer_count(void);
bool esp_now_is_peer_exist(const uint8_t* mac);
esp_err_t esp_now_get_peer(const uint8_t* mac, espnow_peer_info_t* peer);
esp_err_t esp_now_send(const uint8_t* mac, const uint8_t* data, size_t len);
esp_err_t esp_now_set_pmk(const uint8_t* pmk);
esp_err_t esp_now_get_version(uint32_t* version);