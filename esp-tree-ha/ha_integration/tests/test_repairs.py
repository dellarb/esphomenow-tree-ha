"""Tests for ESP Tree repair flows."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.helpers import issue_registry as ir

from tests.conftest import import_entity

repairs_mod = import_entity("repairs")
update_repair_mod = import_entity("update_repair")


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


@pytest.mark.asyncio
async def test_stale_restart_marker_is_removed_after_restart(monkeypatch, tmp_path):
    marker_path = tmp_path / ".restart_required.json"
    marker_path.write_text(
        json.dumps({"created_at": update_repair_mod._MODULE_IMPORTED_AT - 1}),
        encoding="utf-8",
    )
    monkeypatch.setattr(update_repair_mod, "MARKER_FILE", str(marker_path))
    ir.async_create_issue.reset_mock()
    ir.async_delete_issue.reset_mock()

    hass = MagicMock()
    hass.config_entries.async_entries.return_value = [
        MagicMock(data={"type": "hub"})
    ]
    await update_repair_mod._sync_restart_issue(hass)

    assert not marker_path.exists()
    ir.async_create_issue.assert_not_called()
    ir.async_delete_issue.assert_called_once()


@pytest.mark.asyncio
async def test_stale_restart_marker_kept_on_fresh_install(monkeypatch, tmp_path):
    marker_path = tmp_path / ".restart_required.json"
    marker_path.write_text(
        json.dumps({"created_at": update_repair_mod._MODULE_IMPORTED_AT - 1}),
        encoding="utf-8",
    )
    monkeypatch.setattr(update_repair_mod, "MARKER_FILE", str(marker_path))
    ir.async_create_issue.reset_mock()
    ir.async_delete_issue.reset_mock()

    hass = MagicMock()
    hass.config_entries.async_entries.return_value = []
    await update_repair_mod._sync_restart_issue(hass)

    assert marker_path.exists()
    ir.async_create_issue.assert_called_once()
    ir.async_delete_issue.assert_not_called()


@pytest.mark.asyncio
async def test_fresh_restart_marker_creates_issue(monkeypatch, tmp_path):
    marker_path = tmp_path / ".restart_required.json"
    marker_path.write_text(
        json.dumps({"created_at": update_repair_mod._MODULE_IMPORTED_AT + 1}),
        encoding="utf-8",
    )
    monkeypatch.setattr(update_repair_mod, "MARKER_FILE", str(marker_path))
    ir.async_create_issue.reset_mock()
    ir.async_delete_issue.reset_mock()

    await update_repair_mod._sync_restart_issue(MagicMock())

    assert marker_path.exists()
    ir.async_create_issue.assert_called_once()
    ir.async_delete_issue.assert_not_called()
