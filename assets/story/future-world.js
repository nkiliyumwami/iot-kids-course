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
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = V(-0.45, 0.8, 0.4).normalize();
function sunAt(p, size) {
  sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN_DIR, 130);
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
// smooth random noise (value noise, a few layers) for natural, rounded hills
const hash2 = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v);
}
function fbm(x, z, oct = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s / (1 - Math.pow(0.5, oct)); }
// the drone's route: it flies up a valley between the hills, into the town
const dronePath = new THREE.CatmullRomCurve3([V(-120, 40, -64), V(-82, 34, -48), V(-46, 25, -34), V(-14, 17, -24), V(8, 11, -17), V(18.5, 6.2, -12.2)]);
const ROUTE = [[-200, -94], [-120, -64], [-82, -48], [-46, -34], [-14, -24]];
function routeDist(x, z) {
  let best = 1e9;
  for (let k = 0; k < ROUTE.length - 1; k++) {
    const [ax, az] = ROUTE[k], [bx, bz] = ROUTE[k + 1], dx = bx - ax, dz = bz - az;
    const f = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(x - ax - dx * f, z - az - dz * f));
  }
  return best;
}
// flat in the valley where the town is, rolling green hills all around
function groundY(x, z) {
  const d = Math.hypot(x * 0.75, z), rise = smooth(46, 150, d);
  if (rise === 0) return 0;
  const n = fbm(x / 72 + 3.1, z / 72 - 1.7, 4), valley = lerp(0.28, 1, smooth(12, 60, routeDist(x, z)));
  return rise * (Math.pow(n, 1.3) * 88 + 3) * valley + rise * rise * 5;
}
// the fields, in GLSL (the same rules as a farmer's hillside: strips along the contour lines, a step at each terrace)
const FIELDS_GLSL = `
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y); }
vec3 crop(float k) {
  if (k < 0.16) return vec3(92.0, 150.0, 60.0);   // beans, young and bright
  if (k < 0.30) return vec3(64.0, 116.0, 46.0);   // cassava, dark
  if (k < 0.42) return vec3(146.0, 156.0, 72.0);  // maize, yellow-green
  if (k < 0.52) return vec3(70.0, 138.0, 56.0);   // tea, bright and even
  if (k < 0.62) return vec3(166.0, 138.0, 84.0);  // harvested, straw
  if (k < 0.72) return vec3(146.0, 84.0, 54.0);   // ploughed red earth
  if (k < 0.82) return vec3(54.0, 96.0, 44.0);    // bananas, deep green
  if (k < 0.92) return vec3(112.0, 148.0, 64.0);  // sorghum
  return vec3(96.0, 128.0, 52.0);                 // potatoes
}
vec3 fieldColour(vec3 p, float steep) {
  float d = length(vec2(p.x * 0.75, p.z)), wob = vn(p.xz / 9.0);
  vec3 col = vec3(88.0 + wob * 22.0, 136.0 + wob * 24.0, 58.0 + wob * 10.0);
  float farm = smoothstep(44.0, 70.0, d);
  if (farm > 0.0) {
    float band = p.y / 2.6 + vn(p.xz / 40.0) * 0.9, bi = floor(band), bf = fract(band), fb = fwidth(band);
    float len = 14.0 + h2(vec2(bi, 7.0)) * 20.0, ang = h2(vec2(bi, 3.0)) * 6.283;
    float along = p.x * cos(ang) + p.z * sin(ang), cell = along / len, ci = floor(cell), cf = fract(cell);
    vec3 f = crop(h2(vec2(bi * 31.0 + 5.0, ci))) * (0.9 + h2(vec2(ci, bi)) * 0.2);
    float rows = along * 3.0 + bi, ra = clamp(1.0 - fwidth(rows) * 0.7, 0.0, 1.0);
    f *= 1.0 - 0.07 * ra * (0.5 + 0.5 * sin(rows)); // crop rows, faded out where they would be too fine to see
    float riser = 1.0 - smoothstep(0.0, 0.07 + fb, bf), lip = smoothstep(0.06, 0.08 + fb, bf) * (1.0 - smoothstep(0.13, 0.16 + fb, bf));
    f *= mix(1.0, 0.62, riser) * (1.0 + 0.09 * lip);  // the terrace step: a shaded riser, then a lit lip
    float edgeM = min(cf, 1.0 - cf) * len, fe = fwidth(along);
    f = mix(vec3(58.0, 94.0, 40.0), f, smoothstep(0.35, 0.7 + fe, edgeM)); // a hedge between fields
    float wood = vn(p.xz / 46.0 + vec2(9.0, -4.0)), k = vn(p.xz / 3.0);
    float k2 = vn(p.xz / 0.8) * clamp(1.0 - fwidth(p.x) * 1.5, 0.0, 1.0); // tufts, faded out far away
    vec2 wp = vec2(p.x + p.y * 0.7, p.z - p.y * 0.7); k = vn(wp / 3.0); k2 = vn(wp / 0.8) * clamp(1.0 - fwidth(p.x) * 1.5, 0.0, 1.0); // also along the slope
    vec3 wild = vec3(42.0 + k * 24.0, 76.0 + k * 30.0, 44.0 + k * 14.0) * (0.85 + 0.3 * k2);
    f = mix(f, wild, max(smoothstep(0.18, 0.24, steep), smoothstep(0.68, 0.72, wood)));
    f = mix(vec3(78.0, 122.0, 64.0), f, smoothstep(2.0, 3.0, p.y)); // the wet valley bottom
    col = mix(col, f, farm);
  }
  float pth = abs(vn(p.xz / 70.0 + vec2(2.0, 5.0)) - 0.5), pw = fwidth(pth);
  col = mix(col, vec3(168.0, 98.0, 62.0), (1.0 - smoothstep(0.003, 0.0045 + pw, pth)) * farm); // winding red earth paths through the farms
  return pow(col / 255.0, vec3(2.2));
}
`;
// fine grass and soil grain, repeated many times over the land (multiplied on top of the fields)
const grain = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const v = 150 + rnd() * 105; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2); }
}, [90, 90]);
const detail = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9e9e9e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14000; i++) { const v = 110 + rnd() * 120; g.strokeStyle = `rgba(${v},${v},${v},.55)`; g.lineWidth = 1; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4); g.stroke(); }
}, [1, 1]);
detail.encoding = THREE.LinearEncoding;
{
  const S = 900, N = low ? 150 : 240, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  // the fields are drawn by the graphics card from each point's position, so they stay sharp at any distance:
  // terraced strips of crops following the hills, hedges, red earth paths, wild slopes and eucalyptus woods
  const landM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 });
  landM.extensions = { derivatives: true };
  landM.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.vertexShader = 'varying vec3 vWPos;\nvarying float vSteep;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvSteep = 1.0 - normalize(objectNormal).y;');
    sh.fragmentShader = 'uniform sampler2D detailMap;\nvarying vec3 vWPos;\nvarying float vSteep;\n' + FIELDS_GLSL + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb = fieldColour(vWPos, vSteep) * texture2D(detailMap, vWPos.xz / 1.7).rgb * 1.6;');
  };
  const land = new THREE.Mesh(geo, landM); land.receiveShadow = true; scene.add(land);
}

// soft round trees: clusters of bumpy leaf balls, lighter on top, darker underneath
const crownTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) { const v = 120 + rnd() * 135; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.2, 0, 7); g.fill(); }
}, [2, 2]);
function crownGeo(blobs) {
  const pos = [], nor = [], col = [], uv = [];
  let y0 = 1e9, y1 = -1e9;
  blobs.forEach(([cx, cy, cz, r]) => { y0 = Math.min(y0, cy - r); y1 = Math.max(y1, cy + r); });
  blobs.forEach(([cx, cy, cz, r], bi) => {
    const s = new THREE.IcosahedronGeometry(r, 1), sp = s.attributes.position, su = s.attributes.uv;
    for (let i = 0; i < sp.count; i++) {
      const nx = sp.getX(i) / r, ny = sp.getY(i) / r, nz = sp.getZ(i) / r;
      const bump = 1 + (vnoise(nx * 2.2 + bi * 7, nz * 2.2 + ny * 2.2) - 0.5) * 0.35;
      const y = cy + ny * r * bump;
      pos.push(cx + nx * r * bump, y, cz + nz * r * bump); nor.push(nx, ny, nz);
      const k = 0.45 + 0.55 * clamp01((y - y0) / (y1 - y0)); col.push(k, k, k);
      uv.push(su.getX(i), su.getY(i));
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
{
  const crownM = mat(0xffffff, { map: crownTex, vertexColors: true, roughness: 0.9 }), barkM = mat(0x6e6152, { roughness: 0.9 });
  const KINDS = [
    { // eucalyptus: tall and thin, blue-green
      trunk: [0.12, 0.2, 0.9], blobs: [[0, 0.5, 0, 0.17], [0.09, 0.62, 0.05, 0.17], [-0.08, 0.72, -0.04, 0.15], [0.03, 0.84, 0.02, 0.13], [-0.05, 0.58, 0.09, 0.14], [0.06, 0.93, -0.03, 0.09]], hsl: [0.31, 0.22, 0.27], w: 0.5,
    },
    { // a broad shade tree (avocado, mango)
      trunk: [0.2, 0.3, 0.45], blobs: [[0, 0.62, 0, 0.32], [0.28, 0.55, 0.1, 0.24], [-0.26, 0.56, -0.08, 0.25], [0.05, 0.56, 0.28, 0.22], [-0.04, 0.58, -0.27, 0.22], [0.02, 0.82, 0.02, 0.22]], hsl: [0.27, 0.42, 0.25], w: 0.3,
    },
    { // a bush
      trunk: null, blobs: [[0, 0.3, 0, 0.32], [0.3, 0.24, 0.05, 0.24], [-0.26, 0.22, -0.06, 0.26], [0.04, 0.22, 0.26, 0.2]], hsl: [0.25, 0.45, 0.26], w: 0.2,
    },
  ];
  const nT = low ? 420 : 1100, trunkG = new THREE.CylinderGeometry(0.5, 1, 1, 7); trunkG.translate(0, 0.5, 0);
  const meshes = KINDS.map((k) => {
    const cm = new THREE.InstancedMesh(crownGeo(k.blobs), crownM, nT);
    const tm = k.trunk ? new THREE.InstancedMesh(trunkG, barkM, nT) : null;
    cm.setColorAt(0, new THREE.Color()); cm.count = 0; if (tm) tm.count = 0; // colours first: they are sized by the count
    cm.castShadow = true; cm.receiveShadow = true; scene.add(cm); if (tm) { tm.castShadow = true; scene.add(tm); }
    return { k, cm, tm };
  });
  const q = new THREE.Object3D(), c = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < nT && tries < nT * 30) {
    tries++;
    const x = (rnd() - 0.5) * 560, z = (rnd() - 0.5) * 560, d = Math.hypot(x * 0.75, z);
    if (d < 30 || (Math.abs(z) < 10 && d < 80)) continue;
    const wood = vnoise(x / 46 + 9, z / 46 - 4), edge = d < 60 ? 0.25 : 0.1;
    if (!(wood > 0.7 ? rnd() < 0.95 : rnd() < edge)) continue;
    const y = groundY(x, z);
    // keep the drone's flight line clear
    const nearRoute = routeDist(x, z) < 16 && y > 4;
    if (nearRoute) continue;
    const kind = wood > 0.7 ? (rnd() < 0.85 ? 0 : 2) : rnd() < 0.35 ? 0 : rnd() < 0.65 ? 1 : 2, M = meshes[kind];
    const hgt = kind === 0 ? 11 + rnd() * 10 : kind === 1 ? 6 + rnd() * 4 : 2 + rnd() * 1.6, wid = hgt * (kind === 0 ? 0.55 : kind === 1 ? 1.1 : 1.3) * (0.85 + rnd() * 0.3);
    q.rotation.set(0, rnd() * 6.28, 0);
    q.position.set(x, y - 0.3, z); q.scale.set(wid, hgt, wid); q.updateMatrix(); M.cm.setMatrixAt(M.cm.count, q.matrix);
    c.setHSL(M.k.hsl[0] + (rnd() - 0.5) * 0.05, M.k.hsl[1] * (0.8 + rnd() * 0.4), M.k.hsl[2] * (0.85 + rnd() * 0.3)).convertSRGBToLinear(); M.cm.setColorAt(M.cm.count, c);
    M.cm.count++;
    if (M.tm) { const t = M.k.trunk; q.scale.set(t[0] * hgt * 0.12, hgt * t[2] * 0.75, t[0] * hgt * 0.12); q.updateMatrix(); M.tm.setMatrixAt(M.tm.count, q.matrix); M.tm.count++; }
    placed++;
  }
  meshes.forEach((m) => { m.cm.instanceMatrix.needsUpdate = true; if (m.cm.instanceColor) m.cm.instanceColor.needsUpdate = true; if (m.tm) m.tm.instanceMatrix.needsUpdate = true; });
}
// villages along the hillsides: plastered houses with hip roofs of iron sheets, windows and a door
{
  const facade = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f1e9da'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8c4a2f'; g.fillRect(0, h - 26, w, 26); // the painted band at the bottom
    g.fillStyle = '#2d3640'; for (const x of [30, 180]) g.fillRect(x, 34, 44, 40); // windows
    g.fillStyle = '#4a3326'; g.fillRect(108, 40, 38, 88); // the door
    g.fillStyle = 'rgba(255,255,255,.7)'; for (const x of [30, 180]) { g.fillRect(x + 20, 34, 4, 40); g.fillRect(x, 52, 44, 3); }
  });
  const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, 0.5, 0);
  const roofG = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.5, 0); // a hip roof
  const nH = low ? 90 : 200;
  const walls = new THREE.InstancedMesh(wallG, mat(0xffffff, { map: facade, roughness: 0.9, envMapIntensity: 0.35 }), nH);
  const roofs = new THREE.InstancedMesh(roofG, mat(0xffffff, { map: canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(0.5, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(255,255,255,.2)'); g.fillStyle = gr; g.fillRect(x, 0, 8, h); } }), roughness: 0.5, metalness: 0.35 }), nH);
  walls.setColorAt(0, new THREE.Color()); roofs.setColorAt(0, new THREE.Color()); walls.count = roofs.count = 0; // colours first: they are sized by the count
  const q = new THREE.Object3D(), c = new THREE.Color();
  const routePts = dronePath.getSpacedPoints(60).filter((pt) => pt.x < 0);
  let tries = 0;
  while (walls.count < nH && tries < 4000) {
    tries++;
    // a village centre on a gentle slope, then houses around it, each one turned to follow the hill
    const cx = (rnd() - 0.5) * 520, cz = (rnd() - 0.5) * 520, cd = Math.hypot(cx * 0.75, cz);
    if (cd < 60 || cd > 300) continue;
    const n = 4 + Math.floor(rnd() * 9);
    for (let k = 0; k < n && walls.count < nH; k++) {
      const x = cx + (rnd() - 0.5) * 50, z = cz + (rnd() - 0.5) * 50, y = groundY(x, z);
      const gx = groundY(x + 2, z) - groundY(x - 2, z), gz = groundY(x, z + 2) - groundY(x, z - 2);
      if (Math.hypot(gx, gz) / 4 > 0.55) continue; // too steep to build
      if (routePts.some((pt) => Math.hypot(pt.x - x, pt.z - z) < 24)) continue; // nothing right under the drone
      const w = 6 + rnd() * 4, dd = 4.5 + rnd() * 2, hh = 2.7 + rnd() * 0.5, ry = Math.atan2(gx, gz) + (rnd() < 0.5 ? 0 : Math.PI / 2);
      q.rotation.set(0, ry, 0); q.position.set(x, y - 1, z); q.scale.set(w, hh + 1, dd); q.updateMatrix(); walls.setMatrixAt(walls.count, q.matrix);
      c.setHSL(0.08 + rnd() * 0.05, 0.25 + rnd() * 0.3, 0.82 + rnd() * 0.12).convertSRGBToLinear(); walls.setColorAt(walls.count, c);
      q.position.set(x, y + hh, z); q.scale.set(w * 1.18, 1.4 + rnd() * 0.5, dd * 1.25); q.updateMatrix(); roofs.setMatrixAt(roofs.count, q.matrix);
      const r = rnd(); c.set(r < 0.5 ? 0x9b3b28 : r < 0.75 ? 0xa9b1b6 : r < 0.9 ? 0x3d5f86 : 0x6f7f4a).convertSRGBToLinear(); roofs.setColorAt(roofs.count, c);
      walls.count++; roofs.count++;
    }
  }
  walls.castShadow = roofs.castShadow = true; walls.receiveShadow = roofs.receiveShadow = true; scene.add(walls, roofs);
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
  box(g, W, H, D, mat(0xffffff, { map: plasterTex(o.wall || '#ecdcbf'), roughness: 0.92, envMapIntensity: 0.35 }), 0, H / 2, 0);
  box(g, W + 0.02, 0.6, D + 0.02, mat(o.band || 0x8c4a2f, { roughness: 0.85 }), 0, 0.3, 0, false);
  const pitch = 0.42, half = D / 2 + 0.5, len = half / Math.cos(pitch), roofM = mat(0xffffff, { map: tinTex(o.roof || '#8a3326'), metalness: 0.45, roughness: 0.45, side: THREE.DoubleSide });
  const slopes = [];
  for (const s of [1, -1]) {
    const r = add(g, new THREE.PlaneGeometry(W + 0.6, len), roofM, 0, H + Math.tan(pitch) * (half / 2 - 0.5), s * half / 2); // eaves 0.5 m past the walls
    r.rotation.x = -Math.PI / 2 + s * pitch; slopes.push(r);
  }
  // the gable ends (triangles of wall under the roof)
  const tri = new THREE.Shape(); tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, Math.tan(pitch) * (D / 2)); tri.closePath();
  for (const s of [1, -1]) { const m = add(g, new THREE.ShapeGeometry(tri), mat(0xffffff, { map: plasterTex(o.wall || '#ecdcbf'), roughness: 0.92, side: THREE.DoubleSide, envMapIntensity: 0.35 }), s * W / 2, H, 0); m.rotation.y = Math.PI / 2; }
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
const bananas = [[-24, -8.5], [-11, -9], [-8, 9.5], [-26, 9], [12, -9.5], [28, -9.5], [15, 9.5], [-40, -9], [31, 8.5], [24, -21], [12, -21]].map(([x, z], i) => banana(x, z, 2.3 + (i % 3) * 0.4, i));

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
  const wallM = mat(0xffffff, { map: plasterTex('#efe2c9'), roughness: 0.92, envMapIntensity: 0.35 }), capM = mat(0xb4562e, { roughness: 0.8 });
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

/* ---------- the delivery drone ----------
   A smooth white shell with an orange band, four tapered carbon arms, motor pods, twisted propeller blades
   (with a soft blur disc, the way a camera sees fast props), curved landing skids, a camera on a gimbal under
   the nose, and a parcel hanging on a winch line. Its nose points to +z. Built about 1.5 m across. */
const drone = new THREE.Group(); scene.add(drone);
const props = [];
{
  const D = new THREE.Group(); D.scale.setScalar(1.25); drone.add(D);
  const shell = phys(0xf4f6f8, { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glassDark = phys(0x10151b, { roughness: 0.08, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  const carbonTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#26292d'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = (x + y) % 8 ? '#303439' : '#1c1f22'; g.fillRect(x, y, 4, 4); }
  }, [6, 1]);
  const carbon = mat(0xffffff, { map: carbonTex, roughness: 0.35, metalness: 0.3 });
  const darkMetal = mat(0x2a2e33, { metalness: 0.8, roughness: 0.3 }), silver = mat(0xb9c0c7, { metalness: 1, roughness: 0.22 });
  const orange = phys(0xf08a24, { roughness: 0.28, clearcoat: 1 });
  // the fuselage: a rounded teardrop, blunt at the nose, flattened
  const prof = (t0, t1, grow = 1) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = lerp(t0, t1, i / 24), r = 0.14 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.35)), 0.62) * grow + 1e-4;
      pts.push(new THREE.Vector2(r, lerp(-0.36, 0.3, t)));
    }
    const g = new THREE.LatheGeometry(pts, 40); g.rotateX(Math.PI / 2); g.scale(1, 0.62, 1); return g;
  };
  add(D, prof(0, 1), shell);
  add(D, prof(0.5, 0.56, 1.025), orange, 0, 0, 0, false); // the orange band
  const canopy = sph(D, 0.1, glassDark, 0, 0.045, 0.09); canopy.scale.set(0.9, 0.5, 1.45); // the dark top cover
  // obstacle sensors in the nose, a light bar under the tail, two small antennas
  for (const s of [-1, 1]) { const e = rbox(D, 0.03, 0.022, 0.02, 0.006, glassDark, s * 0.045, 0.0, 0.29, false); e.rotation.y = s * 0.3; }
  for (const s of [-1, 1]) { const a = cyl(D, 0.003, 0.004, 0.09, darkMetal, s * 0.04, 0.09, -0.22, 6, false); a.rotation.x = -0.5; }
  // the camera on its gimbal under the nose
  box(D, 0.05, 0.03, 0.03, darkMetal, 0, -0.07, 0.2, false);
  sph(D, 0.036, mat(0x1b1e22, { roughness: 0.35, metalness: 0.4 }), 0, -0.1, 0.21);
  const lens = cyl(D, 0.016, 0.018, 0.016, glassDark, 0, -0.1, 0.244, 16, false); lens.rotation.x = Math.PI / 2;
  // four arms out to the corners, each with a motor, a spinning propeller and its blur disc
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.012); bladeShape.bezierCurveTo(0.06, -0.02, 0.15, -0.016, 0.2, -0.006); bladeShape.quadraticCurveTo(0.208, 0, 0.2, 0.006);
  bladeShape.bezierCurveTo(0.15, 0.01, 0.06, 0.016, 0, 0.012); bladeShape.closePath();
  const bladeG = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.003, bevelEnabled: false, curveSegments: 10 });
  bladeG.rotateX(-Math.PI / 2); // lying flat, along +x
  { const bp = bladeG.attributes.position; for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), a = lerp(0.42, 0.12, x / 0.2), y = bp.getY(i), z = bp.getZ(i); bp.setY(i, y * Math.cos(a) - z * Math.sin(a)); bp.setZ(i, y * Math.sin(a) + z * Math.cos(a)); } bladeG.computeVertexNormals(); }
  const bladeM = mat(0x1d2024, { roughness: 0.4, transparent: true, opacity: 0.55 });
  const blurTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, 'rgba(40,44,50,.0)'); gr.addColorStop(0.15, 'rgba(40,44,50,.35)'); gr.addColorStop(0.75, 'rgba(60,64,70,.28)'); gr.addColorStop(0.93, 'rgba(70,74,80,.42)'); gr.addColorStop(1, 'rgba(70,74,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(64, 64, 18 + i * 5, 0, 7); g.stroke(); }
  });
  const motorProf = []; [[0, -0.03], [0.042, -0.03], [0.046, -0.022], [0.046, 0.018], [0.04, 0.028], [0, 0.028]].forEach(([r, y]) => motorProf.push(new THREE.Vector2(r + 1e-4, y)));
  const motorG = new THREE.LatheGeometry(motorProf, 24);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ang = Math.atan2(sx, sz), R = 0.42, ex = Math.sin(ang) * R, ez = Math.cos(ang) * R;
    const arm = add(D, new THREE.CylinderGeometry(0.014, 0.024, 0.32, 12), carbon, Math.sin(ang) * 0.25, 0.005, Math.cos(ang) * 0.25);
    arm.rotation.order = 'YXZ'; arm.rotation.set(Math.PI / 2, ang, 0);
    const root = sph(D, 0.032, shell, Math.sin(ang) * 0.1, 0.005, Math.cos(ang) * 0.1); root.scale.set(1, 0.7, 1.3); root.rotation.y = ang; // a fairing where the arm meets the body
    add(D, motorG, darkMetal, ex, 0.02, ez);
    cyl(D, 0.038, 0.04, 0.012, silver, ex, 0.054, ez, 20, false); // the spinning bell
    const pr = new THREE.Group(); pr.position.set(ex, 0.066, ez); D.add(pr);
    const hub = add(pr, new THREE.ConeGeometry(0.014, 0.022, 14), silver, 0, 0.01, 0, false); void hub;
    for (const r of [0, Math.PI]) { const b = add(pr, bladeG, bladeM, 0, 0, 0, false); b.rotation.y = r; }
    const disc = add(pr, new THREE.CircleGeometry(0.205, 40), new THREE.MeshBasicMaterial({ map: blurTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }), 0, 0.002, 0, false);
    disc.rotation.x = -Math.PI / 2;
    props.push(pr);
    // a small light under each motor: red on the left front, green on the right front, white at the back
    const navHex = sz > 0 ? (sx > 0 ? 0xff2a2a : 0x2aff6a) : 0xffffff;
    sph(D, 0.012, mat(navHex, { emissive: C(navHex), emissiveIntensity: 2 }), ex, -0.035, ez, false);
    D.userData['nav' + sx + sz] = glowDot(D, navHex, 0.16, ex, -0.04, ez);
  }
  // landing skids: two bent legs each side and a long bar
  const carbonTube = (pts, r) => add(D, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, r, 8), carbon, 0, 0, 0, false);
  for (const s of [-1, 1]) {
    for (const zz of [-0.1, 0.1]) carbonTube([V(s * 0.06, -0.04, zz), V(s * 0.11, -0.12, zz * 1.1), V(s * 0.15, -0.22, zz * 1.2)], 0.007);
    carbonTube([V(s * 0.15, -0.205, -0.2), V(s * 0.15, -0.225, -0.15), V(s * 0.15, -0.225, 0.15), V(s * 0.15, -0.205, 0.2)], 0.008);
  }
  // the winch line, a hook and the parcel (it swings a little under the drone)
  const hang = new THREE.Group(); hang.position.y = -0.07; D.add(hang);
  cyl(hang, 0.0025, 0.0025, 0.2, mat(0x111111), 0, -0.1, 0, 5, false);
  const hook = add(hang, new THREE.TorusGeometry(0.012, 0.003, 6, 14), silver, 0, -0.205, 0, false); void hook;
  const kraft = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c59a66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,210' : '110,70,30'},${rnd() * 0.12})`; g.fillRect(rnd() * w, rnd() * h, 2, 1 + rnd() * 3); }
    g.fillStyle = 'rgba(214,198,160,.95)'; g.fillRect(w / 2 - 20, 0, 40, h); // packing tape
    g.fillStyle = '#fbfaf6'; g.fillRect(26, 150, 80, 64); g.fillStyle = '#29323b'; for (let i = 0; i < 4; i++) g.fillRect(34, 162 + i * 12, 40 + (i % 2) * 20, 5); // a delivery label
    g.fillStyle = '#f08a24'; g.beginPath(); g.moveTo(170, 90); g.lineTo(210, 90); g.lineTo(190, 60); g.fill(); g.fillRect(183, 90, 14, 26); // "this way up"
  });
  const parcel = add(hang, new THREE.BoxGeometry(0.24, 0.17, 0.24), mat(0xffffff, { map: kraft, roughness: 0.85 }), 0, -0.3, 0);
  box(hang, 0.245, 0.006, 0.05, mat(0xd6c6a0, { roughness: 0.5 }), 0, -0.214, 0, false); // tape over the top
  void parcel;
  drone.userData.D = D; drone.userData.hang = hang;
  drone.userData.strobe = glowDot(D, 0xffffff, 0.3, 0, 0.06, -0.3);
}

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

/* ---------- the Blender-built models (tools/blender/*.py) ----------
   The drone, the two pupils, the smart home and the banana plants were modelled and shaded in Blender
   (soft bevels, baked contact shadows). Each one replaces the code-built version above when it arrives;
   if a file is missing, the code-built one simply stays. */
// a jointed child: the same walk and wave as the code-built one, on the model's joints
function wireChild(root) {
  const n = (k) => root.getObjectByName(k);
  const body = n('Body'), head = n('Head'), base = body.position.y;
  const J = { L: { sh: n('Shoulder_L'), el: n('Elbow_L'), hp: n('Hip_L'), kn: n('Knee_L') }, R: { sh: n('Shoulder_R'), el: n('Elbow_R'), hp: n('Hip_R'), kn: n('Knee_R') } };
  root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  const pose = (t, walk = 0, wave = 0, speed = 1.6) => {
    const p = t * Math.PI * 2 * speed, sw = Math.sin(p) * 0.55 * walk;
    J.L.hp.rotation.x = -sw; J.R.hp.rotation.x = sw;
    J.L.kn.rotation.x = Math.max(0, Math.sin(p - 1.4)) * 0.9 * walk; J.R.kn.rotation.x = Math.max(0, Math.sin(p + Math.PI - 1.4)) * 0.9 * walk;
    J.L.sh.rotation.x = sw * 0.8; J.R.sh.rotation.x = -sw * 0.8 * (1 - wave);
    J.L.el.rotation.x = -0.2 - walk * 0.3; J.R.el.rotation.x = (-0.2 - walk * 0.3) * (1 - wave);
    J.L.sh.rotation.z = 0.06; J.R.sh.rotation.z = lerp(-0.06, -2.75, wave);
    J.R.el.rotation.z = wave * Math.sin(t * 9) * 0.45;
    body.position.y = base + Math.abs(Math.sin(p)) * 0.035 * walk;
    head.rotation.z = Math.sin(p) * 0.03 * walk + wave * Math.sin(t * 2.2) * 0.06;
  };
  pose(0);
  return { g: root, pose };
}
const girl = { g: new THREE.Group(), pose() {} };
const upgrade = libs.then(() => {
  const gl = new THREE.GLTFLoader(), dr = new THREE.DRACOLoader(); dr.setDecoderPath(LIB + 'libs/draco/gltf/'); gl.setDRACOLoader(dr);
  const load = (name) => gl.loadAsync(BASE + 'story/models/' + name + '.glb').then((g) => {
    g.scene.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g.scene;
  });
  const hideMeshes = (g) => g.traverse((m) => { if (m.isMesh) m.visible = false; });
  const jobs = [
    load('drone').then((root) => {
      const D = drone.userData.D; hideMeshes(D); // the code-built drone steps aside; its lights stay
      drone.add(root);
      const disc = D.children.find((c) => c.isGroup && c.children.some((k) => k.material && k.material.map)); // a blur disc to copy
      props.length = 0;
      ['FL', 'FR', 'RL', 'RR'].forEach((k) => {
        const pr = root.getObjectByName('Prop_' + k); props.push(pr);
        const bd = new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), new THREE.MeshBasicMaterial({ map: disc ? disc.children.find((c) => c.material && c.material.map).material.map : null, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        bd.rotation.x = -Math.PI / 2; bd.position.y = 0.002; pr.add(bd);
      });
      root.traverse((m) => {
        if (!m.isMesh) return;
        if (/Blade/.test(m.material.name)) { m.material.transparent = true; m.material.opacity = 0.55; }
        if (/Parcel/.test(m.material.name)) m.material.color = C(0xd9a86c); // warmer cardboard
      });
      drone.userData.hang = root.getObjectByName('Hang');
    }),
    load('child_a').then((root) => { scene.remove(kid.g); const w = wireChild(root); scene.add(w.g); kid.g = w.g; kid.pose = w.pose; }),
    load('child_b').then((root) => { const w = wireChild(root); scene.add(w.g); girl.g = w.g; girl.pose = w.pose; }),
    load('smart_house').then((root) => {
      root.position.set(HOMEP.x, 0, HOMEP.z); scene.add(root);
      root.traverse((m) => {
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mm) => {
          if (/Plaster|Trim|Frame|Concrete|Band/.test(mm.name)) mm.envMapIntensity = 0.3; // white walls stay white under a blue sky
          if (/Plaster|Band/.test(mm.name)) { mm.vertexColors = false; mm.needsUpdate = true; } // big flat walls: no baked shading smeared across them
        });
      });
      home.g.children.forEach((c) => { if (c.isMesh) c.visible = false; });
      const glowM = (name, hex) => { const o = root.getObjectByName(name); o.material = o.material.clone(); o.material.emissive = C(hex); o.material.emissiveIntensity = 0; return o.material; };
      home.wins = [glowM('Window_L', 0xffc477), glowM('Window_R', 0xffc477), glowM('Porch_Lamp', 0xffd28a)];
      home.glows.forEach((sp) => { sp.position.y = 1.75; sp.position.z = home.D / 2 + 0.25; });
      home.porch.position.set(0.9, 2.3, home.D / 2 + 0.25);
      homeLights = -1;
    }),
    load('banana').then((root) => {
      const A = root.getObjectByName('Banana_A'), B = root.getObjectByName('Banana_B');
      bananas.forEach((g, i) => {
        g.children.forEach((c) => { c.visible = false; });
        const m = (i % 3 === 1 ? B : A).clone(), h = 2.3 + (i % 3) * 0.4;
        m.position.set(0, 0, 0); m.rotation.y = i * 1.9; m.scale.setScalar(i % 3 === 1 ? h / 2.0 * 0.9 : h / 2.6);
        g.add(m);
      });
    }),
  ];
  return Promise.all(jobs.map((j) => j.catch(() => {})));
}).catch(() => {});
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
}).catch(() => {}).then(() => upgrade);

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
  const ahead = dronePath.getTangentAt(clamp01(du + 0.03)), bend = dir.x * ahead.z - dir.z * ahead.x; // leans into its turns
  const pitch = t < HOME[0] ? 0.17 : lerp(0.17, 0.02, clamp01((t - HOME[0]) / 2.5)), roll = Math.max(-0.3, Math.min(0.3, -bend * 6)) + Math.sin(t * 1.3) * 0.02;
  drone.rotation.set(0, Math.atan2(dir.x, dir.z), 0); drone.rotateX(pitch); drone.rotateZ(roll);
  props.forEach((p, i) => { p.rotation.y = t * 47 * (i % 3 ? 1 : -1); });
  const hang = drone.userData.hang; hang.rotation.x = -pitch * 0.8 + Math.sin(t * 2.1) * 0.06; hang.rotation.z = -roll + Math.sin(t * 1.6) * 0.04; // the parcel hangs down and sways
  Object.keys(drone.userData.D.userData).forEach((k) => { drone.userData.D.userData[k].material.opacity = 0.85; });
  drone.userData.strobe.material.opacity = (t % 1) < 0.07 ? 1 : 0;

  // the smart home's lights come on by themselves; the robot walks to the gate and waves
  setHomeLights(smooth(HOME[0] + 0.9, HOME[0] + 2.0, t));
  if (robot.root) {
    const wt = t - HOME[0], walkEnd = 1.7;
    const rx = lerp(17.2, 19.1, clamp01(wt / walkEnd)), rz = lerp(-10.4, -8.2, clamp01(wt / walkEnd));
    robot.root.position.set(rx, 0, rz); robot.root.rotation.y = wt < walkEnd ? Math.atan2(19.1 - 17.2, -8.2 + 10.4) : lerp(0.71, 0.3, clamp01((wt - walkEnd) / 0.6)); // then it faces us
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
  // a classmate waits on this pavement, watches the car stop, then waves too
  girl.g.position.set(-1.25, KERB + 0.02, 4.7); girl.g.visible = kid.g.visible;
  girl.g.rotation.y = lerp(Math.PI * 0.82, 0.35, smooth(walkDur - 0.3, walkDur + 0.3, kt));
  girl.pose(Math.max(0, kt) + 0.4, 0, smooth(walkDur + 0.3, walkDur + 0.7, kt), 1.6);
  const seen = carOn && t > CAR_STOP - 1.4 && kt < walkDur - 0.3;
  seenBox.position.set(kx, curb + 0.78, kz); seenBox.material.opacity = seen ? 0.95 : 0;
  seenTag.position.set(kx, curb + 1.72, kz); seenTag.material.opacity = seen ? 1 : 0;

  // the camera
  if (t < DRONE[1]) {
    const f = ease(t / DRONE[1]);
    // a chase shot: from just behind the drone, looking down the valley, swinging out to its side
    const fw = tmp.set(dir.x, 0, dir.z).normalize(), rx = -fw.z, rz = fw.x; // forward, and right of the drone
    const back = lerp(-2.6, 0.6, f), side = lerp(1.2, 4.2, f), up = lerp(0.7, 1.2, f);
    camP.set(dp.x + fw.x * back + rx * side, dp.y + up, dp.z + fw.z * back + rz * side);
    const lead = lerp(2.2, 0.6, f) * (aspect < 1.2 ? 0.1 : 1); // on a tall phone screen, look right at the drone so it stays in the picture
    camT.set(dp.x + fw.x * lead, dp.y - lerp(0.5, 0.3, f), dp.z + fw.z * lead);
    sunAt(dp, 70); // a wide shadow area: every tree and house in the valley stands on its shadow
  } else if (t < HOME[1]) {
    const f = ease((t - HOME[0]) / (HOME[1] - HOME[0]));
    camP.set(lerp(22.6, 21.2, f), lerp(2.2, 1.6, f), lerp(1.6, -1.0, f));
    camT.set(lerp(18.6, 18.9, f), lerp(2.6, 1.9, f), lerp(-12.5, -11.5, f)); // the robot stays in the middle, clear of the caption
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
