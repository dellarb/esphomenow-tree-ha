import asyncio
import json
import logging
import os
from typing import Callable, Optional

import websockets

from .auth import SessionKeys, compute_auth_hmac, derive_session_keys
from .transport import Transport

log = logging.getLogger("bridge_lite_client.transport_ws")

PROTOCOL_NAME = "esp-tree-lite"
PROTOCOL_VERSION = "v1"
WS_PATH = "/esp-tree/lite/v1/ws"


class WebSocketTransport(Transport):
    def __init__(self, host: str, port: int, api_key: str, client_name: str = "addon"):
        self.host = host
        self.port = port
        self.api_key = api_key
        self.client_name = client_name
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.session_keys: Optional[SessionKeys] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._on_received: Optional[Callable[[bytes], None]] = None
        self._running = False
        self._connected = False

    async def connect(self) -> None:
        uri = f"ws://{self.host}:{self.port}{WS_PATH}"
        self.ws = await websockets.connect(uri, ping_interval=None)
        self._connected = True
        self._running = True

        await self._auth_handshake()

        self._receive_task = asyncio.create_task(self._receive_loop())

    async def _auth_handshake(self) -> None:
        challenge_raw = await self.ws.recv()
        challenge = json.loads(challenge_raw)
        if challenge.get("type") != "auth_challenge":
            raise ConnectionError(f"Expected auth_challenge, got {challenge}")

        server_nonce_hex = challenge["nonce"]
        client_nonce_bytes = os.urandom(16)
        client_nonce_hex = client_nonce_bytes.hex()

        hmac_hex = compute_auth_hmac(
            self.api_key, self.client_name, server_nonce_hex, client_nonce_hex
        )

        response = {
            "type": "auth_response",
            "nonce": client_nonce_hex,
            "hmac": hmac_hex,
            "client": self.client_name,
        }
        await self.ws.send(json.dumps(response))

        result_raw = await self.ws.recv()
        result = json.loads(result_raw)
        if result.get("type") == "error":
            raise ConnectionError(f"Auth failed: {result.get('message')}")
        if result.get("type") != "auth_ok":
            raise ConnectionError(f"Expected auth_ok, got {result}")

        server_nonce = bytes.fromhex(server_nonce_hex)
        self.session_keys = derive_session_keys(
            self.api_key, server_nonce, client_nonce_bytes
        )
        log.debug("Auth handshake complete, session keys derived")

    async def _receive_loop(self) -> None:
        try:
            async for raw in self.ws:
                if not self._running:
                    break
                if isinstance(raw, str):
                    continue
                decrypted = self.session_keys.decrypt(raw)
                if self._on_received:
                    self._on_received(decrypted)
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            log.error(f"Receive loop error: {e}")
        finally:
            self._connected = False

    async def send(self, data: bytes) -> None:
        if not self.ws or not self.session_keys:
            raise ConnectionError("Not connected")
        encrypted = self.session_keys.encrypt(data)
        await self.ws.send(encrypted)

    async def close(self) -> None:
        self._running = False
        self._connected = False
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        if self.ws:
            await self.ws.close()
            self.ws = None

    def on_received(self, callback: Callable[[bytes], None]) -> None:
        self._on_received = callback

    def is_connected(self) -> bool:
        return self._connected