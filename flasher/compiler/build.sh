#!/bin/sh
# Compile the project in /work/project for one PlatformIO environment, then collect the flash images
# (bootloader, partitions, boot_app0, firmware) with their offsets into /work/project/out/manifest.json.
# Usage (inside the container): build.sh <env>
set -eu
ENV_NAME="${1:?environment name required}"
cd /work/project
# give the files back to the user who started the container, so the server can delete its temp dir
trap 'chown -R "${HOST_UID:-0}:${HOST_GID:-0}" /work/project 2>/dev/null || true' EXIT
pio run -e "$ENV_NAME"
python3 /opt/kundakode/collect.py "$ENV_NAME"
