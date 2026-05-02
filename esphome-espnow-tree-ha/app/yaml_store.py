from __future__ import annotations

from pathlib import Path


class YAMLStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _device_dir(self, esphome_name: str) -> Path:
        return self.root / esphome_name

    def _yaml_path(self, esphome_name: str) -> Path:
        return self._device_dir(esphome_name) / f"{esphome_name}.yaml"

    def get_config(self, esphome_name: str) -> str | None:
        path = self._yaml_path(esphome_name)
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def save_config(self, esphome_name: str, content: str) -> None:
        device_dir = self._device_dir(esphome_name)
        device_dir.mkdir(parents=True, exist_ok=True)
        self._yaml_path(esphome_name).write_text(content, encoding="utf-8")

    def delete_config(self, esphome_name: str) -> None:
        path = self._yaml_path(esphome_name)
        path.unlink(missing_ok=True)

    def list_configs(self) -> list[str]:
        names: list[str] = []
        if not self.root.exists():
            return names
        for entry in sorted(self.root.iterdir()):
            if entry.is_dir():
                yaml_file = entry / f"{entry.name}.yaml"
                if yaml_file.exists():
                    names.append(entry.name)
        return names

    def get_secrets(self) -> str:
        path = self.root / "secrets.yaml"
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")

    def save_secrets(self, content: str) -> None:
        (self.root / "secrets.yaml").write_text(content, encoding="utf-8")

    def get_factory_binary(self, esphome_name: str) -> Path | None:
        path = self._device_dir(esphome_name) / f"{esphome_name}.factory.bin"
        return path if path.exists() else None

    def get_ota_binary(self, esphome_name: str) -> Path | None:
        path = self._device_dir(esphome_name) / f"{esphome_name}.ota.bin"
        return path if path.exists() else None

    def has_config(self, esphome_name: str) -> bool:
        return self._yaml_path(esphome_name).exists()
