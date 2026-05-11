# USB Flash Sub-Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add USB serial flashing to `compile.sh` via an interactive sub-menu and CLI arguments.

**Architecture:** USB flash is implemented as a new action branch from the main menu, leading to a 2-step sub-menu (port selection then demo selection), and as CLI arguments `usb <port> <demo>`. All flashing uses ESPHome upload via Docker with `--device <port>`.

**Tech Stack:** Bash, `python -m serial.tools.list_ports`, ESPHome Docker upload

---

### Task 1: Add `--list-ports` CLI handler

**Files:**
- Modify: `compile.sh:346-373` (CLI argument handling section)

- [ ] **Step 1: Add `usb --list-ports` case**

In the `if [ $# -gt 0 ]` CLI handling block, add before the existing `*)` case:

```bash
            --list-ports)
                python -m serial.tools.list_ports
                exit 0
                ;;
            usb)
                shift
                if [ $# -lt 2 ]; then
                    echo "Usage: compile.sh usb <port> <demo>"
                    echo "  port: /dev/ttyUSB0 or ttyUSB0"
                    echo "  demo: e.g. espnow-bridge-c5"
                    exit 1
                fi
                ;;
```

- [ ] **Step 2: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): add --list-ports CLI arg for USB flash"
```

---

### Task 2: Implement `list_usb_ports()` function

**Files:**
- Modify: `compile.sh` — add new function after `yaml_hostname()` (~line 170)

- [ ] **Step 1: Add `list_usb_ports()` function**

Insert after `yaml_hostname()` (line 170):

```bash
list_usb_ports() {
    python -m serial.tools.list_ports 2>/dev/null
}
```

- [ ] **Step 2: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): add list_usb_ports helper function"
```

---

### Task 3: Implement `usb_flash_demo()` function

**Files:**
- Modify: `compile.sh` — add new function after `flash_ota()` (~line 213)

- [ ] **Step 1: Add `usb_flash_demo()` function**

Insert after `flash_ota()` (after line 213):

```bash
usb_flash_demo() {
    local port="$1"
    local demo_name="$2"
    local yml_file="${DEMOS_DIR}/${demo_name}.yml"

    local factory_bin="${CACHE_DIR}/${demo_name}.bin"
    if [ ! -f "${factory_bin}" ]; then
        echo "ERROR: No cached firmware found: ${factory_bin}"
        return 1
    fi

    local port_dev="${port}"
    if [[ "$port" != /* ]]; then
        port_dev="/dev/${port}"
    fi
    if [ ! -c "${port_dev}" ]; then
        echo "ERROR: Port ${port_dev} does not exist or is not a character device"
        return 1
    fi

    echo ""
    echo "==> USB flashing ${demo_name} to ${port_dev}..."
    echo ""

    docker run --rm \
        -v "${DEMOS_DIR}:/config" \
        -v "${PROJ_DIR}:/external" \
        -v "${DOCKER_CACHE_DIR}:/root/.platformio" \
        -w /external \
        "${DOCKER_IMG}" upload --device "${port_dev}" --file "cache/builds/${demo_name}.bin" "demos/${demo_name}.yml"

    local status=$?
    if [ ${status} -eq 0 ]; then
        echo ""
        echo "==> USB flash complete!"
    else
        echo "ERROR: Docker upload failed with status ${status}"
        return 1
    fi
}
```

- [ ] **Step 2: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): add usb_flash_demo function"
```

---

### Task 4: Implement `show_usb_submenu()` — port selection

**Files:**
- Modify: `compile.sh` — add new function after `show_menu()` (~line 284)

- [ ] **Step 1: Add `show_usb_port_menu()` function**

Insert after `show_menu()`:

```bash
show_usb_port_menu() {
    echo ""
    echo "================================================"
    echo "  USB Flash — Select Port"
    echo "================================================"
    echo ""

    local ports
    ports=$(list_usb_ports)
    if [ -z "${ports}" ]; then
        echo "No serial ports found."
        return 1
    fi

    local port_array
    local count=0
    while IFS= read -r line; do
        port_array+=("$line")
        echo "  $((count+1))) $line"
        ((count++))
    done <<< "${ports}"

    echo ""
    echo "  0) Cancel"
    echo ""

    read -rp "Select port: " CHOICE

    if [[ "${CHOICE}" == "0" ]]; then
        return 1
    fi

    if ! [[ "${CHOICE}" =~ ^[0-9]+$ ]] || [ "${CHOICE}" -lt 1 ] || [ "${CHOICE}" -gt ${count} ]; then
        echo "Invalid selection: ${CHOICE}"
        return 1
    fi

    USB_PORT="${port_array[$((CHOICE-1))]}"
    return 0
}
```

- [ ] **Step 2: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): add show_usb_port_menu function"
```

---

### Task 5: Implement `show_usb_demo_menu()` — demo selection

**Files:**
- Modify: `compile.sh` — add new function after `show_usb_port_menu()`

- [ ] **Step 1: Add `show_usb_demo_menu()` function**

Insert after `show_usb_port_menu()`:

```bash
show_usb_demo_menu() {
    local port="$1"
    echo ""
    echo "================================================"
    echo "  USB Flash — Select Demo"
    echo "================================================"
    echo ""
    echo "  Target port: ${port}"
    echo ""
    echo "  Select the demo to flash (USB can only flash one at a time):"
    echo ""

    for i in "${!YML_FILES[@]}"; do
        local check=" "
        [ "${SELECTED[$i]}" -eq 1 ] && check="*"
        printf "  %d) [%s] %-25s\n" $((i+1)) "$check" "$(build_name "${YML_FILES[$i]}")"
    done
    echo ""
    echo "  0) Cancel"
    echo ""

    read -rp "Select demo: " CHOICE

    if [[ "${CHOICE}" == "0" ]]; then
        return 1
    fi

    if ! [[ "${CHOICE}" =~ ^[0-9]+$ ]] || [ "${CHOICE}" -lt 1 ] || [ "${CHOICE}" -gt ${NUM_DEMOS} ]; then
        echo "Invalid selection: ${CHOICE}"
        return 1
    fi

    USB_DEMO="$(build_name "${YML_FILES[$((CHOICE-1))]}")"
    return 0
}
```

- [ ] **Step 2: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): add show_usb_demo_menu function"
```

---

### Task 6: Implement `run_usb_flash()` — orchestrates sub-menu

**Files:**
- Modify: `compile.sh` — add new function after `show_usb_demo_menu()`

- [ ] **Step 1: Add `run_usb_flash()` function**

Insert after `show_usb_demo_menu()`:

```bash
run_usb_flash() {
    local port="$1"
    local demo="$2"

    if [ -n "${port}" ] && [ -n "${demo}" ]; then
        usb_flash_demo "${port}" "${demo}"
        return $?
    fi

    if ! show_usb_port_menu; then
        return 0
    fi

    if ! show_usb_demo_menu "${USB_PORT}"; then
        return 0
    fi

    usb_flash_demo "${USB_PORT}" "${USB_DEMO}"
}
```

- [ ] **Step 2: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): add run_usb_flash orchestration function"
```

---

### Task 7: Wire USB into CLI args and main menu

**Files:**
- Modify: `compile.sh:346-373` (CLI argument handling)
- Modify: `compile.sh:275-284` (main menu actions list)
- Modify: `compile.sh:378-394` (main menu loop case)

- [ ] **Step 1: Update CLI handler**

Replace the `usb)` stub from Task 1 with:

```bash
            usb)
                shift
                if [ $# -lt 2 ]; then
                    echo "Usage: compile.sh usb <port> <demo>"
                    echo "  port: /dev/ttyUSB0 or ttyUSB0"
                    echo "  demo: e.g. espnow-bridge-c5"
                    exit 1
                fi
                _usb_port="$1"
                _usb_demo="$2"
                shift 2
                run_usb_flash "${_usb_port}" "${_usb_demo}"
                exit $?
                ;;
```

- [ ] **Step 2: Add `u) USB flash` to main menu actions list**

In `show_menu()`, after the `bf` line (line 278):

```bash
    echo "  u)  USB flash"
```

- [ ] **Step 3: Handle `u` in main menu loop**

In the `while` case statement (around line 382), add `u)` before the `*)` catch-all:

```bash
        u)
            run_usb_flash
            ;;
```

- [ ] **Step 4: Commit**

```bash
git add compile.sh
git commit -m "feat(compile.sh): wire USB flash into main menu and CLI"
```

---

### Task 8: Verify

- [ ] **Step 1: Verify ports listing**

Run: `./compile.sh usb --list-ports`
Expected: Lists available `/dev/ttyUSB*` ports or "No serial ports found"

- [ ] **Step 2: Verify CLI flash usage message**

Run: `./compile.sh usb`
Expected: Prints usage and exits 1

- [ ] **Step 3: Verify menu shows `u) USB flash`**

Run: `./compile.sh` and check the menu displays `u) USB flash`

- [ ] **Step 4: Commit all**

```bash
git add compile.sh
git commit -m "feat(compile.sh): wire USB flash into main menu and CLI"
```
