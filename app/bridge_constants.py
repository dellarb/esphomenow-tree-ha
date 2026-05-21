from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .bridge_v2_client import BridgeV2Client

API_VERSION = 2
CLIENT_KIND = "ha_integration"
PROTOCOL = "esp-tree-pb"

BACKOFF_DELAYS = [1, 2, 5, 10]

FrameHandler = Callable[["BridgeV2Client", Any, bytes], Awaitable[None]]
ConnectionHandler = Callable[["BridgeV2Client", bool], Awaitable[None]]
