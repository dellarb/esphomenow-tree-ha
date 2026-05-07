#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>

namespace esphome {
namespace esp_tree {

class BridgeTransport {
 public:
  virtual ~BridgeTransport() = default;
  virtual bool start() = 0;
  virtual bool is_connected() = 0;
  virtual bool send(const uint8_t *data, size_t len) = 0;
  virtual void stop() = 0;
  virtual void loop() {}
  void set_on_received(std::function<void(const uint8_t *, size_t)> callback) { on_received_ = std::move(callback); }
  void set_on_connected(std::function<void()> callback) { on_connected_ = std::move(callback); }
  void set_on_disconnected(std::function<void()> callback) { on_disconnected_ = std::move(callback); }

 protected:
  std::function<void(const uint8_t *, size_t)> on_received_;
  std::function<void()> on_connected_;
  std::function<void()> on_disconnected_;
};

}  // namespace esp_tree
}  // namespace esphome