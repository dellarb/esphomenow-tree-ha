#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ESPNOW_LR_PROTOCOL_VER is THIS APPLICATION's protocol version (frame format, key derivation,
// session management, packet types, etc.). It is NOT the ESP-NOW protocol version defined in the
// ESP IDF esp_now.h documentation. Our protocol version happens to share the same numeric space
// (e.g. v3) but is an entirely independent version number for our application-layer protocol.
#define ESPNOW_LR_PROTOCOL_VER 3
#define ESPNOW_LR_HEADER_CORE_LEN 12
#define ESPNOW_LR_HEADER_WITH_PSK_TAG_LEN 17
#define ESPNOW_LR_PSK_TAG_LEN 4
#define ESPNOW_LR_SESSION_TAG_LEN 8
#define ESPNOW_LR_V1_MAX_PAYLOAD  250
#define ESPNOW_LR_V2_MAX_PAYLOAD  1470
#define ESPNOW_LR_SESSION_FLAG_V2_MTU  0x01
#define ESPNOW_LR_V1_ENCRYPTED_PLAINTEXT (ESPNOW_LR_V1_MAX_PAYLOAD - ESPNOW_LR_HEADER_WITH_PSK_TAG_LEN - ESPNOW_LR_SESSION_TAG_LEN)
#define ESPNOW_LR_ENTITY_PACKET_HEADER_LEN 5
#define ESPNOW_LR_MAX_ENTITY_FRAGMENT_LEN (ESPNOW_LR_V1_ENCRYPTED_PLAINTEXT - ESPNOW_LR_ENTITY_PACKET_HEADER_LEN)
#define ESPNOW_LR_ENTITY_FLAG_MORE_FRAGMENTS 0x01
#define ESPNOW_LR_ENTITY_FLAG_MORE_DIRTY 0x02
#define ESPNOW_LR_NODE_ID_LEN 32
#define ESPNOW_LR_NODE_LABEL_LEN 64
#define ESPNOW_LR_PROJECT_NAME_LEN 32
#define ESPNOW_LR_PROJECT_VERSION_LEN 16
#define ESPNOW_LR_SCHEMA_OPTIONS_LEN 145
#define ESPNOW_LR_ENTITY_ID_LEN 32
#define ESPNOW_LR_SCHEMA_HASH_LEN 222
#define ESPNOW_LR_FRAGMENT_ASSEMBLY_TIMEOUT_MS 5000U
#define ESPNOW_LR_MAX_FRAGMENT_ASSEMBLY_BYTES 1024U
#define ESPNOW_LR_MAX_TOTAL_FRAGMENT_BYTES_PER_SESSION 4096U
#define ESPNOW_LR_MAX_PENDING_FRAGMENT_ASSEMBLIES 8U
#define ESPNOW_LR_MAX_HOPS_DEFAULT 4
#define ESPNOW_LR_DISCOVER_TIMEOUT_MS 300000U  // 5 minutes

/* hop_count byte encoding (ESPNOW_LR_PROTOCOL_VER >= 3):
 *
 *   bit 7   : direction flag — 0 = upstream (leaf->bridge)
 *                              1 = downstream (bridge->leaf)
 *   bit 6   : V2_MTU path flag — 1 = V2-capable path, 0 = V1 path
 *   bits 5-4: reserved (send as 0)
 *   bits 3-0: hop count value (0..15; hard protocol limit = ESPNOW_LR_HOPS_LIMIT)
 *
 * The originating sender sets the direction and V2_MTU bits. Relays preserve
 * the direction bit and the V2_MTU bit (if V2-capable). V1 relays naturally
 * strip the V2_MTU bit because they only preserve direction when reconstructing
 * hop_count. The V2_MTU bit is observed on every received frame to maintain
 * per-path MTU: upgrade immediately on V2_MTU=1, downgrade immediately on V2_MTU=0.
 *
 * All nodes on a network must run protocol v3+. Mixed v2/v3 networks
 * are not supported.
 */
#define ESPNOW_LR_HOPS_DIR_BIT      0x80u
#define ESPNOW_LR_HOPS_V2_MTU_BIT   0x40u
#define ESPNOW_LR_HOPS_COUNT_MASK   0x0Fu
#define ESPNOW_LR_HOPS_LIMIT        8
#define ESPNOW_HOPS_DIR_UP          0u
#define ESPNOW_HOPS_DIR_DOWN        ESPNOW_LR_HOPS_DIR_BIT
#define ESPNOW_HOPS_IS_UPSTREAM(h)    (((h) & ESPNOW_LR_HOPS_DIR_BIT) == 0u)
#define ESPNOW_HOPS_IS_DOWNSTREAM(h)  (((h) & ESPNOW_LR_HOPS_DIR_BIT) != 0u)
#define ESPNOW_HOPS_MAKE(dir, count) \
    ((uint8_t)(((dir) & ESPNOW_LR_HOPS_DIR_BIT) | ((count) & ESPNOW_LR_HOPS_COUNT_MASK)))
#define ESPNOW_HOPS_COUNT(h)          ((uint8_t)((h) & ESPNOW_LR_HOPS_COUNT_MASK))
#define ESPNOW_LR_ROUTE_TTL_DEFAULT_SECONDS 172800U
#define ESPNOW_LR_DISCOVER_ROUTE_TTL_MS 5000U
#define ESPNOW_LR_HEARTBEAT_INTERVAL_S 60
#define ESPNOW_LR_MQTT_CONFIRM_TIMEOUT_MS 2000
#define ESPNOW_LR_DISCOVER_BACKOFF_START_MS 500
#define ESPNOW_LR_DISCOVER_BACKOFF_2_MS 1000
#define ESPNOW_LR_DISCOVER_BACKOFF_3_MS 2000
#define ESPNOW_LR_DISCOVER_BACKOFF_4_MS 4000
#define ESPNOW_LR_DISCOVER_BACKOFF_CAP_MS 6000
#define ESPNOW_LR_DISCOVER_COLLECTION_WINDOW_MS 200
#define ESPNOW_LR_WIFI_DISCOVER_WAIT_MS 15000U
#define ESPNOW_LR_MAX_RETRIES 4
#define ESPNOW_LR_RETRY_INTERVAL_MS 200
#define ESPNOW_LR_RETRY_JITTER_MS 50
#define ESPNOW_LR_WAIT_REJECT_DELAY_MS 10000
#define ESPNOW_LR_ACK_TIMEOUT_MS 300
#define ESPNOW_LR_DISCOVER_ANNOUNCE_JITTER_MS 20
#define ESPNOW_LR_MAX_PENDING_DISCOVER 8
#define ESPNOW_LR_HEARTBEAT_WAIT_AFTER_COMPLETE_MS 200U
#define ESPNOW_LR_JOINED_TO_NORMAL_TIMEOUT_MS 30000U
#define ESPNOW_LR_STATE_SYNC_TIMEOUT_MS 30000U

typedef enum {
    FIELD_TYPE_SENSOR = 0x01,
    FIELD_TYPE_SWITCH = 0x02,
    FIELD_TYPE_BINARY = 0x03,
    FIELD_TYPE_BUTTON = 0x04,
    FIELD_TYPE_NUMBER = 0x05,
    FIELD_TYPE_TEXT = 0x06,
    FIELD_TYPE_CLIMATE = 0x07,
    FIELD_TYPE_COVER = 0x08,
    FIELD_TYPE_LIGHT = 0x09,
    FIELD_TYPE_FAN = 0x0A,
    FIELD_TYPE_LOCK = 0x0B,
    FIELD_TYPE_ALARM = 0x0C,
    FIELD_TYPE_SELECT = 0x0D,
    FIELD_TYPE_EVENT = 0x0E,
    FIELD_TYPE_HUMIDIFIER = 0x0F,
    FIELD_TYPE_DEHUMIDIFIER = 0x10,
    FIELD_TYPE_VALVE = 0x11,
    FIELD_TYPE_TIME = 0x12,
    FIELD_TYPE_DATETIME = 0x13,
    FIELD_TYPE_TEXT_SENSOR = 0x14,
} espnow_field_type_t;

typedef enum {
    PKT_DISCOVER = 0x00,
    PKT_DISCOVER_ANNOUNCE = 0x01,
    PKT_JOIN = 0x02,
    PKT_JOIN_ACK = 0x03,
    PKT_STATE = 0x04,
    PKT_ACK = 0x05,
    PKT_COMMAND = 0x06,
    PKT_SCHEMA_REQUEST = 0x08,
    PKT_SCHEMA_PUSH = 0x09,
    PKT_HEARTBEAT = 0x10,
    PKT_DEAUTH = 0x11,
    PKT_FILE_TRANSFER = 0x12,
    PKT_FILE_DATA = 0x13,
} espnow_packet_type_t;

static inline const char *packet_type_name(espnow_packet_type_t type) {
    switch (type) {
        case PKT_DISCOVER: return "DISCOVER";
        case PKT_DISCOVER_ANNOUNCE: return "DISCOVER_ANNOUNCE";
        case PKT_JOIN: return "JOIN";
        case PKT_JOIN_ACK: return "JOIN_ACK";
        case PKT_STATE: return "STATE";
        case PKT_ACK: return "ACK";
        case PKT_COMMAND: return "COMMAND";
        case PKT_SCHEMA_REQUEST: return "SCHEMA_REQUEST";
        case PKT_SCHEMA_PUSH: return "SCHEMA_PUSH";
        case PKT_HEARTBEAT: return "HEARTBEAT";
        case PKT_DEAUTH: return "DEAUTH";
        case PKT_FILE_TRANSFER: return "FILE_TRANSFER";
        case PKT_FILE_DATA: return "FILE_DATA";
        default: return "UNKNOWN";
    }
}

static inline bool is_encrypted_packet(espnow_packet_type_t type) {
  switch (type) {
    case PKT_STATE:
    case PKT_ACK:
    case PKT_COMMAND:
    case PKT_SCHEMA_REQUEST:
    case PKT_SCHEMA_PUSH:
    case PKT_HEARTBEAT:
    case PKT_FILE_TRANSFER:
    case PKT_FILE_DATA:
      return true;
    default:
      return false;
  }
}

static inline bool is_valid_packet_type(uint8_t type) {
  switch (static_cast<espnow_packet_type_t>(type)) {
    case PKT_DISCOVER:
    case PKT_DISCOVER_ANNOUNCE:
    case PKT_JOIN:
    case PKT_JOIN_ACK:
    case PKT_STATE:
    case PKT_ACK:
    case PKT_COMMAND:
    case PKT_SCHEMA_REQUEST:
    case PKT_SCHEMA_PUSH:
    case PKT_HEARTBEAT:
    case PKT_DEAUTH:
    case PKT_FILE_TRANSFER:
    case PKT_FILE_DATA:
      return true;
    default:
      return false;
  }
}

#define ESPNOW_LR_FILE_ACTION_STORE 0x00
#define ESPNOW_LR_FILE_ACTION_OTA_FLASH 0x01
#define ESPNOW_LR_FILE_ACTION_EXECUTE 0x02
#define ESPNOW_LR_FILE_ACTION_DISPLAY 0x03

#define ESPNOW_LR_FILE_PHASE_ANNOUNCE 0x00
#define ESPNOW_LR_FILE_PHASE_END 0x01
#define ESPNOW_LR_FILE_PHASE_ABORT 0x02

#define ESPNOW_LR_FILE_ACK_ACCEPT 0x00
#define ESPNOW_LR_FILE_ACK_REJECT 0x01
#define ESPNOW_LR_FILE_ACK_PROGRESS 0x02
#define ESPNOW_LR_FILE_ACK_COMPLETE 0x03
#define ESPNOW_LR_FILE_ACK_ABORT 0x04

#define ESPNOW_LR_FILE_REJECT_BUSY 0x01
#define ESPNOW_LR_FILE_REJECT_NO_SPACE 0x02
#define ESPNOW_LR_FILE_REJECT_UNSUPPORTED 0x03
#define ESPNOW_LR_FILE_REJECT_ALREADY 0x04
#define ESPNOW_LR_FILE_REJECT_DEEP_SLEEP 0x05
#define ESPNOW_LR_FILE_REJECT_CHIP_MISMATCH 0x06

#define ESPNOW_LR_FILE_COMPLETE_SUCCESS 0x00
#define ESPNOW_LR_FILE_COMPLETE_MD5_MISMATCH 0x01
#define ESPNOW_LR_FILE_COMPLETE_FLASH_ERROR 0x02
#define ESPNOW_LR_FILE_COMPLETE_WRITE_ERROR 0x03
#define ESPNOW_LR_FILE_COMPLETE_ABORTED 0x04

#define ESPNOW_LR_FILE_ABORT_USER 0x00
#define ESPNOW_LR_FILE_ABORT_TIMEOUT 0x01
#define ESPNOW_LR_FILE_ABORT_SESSION_LOST 0x02
#define ESPNOW_LR_FILE_ABORT_SEND_FAILURE 0x03
#define ESPNOW_LR_FILE_ABORT_FLASH_ERROR 0x04

#define ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE ESPNOW_LR_V1_MAX_PAYLOAD
#define ESPNOW_LR_FILE_DATA_HEADER_OVERHEAD \
  (ESPNOW_LR_HEADER_WITH_PSK_TAG_LEN + sizeof(espnow_file_data_header_t) + ESPNOW_LR_SESSION_TAG_LEN)
#define ESPNOW_LR_FILE_DEFAULT_WINDOW_SIZE 32
#define ESPNOW_LR_FILE_ACK_INTERVAL 4
#define ESPNOW_LR_FILE_ANNOUNCE_TIMEOUT_MS 5000
#define ESPNOW_LR_FILE_ACK_TIMEOUT_MS 3000
#define ESPNOW_LR_FILE_MAX_RETRIES 3

#pragma pack(push, 1)

typedef struct {
    uint8_t protocol_version;
    uint8_t hop_count;   /* bit7=dir, bit6=V2_MTU, bits5-4=reserved, bits3-0=hop_count(0..15, limit 8) */
    uint8_t packet_type;
    uint8_t leaf_mac[6];
    uint32_t tx_counter;
    uint8_t psk_tag[ESPNOW_LR_PSK_TAG_LEN];
} espnow_frame_header_t;
static_assert(sizeof(espnow_frame_header_t) == 17, "espnow_frame_header_t must be 17 bytes");

typedef struct {
    uint8_t network_id[32];
    uint8_t network_id_len;
    uint8_t capability_flags;
} espnow_discover_t;
static_assert(sizeof(espnow_discover_t) == 34, "espnow_discover_t must be 34 bytes");

typedef struct {
    uint8_t network_id[32];
    uint8_t network_id_len;
    uint8_t responder_mac[6];
    uint8_t responder_role;
    uint8_t hops_to_bridge;
    uint8_t bridge_reachable;
    uint8_t flags;
} espnow_discover_announce_t;
static_assert(sizeof(espnow_discover_announce_t) == 43, "espnow_discover_announce_t must be 43 bytes");

typedef struct {
    uint8_t remote_nonce[16];
    uint8_t schema_hash[32];
    uint8_t hops_to_bridge;
    uint8_t dirty_count;
    uint8_t session_flags;
} espnow_join_t;
static_assert(sizeof(espnow_join_t) == 51, "espnow_join_t must be 51 bytes");

typedef struct {
    uint8_t accepted;
    uint8_t reason;
    uint8_t stage;
    uint8_t bridge_nonce[16];
    uint8_t session_flags;
} espnow_join_ack_t;
static_assert(sizeof(espnow_join_ack_t) == 20, "espnow_join_ack_t must be 20 bytes");

#define ESPNOW_LR_JOIN_STATUS_SCHEMA_REFRESH 1
#define ESPNOW_LR_JOIN_STATUS_SEND_STATE 2
#define ESPNOW_LR_JOIN_STATUS_COMPLETE 100
#define ESPNOW_LR_JOIN_REASON_WAIT 3

typedef struct {
    uint32_t uptime_seconds;
    uint32_t expected_contact_interval_seconds;
    uint8_t parent_mac[6];
    uint8_t hops_to_bridge;
    uint8_t direct_child_count;
    uint16_t total_child_count;
} espnow_heartbeat_t;
static_assert(sizeof(espnow_heartbeat_t) == 18, "espnow_heartbeat_t must be 18 bytes");

typedef struct {
    uint8_t entity_index;
    uint8_t flags;
    uint8_t fragment_index;
    uint8_t fragment_count;
    uint8_t value_len;
} espnow_entity_packet_header_t;
static_assert(sizeof(espnow_entity_packet_header_t) == ESPNOW_LR_ENTITY_PACKET_HEADER_LEN, "espnow_entity_packet_header_t must be 5 bytes");

#define ACK_STATE 0x04
#define ACK_COMMAND 0x06

typedef struct {
    uint8_t ack_type;
    uint8_t result;
    uint32_t ref_tx_counter;
} espnow_ack_t;
static_assert(sizeof(espnow_ack_t) == 6, "espnow_ack_t must be 6 bytes");

/* Legacy ACK structs — kept for test compatibility until Phase 4 migration */
typedef struct {
    uint32_t rx_counter;
    uint8_t result;
} espnow_state_ack_t;
static_assert(sizeof(espnow_state_ack_t) == 5, "espnow_state_ack_t must be 5 bytes");

typedef struct {
    uint8_t field_index;
    uint8_t result;
} espnow_command_ack_t;
static_assert(sizeof(espnow_command_ack_t) == 2, "espnow_command_ack_t must be 2 bytes");

typedef struct {
    uint8_t descriptor_type;
    uint8_t descriptor_index;
} espnow_schema_request_t;
static_assert(sizeof(espnow_schema_request_t) == 2, "espnow_schema_request_t must be 2 bytes");

typedef struct {
    uint8_t descriptor_type;
    uint8_t descriptor_index;
    uint8_t entity_index;
    uint8_t total_entities;
    uint8_t entity_type;
    uint8_t entity_name[32];
    uint8_t entity_unit[8];
    uint8_t entity_id[ESPNOW_LR_ENTITY_ID_LEN];
} espnow_schema_push_t;
static_assert(sizeof(espnow_schema_push_t) == 77, "espnow_schema_push_t must be 77 bytes");

typedef struct {
    uint8_t esphome_name[ESPNOW_LR_NODE_ID_LEN];
    uint8_t node_label[ESPNOW_LR_NODE_LABEL_LEN];
    uint32_t firmware_epoch;
    uint8_t project_name[ESPNOW_LR_PROJECT_NAME_LEN];
    uint8_t project_version[ESPNOW_LR_PROJECT_VERSION_LEN];
    uint8_t total_entities;
    uint16_t max_frame_payload;
    uint32_t chip_model;
    uint8_t build_date[16];
    uint8_t build_time[16];
} espnow_identity_descriptor_t;
static_assert(sizeof(espnow_identity_descriptor_t) == 187, "espnow_identity_descriptor_t must be 187 bytes");

typedef struct {
    uint8_t descriptor_type;
    uint8_t descriptor_index;
    espnow_identity_descriptor_t identity;
} espnow_identity_push_t;
static_assert(sizeof(espnow_identity_push_t) == 189, "espnow_identity_push_t must be 189 bytes");

typedef struct {
    uint8_t phase;
    uint32_t file_size;
    uint8_t md5[16];
    uint16_t chunk_size;
    uint8_t window_size;
    uint8_t action;
    uint8_t file_id[12];
} espnow_file_announce_t;
static_assert(sizeof(espnow_file_announce_t) == 37, "espnow_file_announce_t must be 37 bytes");

typedef struct {
    uint8_t phase;
} espnow_file_end_t;
static_assert(sizeof(espnow_file_end_t) == 1, "espnow_file_end_t must be 1 byte");

typedef struct {
    uint8_t phase;
    uint8_t reason;
} espnow_file_abort_t;
static_assert(sizeof(espnow_file_abort_t) == 2, "espnow_file_abort_t must be 2 bytes");

typedef struct {
    uint32_t sequence;
    uint32_t offset;
} espnow_file_data_header_t;
static_assert(sizeof(espnow_file_data_header_t) == 8, "espnow_file_data_header_t must be 8 bytes");

#define ESPNOW_LR_FILE_DEFAULT_CHUNK_SIZE \
  (ESPNOW_LR_FILE_DATA_MAX_FRAME_SIZE - ESPNOW_LR_FILE_DATA_HEADER_OVERHEAD)

#define ESPNOW_LR_DESCRIPTOR_TYPE_IDENTITY 0
#define ESPNOW_LR_DESCRIPTOR_TYPE_ENTITY 1

#define ESPNOW_LR_NODE_ROLE_BRIDGE 0
#define ESPNOW_LR_NODE_ROLE_RELAY 1

typedef struct {
    uint8_t reason;
    uint8_t response_to_packet_type;
    uint32_t response_to_tx_counter;
    uint8_t request_fingerprint[4];
} espnow_deauth_t;
static_assert(sizeof(espnow_deauth_t) == 10, "espnow_deauth_t must be 10 bytes");

#pragma pack(pop)

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>

namespace esphome {
namespace espnow_lr {

struct EntityPayloadView {
  uint8_t entity_index{0};
  uint8_t flags{0};
  uint8_t fragment_index{0};
  uint8_t fragment_count{0};
  const uint8_t *value{nullptr};
  size_t value_len{0};
};

static inline uint32_t fragment_message_tx_base(const espnow_frame_header_t &header, const EntityPayloadView &view) {
  return header.tx_counter - static_cast<uint32_t>(view.fragment_index);
}

struct espnow_fragment_assembly_t {
  uint8_t entity_index{0};
  uint8_t flags{0};
  uint8_t fragment_count{0};
  uint32_t message_tx_base{0};
  uint32_t first_seen_ms{0};
  uint32_t last_seen_ms{0};
  size_t bytes_received{0};
  std::vector<uint16_t> lengths;
  std::vector<uint8_t> received;
  std::vector<uint8_t> data;
  bool active{false};
};

struct SchemaPushView {
  uint8_t descriptor_type{ESPNOW_LR_DESCRIPTOR_TYPE_ENTITY};
  uint8_t descriptor_index{0};
  uint8_t entity_index{0};
  uint8_t total_entities{0};
  uint8_t entity_type{0};
  const uint8_t *entity_name{nullptr};
  const uint8_t *entity_unit{nullptr};
  const uint8_t *entity_id{nullptr};
  const uint8_t *entity_options{nullptr};
};

struct IdentityDescriptorView {
  const uint8_t *esphome_name{nullptr};
  const uint8_t *node_label{nullptr};
  uint32_t firmware_epoch{0};
  const uint8_t *project_name{nullptr};
  const uint8_t *project_version{nullptr};
  uint8_t total_entities{0};
  uint16_t max_frame_payload{0};
  uint32_t chip_model{0};
  const uint8_t *build_date{nullptr};
  const uint8_t *build_time{nullptr};
};

static inline bool parse_entity_payload(const uint8_t *payload, size_t payload_len, EntityPayloadView &view) {
  if (payload == nullptr || payload_len < sizeof(espnow_entity_packet_header_t)) return false;
  const auto *header = reinterpret_cast<const espnow_entity_packet_header_t *>(payload);
  const size_t derived_value_len = payload_len - sizeof(*header);
  if (header->fragment_count == 0) return false;
  if (header->fragment_index >= header->fragment_count) return false;
  view.entity_index = header->entity_index;
  view.flags = header->flags;
  view.fragment_index = header->fragment_index;
  view.fragment_count = header->fragment_count;
  view.value = payload + sizeof(*header);
  view.value_len = derived_value_len;
  return true;
}

static inline bool counter_is_newer(uint32_t candidate, uint32_t previous) {
  return static_cast<int32_t>(candidate - previous) > 0;
}

static inline void append_entity_payload(std::vector<uint8_t> &payload, uint8_t entity_index, uint8_t flags,
                                         uint8_t fragment_index, uint8_t fragment_count, const uint8_t *value,
                                         size_t value_len) {
  payload.resize(sizeof(espnow_entity_packet_header_t) + value_len);
  auto *header = reinterpret_cast<espnow_entity_packet_header_t *>(payload.data());
  header->entity_index = entity_index;
  header->flags = flags;
  header->fragment_index = fragment_index;
  header->fragment_count = fragment_count == 0 ? 1 : fragment_count;
  header->value_len = static_cast<uint8_t>(value_len);
  if (value_len > 0 && value != nullptr) {
    memcpy(payload.data() + sizeof(*header), value, value_len);
  }
}

static inline size_t schema_push_payload_len() {
  return sizeof(espnow_schema_push_t);
}

static inline bool parse_schema_push_payload(const uint8_t *payload, size_t payload_len, SchemaPushView &view) {
  if (payload == nullptr || payload_len < sizeof(espnow_schema_push_t)) return false;
  const auto *schema = reinterpret_cast<const espnow_schema_push_t *>(payload);
  view.descriptor_type = schema->descriptor_type;
  view.descriptor_index = schema->descriptor_index;
  view.entity_index = schema->entity_index;
  view.total_entities = schema->total_entities;
  view.entity_type = schema->entity_type;
  view.entity_name = schema->entity_name;
  view.entity_unit = schema->entity_unit;
  view.entity_id = schema->entity_id;
  view.entity_options = payload + sizeof(espnow_schema_push_t);
  return true;
}

static inline bool parse_identity_descriptor_payload(const uint8_t *payload, size_t payload_len,
                                                     IdentityDescriptorView &view, uint8_t &descriptor_index) {
  if (payload == nullptr || payload_len < sizeof(espnow_identity_push_t)) return false;
  const auto *identity_push = reinterpret_cast<const espnow_identity_push_t *>(payload);
  if (payload_len != sizeof(*identity_push)) return false;
  if (identity_push->descriptor_type != ESPNOW_LR_DESCRIPTOR_TYPE_IDENTITY) return false;
  descriptor_index = identity_push->descriptor_index;
  view.esphome_name = identity_push->identity.esphome_name;
  view.node_label = identity_push->identity.node_label;
  view.firmware_epoch = identity_push->identity.firmware_epoch;
  view.project_name = identity_push->identity.project_name;
  view.project_version = identity_push->identity.project_version;
  view.total_entities = identity_push->identity.total_entities;
  view.max_frame_payload = identity_push->identity.max_frame_payload;
  view.chip_model = identity_push->identity.chip_model;
  view.build_date = identity_push->identity.build_date;
  view.build_time = identity_push->identity.build_time;
  return true;
}

static inline void append_identity_descriptor_payload(std::vector<uint8_t> &payload,
                                                      const uint8_t *esphome_name, size_t esphome_name_len,
                                                      const uint8_t *node_label, size_t node_label_len,
                                                      uint32_t firmware_epoch,
                                                      const uint8_t *project_name, size_t project_name_len,
                                                      const uint8_t *project_version, size_t project_version_len,
                                                      uint8_t total_entities,
                                                      uint16_t max_frame_payload,
                                                      uint32_t chip_model,
                                                      const uint8_t *build_date, size_t build_date_len,
                                                      const uint8_t *build_time, size_t build_time_len) {
  payload.assign(sizeof(espnow_identity_push_t), 0);
  auto *identity_push = reinterpret_cast<espnow_identity_push_t *>(payload.data());
  identity_push->descriptor_type = ESPNOW_LR_DESCRIPTOR_TYPE_IDENTITY;
  identity_push->descriptor_index = 0;
  if (esphome_name != nullptr && esphome_name_len > 0) {
    memcpy(identity_push->identity.esphome_name, esphome_name, std::min(esphome_name_len, sizeof(identity_push->identity.esphome_name)));
  }
  if (node_label != nullptr && node_label_len > 0) {
    memcpy(identity_push->identity.node_label, node_label,
           std::min(node_label_len, sizeof(identity_push->identity.node_label)));
  }
  identity_push->identity.firmware_epoch = firmware_epoch;
  if (project_name != nullptr && project_name_len > 0) {
    memcpy(identity_push->identity.project_name, project_name,
           std::min(project_name_len, sizeof(identity_push->identity.project_name)));
  }
  if (project_version != nullptr && project_version_len > 0) {
    memcpy(identity_push->identity.project_version, project_version,
           std::min(project_version_len, sizeof(identity_push->identity.project_version)));
  }
  identity_push->identity.total_entities = total_entities;
  identity_push->identity.max_frame_payload = max_frame_payload;
  identity_push->identity.chip_model = chip_model;
  if (build_date != nullptr && build_date_len > 0) {
    memcpy(identity_push->identity.build_date, build_date, std::min(build_date_len, sizeof(identity_push->identity.build_date)));
  }
  if (build_time != nullptr && build_time_len > 0) {
    memcpy(identity_push->identity.build_time, build_time, std::min(build_time_len, sizeof(identity_push->identity.build_time)));
  }
}

static inline void append_schema_push_payload(std::vector<uint8_t> &payload, uint8_t descriptor_type, uint8_t descriptor_index,
                                              uint8_t entity_index, uint8_t total_entities,
                                              uint8_t entity_type, const uint8_t *entity_name, size_t entity_name_len,
                                              const uint8_t *entity_unit, size_t entity_unit_len,
                                              const uint8_t *entity_id, size_t entity_id_len,
                                              const uint8_t *entity_options, size_t entity_options_len) {
  payload.assign(sizeof(espnow_schema_push_t) + entity_options_len, 0);
  auto *schema = reinterpret_cast<espnow_schema_push_t *>(payload.data());
  schema->descriptor_type = descriptor_type;
  schema->descriptor_index = descriptor_index;
  schema->entity_index = entity_index;
  schema->total_entities = total_entities;
  schema->entity_type = entity_type;
  if (entity_name != nullptr && entity_name_len > 0) {
    memcpy(schema->entity_name, entity_name, std::min(entity_name_len, sizeof(schema->entity_name)));
  }
  if (entity_unit != nullptr && entity_unit_len > 0) {
    memcpy(schema->entity_unit, entity_unit, std::min(entity_unit_len, sizeof(schema->entity_unit)));
  }
  if (entity_id != nullptr && entity_id_len > 0) {
    memcpy(schema->entity_id, entity_id, std::min(entity_id_len, sizeof(schema->entity_id)));
  }
  if (entity_options != nullptr && entity_options_len > 0) {
    memcpy(payload.data() + sizeof(espnow_schema_push_t), entity_options, entity_options_len);
  }
}

struct espnow_entity_schema_t {
  uint8_t entity_index{0};
  uint8_t entity_type{0};
  std::string entity_name;
  std::string entity_unit;
  std::string entity_options;
  std::string entity_id;
};

enum class espnow_log_state_t : uint8_t {
  NONE = 0,
  DISCOVERING,
  JOINING,
  JOINED,
  STATE_SYNC,
  NORMAL,
  PROVIDING_RELAY,
};

struct PacketLogEntry {
  bool tx{false};
  espnow_packet_type_t type{PKT_DISCOVER};
  uint8_t mac[6]{};
  uint8_t channel{0};
  uint16_t length{0};
  int8_t rssi{0};
  bool show_channel{false};
  bool show_entity{false};
  uint8_t entity_index{0};
  uint8_t entity_total{0};
  uint8_t chunk_index{0};
  uint8_t chunk_total{0};
  uint32_t rtt_ms{0};
  int8_t allowed{-1};
  uint8_t hops{0};
  uint8_t retry_count{0};
  uint32_t pkt_uid{0};
  bool show_ack_type{false};
  uint8_t ack_type{0};
  bool v2_mtu{false};
  bool v1_downgrade{false};
};

static constexpr size_t PACKET_LOG_SIZE = 32;

static constexpr uint16_t RETRY_BACKOFF_MS[] = {200, 400, 800, 1600};

static inline uint16_t espnow_max_plaintext(uint16_t max_payload) {
    return max_payload - ESPNOW_LR_HEADER_WITH_PSK_TAG_LEN - ESPNOW_LR_SESSION_TAG_LEN;
}

static inline uint16_t espnow_max_entity_fragment(uint16_t max_payload) {
    return espnow_max_plaintext(max_payload) - ESPNOW_LR_ENTITY_PACKET_HEADER_LEN;
}

static inline uint16_t espnow_max_assembly_bytes(uint16_t max_payload) {
    return espnow_max_entity_fragment(max_payload) * 6;
}

static inline uint16_t espnow_max_total_fragment_bytes(uint16_t max_payload) {
    return espnow_max_assembly_bytes(max_payload) * 4;
}

static inline bool espnow_route_v2_capable(uint8_t hop_count) {
    return (hop_count & ESPNOW_LR_HOPS_V2_MTU_BIT) != 0;
}

}  // namespace espnow_lr
}  // namespace esphome
#endif
