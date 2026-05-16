#include "../components/esp_tree_bridge/bridge_api_proto_messages.h"

#include <cstring>
#include <iostream>
#include <string>
#include <vector>

using namespace esphome::esp_tree::bridge_api::runtime_pb;

static int failures = 0;

static void expect(bool cond, const char *msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

static void test_auth_response_round_trip() {
  std::vector<uint8_t> frame;
  uint8_t nonce[16]{};
  uint8_t digest[32]{};
  for (size_t i = 0; i < sizeof(nonce); ++i) nonce[i] = static_cast<uint8_t>(i);
  for (size_t i = 0; i < sizeof(digest); ++i) digest[i] = static_cast<uint8_t>(32 - i);

  envelope(frame, "auth-1", AUTH_RESPONSE, [&](Writer &w) {
    w.string(1, "ha_integration");
    w.string(2, "test");
    w.bytes(3, nonce, sizeof(nonce));
    w.bytes(4, digest, sizeof(digest));
  });

  ParsedEnvelope env;
  expect(parse_envelope(frame.data(), frame.size(), env), "envelope parsed");
  expect(env.request_id == "auth-1", "request id parsed");
  expect(env.api_version == kRuntimeApiVersion, "api version parsed");
  expect(env.msg_field == AUTH_RESPONSE, "auth response selected");

  ParsedAuthResponse auth;
  expect(parse_auth_response(env.msg_data, env.msg_len, auth), "auth parsed");
  expect(auth.client_kind == "ha_integration", "client kind parsed");
  expect(auth.client_nonce.size() == sizeof(nonce), "client nonce length");
  expect(auth.hmac_sha256.size() == sizeof(digest), "hmac length");
  expect(memcmp(auth.hmac_sha256.data(), digest, sizeof(digest)) == 0, "hmac bytes");
}

static void test_command_request_round_trip() {
  std::vector<uint8_t> frame;
  envelope(frame, "cmd-1", COMMAND_REQUEST, [&](Writer &w) {
    w.string(1, "AA:BB:CC:DD:EE:FF");
    w.string(2, "relay");
    w.string(3, "set_value");
    w.message(4, [](Writer &arg) {
      arg.string(1, "value");
      arg.string(13, "ON");
    });
  });

  ParsedEnvelope env;
  ParsedCommandRequest cmd;
  expect(parse_envelope(frame.data(), frame.size(), env), "command envelope parsed");
  expect(parse_command_request(env.msg_data, env.msg_len, cmd), "command parsed");
  expect(cmd.remote_mac == "AA:BB:CC:DD:EE:FF", "remote mac parsed");
  expect(cmd.object_id == "relay", "object id parsed");
  expect(cmd.args.size() == 1 && cmd.args[0].value == "ON", "argument parsed");
}

static void test_ota_start_request_round_trip() {
  std::vector<uint8_t> frame;
  envelope(frame, "ota-start-1", OTA_START_REQUEST, [&](Writer &w) {
    w.string(1, "AA:BB:CC:DD:EE:FF");
    w.varint(2, 4097);
    w.string(3, "00112233445566778899aabbccddeeff");
    w.string(4, "sha256-unused");
    w.string(5, "firmware.ota.bin");
    w.varint(6, 1024);
  });

  ParsedEnvelope env;
  ParsedOtaStartRequest req;
  expect(parse_envelope(frame.data(), frame.size(), env), "ota start envelope parsed");
  expect(env.msg_field == OTA_START_REQUEST, "ota start selected");
  expect(parse_ota_start_request(env.msg_data, env.msg_len, req), "ota start parsed");
  expect(req.target_mac == "AA:BB:CC:DD:EE:FF", "ota target parsed");
  expect(req.file_size == 4097, "ota file size parsed");
  expect(req.md5 == "00112233445566778899aabbccddeeff", "ota md5 parsed");
  expect(req.sha256 == "sha256-unused", "ota sha256 parsed");
  expect(req.filename == "firmware.ota.bin", "ota filename parsed");
  expect(req.preferred_chunk_size == 1024, "ota preferred chunk size parsed");
}

static void test_state_receipt_round_trip() {
  std::vector<uint8_t> frame;
  envelope(frame, "state-receipt-1", STATE_RECEIPT, [&](Writer &w) {
    w.string(1, "AA:BB:CC:DD:EE:FF");
    w.string(2, "11:22:33:44:55:66");
    w.string(3, "session-1");
    w.varint(4, 42);
    w.varint(5, 7);
  });

  ParsedEnvelope env;
  ParsedStateReceipt receipt;
  expect(parse_envelope(frame.data(), frame.size(), env), "state receipt envelope parsed");
  expect(env.msg_field == STATE_RECEIPT, "state receipt selected");
  expect(parse_state_receipt(env.msg_data, env.msg_len, receipt), "state receipt parsed");
  expect(receipt.remote_mac == "AA:BB:CC:DD:EE:FF", "state receipt remote mac parsed");
  expect(receipt.bridge_mac == "11:22:33:44:55:66", "state receipt bridge mac parsed");
  expect(receipt.session_id == "session-1", "state receipt session parsed");
  expect(receipt.state_tx_counter == 42, "state receipt tx parsed");
  expect(receipt.entity_index == 7, "state receipt entity index parsed");
}

static void test_ota_chunk_batch_round_trip() {
  std::vector<uint8_t> frame;
  const uint8_t payload_a[] = {0x01, 0x02, 0x03};
  const uint8_t payload_b[] = {0x04, 0x05};
  envelope(frame, "ota-batch-1", OTA_CHUNK_BATCH, [&](Writer &w) {
    w.string(1, "b7f1");
    w.string(2, "chunk-42");
    w.message(3, [&](Writer &chunk) {
      chunk.varint(1, 7);
      chunk.varint(2, 14336);
      chunk.bytes(3, payload_a, sizeof(payload_a));
      chunk.varint(4, 0);
      chunk.varint(5, 0x55aa);
    });
    w.message(3, [&](Writer &chunk) {
      chunk.varint(1, 8);
      chunk.varint(2, 16384);
      chunk.bytes(3, payload_b, sizeof(payload_b));
      chunk.varint(4, 1);
      chunk.varint(5, 0xaa55);
    });
  });

  ParsedEnvelope env;
  ParsedOtaChunkBatch batch;
  expect(parse_envelope(frame.data(), frame.size(), env), "ota batch envelope parsed");
  expect(env.msg_field == OTA_CHUNK_BATCH, "ota chunk batch selected");
  expect(parse_ota_chunk_batch(env.msg_data, env.msg_len, batch), "ota chunk batch parsed");
  expect(batch.job_id == "b7f1", "ota batch job id parsed");
  expect(batch.response_request_id == "chunk-42", "ota batch request id parsed");
  expect(batch.chunks.size() == 2, "ota batch chunk count parsed");
  expect(batch.chunks[0].sequence == 7 && batch.chunks[0].offset == 14336, "first chunk metadata parsed");
  expect(batch.chunks[0].payload_len == sizeof(payload_a), "first chunk payload parsed");
  expect(memcmp(batch.chunks[0].payload, payload_a, sizeof(payload_a)) == 0, "first chunk payload bytes");
  expect(batch.chunks[1].flags == 1 && batch.chunks[1].crc32 == 0xaa55, "second chunk flags/crc parsed");
}

static void test_ota_outgoing_encoders_parse_as_envelopes() {
  std::vector<uint8_t> frame;
  encode_ota_accepted(frame, "req-accept", "b7f1", "AA:BB:CC:DD:EE:FF", 2048, 3, 6);
  ParsedEnvelope env;
  expect(parse_envelope(frame.data(), frame.size(), env), "ota accepted envelope parsed");
  expect(env.request_id == "req-accept", "ota accepted request id echoed");
  expect(env.msg_field == OTA_ACCEPTED, "ota accepted field");

  encode_ota_status(frame, "", "b7f1", OTA_STATE_TRANSFERRING, 42, 2048, 4096, "");
  expect(parse_envelope(frame.data(), frame.size(), env), "ota status envelope parsed");
  expect(env.msg_field == OTA_STATUS, "ota status field");

  std::vector<uint32_t> sequences{0, 1, 2};
  encode_ota_chunk_request(frame, "", "b7f1", "chunk-1", sequences, 1, 0, 0, 2, 0, 8, 50);
  expect(parse_envelope(frame.data(), frame.size(), env), "ota chunk request envelope parsed");
  expect(env.msg_field == OTA_CHUNK_REQUEST, "ota chunk request field");
}

int main() {
  test_auth_response_round_trip();
  test_command_request_round_trip();
  test_state_receipt_round_trip();
  test_ota_start_request_round_trip();
  test_ota_chunk_batch_round_trip();
  test_ota_outgoing_encoders_parse_as_envelopes();
  if (failures != 0) {
    std::cerr << failures << " failure(s)\n";
    return 1;
  }
  return 0;
}
