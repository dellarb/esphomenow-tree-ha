#pragma once
#include <Arduino.h>
#define ESP_LOGE(tag, fmt, ...) Serial.printf("[E][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGW(tag, fmt, ...) Serial.printf("[W][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGI(tag, fmt, ...) Serial.printf("[I][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGD(tag, fmt, ...) Serial.printf("[D][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGV(tag, fmt, ...) Serial.printf("[V][%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGCONFIG(tag, fmt, ...) Serial.printf("[C][%s] " fmt "\n", tag, ##__VA_ARGS__)
