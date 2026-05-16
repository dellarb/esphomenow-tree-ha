# HA Device Link from Add-on UI

**Date:** 2026-05-16  
**Status:** Draft

## Problem

The add-on's device detail page (`#/device/<mac>`) shows device info, OTA controls, and firmware config — but there's no way to jump to the corresponding Home Assistant device page, which has entity controls, automation triggers, and device-level actions. Users have to manually search for the device in HA.

## Solution

Add a "View in Home Assistant" link on the device detail page that navigates to the HA device page (`/device/<device_id>`). The HA `device_id` is a UUID assigned by the device registry and only exists in the HA integration process — it must be communicated to the add-on via the existing protobuf WebSocket channel.

## Architecture

```
HA Integration                         Add-on (Python)                     Add-on UI (Lit)
─────────────                         ──────────────                       ────────────
EspTreeRuntime                         BridgeV2Manager                     device-detail.ts
  ├─ ensure_remote_device()             ├─ _device_id_map: dict[str,str]     ├─ node.ha_device_id
  │   → device registry lookup          │                                    │
  │   → send DeviceIdMap               │                                    │
  └─ handle_frame() ←──────────────────┤                                    │
                                        ├─ handle_integration_frame()        │
                                        │   → store DeviceIdMap             │
                                        │                                    │
                                        ├─ _remote_node()                    │
                                        │   → include ha_device_id           │
                                        │                                    │
                                        ├─ /api/bridge/topology.json         │
                                        │   → ha_device_id in response        ├─ "View in HA" link
                                        └─ /ws/topology                      │
                                            → ha_device_id in snapshot       └─ window.open(...)
```

## Data Flow

1. Integration registers a remote device in HA device registry via `ensure_remote_device()`
2. Integration looks up the resulting `device.id` (UUID) from the device registry
3. Integration sends a `DeviceIdMap` protobuf message to the add-on over the integration WebSocket
4. Add-on stores the MAC→device_id mapping in `BridgeV2Manager._device_id_map`
5. Add-on includes `ha_device_id` in topology node data (REST + WebSocket)
6. UI reads `ha_device_id` from topology data and renders a link

## Protobuf Changes

### New messages in `esp_tree_runtime.proto`

```protobuf
message DeviceIdEntry {
  string remote_mac = 1;
  string ha_device_id = 2;
}

message DeviceIdMap {
  repeated DeviceIdEntry entries = 1;
}
```

### Envelope addition

Add `device_id_map = 40` to the `Envelope.msg` oneof. Field number 40 was chosen because:
- It continues the existing skip pattern (10-22, 30-36, then 40)
- It's well clear of the OTA block (30-36)
- It leaves room for more message types in the 40-49 range

### Backward Compatibility Analysis

| Consumer | Handling | Impact |
|----------|----------|--------|
| **Bridge (ESP32 C++)** | Never receives `DeviceIdMap` (integration→add-on only). Manual parser ignores unknown oneof fields. The `parse_envelope` function captures `msg_field` and `msg_data`, then `handle_binary` dispatches on known fields. Unknown fields 40+ hit the `else` branch → error response. **But this message never reaches the bridge.** | **No change needed** |
| **Add-on (Python protobuf)** | `pb.Envelope.ParseFromString()` handles unknown oneof fields via `UnknownFieldSet`. `WhichOneof("msg")` returns `"device_id_map"` after regeneration. | Needs handler in `handle_integration_frame` |
| **Integration (Python protobuf)** | Needs regenerated `esp_tree_runtime_pb2.py` to encode `DeviceIdMap`. | Needs code to send it |

**Key point:** The bridge's C++ manual protobuf encoder/decoder does NOT need changes because:
1. It never receives this message type (flow is integration→add-on, not add-on→bridge)
2. If it ever received one, the `else` branch in `handle_binary` returns an error — which is correct behavior for an unsupported message
3. The bridge never needs to generate this message

The bridge's `EnvelopeField` enum in C++ does NOT need the `DEVICE_ID_MAP = 40` entry because the bridge never encodes or decodes this message.

## Detailed Changes

### 1. `app/protobuf/esp_tree_runtime.proto`

Add `DeviceIdEntry`, `DeviceIdMap` messages and `device_id_map = 40` to `Envelope.msg` oneof.

Copy regenerated `esp_tree_runtime_pb2.py` to `ha_integration/custom_components/esp_tree/protobuf/generated/esp_tree_runtime_pb2.py`.

### 2. Integration: `ha_integration/custom_components/esp_tree/bridge_runtime.py`

Add method `_send_device_id_map()` that:
- Iterates all known remotes in `self.remotes`
- For each remote that has a config entry (tracked in `self._remote_entry_ids`), looks up the device_id via `dr.async_get(self.hass).async_get_device(identifiers={(DOMAIN, remote_mac)})`
- Builds and sends a `DeviceIdMap` protobuf message via `self.client`

Call `_send_device_id_map()` from:
- After `_handle_snapshot()` — when full topology arrives, send all known device IDs
- After `ensure_remote_device()` in `_merge_remote_snapshot()` — when a remote's device is created/updated
- After `_handle_events()` for `remote_metadata_changed` — when a remote's config entry is established
- After `register_remote_entry()` — when a new remote config entry is confirmed

Add `send_device_id_map()` as a public method on `IntegrationWSClient` (currently only `_send` is private, `request` is for request/response; we need fire-and-forget).

### 3. Integration: `ha_integration/custom_components/esp_tree/integration_client.py`

Add a public `send()` method:
```python
async def send(self, envelope: pb.Envelope) -> None:
    """Fire-and-forget send (no response expected)."""
    await self._send(envelope)
```

### 4. Add-on: `app/bridge_v2_client.py` — `BridgeV2Manager`

Add attribute `_device_id_map: dict[str, str]` to `__init__`.

In `handle_integration_frame()`, handle `kind == "device_id_map"`:
```python
if kind == "device_id_map":
    for entry in env.device_id_map.entries:
        mac = normalize_mac(entry.remote_mac)
        if entry.ha_device_id:
            self._device_id_map[mac] = entry.ha_device_id
        else:
            self._device_id_map.pop(mac, None)
    return pb.Envelope(
        request_id=env.request_id,
        api_version=API_VERSION,
    ).SerializeToString()
```

In `_remote_node()`, add `ha_device_id` to the returned dict:
```python
"ha_device_id": self._device_id_map.get(remote_mac, ""),
```

In `_bridge_snapshot_nodes()` (bridge node), add:
```python
# Bridge device_id — look up from device_id_map
# Bridge MACs also get registered in HA device registry
"ha_device_id": self._device_id_map.get(bridge_mac, ""),
```

In `broadcast_topology_change()`, ensure `ha_device_id` is included when broadcasting topology updates via WebSocket.

### 5. Add-on: `app/bridge_v2_client.py` — TopologyBroadcast

The WebSocket topology broadcast (`/ws/topology`) sends topology data as JSON. The existing `topology_nodes()` and `_remote_node()` methods produce dicts that are serialized to JSON. Adding `ha_device_id` to these dicts automatically includes it in the WebSocket broadcast and the REST `/api/bridge/topology.json` endpoint — no separate broadcast logic needed.

### 6. Integration: Sending bridge device IDs

The bridge device is also registered in HA (via `_ensure_bridge_device()`). After `_handle_snapshot()`, the integration should also send the bridge's `device_id`. Modify `_send_device_id_map()` to also include the bridge MAC's device_id by querying the device registry with `(DOMAIN, bridge_mac)`.

### 7. UI: `ui/src/api/client.ts`

Add `ha_device_id?: string` to the `TopologyNode` interface (around line 30).

### 8. UI: `ui/src/components/device-detail.ts`

In the hero section (around line 137-148), after `<h2>...</h2>`, add a conditional link:

```typescript
${this.node.ha_device_id
  ? html`<a class="ha-link" href="/device/${this.node.ha_device_id}" target="_blank" rel="noopener">
      View in Home Assistant
    </a>`
  : nothing}
```

With CSS:
```css
.ha-link {
  font-size: 13px;
  color: var(--primary, #3b82f6);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ha-link:hover {
  text-decoration: underline;
}
```

Since the add-on uses HA ingress, the link `/device/<device_id>` resolves correctly to HA's device page. Using `target="_blank"` opens it in a new tab, consistent with the setup page's integration links.

### 9. UI: `ui/src/components/topology-node.ts`

Optionally add a small HA icon/link in the topology row to provide quicker access. This is a nice-to-have and can be a follow-up.

## Edge Cases

### Integration disconnected or not yet configured

If the integration hasn't connected or hasn't sent `DeviceIdMap`, `ha_device_id` will be absent from topology data. The UI link simply won't render. This is the correct behavior — no broken links.

### Remote not yet discovered by integration

A remote visible in the add-on's topology (via bridge data) may not yet have a config entry in HA. In this case, `ha_device_id` is empty/missing. The link won't render until the user completes the discovery flow.

### Multiple integration clients

The add-on's `_device_id_map` is on `BridgeV2Manager`, not per-client. If a second integration client connects (unlikely but theoretically possible), it would also send `DeviceIdMap` entries. Since device IDs are deterministic (same MAC → same device_id from HA registry), this is idempotent.

### Integration reconnect

On reconnect, the integration reprocesses the full snapshot (from `ClientHello` with `request_full_snapshot=True`). This triggers `_handle_snapshot()` → `_send_device_id_map()`, which re-populates the add-on's `_device_id_map`.

### Device registry changes

HA device IDs are stable — once created, a `DeviceEntry.id` never changes. However, if a remote is forgotten and re-added, it could get a new device_id. The `DeviceIdMap` message replaces the mapping per-MAC (idempotent), so subsequent snapshots will update it.

## Files Changed

| File | Change |
|------|--------|
| `app/protobuf/esp_tree_runtime.proto` | Add `DeviceIdEntry`, `DeviceIdMap` messages; add `device_id_map = 40` to Envelope |
| `ha_integration/.../protobuf/generated/esp_tree_runtime_pb2.py` | Regenerated from proto |
| `ha_integration/.../bridge_runtime.py` | Add `_send_device_id_map()` method; call it from snapshot/event handlers |
| `ha_integration/.../integration_client.py` | Add public `send()` method |
| `app/bridge_v2_client.py` | Add `_device_id_map` to `BridgeV2Manager`; handle `device_id_map` in `handle_integration_frame()`; include `ha_device_id` in `_remote_node()` and `_bridge_snapshot_nodes()` |
| `ui/src/api/client.ts` | Add `ha_device_id?: string` to `TopologyNode` |
| `ui/src/components/device-detail.ts` | Render "View in Home Assistant" link |

## NOT Changed

| File | Reason |
|------|--------|
| `device_code/components/.../bridge_api_proto_messages.h/cpp` | Bridge never sends/receives `DeviceIdMap`. No C++ changes needed. |
| `device_code/components/.../bridge_api_proto_ws.cpp` | Bridge's `handle_binary` already handles unknown fields (error response). No change needed. |

## Testing

1. Start add-on + integration with a bridge connected
2. Verify `DeviceIdMap` is sent after snapshot processing
3. Verify `/api/bridge/topology.json` includes `ha_device_id` for known remotes
4. Verify device detail page shows "View in Home Assistant" link
5. Click link → opens HA device page in new tab
6. Verify bridge device also gets `ha_device_id`
7. Verify link is hidden for remotes not yet registered in HA
8. Verify reconnection re-populates `ha_device_id`