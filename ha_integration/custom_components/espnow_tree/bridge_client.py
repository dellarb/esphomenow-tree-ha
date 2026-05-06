from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import secrets
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import aiohttp
from google.protobuf.message import DecodeError
from homeassistant.core import HomeAssistant

from .const import API_VERSION, CLIENT_KIND, INTEGRATION_VERSION, PROTOCOL
from .protobuf.generated import espnow_tree_runtime_pb2 as pb

_LOGGER = logging.getLogger(__name__)

FrameHandler = Callable[[pb.Envelope], Awaitable[None]]


class BridgeRuntimeClient:
    def __init__(
        self,
        hass: HomeAssistant,
        *,
        host: str,
        port: int,
        api_key: str,
        name: str,
        frame_handler: FrameHandler,
    ) -> None:
        self.hass = hass
        self.host = host
        self.port = port
        self.api_key = api_key
        self.name = name
        self._frame_handler = frame_handler
        self._session: aiohttp.ClientSession | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._task: asyncio.Task[None] | None = None
        self._pending: dict[str, asyncio.Future[pb.Envelope]] = {}
        self.connected = False
        self.bridge_mac: str | None = None

    @property
    def url(self) -> str:
        return f"ws://{self.host}:{self.port}/espnow-tree/v2/pb"

    async def start(self) -> None:
        self._session = aiohttp.ClientSession()
        self._task = self.hass.async_create_task(self._run(), name=f"espnow_tree_{self.host}")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._ws and not self._ws.closed:
            await self._ws.close()
        if self._session:
            await self._session.close()
        for fut in self._pending.values():
            if not fut.done():
                fut.cancel()

    async def _run(self) -> None:
        backoff = 1
        while True:
            try:
                await self._connect_once()
                backoff = 1
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.connected = False
                _LOGGER.warning("ESPNow Tree bridge %s disconnected: %s", self.host, exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    async def _connect_once(self) -> None:
        assert self._session is not None
        async with self._session.ws_connect(self.url, protocols=(PROTOCOL,), heartbeat=30, max_msg_size=65536) as ws:
            self._ws = ws
            await self._authenticate(ws)
            await self._send(
                pb.Envelope(
                    request_id=uuid.uuid4().hex,
                    api_version=API_VERSION,
                    client_hello=pb.ClientHello(
                        request_full_snapshot=True,
                        integration_version=INTEGRATION_VERSION,
                    ),
                )
            )
            self.connected = True
            async for msg in ws:
                if msg.type != aiohttp.WSMsgType.BINARY:
                    raise RuntimeError("bridge sent non-binary runtime frame")
                env = pb.Envelope()
                try:
                    env.ParseFromString(msg.data)
                except DecodeError as exc:
                    raise RuntimeError("invalid protobuf frame") from exc
                fut = self._pending.pop(env.request_id, None) if env.request_id else None
                if fut and not fut.done():
                    fut.set_result(env)
                await self._frame_handler(env)
            self.connected = False

    async def _authenticate(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        msg = await ws.receive()
        if msg.type != aiohttp.WSMsgType.BINARY:
            raise RuntimeError("missing binary auth challenge")
        env = pb.Envelope()
        env.ParseFromString(msg.data)
        if env.WhichOneof("msg") != "auth_challenge":
            raise RuntimeError("missing auth challenge")
        challenge = env.auth_challenge
        if challenge.protocol != PROTOCOL or challenge.max_version < API_VERSION:
            raise RuntimeError("incompatible bridge runtime API")
        client_nonce = secrets.token_bytes(16)
        digest_input = (
            f"{PROTOCOL}|v2|{CLIENT_KIND}|"
            f"{challenge.server_nonce.hex()}|{client_nonce.hex()}"
        ).encode()
        digest = hmac.new(self.api_key.encode(), digest_input, hashlib.sha256).digest()
        await self._send(
            pb.Envelope(
                request_id=uuid.uuid4().hex,
                api_version=API_VERSION,
                auth_response=pb.AuthResponse(
                    client_kind=CLIENT_KIND,
                    client_name=self.name,
                    client_nonce=client_nonce,
                    hmac_sha256=digest,
                ),
            )
        )
        msg = await ws.receive()
        if msg.type != aiohttp.WSMsgType.BINARY:
            raise RuntimeError("missing auth result")
        auth_env = pb.Envelope()
        auth_env.ParseFromString(msg.data)
        kind = auth_env.WhichOneof("msg")
        if kind == "auth_failed":
            raise RuntimeError(auth_env.auth_failed.message or auth_env.auth_failed.code)
        if kind != "auth_ok":
            raise RuntimeError("missing auth ok")
        self.bridge_mac = auth_env.auth_ok.bridge.bridge_mac

    async def _send(self, envelope: pb.Envelope) -> None:
        if not self._ws:
            raise RuntimeError("bridge websocket is not connected")
        await self._ws.send_bytes(envelope.SerializeToString())

    async def request(self, envelope: pb.Envelope, timeout: float = 10) -> pb.Envelope:
        if not envelope.request_id:
            envelope.request_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[pb.Envelope] = loop.create_future()
        self._pending[envelope.request_id] = fut
        await self._send(envelope)
        return await asyncio.wait_for(fut, timeout)

    async def command(self, remote_mac: str, object_id: str, command: str, **args: Any) -> pb.CommandResult:
        req_args = []
        for name, value in args.items():
            arg = pb.CommandArgument(name=name)
            if isinstance(value, bool):
                arg.bool_value = value
            elif isinstance(value, int):
                arg.int_value = value
            elif isinstance(value, float):
                arg.float_value = value
            elif value is not None:
                arg.string_value = str(value)
            req_args.append(arg)
        env = await self.request(
            pb.Envelope(
                api_version=API_VERSION,
                command_request=pb.CommandRequest(
                    remote_mac=remote_mac,
                    object_id=object_id,
                    command=command,
                    args=req_args,
                ),
            )
        )
        return env.command_result
