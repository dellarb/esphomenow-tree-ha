# Workplan: Onboarding Wizard

**Status: Fully implemented.**

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Backend API | Complete | `server.py`: `/api/setup-status` (GET), `/api/integration/setup` (POST) |
| Phase 2: Frontend Wizard | Complete | `setup-page.ts`, `client.ts` types/methods, `app.ts` route + entry logic |
| Phase 3: Polish / Edge Cases | Complete | Post-restart polling, 30s integration fallback, manual entry toggle, error recovery |
| Phase 4: Remove Old Banners | Skipped | Banners retained as fallback for dismissed wizard / non-setup pages |

## Objective

Replace the patchwork of conditional banners and auto-redirects with a dedicated, guided onboarding wizard that walks a new user through the three required setup steps: (1) connect a bridge, (2) restart Home Assistant, (3) add the ESP Tree integration. The wizard should be stateless, resilient to HA restarts, and dismissible.

## Goals

1. **Guided, not guessed** — New users see clear sequential steps, not scattered banners.
2. **Stateless recovery** — After HA restart (addon goes offline), the wizard re-evaluates from scratch using live state, not localStorage.
3. **Auto-advance where possible** — Bridge discovery auto-scans; HA restart is triggered in-wizard; integration discovery is auto-triggered.
4. **Graceful exit** — Users can always dismiss the wizard and go to the topology page, even mid-setup.
5. **Once and done** — When all three steps are complete, the wizard auto-redirects to the topology map and never appears again.

## Current State

- `app.ts` has four conditional banners: addon disconnected, restart required, integration not loaded, no bridge configured.
- When no bridge is configured and the user is on the topology page, they get auto-redirected to `#/settings?autoInit`.
- Settings page (`settings.ts`, ~1150 lines) mixes bridge discovery, bridge management, and system config into one page.
- There is no dedicated onboarding flow — the user is expected to figure it out from banner text.

## Process Flow

```
User opens addon
       │
       ▼
┌──────────────────┐
│ State Check       │
│ bridge configured?│
│ integration loaded│
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
  All ok   One or more missing
    │         │
    ▼         ▼
  #/       #/setup
 (topology)  │
             ▼
     ┌───────────────┐
     │ Step 1: Bridge │◄──────────────────────┐
     │ (auto-scan)    │                        │
     └───────┬───────┘                        │
             │ bridge connected                │
             ▼                                 │
     ┌───────────────┐                          │
     │ Step 2:       │                          │
     │ Restart HA    │                          │
     └───────┬───────┘                          │
             │ HA restarted, addon back online  │
             ▼                                 │
     ┌───────────────┐                          │
     │ Step 3:        │                          │
     │ Add Integration│                          │
     └───────┬───────┘                          │
             │ integration loaded               │
             ▼                                 │
     ┌───────────────┐                          │
     │ ✅ All done    │                          │
     │ → redirect #/ │                          │
     └───────────────┘                          │
                                              │
     User clicks ✕ dismiss ──────────────────┘
     (goes to #/, wizard won't auto-show
      but banners can still appear for
      incomplete steps)
```

### Reactivation Condition

The wizard auto-shows only when the user lands on the app and **at least one step is incomplete**. Specifically:

- `bridgeConfigured === false` → show wizard
- `integrationLoaded === false` and `integrationConfigured === false` → show wizard
- `restartRequired === true` → show wizard

When the user dismisses the wizard via the ✕ button, they go to the topology page. Banners still appear for incomplete steps. If they navigate away and come back (full page reload), the state-check re-runs and the wizard auto-shows again if steps are incomplete.

### Recovery After HA Restart

When the user clicks "Restart Home Assistant" in step 2:

1. `POST /api/restart` is called (already exists on server).
2. The addon (running inside HA) goes offline along with HA.
3. The browser loses connection — show a "Waiting for Home Assistant to come back online..." state with a polling spinner.
4. Poll `GET /api/setup-status` every 3 seconds.
5. When the addon responds again, HA is back. Re-evaluate state:
   - Bridge still configured? → step 1 stays complete.
   - No restart required? → step 2 complete.
   - Integration loaded? → step 3 auto-advances.
6. No localStorage needed. State is derived from live API responses each time.

## User Experience

### Route: `#/setup`

A new Lit component `<esp-setup-wizard>` renders as a full-page vertical stepper. All three steps are always visible. Only the **current active step** is expanded; completed steps collapse to a summary line with a checkmark.

### Header

```
ESP-Tree Setup
Connect your ESP-NOW LR bridge and get started.

[✕ Close and go to topology]
```

The ✕ button is always visible. Clicking it navigates to `#/` regardless of completion state.

### Step 1: Connect Your Bridge

**States:**

| State | Visual |
|-------|--------|
| Active / scanning | Spinner + "Scanning for bridges on your network..." |
| Bridges found | List of discovered bridges as cards: hostname, IP, network ID. Each card has a "Connect" button. |
| API key required | After clicking Connect, an input field appears for the bridge API key (if the bridge requires one). |
| Manual entry | Collapsible "Enter bridge address manually" section with host, port, and optional API key fields + "Connect" button. |
| Connected | ✅ green checkmark, collapsed: "Bridge connected — _hostname_ (_ip_)" |
| Error | Red error text below the connect button, with a "Retry" action. |

Step 1 auto-advances to step 2 when `bridgeConfigured` becomes `true`.

### Step 2: Restart Home Assistant

**States:**

| State | Visual |
|-------|--------|
| Disabled (step 1 incomplete) | Greyed out, step number + "Restart Home Assistant" with lock icon |
| Ready | "Home Assistant needs to restart to activate the ESP Tree integration." + "Restart Home Assistant" button (primary style) |
| Restarting | Button changes to spinner + "Restarting... this page will reconnect automatically." |
| Polling (addon offline) | "Waiting for Home Assistant to come back online..." with animated dots |
| Complete (addon back, no restart required) | ✅ green checkmark, collapsed: "Home Assistant restarted successfully" |
| Error | "Restart failed: _error message_" with "Retry" button |

The restart button calls `api.requestRestart()`. After the call, the UI enters a polling loop on `GET /api/setup-status` every 3 seconds. When the addon responds, it re-checks `restartRequired` and `bridgeConfigured` to determine current state.

### Step 3: Add ESP Tree Integration

**States:**

| State | Visual |
|-------|--------|
| Disabled (step 2 incomplete) | Greyed out, lock icon |
| Active (auto-triggering) | "Setting up the ESP Tree integration..." with spinner. The addon triggers Hass.io discovery (`POST /api/integration/setup`) and polls integration status. |
| Found | ✅ "ESP Tree integration is active" — auto-advances to Done. |
| Fallback (timeout ~30s) | "Automatic setup didn't complete. You can add it manually:" + "Open Devices & Services" button (deep link to `/config/integrations/dashboard`) + "Add ESP Tree Integration" button (deep link to `/config/integrations/dashboard/add?domain=esp_tree`). |
| Error | "Could not set up integration automatically" with manual fallback buttons. |

### Done State

All three steps collapsed with green checkmarks. A brief "Setup complete!" message. Auto-redirect to `#/` (topology map) after 2 seconds.

### Dismiss Behavior

The ✕ button navigates to `#/` immediately. No confirmation dialog. The wizard will reappear on next page load if setup is still incomplete (stateless re-evaluation). However, a sessionStorage flag (`esp_tree_setup_dismissed`) prevents the auto-redirect from hitting `#/setup` again during the **same browser session**. On a new session (new tab, refresh), the flag is cleared and the wizard shows again if steps are incomplete.

This gives the user a one-session reprieve — they can dismiss the wizard and browse topology, but it'll come back next time they open the addon if setup isn't finished.

---

## Phases

### Phase 1: Backend API Additions

Add two endpoints to `server.py` that the wizard needs beyond what already exists.

#### Task 1.1: Add `POST /api/integration/setup` endpoint

Triggers the Hass.io discovery flow for the ESP Tree integration. This re-announces the addon to the supervisor and attempts to create the config entry.

```python
@app.post("/api/integration/setup")
async def integration_setup() -> dict[str, Any]:
    # 1. Ensure integration files are installed (call existing install function)
    # 2. Write integration_config.json and .addon_config.json (via discover_helper)
    # 3. POST to supervisor/discovery to announce the addon
    # 4. Check if config entry now exists via HA WebSocket
    # 5. Return { success: bool, entry_created: bool, restart_required: bool }
```

This consolidates what `integration_autoconfigure_loop()` does on startup into an on-demand call.

#### Task 1.2: Add `GET /api/setup-status` endpoint

Returns a unified status object for all three wizard steps in one call. Reduces wizard startup to a single API call.

```python
@app.get("/api/setup-status")
async def setup_status() -> dict[str, Any]:
    return {
        "bridge": {
            "configured": bool,       # from existing active_bridge logic
            "connected": bool,        # from bridge client state
            "hostname": str | None,
            "ip": str | None,
        },
        "restart": {
            "required": bool,         # .restart_required.json exists
        },
        "integration": {
            "loaded": bool,           # from integration_status()
            "configured": bool,       # config entry exists
            "version": str | None,
        },
    }
```

### Phase 2: Frontend Wizard Component

Create the `<esp-setup-wizard>` Lit component and wire it into the app shell.

#### Task 2.1: Create `ui/src/pages/setup-page.ts`

New file. Contains the `<esp-setup-wizard>` custom element with:

- Three-step vertical stepper UI
- Step state management (`disabled`, `active`, `complete`, `error`)
- Auto-scan on mount for bridge discovery
- Bridge connection flow (select discovered or manual entry)
- Restart button calling `api.requestRestart()`
- Post-restart polling loop
- Integration setup flow calling `/api/integration/setup`
- ✕ dismiss button
- Auto-redirect on completion

Component properties:

```typescript
@state() private step1Status: 'disabled' | 'scanning' | 'found' | 'connecting' | 'complete' | 'error' = 'scanning';
@state() private step2Status: 'disabled' | 'ready' | 'restarting' | 'polling' | 'complete' | 'error' = 'disabled';
@state() private step3Status: 'disabled' | 'triggering' | 'complete' | 'fallback' | 'error' = 'disabled';
@state() private discoveredBridges: DiscoveredBridge[] = [];
@state() private bridgeError: string | null = null;
@state() private manualMode = false;
@state() private restartError: string | null = null;
@state() private integrationError: string | null = null;
@state() private pollingInterval: number | null = null;
```

#### Task 2.2: Add API methods to `ui/src/api/client.ts`

Add to the `api` object:

```typescript
setupStatus: () => request<SetupStatus>('/api/setup-status'),
integrationSetup: () => request<IntegrationSetupResult>('/api/integration/setup', { method: 'POST' }),
```

Add the `SetupStatus` and `IntegrationSetupResult` interfaces.

#### Task 2.3: Add `#/setup` route to `app.ts`

Modifications to `EspnowApp`:

1. Extend `Route` type to include `{ name: 'setup' }`.
2. Add `readRoute()` handling for `hash === 'setup'`.
3. Replace the four banner conditions with a single entry-condition check:

```typescript
private needsSetup(): boolean {
  return this.bridgeConfigured === false
    || this.restartRequired
    || (this.integrationLoaded === false && !this.integrationConfigured);
}
```

4. In `render()`, when `needsSetup()` is true and route is `topology`, redirect to `#/setup` (unless `sessionStorage` has `esp_tree_setup_dismissed`).
5. Add `<esp-setup-wizard>` rendering for `route.name === 'setup'`.
6. Remove the four existing banners (no-bridge, restart-required, integration-not-loaded, addon-disconnected). Keep the "addon cannot reach bridge" banner since that's a runtime concern, not a setup step. Move it to only show on non-setup pages.

#### Task 2.4: Session dismiss flag

When the user clicks ✕ on the wizard, set `sessionStorage.setItem('esp_tree_setup_dismissed', '1')` and navigate to `#/`. In `connectedCallback()`, check this flag before auto-redirecting to setup. The flag is per-tab and clears on page close, so a fresh session starts the setup check from scratch.

### Phase 3: Polish and Edge Cases

#### Task 3.1: Post-restart reconnection UX

After calling `POST /api/restart`, the addon becomes unreachable. Handle this gracefully:

- Change step 2 status to `polling`.
- Show "Waiting for Home Assistant to come back online..." message.
- Poll `GET /api/setup-status` every 3 seconds (not just `/api/config` — using the new unified endpoint).
- On success: re-evaluate all step states from the response.
- On connection failure: keep polling (the addon is still offline).
- After 120 seconds of no response: show "Taking longer than expected. Check if Home Assistant restarted successfully." with a "Check Again" button.

#### Task 3.2: Integration setup fallback timeout

When step 3 auto-triggers `/api/integration/setup`:

- Poll `GET /api/setup-status` every 3 seconds for up to 30 seconds.
- If `integration.configured` becomes `true`, advance to Done.
- If 30 seconds pass without success, show the fallback UI with manual deep-links.

#### Task 3.3: Step 1 manual entry collapse toggle

The "Enter bridge address manually" section under step 1 is collapsed by default. Clicking it expands a card with:

- Host (text input, default empty)
- Port (number input, default 8099)
- API Key (password input, optional)
- "Connect" button

Clicking the collapse toggle again re-collapse it. Validating the host field is required; port defaults to 8099.

#### Task 3.4: Error recovery

- Bridge connection error: show the error message inline below the Connect button. A "Retry" button re-triggers discovery.
- Restart error: show the error message below the Restart button. A "Retry" button re-triggers the restart.
- Integration setup error: show the error message plus fallback manual buttons.
- All errors clear when the user starts a retry action.

### Phase 4: Remove Old Banners

#### Task 4.1: Remove setup banners from `app.ts`

Remove from `render()`:
- `restartRequired` banner
- `integrationLoaded === false && !integrationConfigured` banner
- `bridgeConfigured === false` (no-bridge) banner

Keep the `addonConnected === false` banner but only show it when the route is not `setup`. If addon is unreachable and we're on the setup page, the wizard's own connection polling handles it.

Keep the `bridgeConnected === false` banner on all pages — it's a runtime issue, not a setup one.

#### Task 4.2: Remove autoInit redirect

Remove the `_navigatedToSettingsForNoBridge` flag and the auto-redirect from topology to settings. The wizard's entry-condition logic replaces this entirely.

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Create | `ui/src/pages/setup-page.ts` | Wizard component |
| Modify | `ui/src/api/client.ts` | Add `setupStatus()`, `integrationSetup()` methods + types |
| Modify | `ui/src/app.ts` | Add `#/setup` route, entry-condition logic, remove old banners |
| Modify | `app/server.py` | Add `/api/setup-status` and `/api/integration/setup` endpoints |

## Out of Scope

- Changing the settings page (it stays as-is for re-configuration after setup is complete)
- Adding `#/setup` to the nav bar (the wizard is only accessible via auto-redirect or direct URL)
- Offline/PWA support (the addon requires network connectivity to HA)
- Multi-language / i18n
- Animations between steps (simple collapse/expand is sufficient)