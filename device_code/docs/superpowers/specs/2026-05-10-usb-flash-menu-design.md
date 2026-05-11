# USB Flash Sub-Menu — compile.sh

## Overview

Add USB serial flashing to `compile.sh` via a sub-menu that prompts for port selection, then demo selection, then flashes. CLI arguments are also supported for scripting.

## CLI Interface

```bash
./compile.sh usb <port> <demo>   # USB flash a specific demo
./compile.sh usb --list-ports    # List available serial ports only
```

- `<port>` — bare (`ttyUSB0`) or full path (`/dev/ttyUSB0`)
- `<demo>` — demo name matching a `.yml` in `demos/`

## Main Menu Change

Add `u) USB flash` to the actions list:

```
  --- Actions ---
  b)  Build selected (N)
  f)  Flash selected (N)      [OTA only]
  bf) Build + Flash selected (N)
  u)  USB flash
  c)  Clean __pycache__
```

## Sub-Menu Flow

### Step 1 — Port Selection

List available serial ports using `python -m serial.tools.list_ports`. Present as a numbered list:

```
USB Flash — Select Port
========================
  1) /dev/ttyUSB0
  2) /dev/ttyUSB1
  0) Cancel
```

Validate the port exists before proceeding.

### Step 2 — Demo Selection

Same toggle-list as main menu (multi-select UI), but only one demo may be selected for USB flash. Prompt: "Select the demo to flash (USB can only flash one at a time):"

### Step 3 — Execute

Call ESPHome upload via Docker with `--device <port>` and `--file <factory_bin>`:

```bash
docker run --rm \
    -v "${DEMOS_DIR}:/config" \
    -v "${PROJ_DIR}:/external" \
    -v "${DOCKER_CACHE_DIR}:/root/.platformio" \
    -w /external \
    "${DOCKER_IMG}" upload --device "${port}" --file "cache/builds/${demo_name}.factory.bin" "demos/${demo_name}.yml"
```

Note: USB flashing uses `.factory.bin`, not `.ota.bin` (OTA uses the latter).

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Port not found | Error message, return to sub-menu |
| No ports available | Error message, return to sub-menu |
| Build output missing | Error message, skip flash |
| Docker upload fails | Error message with exit code |

## File Changes

- `compile.sh` — add `usb_flash_port()`, `usb_flash_demo()`, `show_usb_submenu()`, and CLI handler; add `u) USB flash` to main menu
- No new files needed |

## Verification

1. `./compile.sh usb --list-ports` — prints available ports and exits
2. `./compile.sh usb /dev/ttyUSB0 espnow-bridge-c5` — flashes without interaction
3. From main menu: `u` → select port → select demo → flash completes
