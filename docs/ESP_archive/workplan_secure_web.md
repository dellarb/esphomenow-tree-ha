# Secure Web Interface: Strategy & Implementation Workplan

**Goal:** Lock down `/topology`, `/topology.json`, `/ota`, and `/api/ota/*` endpoints so they require authentication, with a seamless "visit" flow via MQTT that delivers a rotating auth token URL.

---

## Status

| Component | Status |
|-----------|--------|
| Strategy & architecture | Done |
| Auth token mechanics | Pending |
| `/auth` endpoint + cookie | Pending |
| Auth middleware | Pending |
| Protected handlers | Pending |
| MQTT auth URL publisher | Pending |
| HA device `cu` URL update | Pending |
| Token rotation timer | Pending |

---

## Architecture

```
Bridge                          Home Assistant                Browser
  │                                   │                          │
  │ [MQTT] ── auth_url=<bridge_ip>/auth?token=XXXX ──→         │
  │                                   │                          │
  │                                   │ ←── user clicks "Visit" ──┤
  │ ←──── browser requests /auth?token=XXXX ─────────────────── │
  │     (validates token, sets httpOnly cookie)                 │
  │ ←──── redirect to /topology (cookie set) ────────────────── │
  │                                   │                          │
  │ ←──── /topology (with auth cookie) ──────────────────────────┤
  │     (topology page loads)                                    │
  │ ←──── /ota (with auth cookie) ──────────────────────────────── │
  │     (ota page loads)                                         │
  │                                                           │
  │ [MQTT periodic] ── new auth_url every 1hr ──────────────────→│
```

**Flow summary:**
1. Bridge generates a cryptographically random token and publishes it via MQTT
2. User clicks "Visit" button in HA (points to `/auth?token=XXXX`)
3. Bridge validates token, sets an `httpOnly` cookie, redirects to protected page
4. Browser stores cookie; subsequent requests include it automatically
5. Every 1 hour a new token is published via MQTT; old one expires

---

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Unauthenticated access to topology (exposes MACs, network structure) | All endpoints require valid auth cookie |
| Unauthenticated OTA (firmware push to any remote) | All `/api/ota/*` require valid auth cookie |
| Replay attacks with old tokens | Tokens expire after 1 hour; cleanup sweep in `loop()` |
| Token theft via XSS | Cookie is `httpOnly`; JS cannot read it |
| Brute-force token guessing | 128-bit entropy (32 hex chars) makes enumeration infeasible |
| No HTTPS on device | No `Secure` flag on cookie (would require TLS); risk acceptable on isolated LAN |
| HA "Visit" button bypass | HA device `cu` URL now points to `/auth?token=` instead of `/topology` directly |

---

## Scope

**In scope:**
- `/topology`, `/topology.json`
- `/ota`
- `/api/ota/start`, `/api/ota/status`, `/api/ota/abort`, `/api/ota/upload`
- `/api/factory`, `/api/wifi/scan` (same auth middleware)
- MQTT auth URL delivery mechanism
- Cookie-based session management
- Token rotation (1 hr default)

**Out of scope:**
- MAC ownership verification (bridge owns network)
- MD5 → SHA256 upgrade (keeping MD5 for broad ESP32 compatibility)
- Firmware signature verification
- HTTPS/TLS on web interface

---

## Component Design

### 1. Auth Token Manager (`auth_token.h/.cpp`)

**NEW file** — handles token lifecycle.

| Field | Type | Description |
|-------|------|-------------|
| `auth_tokens_` | `std::map<std::string, TokenEntry>` | Active tokens keyed by token string |
| `auth_token_lifetime_ms_` | `uint32_t` | Token lifetime in ms (default 3600000 = 1 hr) |
| `current_token_` | `std::string` | Most recently published token |

**TokenEntry:**
```cpp
struct TokenEntry {
  uint32_t created_ms;    // millis() when token was created
  std::string ip;        // optional: client IP for binding
};
```

**Key methods:**
```cpp
std::string generate_token_();           // generate fresh token, store it, return it
bool validate_token_(const std::string&) const;  // returns true if token exists and not expired
void cleanup_expired_tokens_();         // purge all expired tokens
```

**Token format:** 32 hex chars (128-bit) from `esp_random()`. Exhaustive search is infeasible.

---

### 2. `/auth` Endpoint

| Item | Detail |
|------|--------|
| **Path** | `GET /auth?token=<token>` |
| **Validation** | Token exists in `auth_tokens_` and not expired |
| **On success** | Set `HttpOnly; Path=/; Max-Age=3600` cookie `espnow_auth=<token>`, redirect to `/topology` |
| **On failure** | `401` with JSON `{"error":"invalid or expired token"}` |
| **Cookie flags** | `HttpOnly`, `Path=/`, `Max-Age=3600`, no `Secure` (no TLS) |

**Implementation:** New `AuthHandler` struct registered via `add_handler()`.

---

### 3. Auth Middleware

```cpp
bool check_auth_cookie_(AsyncWebServerRequest *request);
```

Shared function called at the top of every protected handler:
- Extract `espnow_auth` cookie from request
- Call `validate_token_()`
- If invalid/missing → send `401` with JSON `{"error":"auth required","login_url":"/auth"}` and return `false`
- If valid → continue to handler logic

---

### 4. Protected Handlers

| Handler | Path | On auth failure |
|---------|------|-----------------|
| `PageHandler` | `/topology` | `401` JSON + redirect hint |
| `JsonHandler` | `/topology.json` | `401` JSON |
| `OtaPageHandler` | `/ota` | `401` JSON + redirect hint |
| `OtaStartHandler` | `/api/ota/start` | `401` JSON |
| `OtaStatusHandler` | `/api/ota/status` | `401` JSON |
| `OtaAbortHandler` | `/api/ota/abort` | `401` JSON |
| `OtaUploadHandler` | `/api/ota/upload` | `401` JSON |

Each handler gets `if (!check_auth_cookie_(request)) return;` at the top.

---

### 5. MQTT Auth URL Publisher

| Item | Detail |
|------|--------|
| **MQTT topic** | `esp-tree/bridge/<bridge_mac>/auth_url` |
| **Payload format** | `{"url":"http://<bridge_ip>/auth?token=<token>","expires_in":3600}` |
| **Publish trigger** | Every `auth_token_lifetime_ms_` via `loop()` timer + on bridge boot |
| **QoS** | `1` |
| **Retained** | `true` |

**New method:**
```cpp
void publish_auth_url_();
// Called:
// - Once at setup() after WiFi + MQTT connected
// - Every auth_token_lifetime_ms_ via loop() timer
```

---

### 6. Update HA Device "Visit" URL

In `publish_bridge_diag_discovery_()` (lines ~1849, 1873):

```cpp
// Change:
device["cu"] = "http://" + ip + "/topology";
// To:
device["cu"] = "http://" + ip + "/auth?token=" + current_token_;
```

Similarly in `publish_binary_sensor()`. This makes HA's "Visit" button point directly to the auth URL so the flow is one-click.

---

### 7. Token Rotation Timer

In `ESPTreeBridge::loop()`:
- Track `last_auth_url_publish_ms_` (initialized to `millis()` at boot)
- Every `auth_token_lifetime_ms_`, generate new token + call `publish_auth_url_()`
- Also call `cleanup_expired_tokens_()` each cycle

---

## File Map

| File | Changes |
|------|---------|
| `components/esp_tree_bridge/auth_token.h` | **NEW** — token struct, key method declarations |
| `components/esp_tree_bridge/auth_token.cpp` | **NEW** — token generation, validation, cleanup, MQTT publisher stub |
| `components/esp_tree_bridge/esp_tree_bridge.h` | Add: `auth_token_lifetime_ms_`, `last_auth_url_publish_ms_`, `current_token_`, `auth_tokens_`, `publish_auth_url_()` |
| `components/esp_tree_bridge/esp_tree_bridge.cpp` | Add: includes, `publish_auth_url_()` implementation, `check_auth_cookie_()`, auth checks in all handlers, MQTT publish in `setup()` and `loop()` timer |
| `components/esp_tree_bridge/ota_web_page.h` | No changes (browser handles cookie automatically) |
| `demos/espnow-bridge-c5.yml` | No changes needed |
| `docs/workplan_secure_web.md` | This document |

---

## Staged Implementation

### Stage 1: Auth Token Core
- [ ] Create `auth_token.h` with `TokenEntry` struct and method signatures
- [ ] Create `auth_token.cpp` with `generate_token_()`, `validate_token_()`, `cleanup_expired_tokens_()`
- [ ] Add `auth_tokens_` map, `auth_token_lifetime_ms_`, `current_token_` to `esp_tree_bridge.h`
- [ ] Verify: unit test token generation returns 32 hex chars, validation rejects expired tokens

### Stage 2: `/auth` Endpoint + Cookie
- [ ] Add `AuthHandler` struct in `esp_tree_bridge.cpp` (register_web_handler_)
- [ ] On valid token: `request->send(302, ...)` with `Set-Cookie` header + `Location: /topology`
- [ ] On invalid token: `request->send(401, "application/json", ...)` with error JSON
- [ ] Add `/auth` handler registration in `register_web_handler_()`
- [ ] Verify: `curl -v "http://localhost/auth?token=<valid>"` returns 302 with cookie header

### Stage 3: Auth Middleware
- [ ] Implement `check_auth_cookie_(request)` function
- [ ] Add auth check as first line of `PageHandler::handleRequest()`
- [ ] Add auth check to `JsonHandler::handleRequest()`
- [ ] Verify: request without cookie to `/topology` returns 401

### Stage 4: Protect OTA Handlers
- [ ] Wrap `OtaPageHandler` with `check_auth_cookie_()`
- [ ] Wrap all 4 OTA API handlers (`OtaStartHandler`, `OtaStatusHandler`, `OtaAbortHandler`, `OtaUploadHandler`)
- [ ] Verify: `curl -X POST http://localhost/api/ota/start` without cookie returns 401

### Stage 5: MQTT Auth URL Publisher
- [ ] Implement `publish_auth_url_()` — generate token + publish JSON to `esp-tree/bridge/<mac>/auth_url`
- [ ] Call `publish_auth_url_()` from `setup()` after MQTT connected
- [ ] Add 1-hour timer to `loop()` that triggers `publish_auth_url_()`
- [ ] Verify: subscribe to MQTT topic, see new auth URL payload on bridge boot

### Stage 6: HA Device "Visit" URL
- [ ] In `publish_bridge_diag_discovery_()` and `publish_binary_sensor()`, update `device["cu"]` to use `/auth?token=` URL
- [ ] Verify: HA device info shows `cu` pointing to `/auth?token=` not `/topology`

### Stage 7: Token Rotation + Cleanup
- [ ] Add `last_auth_url_publish_ms_` to `loop()` timer logic
- [ ] Ensure `cleanup_expired_tokens_()` called each rotation cycle
- [ ] Verify: old token rejected after 1 hour; new token works

---

## Verification Commands

```bash
# Should return 401 without token
curl http://localhost/topology
curl http://localhost/topology.json
curl -X POST http://localhost/api/ota/start

# With valid token - should get cookie + 302 redirect
curl -v "http://localhost/auth?token=<valid_token>"

# After cookie set - topology should load
curl --cookie "espnow_auth=<token>" http://localhost/topology
curl --cookie "espnow_auth=<token>" http://localhost/topology.json

# OTA flow with cookie
curl --cookie "espnow_auth=<token>" http://localhost/ota
curl --cookie "espnow_auth=<token>" -X POST \
  "http://localhost/api/ota/start?target=XX:XX:XX:XX:XX:XX&size=123&md5=XXXX"

# MQTT check — subscribe to auth_url topic
# mosquitto_sub -t "esp-tree/bridge/+/auth_url" -v

# Expired token should be rejected
# (wait 1 hour or set lifetime to 1 second for testing)
curl --cookie "espnow_auth=<expired_token>" http://localhost/topology
```

---

## Open Questions

1. ~~**CLI bearer token path:**~~ **Resolved:** Auth middleware accepts both `espnow_auth` cookie and `Authorization: Bearer <token>` header. Cookie checked first, then Bearer header as fallback. Same rotating token works for both browser and CLI.
2. ~~**Token lifetime override:**~~ **Resolved:** Hardcoded to 1 hour. Cookie value = the rotating token itself, so token lifetime = browser session lifetime. When token rotates, old cookie dies, user clicks fresh HA link. No YAML config surface needed — can add later if required.
3. ~~**IP binding:**~~ **Resolved:** No IP binding. 128-bit token entropy is sufficient. IP changes from DHCP/WiFi roaming would cause false negatives.
