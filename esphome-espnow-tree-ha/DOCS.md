# ESPHome ESPNow Tree

ESPHome ESPNow Tree is a Home Assistant add-on for viewing an ESP-NOW LR bridge topology and flashing remote firmware through the bridge.

## V1 Features

- Ingress panel for the ESP-NOW LR topology.
- Recursive bridge/remote tree from the bridge `/topology.json`.
- Device detail diagnostics from topology data.
- `.ota.bin` upload into persistent add-on storage.
- Backend-managed OTA worker that feeds requested chunks to the bridge `/api/ota/chunk` endpoint.
- Flash progress, abort, rejoin confirmation, and history.
- Seven-day retained firmware binaries for manual rollback/reflash.
- Manual bridge host override plus Home Assistant state based auto-discovery.

## Configuration

The add-on can auto-discover a bridge if the bridge publishes a `topology_url` diagnostic entity to Home Assistant. Manual configuration is preferred for first setup:

```yaml
bridge_host: "192.168.1.50"
bridge_port: 80
firmware_retention_days: 7
```

The add-on uses Home Assistant ingress for user authentication and `SUPERVISOR_TOKEN` for Home Assistant Core API access. It does not require a long-lived access token.

## OTA Flow

1. Open a device from the topology tree.
2. Choose a `.ota.bin` file.
3. Review the parsed firmware metadata and warnings.
4. Confirm flash.
5. The add-on stores the file under `/data/firmware`, starts the bridge OTA session, polls bridge status, and sends requested base64 chunks.
6. After bridge success, the add-on waits for the device to rejoin and confirms the reported firmware version when available.

Only one OTA job may be active or pending confirmation at a time.

## Bridge API Requirements

V1 uses existing bridge endpoints only:

- `GET /topology.json`
- `POST /api/ota/start`
- `GET /api/ota/status`
- `POST /api/ota/chunk`
- `POST /api/ota/abort`

No bridge firmware API additions are required for V1.
