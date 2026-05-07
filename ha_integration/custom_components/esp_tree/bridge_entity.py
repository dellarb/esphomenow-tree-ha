from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN


class EspnowTreeBridgeEntity(Entity):
    _attr_has_entity_name = True

    def __init__(self, bridge_mac: str, object_id: str, name: str) -> None:
        self._bridge_mac = bridge_mac
        self._object_id = object_id
        self._attr_unique_id = f"{bridge_mac.replace(':', '')}_{object_id}"
        self._attr_translation_key = object_id
        self._attr_name = name

    async def async_added_to_hass(self) -> None:
        from .bridge_runtime import get_runtime
        runtime = get_runtime(self.hass)
        self.async_on_remove(runtime.subscribe_bridge(self._bridge_mac, self.async_write_ha_state))

    @property
    def available(self) -> bool:
        runtime = get_runtime(self.hass)
        bridge = runtime.bridge_snapshots.get(self._bridge_mac)
        return bridge is not None and bridge.get("online", False)

    @property
    def device_info(self) -> DeviceInfo:
        bridge = self._get_bridge_value("friendly_name") or self._get_bridge_value("esphome_name") or self._get_bridge_value("label") or "ESP Tree Bridge"
        return DeviceInfo(
            identifiers={(DOMAIN, self._bridge_mac)},
            name=bridge,
            manufacturer="ESPHome",
            model="espnow_lr_bridge",
        )

    def _get_bridge_value(self, key: str):
        runtime = get_runtime(self.hass)
        bridge = runtime.bridge_snapshots.get(self._bridge_mac, {})
        return bridge.get(key)