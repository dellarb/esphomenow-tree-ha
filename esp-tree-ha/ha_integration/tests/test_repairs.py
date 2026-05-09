"""Tests for ESP Tree repair flows."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.conftest import import_entity

repairs_mod = import_entity("repairs")


@pytest.mark.asyncio
async def test_create_restart_required_fix_flow():
    flow = await repairs_mod.async_create_fix_flow(MagicMock(), "restart_required", None)

    assert isinstance(flow, repairs_mod.RestartRequiredFlow)


@pytest.mark.asyncio
async def test_restart_repair_submit_schedules_restart(monkeypatch):
    flow = repairs_mod.RestartRequiredFlow()
    flow.hass = MagicMock()
    flow.async_create_entry = MagicMock(return_value={"type": "create_entry"})
    scheduled = []

    async def fake_restart():
        return None

    def capture_task(coro):
        scheduled.append(coro)
        return MagicMock()

    monkeypatch.setattr(flow, "_do_restart", fake_restart)
    flow.hass.async_create_task.side_effect = capture_task

    result = await flow.async_step_confirm_restart({})

    assert result == {"type": "create_entry"}
    assert len(scheduled) == 1
    scheduled[0].close()


@pytest.mark.asyncio
async def test_restart_task_falls_back_to_homeassistant_service(monkeypatch):
    flow = repairs_mod.RestartRequiredFlow()
    flow.hass = MagicMock()
    flow.hass.services.async_call = AsyncMock()
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    monkeypatch.setattr(repairs_mod.asyncio, "sleep", AsyncMock())

    await flow._do_restart()

    flow.hass.services.async_call.assert_awaited_once_with(
        "homeassistant",
        "restart",
        blocking=True,
    )
