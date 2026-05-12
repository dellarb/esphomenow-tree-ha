# Addon-Bridge Deadlock Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate three interconnected deadlock paths that cause the addon→integration topology data path to silently stop, showing only the bridge.

**Architecture:** Three independent fixes addressing the integration WS shared lock (server.py), the silent queue discard in `_broadcast_binary` (bridge_v2_client.py), and synchronous SQLite calls blocking the event loop (bridge_v2_client.py + db.py).

**Tech Stack:** Python asyncio, FastAPI/Starlette WebSocket, websockets library, aiohttp, sqlite3

---

### Task 1: Separate Locks for Integration WebSocket Sender and Receiver

**Files:**
- Modify: `app/server.py:1304-1325`

**Root cause:** A single `asyncio.Lock` (`send_lock`) protects both the sender task and the receiver path in `ws_integration_pb`. When the receiver calls `handle_integration_frame()` which `await`s a bridge response (10s timeout), the sender can't push topology updates. The integration inbound queue (maxsize=256) fills up and the client gets silently discarded.

**Fix:** Use two independent locks — one for sender, one for receiver — or eliminate the receiver lock entirely.

- [ ] **Step 1: Replace single send_lock with two independent locks**

```python
# Replace the send_lock and add a receiver_lock
sender_lock = asyncio.Lock()
receiver_lock = asyncio.Lock()

async def sender() -> None:
    while True:
        raw = await q.get()
        async with sender_lock:
            await websocket.send_bytes(raw)

sender_task = asyncio.create_task(sender(), name="integration-pb-sender")
try:
    while True:
        message = await websocket.receive()
        if "bytes" not in message or message["bytes"] is None:
            await websocket.close(code=1003, reason="binary protobuf required")
            return
        try:
            response = await bridge_manager.handle_integration_frame(message["bytes"])
        except DecodeError:
            await websocket.close(code=1003, reason="invalid protobuf")
            return
        async with receiver_lock:
            await websocket.send_bytes(response)
```

- [ ] **Step 2: Verify by reading file context to ensure no other references to send_lock exist**

Run: `rg "send_lock" app/server.py`
Expected: only the two lock usages at the original lines

---

### Task 2: Log and Recover Integration Client Queue Full Instead of Silent Discard

**Files:**
- Modify: `app/bridge_v2_client.py:757-762`

**Root cause:** `_broadcast_binary` silently discards integration clients when their queue is full. The sender task blocks forever on `await q.get()` with no consumer. The WS stays open — integration shows "Connected" but receives no topology updates.

**Fix:** Log a warning when a queue is full, and instead of discarding, drain old items to make room.

- [ ] **Step 1: Replace silent discard with log + drain**

```python
async def _broadcast_binary(self, raw: bytes) -> None:
    for q in list(self._integration_clients):
        try:
            q.put_nowait(raw)
        except asyncio.QueueFull:
            logger.warning(
                "integration client queue full (maxsize=%d), draining oldest entries",
                q.maxsize,
            )
            try:
                while True:
                    q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(raw)
            except asyncio.QueueFull:
                pass
```

---

### Task 3: Move SQLite Writes Out of Bridge Message Loop

**Files:**
- Modify: `app/bridge_v2_client.py:610, 623, 631`
- Modify: `app/db.py:271-330`

**Root cause:** `_handle_snapshot` calls synchronous `sqlite3` operations (new connection, BEGIN, COMMIT) inside the bridge message loop. If the DB is locked by another handler (HTTP write), `busy_timeout=30000` blocks the event loop for up to 30s, exceeding the WebSocket `ping_timeout=10s` and causing unnecessary disconnections.

**Fix:** Wrap DB writes in `asyncio.to_thread()` so they don't block the event loop.

- [ ] **Step 1: Wrap DB calls in _handle_snapshot with asyncio.to_thread**

```python
def _handle_snapshot(self, client: BridgeV2Client, snapshot: pb.FullSnapshot) -> None:
    bridge_mac = normalize_mac(snapshot.bridge.bridge_mac or client.bridge_mac)
    remote_count = len(snapshot.remotes)
    logger.debug(
        "bridge v2 %s: handling snapshot bridge_mac=%s remotes=%d",
        client.target.host, bridge_mac, remote_count,
    )
    if bridge_mac:
        self._bridge_mac_to_uuid[bridge_mac] = client.bridge_uuid
        client.bridge_mac = bridge_mac
        # Fire-and-forget DB update — don't block bridge message loop
        asyncio.ensure_future(
            asyncio.to_thread(
                self._db.update_bridge,
                client.bridge_uuid,
                network_id=snapshot.bridge.network_id,
                last_connected_at=now_ts(),
            )
        )
    self._snapshots[client.bridge_uuid] = snapshot
    for node in self._snapshot_nodes(client.bridge_uuid, snapshot):
        self._topology_nodes[normalize_mac(node.get("mac"))] = node
    for remote in snapshot.remotes:
        remote_mac = normalize_mac(remote.identity.remote_mac)
        self._routes[remote_mac] = RemoteRoute(
            bridge_uuid=client.bridge_uuid,
            bridge_mac=bridge_mac,
            remote_mac=remote_mac,
            session_id=remote.runtime.session_id,
        )
    # Fire-and-forget DB update
    asyncio.ensure_future(
        asyncio.to_thread(
            self._db.upsert_devices_from_topology,
            self.get_topology_list(),
            snapshot.bridge.bridge_name or client.target.name,
        )
    )
    logger.debug(
        "bridge v2 %s: topology now has %d nodes", client.target.host, len(self._topology_nodes),
    )
```

---

### Task 4: Verify Fixes Don't Break Anything

- [ ] **Step 1: Run existing tests**

Run: `pytest test/ -v --timeout=120` or `test/start.sh`
Expected: All existing tests pass

- [ ] **Step 2: Manual integration test**

Deploy and verify:
1. Send multiple HA commands in rapid succession while topology updates are flowing
2. Verify topology continues to update on the integration side
3. Check no "integration client queue full" warnings in logs (or only brief ones that recover)
4. Verify no WebSocket disconnection storms on the bridge side
