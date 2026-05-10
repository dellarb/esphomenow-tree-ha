# Addon API Authentication Design

**Date:** 2026-05-10
**Status:** Approved

## Overview

Secure the addon's REST API (`/api/*`) so that direct IP access requires a token, while access through Home Assistant's ingress proxy (the normal user path) remains seamless. The existing `integration_token` is reused to avoid generating new secrets.

## Problem

All 74 REST endpoints (`/api/*`) on the addon's port (8099) are currently open with no authentication. While the addon runs behind `ingress: true` in Home Assistant Supervisor, the container has `host_network: true` and binds to `0.0.0.0:8099`, meaning anyone on the LAN who knows the IP can call all endpoints: restart HA, manage bridges, trigger OTA, etc.

## Design Decision: Block All Non-Ingress Traffic

The addon's REST API (`/api/*`) is only intended to be accessed through Home Assistant's ingress proxy. The simplest, most secure approach: **reject any request that doesn't have the `X-Ingress-Path` header**.

No tokens, no query params, no UI changes. Middleware checks for the header. If absent → 401.

Rationale: Since the addon is only meant to be used via HA's sidebar/ingress, and never directly, we can simply drop all direct access. This is simpler than token-based auth and covers the threat model (LAN-based curiosity/misuse).

## Components

### 1. Ingress Header Middleware

**File:** `esp-tree-ha/app/server.py`

Add a middleware decorator or FastAPI dependency that checks for `X-Ingress-Path` header on all `/api/*` routes. If missing, return `401 Unauthorized`.

```python
@app.middleware("http")
async def require_ingress(request: Request, call_next):
    if request.url.path.startswith("/api/") and not request.headers.get("x-ingress-path"):
        return JSONResponse({"error": "direct API access not allowed"}, status_code=401)
    return await call_next(request)
```

**Exceptions (always allowed):**
- `GET /api/health` — health checks from supervisor
- `GET /` — UI root (also serves HTML with ingress path meta tag)
- `GET /{path:path}` — static assets if any
- WebSocket endpoints (already have their own auth)

### 2. No Token Needed

Since all `/api/*` traffic must come through ingress, and ingress always sets `X-Ingress-Path`, no additional token or secret is needed. The existing `integration_token` (for WebSocket auth) is unaffected.

### 3. No UI Changes

The UI (`client.ts`) makes the same API calls. HA's ingress proxy sets `X-Ingress-Path` automatically. No token injection needed in `client.ts`.

## Data Flow

```
Normal path (via HA UI):
  Browser → HA proxy (sets X-Ingress-Path) → addon /api/...
  Middleware sees header → allows through

Direct access attempt (bypassing HA):
  Browser → addon directly at IP:8099/api/...
  Middleware sees NO X-Ingress-Path header → 401 Unauthorized
```

## Files Changed

| File | Change |
|------|--------|
| `esp-tree-ha/app/server.py` | Add `require_ingress` middleware, apply to all `/api/*` routes |
| `AGENTS.md` | Document the auth scheme |

## No Changes Needed

- No token generation
- No config file changes
- No UI code changes
- No Home Assistant configuration
- No integration code changes

## Verification

1. Direct IP access (no X-Ingress-Path header) → 401 Unauthorized
2. Ingress access (X-Ingress-Path header present) → succeeds
3. Health endpoint `/api/health` → always allowed

## Effort Estimate

| Component | Lines |
|-----------|-------|
| Ingress middleware | ~10 |
| Exception paths | ~3 |
| **Total** | **~13** |

Trivial — one middleware function.