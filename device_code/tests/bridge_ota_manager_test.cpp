#include "../components/esp_tree_bridge/bridge_ota_manager.h"
#include "mocks/test_time.h"

#include <array>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <set>
#include <string>
#include <vector>

using namespace esphome::esp_tree;

namespace {

int g_failures = 0;

void expect(bool condition, const char *message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    ++g_failures;
  }
}

struct SendRecord {
  espnow_packet_type_t type{PKT_DISCOVER};
  std::vector<uint8_t> payload;
  uint32_t tx_counter{0};
};

struct TestRig {
  std::array<uint8_t, 6> leaf_mac{{0x10, 0x11, 0x12, 0x13, 0x14, 0x15}};
  std::array<uint8_t, 16> md5{};
  uint32_t next_tx_counter{1000};
  uint32_t no_mem_failures_remaining{0};
  std::vector<SendRecord> sends;
  ESPNowOTAManager manager;

  TestRig() {
    manager.set_send_frame_fn([this](const uint8_t *, espnow_packet_type_t type, const uint8_t *payload,
                                     size_t len, uint32_t *tx_counter_out) {
      if (no_mem_failures_remaining > 0) {
        --no_mem_failures_remaining;
        return ESP_ERR_ESPNOW_NO_MEM;
      }
      SendRecord record{};
      record.type = type;
      record.payload.assign(payload, payload + static_cast<std::ptrdiff_t>(len));
      record.tx_counter = next_tx_counter++;
      sends.push_back(record);
      if (tx_counter_out != nullptr) {
        *tx_counter_out = record.tx_counter;
      }
      return ESP_OK;
    });
  }

  espnow_ack_t make_ack(uint8_t result, uint32_t ref_tx_counter) const {
    espnow_ack_t ack{};
    ack.ack_type = PKT_FILE_TRANSFER;
    ack.result = result;
    ack.ref_tx_counter = ref_tx_counter;
    return ack;
  }

  std::vector<uint8_t> make_gaps_trailing_empty() const { return {0, 0}; }

  std::vector<uint8_t> make_gaps_trailing_with_bitmap(const uint8_t *bitmap, size_t bitmap_len) const {
    std::vector<uint8_t> trailing(2 + bitmap_len, 0);
    uint16_t len_le = static_cast<uint16_t>(bitmap_len);
    std::memcpy(trailing.data(), &len_le, sizeof(len_le));
    if (bitmap_len > 0 && bitmap != nullptr) {
      std::memcpy(trailing.data() + 2, bitmap, bitmap_len);
    }
    return trailing;
  }

  void send_accept(uint32_t announce_tx_counter, uint16_t chunk_size, uint8_t buffer_size_kb,
                   uint8_t action = ESPNOW_FILE_ACTION_OTA_FLASH) {
    uint8_t trailing[4] = {
        static_cast<uint8_t>(chunk_size & 0xFF),
        static_cast<uint8_t>((chunk_size >> 8) & 0xFF),
        buffer_size_kb,
        action,
    };
    const espnow_ack_t ack = make_ack(ESPNOW_FILE_ACK_ACCEPT, announce_tx_counter);
    manager.on_file_ack(leaf_mac.data(), ack, trailing, sizeof(trailing));
  }

  void send_gaps_empty(uint32_t ref_tx_counter) {
    const espnow_ack_t ack = make_ack(ESPNOW_FILE_ACK_GAPS, ref_tx_counter);
    auto trailing = make_gaps_trailing_empty();
    manager.on_file_ack(leaf_mac.data(), ack, trailing.data(), trailing.size());
  }

  void send_gaps_bitmap(uint32_t ref_tx_counter, const uint8_t *bitmap, size_t bitmap_len) {
    const espnow_ack_t ack = make_ack(ESPNOW_FILE_ACK_GAPS, ref_tx_counter);
    auto trailing = make_gaps_trailing_with_bitmap(bitmap, bitmap_len);
    manager.on_file_ack(leaf_mac.data(), ack, trailing.data(), trailing.size());
  }

  void send_complete(uint32_t ref_tx_counter, uint8_t action = ESPNOW_FILE_ACTION_OTA_FLASH,
                     uint8_t result = ESPNOW_FILE_COMPLETE_SUCCESS) {
    uint8_t trailing[2] = {action, result};
    const espnow_ack_t ack = make_ack(ESPNOW_FILE_ACK_COMPLETE, ref_tx_counter);
    manager.on_file_ack(leaf_mac.data(), ack, trailing, sizeof(trailing));
  }

  bool feed_chunk(uint32_t sequence, uint8_t base, size_t len) {
    std::vector<uint8_t> chunk(len, 0);
    for (size_t i = 0; i < len; ++i) {
      chunk[i] = static_cast<uint8_t>(base + i);
    }
    return manager.on_source_chunk(sequence, chunk.data(), chunk.size());
  }

  SendRecord &last_send() { return sends.back(); }

  size_t count_type(espnow_packet_type_t type) const {
    size_t n = 0;
    for (const auto &s : sends) {
      if (s.type == type) {
        ++n;
      }
    }
    return n;
  }

  SendRecord *find_last_bc() {
    for (int i = static_cast<int>(sends.size()) - 1; i >= 0; --i) {
      if (sends[i].type == PKT_FILE_TRANSFER && sends[i].payload.size() == 3 &&
          sends[i].payload[0] == ESPNOW_FILE_PHASE_BLAST_COMPLETE) {
        return &sends[i];
      }
    }
    return nullptr;
  }

  SendRecord *find_last_end() {
    for (int i = static_cast<int>(sends.size()) - 1; i >= 0; --i) {
      if (sends[i].type == PKT_FILE_TRANSFER && sends[i].payload.size() == 1 &&
          sends[i].payload[0] == ESPNOW_FILE_PHASE_END) {
        return &sends[i];
      }
    }
    return nullptr;
  }
};

static std::vector<uint8_t> build_bitmap_all_received(size_t num_chunks) {
  size_t bitmap_bytes = (num_chunks + 7) / 8;
  std::vector<uint8_t> bitmap(bitmap_bytes, 0);
  for (size_t i = 0; i < num_chunks; ++i) {
    size_t byte_idx = i / 8;
    uint8_t bit_mask = static_cast<uint8_t>(1 << (i % 8));
    bitmap[byte_idx] |= bit_mask;
  }
  return bitmap;
}

static std::vector<uint8_t> build_bitmap_missing_last(size_t num_chunks) {
  size_t bitmap_bytes = (num_chunks + 7) / 8;
  std::vector<uint8_t> bitmap(bitmap_bytes, 0);
  for (size_t i = 0; i < num_chunks - 1; ++i) {
    size_t byte_idx = i / 8;
    uint8_t bit_mask = static_cast<uint8_t>(1 << (i % 8));
    bitmap[byte_idx] |= bit_mask;
  }
  return bitmap;
}

void test_file_size_over_1gb_rejected() {
  test::reset_mock_state();

  TestRig rig;
  expect(!rig.manager.is_busy(), "manager starts IDLE");

  uint8_t large_md5[16] = {0};
  bool started = rig.manager.start_transfer(rig.leaf_mac.data(), 1073741825U, large_md5,
                                            ESPNOW_FILE_ACTION_OTA_FLASH, 250);
  expect(!started, "1GB+1 file_size rejected");
  expect(rig.sends.empty(), "no packets sent for rejected transfer");
}

void test_increment_geometry_single_increment() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;

  rig.send_accept(announce_tx, 221, 8);

  const auto &tr = rig.manager.increment_tracker();
  expect(tr.chunks_per_increment == 37, "8KB / 221 = 37 chunks per increment");
  expect(tr.total_chunks == 4, "884 bytes / 221 = 4 chunks");
  expect(tr.total_increments == 1, "4 chunks fits in 1 increment");
  expect(tr.chunks_in_last_increment == 4, "last increment has 4 chunks");
}

void test_increment_geometry_partial_last() {
  test::reset_mock_state();

  TestRig rig;
  uint32_t file_size = 8177 + 59;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), file_size, rig.md5.data(),
                                    ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;

  rig.send_accept(announce_tx, 221, 8);

  const auto &tr = rig.manager.increment_tracker();
  expect(tr.total_chunks == 38, "8177+59 bytes needs 38 chunks");
  expect(tr.chunks_per_increment == 37, "37 chunks per full increment");
  expect(tr.total_increments == 2, "ceil(38/37) = 2 increments");
  expect(tr.chunks_in_last_increment == 1, "last increment has 1 chunk");
}

void test_increment_geometry_multi_increment() {
  test::reset_mock_state();

  TestRig rig;
  uint32_t file_size = 37 * 4 * 221 + 1;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), file_size, rig.md5.data(),
                                    ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;

  rig.send_accept(announce_tx, 221, 8);

  const auto &tr = rig.manager.increment_tracker();
  expect(tr.total_chunks == 149, "4*37+1 = 149 chunks");
  expect(tr.total_increments == 5, "ceil(149/37) = 5 increments");
  expect(tr.chunks_in_last_increment == 1, "last has 1 chunk");
}

void test_blast_complete_then_gaps_empty_single_increment() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  expect(rig.sends.size() == 1, "announce sent");

  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  expect(rig.manager.current_increment() == 0, "current_increment = 0");
  expect(rig.manager.total_increments() == 1, "1 increment total");

for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.feed_chunk(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  expect(rig.sends.size() == 6, "4 data chunks + BLAST_COMPLETE + END");
  auto *bc = rig.find_last_bc();
  expect(bc != nullptr, "BLAST_COMPLETE sent");
  expect(bc->payload.size() == 3, "BLAST_COMPLETE is 3 bytes");
  expect(bc->payload[0] == ESPNOW_FILE_PHASE_BLAST_COMPLETE, "phase is BLAST_COMPLETE");

  const uint32_t bc_tx = bc->tx_counter;
  expect(bc_tx > announce_tx, "BLAST_COMPLETE tx > announce tx");

  expect(rig.manager.increment_tracker().is_last_increment(), "is last increment");

  rig.send_gaps_empty(bc_tx);

  rig.manager.loop();

  auto *end_rec = rig.find_last_end();
  expect(end_rec != nullptr, "END packet sent after last increment complete");

  rig.send_complete(end_rec->tx_counter);

  expect(!rig.manager.is_busy(), "manager reset after COMPLETE");
}

void test_blast_complete_then_gaps_empty_multi_increment() {
  test::reset_mock_state();

  TestRig rig;
  uint32_t file_size = 37 * 2 * 221;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), file_size, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  expect(rig.sends.size() == 1, "announce sent");

  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  expect(rig.manager.total_increments() == 2, "2 increments");
  expect(rig.manager.increment_tracker().chunks_per_increment == 37, "37 chunks per inc");

  for (int inc = 0; inc < 2; ++inc) {
    uint16_t chunks = rig.manager.increment_tracker().chunks_in_this_increment();
    uint32_t start_seq = static_cast<uint32_t>(inc) * 37;

    for (uint16_t i = 0; i < chunks; ++i) {
      uint32_t seq = start_seq + i;
      rig.feed_chunk(seq, static_cast<uint8_t>(i * 10), 221);
    }

    auto *bc = rig.find_last_bc();
    expect(bc != nullptr, "BLAST_COMPLETE sent for increment");

    uint16_t expected_inc_idx = static_cast<uint16_t>(inc);
    uint16_t bc_inc_idx = bc->payload[1] | (static_cast<uint16_t>(bc->payload[2]) << 8);
    expect(bc_inc_idx == expected_inc_idx, "BLAST_COMPLETE has correct increment index");

    const uint32_t bc_tx = bc->tx_counter;
    rig.send_gaps_empty(bc_tx);
  }

  expect(!rig.manager.is_busy(), "manager not busy after 2 increments");
}

void test_blast_complete_then_gaps_with_missing_chunks() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 8177 + 59, rig.md5.data(),
                                    ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  expect(rig.manager.total_increments() == 2, "2 increments");

  uint32_t inc0_start = 0;
  for (uint32_t seq = inc0_start; seq < inc0_start + 36; ++seq) {
    rig.feed_chunk(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  expect(rig.sends.size() == 36 + 1, "36 data chunks + BLAST_COMPLETE");
  auto *bc = rig.find_last_bc();
  const uint32_t bc_tx = bc->tx_counter;

  auto bitmap = build_bitmap_missing_last(37);
  rig.send_gaps_bitmap(bc_tx, bitmap.data(), bitmap.size());

  expect(rig.manager.increment_tracker().retransmit_round == 1, "retransmit_round = 1");
  expect(rig.manager.increment_tracker().gap_sequences.size() == 1, "1 gap (chunk 36 missing)");
  expect(*rig.manager.increment_tracker().gap_sequences.begin() == 36, "gap is seq 36");

  rig.feed_chunk(36, 0xBB, 221);

  bc = rig.find_last_bc();
  const uint32_t bc_tx2 = bc->tx_counter;
  expect(bc_tx2 != bc_tx, "second BLAST_COMPLETE has new tx_counter");

  rig.send_gaps_empty(bc_tx2);

  expect(rig.manager.increment_tracker().current_increment == 1, "advanced to increment 1");
  expect(rig.manager.increment_tracker().is_last_increment(), "increment 1 is last");

  rig.feed_chunk(37, 0xCC, 59);

  bc = rig.find_last_bc();
  expect(bc != nullptr, "BLAST_COMPLETE for last increment sent");

  auto *end_rec = rig.find_last_end();
  expect(end_rec != nullptr, "END sent");

  rig.send_complete(end_rec->tx_counter);
  expect(!rig.manager.is_busy(), "manager done after gaps empty");
}

void test_blast_complete_timeout_retry() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  size_t sends_before_timeout = 0;
  for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.feed_chunk(seq, static_cast<uint8_t>(seq * 10), 221);
    sends_before_timeout = rig.sends.size();
  }

  auto *bc = rig.find_last_bc();
  const uint32_t first_bc_tx = bc->tx_counter;

  rig.manager.loop();
  expect(rig.sends.size() == sends_before_timeout, "no new sends before timeout");

  for (int i = 0; i < ESPNOW_MAX_BLAST_COMPLETE_RETRIES; ++i) {
    test::advance_mock_time_ms(ESPNOW_BLAST_COMPLETE_TIMEOUT_MS);
    rig.manager.loop();
  }

  expect(!rig.manager.is_busy(), "manager aborted after max retries");
  expect(rig.manager.last_error() == "BLAST_COMPLETE retry limit exceeded", "correct error");
}

void test_retransmit_rounds_exceeded() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 8177 + 59, rig.md5.data(),
                                    ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  uint32_t bc_tx = 0;
  for (int round = 0; round <= ESPNOW_MAX_RETRANSMIT_ROUNDS; ++round) {
    rig.feed_chunk(round, static_cast<uint8_t>(round * 10), 221);

    bc_tx = rig.find_last_bc()->tx_counter;

    auto bitmap = build_bitmap_missing_last(37);
    rig.send_gaps_bitmap(bc_tx, bitmap.data(), bitmap.size());
  }

  expect(!rig.manager.is_busy(), "manager aborted after retransmit rounds exceeded");
  expect(rig.manager.last_error() == "retransmit rounds exceeded", "correct error");
}

void test_radio_silence_abort() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.feed_chunk(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  test::advance_mock_time_ms(ESPNOW_RADIO_SILENCE_ABORT_MS);
  rig.manager.loop();

  expect(!rig.manager.is_busy(), "manager aborted on radio silence");
  expect(rig.manager.last_error() == "radio silence from remote", "radio silence error");
}

void test_accept_negotiation_uses_remote_buffer_kb() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;

  rig.send_accept(announce_tx, 221, 8);

  expect(rig.manager.buffer_size_kb() == 8, "buffer_size_kb = 8 from remote");
  expect(rig.manager.increment_tracker().chunks_per_increment == 37, "37 chunks per increment");
}

void test_stale_gaps_ack_ignored() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.feed_chunk(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  auto *bc = rig.find_last_bc();
  const uint32_t bc_tx = bc->tx_counter;

  espnow_ack_t stale_ack{};
  stale_ack.ack_type = PKT_FILE_TRANSFER;
  stale_ack.result = ESPNOW_FILE_ACK_GAPS;
  stale_ack.ref_tx_counter = bc_tx - 100;
  uint8_t trailing[2] = {0, 0};
  rig.manager.on_file_ack(rig.leaf_mac.data(), stale_ack, trailing, sizeof(trailing));

  expect(rig.manager.increment_tracker().current_increment == 0, "stale GAPS ignored, increment still 0");

  rig.send_gaps_empty(bc_tx);
  expect(rig.manager.increment_tracker().is_last_increment(), "increment advanced with valid GAPS");
}

void test_last_increment_partial() {
  test::reset_mock_state();

  TestRig rig;
  uint32_t file_size = 8177 + 59;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), file_size, rig.md5.data(),
                                    ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  expect(rig.manager.total_increments() == 2, "2 increments");
  expect(rig.manager.increment_tracker().chunks_in_last_increment == 1, "last has 1 chunk");

  for (uint32_t seq = 0; seq < 37; ++seq) {
    rig.feed_chunk(seq, 0xAA, 221);
  }

  auto *bc = rig.find_last_bc();
  const uint32_t bc_tx0 = bc->tx_counter;
  rig.send_gaps_empty(bc_tx0);

  expect(rig.manager.increment_tracker().current_increment == 1, "advanced to increment 1");

  rig.feed_chunk(37, 0xBB, 59);

  bc = rig.find_last_bc();
  expect(bc != nullptr, "BLAST_COMPLETE sent for last increment");

  auto *end_rec = rig.find_last_end();
  expect(end_rec != nullptr, "END sent after partial last increment");

  rig.send_complete(end_rec->tx_counter);
  expect(!rig.manager.is_busy(), "manager complete after partial last increment");
}

void test_global_timeout() {
  test::reset_mock_state();

  TestRig rig;
  ESPNowOTAManager::Config cfg;
  cfg.global_timeout_ms = 1000;
  rig.manager = ESPNowOTAManager(cfg);

  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  test::advance_mock_time_ms(1000);
  rig.manager.loop();

  expect(!rig.manager.is_busy(), "manager aborted on global timeout");
  expect(rig.manager.last_error() == "transfer global timeout", "global timeout error");
}

void test_accept_rejects_action_mismatch() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;

  uint8_t trailing[4] = {221, 0, 8, ESPNOW_FILE_ACTION_EXECUTE};
  espnow_ack_t ack = rig.make_ack(ESPNOW_FILE_ACK_ACCEPT, announce_tx);
  rig.manager.on_file_ack(rig.leaf_mac.data(), ack, trailing, sizeof(trailing));

  expect(!rig.manager.is_busy(), "manager rejected due to action mismatch");
  expect(rig.manager.last_error() == "accept ack action mismatch", "action mismatch error");
}

void test_accept_rejects_zero_buffer_kb() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;

  uint8_t trailing[4] = {221, 0, 0, ESPNOW_FILE_ACTION_OTA_FLASH};
  espnow_ack_t ack = rig.make_ack(ESPNOW_FILE_ACK_ACCEPT, announce_tx);
  rig.manager.on_file_ack(rig.leaf_mac.data(), ack, trailing, sizeof(trailing));

  expect(!rig.manager.is_busy(), "manager rejected due to zero buffer_size_kb");
  expect(rig.manager.last_error() == "remote buffer_size_kb is 0", "zero buffer error");
}

void test_status_json_format() {
  test::reset_mock_state();

  TestRig rig;
  expect(rig.manager.start_transfer(rig.leaf_mac.data(), 884, rig.md5.data(), ESPNOW_FILE_ACTION_OTA_FLASH, 250),
         "transfer starts");
  const uint32_t announce_tx = rig.sends.front().tx_counter;
  rig.send_accept(announce_tx, 221, 8);

  std::string json = rig.manager.status_json();
  expect(json.find("\"current_increment\":0") != std::string::npos, "status has current_increment");
  expect(json.find("\"total_increments\":1") != std::string::npos, "status has total_increments");
  expect(json.find("\"retransmit_round\":0") != std::string::npos, "status has retransmit_round");
  expect(json.find("\"buffer_size_kb\":8") != std::string::npos, "status has buffer_size_kb");
  expect(json.find("\"requested\":[") != std::string::npos, "status has requested array");
}

}  // namespace

int main() {
  test_file_size_over_1gb_rejected();
  test_increment_geometry_single_increment();
  test_increment_geometry_partial_last();
  test_increment_geometry_multi_increment();
  test_blast_complete_then_gaps_empty_single_increment();
  test_blast_complete_then_gaps_empty_multi_increment();
  test_blast_complete_then_gaps_with_missing_chunks();
  test_blast_complete_timeout_retry();
  test_retransmit_rounds_exceeded();
  test_radio_silence_abort();
  test_accept_negotiation_uses_remote_buffer_kb();
  test_stale_gaps_ack_ignored();
  test_last_increment_partial();
  test_global_timeout();
  test_accept_rejects_action_mismatch();
  test_accept_rejects_zero_buffer_kb();
  test_status_json_format();

  if (g_failures != 0) {
    std::cerr << g_failures << " bridge_ota_manager test(s) failed\n";
    return 1;
  }

  std::cout << "bridge_ota_manager tests passed\n";
  return 0;
}
