"""Tests for lock entity."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from tests.conftest import EntityModel, MockRuntime, import_entity

lock_mod = import_entity("lock")
EspTreeLock = lock_mod.EspTreeLock
LockState = lock_mod.LockState


class TestEspTreeLock:
    def _make(self, value=None):
        runtime = MockRuntime()
        model = EntityModel(platform="lock", value=value)
        entity = EspTreeLock(model)
        hass = MagicMock()
        hass.data = {"esp_tree": {"runtime": runtime}}
        entity.hass = hass
        return entity, runtime

    def test_default_state_unlocked(self):
        entity, _ = self._make()
        assert entity.is_locked is False
        assert entity.state == LockState.UNLOCKED

    def test_process_state_locked(self):
        entity, _ = self._make()
        entity.model.value = "LOCKED"
        entity._process_state()
        assert entity.is_locked is True
        assert entity.state == LockState.LOCKED

    def test_process_state_unlocked(self):
        entity, _ = self._make()
        entity.model.value = "UNLOCKED"
        entity._process_state()
        assert entity.is_locked is False
        assert entity.state == LockState.UNLOCKED

    def test_process_state_jammed(self):
        entity, _ = self._make()
        entity.model.value = "JAMMED"
        entity._process_state()
        assert entity.is_locked is False
        assert entity.state == LockState.JAMMED

    def test_process_state_unknown_string(self):
        entity, _ = self._make()
        entity.model.value = "UNKNOWN"
        entity._process_state()
        assert entity.state == LockState.UNLOCKED

    @pytest.mark.asyncio
    async def test_async_lock(self):
        entity, runtime = self._make()
        await entity.async_lock()
        assert runtime._commands[0][2] == "lock"

    @pytest.mark.asyncio
    async def test_async_unlock(self):
        entity, runtime = self._make()
        await entity.async_unlock()
        assert runtime._commands[0][2] == "unlock"