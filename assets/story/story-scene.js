/* The story on the course home page: one 3D scene that plays lessons 0 to 4 in about 45 seconds.
   Lesson 0: the ESP32 blinks its blue LED. Lesson 1: wires and LEDs go in, the traffic light runs and the cars obey.
   Lesson 2: a light pattern. Lesson 3: a button, a walker presses and crosses. Lesson 4: a tap is remembered,
   WAIT lights up, yellow, then the walkers' red. Then an invitation to start.

   The workbench (ESP32, breadboard, LEDs, resistors, wires, button, Officer Ohm) is the same code as lesson 4,
   so the home page shows exactly what learners build. The road and people come from assets/road/.
   Needs three.js r128, assets/road/model-road.js and assets/road/pedestrians.js loaded first.

   Usage: const s = KKStory.mount({ host, base: '', reduceMotion, onChapter(id, k) {} }); s.start(); s.stop(); */
(function () {
'use strict';
function mount(o) {
/* =========================================================
   Board geometry. 1 unit ≈ 1 cm; breadboard hole pitch 0.25.
   ========================================================= */
const P = 0.25;
const colX = (c) => (c - 15.5) * P;
const ROWZ = { a: -1.375, b: -1.125, c: -0.875, d: -0.625, e: -0.375, f: 0.375, g: 0.625, h: 0.875, i: 1.125, j: 1.375 };
const FAR_ROWS = ['a', 'b', 'c', 'd', 'e'], NEAR_ROWS = ['f', 'g', 'h', 'i', 'j'];
const NEG_RAIL_Z = 2.2, POS_RAIL_Z = 1.95;
const RAIL_COLS = [];
for (let c = 1; c <= 30; c++) if ((c - 1) % 6 !== 0) RAIL_COLS.push(c);
const HEADER_Z = -3.45, HEADER_TOP = -0.05, SLEEVE = 0.27;
const PIN_X = { D32: -0.5, D25: 0, D26: 0.25, D27: 0.5, GND: 1.5 };

const CH = [
  { key: 'red', name: 'Red', word: 'Stop', pin: 'D25', num: 25, col: 7, hex: 0xff3030, wire: 0xe0413b },
  { key: 'yellow', name: 'Yellow', word: 'Get ready to stop', pin: 'D26', num: 26, col: 15, hex: 0xffb400, wire: 0xf2c12e },
  { key: 'green', name: 'Green', word: 'Go', pin: 'D27', num: 27, col: 23, hex: 0x1fd067, wire: 0x2fae5f },
];

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const holeAt = (c, r, y = 0) => V(colX(c), y, ROWZ[r]);
const railAt = (c, y = 0) => V(colX(c), y, NEG_RAIL_Z);
const pinAt = (n, y = HEADER_TOP) => V(PIN_X[n], y, HEADER_Z);

/* =========================================================
   Renderer, scene, camera
   ========================================================= */
const host = o.host;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  return null; // no WebGL: the page keeps showing the poster picture
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f7fa);
scene.fog = new THREE.Fog(0xf3f7fa, 34, 70);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0.5, 6.2, 10.5);
const target = new THREE.Vector3(0, 0.6, -1.2); // the story moves the camera itself

scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd8e0, 0.72));
scene.add(new THREE.AmbientLight(0xffffff, 0.16));
const sun = new THREE.DirectionalLight(0xffffff, 0.62);
sun.position.set(6, 15, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0006;
sun.shadow.radius = 4;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfefff, 0.22);
fill.position.set(-8, 6, -4);
scene.add(fill);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, o));
function mesh(geo, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true;
  return o;
}
function rod(a, b, r, m) {
  const d = b.clone().sub(a);
  const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return o;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const metal = mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });

/* ---------- table ---------- */
const table = mesh(new THREE.BoxGeometry(30, 0.6, 20), mat(0xe6d3b5, { roughness: 0.85 }), 0, -0.7, -2, false);
scene.add(table);
const matPad = mesh(new THREE.BoxGeometry(17, 0.02, 13.4), mat(0xcfe2e6, { roughness: 0.95 }), 0.6, -0.39, -2.6, false);
scene.add(matPad);

const pickables = [];
function tagPart(obj, part) {
  obj.userData.part = part;
  pickables.push(obj);
}

/* ---------- breadboard ---------- */
function breadboardTexture(W, D) {
  const S = 180;
  const c = document.createElement('canvas');
  c.width = Math.round(W * S); c.height = Math.round(D * S);
  const g = c.getContext('2d');
  const U = (x) => (x + W / 2) * S, Z = (z) => (z + D / 2) * S;
  g.fillStyle = '#f8f8f4'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#dcddd5'; g.fillRect(0, Z(-0.13), c.width, 0.26 * S);
  const line = (z, col) => { g.fillStyle = col; g.fillRect(U(colX(1) - 0.2), Z(z) - 0.014 * S, (colX(30) - colX(1) + 0.4) * S, 0.028 * S); };
  line(-2.42, '#2f6fde'); line(-1.76, '#d93b3b'); line(1.76, '#d93b3b'); line(2.42, '#2f6fde');
  const hole = (x, z) => { const s = 0.1 * S; g.fillStyle = '#41464c'; roundRect(g, U(x) - s / 2, Z(z) - s / 2, s, s, s * 0.22); g.fill(); };
  for (let col = 1; col <= 30; col++) for (const r in ROWZ) hole(colX(col), ROWZ[r]);
  for (const col of RAIL_COLS) { hole(colX(col), POS_RAIL_Z); hole(colX(col), NEG_RAIL_Z); hole(colX(col), -1.95); hole(colX(col), -2.2); }
  g.fillStyle = '#6f7a85'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${0.115 * S}px Nunito, Arial, sans-serif`;
  for (let col = 1; col <= 30; col++) { g.fillText(String(col), U(colX(col)), Z(-1.58)); g.fillText(String(col), U(colX(col)), Z(1.58)); }
  for (const r in ROWZ) { g.fillText(r, U(colX(0)), Z(ROWZ[r])); g.fillText(r, U(colX(31)), Z(ROWZ[r])); }
  g.font = `800 ${0.2 * S}px Nunito, Arial, sans-serif`;
  const sign = (t, col, z, fillc) => { g.fillStyle = fillc; g.fillText(t, U(colX(col)), Z(z)); };
  sign('−', 0, NEG_RAIL_Z, '#2f6fde'); sign('−', 31, NEG_RAIL_Z, '#2f6fde');
  sign('+', 0, POS_RAIL_Z, '#d93b3b'); sign('+', 31, POS_RAIL_Z, '#d93b3b');
  sign('−', 0, -2.2, '#2f6fde'); sign('+', 0, -1.95, '#d93b3b');
  sign('−', 31, -2.2, '#2f6fde'); sign('+', 31, -1.95, '#d93b3b');
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeBreadboard() {
  const g = new THREE.Group();
  const W = 8.4, D = 5.3, H = 0.4;
  g.add(mesh(new THREE.BoxGeometry(W, H, D), mat(0xf2f2ec, { roughness: 0.8 }), 0, -H / 2 - 0.001, 0));
  const top = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: breadboardTexture(W, D), roughness: 0.85 }), 0, 0.001, 0, false);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  tagPart(g, 'breadboard');
  return g;
}

/* ---------- controller board: ESP32 DevKit V1 (30-pin), pins pointing up ----------
   Laid out from a top view of the real board: antenna end on the left, micro-USB on the right,
   the EN…VIN pin row nearest the breadboard and the D23…3V3 row at the back. Rows are 0.9" apart. */
const NEAR_PINS = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
const FAR_PINS = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'];
const FAR_HEADER_Z = HEADER_Z - 0.9 * 2.54;
const pinColX = (k) => (k - 7) * P;
const ESP = { x0: pinColX(0) - 0.48, x1: pinColX(14) + 0.65, z0: FAR_HEADER_Z - 0.1, z1: HEADER_Z + 0.1, y: -0.2 };
ESP.cx = (ESP.x0 + ESP.x1) / 2; ESP.cz = (ESP.z0 + ESP.z1) / 2;
ESP.W = ESP.x1 - ESP.x0; ESP.D = ESP.z1 - ESP.z0;

function canvasFor(w, d, S) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * S); c.height = Math.round(d * S);
  return [c, c.getContext('2d')];
}
function texFrom(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
function esp32Texture() {
  const { cx, cz, W, D } = ESP;
  const S = 220;
  const [c, g] = canvasFor(W, D, S);
  const U = (x) => (x - cx + W / 2) * S, Z = (z) => (z - cz + D / 2) * S;
  g.fillStyle = '#4a4b4f'; g.fillRect(0, 0, c.width, c.height);
  // mounting holes
  g.fillStyle = '#f3f7fa';
  for (const x of [ESP.x0 + 0.2, ESP.x1 - 0.2]) for (const z of [cz - 1.02, cz + 1.02]) { g.beginPath(); g.arc(U(x), Z(z), 0.12 * S, 0, Math.PI * 2); g.fill(); }
  // through-hole pads (square for VIN and 3V3)
  for (const z of [HEADER_Z, FAR_HEADER_Z]) for (let k = 0; k < 15; k++) {
    const x = pinColX(k);
    g.fillStyle = '#c9ccd1'; g.strokeStyle = '#8d9096'; g.lineWidth = 3;
    if (k === 14) { g.fillRect(U(x) - 0.09 * S, Z(z) - 0.09 * S, 0.18 * S, 0.18 * S); }
    else { g.beginPath(); g.arc(U(x), Z(z), 0.095 * S, 0, Math.PI * 2); g.fill(); g.stroke(); }
  }
  // silkscreen pin names
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = `800 ${0.11 * S}px Nunito, Arial, sans-serif`;
  const vert = (t, x, z, align) => { g.save(); g.translate(U(x), Z(z)); g.rotate(-Math.PI / 2); g.textAlign = align; g.fillText(t, 0, 0); g.restore(); };
  NEAR_PINS.forEach((t, k) => vert(t, pinColX(k), HEADER_Z - 0.14, 'left'));
  FAR_PINS.forEach((t, k) => vert(t, pinColX(k), FAR_HEADER_Z + 0.14, 'right'));
  vert('EN', ESP.x1 - 0.42, cz + 0.4, 'center');
  vert('BOOT', ESP.x1 - 0.42, cz - 0.42, 'center');
  // small surface-mount parts
  const smd = (x, z, w, d, body) => {
    g.fillStyle = '#d9dbde'; g.fillRect(U(x - w / 2), Z(z - d / 2), w * S, d * S);
    g.fillStyle = body; g.fillRect(U(x - w / 2) + 0.03 * S, Z(z - d / 2) + 0.03 * S, (w - 0.06) * S, (d - 0.06) * S);
  };
  for (let k = 0; k < 5; k++) smd(0.42, cz + 0.15 - k * 0.15, 0.2, 0.1, '#111');
  smd(0.32, cz + 0.65, 0.1, 0.2, '#c9a27a'); smd(0.45, cz + 0.65, 0.1, 0.2, '#c9a27a');
  smd(0.32, cz - 0.68, 0.1, 0.2, '#111'); smd(0.45, cz - 0.68, 0.1, 0.2, '#111');
  for (const z of [cz + 0.62, cz + 0.32, cz - 0.05]) smd(ESP.x1 - 0.85, z, 0.1, 0.2, '#111');
  smd(ESP.x1 - 0.85, cz + 0.02, 0.1, 0.2, '#c9a27a');
  for (const z of [cz - 0.4, cz - 0.7]) smd(ESP.x1 - 0.85, z, 0.1, 0.2, '#111');
  smd(0.72, cz - 0.7, 0.18, 0.1, '#111');
  // highlight the pins this lesson uses
  g.strokeStyle = '#F2B705'; g.lineWidth = 6;
  roundRect(g, U(pinColX(7) - 0.15), Z(HEADER_Z - 0.62), 0.8 * S, 0.76 * S, 12); g.stroke();
  roundRect(g, U(pinColX(13) - 0.15), Z(HEADER_Z - 0.62), 0.3 * S, 0.76 * S, 12); g.stroke();
  return texFrom(c);
}
function moduleTexture(w, d) {
  const S = 220;
  const [c, g] = canvasFor(w, d, S);
  g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, c.width, c.height);
  // castellated pads along both long sides and the inner end
  g.fillStyle = '#e8d36a';
  for (let k = 0; k < 13; k++) {
    const x = (0.62 + k * 0.105) * S;
    g.fillRect(x, 0, 0.06 * S, 0.07 * S);
    g.fillRect(x, c.height - 0.07 * S, 0.06 * S, 0.07 * S);
  }
  for (let k = 0; k < 10; k++) g.fillRect(c.width - 0.07 * S, (0.32 + k * 0.105) * S, 0.07 * S, 0.06 * S);
  // printed antenna trace (zig-zag)
  g.strokeStyle = '#3b3b3d'; g.lineWidth = 0.05 * S; g.lineJoin = 'miter';
  const pts = [[0.48, 0.1], [0.1, 0.1], [0.1, 0.3], [0.48, 0.3], [0.48, 0.55], [0.1, 0.55], [0.1, 0.78], [0.48, 0.78], [0.48, 1.0], [0.1, 1.0], [0.1, 1.3], [0.36, 1.3]];
  g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x * S, z * S) : g.moveTo(x * S, z * S))); g.stroke();
  return texFrom(c);
}
function shieldTexture(w, d) {
  const S = 220;
  const [c, g] = canvasFor(w, d, S);
  g.fillStyle = '#a7aaae'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f2f3f4'; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6);
  g.save(); g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2);
  g.fillStyle = '#f4f5f6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${0.16 * S}px Nunito, Arial, sans-serif`;
  g.fillText('ESP-WROOM-32', 0, -0.36 * S);
  g.font = `800 ${0.34 * S}px Nunito, Arial, sans-serif`;
  g.fillText('C  E', -0.12 * S, 0.02 * S);
  g.font = `700 ${0.09 * S}px Nunito, Arial, sans-serif`;
  g.fillText('FCC ID: 2AC7Z-ESPWROOM32', 0, 0.4 * S);
  g.restore();
  g.fillStyle = '#111'; g.beginPath(); g.arc(c.width - 0.14 * S, c.height - 0.14 * S, 0.05 * S, 0, Math.PI * 2); g.fill();
  return texFrom(c);
}
function chipTexture(w, d, lines, rot) {
  const S = 260;
  const [c, g] = canvasFor(w, d, S);
  g.fillStyle = '#26272a'; g.fillRect(0, 0, c.width, c.height);
  g.save(); g.translate(c.width / 2, c.height / 2); g.rotate(rot);
  g.fillStyle = '#8f9196'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${0.075 * S}px 'JetBrains Mono', monospace`;
  lines.forEach((t, i) => g.fillText(t, 0, (i - (lines.length - 1) / 2) * 0.09 * S));
  g.restore();
  return texFrom(c);
}
function topBox(w, h, d, sideMat, tex, x, y, z, tint = 0xffffff) {
  const m = [sideMat, sideMat, new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: 0.5 }), sideMat, sideMat, sideMat];
  return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
}

let blueLed = null, blueGlowPos = null;
function makeESP32() {
  const g = new THREE.Group();
  const { cx, cz, W, D, y } = ESP;
  const top = y + 0.03;
  const pcb = mat(0x46474b, { roughness: 0.6 });
  g.add(topBox(W, 0.06, D, pcb, esp32Texture(), cx, y, cz));
  const dark = mat(0x1d1e21, { roughness: 0.5 });
  const silver = mat(0xd3d6da, { metalness: 0.45, roughness: 0.3 });
  // rubber feet under the mounting holes
  for (const x of [ESP.x0 + 0.2, ESP.x1 - 0.2]) for (const z of [cz - 1.02, cz + 1.02]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, y + 0.4 - 0.03, 12), dark, x, (-0.4 + y - 0.03) / 2, z));
  // header strips with pins pointing up (female jumper ends slide onto them)
  const pinGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
  const pinMat = mat(0xd9b44a, { metalness: 0.4, roughness: 0.35 });
  for (const z of [HEADER_Z, FAR_HEADER_Z]) {
    g.add(mesh(new THREE.BoxGeometry(15 * P, 0.08, 0.22), dark, 0, top + 0.04, z));
    for (let k = 0; k < 15; k++) g.add(mesh(pinGeo, pinMat, pinColX(k), top + 0.2, z, false));
  }
  // ESP-WROOM-32 module: black carrier with antenna trace, metal shield
  const mx0 = ESP.x0 + 0.04, mx1 = pinColX(7) + 0.05, mw = mx1 - mx0, md = 1.44;
  g.add(topBox(mw, 0.06, md, dark, moduleTexture(mw, md), (mx0 + mx1) / 2, top + 0.03, cz));
  const sw = 1.52, sd = 1.32, sx = mx1 - 0.06 - sw / 2;
  g.add(topBox(sw, 0.1, sd, silver, shieldTexture(sw, sd), sx, top + 0.11, cz, 0x9a9da2));
  // power LED (red, lit when powered) and GPIO2 LED (blue)
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.09), mat(0xff2a2a, { emissive: 0xff2020, emissiveIntensity: 0.9 }), 0.42, top + 0.025, cz + 0.45, false));
  blueLed = mat(0x2aa7e0, { roughness: 0.4, emissive: 0x2a8cff, emissiveIntensity: 0 });
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.09), blueLed, 0.42, top + 0.025, cz - 0.45, false));
  blueGlowPos = V(0.42, top + 0.1, cz - 0.45);
  // AMS1117 regulator and CP2102 USB chip
  g.add(topBox(0.57, 0.12, 0.28, dark, chipTexture(0.57, 0.28, ['AMS1117', '3.3'], 0), 1.3, top + 0.06, cz + 0.48));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.03, 0.3), silver, 1.3, top + 0.015, cz + 0.72, false));
  g.add(topBox(0.44, 0.08, 0.44, dark, chipTexture(0.44, 0.44, ['CP2102', 'DCL0CH'], 0), 1.34, top + 0.04, cz - 0.56));
  // EN and BOOT buttons either side of the micro-USB socket
  for (const z of [cz + 0.71, cz - 0.71]) {
    g.add(mesh(new THREE.BoxGeometry(0.43, 0.12, 0.25), silver, ESP.x1 - 0.25, top + 0.06, z));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 16), dark, ESP.x1 - 0.25, top + 0.15, z));
  }
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.2, 0.68), silver, ESP.x1 - 0.17, top + 0.1, cz));
  tagPart(g, 'controller');
  return g;
}

/* ---------- LED ---------- */
function flangeGeometry(r, h) {
  const s = new THREE.Shape();
  const cut = 0.8 * r, a = Math.acos(cut / r);
  s.absarc(0, 0, r, a, Math.PI * 2 - a, false);
  s.lineTo(cut, r * Math.sin(a));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 28 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}
let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}
function makeLED(hex, scale = 1, legs = [0.5, 0.5], spread = P) {
  const g = new THREE.Group();
  const s = scale;
  const leg = mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });
  const legTop = 0.45 * s;
  const anode = rod(V(0, legTop - legs[0] * s, 0), V(0, legTop, 0), 0.018 * s, leg);
  const cathode = rod(V(spread, legTop - legs[1] * s, 0), V(spread, legTop, 0), 0.018 * s, leg);
  g.add(anode, cathode);
  const body = mat(hex, { transparent: true, opacity: 0.8, roughness: 0.22, emissive: hex, emissiveIntensity: 0.06 });
  const cx = spread / 2;
  const flange = mesh(flangeGeometry(0.29 * s, 0.06 * s), body, cx, legTop, 0);
  const barrel = mesh(new THREE.CylinderGeometry(0.25 * s, 0.25 * s, 0.32 * s, 28), body, cx, legTop + 0.06 * s + 0.16 * s, 0);
  const dome = mesh(new THREE.SphereGeometry(0.25 * s, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), body, cx, legTop + 0.38 * s, 0);
  g.add(flange, barrel, dome);
  const light = new THREE.PointLight(hex, 0, 4.5 * s, 2);
  light.position.set(cx, legTop + 0.4 * s, 0);
  g.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(1.7 * s, 1.7 * s, 1);
  glow.position.set(cx, legTop + 0.35 * s, 0);
  g.add(glow);
  g.userData.led = { body, light, glow, base: new THREE.Color(hex), dim: new THREE.Color(hex).lerp(new THREE.Color(0x6b7280), 0.55) };
  body.color.copy(g.userData.led.dim);
  return g;
}

/* ---------- resistor (330 Ω: orange, orange, brown, gold) ---------- */
function makeResistor() {
  const g = new THREE.Group();
  const lead = mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });
  const zA = ROWZ.d, zB = ROWZ.g, yb = 0.3, half = 0.27;
  g.add(rod(V(0, -0.05, zA), V(0, yb, zA), 0.016, lead));
  g.add(rod(V(0, -0.05, zB), V(0, yb, zB), 0.016, lead));
  g.add(rod(V(0, yb, zA), V(0, yb, -half), 0.016, lead));
  g.add(rod(V(0, yb, half), V(0, yb, zB), 0.016, lead));
  const bodyMat = mat(0xd8c08e, { roughness: 0.5 });
  const body = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 20), bodyMat, 0, yb, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (const z of [-0.2, 0.2]) g.add(mesh(new THREE.SphereGeometry(0.1, 16, 12), bodyMat, 0, yb, z));
  const bands = [[-0.17, 0xf08a24], [-0.08, 0xf08a24], [0.01, 0x7a4a22], [0.17, 0xc9a227]];
  for (const [z, col] of bands) {
    const b = mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.045, 20), mat(col, { roughness: 0.4, metalness: col === 0xc9a227 ? 0.6 : 0 }), 0, yb, z);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  return g;
}

/* ---------- jumper wire ---------- */
const SEGS = 120, RADIAL = 10;
function makeWire(points, color) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, SEGS, 0.045, RADIAL, false);
  const tube = mesh(geo, mat(color, { roughness: 0.45 }));
  g.add(tube);
  const sleeveMat = mat(0x24272c, { roughness: 0.5 });
  const pinMat = metal;
  const ends = [];
  for (const p of [points[0], points[points.length - 1]]) {
    const e = new THREE.Group();
    e.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, SLEEVE, 12), sleeveMat, p.x, p.y - SLEEVE / 2, p.z));
    e.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), pinMat, p.x, p.y - SLEEVE - 0.05, p.z));
    g.add(e); ends.push(e);
  }
  const w = { group: g, curve, geo, ends, progress: 1 };
  w.set = (f) => {
    w.progress = f;
    geo.setDrawRange(0, Math.floor(f * SEGS) * RADIAL * 6);
    ends[0].visible = f > 0;
    ends[1].visible = f >= 1;
  };
  tagPart(g, 'wire');
  return w;
}

/* ---------- push button (tactile switch): four legs, the cap goes down when pressed ---------- */
let btnCap = null;
function makeButton() {
  const g = new THREE.Group();
  const leg = mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });
  for (const x of [-P, P]) for (const z of [ROWZ.e, ROWZ.f]) {
    g.add(rod(V(x, -0.05, z), V(x, 0.2, z), 0.016, leg));
    g.add(rod(V(x, 0.2, z), V(x, 0.2, Math.sign(z) * 0.27), 0.016, leg));
  }
  g.add(mesh(new THREE.BoxGeometry(0.64, 0.2, 0.6), mat(0x2b2f35, { roughness: 0.55 }), 0, 0.22, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.025, 0.5), metal, 0, 0.335, 0));
  btnCap = new THREE.Group();
  btnCap.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 28), mat(0x2f6fde, { roughness: 0.35 }), 0, 0.41, 0));
  btnCap.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.016, 24), mat(0x7fa8ff, { roughness: 0.3 }), 0, 0.485, 0, false));
  g.add(btnCap);
  tagPart(g, 'button');
  return g;
}

/* ---------- guide character: Officer Ohm ---------- */
function makeCop() {
  const g = new THREE.Group();
  const navy = mat(0x2c4e9e, { roughness: 0.7 }), dark = mat(0x1f2a3d, { roughness: 0.7 });
  const skin = mat(0xf2c9a0, { roughness: 0.8 }), gold = mat(0xf2b705, { metalness: 0.4, roughness: 0.35 });
  const ink = mat(0x15202a, { roughness: 0.5 });
  for (const sx of [-0.16, 0.16]) {
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 14), dark, sx, 0.4, 0));
    g.add(mesh(new THREE.BoxGeometry(0.24, 0.12, 0.36), ink, sx, 0.06, 0.06));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.9, 20), navy, 0, 1.18, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.1, 20), ink, 0, 0.8, 0));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.1, 0.05), gold, 0, 0.8, 0.42));
  g.add(mesh(new THREE.BoxGeometry(0.13, 0.15, 0.04), gold, -0.16, 1.38, 0.37));
  g.add(mesh(new THREE.SphereGeometry(0.4, 24, 18), skin, 0, 1.98, 0));
  for (const sx of [-0.14, 0.14]) {
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), ink, sx, 2.03, 0.36, false));
    g.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(0xf4a6a0, { roughness: 0.9 }), sx * 1.6, 1.9, 0.32, false));
  }
  const smile = mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 18, Math.PI), ink, 0, 1.9, 0.37, false);
  smile.rotation.z = Math.PI;
  g.add(smile);
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.37, 0.26, 24), dark, 0, 2.38, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.06, 24), dark, 0, 2.52, -0.02));
  g.add(mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.07, 24), ink, 0, 2.27, 0));
  const brim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20, 1, false, -Math.PI / 2, Math.PI), ink, 0, 2.25, 0.25);
  g.add(brim);
  g.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), gold, 0, 2.4, 0.38));
  const armL = new THREE.Group(); armL.position.set(-0.46, 1.52, 0);
  armL.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.62, 12), navy, 0, -0.3, 0));
  armL.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), skin, 0, -0.64, 0));
  armL.rotation.z = -0.15;
  const armR = new THREE.Group(); armR.position.set(0.46, 1.52, 0);
  armR.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.62, 12), navy, 0, -0.3, 0));
  armR.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), skin, 0, -0.64, 0));
  armR.rotation.z = 0.15;
  g.add(armL, armR);
  g.userData.armR = armR;
  tagPart(g, 'cop');
  return g;
}

/* ---------- enlarged LED on a display stand ---------- */
function makeBigLED() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.2, 32), mat(0xffffff, { roughness: 0.6 }), 0, 0.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), mat(0xbfe6f0, { transparent: true, opacity: 0.45, roughness: 0.1 }), 0.35, 1.15, -0.55));
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.08, 0.12), mat(0xbfe6f0, { transparent: true, opacity: 0.45, roughness: 0.1 }), 0.35, 2.2, -0.55));
  const led = makeLED(0xff3030, 2.6, [0.75, 0.5], 0.7);
  led.position.set(0, 1.0, 0);
  led.userData.led.body.color.copy(led.userData.led.base);
  led.userData.led.body.emissiveIntensity = 0.2;
  g.add(led);
  tagPart(g, 'led');
  return g;
}

/* =========================================================
   Build the scene
   ========================================================= */
const breadboard = makeBreadboard();
scene.add(breadboard);
const esp32 = makeESP32();
scene.add(esp32);

const leds = [], resistors = [], pinWires = [], cathodeWires = [];
CH.forEach((ch, i) => {
  const led = makeLED(ch.hex);
  led.position.set(colX(ch.col), 0, ROWZ.i);
  tagPart(led, 'led');
  scene.add(led); leds.push(led);

  const r = makeResistor();
  r.position.set(colX(ch.col), 0, 0);
  tagPart(r, 'resistor');
  scene.add(r); resistors.push(r);

  const A = pinAt(ch.pin, HEADER_TOP + SLEEVE), B = holeAt(ch.col, 'b', SLEEVE);
  const h = [0, 0.18, 0.36][i];
  const w = makeWire([
    A, V(A.x, A.y + 0.45 + h, A.z + 0.12),
    V((A.x + B.x) / 2, 1.5 + h, (A.z + B.z) / 2 - 0.1),
    V(B.x, B.y + 0.55, B.z - 0.18), B,
  ], ch.wire);
  scene.add(w.group); pinWires.push(w);

  const cA = holeAt(ch.col + 1, 'j', SLEEVE), cB = railAt(ch.col + 1, SLEEVE);
  const k = makeWire([cA, V(cA.x, cA.y + 0.14, cA.z + 0.2), V(cB.x, cB.y + 0.14, cB.z - 0.2), cB], 0x2b2b2e);
  scene.add(k.group); cathodeWires.push(k);
});
const gA = pinAt('GND', HEADER_TOP + SLEEVE), gB = railAt(30, SLEEVE);
const gndWire = makeWire([gA, V(1.55, 0.85, -3.3), V(3.3, 1.5, -2.6), V(4.6, 1.35, -0.6), V(4.45, 1.0, 1.5), V(gB.x, 0.72, gB.z), gB], 0x2b2b2e);
scene.add(gndWire.group);

// push button on the left of the breadboard (rows 2 and 4), wired to D32 and to the ground rail
const btnGroup = makeButton();
btnGroup.position.set(colX(3), 0, 0);
scene.add(btnGroup);
const bwA = pinAt('D32', HEADER_TOP + SLEEVE), bwB = holeAt(2, 'b', SLEEVE);
const btnWire = makeWire([
  bwA, V(bwA.x, bwA.y + 0.5, bwA.z + 0.12),
  V((bwA.x + bwB.x) / 2, 1.7, (bwA.z + bwB.z) / 2 - 0.1),
  V(bwB.x, bwB.y + 0.55, bwB.z - 0.18), bwB,
], 0x2f6fde);
scene.add(btnWire.group);
const bgA = holeAt(2, 'j', SLEEVE), bgB = railAt(2, SLEEVE);
const btnGndWire = makeWire([bgA, V(bgA.x, bgA.y + 0.14, bgA.z + 0.2), V(bgB.x, bgB.y + 0.14, bgB.z - 0.2), bgB], 0x2b2b2e);
scene.add(btnGndWire.group);

const cop = makeCop();
cop.position.set(-5.9, -0.4, 1.6);
cop.rotation.y = 0.45;
scene.add(cop);
const bigLed = makeBigLED();
bigLed.position.set(7.4, -0.4, 0.2);
bigLed.rotation.y = -0.35;
scene.add(bigLed);

scene.remove(bigLed);
const reduceMotion = !!o.reduceMotion;

/* ---------- the model road and its people, driven by the story ---------- */
let roadLit = -1;            // what the cars' traffic lights show
let walkWin = 0;             // seconds people may still start crossing
let pressed = false, waitingNote = false;
const roadApi = ModelRoad.create({ THREE, scene, renderer, getLit: () => roadLit, reduceMotion, glow: getGlowTexture, tagPart, suddenRed: true, base: o.base });
const walkers = Pedestrians.create({ THREE, road: roadApi, reduceMotion, signals: true, minWindow: 1.5,
  getPressed: () => pressed, getWaiting: () => waitingNote, walkWindow: () => walkWin });

/* ---------- lights ---------- */
function setLeds(idx) {
  leds.forEach((led, i) => {
    const on = Array.isArray(idx) ? idx.includes(i) : i === idx;
    const L = led.userData.led;
    L.body.color.copy(on ? L.base : L.dim);
    L.body.emissiveIntensity = on ? 1.2 : 0;
    L.body.opacity = on ? 0.98 : 0.7;
    L.light.intensity = on ? 2.4 : 0;
    L.glow.material.opacity = on ? 0.95 : 0;
  });
}
function setLights(idx) { setLeds(idx); roadLit = idx; roadApi.setLamps(idx); }
const blueGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x3d9bff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
blueGlow.scale.set(0.9, 0.9, 1); blueGlow.position.copy(blueGlowPos); esp32.add(blueGlow);
function setBlue(on) { blueLed.emissiveIntensity = on ? 2.2 : 0; blueGlow.material.opacity = on ? 0.9 : 0; }

/* ---------- parts that appear chapter by chapter ---------- */
const trafficParts = [...leds, ...resistors];
const trafficWires = [...pinWires, ...cathodeWires, gndWire];
const buttonWires = [btnWire, btnGndWire];
function showTraffic(f) { // f: 0 hidden … 1 built
  trafficWires.forEach((w, i) => { const k = Math.max(0, Math.min(1, f * trafficWires.length - i * 0.6)); w.group.visible = k > 0; w.set(k); });
  trafficParts.forEach((p) => { const s = Math.max(0.001, Math.min(1, f * 1.6 - 0.2)); p.visible = s > 0.01; p.scale.setScalar(s); });
}
function showButton(f) {
  btnGroup.visible = f > 0; btnGroup.scale.setScalar(Math.max(0.001, Math.min(1, f * 2)));
  buttonWires.forEach((w, i) => { const k = Math.max(0, Math.min(1, f * 2 - i * 0.5)); w.group.visible = k > 0; w.set(k); });
}

/* ---------- camera ---------- */
const SHOTS = {
  esp: { p: [2.2, 3.4, -0.6], t: [0.2, -0.1, -4.6] },
  build: { p: [0.6, 5.8, 6.4], t: [0, 0.2, -1.6] },
  road: { p: [0.6, 6.6, 9.8], t: [0, 0.2, -4.2] },
  leds: { p: [-0.6, 3.8, 5.0], t: [0, 0.3, 0.2] },
  button: { p: [-4.2, 4.6, 6.2], t: [-1.6, 0.2, -3.2] },
  crossing: { p: [1.6, 3.4, -2.0], t: [-0.6, 0.4, -9.2] },
  wide: { p: [0.4, 7.4, 11.6], t: [0, 0.1, -4.4] },
};
const camFrom = { p: new THREE.Vector3(), t: new THREE.Vector3() }, camTo = { p: new THREE.Vector3(), t: new THREE.Vector3() };
let camT = 1, camDur = 1.6;
function shot(key, instant) {
  const s = SHOTS[key];
  camFrom.p.copy(camera.position); camFrom.t.copy(target);
  camTo.p.set(...s.p); camTo.t.set(...s.t);
  if (camera.aspect < 1.2) camTo.p.sub(camTo.t).multiplyScalar(1 + (1.2 - camera.aspect) * 0.55).add(camTo.t); // phones: step back a little
  camT = instant || reduceMotion ? 1 : 0;
  if (camT === 1) { camera.position.copy(camTo.p); target.copy(camTo.t); }
}
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
let drift = 0;
function updateCam(dt) {
  if (camT < 1) {
    camT = Math.min(1, camT + dt / camDur);
    const f = ease(camT);
    camera.position.lerpVectors(camFrom.p, camTo.p, f); target.lerpVectors(camFrom.t, camTo.t, f);
  } else if (!reduceMotion) {
    // a slow sideways drift keeps the picture alive
    drift += dt;
    camera.position.x = camTo.p.x + Math.sin(drift * 0.25) * 0.35;
  }
  camera.lookAt(target);
}

/* ---------- the story: one chapter per lesson ---------- */
const CHAPTERS = [
  { id: 'l0', len: 5.5, shot: 'esp' },
  { id: 'l1', len: 11, shot: 'build' },
  { id: 'l2', len: 5, shot: 'leds' },
  { id: 'l3', len: 8, shot: 'button' },
  { id: 'l4', len: 10.5, shot: 'crossing' },
  { id: 'end', len: 5, shot: 'wide' },
];
let chapter = -1, ct = 0, paused = false;
function go(k) {
  chapter = k; ct = 0; drift = 0;
  const c = CHAPTERS[k];
  shot(c.shot);
  if (o.onChapter) o.onChapter(c.id, k);
}
// what the world looks like at time t of a chapter
function play(dt) {
  const c = CHAPTERS[chapter], t = ct;
  pressed = false; waitingNote = false; walkWin = 0;
  let cap = 0;
  if (c.id === 'l0') {
    showTraffic(0); showButton(0); setLights(-1);
    setBlue(Math.floor(t * 2) % 2 === 0); // the blue LED blinks: the first program
  } else if (c.id === 'l1') {
    setBlue(false); showButton(0);
    showTraffic(Math.min(1, t / 3.5));
    if (t < 3.8) setLights(-1);
    else {
      // red 3.5 s, green 2.5 s, yellow 1.5 s (a quicker cycle than the lesson)
      const k = (t - 3.8) % 7.5;
      if (k < 3.5) { setLights(0); walkWin = 3.5 - k; } else if (k < 6) setLights(2); else setLights(1);
      if (t > 4.6 && c.shot === 'build' && camTo.p.z < 9) shot('road');
    }
  } else if (c.id === 'l2') {
    showTraffic(1); showButton(0);
    // the pattern lesson: the LEDs chase while the cars wait at red
    setLeds([[0], [1], [2], [1], [0, 1, 2], []][Math.floor(t * 4) % 6]);
    roadLit = 0; roadApi.setLamps(0); walkWin = 0;
  } else if (c.id === 'l3') {
    showTraffic(1); showButton(Math.min(1, t / 1.4));
    // hold the button from 2.5 s to 6.5 s: red while it is held, green otherwise
    pressed = t > 2.5 && t < 6.5;
    setLights(pressed ? 0 : 2); walkWin = pressed ? Infinity : 0;
    cap = pressed ? 1 : 0;
  } else if (c.id === 'l4') {
    showTraffic(1); showButton(1);
    // a quick tap at 1 s is remembered; green finishes at 3 s, yellow for 2 s, then the walkers' red
    pressed = t > 1 && t < 1.35; cap = pressed ? 1 : 0;
    if (t < 3) { setLights(2); waitingNote = t > 1; }
    else if (t < 5) { setLights(1); waitingNote = true; }
    else { setLights(0); waitingNote = t < 9.5; walkWin = 10 - t; }
  } else {
    showTraffic(1); showButton(1);
    const k = t % 7.5; if (k < 3.5) { setLights(0); walkWin = 3.5 - k; } else if (k < 6) setLights(2); else setLights(1);
  }
  btnCapDown += (cap - btnCapDown) * Math.min(1, dt * 18);
  btnCap.position.y = -0.07 * btnCapDown;
}
let btnCapDown = 0;

/* ---------- size, visibility and the frame loop ---------- */
function resize() {
  const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = camera.aspect < 1.2 ? 50 : 38; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();
let running = false, last = 0, raf = 0;
function frame(now) {
  raf = 0;
  if (!running) return;
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (!paused && !reduceMotion) {
    ct += dt;
    if (ct >= CHAPTERS[chapter].len) go((chapter + 1) % CHAPTERS.length);
  }
  play(paused ? 0 : dt);
  if (!paused) roadApi.update(dt), walkers.update(dt);
  updateCam(dt);
  // Officer Ohm bobs gently
  cop.position.y = -0.4 + Math.sin(now / 500) * 0.03;
  renderer.render(scene, camera);
  if (o.onTime) o.onTime(chapter, ct / CHAPTERS[chapter].len);
  raf = requestAnimationFrame(frame);
}
function start() { if (running) return; running = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); }
function stop() { running = false; }
go(reduceMotion ? 4 : 0);
shot(CHAPTERS[chapter].shot, true);
if (reduceMotion) { ct = 6; } // a still scene: the walkers' turn in the fair crossing
// render one frame straight away, so there is a picture before the loop starts
play(0); updateCam(0); renderer.render(scene, camera);
return {
  start, stop,
  jump: (k) => { go(k); if (reduceMotion) { ct = CHAPTERS[k].len * 0.6; play(0); updateCam(0); renderer.render(scene, camera); } },
  pause: (p) => { paused = p; },
  get paused() { return paused; },
  get chapter() { return chapter; },
  CHAPTERS, roadApi, walkers,
  tick: (dt) => { ct += dt; if (ct >= CHAPTERS[chapter].len) go((chapter + 1) % CHAPTERS.length); play(dt); roadApi.update(dt); walkers.update(dt); updateCam(dt); },
  render: () => renderer.render(scene, camera),
};
}
window.KKStory = { mount };
})();
