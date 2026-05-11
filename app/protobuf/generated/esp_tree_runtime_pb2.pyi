from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class OtaState(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    OTA_STATE_UNSPECIFIED: _ClassVar[OtaState]
    OTA_STATE_IDLE: _ClassVar[OtaState]
    OTA_STATE_ANNOUNCING: _ClassVar[OtaState]
    OTA_STATE_TRANSFERRING: _ClassVar[OtaState]
    OTA_STATE_VERIFYING: _ClassVar[OtaState]
    OTA_STATE_SUCCESS: _ClassVar[OtaState]
    OTA_STATE_FAILED: _ClassVar[OtaState]
    OTA_STATE_ABORTED: _ClassVar[OtaState]

class CommandStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    COMMAND_STATUS_UNSPECIFIED: _ClassVar[CommandStatus]
    COMMAND_STATUS_ACCEPTED: _ClassVar[CommandStatus]
    COMMAND_STATUS_DELIVERED: _ClassVar[CommandStatus]
    COMMAND_STATUS_FAILED: _ClassVar[CommandStatus]
    COMMAND_STATUS_UNAVAILABLE: _ClassVar[CommandStatus]
    COMMAND_STATUS_UNSUPPORTED: _ClassVar[CommandStatus]
    COMMAND_STATUS_TIMEOUT: _ClassVar[CommandStatus]
OTA_STATE_UNSPECIFIED: OtaState
OTA_STATE_IDLE: OtaState
OTA_STATE_ANNOUNCING: OtaState
OTA_STATE_TRANSFERRING: OtaState
OTA_STATE_VERIFYING: OtaState
OTA_STATE_SUCCESS: OtaState
OTA_STATE_FAILED: OtaState
OTA_STATE_ABORTED: OtaState
COMMAND_STATUS_UNSPECIFIED: CommandStatus
COMMAND_STATUS_ACCEPTED: CommandStatus
COMMAND_STATUS_DELIVERED: CommandStatus
COMMAND_STATUS_FAILED: CommandStatus
COMMAND_STATUS_UNAVAILABLE: CommandStatus
COMMAND_STATUS_UNSUPPORTED: CommandStatus
COMMAND_STATUS_TIMEOUT: CommandStatus

class Envelope(_message.Message):
    __slots__ = ("request_id", "api_version", "auth_challenge", "auth_response", "auth_ok", "auth_failed", "client_hello", "full_snapshot", "event_batch", "command_request", "command_result", "config_command_request", "config_command_result", "ping", "pong", "ota_start_request", "ota_chunk_batch", "ota_abort_request", "ota_accepted", "ota_chunk_request", "ota_status", "ota_aborted", "error")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    API_VERSION_FIELD_NUMBER: _ClassVar[int]
    AUTH_CHALLENGE_FIELD_NUMBER: _ClassVar[int]
    AUTH_RESPONSE_FIELD_NUMBER: _ClassVar[int]
    AUTH_OK_FIELD_NUMBER: _ClassVar[int]
    AUTH_FAILED_FIELD_NUMBER: _ClassVar[int]
    CLIENT_HELLO_FIELD_NUMBER: _ClassVar[int]
    FULL_SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    EVENT_BATCH_FIELD_NUMBER: _ClassVar[int]
    COMMAND_REQUEST_FIELD_NUMBER: _ClassVar[int]
    COMMAND_RESULT_FIELD_NUMBER: _ClassVar[int]
    CONFIG_COMMAND_REQUEST_FIELD_NUMBER: _ClassVar[int]
    CONFIG_COMMAND_RESULT_FIELD_NUMBER: _ClassVar[int]
    PING_FIELD_NUMBER: _ClassVar[int]
    PONG_FIELD_NUMBER: _ClassVar[int]
    OTA_START_REQUEST_FIELD_NUMBER: _ClassVar[int]
    OTA_CHUNK_BATCH_FIELD_NUMBER: _ClassVar[int]
    OTA_ABORT_REQUEST_FIELD_NUMBER: _ClassVar[int]
    OTA_ACCEPTED_FIELD_NUMBER: _ClassVar[int]
    OTA_CHUNK_REQUEST_FIELD_NUMBER: _ClassVar[int]
    OTA_STATUS_FIELD_NUMBER: _ClassVar[int]
    OTA_ABORTED_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    api_version: int
    auth_challenge: AuthChallenge
    auth_response: AuthResponse
    auth_ok: AuthOk
    auth_failed: AuthFailed
    client_hello: ClientHello
    full_snapshot: FullSnapshot
    event_batch: EventBatch
    command_request: CommandRequest
    command_result: CommandResult
    config_command_request: ConfigCommandRequest
    config_command_result: ConfigCommandResult
    ping: Ping
    pong: Pong
    ota_start_request: OtaStartRequest
    ota_chunk_batch: OtaChunkBatch
    ota_abort_request: OtaAbortRequest
    ota_accepted: OtaAccepted
    ota_chunk_request: OtaChunkRequest
    ota_status: OtaStatus
    ota_aborted: OtaAborted
    error: Error
    def __init__(self, request_id: _Optional[str] = ..., api_version: _Optional[int] = ..., auth_challenge: _Optional[_Union[AuthChallenge, _Mapping]] = ..., auth_response: _Optional[_Union[AuthResponse, _Mapping]] = ..., auth_ok: _Optional[_Union[AuthOk, _Mapping]] = ..., auth_failed: _Optional[_Union[AuthFailed, _Mapping]] = ..., client_hello: _Optional[_Union[ClientHello, _Mapping]] = ..., full_snapshot: _Optional[_Union[FullSnapshot, _Mapping]] = ..., event_batch: _Optional[_Union[EventBatch, _Mapping]] = ..., command_request: _Optional[_Union[CommandRequest, _Mapping]] = ..., command_result: _Optional[_Union[CommandResult, _Mapping]] = ..., config_command_request: _Optional[_Union[ConfigCommandRequest, _Mapping]] = ..., config_command_result: _Optional[_Union[ConfigCommandResult, _Mapping]] = ..., ping: _Optional[_Union[Ping, _Mapping]] = ..., pong: _Optional[_Union[Pong, _Mapping]] = ..., ota_start_request: _Optional[_Union[OtaStartRequest, _Mapping]] = ..., ota_chunk_batch: _Optional[_Union[OtaChunkBatch, _Mapping]] = ..., ota_abort_request: _Optional[_Union[OtaAbortRequest, _Mapping]] = ..., ota_accepted: _Optional[_Union[OtaAccepted, _Mapping]] = ..., ota_chunk_request: _Optional[_Union[OtaChunkRequest, _Mapping]] = ..., ota_status: _Optional[_Union[OtaStatus, _Mapping]] = ..., ota_aborted: _Optional[_Union[OtaAborted, _Mapping]] = ..., error: _Optional[_Union[Error, _Mapping]] = ...) -> None: ...

class OtaStartRequest(_message.Message):
    __slots__ = ("target_mac", "file_size", "md5", "sha256", "filename", "preferred_chunk_size")
    TARGET_MAC_FIELD_NUMBER: _ClassVar[int]
    FILE_SIZE_FIELD_NUMBER: _ClassVar[int]
    MD5_FIELD_NUMBER: _ClassVar[int]
    SHA256_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    PREFERRED_CHUNK_SIZE_FIELD_NUMBER: _ClassVar[int]
    target_mac: str
    file_size: int
    md5: str
    sha256: str
    filename: str
    preferred_chunk_size: int
    def __init__(self, target_mac: _Optional[str] = ..., file_size: _Optional[int] = ..., md5: _Optional[str] = ..., sha256: _Optional[str] = ..., filename: _Optional[str] = ..., preferred_chunk_size: _Optional[int] = ...) -> None: ...

class OtaAccepted(_message.Message):
    __slots__ = ("job_id", "target_mac", "max_chunk_size", "total_chunks", "max_chunks_per_batch")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    TARGET_MAC_FIELD_NUMBER: _ClassVar[int]
    MAX_CHUNK_SIZE_FIELD_NUMBER: _ClassVar[int]
    TOTAL_CHUNKS_FIELD_NUMBER: _ClassVar[int]
    MAX_CHUNKS_PER_BATCH_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    target_mac: str
    max_chunk_size: int
    total_chunks: int
    max_chunks_per_batch: int
    def __init__(self, job_id: _Optional[str] = ..., target_mac: _Optional[str] = ..., max_chunk_size: _Optional[int] = ..., total_chunks: _Optional[int] = ..., max_chunks_per_batch: _Optional[int] = ...) -> None: ...

class OtaChunkRequest(_message.Message):
    __slots__ = ("job_id", "request_id", "sequences", "progress")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    SEQUENCES_FIELD_NUMBER: _ClassVar[int]
    PROGRESS_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    request_id: str
    sequences: _containers.RepeatedScalarFieldContainer[int]
    progress: OtaProgress
    def __init__(self, job_id: _Optional[str] = ..., request_id: _Optional[str] = ..., sequences: _Optional[_Iterable[int]] = ..., progress: _Optional[_Union[OtaProgress, _Mapping]] = ...) -> None: ...

class OtaProgress(_message.Message):
    __slots__ = ("chunks_sent", "chunks_confirmed", "current_increment", "total_increments", "retransmit_round", "buffer_size_kb", "percent")
    CHUNKS_SENT_FIELD_NUMBER: _ClassVar[int]
    CHUNKS_CONFIRMED_FIELD_NUMBER: _ClassVar[int]
    CURRENT_INCREMENT_FIELD_NUMBER: _ClassVar[int]
    TOTAL_INCREMENTS_FIELD_NUMBER: _ClassVar[int]
    RETRANSMIT_ROUND_FIELD_NUMBER: _ClassVar[int]
    BUFFER_SIZE_KB_FIELD_NUMBER: _ClassVar[int]
    PERCENT_FIELD_NUMBER: _ClassVar[int]
    chunks_sent: int
    chunks_confirmed: int
    current_increment: int
    total_increments: int
    retransmit_round: int
    buffer_size_kb: int
    percent: int
    def __init__(self, chunks_sent: _Optional[int] = ..., chunks_confirmed: _Optional[int] = ..., current_increment: _Optional[int] = ..., total_increments: _Optional[int] = ..., retransmit_round: _Optional[int] = ..., buffer_size_kb: _Optional[int] = ..., percent: _Optional[int] = ...) -> None: ...

class OtaChunkBatch(_message.Message):
    __slots__ = ("job_id", "response_request_id", "chunks")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    RESPONSE_REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    CHUNKS_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    response_request_id: str
    chunks: _containers.RepeatedCompositeFieldContainer[OtaChunk]
    def __init__(self, job_id: _Optional[str] = ..., response_request_id: _Optional[str] = ..., chunks: _Optional[_Iterable[_Union[OtaChunk, _Mapping]]] = ...) -> None: ...

class OtaChunk(_message.Message):
    __slots__ = ("sequence", "offset", "payload", "flags", "crc32")
    SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    OFFSET_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    FLAGS_FIELD_NUMBER: _ClassVar[int]
    CRC32_FIELD_NUMBER: _ClassVar[int]
    sequence: int
    offset: int
    payload: bytes
    flags: int
    crc32: int
    def __init__(self, sequence: _Optional[int] = ..., offset: _Optional[int] = ..., payload: _Optional[bytes] = ..., flags: _Optional[int] = ..., crc32: _Optional[int] = ...) -> None: ...

class OtaStatus(_message.Message):
    __slots__ = ("job_id", "state", "percent", "bytes_received", "file_size", "error_detail")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    PERCENT_FIELD_NUMBER: _ClassVar[int]
    BYTES_RECEIVED_FIELD_NUMBER: _ClassVar[int]
    FILE_SIZE_FIELD_NUMBER: _ClassVar[int]
    ERROR_DETAIL_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    state: OtaState
    percent: int
    bytes_received: int
    file_size: int
    error_detail: str
    def __init__(self, job_id: _Optional[str] = ..., state: _Optional[_Union[OtaState, str]] = ..., percent: _Optional[int] = ..., bytes_received: _Optional[int] = ..., file_size: _Optional[int] = ..., error_detail: _Optional[str] = ...) -> None: ...

class OtaAbortRequest(_message.Message):
    __slots__ = ("job_id", "reason")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    reason: str
    def __init__(self, job_id: _Optional[str] = ..., reason: _Optional[str] = ...) -> None: ...

class OtaAborted(_message.Message):
    __slots__ = ("job_id", "reason")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    reason: str
    def __init__(self, job_id: _Optional[str] = ..., reason: _Optional[str] = ...) -> None: ...

class AuthChallenge(_message.Message):
    __slots__ = ("server_nonce", "min_version", "max_version", "protocol", "bridge_mac")
    SERVER_NONCE_FIELD_NUMBER: _ClassVar[int]
    MIN_VERSION_FIELD_NUMBER: _ClassVar[int]
    MAX_VERSION_FIELD_NUMBER: _ClassVar[int]
    PROTOCOL_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    server_nonce: bytes
    min_version: int
    max_version: int
    protocol: str
    bridge_mac: str
    def __init__(self, server_nonce: _Optional[bytes] = ..., min_version: _Optional[int] = ..., max_version: _Optional[int] = ..., protocol: _Optional[str] = ..., bridge_mac: _Optional[str] = ...) -> None: ...

class AuthResponse(_message.Message):
    __slots__ = ("client_kind", "client_name", "client_nonce", "hmac_sha256")
    CLIENT_KIND_FIELD_NUMBER: _ClassVar[int]
    CLIENT_NAME_FIELD_NUMBER: _ClassVar[int]
    CLIENT_NONCE_FIELD_NUMBER: _ClassVar[int]
    HMAC_SHA256_FIELD_NUMBER: _ClassVar[int]
    client_kind: str
    client_name: str
    client_nonce: bytes
    hmac_sha256: bytes
    def __init__(self, client_kind: _Optional[str] = ..., client_name: _Optional[str] = ..., client_nonce: _Optional[bytes] = ..., hmac_sha256: _Optional[bytes] = ...) -> None: ...

class AuthOk(_message.Message):
    __slots__ = ("negotiated_version", "server_name", "bridge", "capabilities")
    NEGOTIATED_VERSION_FIELD_NUMBER: _ClassVar[int]
    SERVER_NAME_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_FIELD_NUMBER: _ClassVar[int]
    CAPABILITIES_FIELD_NUMBER: _ClassVar[int]
    negotiated_version: int
    server_name: str
    bridge: BridgeIdentity
    capabilities: BridgeCapabilities
    def __init__(self, negotiated_version: _Optional[int] = ..., server_name: _Optional[str] = ..., bridge: _Optional[_Union[BridgeIdentity, _Mapping]] = ..., capabilities: _Optional[_Union[BridgeCapabilities, _Mapping]] = ...) -> None: ...

class AuthFailed(_message.Message):
    __slots__ = ("code", "message")
    CODE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    code: str
    message: str
    def __init__(self, code: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class ClientHello(_message.Message):
    __slots__ = ("request_full_snapshot", "integration_version", "known_remote_schemas")
    REQUEST_FULL_SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    INTEGRATION_VERSION_FIELD_NUMBER: _ClassVar[int]
    KNOWN_REMOTE_SCHEMAS_FIELD_NUMBER: _ClassVar[int]
    request_full_snapshot: bool
    integration_version: str
    known_remote_schemas: _containers.RepeatedCompositeFieldContainer[KnownRemoteSchema]
    def __init__(self, request_full_snapshot: bool = ..., integration_version: _Optional[str] = ..., known_remote_schemas: _Optional[_Iterable[_Union[KnownRemoteSchema, _Mapping]]] = ...) -> None: ...

class KnownRemoteSchema(_message.Message):
    __slots__ = ("remote_mac", "schema_hash")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_HASH_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    schema_hash: str
    def __init__(self, remote_mac: _Optional[str] = ..., schema_hash: _Optional[str] = ...) -> None: ...

class FullSnapshot(_message.Message):
    __slots__ = ("bridge", "bridge_runtime", "remotes", "snapshot_unix_ms")
    BRIDGE_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_RUNTIME_FIELD_NUMBER: _ClassVar[int]
    REMOTES_FIELD_NUMBER: _ClassVar[int]
    SNAPSHOT_UNIX_MS_FIELD_NUMBER: _ClassVar[int]
    bridge: BridgeIdentity
    bridge_runtime: BridgeRuntime
    remotes: _containers.RepeatedCompositeFieldContainer[RemoteSnapshot]
    snapshot_unix_ms: int
    def __init__(self, bridge: _Optional[_Union[BridgeIdentity, _Mapping]] = ..., bridge_runtime: _Optional[_Union[BridgeRuntime, _Mapping]] = ..., remotes: _Optional[_Iterable[_Union[RemoteSnapshot, _Mapping]]] = ..., snapshot_unix_ms: _Optional[int] = ...) -> None: ...

class BridgeIdentity(_message.Message):
    __slots__ = ("bridge_mac", "bridge_name", "friendly_name", "network_id", "manufacturer", "model", "project_name", "project_version", "firmware_build_date", "api_server")
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_NAME_FIELD_NUMBER: _ClassVar[int]
    FRIENDLY_NAME_FIELD_NUMBER: _ClassVar[int]
    NETWORK_ID_FIELD_NUMBER: _ClassVar[int]
    MANUFACTURER_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    PROJECT_NAME_FIELD_NUMBER: _ClassVar[int]
    PROJECT_VERSION_FIELD_NUMBER: _ClassVar[int]
    FIRMWARE_BUILD_DATE_FIELD_NUMBER: _ClassVar[int]
    API_SERVER_FIELD_NUMBER: _ClassVar[int]
    bridge_mac: str
    bridge_name: str
    friendly_name: str
    network_id: str
    manufacturer: str
    model: str
    project_name: str
    project_version: str
    firmware_build_date: str
    api_server: str
    def __init__(self, bridge_mac: _Optional[str] = ..., bridge_name: _Optional[str] = ..., friendly_name: _Optional[str] = ..., network_id: _Optional[str] = ..., manufacturer: _Optional[str] = ..., model: _Optional[str] = ..., project_name: _Optional[str] = ..., project_version: _Optional[str] = ..., firmware_build_date: _Optional[str] = ..., api_server: _Optional[str] = ...) -> None: ...

class BridgeCapabilities(_message.Message):
    __slots__ = ("supports_runtime_v2", "supports_commands", "supports_schema_push", "supports_state_push", "supports_topology", "supports_config_commands")
    SUPPORTS_RUNTIME_V2_FIELD_NUMBER: _ClassVar[int]
    SUPPORTS_COMMANDS_FIELD_NUMBER: _ClassVar[int]
    SUPPORTS_SCHEMA_PUSH_FIELD_NUMBER: _ClassVar[int]
    SUPPORTS_STATE_PUSH_FIELD_NUMBER: _ClassVar[int]
    SUPPORTS_TOPOLOGY_FIELD_NUMBER: _ClassVar[int]
    SUPPORTS_CONFIG_COMMANDS_FIELD_NUMBER: _ClassVar[int]
    supports_runtime_v2: bool
    supports_commands: bool
    supports_schema_push: bool
    supports_state_push: bool
    supports_topology: bool
    supports_config_commands: bool
    def __init__(self, supports_runtime_v2: bool = ..., supports_commands: bool = ..., supports_schema_push: bool = ..., supports_state_push: bool = ..., supports_topology: bool = ..., supports_config_commands: bool = ...) -> None: ...

class BridgeRuntime(_message.Message):
    __slots__ = ("online", "wifi_rssi", "uptime_s", "remote_count")
    ONLINE_FIELD_NUMBER: _ClassVar[int]
    WIFI_RSSI_FIELD_NUMBER: _ClassVar[int]
    UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    REMOTE_COUNT_FIELD_NUMBER: _ClassVar[int]
    online: bool
    wifi_rssi: int
    uptime_s: int
    remote_count: int
    def __init__(self, online: bool = ..., wifi_rssi: _Optional[int] = ..., uptime_s: _Optional[int] = ..., remote_count: _Optional[int] = ...) -> None: ...

class RemoteSnapshot(_message.Message):
    __slots__ = ("identity", "runtime", "descriptor_set", "states")
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    RUNTIME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTOR_SET_FIELD_NUMBER: _ClassVar[int]
    STATES_FIELD_NUMBER: _ClassVar[int]
    identity: RemoteIdentity
    runtime: RemoteRuntime
    descriptor_set: RemoteDescriptorSet
    states: _containers.RepeatedCompositeFieldContainer[EntityState]
    def __init__(self, identity: _Optional[_Union[RemoteIdentity, _Mapping]] = ..., runtime: _Optional[_Union[RemoteRuntime, _Mapping]] = ..., descriptor_set: _Optional[_Union[RemoteDescriptorSet, _Mapping]] = ..., states: _Optional[_Iterable[_Union[EntityState, _Mapping]]] = ...) -> None: ...

class RemoteIdentity(_message.Message):
    __slots__ = ("remote_mac", "esphome_name", "friendly_name", "manufacturer", "model", "project_name", "project_version", "firmware_build_date", "firmware_md5", "schema_hash", "entity_count", "chip_name", "can_relay", "relay_enabled")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    ESPHOME_NAME_FIELD_NUMBER: _ClassVar[int]
    FRIENDLY_NAME_FIELD_NUMBER: _ClassVar[int]
    MANUFACTURER_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    PROJECT_NAME_FIELD_NUMBER: _ClassVar[int]
    PROJECT_VERSION_FIELD_NUMBER: _ClassVar[int]
    FIRMWARE_BUILD_DATE_FIELD_NUMBER: _ClassVar[int]
    FIRMWARE_MD5_FIELD_NUMBER: _ClassVar[int]
    SCHEMA_HASH_FIELD_NUMBER: _ClassVar[int]
    ENTITY_COUNT_FIELD_NUMBER: _ClassVar[int]
    CHIP_NAME_FIELD_NUMBER: _ClassVar[int]
    CAN_RELAY_FIELD_NUMBER: _ClassVar[int]
    RELAY_ENABLED_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    esphome_name: str
    friendly_name: str
    manufacturer: str
    model: str
    project_name: str
    project_version: str
    firmware_build_date: str
    firmware_md5: str
    schema_hash: str
    entity_count: int
    chip_name: str
    can_relay: bool
    relay_enabled: bool
    def __init__(self, remote_mac: _Optional[str] = ..., esphome_name: _Optional[str] = ..., friendly_name: _Optional[str] = ..., manufacturer: _Optional[str] = ..., model: _Optional[str] = ..., project_name: _Optional[str] = ..., project_version: _Optional[str] = ..., firmware_build_date: _Optional[str] = ..., firmware_md5: _Optional[str] = ..., schema_hash: _Optional[str] = ..., entity_count: _Optional[int] = ..., chip_name: _Optional[str] = ..., can_relay: bool = ..., relay_enabled: bool = ...) -> None: ...

class RemoteRuntime(_message.Message):
    __slots__ = ("online", "bridge_mac", "parent_mac", "hops_to_bridge", "rssi", "last_seen_bridge_uptime_s", "session_id", "last_tx_counter", "uptime_s")
    ONLINE_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    PARENT_MAC_FIELD_NUMBER: _ClassVar[int]
    HOPS_TO_BRIDGE_FIELD_NUMBER: _ClassVar[int]
    RSSI_FIELD_NUMBER: _ClassVar[int]
    LAST_SEEN_BRIDGE_UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    LAST_TX_COUNTER_FIELD_NUMBER: _ClassVar[int]
    UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    online: bool
    bridge_mac: str
    parent_mac: str
    hops_to_bridge: int
    rssi: int
    last_seen_bridge_uptime_s: int
    session_id: str
    last_tx_counter: int
    uptime_s: int
    def __init__(self, online: bool = ..., bridge_mac: _Optional[str] = ..., parent_mac: _Optional[str] = ..., hops_to_bridge: _Optional[int] = ..., rssi: _Optional[int] = ..., last_seen_bridge_uptime_s: _Optional[int] = ..., session_id: _Optional[str] = ..., last_tx_counter: _Optional[int] = ..., uptime_s: _Optional[int] = ...) -> None: ...

class RemoteDescriptorSet(_message.Message):
    __slots__ = ("schema_hash", "entities")
    SCHEMA_HASH_FIELD_NUMBER: _ClassVar[int]
    ENTITIES_FIELD_NUMBER: _ClassVar[int]
    schema_hash: str
    entities: _containers.RepeatedCompositeFieldContainer[EntityDescriptor]
    def __init__(self, schema_hash: _Optional[str] = ..., entities: _Optional[_Iterable[_Union[EntityDescriptor, _Mapping]]] = ...) -> None: ...

class EntityDescriptor(_message.Message):
    __slots__ = ("object_id", "platform", "friendly_name", "icon", "device_class", "state_class", "unit_of_measurement", "entity_category", "disabled_by_default", "diagnostic", "writable", "native_type", "options_json", "options", "command")
    OBJECT_ID_FIELD_NUMBER: _ClassVar[int]
    PLATFORM_FIELD_NUMBER: _ClassVar[int]
    FRIENDLY_NAME_FIELD_NUMBER: _ClassVar[int]
    ICON_FIELD_NUMBER: _ClassVar[int]
    DEVICE_CLASS_FIELD_NUMBER: _ClassVar[int]
    STATE_CLASS_FIELD_NUMBER: _ClassVar[int]
    UNIT_OF_MEASUREMENT_FIELD_NUMBER: _ClassVar[int]
    ENTITY_CATEGORY_FIELD_NUMBER: _ClassVar[int]
    DISABLED_BY_DEFAULT_FIELD_NUMBER: _ClassVar[int]
    DIAGNOSTIC_FIELD_NUMBER: _ClassVar[int]
    WRITABLE_FIELD_NUMBER: _ClassVar[int]
    NATIVE_TYPE_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_JSON_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    object_id: str
    platform: str
    friendly_name: str
    icon: str
    device_class: str
    state_class: str
    unit_of_measurement: str
    entity_category: str
    disabled_by_default: bool
    diagnostic: bool
    writable: bool
    native_type: str
    options_json: str
    options: _containers.RepeatedCompositeFieldContainer[Option]
    command: CommandDescriptor
    def __init__(self, object_id: _Optional[str] = ..., platform: _Optional[str] = ..., friendly_name: _Optional[str] = ..., icon: _Optional[str] = ..., device_class: _Optional[str] = ..., state_class: _Optional[str] = ..., unit_of_measurement: _Optional[str] = ..., entity_category: _Optional[str] = ..., disabled_by_default: bool = ..., diagnostic: bool = ..., writable: bool = ..., native_type: _Optional[str] = ..., options_json: _Optional[str] = ..., options: _Optional[_Iterable[_Union[Option, _Mapping]]] = ..., command: _Optional[_Union[CommandDescriptor, _Mapping]] = ...) -> None: ...

class Option(_message.Message):
    __slots__ = ("key", "label")
    KEY_FIELD_NUMBER: _ClassVar[int]
    LABEL_FIELD_NUMBER: _ClassVar[int]
    key: str
    label: str
    def __init__(self, key: _Optional[str] = ..., label: _Optional[str] = ...) -> None: ...

class CommandDescriptor(_message.Message):
    __slots__ = ("supported_commands", "arguments")
    SUPPORTED_COMMANDS_FIELD_NUMBER: _ClassVar[int]
    ARGUMENTS_FIELD_NUMBER: _ClassVar[int]
    supported_commands: _containers.RepeatedScalarFieldContainer[str]
    arguments: _containers.RepeatedCompositeFieldContainer[ArgumentDescriptor]
    def __init__(self, supported_commands: _Optional[_Iterable[str]] = ..., arguments: _Optional[_Iterable[_Union[ArgumentDescriptor, _Mapping]]] = ...) -> None: ...

class ArgumentDescriptor(_message.Message):
    __slots__ = ("name", "value_type", "required", "min_value", "max_value", "step")
    NAME_FIELD_NUMBER: _ClassVar[int]
    VALUE_TYPE_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_FIELD_NUMBER: _ClassVar[int]
    MIN_VALUE_FIELD_NUMBER: _ClassVar[int]
    MAX_VALUE_FIELD_NUMBER: _ClassVar[int]
    STEP_FIELD_NUMBER: _ClassVar[int]
    name: str
    value_type: str
    required: bool
    min_value: float
    max_value: float
    step: float
    def __init__(self, name: _Optional[str] = ..., value_type: _Optional[str] = ..., required: bool = ..., min_value: _Optional[float] = ..., max_value: _Optional[float] = ..., step: _Optional[float] = ...) -> None: ...

class EntityState(_message.Message):
    __slots__ = ("object_id", "available", "observed_unix_ms", "bool_value", "int_value", "float_value", "string_value", "bytes_value")
    OBJECT_ID_FIELD_NUMBER: _ClassVar[int]
    AVAILABLE_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_UNIX_MS_FIELD_NUMBER: _ClassVar[int]
    BOOL_VALUE_FIELD_NUMBER: _ClassVar[int]
    INT_VALUE_FIELD_NUMBER: _ClassVar[int]
    FLOAT_VALUE_FIELD_NUMBER: _ClassVar[int]
    STRING_VALUE_FIELD_NUMBER: _ClassVar[int]
    BYTES_VALUE_FIELD_NUMBER: _ClassVar[int]
    object_id: str
    available: bool
    observed_unix_ms: int
    bool_value: bool
    int_value: int
    float_value: float
    string_value: str
    bytes_value: bytes
    def __init__(self, object_id: _Optional[str] = ..., available: bool = ..., observed_unix_ms: _Optional[int] = ..., bool_value: bool = ..., int_value: _Optional[int] = ..., float_value: _Optional[float] = ..., string_value: _Optional[str] = ..., bytes_value: _Optional[bytes] = ...) -> None: ...

class EventBatch(_message.Message):
    __slots__ = ("events",)
    EVENTS_FIELD_NUMBER: _ClassVar[int]
    events: _containers.RepeatedCompositeFieldContainer[Event]
    def __init__(self, events: _Optional[_Iterable[_Union[Event, _Mapping]]] = ...) -> None: ...

class Event(_message.Message):
    __slots__ = ("bridge_heartbeat", "remote_availability", "remote_state", "remote_schema_changed", "remote_metadata_changed", "topology_changed")
    BRIDGE_HEARTBEAT_FIELD_NUMBER: _ClassVar[int]
    REMOTE_AVAILABILITY_FIELD_NUMBER: _ClassVar[int]
    REMOTE_STATE_FIELD_NUMBER: _ClassVar[int]
    REMOTE_SCHEMA_CHANGED_FIELD_NUMBER: _ClassVar[int]
    REMOTE_METADATA_CHANGED_FIELD_NUMBER: _ClassVar[int]
    TOPOLOGY_CHANGED_FIELD_NUMBER: _ClassVar[int]
    bridge_heartbeat: BridgeHeartbeat
    remote_availability: RemoteAvailabilityEvent
    remote_state: RemoteStateEvent
    remote_schema_changed: RemoteSchemaChangedEvent
    remote_metadata_changed: RemoteMetadataChangedEvent
    topology_changed: TopologyChangedEvent
    def __init__(self, bridge_heartbeat: _Optional[_Union[BridgeHeartbeat, _Mapping]] = ..., remote_availability: _Optional[_Union[RemoteAvailabilityEvent, _Mapping]] = ..., remote_state: _Optional[_Union[RemoteStateEvent, _Mapping]] = ..., remote_schema_changed: _Optional[_Union[RemoteSchemaChangedEvent, _Mapping]] = ..., remote_metadata_changed: _Optional[_Union[RemoteMetadataChangedEvent, _Mapping]] = ..., topology_changed: _Optional[_Union[TopologyChangedEvent, _Mapping]] = ...) -> None: ...

class RemoteAvailabilityEvent(_message.Message):
    __slots__ = ("remote_mac", "online", "bridge_mac", "session_id", "tx_counter", "observed_unix_ms", "rssi", "hops_to_bridge", "reason", "uptime_s")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    ONLINE_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    TX_COUNTER_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_UNIX_MS_FIELD_NUMBER: _ClassVar[int]
    RSSI_FIELD_NUMBER: _ClassVar[int]
    HOPS_TO_BRIDGE_FIELD_NUMBER: _ClassVar[int]
    REASON_FIELD_NUMBER: _ClassVar[int]
    UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    online: bool
    bridge_mac: str
    session_id: str
    tx_counter: int
    observed_unix_ms: int
    rssi: int
    hops_to_bridge: int
    reason: str
    uptime_s: int
    def __init__(self, remote_mac: _Optional[str] = ..., online: bool = ..., bridge_mac: _Optional[str] = ..., session_id: _Optional[str] = ..., tx_counter: _Optional[int] = ..., observed_unix_ms: _Optional[int] = ..., rssi: _Optional[int] = ..., hops_to_bridge: _Optional[int] = ..., reason: _Optional[str] = ..., uptime_s: _Optional[int] = ...) -> None: ...

class RemoteStateEvent(_message.Message):
    __slots__ = ("remote_mac", "bridge_mac", "session_id", "tx_counter", "states", "observed_unix_ms", "uptime_s", "rssi", "hops_to_bridge")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    TX_COUNTER_FIELD_NUMBER: _ClassVar[int]
    STATES_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_UNIX_MS_FIELD_NUMBER: _ClassVar[int]
    UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    RSSI_FIELD_NUMBER: _ClassVar[int]
    HOPS_TO_BRIDGE_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    bridge_mac: str
    session_id: str
    tx_counter: int
    states: _containers.RepeatedCompositeFieldContainer[EntityState]
    observed_unix_ms: int
    uptime_s: int
    rssi: int
    hops_to_bridge: int
    def __init__(self, remote_mac: _Optional[str] = ..., bridge_mac: _Optional[str] = ..., session_id: _Optional[str] = ..., tx_counter: _Optional[int] = ..., states: _Optional[_Iterable[_Union[EntityState, _Mapping]]] = ..., observed_unix_ms: _Optional[int] = ..., uptime_s: _Optional[int] = ..., rssi: _Optional[int] = ..., hops_to_bridge: _Optional[int] = ...) -> None: ...

class RemoteSchemaChangedEvent(_message.Message):
    __slots__ = ("remote_mac", "bridge_mac", "session_id", "old_schema_hash", "snapshot")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    OLD_SCHEMA_HASH_FIELD_NUMBER: _ClassVar[int]
    SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    bridge_mac: str
    session_id: str
    old_schema_hash: str
    snapshot: RemoteSnapshot
    def __init__(self, remote_mac: _Optional[str] = ..., bridge_mac: _Optional[str] = ..., session_id: _Optional[str] = ..., old_schema_hash: _Optional[str] = ..., snapshot: _Optional[_Union[RemoteSnapshot, _Mapping]] = ...) -> None: ...

class RemoteMetadataChangedEvent(_message.Message):
    __slots__ = ("identity", "runtime")
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    RUNTIME_FIELD_NUMBER: _ClassVar[int]
    identity: RemoteIdentity
    runtime: RemoteRuntime
    def __init__(self, identity: _Optional[_Union[RemoteIdentity, _Mapping]] = ..., runtime: _Optional[_Union[RemoteRuntime, _Mapping]] = ...) -> None: ...

class TopologyChangedEvent(_message.Message):
    __slots__ = ("remote_mac", "bridge_mac", "parent_mac", "hops_to_bridge", "rssi", "observed_unix_ms", "uptime_s")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    PARENT_MAC_FIELD_NUMBER: _ClassVar[int]
    HOPS_TO_BRIDGE_FIELD_NUMBER: _ClassVar[int]
    RSSI_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_UNIX_MS_FIELD_NUMBER: _ClassVar[int]
    UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    bridge_mac: str
    parent_mac: str
    hops_to_bridge: int
    rssi: int
    observed_unix_ms: int
    uptime_s: int
    def __init__(self, remote_mac: _Optional[str] = ..., bridge_mac: _Optional[str] = ..., parent_mac: _Optional[str] = ..., hops_to_bridge: _Optional[int] = ..., rssi: _Optional[int] = ..., observed_unix_ms: _Optional[int] = ..., uptime_s: _Optional[int] = ...) -> None: ...

class BridgeHeartbeat(_message.Message):
    __slots__ = ("bridge_mac", "bridge_unix_ms", "uptime_s")
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_UNIX_MS_FIELD_NUMBER: _ClassVar[int]
    UPTIME_S_FIELD_NUMBER: _ClassVar[int]
    bridge_mac: str
    bridge_unix_ms: int
    uptime_s: int
    def __init__(self, bridge_mac: _Optional[str] = ..., bridge_unix_ms: _Optional[int] = ..., uptime_s: _Optional[int] = ...) -> None: ...

class CommandRequest(_message.Message):
    __slots__ = ("remote_mac", "object_id", "command", "args")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    OBJECT_ID_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    ARGS_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    object_id: str
    command: str
    args: _containers.RepeatedCompositeFieldContainer[CommandArgument]
    def __init__(self, remote_mac: _Optional[str] = ..., object_id: _Optional[str] = ..., command: _Optional[str] = ..., args: _Optional[_Iterable[_Union[CommandArgument, _Mapping]]] = ...) -> None: ...

class CommandArgument(_message.Message):
    __slots__ = ("name", "bool_value", "int_value", "float_value", "string_value")
    NAME_FIELD_NUMBER: _ClassVar[int]
    BOOL_VALUE_FIELD_NUMBER: _ClassVar[int]
    INT_VALUE_FIELD_NUMBER: _ClassVar[int]
    FLOAT_VALUE_FIELD_NUMBER: _ClassVar[int]
    STRING_VALUE_FIELD_NUMBER: _ClassVar[int]
    name: str
    bool_value: bool
    int_value: int
    float_value: float
    string_value: str
    def __init__(self, name: _Optional[str] = ..., bool_value: bool = ..., int_value: _Optional[int] = ..., float_value: _Optional[float] = ..., string_value: _Optional[str] = ...) -> None: ...

class CommandResult(_message.Message):
    __slots__ = ("remote_mac", "object_id", "command", "bridge_mac", "session_id", "status", "error_code", "error_message")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    OBJECT_ID_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    ERROR_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    object_id: str
    command: str
    bridge_mac: str
    session_id: str
    status: CommandStatus
    error_code: str
    error_message: str
    def __init__(self, remote_mac: _Optional[str] = ..., object_id: _Optional[str] = ..., command: _Optional[str] = ..., bridge_mac: _Optional[str] = ..., session_id: _Optional[str] = ..., status: _Optional[_Union[CommandStatus, str]] = ..., error_code: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class ConfigCommandRequest(_message.Message):
    __slots__ = ("remote_mac", "command", "interval_seconds", "parent_mac", "clear_parent", "relay_enable")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    INTERVAL_SECONDS_FIELD_NUMBER: _ClassVar[int]
    PARENT_MAC_FIELD_NUMBER: _ClassVar[int]
    CLEAR_PARENT_FIELD_NUMBER: _ClassVar[int]
    RELAY_ENABLE_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    command: str
    interval_seconds: int
    parent_mac: str
    clear_parent: bool
    relay_enable: bool
    def __init__(self, remote_mac: _Optional[str] = ..., command: _Optional[str] = ..., interval_seconds: _Optional[int] = ..., parent_mac: _Optional[str] = ..., clear_parent: bool = ..., relay_enable: bool = ...) -> None: ...

class ConfigCommandResult(_message.Message):
    __slots__ = ("remote_mac", "command", "bridge_mac", "session_id", "status", "error_code", "error_message")
    REMOTE_MAC_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    BRIDGE_MAC_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    ERROR_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    remote_mac: str
    command: str
    bridge_mac: str
    session_id: str
    status: CommandStatus
    error_code: str
    error_message: str
    def __init__(self, remote_mac: _Optional[str] = ..., command: _Optional[str] = ..., bridge_mac: _Optional[str] = ..., session_id: _Optional[str] = ..., status: _Optional[_Union[CommandStatus, str]] = ..., error_code: _Optional[str] = ..., error_message: _Optional[str] = ...) -> None: ...

class Ping(_message.Message):
    __slots__ = ("monotonic_ms",)
    MONOTONIC_MS_FIELD_NUMBER: _ClassVar[int]
    monotonic_ms: int
    def __init__(self, monotonic_ms: _Optional[int] = ...) -> None: ...

class Pong(_message.Message):
    __slots__ = ("monotonic_ms",)
    MONOTONIC_MS_FIELD_NUMBER: _ClassVar[int]
    monotonic_ms: int
    def __init__(self, monotonic_ms: _Optional[int] = ...) -> None: ...

class Error(_message.Message):
    __slots__ = ("code", "message")
    CODE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    code: str
    message: str
    def __init__(self, code: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...
