import asyncio
import logging
from typing import Callable, Optional

from google.protobuf.message import DecodeError

from .proto import espnow_bridge_pb2 as pb
from .transport_ws import WebSocketTransport
from .flow import FlowController

log = logging.getLogger("bridge_lite_client")


class BridgeLiteClient:
    def __init__(
        self, host: str, port: int, api_key: str, client_name: str = "addon"
    ):
        self.host = host
        self.port = port
        self.api_key = api_key
        self.client_name = client_name
        self.transport: Optional[WebSocketTransport] = None
        self.flow: Optional[FlowController] = None
        self.bridge_hello: Optional[pb.BridgeHello] = None
        self._on_frame: Optional[Callable[[pb.RadioFrame], None]] = None
        self._on_status: Optional[Callable[[pb.BridgeStatus], None]] = None
        self._on_disconnect: Optional[Callable[[], None]] = None

    async def connect(self) -> None:
        self.transport = WebSocketTransport(
            self.host, self.port, self.api_key, self.client_name
        )
        await self.transport.connect()
        self.transport.on_received(self._on_raw_message)

        hello_data = await self._recv_proto(timeout=10.0)
        msg = pb.BridgeMessage()
        msg.ParseFromString(hello_data)
        if msg.HasField("hello"):
            self.bridge_hello = msg.hello
            self.flow = FlowController(msg.hello.max_inflight)
            log.info(
                "Connected to bridge %s, max_peers=%d, max_inflight=%d",
                msg.hello.bridge_mac.hex(":"),
                msg.hello.max_peers,
                msg.hello.max_inflight,
            )
        else:
            raise ConnectionError("Expected BridgeHello, got something else")

    async def _recv_proto(self, timeout: float = 5.0) -> bytes:
        if not self.transport:
            raise ConnectionError("Not connected")
        recv_event = asyncio.Event()
        recv_data = []

        def callback(data: bytes):
            recv_data.append(data)
            recv_event.set()

        self.transport.on_received(callback)
        await asyncio.wait_for(recv_event.wait(), timeout=timeout)
        return recv_data[0]

    async def send_frame(self, dst_mac: bytes, raw_frame: bytes) -> bool:
        if not self.flow:
            raise ConnectionError("Not connected")
        seq = self.flow.allocate_seq()
        send_msg = pb.BridgeMessage()
        send_msg.send.dst_mac = dst_mac
        send_msg.send.raw_frame = raw_frame
        send_msg.send.seq = seq
        await self.transport.send(send_msg.SerializeToString())
        return await self.flow.wait_for_ack(seq)

    def on_frame(self, callback: Callable[[pb.RadioFrame], None]) -> None:
        self._on_frame = callback

    def on_status(self, callback: Callable[[pb.BridgeStatus], None]) -> None:
        self._on_status = callback

    def on_disconnect(self, callback: Callable[[], None]) -> None:
        self._on_disconnect = callback

    def _on_raw_message(self, data: bytes) -> None:
        msg = pb.BridgeMessage()
        try:
            msg.ParseFromString(data)
        except DecodeError:
            log.warning("Failed to parse BridgeMessage")
            return
        if msg.HasField("frame") and self._on_frame:
            self._on_frame(msg.frame)
        elif msg.HasField("status") and self._on_status:
            self._on_status(msg.status)
        elif msg.HasField("result") and self.flow:
            self.flow.handle_send_result(msg.result.seq, msg.result.success)