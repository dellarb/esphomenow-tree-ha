#include "../components/esp_tree_remote/remote_file_receiver.h"
#include "mocks/test_time.h"

#include <algorithm>
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

struct AckRecord {
  espnow_ack_t header{};
  std::vector<uint8_t> trailing;
};

AckRecord decode_ack(const std::vector<uint8_t> &payload) {
  AckRecord ack{};
  if (payload.size() >= sizeof(espnow_ack_t)) {
    std::memcpy(&ack.header, payload.data(), sizeof(ack.header));
    ack.trailing.assign(payload.begin() + static_cast<std::ptrdiff_t>(sizeof(ack.header)), payload.end());
  }
  return ack;
}

struct MockFlashHandler : public FileReceiver::ActionHandler {
  FileReceiver::AnnounceResponse announce_response{};
  uint8_t end_result{ESPNOW_FILE_COMPLETE_SUCCESS};
  bool restart_after_complete{false};
  bool receiving{false};
  uint8_t last_abort_reason{0xFF};
  std::vector<uint32_t> delivered_sequences;
  std::vector<uint8_t> delivered_bytes;
  int fail_after_n_calls{0};
  int call_count{0};

  FileReceiver::AnnounceResponse on_announce(uint32_t file_size, const uint8_t[16], uint16_t chunk_size,
                                            uint8_t action, const char *file_id,
                                            uint16_t &buffer_size_kb) override {
    (void) file_size;
    (void) chunk_size;
    (void) action;
    (void) file_id;
    receiving = announce_response.accepted;
    buffer_size_kb = 8;
    return announce_response;
  }

  FileReceiver::ChunkResponse on_data(uint32_t sequence, const uint8_t *data, size_t len) override {
    ++call_count;
    delivered_sequences.push_back(sequence);
    delivered_bytes.insert(delivered_bytes.end(), data, data + static_cast<std::ptrdiff_t>(len));
    if (fail_after_n_calls > 0 && call_count >= fail_after_n_calls) {
      FileReceiver::ChunkResponse resp{};
      resp.accepted = false;
      resp.abort_reason = ESPNOW_FILE_ABORT_FLASH_ERROR;
      return resp;
    }
    return {};
  }

  uint8_t on_end() override {
    receiving = false;
    return end_result;
  }

  void on_abort(uint8_t reason) override {
    receiving = false;
    last_abort_reason = reason;
  }

  bool is_receiving() const override { return receiving; }
  bool wants_restart_after_complete() const override { return restart_after_complete; }
};

struct TestRig {
  std::vector<std::vector<uint8_t>> acks;
  MockFlashHandler handler;
  FileReceiver receiver;

  TestRig() {
    receiver.set_ota_enabled(true);
    receiver.set_announce_tx_counter(0xAABBCCDDu);
    receiver.register_handler(ESPNOW_FILE_ACTION_OTA_FLASH, &handler);
    receiver.set_send_ack_fn([this](const uint8_t *payload, size_t len) {
      acks.emplace_back(payload, payload + static_cast<std::ptrdiff_t>(len));
      return true;
    });
  }

  void reset() {
    acks.clear();
    handler.delivered_sequences.clear();
    handler.delivered_bytes.clear();
    handler.call_count = 0;
    handler.fail_after_n_calls = 0;
  }

  AckRecord last_ack() const { return decode_ack(acks.back()); }

  void announce_with_accept(uint32_t file_size, uint16_t chunk_size = 221,
                            uint8_t action = ESPNOW_FILE_ACTION_OTA_FLASH) {
    handler.announce_response.accepted = true;
    handler.announce_response.negotiated_chunk_size = chunk_size;

    std::vector<uint8_t> announce_payload(sizeof(espnow_file_announce_t), 0);
    auto *announce = reinterpret_cast<espnow_file_announce_t *>(announce_payload.data());
    announce->phase = ESPNOW_FILE_PHASE_ANNOUNCE;
    announce->file_size = file_size;
    announce->chunk_size = chunk_size;
    announce->action = action;
    const char *file_id_str = "ota_fw";
    std::memcpy(announce->file_id, file_id_str, std::strlen(file_id_str));

    expect(receiver.handle_file_transfer(announce_payload.data(), announce_payload.size()), "announce handled");
  }

  void send_data(uint32_t sequence, uint8_t base, size_t len) {
    std::vector<uint8_t> payload(sizeof(espnow_file_data_header_t) + len, 0);
    auto *header = reinterpret_cast<espnow_file_data_header_t *>(payload.data());
    header->sequence = sequence;
    std::fill(payload.begin() + sizeof(*header), payload.end(), base);
    receiver.handle_file_data(payload.data(), payload.size());
  }

  void send_blast_complete(uint16_t increment_index) {
    espnow_file_blast_complete_t bc{};
    bc.phase = ESPNOW_FILE_PHASE_BLAST_COMPLETE;
    bc.increment_index = increment_index;
    std::vector<uint8_t> payload(reinterpret_cast<uint8_t *>(&bc),
                                  reinterpret_cast<uint8_t *>(&bc) + sizeof(bc));
    receiver.handle_file_transfer(payload.data(), payload.size());
  }

  void send_end() {
    espnow_file_end_t end_pkt{};
    end_pkt.phase = ESPNOW_FILE_PHASE_END;
    std::vector<uint8_t> payload(reinterpret_cast<uint8_t *>(&end_pkt),
                                  reinterpret_cast<uint8_t *>(&end_pkt) + sizeof(end_pkt));
    receiver.handle_file_transfer(payload.data(), payload.size());
  }

  size_t count_acks_with_result(uint8_t result) const {
    size_t n = 0;
    for (const auto &a : acks) {
      AckRecord r = decode_ack(a);
      if (r.header.result == result) {
        ++n;
      }
    }
    return n;
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

void test_announce_accept_with_buffer_kb() {
  test::reset_mock_state();

  TestRig rig;
  rig.announce_with_accept(884, 221);

  expect(rig.acks.size() == 1, "accept ACK sent");
  AckRecord ack = rig.last_ack();
  expect(ack.header.ack_type == PKT_FILE_TRANSFER, "ack_type is file transfer");
  expect(ack.header.result == ESPNOW_FILE_ACK_ACCEPT, "result is ACCEPT");
  expect(ack.trailing.size() == 4, "accept trailing is 4 bytes");

  uint16_t negotiated_chunk = 0;
  std::memcpy(&negotiated_chunk, ack.trailing.data(), sizeof(negotiated_chunk));
  expect(negotiated_chunk == 221, "negotiated chunk is 221");
  expect(ack.trailing[2] > 0, "buffer_size_kb echoed in accept");
  expect(ack.trailing[3] == ESPNOW_FILE_ACTION_OTA_FLASH, "action echoed");
}

void test_blast_then_increment_complete() {
  test::reset_mock_state();

  TestRig rig;
  rig.announce_with_accept(884, 221);

  expect(rig.acks.size() == 1, "accept ACK sent");

  for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.send_data(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  expect(rig.acks.size() == 1, "no ACK during blast");

  rig.send_blast_complete(0);

  expect(rig.acks.size() == 2, "GAPS ACK sent after BLAST_COMPLETE");
  AckRecord gaps_ack = rig.last_ack();
  expect(gaps_ack.header.result == ESPNOW_FILE_ACK_GAPS, "result is GAPS");

  uint16_t bitmap_len = 0;
  std::memcpy(&bitmap_len, gaps_ack.trailing.data(), sizeof(bitmap_len));
  expect(bitmap_len == 0, "empty bitmap = all chunks received");
}

void test_gaps_retransmit_then_complete() {
  test::reset_mock_state();

  TestRig rig;
  rig.announce_with_accept(8177 + 59, 221);

  expect(rig.acks.size() == 1, "accept ACK sent");
  expect(rig.acks.size() == 1, "accept sent");

  for (uint32_t seq = 0; seq < 36; ++seq) {
    rig.send_data(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  expect(rig.acks.size() == 1, "no ACK during partial blast");

  rig.send_blast_complete(0);

  expect(rig.acks.size() == 2, "GAPS ACK sent for partial increment");
  AckRecord gaps_ack = rig.last_ack();
  expect(gaps_ack.header.result == ESPNOW_FILE_ACK_GAPS, "result is GAPS");

  uint16_t bitmap_len = 0;
  std::memcpy(&bitmap_len, gaps_ack.trailing.data(), sizeof(bitmap_len));
  expect(bitmap_len > 0, "bitmap present for missing chunk");

  const uint8_t *bitmap = gaps_ack.trailing.data() + 2;
  uint8_t bit36 = bitmap[4] & 0x01;
  expect(bit36 == 0, "bit 36 is 0 (chunk 36 missing in bitmap)");

  rig.send_data(36, 0xBB, 221);

  rig.send_blast_complete(0);

  AckRecord gaps_ack2 = rig.last_ack();
  expect(gaps_ack2.header.result == ESPNOW_FILE_ACK_GAPS, "result is GAPS");
  uint16_t bitmap_len2 = 0;
  std::memcpy(&bitmap_len2, gaps_ack2.trailing.data(), sizeof(bitmap_len2));
  expect(bitmap_len2 == 0, "empty bitmap after retransmit = all chunks received");
}

void test_blast_wrong_increment_index_ignored() {
  test::reset_mock_state();

  TestRig rig;
  rig.announce_with_accept(884, 221);

  for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.send_data(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  rig.send_blast_complete(99);

  expect(rig.acks.size() == 2, "GAPS re-sent for wrong increment index");
  AckRecord gaps_ack = rig.last_ack();
  expect(gaps_ack.header.result == ESPNOW_FILE_ACK_GAPS, "result is GAPS");
  uint16_t bitmap_len = 0;
  std::memcpy(&bitmap_len, gaps_ack.trailing.data(), sizeof(bitmap_len));
  expect(bitmap_len == 0, "empty bitmap = current increment complete, re-sent all-clear");
}

void test_last_increment_end_flow() {
  test::reset_mock_state();

  TestRig rig;
  uint32_t file_size = 8177 + 59;
  rig.announce_with_accept(file_size, 221);

  expect(rig.acks.size() == 1, "accept ACK sent");

  for (uint32_t seq = 0; seq < 37; ++seq) {
    rig.send_data(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  rig.send_blast_complete(0);

  expect(rig.acks.size() == 2, "GAPS ACK sent for increment 0");
  AckRecord gaps_ack0 = rig.last_ack();
  uint16_t bitmap_len0 = 0;
  std::memcpy(&bitmap_len0, gaps_ack0.trailing.data(), sizeof(bitmap_len0));
  expect(bitmap_len0 == 0, "increment 0 complete (empty bitmap)");

  rig.send_data(37, 0xCC, 59);

  rig.send_blast_complete(1);

  expect(rig.acks.size() == 3, "GAPS ACK sent for last increment");
  AckRecord gaps_ack1 = rig.last_ack();
  expect(gaps_ack1.header.result == ESPNOW_FILE_ACK_GAPS, "result is GAPS");
  uint16_t bitmap_len1 = 0;
  std::memcpy(&bitmap_len1, gaps_ack1.trailing.data(), sizeof(bitmap_len1));
  expect(bitmap_len1 == 0, "last increment complete (empty bitmap)");

  rig.send_end();

  expect(rig.acks.size() == 4, "COMPLETE ACK sent after END");
  AckRecord complete_ack = rig.last_ack();
  expect(complete_ack.header.result == ESPNOW_FILE_ACK_COMPLETE, "result is COMPLETE");
  expect(complete_ack.trailing[0] == ESPNOW_FILE_ACTION_OTA_FLASH, "action echoed");
  expect(complete_ack.trailing[1] == ESPNOW_FILE_COMPLETE_SUCCESS, "result is SUCCESS");
}

void test_flash_write_failure_retry_abort() {
  test::reset_mock_state();

  TestRig rig;
  rig.handler.fail_after_n_calls = 1;

  rig.announce_with_accept(884, 221);

  for (uint32_t seq = 0; seq < 4; ++seq) {
    rig.send_data(seq, static_cast<uint8_t>(seq * 10), 221);
  }

  rig.send_blast_complete(0);

  expect(rig.acks.size() == 2, "abort sent after write failure + retry failure");
  expect(rig.handler.last_abort_reason == ESPNOW_FILE_ABORT_FLASH_ERROR, "abort reason is FLASH_ERROR");
}

void test_radio_silence_abort() {
  test::reset_mock_state();

  TestRig rig;
  rig.announce_with_accept(884, 221);

  rig.send_data(0, 0xAA, 221);

  expect(rig.acks.size() == 1, "accept ACK sent before radio silence");

  test::advance_mock_time_ms(ESPNOW_RADIO_SILENCE_ABORT_MS + 1);
  rig.receiver.loop();

  expect(rig.acks.size() == 2, "abort ACK sent after radio silence timeout");
  AckRecord abort_ack = rig.last_ack();
  expect(abort_ack.header.result == ESPNOW_FILE_ACK_ABORT, "result is ABORT");
  expect(abort_ack.trailing[0] == ESPNOW_FILE_ABORT_TIMEOUT, "reason is TIMEOUT");
}

void test_duplicate_chunk_ignored() {
  test::reset_mock_state();

  TestRig rig;
  rig.announce_with_accept(884, 221);

  rig.send_data(0, 0xAA, 221);
  expect(rig.acks.size() == 1, "accept ACK only");
  expect(rig.handler.delivered_sequences.size() == 1, "chunk 0 delivered");

  rig.send_data(0, 0xBB, 221);

  expect(rig.handler.delivered_sequences.size() == 1, "duplicate chunk 0 not re-delivered");
  expect(rig.handler.delivered_bytes.size() == 221, "only one copy of chunk 0 data");

  rig.send_data(1, 0xCC, 221);
  rig.send_data(1, 0xDD, 221);

  expect(rig.handler.delivered_sequences.size() == 2, "chunk 1 delivered once");

  rig.send_blast_complete(0);

  AckRecord gaps_ack = rig.last_ack();
  expect(gaps_ack.header.result == ESPNOW_FILE_ACK_GAPS, "result is GAPS");
  uint16_t bitmap_len = 0;
  std::memcpy(&bitmap_len, gaps_ack.trailing.data(), sizeof(bitmap_len));
  expect(bitmap_len == 0, "all chunks received (duplicates ignored)");
}

void test_disabled_ota_reject() {
  test::reset_mock_state();

  TestRig rig;
  rig.receiver.set_ota_enabled(false);

  std::vector<uint8_t> announce_payload(sizeof(espnow_file_announce_t), 0);
  auto *announce = reinterpret_cast<espnow_file_announce_t *>(announce_payload.data());
  announce->phase = ESPNOW_FILE_PHASE_ANNOUNCE;
  announce->file_size = 884;
  announce->chunk_size = 221;
  announce->action = ESPNOW_FILE_ACTION_OTA_FLASH;

  expect(rig.receiver.handle_file_transfer(announce_payload.data(), announce_payload.size()),
         "announce handled (reject sent)");

  expect(rig.acks.size() == 1, "reject ACK sent");
  AckRecord reject_ack = rig.last_ack();
  expect(reject_ack.header.result == ESPNOW_FILE_ACK_REJECT, "result is REJECT");
  expect(reject_ack.trailing[0] == ESPNOW_FILE_ACTION_OTA_FLASH, "action echoed");
  expect(reject_ack.trailing[1] == ESPNOW_FILE_REJECT_UNSUPPORTED, "reason is UNSUPPORTED");
}

void test_file_size_over_1gb_rejected() {
  test::reset_mock_state();

  TestRig rig;
  rig.handler.announce_response.accepted = true;
  rig.handler.announce_response.negotiated_chunk_size = 221;

  std::vector<uint8_t> announce_payload(sizeof(espnow_file_announce_t), 0);
  auto *announce = reinterpret_cast<espnow_file_announce_t *>(announce_payload.data());
  announce->phase = ESPNOW_FILE_PHASE_ANNOUNCE;
  announce->file_size = 1073741825U;
  announce->chunk_size = 221;
  announce->action = ESPNOW_FILE_ACTION_OTA_FLASH;

  expect(rig.receiver.handle_file_transfer(announce_payload.data(), announce_payload.size()), "announce handled");

  expect(rig.acks.size() == 1, "reject ACK sent for >1GB file");
  AckRecord reject_ack = rig.last_ack();
  expect(reject_ack.header.result == ESPNOW_FILE_ACK_REJECT, "result is REJECT");
  expect(reject_ack.trailing[1] == ESPNOW_FILE_REJECT_NO_SPACE, "reason is NO_SPACE");
}

void test_announce_timeout() {
  test::reset_mock_state();

  TestRig rig;
  rig.handler.announce_response.accepted = true;
  rig.handler.announce_response.negotiated_chunk_size = 221;

  std::vector<uint8_t> announce_payload(sizeof(espnow_file_announce_t), 0);
  auto *announce = reinterpret_cast<espnow_file_announce_t *>(announce_payload.data());
  announce->phase = ESPNOW_FILE_PHASE_ANNOUNCE;
  announce->file_size = 884;
  announce->chunk_size = 221;
  announce->action = ESPNOW_FILE_ACTION_OTA_FLASH;

  expect(rig.receiver.handle_file_transfer(announce_payload.data(), announce_payload.size()), "announce accepted");

  expect(rig.acks.size() == 1, "accept sent");

  test::advance_mock_time_ms(ESPNOW_FILE_ANNOUNCE_TIMEOUT_MS + 1);
  rig.receiver.loop();

  expect(rig.acks.size() == 2, "abort sent after announce timeout");
  AckRecord abort_ack = rig.last_ack();
  expect(abort_ack.header.result == ESPNOW_FILE_ACK_ABORT, "result is ABORT");
  expect(abort_ack.trailing[0] == ESPNOW_FILE_ABORT_TIMEOUT, "reason is TIMEOUT");
}

}  // namespace

int main() {
  test_announce_accept_with_buffer_kb();
  test_blast_then_increment_complete();
  test_gaps_retransmit_then_complete();
  test_blast_wrong_increment_index_ignored();
  test_last_increment_end_flow();
  test_flash_write_failure_retry_abort();
  test_radio_silence_abort();
  test_duplicate_chunk_ignored();
  test_disabled_ota_reject();
  test_file_size_over_1gb_rejected();
  test_announce_timeout();

  if (g_failures != 0) {
    std::cerr << g_failures << " file_receiver test(s) failed\n";
    return 1;
  }

  std::cout << "file_receiver tests passed\n";
  return 0;
}
