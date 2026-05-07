import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from bridge_lite_client.client import BridgeLiteClient
from bridge_lite_client.flow import FlowController


def test_flow_seq_allocation():
    fc = FlowController(max_inflight=8)
    seqs = [fc.allocate_seq() for _ in range(5)]
    assert seqs == [0, 1, 2, 3, 4]


def test_flow_blocks_at_max():
    fc = FlowController(max_inflight=2)
    fc.allocate_seq()
    fc.allocate_seq()
    assert fc.can_send() is False


def test_ack_releases_slot():
    fc = FlowController(max_inflight=2)
    seq1 = fc.allocate_seq()
    seq2 = fc.allocate_seq()
    assert fc.can_send() is False
    fc.handle_send_result(seq1, True)
    assert fc.can_send() is True
    fc.handle_send_result(seq2, True)
    assert fc.can_send() is True