"""Collect the flash images for a built PlatformIO environment.

Offsets come from PlatformIO's own project metadata (extra.flash_images + application_offset), so they are
right for every chip. If the metadata is missing, fall back to the classic ESP32 layout.
Writes out/manifest.json: {"images": [{"name", "address", "file"}]} and copies each image into out/.
"""
import json
import os
import shutil
import subprocess
import sys

env = sys.argv[1]
project = "/work/project"
build = os.path.join(project, ".pio", "build", env)
out = os.path.join(project, "out")
os.makedirs(out, exist_ok=True)

images = []
try:
    raw = subprocess.check_output(["pio", "project", "metadata", "-e", env, "--json-output"], cwd=project)
    meta = json.loads(raw)[env]
    extra = meta.get("extra", {})
    for item in extra.get("flash_images", []):
        images.append((int(str(item["offset"]), 0), item["path"]))
    app_offset = int(str(extra.get("application_offset", "0x10000")), 0)
    images.append((app_offset, os.path.join(build, "firmware.bin")))
except Exception as exc:  # metadata unavailable: classic ESP32 layout
    print("metadata unavailable, using classic ESP32 offsets:", exc, file=sys.stderr)
    home = os.path.expanduser("~/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin")
    images = [
        (0x1000, os.path.join(build, "bootloader.bin")),
        (0x8000, os.path.join(build, "partitions.bin")),
        (0xE000, home),
        (0x10000, os.path.join(build, "firmware.bin")),
    ]

manifest = []
for address, path in sorted(images):
    name = os.path.basename(path)
    shutil.copyfile(path, os.path.join(out, name))
    manifest.append({"name": name, "address": address, "file": name})

with open(os.path.join(out, "manifest.json"), "w") as f:
    json.dump({"images": manifest}, f)
print(json.dumps({"images": manifest}))
