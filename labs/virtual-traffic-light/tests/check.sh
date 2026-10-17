#!/usr/bin/env bash
# Run the repo's own tools/check.sh (unchanged) with the Playwright installed in this folder,
# so nothing has to be installed globally.
# Usage: labs/virtual-traffic-light/tests/check.sh lessons/lab1-light-it-up "0,3,6" [wait_ms]
# Screenshots go to $VLAB_SHOTS/<page>/ (default: labs/virtual-traffic-light/tests/.out/shots/<page>/).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
[ -d "$HERE/node_modules/playwright" ] || { echo "Run 'npm install' in $HERE first." >&2; exit 1; }
# tools/check.sh copies the whole repo into its output folder, so that folder must live outside the repo.
# Node finds 'playwright' by walking up from the output folder, so we put a node_modules link next to it.
BASE="${VLAB_CHECK_BASE:-${TMPDIR:-/tmp}/vlab-check}"
mkdir -p "$BASE"
ln -sfn "$HERE/node_modules" "$BASE/node_modules"
NAME="$(echo "$1" | tr '/' '_')"
export OUT="$BASE/$NAME"
rm -rf "$OUT/site"
bash "$ROOT/tools/check.sh" "$@"
SHOTS="${VLAB_SHOTS:-$HERE/.out/shots}/$NAME"
mkdir -p "$SHOTS" && cp "$OUT"/step*.png "$SHOTS/" && echo "Copied screenshots to $SHOTS"
