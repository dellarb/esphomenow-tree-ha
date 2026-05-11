#include "../components/esp_tree_common/espnow_types.h"

#include <atomic>
#include <cstring>
#include <iostream>
#include <map>
#include <mutex>
#include <random>
#include <string>
#include <thread>
#include <vector>

using namespace esphome::esp_tree;

static int failures = 0;

static void expect(bool cond, const char* msg) {
  if (!cond) {
    std::cerr << "FAIL: " << msg << '\n';
    failures++;
  }
}

struct FragAssembly {
  uint8_t entity_index{0};
  uint8_t fragment_count{0};
  uint32_t message_tx_base{0};
  uint32_t first_seen_ms{0};
  uint32_t last_seen_ms{0};
  size_t bytes_received{0};
  std::vector<uint8_t> data;
  bool active{false};
};

struct EntityData {
  uint8_t entity_index{0};
  uint8_t entity_type{0};
  uint8_t writer_id{0};
};

struct SessionState {
  std::map<uint8_t, FragAssembly> pending_schema_assemblies;
  std::vector<EntityData> schema_entities;
  int8_t last_rssi{-127};
  uint8_t total_entities{0};
};

static const uint8_t FRAG_COUNT = 4;
static const uint8_t FRAG_SIZE = 20;
static const uint8_t REMOTE_COUNT = 8;

static std::string make_remote_key(int remote_id) {
  return "remote_" + std::to_string(remote_id);
}

static void simulate_handle_schema_push_unprotected(
    SessionState& session,
    int remote_id,
    uint8_t entity_index,
    uint8_t fragment_index,
    uint8_t fragment_count,
    const uint8_t* frag_data,
    size_t frag_len) {

  std::string key = make_remote_key(remote_id);

  auto& assembly = session.pending_schema_assemblies[entity_index];

  if (!assembly.active) {
    assembly.active = true;
    assembly.entity_index = entity_index;
    assembly.fragment_count = fragment_count;
    assembly.message_tx_base = 0;
    assembly.first_seen_ms = remote_id * 1000;
    assembly.data.clear();
    assembly.bytes_received = 0;
  }

  assembly.last_seen_ms = remote_id * 1000 + fragment_index;

  assembly.data.insert(assembly.data.end(), frag_data, frag_data + frag_len);
  assembly.bytes_received += frag_len;

  if (fragment_index == fragment_count - 1) {
    session.schema_entities.resize(entity_index + 1);

    session.schema_entities[entity_index].entity_index = entity_index;
    session.schema_entities[entity_index].entity_type = entity_index;

    assembly.active = false;
  }
}

static void test_fragment_interleaving_unprotected() {
  std::cout << "  fragment_interleaving: " << (int)REMOTE_COUNT << " remotes, "
            << (int)FRAG_COUNT << " frags each (UNPROTECTED)\n";

  SessionState session;
  std::atomic<bool> start{false};
  std::atomic<int> completed{0};

  auto remote_func = [&](int remote_id) {
    while (!start.load()) { std::this_thread::yield(); }

    for (uint8_t f = 0; f < FRAG_COUNT; f++) {
      std::vector<uint8_t> frag_data(FRAG_SIZE);
      for (size_t i = 0; i < FRAG_SIZE; i++) {
        frag_data[i] = static_cast<uint8_t>((remote_id * 17 + f * 13 + i) & 0xFF);
      }

      simulate_handle_schema_push_unprotected(
          session, remote_id, 0, f, FRAG_COUNT, frag_data.data(), frag_data.size());

      std::this_thread::yield();
    }

    completed.fetch_add(1);
  };

  std::vector<std::thread> threads;
  for (int i = 0; i < REMOTE_COUNT; i++) {
    threads.emplace_back(remote_func, i);
  }

  start.store(true);
  for (auto& t : threads) { t.join(); }

  std::cout << "    completed=" << completed.load()
            << " schema_entities.size=" << session.schema_entities.size()
            << " pending_assemblies=" << session.pending_schema_assemblies.size() << "\n";

  expect(completed.load() == REMOTE_COUNT, "all remotes completed");
}

static void test_fragment_interleaving_with_mutex() {
  std::cout << "  fragment_interleaving_mutex: " << (int)REMOTE_COUNT << " remotes, "
            << (int)FRAG_COUNT << " frags each (MUTEX PROTECTED)\n";

  SessionState session;
  std::mutex session_mutex;
  std::atomic<bool> start{false};
  std::atomic<int> completed{0};

  auto remote_func = [&](int remote_id) {
    while (!start.load()) { std::this_thread::yield(); }

    for (uint8_t f = 0; f < FRAG_COUNT; f++) {
      std::vector<uint8_t> frag_data(FRAG_SIZE);
      for (size_t i = 0; i < FRAG_SIZE; i++) {
        frag_data[i] = static_cast<uint8_t>((remote_id * 17 + f * 13 + i) & 0xFF);
      }

      std::lock_guard<std::mutex> lock(session_mutex);
      simulate_handle_schema_push_unprotected(
          session, remote_id, 0, f, FRAG_COUNT, frag_data.data(), frag_data.size());

      std::this_thread::yield();
    }

    completed.fetch_add(1);
  };

  std::vector<std::thread> threads;
  for (int i = 0; i < REMOTE_COUNT; i++) {
    threads.emplace_back(remote_func, i);
  }

  start.store(true);
  for (auto& t : threads) { t.join(); }

  std::cout << "    completed=" << completed.load()
            << " schema_entities.size=" << session.schema_entities.size()
            << " pending_assemblies=" << session.pending_schema_assemblies.size() << "\n";

  expect(completed.load() == REMOTE_COUNT, "all remotes completed");
}

static void test_assembly_map_vs_vector_race() {
  std::cout << "  assembly_map_vs_vector: demonstrates map/vector race condition\n";

  struct AssemblyState {
    std::map<uint8_t, FragAssembly> assemblies;
    std::vector<EntityData> entities;
  };

  AssemblyState state;
  std::atomic<bool> start{false};
  std::atomic<int> corruption_count{0};

  auto writer_func = [&](int writer_id) {
    while (!start.load()) { std::this_thread::yield(); }

    for (int i = 0; i < 500; i++) {
      uint8_t entity_idx = static_cast<uint8_t>(writer_id % 4);

      auto& asmbl = state.assemblies[entity_idx];
      if (!asmbl.active) {
        asmbl.active = true;
        asmbl.entity_index = entity_idx;
        asmbl.data.resize(10);
        for (int j = 0; j < 10; j++) {
          asmbl.data[j] = static_cast<uint8_t>(writer_id + j);
        }
      }

      state.entities.resize(entity_idx + 1);
      state.entities[entity_idx].entity_index = entity_idx;
      state.entities[entity_idx].entity_type = static_cast<uint8_t>(writer_id);

      if (i % 50 == 0) {
        if (state.entities.size() > entity_idx) {
          auto& e = state.entities[entity_idx];
          if (e.entity_type != writer_id) {
            corruption_count.fetch_add(1);
          }
        }
      }
    }
  };

  std::vector<std::thread> threads;
  for (int i = 0; i < 4; i++) {
    threads.emplace_back(writer_func, i);
  }

  start.store(true);
  for (auto& t : threads) { t.join(); }

  std::cout << "    corruption_count=" << corruption_count.load() << "\n";
}

int main() {
  std::cout << "\n[B6] Fragment assembly interleaving tests:\n";

  test_fragment_interleaving_unprotected();
  test_fragment_interleaving_with_mutex();
  test_assembly_map_vs_vector_race();

  std::cout << "  fragment_interleaving tests completed\n";

  return failures == 0 ? 0 : 1;
}