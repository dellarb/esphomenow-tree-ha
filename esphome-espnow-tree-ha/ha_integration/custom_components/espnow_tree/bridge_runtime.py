from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .bridge_client import BridgeRuntimeClient
from .const import CONF_API_KEY, CONF_HOST, CONF_NAME, CONF_PORT, DOMAIN
from .device_model import EntityModel, RemoteModel, norm_mac
from .protobuf.generated import espnow_tree_runtime_pb2 as pb
from .store import RuntimeStore

_LOGGER = logging.getLogger(__name__)

EntityCallback = Callable[[EntityModel], None]


class EspnowTreeRuntime:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.clients: dict[str, BridgeRuntimeClient] = {}
        self.entry_clients: dict[str, BridgeRuntimeClient] = {}
        self.remotes: dict[str, RemoteModel] = {}
        self.entities: dict[tuple[str, str], EntityModel] = {}
        self.entity_callbacks: dict[str, list[EntityCallback]] = {}
        self.update_callbacks: dict[tuple[str, str], list[Callable[[], None]]] = {}
        self.store = RuntimeStore(hass)
        self._store_loaded = False

    async def add_entry(self, entry: ConfigEntry) -> None:
        if not self._store_loaded:
            await self._load_store()
            self._store_loaded = True
        data = entry.data
        client = BridgeRuntimeClient(
            self.hass,
            host=data[CONF_HOST],
            port=data[CONF_PORT],
            api_key=data[CONF_API_KEY],
            name=data.get(CONF_NAME) or entry.title,
            frame_handler=self.handle_frame,
        )
        self.entry_clients[entry.entry_id] = client
        await client.start()

    async def remove_entry(self, entry: ConfigEntry) -> None:
        client = self.entry_clients.pop(entry.entry_id, None)
        if client:
            await client.stop()

    def register_platform(self, platform: str, cb: EntityCallback) -> None:
        self.entity_callbacks.setdefault(platform, []).append(cb)
        for entity in list(self.entities.values()):
            if entity.platform == platform:
                cb(entity)

    def subscribe_entity(self, remote_mac: str, object_id: str, cb: Callable[[], None]) -> Callable[[], None]:
        key = (norm_mac(remote_mac), object_id)
        self.update_callbacks.setdefault(key, []).append(cb)

        def unsub() -> None:
            callbacks = self.update_callbacks.get(key)
            if callbacks and cb in callbacks:
                callbacks.remove(cb)

        return unsub

    async def handle_frame(self, env: pb.Envelope) -> None:
        kind = env.WhichOneof("msg")
        if kind == "auth_ok":
            return
        if kind == "full_snapshot":
            self._handle_snapshot(env.full_snapshot)
        elif kind == "event_batch":
            self._handle_events(env.event_batch)

    @callback
    def _handle_snapshot(self, snapshot: pb.FullSnapshot) -> None:
        bridge_mac = norm_mac(snapshot.bridge.bridge_mac)
        client = next((c for c in self.entry_clients.values() if norm_mac(c.bridge_mac or "") == bridge_mac), None)
        if client:
            self.clients[bridge_mac] = client
        for remote in snapshot.remotes:
            self._merge_remote_snapshot(remote, bridge_mac, snapshot.snapshot_unix_ms)
        self.hass.async_create_task(self.store.save(self._store_data()))

    @callback
    def _merge_remote_snapshot(self, snapshot: pb.RemoteSnapshot, bridge_mac: str, observed_ms: int) -> None:
        ident = snapshot.identity
        runtime = snapshot.runtime
        remote_mac = norm_mac(ident.remote_mac)
        remote = self.remotes.setdefault(remote_mac, RemoteModel(remote_mac=remote_mac))
        remote.name = ident.friendly_name
        remote.esphome_name = ident.esphome_name
        remote.manufacturer = ident.manufacturer or "ESPHome"
        remote.model = ident.model or "espnow_lr_remote"
        remote.project_name = ident.project_name
        remote.project_version = ident.project_version
        remote.firmware_build_date = ident.firmware_build_date
        remote.schema_hash = ident.schema_hash
        remote.bridge_mac = norm_mac(runtime.bridge_mac or bridge_mac)
        remote.parent_mac = norm_mac(runtime.parent_mac)
        remote.session_id = runtime.session_id
        remote.last_tx_counter = runtime.last_tx_counter
        remote.last_live_observed_ms = observed_ms or runtime.last_seen_unix_ms
        remote.online = runtime.online
        remote.rssi = runtime.rssi
        remote.hops_to_bridge = runtime.hops_to_bridge

        seen: set[str] = set()
        for desc in snapshot.descriptor_set.entities:
            object_id = desc.object_id
            if not object_id:
                continue
            seen.add(object_id)
            entity = self.entities.get((remote_mac, object_id))
            if entity is None:
                entity = EntityModel(
                    remote_mac=remote_mac,
                    object_id=object_id,
                    platform=desc.platform,
                    name=desc.friendly_name or object_id,
                )
                self.entities[(remote_mac, object_id)] = entity
                remote.entities[object_id] = entity
                for cb in self.entity_callbacks.get(entity.platform, []):
                    cb(entity)
            entity.name = desc.friendly_name or object_id
            entity.native_type = desc.native_type
            entity.unit = desc.unit_of_measurement
            entity.device_class = desc.device_class
            entity.state_class = desc.state_class
            entity.options_json = desc.options_json
            entity.writable = desc.writable
            entity.available = remote.online
            entity.missing_from_schema = False
        for object_id, entity in remote.entities.items():
            if object_id not in seen:
                entity.available = False
                entity.missing_from_schema = True
                self._notify(entity)
        for state in snapshot.states:
            self._apply_state(remote_mac, state)

    @callback
    def _handle_events(self, batch: pb.EventBatch) -> None:
        for event in batch.events:
            kind = event.WhichOneof("kind")
            if kind == "remote_state":
                ev = event.remote_state
                remote_mac = norm_mac(ev.remote_mac)
                remote = self.remotes.get(remote_mac)
                if remote and self._accept_live(remote, norm_mac(ev.bridge_mac), ev.session_id, ev.tx_counter, ev.observed_unix_ms):
                    remote.bridge_mac = norm_mac(ev.bridge_mac)
                    remote.session_id = ev.session_id
                    remote.last_tx_counter = ev.tx_counter
                    remote.last_live_observed_ms = ev.observed_unix_ms
                    remote.online = True
                for state in ev.states:
                    self._apply_state(remote_mac, state)
            elif kind == "remote_availability":
                ev = event.remote_availability
                remote_mac = norm_mac(ev.remote_mac)
                remote = self.remotes.setdefault(remote_mac, RemoteModel(remote_mac=remote_mac))
                bridge_mac = norm_mac(ev.bridge_mac)
                if ev.online:
                    if self._accept_live(remote, bridge_mac, ev.session_id, ev.tx_counter, ev.observed_unix_ms):
                        remote.bridge_mac = bridge_mac
                        remote.session_id = ev.session_id
                        remote.last_tx_counter = ev.tx_counter
                        remote.last_live_observed_ms = ev.observed_unix_ms
                        remote.online = True
                elif remote.bridge_mac == bridge_mac and remote.session_id == ev.session_id:
                    remote.online = False
                for entity in remote.entities.values():
                    entity.available = remote.online
                    self._notify(entity)
            elif kind == "remote_schema_changed":
                self._merge_remote_snapshot(event.remote_schema_changed.snapshot, norm_mac(event.remote_schema_changed.bridge_mac), 0)
                self.hass.async_create_task(self.store.save(self._store_data()))
            elif kind == "topology_changed":
                ev = event.topology_changed
                remote = self.remotes.get(norm_mac(ev.remote_mac))
                if remote:
                    remote.parent_mac = norm_mac(ev.parent_mac)
                    remote.hops_to_bridge = ev.hops_to_bridge
                    remote.rssi = ev.rssi

    def _accept_live(self, remote: RemoteModel, bridge_mac: str, session_id: str, tx_counter: int, observed_ms: int) -> bool:
        if not remote.session_id or remote.session_id != session_id:
            return True
        if remote.bridge_mac == bridge_mac:
            return tx_counter >= remote.last_tx_counter
        if tx_counter > remote.last_tx_counter:
            return True
        return observed_ms > remote.last_live_observed_ms

    def _apply_state(self, remote_mac: str, state: pb.EntityState) -> None:
        entity = self.entities.get((norm_mac(remote_mac), state.object_id))
        if not entity:
            return
        value_kind = state.WhichOneof("value")
        entity.value = getattr(state, value_kind) if value_kind else None
        entity.available = state.available
        entity.observed_unix_ms = state.observed_unix_ms
        self._notify(entity)

    def _notify(self, entity: EntityModel) -> None:
        for cb in self.update_callbacks.get((norm_mac(entity.remote_mac), entity.object_id), []):
            cb()

    async def _load_store(self) -> None:
        data = await self.store.load()
        for remote_mac, remote_data in data.get("remotes", {}).items():
            self.remotes[norm_mac(remote_mac)] = RemoteModel(remote_mac=norm_mac(remote_mac), **remote_data)
        for key, entity_data in data.get("entities", {}).items():
            remote_mac, object_id = key.split("|", 1)
            model = EntityModel(remote_mac=norm_mac(remote_mac), object_id=object_id, **entity_data)
            self.entities[(model.remote_mac, model.object_id)] = model
            self.remotes.setdefault(model.remote_mac, RemoteModel(remote_mac=model.remote_mac)).entities[model.object_id] = model

    def _store_data(self) -> dict[str, Any]:
        remotes = {
            mac: {
                "name": remote.name,
                "esphome_name": remote.esphome_name,
                "manufacturer": remote.manufacturer,
                "model": remote.model,
                "project_name": remote.project_name,
                "project_version": remote.project_version,
                "firmware_build_date": remote.firmware_build_date,
                "schema_hash": remote.schema_hash,
            }
            for mac, remote in self.remotes.items()
        }
        entities = {
            f"{mac}|{object_id}": {
                "platform": entity.platform,
                "name": entity.name,
                "native_type": entity.native_type,
                "unit": entity.unit,
                "device_class": entity.device_class,
                "state_class": entity.state_class,
                "options_json": entity.options_json,
                "writable": entity.writable,
            }
            for (mac, object_id), entity in self.entities.items()
        }
        return {"remotes": remotes, "entities": entities}

    async def send_command(self, remote_mac: str, object_id: str, command: str, **args: Any) -> pb.CommandResult:
        remote = self.remotes[norm_mac(remote_mac)]
        client = self.clients.get(norm_mac(remote.bridge_mac))
        if not client:
            raise RuntimeError("remote has no active bridge client")
        return await client.command(remote.remote_mac, object_id, command, **args)


def get_runtime(hass: HomeAssistant) -> EspnowTreeRuntime:
    return hass.data[DOMAIN]["runtime"]
