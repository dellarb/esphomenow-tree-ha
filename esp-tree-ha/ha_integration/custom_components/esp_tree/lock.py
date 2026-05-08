from __future__ import annotations

from homeassistant.components.lock import LockEntity, LockState
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .bridge_runtime import get_runtime
from .device_model import EntityModel
from .entity_model import EspTreeEntity


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    if entry.data.get("type") != "remote":
        return

    seen: set[str] = set()

    def add(model: EntityModel) -> None:
        if model.unique_id in seen:
            return
        seen.add(model.unique_id)
        async_add_entities([EspTreeLock(model)])

    get_runtime(hass).register_platform("lock", add, entry.entry_id)


class EspTreeLock(EspTreeEntity, LockEntity):
    def __init__(self, model: EntityModel) -> None:
        super().__init__(model)
        self._lock_state = LockState.UNLOCKED

    @property
    def is_locked(self) -> bool:
        return self._lock_state == LockState.LOCKED

    @property
    def state(self):
        return self._lock_state

    async def async_added_to_hass(self) -> None:
        runtime = get_runtime(self.hass)
        self.async_on_remove(
            runtime.subscribe_entity(self.model.remote_mac, self.model.object_id, self._process_state)
        )

    def _process_state(self) -> None:
        raw = self.model.value
        if isinstance(raw, str):
            if raw == "LOCKED":
                self._lock_state = LockState.LOCKED
            elif raw == "JAMMED":
                self._lock_state = LockState.JAMMED
            else:
                self._lock_state = LockState.UNLOCKED
        self.async_write_ha_state()

    async def async_lock(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "lock")

    async def async_unlock(self, **kwargs) -> None:
        await get_runtime(self.hass).send_command(self.model.remote_mac, self.model.object_id, "unlock")