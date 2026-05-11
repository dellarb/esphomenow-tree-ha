#!/usr/bin/env python3
"""CLI test tool for the ESP-NOW Tree Bridge API v1.

Performs HMAC-SHA256 challenge-response authentication, sends bridge.info
and topology.get commands, then monitors unsolicited bridge events.
"""

import argparse
import asyncio
import hashlib
import hmac
import json
import logging
import os
import sys

import websockets

PROTOCOL = "esp-tree-ws"
VERSION_TAG = "v1"
API_VERSION = 1
WS_PATH = "/esp-tree/v1/ws"
CLIENT_ID = "test-cli"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("test_bridge_api")


def eprint(*args, **kwargs):
    kwargs.setdefault("file", sys.stderr)
    print(*args, **kwargs)


def compute_auth_hmac(api_key: str, client: str, server_nonce: str, client_nonce: str) -> str:
    hmac_input = f"{PROTOCOL}|{VERSION_TAG}|{client}|{server_nonce}|{client_nonce}"
    digest = hmac.new(
        api_key.encode("utf-8"),
        hmac_input.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest


def make_envelope(msg_type: str, payload: dict | None = None, msg_id: str | None = None) -> dict:
    envelope = {"v": API_VERSION, "type": msg_type}
    if msg_id is not None:
        envelope["id"] = msg_id
    envelope["payload"] = payload if payload is not None else {}
    return envelope


def validate_envelope(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Received non-JSON-object frame")
    v = data.get("v")
    if v != API_VERSION:
        raise ValueError(f"Unexpected envelope version: {v}")
    if "type" not in data:
        raise ValueError("Missing required field 'type'")
    return data


async def connect_and_authenticate(host: str, port: int, api_key: str):
    url = f"ws://{host}:{port}{WS_PATH}"
    log.info("Connecting to %s", url)

    try:
        ws = await websockets.connect(url, max_size=2**21, close_timeout=5)
    except Exception as exc:
        log.error("Failed to connect: %s", exc)
        eprint(f"Connection error: {exc}")
        sys.exit(1)

    log.info("Connected. Waiting for auth.challenge...")

    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
    except asyncio.TimeoutError:
        log.error("Timed out waiting for auth.challenge")
        eprint("Timeout: bridge did not send auth.challenge within 10 s")
        await ws.close()
        sys.exit(1)
    except websockets.ConnectionClosed as exc:
        log.error("Connection closed before auth.challenge: %s", exc)
        eprint(f"Connection closed by bridge before auth.challenge: {exc}")
        sys.exit(1)

    log.info("Received: %s", raw)
    try:
        challenge = validate_envelope(json.loads(raw))
    except (json.JSONDecodeError, ValueError) as exc:
        log.error("Invalid auth.challenge envelope: %s", exc)
        eprint(f"Invalid auth.challenge: {exc}")
        await ws.close()
        sys.exit(1)

    if challenge["type"] != "auth.challenge":
        log.error("Expected auth.challenge, got: %s", challenge["type"])
        eprint(f"Expected auth.challenge, got: {challenge['type']}")

        if challenge["type"] == "error":
            payload = challenge.get("payload", {})
            code = payload.get("code", "")
            msg = payload.get("message", "")
            eprint(f"Error code: {code} — {msg}")
            if code == "client_already_connected":
                eprint("Another client is already connected. Disconnect it first.")
        await ws.close()
        sys.exit(1)

    payload = challenge.get("payload", {})
    server_nonce = payload.get("server_nonce", "")
    if not server_nonce:
        log.error("auth.challenge missing server_nonce")
        eprint("auth.challenge missing server_nonce")
        await ws.close()
        sys.exit(1)

    log.info("Server nonce: %s", server_nonce[:8] + "...")

    client_nonce_bytes = os.urandom(16)
    client_nonce = client_nonce_bytes.hex()

    hmac_hex = compute_auth_hmac(api_key, CLIENT_ID, server_nonce, client_nonce)

    auth_response = make_envelope(
        "auth.response",
        payload={
            "client": CLIENT_ID,
            "client_nonce": client_nonce,
            "hmac": hmac_hex,
        },
        msg_id="1",
    )

    log.info("Sending auth.response (client=%s, nonce=%s...)", CLIENT_ID, client_nonce[:8])
    await ws.send(json.dumps(auth_response))

    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
    except asyncio.TimeoutError:
        log.error("Timed out waiting for auth response")
        eprint("Timeout: bridge did not respond to auth within 10 s")
        await ws.close()
        sys.exit(1)
    except websockets.ConnectionClosed as exc:
        log.error("Connection closed after auth.response: %s", exc)
        eprint(f"Connection closed by bridge after auth: {exc}")
        sys.exit(1)

    log.info("Received: %s", raw)
    try:
        auth_result = validate_envelope(json.loads(raw))
    except (json.JSONDecodeError, ValueError) as exc:
        log.error("Invalid auth response: %s", exc)
        eprint(f"Invalid auth response: {exc}")
        await ws.close()
        sys.exit(1)

    result_type = auth_result["type"]

    if result_type == "auth.ok":
        auth_payload = auth_result.get("payload", {})
        log.info("Authentication successful (api_version=%s, server=%s)",
                 auth_payload.get("api_version"), auth_payload.get("server"))
        eprint("Authentication successful.")
        return ws

    if result_type == "error":
        err_payload = auth_result.get("payload", {})
        code = err_payload.get("code", "")
        msg = err_payload.get("message", "")
        log.error("Authentication failed: code=%s message=%s", code, msg)

        if code == "client_already_connected":
            eprint("Authentication failed: another client is already connected.")
            eprint("Disconnect the existing client and try again.")
        elif code == "auth_failed":
            eprint("Authentication failed: wrong API key or nonce mismatch.")
        else:
            eprint(f"Authentication failed: {code} — {msg}")

        await ws.close()
        sys.exit(1)

    log.error("Unexpected auth response type: %s", result_type)
    eprint(f"Unexpected auth response: {result_type}")
    await ws.close()
    sys.exit(1)


async def send_command(ws, msg_id: str, msg_type: str, payload: dict | None = None) -> dict | None:
    envelope = make_envelope(msg_type, payload=payload, msg_id=msg_id)
    log.info("Sending: type=%s id=%s", msg_type, msg_id)
    await ws.send(json.dumps(envelope))

    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=15)
    except asyncio.TimeoutError:
        log.warning("Timeout waiting for response to %s", msg_type)
        eprint(f"Timeout: no response to {msg_type} within 15 s")
        return None
    except websockets.ConnectionClosed as exc:
        log.error("Connection closed while waiting for %s: %s", msg_type, exc)
        eprint(f"Connection closed: {exc}")
        return None

    log.info("Received: %s", raw)
    try:
        data = validate_envelope(json.loads(raw))
    except (json.JSONDecodeError, ValueError) as exc:
        log.warning("Invalid response to %s: %s", msg_type, exc)
        eprint(f"Invalid response: {exc}")
        return None

    return data


async def run_commands(ws) -> None:
    eprint("\n--- bridge.info ---")
    info = await send_command(ws, "2", "bridge.info")
    if info is not None:
        print(json.dumps(info, indent=2))

    eprint("\n--- topology.get ---")
    topo = await send_command(ws, "topo-1", "topology.get", payload={})
    if topo is not None:
        print(json.dumps(topo, indent=2))


def display_event(event: dict) -> None:
    event_type = event.get("type", "unknown")
    payload = event.get("payload", {})

    if event_type == "bridge.heartbeat":
        uptime = payload.get("uptime_ms", "?")
        eprint(f"[heartbeat] uptime_ms={uptime}")
    elif event_type == "remote.availability":
        mac = payload.get("mac", "?")
        online = payload.get("online", "?")
        reason = payload.get("reason", "?")
        rssi = payload.get("rssi", "?")
        eprint(f"[availability] mac={mac} online={online} reason={reason} rssi={rssi}")
    elif event_type == "remote.state":
        mac = payload.get("mac", "?")
        state = payload.get("state", {})
        eprint(f"[state] mac={mac} state={json.dumps(state)}")
    elif event_type == "topology.changed":
        reason = payload.get("reason", "?")
        mac = payload.get("mac", "?")
        eprint(f"[topology.changed] mac={mac} reason={reason}")
    elif event_type == "remote.schema_changed":
        mac = payload.get("mac", "?")
        schema_hash = payload.get("schema_hash", "?")
        eprint(f"[schema_changed] mac={mac} hash={schema_hash}")
    elif event_type == "remote.metadata_changed":
        mac = payload.get("mac", "?")
        changes = payload.get("changes", {})
        eprint(f"[metadata_changed] mac={mac} changes={json.dumps(changes)}")
    else:
        eprint(f"[event] type={event_type} payload={json.dumps(payload)}")


async def monitor_events(ws) -> None:
    eprint("\n--- Monitoring events (Ctrl+C to exit) ---")
    try:
        async for raw in ws:
            log.info("Event received: %s", raw)
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                log.warning("Non-JSON frame received")
                eprint(f"[non-json] {raw}")
                continue

            try:
                envelope = validate_envelope(data)
            except ValueError as exc:
                log.warning("Invalid envelope: %s", exc)
                eprint(f"[invalid] {exc}")
                continue

            if "id" in envelope:
                log.info("Received response during event monitor: type=%s id=%s",
                         envelope.get("type"), envelope.get("id"))
                eprint(f"[response] {json.dumps(envelope, indent=2)}")
                continue

            display_event(envelope)
    except websockets.ConnectionClosed as exc:
        log.info("WebSocket closed: code=%s reason=%s", exc.code, exc.reason)
        eprint(f"\nConnection closed (code={exc.code}, reason={exc.reason or 'none'})")
    except KeyboardInterrupt:
        eprint("\nInterrupted.")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test CLI for ESP-NOW Tree Bridge API v1"
    )
    parser.add_argument("--ip", required=True, help="Bridge IP address")
    parser.add_argument("--port", type=int, default=80, help="Bridge WebSocket port (default: 80)")
    parser.add_argument("--api-key", required=True, help="API key for HMAC-SHA256 authentication")
    args = parser.parse_args()

    ws = await connect_and_authenticate(args.ip, args.port, args.api_key)

    try:
        await run_commands(ws)
        await monitor_events(ws)
    except KeyboardInterrupt:
        eprint("\nInterrupted.")
    finally:
        if ws.open:
            log.info("Closing WebSocket")
            await ws.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        eprint("Interrupted.")
        sys.exit(0)