// Render the two pupils inside the real story scene (assets/story/future-world.js): the same sky, sun, hemisphere light,
// filmic (ACES) colour and exposure the home page uses, at the crossing while both children wave.
// Usage: node story_render.mjs <site_dir> <out_dir> [three_package_dir]
//   site_dir: a copy of the site whose assets/story/models/child_a.glb and child_b.glb are the models to check.
//   three_package_dir: a local three@0.128.0 npm package (otherwise three.js is fetched from the CDNs).
// Needs Playwright (Chromium). Writes story_wide.png and story_faces.png (1024 x 1024).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // set NODE_PATH to a global install if it is not local
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const [site, out, three] = process.argv.slice(2);
const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.exr': 'application/octet-stream', '.wasm': 'application/wasm', '.html': 'text/html' };
const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><div id="h" style="width:1024px;height:1024px"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="assets/story/future-world.js"></script>
<script>
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(1024, 1024);
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputEncoding = THREE.sRGBEncoding; r.toneMappingExposure = 0.9; // as story-scene.js
document.getElementById('h').appendChild(r.domElement);
const f = KKFuture.create({ renderer: r, base: '', low: false }); f.resize(1);
window.__f = f;
window.shot = (p, t) => { f.update(10.6, 0); f.camera.position.set(...p); f.camera.lookAt(...t); f.camera.updateProjectionMatrix(); r.render(f.scene, f.camera); };
</script></body></html>`;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
if (three) {
  await p.route('**/three.min.js', (r) => r.fulfill({ path: join(three, 'build/three.min.js'), contentType: 'text/javascript' }));
  await p.route('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/**', (r) => r.fulfill({ path: join(three, 'examples/js', new URL(r.request().url()).pathname.split('/examples/js/')[1]) }));
}
await p.route('http://kk.local/**', async (r) => {
  const path = decodeURIComponent(new URL(r.request().url()).pathname);
  if (path === '/story.html') return r.fulfill({ body: PAGE, contentType: 'text/html' });
  try { r.fulfill({ body: await readFile(join(site, path)), contentType: TYPES[extname(path)] || 'application/octet-stream' }); } catch (e) { r.fulfill({ status: 404, body: '' }); }
});
await p.goto('http://kk.local/story.html');
await p.waitForFunction(() => window.__f, null, { timeout: 120000 });
await p.evaluate(() => window.__f.ready);
await p.waitForTimeout(1500);
for (const [name, cam, tgt] of [['wide', [-0.5, 1.25, 7.6], [-0.5, 0.95, 4.35]], ['faces', [-0.5, 1.32, 6.7], [-0.5, 1.12, 4.35]]]) {
  await p.evaluate(([c, t]) => window.shot(c, t), [cam, tgt]);
  await p.screenshot({ path: join(out, `story_${name}.png`) });
}
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'STORY RENDERED');
await b.close();
