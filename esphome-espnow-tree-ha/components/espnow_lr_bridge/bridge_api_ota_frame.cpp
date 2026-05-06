#include "bridge_api_ota_frame.h"

#include <array>
#include <cstring>

namespace esphome {
namespace espnow_lr {
namespace bridge_api {

namespace {

static constexpr uint32_t kCrc32Poly = 0xEDB88320u;

static constexpr std::array<uint32_t, 256> make_crc32_table() {
  std::array<uint32_t, 256> table{};
  for (uint32_t i = 0; i < 256; i++) {
    uint32_t crc = i;
    for (int j = 0; j < 8; j++) {
      crc = (crc & 1) ? (kCrc32Poly ^ (crc >> 1)) : (crc >> 1);
    }
    table[i] = crc;
  }
  return table;
}

static constexpr auto kCrc32Table = make_crc32_table();

}  // namespace

uint32_t BridgeApiOtaFrame::crc32(const uint8_t *data, size_t len) {
  uint32_t crc = 0xFFFFFFFFu;
  for (size_t i = 0; i < len; i++) {
    crc = kCrc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
  }
  return crc ^ 0xFFFFFFFFu;
}

OtaChunkDecodeStatus BridgeApiOtaFrame::decode(const uint8_t *data, size_t len, size_t max_payload_len,
                                                OtaChunkView &out) {
  if (len < kOtaFrameHeaderLength)
    return OtaChunkDecodeStatus::TOO_SHORT;

  OtaChunkHeader header;
  memcpy(&header, data, sizeof(header));

  if (header.magic != kOtaFrameMagic)
    return OtaChunkDecodeStatus::BAD_MAGIC;
  if (header.version != kOtaFrameVersion)
    return OtaChunkDecodeStatus::BAD_VERSION;
  if (header.header_length != kOtaFrameHeaderLength)
    return OtaChunkDecodeStatus::BAD_HEADER_LENGTH;

  size_t payload_len = header.payload_length;
  if (payload_len > max_payload_len || len < kOtaFrameHeaderLength + payload_len)
    return OtaChunkDecodeStatus::BAD_PAYLOAD_LENGTH;

  const uint8_t *payload = data + kOtaFrameHeaderLength;
  uint32_t computed_crc = crc32(payload, payload_len);
  if (computed_crc != header.payload_crc32)
    return OtaChunkDecodeStatus::BAD_CRC;

  out.header = header;
  out.payload = payload;
  out.payload_len = payload_len;

  return OtaChunkDecodeStatus::OK;
}

}  // namespace bridge_api
}  // namespace espnow_lr
}  // namespace esphome
