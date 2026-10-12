/* The opening of the home page story: a short flight through a future Rwandan town, before the ESP32 appears.
   A delivery drone flies over the hills, a robot waves in front of a smart home whose lights switch themselves on,
   and a self-driving car sees a child at the zebra crossing and stops. Then the story dives into the ESP32
   ("It all starts with a tiny computer like this one").

   Everything is modelled in code, except the robot and the car (assets/story/models, see assets/story/CREDITS.md).
   The models load in the background; the flight plays without them until they arrive.

   Usage (from assets/story/story-scene.js):
     const f = KKFuture.create({ renderer, base: '', low });   // low = a phone: fewer trees and houses
     f.LEN                     // seconds of flight before the ESP32
     f.update(t, dt)           // set the world and the camera for time t (seconds into the story)
     f.resize(aspect)
     renderer.render(f.scene, f.camera)  with ACES tone mapping and sRGB output (story-scene does this)
   Units are metres. The road runs along x, the zebra crossing is at x = 0. */
(function () {
'use strict';
const LIB = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
function script(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}

function create(o) {
const THREE = window.THREE, renderer = o.renderer, BASE = (o.base || '') + 'assets/', low = !!o.low;
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

/* ---------- the beats (seconds) ---------- */
const DRONE = [0, 3.6], HOME = [3.6, 6.6], CAR = [6.6, 11];
const LEN = CAR[1];

/* ---------- helpers ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const mat = (hex, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: C(hex), roughness: 0.6, metalness: 0 }, p));
const phys = (hex, p = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(hex), roughness: 0.3, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 }, p));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const lerp = (a, b, f) => a + (b - a) * f;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function add(parent, geo, m, x = 0, y = 0, z = 0, shadow = true) {
  const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.castShadow = shadow; k.receiveShadow = true; parent.add(k); return k;
}
const box = (p, w, h, d, m, x, y, z, sh) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, sh);
const cyl = (p, rt, rb, h, m, x, y, z, seg = 20, sh) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, sh);
const sph = (p, r, m, x, y, z, sh) => add(p, new THREE.SphereGeometry(r, 20, 14), m, x, y, z, sh);
function rshape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function rboxGeo(w, h, d, r) {
  const g = new THREE.ExtrudeGeometry(rshape(w - 2 * r, h - 2 * r, Math.min(r, (w - 2 * r) / 2, (h - 2 * r) / 2) * 0.999 || 0.0001), { depth: Math.max(0.0001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g;
}
const rbox = (p, w, h, d, r, m, x, y, z, sh) => add(p, rboxGeo(w, h, d, r), m, x, y, z, sh);
// a rounded stick: limbs of the children, struts of the drone. The top end sits at the origin, it hangs down
function limbGeo(r, len, seg = 12) {
  const pts = [];
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r + 1e-4, -len + Math.sin(a) * r)); }
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r + 1e-4, Math.sin(a) * r)); }
  return new THREE.LatheGeometry(pts, seg);
}
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const softDot = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
softDot.encoding = THREE.LinearEncoding;
const glowDot = (parent, hex, size, x, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: hex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); sp.position.set(x, y, z); sp.scale.setScalar(size); parent.add(sp); return sp; };

/* ---------- scene, sky, light ---------- */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 1200);
const HAZE = 0xcfe1ea;
scene.fog = new THREE.Fog(C(HAZE), 60, 520);
// the sky: a big dome that follows the camera, blue above, hazy near the hills
const skyTex = canvasTex(16, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3f86cf'); gr.addColorStop(0.32, '#7db6e3'); gr.addColorStop(0.48, '#cfe4f1'); gr.addColorStop(0.52, '#dbe8ee'); gr.addColorStop(1, '#dbe8ee');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }));
sky.renderOrder = -1; scene.add(sky);
// a few soft clouds
const cloudTex = canvasTex(256, 128, (g, w, h) => {
  for (let i = 0; i < 26; i++) {
    const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 18 + rnd() * 30, gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
});
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + rnd(), r = 420 + rnd() * 160;
  const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false }));
  c.position.set(Math.cos(a) * r, 120 + rnd() * 80, Math.sin(a) * r); c.scale.set(260 + rnd() * 120, 110, 1); scene.add(c);
}
const hemi = new THREE.HemisphereLight(C(0xf4f1ea), C(0x6b5a3a), 0.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(C(0xfff0d8), 2.3);
sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 120 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = V(-0.45, 0.8, 0.4).normalize();
function sunAt(p, size) {
  sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN_DIR, 60);
  const c = sun.shadow.camera; if (c.right !== size) { c.left = c.bottom = -size; c.right = c.top = size; c.updateProjectionMatrix(); }
}
// reflections: a studio light first, the real outdoor sky (assets/projects/sky/park.exr) when it arrives
const pm = new THREE.PMREMGenerator(renderer);
const libs = (async () => {
  if (!THREE.GLTFLoader) await script(LIB + 'loaders/GLTFLoader.js');
  if (!THREE.DRACOLoader) await script(LIB + 'loaders/DRACOLoader.js');
  if (!THREE.RoomEnvironment) await script(LIB + 'environments/RoomEnvironment.js');
})();
libs.then(() => { if (!scene.environment) scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; }).catch(() => {});
libs.then(async () => {
  if (!window.fflate) await script(LIB + 'libs/fflate.min.js');
  if (!THREE.EXRLoader) await script(LIB + 'loaders/EXRLoader.js');
  new THREE.EXRLoader().setDataType(THREE.HalfFloatType).load(BASE + 'projects/sky/park.exr', (t) => { scene.environment = pm.fromEquirectangular(t).texture; t.dispose(); });
}).catch(() => {});

/* ---------- the land of a thousand hills ---------- */
// flat in the valley where the town is, rolling green hills all around
function hillShape(x, z) {
  return Math.sin(x * 0.017 + 1.3) * Math.cos(z * 0.021 - 0.4) * 0.55 + Math.sin(x * 0.041 + z * 0.033 + 2.1) * 0.3 + Math.sin(x * 0.087 - z * 0.071) * 0.15;
}
function groundY(x, z) {
  const d = Math.hypot(x * 0.75, z), rise = smooth(48, 150, d);
  return rise * (hillShape(x, z) * 0.5 + 0.62) * 52 + rise * rise * 10;
}
const grain = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const v = 150 + rnd() * 105; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2); }
}, [90, 90]);
{
  const S = 900, N = low ? 120 : 190, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = groundY(x, z); p.setY(i, y);
    const d = Math.hypot(x * 0.75, z), patch = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.13 + Math.sin(x * 0.05) * 2);
    // terraced fields on the slopes: bands of lighter and darker green, a few ploughed red-brown plots
    const band = (y / 1.7) % 1, slope = smooth(50, 90, d);
    let h = 0.25 + patch * 0.03, s = 0.5, l = 0.27 + patch * 0.05;
    if (slope > 0) { l += (band < 0.5 ? 0.035 : -0.02) * slope; const f = Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.29 - x * 0.11); if (patch > 0.75 && f > 0.3) { h = 0.06; s = 0.38; l = 0.3; } else if (patch < -0.7 && f < -0.2) { h = 0.17; s = 0.42; l = 0.33; } }
    if (d < 40) { h = 0.24 + patch * 0.02; s = 0.45; l = 0.3 + patch * 0.03; }
    c.setHSL(h, s, l).convertSRGBToLinear(); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.95 }));
  land.receiveShadow = true; scene.add(land);
}
// trees on the hills (eucalyptus and bushes) and small houses with red roofs, all drawn at once
{
  const nT = low ? 260 : 600, trunkG = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); trunkG.translate(0, 0.5, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkG, mat(0x6d5a44, { roughness: 0.9 }), nT), crowns = new THREE.InstancedMesh(crownG, mat(0xffffff, { roughness: 0.85, flatShading: true }), nT);
  const q = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < nT; i++) {
    let x, z, d; do { x = (rnd() - 0.5) * 520; z = (rnd() - 0.5) * 520; d = Math.hypot(x * 0.75, z); } while (d < 26 || (Math.abs(z) < 9 && d < 70));
    const y = groundY(x, z), hgt = 4 + rnd() * 7;
    q.position.set(x, y - 0.2, z); q.rotation.set(0, rnd() * 6, 0); q.scale.set(1, hgt * 0.6, 1); q.updateMatrix(); trunks.setMatrixAt(i, q.matrix);
    q.position.set(x, y + hgt * 0.62, z); q.scale.set(1.6 + rnd() * 1.6, hgt * 0.38, 1.6 + rnd() * 1.6); q.updateMatrix(); crowns.setMatrixAt(i, q.matrix);
    c.setHSL(0.26 + rnd() * 0.07, 0.35 + rnd() * 0.2, 0.16 + rnd() * 0.1).convertSRGBToLinear(); crowns.setColorAt(i, c);
  }
  trunks.castShadow = crowns.castShadow = true; trunks.receiveShadow = crowns.receiveShadow = true; scene.add(trunks, crowns);
  const nH = low ? 70 : 150, wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);
  const gable = new THREE.Shape(); gable.moveTo(-0.5, 0); gable.lineTo(0.5, 0); gable.lineTo(0, 1); gable.closePath();
  const roofG = new THREE.ExtrudeGeometry(gable, { depth: 1, bevelEnabled: false }); roofG.translate(0, 0, -0.5); roofG.rotateY(Math.PI / 2); // the ridge runs along x
  const walls = new THREE.InstancedMesh(wallG, mat(0xffffff, { roughness: 0.9 }), nH), roofs = new THREE.InstancedMesh(roofG, mat(0xffffff, { roughness: 0.6, metalness: 0.3 }), nH);
  for (let i = 0; i < nH; i++) {
    let x, z, d; do { x = (rnd() - 0.5) * 460; z = (rnd() - 0.5) * 460; d = Math.hypot(x * 0.75, z); } while (d < 52);
    const y = groundY(x, z), w = 5 + rnd() * 4, dd = 4 + rnd() * 2, hh = 2.6 + rnd() * 0.6, ry = rnd() * 3;
    q.rotation.set(0, ry, 0); q.position.set(x, y - 0.6, z); q.scale.set(w, hh + 0.6, dd); q.updateMatrix(); walls.setMatrixAt(i, q.matrix);
    c.setHSL(0.09 + rnd() * 0.04, 0.3 + rnd() * 0.2, 0.72 + rnd() * 0.12).convertSRGBToLinear(); walls.setColorAt(i, c);
    q.position.set(x, y + hh, z); q.scale.set(w * 1.08, 1.5, dd * 1.15); q.updateMatrix(); roofs.setMatrixAt(i, q.matrix);
    const r = rnd(); c.set(r < 0.55 ? 0x8a3326 : r < 0.8 ? 0x9aa3a8 : 0x3c5a7a).convertSRGBToLinear(); roofs.setColorAt(i, c);
  }
  walls.castShadow = roofs.castShadow = true; walls.receiveShadow = true; scene.add(walls, roofs);
}

/* ---------- the town: road, zebra crossing, pavements ---------- */
const asphalt = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#4a4d51'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) { const v = 50 + rnd() * 70; g.fillStyle = `rgba(${v},${v},${v + 3},.5)`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
}, [60, 2]);
const road = add(scene, new THREE.PlaneGeometry(400, 7), mat(0xffffff, { map: asphalt, roughness: 0.92 }), 0, 0.02, 0, false); road.rotation.x = -Math.PI / 2;
const paint = mat(0xf4f4f0, { roughness: 0.7 });
for (let x = -200; x < 200; x += 6) if (Math.abs(x + 1.5) > 6) box(scene, 3, 0.01, 0.14, paint, x + 1.5, 0.03, 0, false); // the dashed centre line
for (const z of [-3.3, 3.3]) box(scene, 400, 0.01, 0.12, paint, 0, 0.03, z, false);
for (let k = 0; k < 7; k++) box(scene, 3, 0.012, 0.5, paint, 0, 0.032, -3 + k, false); // zebra crossing: stripes you step over
for (const z of [-2.25, 2.25]) box(scene, 0.25, 0.012, 2.4, paint, z > 0 ? -2.6 : 2.6, 0.032, z, false); // stop lines before the crossing
const paveM = mat(0xb9b2a6, { map: grain, roughness: 0.9 });
const KERB = 0.12;
for (const z of [-4.7, 4.7]) { box(scene, 400, KERB, 2.6, paveM, 0, KERB / 2, z); box(scene, 400, KERB + 0.02, 0.18, mat(0xe8e4dc), 0, (KERB + 0.02) / 2, z > 0 ? 3.45 : -3.45); }
// crossing signs: a blue square with a walking figure, either side of the road
const signTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 14); g.lineTo(114, 104); g.lineTo(14, 104); g.closePath(); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(66, 46, 7, 0, 7); g.fill(); g.lineWidth = 7; g.strokeStyle = '#111'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(64, 56); g.lineTo(60, 76); g.lineTo(50, 94); g.moveTo(60, 76); g.lineTo(72, 94); g.moveTo(62, 62); g.lineTo(50, 72); g.moveTo(62, 62); g.lineTo(76, 70); g.stroke();
});
for (const [x, z] of [[-2.2, 4.0], [2.2, -4.0]]) {
  cyl(scene, 0.04, 0.04, 2.6, mat(0x9aa0a6, { metalness: 0.2, roughness: 0.5 }), x, 1.3, z, 10);
  const s = box(scene, 0.6, 0.6, 0.03, mat(0xffffff, { map: signTex, roughness: 0.5 }), x, 2.4, z); s.rotation.y = x < 0 ? 0 : Math.PI;
}
// solar street lights along the road
for (let x = -60; x <= 60; x += 20) for (const z of [-5.6, 5.6]) {
  if (Math.abs(x) < 6 || (z < 0 && Math.abs(x - 20) < 6)) continue; // keep the crossing and the smart home in clear view
  cyl(scene, 0.06, 0.08, 6, mat(0x8b939b, { metalness: 0.2, roughness: 0.5 }), x, 3, z, 10);
  box(scene, 0.08, 0.08, 1.4, mat(0x8b939b, { metalness: 0.2, roughness: 0.5 }), x, 5.9, z - Math.sign(z) * 0.65);
  box(scene, 0.32, 0.08, 0.5, mat(0x30343a), x, 5.85, z - Math.sign(z) * 1.3);
  const pnl = box(scene, 0.9, 0.04, 0.6, phys(0x1b2f5c, { metalness: 0.4, roughness: 0.25 }), x, 6.15, z); pnl.rotation.x = 0.35 * Math.sign(z);
}

/* ---------- houses ---------- */
const plasterTex = (base) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,70,50'},${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
}, [3, 2]);
const tinTex = (hex) => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = hex; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(0.5, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(255,255,255,.22)'); g.fillStyle = gr; g.fillRect(x, 0, 8, h); }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(110,55,30,.25)'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 4 + rnd() * 20); }
}, [4, 1]);
const glassM = phys(0x223040, { roughness: 0.08, metalness: 0.2, clearcoat: 1 });
// a house facing +z: plastered walls, a painted band, door, windows, and a gable roof of iron sheets
function house(x, z, ry, o = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  const W = o.w || 8, D = o.d || 6, H = o.h || 2.9;
  box(g, W, H, D, mat(0xffffff, { map: plasterTex(o.wall || '#ecdcbf'), roughness: 0.92 }), 0, H / 2, 0);
  box(g, W + 0.02, 0.6, D + 0.02, mat(o.band || 0x8c4a2f, { roughness: 0.85 }), 0, 0.3, 0, false);
  const pitch = 0.42, half = D / 2 + 0.5, len = half / Math.cos(pitch), roofM = mat(0xffffff, { map: tinTex(o.roof || '#8a3326'), metalness: 0.45, roughness: 0.45, side: THREE.DoubleSide });
  const slopes = [];
  for (const s of [1, -1]) {
    const r = add(g, new THREE.PlaneGeometry(W + 0.6, len), roofM, 0, H + Math.tan(pitch) * (half / 2 - 0.5), s * half / 2); // eaves 0.5 m past the walls
    r.rotation.x = -Math.PI / 2 + s * pitch; slopes.push(r);
  }
  // the gable ends (triangles of wall under the roof)
  const tri = new THREE.Shape(); tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, Math.tan(pitch) * (D / 2)); tri.closePath();
  for (const s of [1, -1]) { const m = add(g, new THREE.ShapeGeometry(tri), mat(0xffffff, { map: plasterTex(o.wall || '#ecdcbf'), roughness: 0.92, side: THREE.DoubleSide }), s * W / 2, H, 0); m.rotation.y = Math.PI / 2; }
  box(g, 1.0, 2.1, 0.08, mat(o.door || 0x2f5d8a, { roughness: 0.5 }), o.doorX || 0, 1.05, D / 2 + 0.03);
  const wins = [];
  for (const wx of o.windows || [-W / 3, W / 3]) {
    box(g, 1.3, 1.2, 0.06, mat(0xf4f1ea), wx, 1.65, D / 2 + 0.02, false);
    const wm = glassM.clone(); wm.emissive = C(0xffc477); wm.emissiveIntensity = 0;
    wins.push(box(g, 1.12, 1.02, 0.07, wm, wx, 1.65, D / 2 + 0.03, false).material);
    box(g, 0.05, 1.02, 0.08, mat(0xf4f1ea), wx, 1.65, D / 2 + 0.035, false);
  }
  return { g, W, D, H, pitch, half, slopes, wins };
}
// the town along the road
const town = [
  [-30, -12, 0, { wall: '#e9d7b8', roof: '#8a3326' }], [-16, -13, 0, { wall: '#d9e3d0', roof: '#7c8790', door: 0x7a3b22 }],
  [-34, 13, Math.PI, { wall: '#f0e2c8', roof: '#3c5a7a' }], [-18, 12.5, Math.PI, { wall: '#ead2b4', roof: '#8a3326', door: 0x2c6e49 }],
  [8, 13, Math.PI, { wall: '#e7dcc8', roof: '#9a4a2a' }], [36, -13, 0, { wall: '#efe0c4', roof: '#7c8790' }], [44, 12, Math.PI, { wall: '#e3d6c0', roof: '#8a3326' }],
];
town.forEach(([x, z, ry, oo]) => house(x, z, ry, oo));

/* ---------- banana trees ---------- */
const leafTex = canvasTex(512, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3f7f2e'); gr.addColorStop(0.5, '#6aa84a'); gr.addColorStop(1, '#3f7f2e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(30,70,20,.35)'; g.lineWidth = 1; for (let x = 0; x < w; x += 5) { g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 18, 0); g.moveTo(x, h / 2); g.lineTo(x + 18, h); g.stroke(); }
  g.fillStyle = '#c9d98a'; g.fillRect(0, h / 2 - 3, w, 6);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) { const x = 40 + rnd() * (w - 60), top = rnd() < 0.5; g.beginPath(); g.moveTo(x, top ? 0 : h); g.lineTo(x + 6 + rnd() * 10, top ? 0 : h); g.lineTo(x + 20, top ? h * 0.42 : h * 0.58); g.fill(); }
});
const leafM = mat(0xffffff, { map: leafTex, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5 });
const trunkM = mat(0x7d8a4c, { roughness: 0.85 });
function leafGeo(len, wid, droop) {
  const g = new THREE.PlaneGeometry(len, wid, 12, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + len / 2, f = x / len, y = p.getY(i); p.setXYZ(i, x, -droop * f * f * len + Math.abs(y) * 0.25, y * Math.sin(Math.PI * Math.min(1, f * 1.15 + 0.05))); }
  g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
}
const leafGeos = [0, 1, 2].map((i) => leafGeo(1.6 + i * 0.3, 0.55, 0.35 + i * 0.18));
function banana(x, z, h = 2.6, s0 = 0) {
  const g = new THREE.Group(); g.position.set(x, groundY(x, z), z); scene.add(g);
  cyl(g, 0.12, 0.17, h, trunkM, 0, h / 2, 0, 12);
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(leafGeos[i % 3], leafM); l.castShadow = true; l.position.y = h - 0.05 + (i % 2) * 0.08; l.rotation.set(0, (i / 9) * Math.PI * 2 + s0, 0.35 + (i % 4) * 0.14); g.add(l); }
  return g;
}
[[-24, -8.5], [-11, -9], [-8, 9.5], [-26, 9], [12, -9.5], [28, -9.5], [3, 9.2], [15, 9.5], [-40, -9], [31, 8.5], [24, -21], [12, -21]].forEach(([x, z], i) => banana(x, z, 2.3 + (i % 3) * 0.4, i));

/* ---------- the smart home: solar panels, lights that switch themselves on, a robot helper ---------- */
const HOMEP = V(20, 0, -15);
const home = house(HOMEP.x, HOMEP.z, 0, { w: 10, d: 7, h: 3.1, wall: '#f3ead8', band: 0x2f6f8f, roof: '#7c8790', door: 0x3a2a1e, windows: [-3.2, 3.2] });
{
  // solar panels on the front slope of the roof
  const cells = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9d3dc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const gr = g.createLinearGradient(0, j * 42, 0, j * 42 + 40); gr.addColorStop(0, '#22406e'); gr.addColorStop(1, '#13264a'); g.fillStyle = gr; g.fillRect(i * 42 + 3, j * 42 + 3, 38, 38); }
  });
  const pm2 = phys(0xffffff, { map: cells, metalness: 0.3, roughness: 0.18, clearcoat: 1 });
  const front = home.slopes[0];
  for (let i = 0; i < 4; i++) { const pnl = box(front, 1.6, 2.1, 0.06, pm2, -3.3 + i * 2.2, 0.1, 0.06); void pnl; }
  // a porch light by the door and a little camera above it
  const lampM = mat(0xfff3d6, { emissive: C(0xffd28a), emissiveIntensity: 0 });
  home.wins.push(sph(home.g, 0.12, lampM, 0.9, 2.45, home.D / 2 + 0.12).material);
  home.porch = glowDot(home.g, 0xffd28a, 1.6, 0.9, 2.45, home.D / 2 + 0.2);
  // window light spilling out
  home.glows = [-3.2, 3.2].map((wx) => glowDot(home.g, 0xffc477, 3.2, wx, 1.65, home.D / 2 + 0.3));
  // a low wall and gate around the yard, and a path to the door
  const wallM = mat(0xffffff, { map: plasterTex('#efe2c9'), roughness: 0.92 }), capM = mat(0xb4562e, { roughness: 0.8 });
  for (const [x0, x1] of [[13.5, 18.4], [21.6, 26.5]]) { box(scene, x1 - x0, 1.0, 0.2, wallM, (x0 + x1) / 2, 0.5, -6.6); box(scene, x1 - x0 + 0.04, 0.06, 0.28, capM, (x0 + x1) / 2, 1.03, -6.6); }
  for (const x of [13.5, 26.5]) { box(scene, 0.2, 1.0, 5.4, wallM, x, 0.5, -9.3); box(scene, 0.28, 0.06, 5.44, capM, x, 1.03, -9.3); }
  const path = add(scene, new THREE.PlaneGeometry(1.6, 4.9), mat(0xc7b9a2, { map: grain, roughness: 0.9 }), 20, 0.035, -9.05, false); path.rotation.x = -Math.PI / 2;
  // flowers along the house
  const flowerC = [0xe8434f, 0xf5c518, 0xf08a3c, 0xffffff];
  for (let i = 0; i < 26; i++) { const x = 14.5 + (i / 25) * 11; if (Math.abs(x - 20) < 1.2) continue; sph(scene, 0.12 + rnd() * 0.05, mat(0x3f7f2e), x, 0.14, -11.15 + rnd() * 0.2); sph(scene, 0.05, mat(flowerC[i % 4], { roughness: 0.5 }), x + 0.03, 0.27, -11.05 + rnd() * 0.2, false); }
}
let homeLights = -1;
function setHomeLights(k) {
  if (k === homeLights) return; homeLights = k;
  home.wins.forEach((m, i) => { m.emissiveIntensity = clamp01(k * 3 - i * 0.6) * (i === home.wins.length - 1 ? 2.2 : 1.6); });
  home.glows.forEach((s, i) => { s.material.opacity = clamp01(k * 3 - i * 0.6) * 0.55; });
  home.porch.material.opacity = clamp01(k * 3 - 1.2) * 0.7;
}

/* ---------- children, modelled in code ---------- */
const SKIN = [0x5b3a24, 0x4a2e1c, 0x6e4529];
function child(o = {}) {
  const g = new THREE.Group(); scene.add(g);
  const body = new THREE.Group(); g.add(body);
  const skin = mat(o.skin || SKIN[0], { roughness: 0.55 }), shirt = mat(o.shirt || 0x5aa0d8, { roughness: 0.75 }), shorts = mat(o.shorts || 0x2f3c55, { roughness: 0.8 });
  const shoeM = mat(o.shoes || 0x222222, { roughness: 0.5 }), sockM = mat(0xf2f2f2, { roughness: 0.8 });
  const HIP = 0.66;
  // the shirt and shorts
  const torso = add(body, limbGeo(0.15, 0.26, 16), shirt, 0, HIP + 0.42, 0); torso.scale.set(1, 1, 0.72);
  const hips = add(body, new THREE.CylinderGeometry(0.15, 0.15, 0.16, 16), shorts, 0, HIP + 0.03, 0); hips.scale.set(1, 1, 0.75);
  cyl(body, 0.045, 0.05, 0.08, skin, 0, HIP + 0.5, 0, 10);
  // the head: face, eyes, smile, ears and short hair
  const head = new THREE.Group(); head.position.set(0, HIP + 0.66, 0); body.add(head);
  const skull = sph(head, 0.125, skin, 0, 0, 0); skull.scale.set(1, 1.08, 1);
  const hair = add(head, new THREE.SphereGeometry(0.131, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(0x141414, { roughness: 0.95 }), 0, 0.012, -0.006); hair.scale.set(1, 1.08, 1); hair.rotation.x = -0.25;
  for (const s of [-1, 1]) {
    sph(head, 0.025, skin, s * 0.123, -0.005, 0, false);
    sph(head, 0.02, mat(0xffffff, { roughness: 0.3 }), s * 0.042, 0.02, 0.108, false).scale.set(1, 1.2, 0.6);
    sph(head, 0.012, mat(0x161010, { roughness: 0.2 }), s * 0.042, 0.02, 0.118, false);
  }
  const smile = add(head, new THREE.TorusGeometry(0.035, 0.007, 6, 12, Math.PI), mat(0x5e1f1f), 0, -0.045, 0.112, false); smile.rotation.z = Math.PI;
  // a school bag
  if (o.bag) { rbox(body, 0.24, 0.3, 0.12, 0.03, mat(o.bag, { roughness: 0.6 }), 0, HIP + 0.36, -0.15); }
  // arms: shoulder → elbow → hand. Legs: hip → knee → foot. Each joint is a group that turns
  function arm(s) {
    const sh = new THREE.Group(); sh.position.set(s * 0.19, HIP + 0.43, 0); body.add(sh);
    add(sh, limbGeo(0.055, 0.1, 10), shirt); // the sleeve
    add(sh, limbGeo(0.04, 0.2, 10), skin);
    const el = new THREE.Group(); el.position.y = -0.21; sh.add(el);
    add(el, limbGeo(0.037, 0.17, 10), skin); sph(el, 0.045, skin, 0, -0.2, 0.0);
    return { sh, el };
  }
  function leg(s) {
    const hp = new THREE.Group(); hp.position.set(s * 0.075, HIP, 0); body.add(hp);
    add(hp, limbGeo(0.068, 0.1, 10), shorts);
    add(hp, limbGeo(0.052, 0.27, 10), skin);
    const kn = new THREE.Group(); kn.position.y = -0.3; hp.add(kn);
    add(kn, limbGeo(0.047, 0.26, 10), skin);
    add(kn, limbGeo(0.05, 0.06, 10), sockM, 0, -0.2, 0);
    rbox(kn, 0.1, 0.07, 0.19, 0.03, shoeM, 0, -0.32, 0.035);
    return { hp, kn };
  }
  const L = { arm: arm(1), leg: leg(1) }, R = { arm: arm(-1), leg: leg(-1) };
  const k = { g, body, head };
  // walk: legs and arms swing in turn; wave: the right arm up, the hand going side to side
  k.pose = (t, walk = 0, wave = 0, speed = 1.6) => {
    const p = t * Math.PI * 2 * speed, sw = Math.sin(p) * 0.55 * walk;
    L.leg.hp.rotation.x = -sw; R.leg.hp.rotation.x = sw;
    L.leg.kn.rotation.x = Math.max(0, Math.sin(p - 1.4)) * 0.9 * walk; R.leg.kn.rotation.x = Math.max(0, Math.sin(p + Math.PI - 1.4)) * 0.9 * walk;
    L.arm.sh.rotation.x = sw * 0.8; R.arm.sh.rotation.x = -sw * 0.8 * (1 - wave);
    L.arm.el.rotation.x = -0.25 - walk * 0.25; R.arm.el.rotation.x = (-0.25 - walk * 0.25) * (1 - wave);
    L.arm.sh.rotation.z = 0.08; R.arm.sh.rotation.z = lerp(-0.08, -2.75, wave);
    R.arm.el.rotation.z = wave * Math.sin(t * 9) * 0.45;
    body.position.y = Math.abs(Math.sin(p)) * 0.035 * walk;
    head.rotation.z = Math.sin(p) * 0.03 * walk;
  };
  k.pose(0);
  return k;
}
const kid = child({ shirt: 0x6fb2e6, shorts: 0x2a3a5c, bag: 0xf08a24 }); // a primary school uniform, an orange school bag

/* ---------- the delivery drone ---------- */
const drone = new THREE.Group(); scene.add(drone);
const props = [], blurs = [];
{
  const D = new THREE.Group(); D.scale.setScalar(1.7); drone.add(D);
  const white = phys(0xf5f7fa, { roughness: 0.25 }), carbon = mat(0x1e2226, { roughness: 0.4, metalness: 0.3 }), orange = phys(0xf08a24, { roughness: 0.3 });
  rbox(D, 0.34, 0.12, 0.44, 0.05, white, 0, 0, 0);
  rbox(D, 0.24, 0.05, 0.3, 0.025, phys(0x1b2733, { roughness: 0.15 }), 0, 0.07, 0.02); // the top cover
  box(D, 0.345, 0.025, 0.2, orange, 0, 0, 0.08, false); // an orange stripe
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const a = add(D, new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), carbon, sx * 0.15, 0.01, sz * 0.15); // an arm, pointing out to the corner
    a.rotation.order = 'YXZ'; a.rotation.set(Math.PI / 2, Math.atan2(sx, sz), 0);
    cyl(D, 0.035, 0.035, 0.05, mat(0x2b2f35, { metalness: 0.7, roughness: 0.3 }), sx * 0.3, 0.03, sz * 0.3, 14); // the motor
    const pr = new THREE.Group(); pr.position.set(sx * 0.3, 0.065, sz * 0.3); D.add(pr);
    for (const r of [0, Math.PI]) { const b = box(pr, 0.15, 0.004, 0.026, carbon, 0, 0, 0, false); b.geometry.translate(0.075, 0, 0); b.rotation.y = r; b.rotation.x = 0.12; }
    props.push(pr);
    const blur = add(D, new THREE.CircleGeometry(0.155, 28), new THREE.MeshBasicMaterial({ color: 0x9aa4ad, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), sx * 0.3, 0.066, sz * 0.3, false);
    blur.rotation.x = -Math.PI / 2; blurs.push(blur);
  }
  for (const sx of [-1, 1]) { const leg = cyl(D, 0.008, 0.008, 0.13, carbon, sx * 0.11, -0.12, 0, 6); leg.rotation.z = sx * 0.25; box(D, 0.012, 0.012, 0.3, carbon, sx * 0.13, -0.18, 0, false); }
  // the parcel on a short line
  cyl(D, 0.003, 0.003, 0.14, mat(0x111111), 0, -0.13, 0, 4, false);
  const parcel = rbox(D, 0.2, 0.15, 0.2, 0.012, mat(0xc49a6c, { roughness: 0.85 }), 0, -0.27, 0);
  box(D, 0.205, 0.155, 0.04, mat(0xd8c7a4), 0, -0.27, 0, false); void parcel;
  drone.userData.navR = glowDot(D, 0xff2a2a, 0.22, -0.3, 0.03, 0.34);
  drone.userData.navG = glowDot(D, 0x2aff6a, 0.22, 0.3, 0.03, 0.34);
  drone.userData.strobe = glowDot(D, 0xffffff, 0.35, 0, -0.07, -0.2);
}
const dronePath = new THREE.CatmullRomCurve3([V(-120, 44, -64), V(-82, 38, -48), V(-46, 27, -34), V(-14, 18, -24), V(8, 11, -17), V(18.5, 6.2, -12.2)]);

/* ---------- models: the robot helper and the self-driving car ---------- */
const robot = { root: null, mixer: null, acts: {} }, car = { root: null, wheels: [], brake: [], head: [] };
// the car's lidar puck on the roof, and rings that show what it senses
const carRig = new THREE.Group(); scene.add(carRig);
const puck = new THREE.Group(); puck.position.y = 1.2; carRig.add(puck);
cyl(puck, 0.13, 0.15, 0.08, mat(0x1d1f22, { roughness: 0.4, metalness: 0.4 }), 0, 0, 0, 20);
const puckTop = cyl(puck, 0.1, 0.12, 0.1, phys(0x0e1114, { roughness: 0.1, metalness: 0.5 }), 0, 0.09, 0, 20);
box(puckTop, 0.04, 0.04, 0.02, mat(0x39e1ff, { emissive: C(0x39e1ff), emissiveIntensity: 2 }), 0, 0, 0.115, false);
const rings = [0, 1, 2].map(() => {
  const r = add(scene, new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: 0x39e1ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), 0, 0.06, 0, false);
  r.rotation.x = -Math.PI / 2; return r;
});
// what the car "sees": a box around the child, with a label
const seenBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.75, 1.5, 0.6)), new THREE.LineBasicMaterial({ color: 0x39e1ff, transparent: true, opacity: 0, toneMapped: false, depthTest: false }));
seenBox.renderOrder = 5; scene.add(seenBox);
const seenTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = 'rgba(8,30,40,.78)'; if (g.roundRect) { g.beginPath(); g.roundRect(0, 0, w, h, 14); g.fill(); } else g.fillRect(0, 0, w, h);
  g.fillStyle = '#39e1ff'; g.font = '800 30px Nunito, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CHILD · STOP', w / 2, h / 2 + 1);
}), transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
seenTag.scale.set(0.9, 0.225, 1); seenTag.renderOrder = 6; scene.add(seenTag);

const ready = libs.then(() => {
  const gltf = new THREE.GLTFLoader(), draco = new THREE.DRACOLoader(); draco.setDecoderPath(LIB + 'libs/draco/gltf/'); gltf.setDRACOLoader(draco);
  const shadows = (root) => root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const a = gltf.loadAsync(BASE + 'story/models/robot.glb').then((g) => {
    const root = g.scene; shadows(root);
    root.scale.setScalar(0.3); scene.add(root); robot.root = root;
    root.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.material.roughness = 0.45; m.material.metalness = 0.25; } });
    robot.mixer = new THREE.AnimationMixer(root);
    for (const n of ['Walking', 'Wave', 'Idle']) { const c = g.animations.find((x) => x.name === n); if (c) { const act = robot.mixer.clipAction(c); act.play(); robot.acts[n] = act; } }
  });
  const b = gltf.loadAsync(BASE + 'story/models/car.glb').then((g) => {
    const root = g.scene; shadows(root);
    root.traverse((m) => {
      if (/License/i.test(m.name)) m.visible = false; // no number plate
      if (/^Wheel(Front|Rear)[LR]$/.test(m.name)) car.wheels.push(m);
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mm, i) => {
        const n = mm.name || '';
        if (/Glass/i.test(n)) { const gm = phys(0x0c1218, { roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.55 }); gm.name = n; if (Array.isArray(m.material)) m.material[i] = gm; else m.material = gm; }
        else if (/Paint 1/i.test(n)) { mm.color = C(0x1c5fae); mm.roughness = 0.32; mm.metalness = 0.55; if ('clearcoat' in mm) { mm.clearcoat = 1; mm.clearcoatRoughness = 0.05; } }
        else if (/Brakelight/i.test(n)) { mm.emissive = C(0xff1a1a); mm.emissiveIntensity = 0; car.brake.push(mm); }
        else if (/Headlight/i.test(n)) { mm.emissive = C(0xffffff); mm.emissiveIntensity = 1.4; car.head.push(mm); }
        mm.envMapIntensity = 1.2;
      });
    });
    root.rotation.y = Math.PI / 2; // the model points along +z; the road runs along +x
    carRig.add(root); car.root = root;
  });
  return Promise.all([a, b]);
}).catch(() => {});

/* ---------- the camera, beat by beat ---------- */
const camP = V(), camT = V(), tmp = V();
let aspect = 1.6;
function resize(a) { aspect = a; camera.aspect = a; camera.fov = a < 1.2 ? 56 : 42; camera.updateProjectionMatrix(); }
// on narrow screens the camera steps back from what it looks at, so it still fits
function place(p, t) {
  if (aspect < 1.2) p.sub(t).multiplyScalar(1 + (1.2 - aspect) * 0.5).add(t);
  camera.position.copy(p); camera.lookAt(t);
}
const CAR_STOP = 8, CAR_X = -5; // the front bumper stops just before the stop line
const carX = (t) => { const u = clamp01((t - (CAR_STOP - 2)) / 2); return CAR_X - 21 * (1 - u) * (1 - u); }; // braking steadily from 37 km/h
let lastT = -1;
function update(t, dt) {
  dt = dt || 0;
  // the drone: along its path, nose to the way it flies, tilted forward while fast
  const du = t < HOME[0] ? lerp(0, 0.62, t / HOME[0]) : lerp(0.62, 1, 1 - Math.pow(1 - clamp01((t - HOME[0]) / (HOME[1] - HOME[0] + 0.6)), 2));
  const dp = dronePath.getPointAt(clamp01(du)), dir = dronePath.getTangentAt(clamp01(du));
  drone.position.copy(dp); drone.position.y += Math.sin(t * 2.3) * 0.06;
  drone.rotation.set(0, Math.atan2(dir.x, dir.z), 0); drone.rotateX(t < HOME[0] ? 0.16 : lerp(0.16, 0.02, clamp01((t - HOME[0]) / 2.5)));
  props.forEach((p, i) => { p.rotation.y = t * 60 * (i % 2 ? 1 : -1); });
  drone.userData.navR.material.opacity = 0.9; drone.userData.navG.material.opacity = 0.9;
  drone.userData.strobe.material.opacity = (t % 1) < 0.08 ? 1 : 0;

  // the smart home's lights come on by themselves; the robot walks to the gate and waves
  setHomeLights(smooth(HOME[0] + 0.9, HOME[0] + 2.0, t));
  if (robot.root) {
    const wt = t - HOME[0], walkEnd = 1.7;
    const rx = lerp(17.2, 19.1, clamp01(wt / walkEnd)), rz = lerp(-10.4, -8.2, clamp01(wt / walkEnd));
    robot.root.position.set(rx, 0, rz); robot.root.rotation.y = wt < walkEnd ? Math.atan2(19.1 - 17.2, -8.2 + 10.4) : lerp(0.71, 0.62, clamp01((wt - walkEnd) / 0.6)); // then it faces us
    const waving = wt > walkEnd;
    if (robot.acts.Walking) robot.acts.Walking.setEffectiveWeight(waving ? 0 : 1);
    if (robot.acts.Wave) robot.acts.Wave.setEffectiveWeight(waving ? 1 : 0);
    if (robot.acts.Idle) robot.acts.Idle.setEffectiveWeight(0);
    robot.mixer.setTime(Math.max(0, wt));
  }

  // the self-driving car, its scanner, and the child at the crossing
  const cx = carX(t);
  carRig.position.set(cx, 0, 1.75);
  car.wheels.forEach((w) => { w.rotation.x = cx / 0.36; });
  car.brake.forEach((m) => { m.emissiveIntensity = t > CAR_STOP - 1.6 ? 3 : 0; });
  puckTop.rotation.y = t * 9;
  const carOn = t > CAR[0] - 0.4;
  rings.forEach((r, i) => {
    const k = ((t * 0.9 + i / 3) % 1);
    r.position.set(cx + 0.3, 0.06, 1.75); r.scale.setScalar(1.5 + k * 9); r.material.opacity = carOn ? (1 - k) * 0.55 : 0;
  });
  // the child crosses from the far pavement, steps up on this side, turns to us and waves
  const kt = t - (CAR[0] - 0.3), z0 = -4.6, z1 = 4.0, walkDur = 3.4;
  const kz = lerp(z0, z1, clamp01(kt / walkDur)), walking = kt > 0 && kt < walkDur;
  const kx = 0.2;
  const curb = Math.abs(kz) > 3.45 ? KERB : 0;
  kid.g.position.set(kx, curb + 0.02, kz);
  const turn = smooth(walkDur - 0.1, walkDur + 0.5, kt);
  kid.g.rotation.y = lerp(0, 0.55, turn);
  kid.pose(Math.max(0, kt), walking ? 1 : 0, smooth(walkDur + 0.15, walkDur + 0.5, kt), 2.1);
  kid.g.visible = t > CAR[0] - 0.8;
  const seen = carOn && t > CAR_STOP - 1.4 && kt < walkDur - 0.3;
  seenBox.position.set(kx, curb + 0.78, kz); seenBox.material.opacity = seen ? 0.95 : 0;
  seenTag.position.set(kx, curb + 1.72, kz); seenTag.material.opacity = seen ? 1 : 0;

  // the camera
  if (t < DRONE[1]) {
    const f = ease(t / DRONE[1]);
    camP.set(lerp(-3.6, -8, f), lerp(1.4, 3.2, f), lerp(4.2, 9, f)).add(dp);
    camT.copy(dp).add(tmp.set(lerp(1.2, 4, f), lerp(-0.6, -1.6, f), lerp(-0.6, -2, f)));
    sunAt(dp, 18);
  } else if (t < HOME[1]) {
    const f = ease((t - HOME[0]) / (HOME[1] - HOME[0]));
    camP.set(lerp(26.5, 24.2, f), lerp(2.3, 1.7, f), lerp(1.0, -1.4, f));
    camT.set(lerp(19.6, 19.3, f), lerp(3.2, 2.5, f), lerp(-12.5, -11.5, f));
    sunAt(V(20, 0, -11), 14);
  } else {
    const f = ease((t - CAR[0]) / (CAR[1] - CAR[0]));
    camP.set(lerp(6.4, 2.8, f), lerp(1.35, 1.25, f), lerp(9.0, 7.2, f));
    camT.set(lerp(-3.5, -0.6, f), lerp(1.0, 1.0, f), lerp(0.4, 2.4, f));
    sunAt(V(-2, 0, 1.5), 14);
  }
  place(camP, camT);
  sky.position.copy(camera.position);
  // nothing in the world stays from a skipped beat
  drone.visible = t < HOME[1] + 0.2;
  if (robot.root) robot.root.visible = t > DRONE[1] - 0.2 && t < HOME[1] + 0.2;
  lastT = t;
}
update(0);
return { scene, camera, update, resize, ready, LEN, BEATS: { DRONE, HOME, CAR }, get t() { return lastT; } };
}
window.KKFuture = { create };
})();
