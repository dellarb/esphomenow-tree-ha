import asyncio


class FlowController:
    def __init__(self, max_inflight: int):
        self.max_inflight = max_inflight
        self.next_seq: int = 0
        self.pending: dict[int, asyncio.Event] = {}
        self.results: dict[int, bool] = {}

    def allocate_seq(self) -> int:
        seq = self.next_seq
        self.next_seq += 1
        self.pending[seq] = asyncio.Event()
        return seq

    async def wait_for_ack(self, seq: int, timeout: float = 5.0) -> bool:
        try:
            await asyncio.wait_for(self.pending[seq].wait(), timeout=timeout)
            return self.results.pop(seq, False)
        except asyncio.TimeoutError:
            return False
        finally:
            self.pending.pop(seq, None)

    def can_send(self) -> bool:
        return len(self.pending) < self.max_inflight

    def handle_send_result(self, seq: int, success: bool) -> None:
        self.results[seq] = success
        event = self.pending.pop(seq, None)
        if event:
            event.set()