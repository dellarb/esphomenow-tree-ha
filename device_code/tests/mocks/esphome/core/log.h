#pragma once

#include <cstdio>

#ifndef ESP_LOGD
#define ESP_LOGD(tag, format, ...) ((void) 0)
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
#define ESP_LOGV(tag, format, ...) ((void) 0)
#endif
