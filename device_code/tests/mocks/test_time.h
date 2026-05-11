#pragma once

#include <cstdint>
#include <cstddef>
#include <cstdlib>
#include <cstdio>
#include <functional>

#ifndef ESP_LOGD
#define ESP_LOGD(tag, format, ...) ((void)0)
#endif

#ifndef ESP_LOGI
#define ESP_LOGI(tag, format, ...) fprintf(stdout, "[I] " format "\n", ##__VA_ARGS__)
#endif

#ifndef ESP_LOGW
#define ESP_LOGW(tag, format, ...) fprintf(stdout, "[W] " format "\n", ##__VA_ARGS__)
#endif

#ifndef ESP_LOGE
#define ESP_LOGE(tag, format, ...) fprintf(stderr, "[E] " format "\n", ##__VA_ARGS__)
#endif

#ifndef ESP_LOGV
#define ESP_LOGV(tag, format, ...) ((void)0)
#endif

#define pdMS_TO_TICKS(ms) (0)
#define vTaskDelay(x) ((void)0)

namespace test {

uint32_t mock_time_ms();
uint32_t mock_random();
void set_mock_time_ms(uint32_t t);
void advance_mock_time_ms(uint32_t delta);
void set_mock_random_seed(uint32_t seed);
void reset_mock_state();

}

static inline uint32_t millis() { return test::mock_time_ms(); }
static inline uint32_t esp_random() { return test::mock_random(); }