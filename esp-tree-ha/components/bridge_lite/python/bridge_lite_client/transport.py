from abc import ABC, abstractmethod
from typing import Callable


class Transport(ABC):
    @abstractmethod
    async def connect(self, host: str, port: int, path: str = "/espnow-tree/lite/v1/ws") -> None:
        ...

    @abstractmethod
    async def send(self, data: bytes) -> None:
        ...

    @abstractmethod
    async def close(self) -> None:
        ...

    @abstractmethod
    def on_received(self, callback: Callable[[bytes], None]) -> None:
        ...

    @abstractmethod
    def is_connected(self) -> bool:
        ...