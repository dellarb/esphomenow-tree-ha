Import('env')
import shutil, os

project_dir = env.get("PROJECT_DIR")

# Copy protocol source files
lib_sources = [
    ("/components/espnow_82xx_remote/remote_protocol.cpp", "remote_protocol.cpp"),
    ("/components/espnow_82xx_remote/remote_file_receiver.cpp", "remote_file_receiver.cpp"),
    ("/components/esp_tree_common/espnow_crypto.cpp", "espnow_crypto.cpp"),
]
for src, dst_name in lib_sources:
    src_path = src
    dst_path = os.path.join(project_dir, "src", dst_name)
    if os.path.exists(src_path):
        shutil.copy2(src_path, dst_path)  # Always overwrite

# Copy compat shims to src/esphome/ so they're found via #include "esphome/core/..."
compat_base = os.path.join(project_dir, "compat")
compat_dst = os.path.join(project_dir, "src")
compat_files = [
    "esphome/core/hal.h",
    "esphome/core/log.h",
    "esphome/core/defines.h",
    "esphome/core/application.h",
    "esphome/components/md5/md5.h",
    "esphome/components/wifi/wifi_component.h",
]
for f in compat_files:
    src_path = os.path.join(compat_base, f)
    dst_path = os.path.join(compat_dst, f)
    if os.path.exists(src_path):
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        shutil.copy2(src_path, dst_path)  # Always overwrite
