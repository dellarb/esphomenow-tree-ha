#pragma once

#include <cstddef>
#include <cstdint>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

static constexpr uint16_t kOtaFrameMagic = 0x5445;  // ASCII "ET", little-endian on wire.
static constexpr uint8_t kOtaFrameVersion = 1;
static constexpr uint8_t kOtaFrameHeaderLength = 24;
static constexpr uint16_t kOtaFrameFlagFinalChunk = 0x0001;

#pragma pack(push, 1)
struct OtaChunkHeader {
  uint16_t magic;
  uint8_t version;
  uint8_t header_length;
  uint32_t job_id;
  uint32_t sequence;
  uint32_t firmware_offset;
  uint16_t payload_length;
  uint16_t flags;
  uint32_t payload_crc32;
};
#pragma pack(pop)

static_assert(sizeof(OtaChunkHeader) == kOtaFrameHeaderLength, "OTA chunk header must remain 24 bytes");

enum class OtaChunkDecodeStatus : uint8_t {
  OK = 0,
  TOO_SHORT,
  BAD_MAGIC,
  BAD_VERSION,
  BAD_HEADER_LENGTH,
  BAD_PAYLOAD_LENGTH,
  BAD_CRC,
};

struct OtaChunkView {
  OtaChunkHeader header{};
  const uint8_t *payload{nullptr};
  size_t payload_len{0};
};

class BridgeApiOtaFrame {
 public:
  static OtaChunkDecodeStatus decode(const uint8_t *data, size_t len, size_t max_payload_len, OtaChunkView &out);
  static uint32_t crc32(const uint8_t *data, size_t len);
};

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
