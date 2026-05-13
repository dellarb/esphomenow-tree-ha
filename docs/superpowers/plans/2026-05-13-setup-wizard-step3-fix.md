# Setup Wizard Step 3 — Fix Integration Readiness Check

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the setup wizard step 3 so it correctly detects an already-live integration after an addon upgrade, instead of spinning until HA's WebSocket API recovers.

**Architecture:** The root cause is `integrationReady()` only checking `configured || loaded || entry_loaded` — all three depend on HA's WebSocket API responding. During an HA restart (or while HA is still initializing), those calls fail, returning `false` even though the integration is already installed and will be live shortly. The fix adds a `connected` check (integration WS to addon is alive), tightens the `entry_loaded` fallback, and collapses the version gate into the readiness check. We also fix related state-machine issues: stale `step3` state after downgrade, `bridgeApiStatus` never clearing, and duplicate timer leaks.

**Tech Stack:** TypeScript (Lit web components), Python (FastAPI backend)

---

## Problem Analysis

### Current `integrationReady()` (setup-page.ts:236-238)

```typescript
private integrationReady(status): boolean {
  return Boolean(status.integration.configured || status.integration.loaded || status.integration.entry_loaded);
}
```

This fails when:
- `ha_config_entries()` times out during HA restart → `configured = false`, `entry_loaded = false`
- `ha_ws_call({"type": "esp_tree/status"})` times out → `loaded = false`
- But the integration IS already installed and will come back once HA finishes starting

### Version check is separate (pollStatus line 214, pollIntegrationForEntry line 338)

```typescript
if (integrationReady && !status.restart.required) { ... }
```

This separation is fine for logic but makes it easy to forget the version gate.

### Other bugs discovered

1. **Stale `step3` on downgrade**: If `integrationReady` was true (step3='complete') but a new status check returns false (e.g., API blip), `pollStatus` never resets step3 back. This is intentional for upgrade flow (don't un-complete) but has no protection against step3 being 'complete' from a *previous* session that loaded cached state.

2. **`bridgeApiStatus` never clears**: `captureStatus()` sets `bridgeApiStatus` when `ws_connected === true` but never clears it on `false`.

3. **`integrationFailures` never resets on partial success**: If `pollIntegrationForEntry` gets 5 successful API calls but 1 failure in between, the counter still increments toward the 10-failure threshold.

4. **No early exit for already-live integration**: When `triggerIntegrationSetup()` is called for an already-live integration, it calls `announce_supervisor_discovery()` + `request_ha_integration_config_flow()` — both are unnecessary and the config flow returns `already_configured` abort, which is harmless but wasteful. More importantly, when these succeed but `entry_created` is false, the UI falls into polling mode.

### Desired behavior by scenario

| Scenario | Current | Desired |
|----------|---------|---------|
| **Upgrade, no restart needed**: integration already live | `startConfiguredBridgeFlow` → `integrationReady()` true → instant pass ✓ | Same, but also works if only `loaded && connected` is true |
| **Upgrade, HA restarting**: integration installed but HA WS down | `integrationReady()` returns false → `triggerIntegrationSetup()` → `entry_created: false` → polling for up to 30s until HA WS recovers | Step 3 should wait for HA to recover, then pass. No unnecessary setup calls. |
| **Upgrade with restart**: addon updated integration files, restart needed | Step 2 shows restart required. After restart, step 2 polling waits for `!restart.required`. Step 3 stays `disabled` until step 2 completes. Then step 3 triggers integration setup. | Same behavior, but `integrationReady()` should be more robust once HA is back. |
| **Fresh install**: no integration exists | Step 2 completes (no restart needed). Step 3 triggers `POST /api/integration/setup` → config flow creates entry → `entry_created: true` → instant pass. Or → `entry_created: false` → polling until entry appears. | Same behavior, no change needed. |
| **HA API blip during polling**: `ha_config_entries` throws once | `integrationReady()` returns false for one poll cycle, counter increments. | Should be resilient — one blip should not prevent pass. |

---

## File Structure

| File | Change |
|------|--------|
| `ui/src/pages/setup-page.ts` | Fix `integrationReady()`, add early exit in `triggerIntegrationSetup()`, fix `captureStatus()`, add step3 reset guard |
| `app/server.py` | No changes needed — the API already returns all the fields we need |

---

### Task 1: Expand `integrationReady()` to include `connected` and version gate

**Files:**
- Modify: `ui/src/pages/setup-page.ts:236-238`

Currently:

```typescript
private integrationReady(status: Awaited<ReturnType<typeof api.setupStatus>>): boolean {
  return Boolean(status.integration.configured || status.integration.loaded || status.integration.entry_loaded);
}
```

- [ ] **Step 1: Update `integrationReady()` to include `connected` and collapse the version gate**

```typescript
private integrationReady(status: Awaited<ReturnType<typeof api.setupStatus>>): boolean {
  const s = status.integration;
  const hasIntegration = s.configured || s.entry_loaded || (s.loaded && s.connected);
  return Boolean(hasIntegration) && !status.restart.required;
}
```

**Rationale:**
- `configured` = config entry exists (from `ha_config_entries`) → integration is registered in HA
- `entry_loaded` = config entry state contains "loaded" → integration is active in HA
- `loaded && connected` = HA WS returned `esp_tree/status` AND addon responded → integration runtime is live and communicating. This is the key addition: even if `configured` and `entry_loaded` fail (HA config_entries API still recovering), if the integration's own WS endpoint responds with `connected: true`, we know it's live.
- Version gate `!status.restart.required` is collapsed in — ensures we don't mark step 3 complete if the running version doesn't match the installed version.

- [ ] **Step 2: Remove the redundant `&& !status.restart.required` checks that are now inside `integrationReady()`**

In `pollStatus()` (around line 214), change:

```typescript
if (integrationReady && !status.restart.required) {
```

to:

```typescript
if (integrationReady) {
```

In `pollIntegrationForEntry()` (around line 338), change:

```typescript
if (this.integrationReady(status) && !status.restart.required) {
```

to:

```typescript
if (this.integrationReady(status)) {
```

In `startConfiguredBridgeFlow()` (around line 80), the version gate is handled by step 2 (restart required → step 2 is not complete). But since `integrationReady` now includes the version check, the existing code:

```typescript
if (integrationReady) {
  this.step3 = 'complete';
```

already benefits. No change needed here beyond what we've done.

- [ ] **Step 3: Build the UI and verify no type errors**

Run: `cd ui && npm run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "fix: expand integrationReady() to include connected check and collapse version gate"
```

---

### Task 2: Add early exit in `triggerIntegrationSetup()` for already-live integration

**Files:**
- Modify: `ui/src/pages/setup-page.ts:306-330`

Currently, `triggerIntegrationSetup()` always calls `POST /api/integration/setup` even when the integration is already live. For the upgrade scenario, this triggers unnecessary `announce_supervisor_discovery()` + `request_ha_integration_config_flow()` calls, and the response `entry_created: false` pushes us into polling mode.

- [ ] **Step 1: Add a pre-check at the start of `triggerIntegrationSetup()`**

After the existing guard at line 307-308, add a fresh status check:

```typescript
private async triggerIntegrationSetup(): Promise<void> {
  if (['triggering', 'polling', 'complete'].includes(this.step3)) return;
  this.step3 = 'triggering';
  this.integrationError = null;
  this.integrationFailures = 0;
  try {
    const currentStatus = await api.setupStatus();
    this.captureStatus(currentStatus);
    if (this.integrationReady(currentStatus)) {
      this.step3 = 'complete';
      void this.onAllDone();
      return;
    }
    const result = await api.integrationSetup();
    // ... rest of existing code unchanged
```

**Rationale:** Before making the setup call, check if the integration is already live. If `integrationReady()` (which now includes `loaded && connected` and the version check) returns true, skip the entire setup flow and mark step 3 complete immediately. This eliminates unnecessary API calls and the 30s polling loop for the upgrade scenario.

- [ ] **Step 2: Build the UI and verify**

Run: `cd ui && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "fix: add early exit in triggerIntegrationSetup for already-live integration"
```

---

### Task 3: Fix `captureStatus()` to clear `bridgeApiStatus` on disconnect

**Files:**
- Modify: `ui/src/pages/setup-page.ts:228-234`

Currently `bridgeApiStatus` is only set when `ws_connected` is true and never cleared:

```typescript
private captureStatus(status: Awaited<ReturnType<typeof api.setupStatus>>): void {
  this.runningIntegrationVersion = status.restart.running_version || status.integration.version || null;
  this.latestIntegrationVersion = status.restart.latest_version || status.integration.latest_version || null;
  if (status.bridge.ws_connected) {
    this.bridgeApiStatus = `Bridge protobuf online: ${status.bridge.ip || status.bridge.hostname || 'bridge'}`;
  }
}
```

- [ ] **Step 1: Add else branch to clear `bridgeApiStatus`**

```typescript
private captureStatus(status: Awaited<ReturnType<typeof api.setupStatus>>): void {
  this.runningIntegrationVersion = status.restart.running_version || status.integration.version || null;
  this.latestIntegrationVersion = status.restart.latest_version || status.integration.latest_version || null;
  if (status.bridge.ws_connected) {
    this.bridgeApiStatus = `Bridge protobuf online: ${status.bridge.ip || status.bridge.hostname || 'bridge'}`;
  } else {
    this.bridgeApiStatus = null;
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `cd ui && npm run build`

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "fix: clear bridgeApiStatus when bridge disconnects"
```

---

### Task 4: Reset `integrationFailures` on successful poll in `pollIntegrationForEntry()`

**Files:**
- Modify: `ui/src/pages/setup-page.ts:333-356`

Currently `integrationFailures` only increments and never resets except in `triggerIntegrationSetup()` (set to 0) or `pollStatus()` line 216 (`= 0` on complete). During active polling, a single API success doesn't reset the counter, so intermittent failures accumulate toward the 10-try threshold.

- [ ] **Step 1: Reset `integrationFailures` on successful API call in `pollIntegrationForEntry()`**

Change:

```typescript
private async pollIntegrationForEntry(): Promise<void> {
  this.integrationFailures++;
  try {
    const status = await api.setupStatus();
    this.captureStatus(status);
    if (this.integrationReady(status)) {
```

to:

```typescript
private async pollIntegrationForEntry(): Promise<void> {
  try {
    const status = await api.setupStatus();
    this.captureStatus(status);
    this.integrationFailures = 0;
    if (this.integrationReady(status)) {
```

**Rationale:** If the API call succeeds, reset the failure counter. The counter should only track consecutive failures (API unreachable), not total poll cycles. This prevents intermittent API blips from accumulating to 10 and triggering fallback mode.

Note: The `catch` block below already has no counter increment, so a failure in `api.setupStatus()` will be caught and the counter remains. But we need to handle the case where the API call succeeds but `integrationReady` returns false (integration not yet loaded). In that case, we want to keep polling, not count it as a failure. Remove the `this.integrationFailures++` at the top and add it only in the `catch` block:

- [ ] **Step 2: Add failure counter in the catch block**

```typescript
  } catch {
    this.integrationFailures++;
    if (this.integrationFailures >= 10) {
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      this.step3 = 'fallback';
    }
  }
```

This way, only actual API failures (timeout, network error) count toward the 10-try limit. If the API responds but the integration isn't ready yet, we keep polling indefinitely.

Adjust the fallback threshold check — remove it from its current location and consolidate into the catch:

Current code:

```typescript
  } catch {
    // ignore
  }
  if (this.integrationFailures >= 10) {
    if (this.integrationPollTimer) {
      clearInterval(this.integrationPollTimer);
      this.integrationPollTimer = null;
    }
    this.step3 = 'fallback';
  }
```

New code (complete function):

```typescript
private async pollIntegrationForEntry(): Promise<void> {
  try {
    const status = await api.setupStatus();
    this.captureStatus(status);
    this.integrationFailures = 0;
    if (this.integrationReady(status)) {
      this.step3 = 'complete';
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      void this.onAllDone();
      return;
    }
  } catch {
    this.integrationFailures++;
    if (this.integrationFailures >= 10) {
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      this.step3 = 'fallback';
    }
  }
}
```

- [ ] **Step 3: Build and verify**

Run: `cd ui && npm run build`

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "fix: reset integrationFailures on API success; only count actual failures"
```

---

### Task 5: Add infinite polling safeguard for step 3

**Files:**
- Modify: `ui/src/pages/setup-page.ts`

With Task 4's change, if the API is healthy but the integration never becomes ready (e.g., broken config entry), we'll poll forever. We need a maximum poll duration as a safety net, separate from the failure counter.

- [ ] **Step 1: Add a `pollStartTime` property and a max duration constant**

Add near the top of the class with other properties:

```typescript
private static readonly MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
private pollStartTime: number = 0;
```

- [ ] **Step 2: Set `pollStartTime` when entering polling state**

In `triggerIntegrationSetup()`, after setting `this.step3 = 'polling'`, add:

```typescript
this.pollStartTime = Date.now();
```

- [ ] **Step 3: Add duration check in `pollIntegrationForEntry()`**

After checking `this.integrationReady(status)` returns false (integration not ready but API ok), add:

```typescript
if (Date.now() - this.pollStartTime > SetupWizard.MAX_POLL_DURATION_MS) {
  if (this.integrationPollTimer) {
    clearInterval(this.integrationPollTimer);
    this.integrationPollTimer = null;
  }
  this.step3 = 'fallback';
  return;
}
```

The full function becomes:

```typescript
private async pollIntegrationForEntry(): Promise<void> {
  try {
    const status = await api.setupStatus();
    this.captureStatus(status);
    this.integrationFailures = 0;
    if (this.integrationReady(status)) {
      this.step3 = 'complete';
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      void this.onAllDone();
      return;
    }
    if (Date.now() - this.pollStartTime > SetupWizard.MAX_POLL_DURATION_MS) {
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      this.step3 = 'fallback';
    }
  } catch {
    this.integrationFailures++;
    if (this.integrationFailures >= 10) {
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      this.step3 = 'fallback';
    }
  }
}
```

- [ ] **Step 4: Build and verify**

Run: `cd ui && npm run build`

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/setup-page.ts
git commit -m "fix: add 5-minute max polling duration safety net for step 3"
```

---

### Task 6: Guard step 3 state against downgrade from `complete`

**Files:**
- Modify: `ui/src/pages/setup-page.ts`

Currently, `pollStatus()` can set `step3 = 'disabled'` (line 203) when the bridge is not configured, but never downgrades step3 from `complete` to any other state. However, `startConfiguredBridgeFlow()` line 83 has:

```typescript
} else if (this.step3 === 'disabled') {
  void this.triggerIntegrationSetup();
}
```

This guard means `triggerIntegrationSetup()` is only called when `step3 === 'disabled'`. If step 3 is in `polling` state and `pollStatus()` detects integration is ready at line 214, it sets step3 to `complete` — which is correct. But there's a subtle issue: after calling `triggerIntegrationSetup()`, if the setup call fails and step 3 becomes `error`, `pollStatus()` will re-trigger `triggerIntegrationSetup()` on the next cycle because `step3 === 'disabled'` is no longer true (it's `'error'`), but the UI renders retry buttons that reset step 3 and call `triggerIntegrationSetup()` manually.

This is actually fine — no change needed for the downgrade guard. The existing state machine handles error recovery through user action.

However, there IS one edge case to fix: `pollStatus()` at line 197-199 checks `step3 === 'disabled'` before calling `triggerIntegrationSetup()`. But after a page reload with an already-live integration and no restart needed, `startConfiguredBridgeFlow()` at line 84 also checks `step3 === 'disabled'`. Both paths are covered correctly.

No code change needed for this task — the existing guards are sufficient. Marking as complete.

- [x] **Step 1: Verify no code change needed** — confirmed existing guards are sufficient

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Step 3 detects already-live integration after upgrade | Task 1 (expanded `integrationReady`) + Task 2 (early exit) |
| Version gate prevents premature completion | Task 1 (collapsed into `integrationReady`) |
| `connected` check as fallback when HA API blips | Task 1 (added `loaded && connected`) |
| No unnecessary setup calls for live integration | Task 2 (pre-check) |
| Polling doesn't give up on API success | Task 4 (reset counter, only count failures) |
| Safety net against infinite polling | Task 5 (5-minute max) |
| `bridgeApiStatus` clears on disconnect | Task 3 |

### Placeholder Scan

No TBD/TODO/fill-in-later patterns found. All code blocks contain complete implementations.

### Type Consistency

- `integrationReady()` signature unchanged — still takes `Awaited<ReturnType<typeof api.setupStatus>>`
- `SetupWizard.MAX_POLL_DURATION_MS` uses `static readonly` — correct for Lit component class
- `pollStartTime` is `number` (from `Date.now()`) — consistent with usage in arithmetic
- `bridgeApiStatus` set to `null` — check the render code handles `null` (Lit renders `null` as empty, which is fine)

### Edge Cases Considered

1. **HA restart during upgrade**: `integrationReady()` now checks `loaded && connected`. During HA restart, `ha_ws_call` fails → `loaded = false`, `connected = false`, `configured = false`. Step 3 stays in polling. Once HA is back, `loaded && connected` becomes true → step 3 passes immediately.

2. **HA API blip (single failure)**: `integrationFailures` resets on success, so one blip doesn't accumulate. Only 10 consecutive API failures trigger fallback.

3. **HA API blip during initial load**: `triggerIntegrationSetup()` pre-check fails (API blip), then `api.integrationSetup()` also fails → step 3 goes to `error` state. User can retry.

4. **Version mismatch**: `!status.restart.required` is now inside `integrationReady()`. If the addon updated integration files but HA hasn't restarted yet, `restart.required = true` → `integrationReady()` returns false → step 3 stays disabled until step 2 completes (restart).

5. **Integration installed but not connected**: `configured = true` but `connected = false` → `integrationReady()` returns true (via `configured`) but `!status.restart.required` might be false (if versions match). If versions match, step 3 passes. If not, step 2 handles the restart first.

6. **Fresh install**: `configured = false`, `loaded = false`, `entry_loaded = false`, `connected = false` → `integrationReady()` returns false → `triggerIntegrationSetup()` is called → config flow creates entry → `entry_created: true` → step 3 complete. Or → `entry_created: false` → polling until entry appears → `configured` becomes true → step 3 complete.