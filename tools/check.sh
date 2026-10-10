#!/usr/bin/env bash
# Screenshot a lesson in headless Chromium and report script errors.
# Usage: tools/check.sh lessons/01-traffic-light "0,3,6" [wait_ms]
# The cloud sandbox may block the CDNs, so this swaps three.js for a local copy from npm.
# The page is served over http://localhost, because Chromium blocks loading .glb models from file:// pages.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LESSON="$1"; STEPS="${2:-0}"; WAIT="${3:-9000}"
OUT="${OUT:-/tmp/iotkids-shots}"; mkdir -p "$OUT/lib"
if [ ! -f "$OUT/lib/package/build/three.min.js" ]; then
  (cd "$OUT/lib" && npm pack three@0.128.0 >/dev/null 2>&1 && tar xzf three-0.128.0.tgz)
fi
rm -rf "$OUT/site"; mkdir -p "$OUT/site"; cp -r "$ROOT"/. "$OUT/site/"; cp -r "$OUT/lib/package" "$OUT/site/_three"
PAGE="$OUT/site/$LESSON/index.html"
sed -i -e "s#https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js#/_three/build/three.min.js#" \
       -e "s#https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js#/_three/examples/js/controls/OrbitControls.js#" \
       -e '/fonts.googleapis/d' "$PAGE"
sed -i "s#https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js#/_three/examples/js/loaders/GLTFLoader.js#" "$OUT/site/assets/road/model-road.js"
PORT="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$OUT/site" >/dev/null 2>&1 &
SERVER=$!; trap 'kill $SERVER 2>/dev/null' EXIT; sleep 1
cat > "$OUT/shot.js" <<JS
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const [w, h] of [[1400, 860], [400, 820]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto('http://127.0.0.1:$PORT/$LESSON/index.html');
    await p.waitForTimeout(2500);
    for (const s of '$STEPS'.split(',').map(Number)) {
      if (w < 600 && s !== 0) continue;
      await p.evaluate((i) => window.__lesson && window.__lesson.goTo(i), s);
      await p.waitForTimeout($WAIT);
      await p.screenshot({ path: '$OUT/step' + s + '_' + w + '.png', fullPage: w < 600 });
    }
    console.log('page width ' + w + ': scrollWidth=' + await p.evaluate(() => document.documentElement.scrollWidth));
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
JS
NODE_PATH="$(npm root -g)" node "$OUT/shot.js"
echo "Screenshots in $OUT"
