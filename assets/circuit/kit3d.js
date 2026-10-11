/* The circuit workbench in 3D, shared by the Circuit Labs: a table, the breadboard, the ESP32 DevKit (30 pins),
   LEDs, 330 Ω resistors, jumper wires and a USB cable, drawn exactly like lesson 1 (same sizes, holes and colours).
   It also gives the labs what they need to teach with it: labels that follow the camera, gold rings and glowing
   strips, little animations, camera moves, and tapping holes, pins and parts.

   const kit = CircuitKit.create({ host, layer, highlight: [['far', 14], ['near', 13]] });
   1 unit ≈ 1 cm. Breadboard holes are 0.25 apart: columns 1–30 along x, rows a–e (above the gap) and f–j (below).
   Rails: TN/TP (top − and +, next to the ESP32), BP/BN (bottom + and −). */
(function () {
  'use strict';

  function create(opts) {
    const THREE = window.THREE;
    const host = opts.host, layer = opts.layer;
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- geometry (the same numbers as lesson 1) ---------- */
    const P = 0.25;
    const colX = (c) => (c - 15.5) * P;
    const ROWZ = { a: -1.375, b: -1.125, c: -0.875, d: -0.625, e: -0.375, f: 0.375, g: 0.625, h: 0.875, i: 1.125, j: 1.375 };
    const FAR_ROWS = ['a', 'b', 'c', 'd', 'e'], NEAR_ROWS = ['f', 'g', 'h', 'i', 'j'];
    const RAILZ = { TN: -2.2, TP: -1.95, BP: 1.95, BN: 2.2 };
    const RAIL_COLS = [];
    for (let c = 1; c <= 30; c++) if ((c - 1) % 6 !== 0) RAIL_COLS.push(c);
    const HEADER_Z = -3.45, HEADER_TOP = -0.05, SLEEVE = 0.27;
    const NEAR_PINS = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
    const FAR_PINS = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'];
    const FAR_HEADER_Z = HEADER_Z - 0.9 * 2.54;
    const pinColX = (k) => (k - 7) * P;
    const ESP = { x0: pinColX(0) - 0.48, x1: pinColX(14) + 0.65, z0: FAR_HEADER_Z - 0.1, z1: HEADER_Z + 0.1, y: -0.2 };
    ESP.cx = (ESP.x0 + ESP.x1) / 2; ESP.cz = (ESP.z0 + ESP.z1) / 2;
    ESP.W = ESP.x1 - ESP.x0; ESP.D = ESP.z1 - ESP.z0;
    // every header pin: id 'near:D25' or 'far:3V3'; 'GND' alone means the GND next to D13
    const PINS = [];
    NEAR_PINS.forEach((name, k) => PINS.push({ id: 'near:' + name, name, side: 'near', k, x: pinColX(k), z: HEADER_Z }));
    FAR_PINS.forEach((name, k) => PINS.push({ id: 'far:' + name, name, side: 'far', k, x: pinColX(k), z: FAR_HEADER_Z }));
    const pinById = (id) => PINS.find((p) => p.id === id) || PINS.find((p) => p.name === id);

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const holeAt = (c, r, y = 0) => V(colX(c), y, ROWZ[r]);
    const railAt = (c, rail = 'BN', y = 0) => V(colX(c), y, RAILZ[rail]);
    const pinAt = (id, y = HEADER_TOP) => { const p = pinById(id); return V(p.x, y, p.z); };

    /* ---------- renderer, scene, camera ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f7fa);
    scene.fog = new THREE.Fog(0xf3f7fa, 34, 70);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(0.5, 9, 11);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.minDistance = 2.5; controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0, -1);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd8e0, 0.72));
    scene.add(new THREE.AmbientLight(0xffffff, 0.16));
    const sun = new THREE.DirectionalLight(0xffffff, 0.62);
    sun.position.set(6, 15, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
    sun.shadow.bias = -0.0006; sun.shadow.radius = 4;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfefff, 0.22);
    fill.position.set(-8, 6, -4); scene.add(fill);

    const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, o));
    function mesh(geo, m, x = 0, y = 0, z = 0, shadow = true) {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true;
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
    const pickables = [];
    function tagPart(obj, part) { obj.userData.part = part; if (!pickables.includes(obj)) pickables.push(obj); return obj; }

    /* ---------- table ---------- */
    scene.add(mesh(new THREE.BoxGeometry(30, 0.6, 20), mat(0xe6d3b5, { roughness: 0.85 }), 0, -0.7, -2, false));
    scene.add(mesh(new THREE.BoxGeometry(17, 0.02, 13.4), mat(0xcfe2e6, { roughness: 0.95 }), 0.6, -0.39, -1.6, false));

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
      for (const col of RAIL_COLS) for (const k in RAILZ) hole(colX(col), RAILZ[k]);
      g.fillStyle = '#6f7a85'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${0.115 * S}px Nunito, Arial, sans-serif`;
      for (let col = 1; col <= 30; col++) { g.fillText(String(col), U(colX(col)), Z(-1.58)); g.fillText(String(col), U(colX(col)), Z(1.58)); }
      for (const r in ROWZ) { g.fillText(r, U(colX(0)), Z(ROWZ[r])); g.fillText(r, U(colX(31)), Z(ROWZ[r])); }
      g.font = `800 ${0.2 * S}px Nunito, Arial, sans-serif`;
      const sign = (t, col, z, fillc) => { g.fillStyle = fillc; g.fillText(t, U(colX(col)), Z(z)); };
      for (const col of [0, 31]) {
        sign('−', col, RAILZ.BN, '#2f6fde'); sign('+', col, RAILZ.BP, '#d93b3b');
        sign('−', col, RAILZ.TN, '#2f6fde'); sign('+', col, RAILZ.TP, '#d93b3b');
      }
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
      return tagPart(g, 'breadboard');
    }

    /* ---------- ESP32 DevKit V1 (30-pin), pins pointing up ---------- */
    function canvasFor(w, d, S) { const c = document.createElement('canvas'); c.width = Math.round(w * S); c.height = Math.round(d * S); return [c, c.getContext('2d')]; }
    function texFrom(c) { const tex = new THREE.CanvasTexture(c); tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); return tex; }
    function esp32Texture(highlight) {
      const { cx, cz, W, D } = ESP;
      const S = 220;
      const [c, g] = canvasFor(W, D, S);
      const U = (x) => (x - cx + W / 2) * S, Z = (z) => (z - cz + D / 2) * S;
      g.fillStyle = '#4a4b4f'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#f3f7fa';
      for (const x of [ESP.x0 + 0.2, ESP.x1 - 0.2]) for (const z of [cz - 1.02, cz + 1.02]) { g.beginPath(); g.arc(U(x), Z(z), 0.12 * S, 0, Math.PI * 2); g.fill(); }
      for (const z of [HEADER_Z, FAR_HEADER_Z]) for (let k = 0; k < 15; k++) {
        const x = pinColX(k);
        g.fillStyle = '#c9ccd1'; g.strokeStyle = '#8d9096'; g.lineWidth = 3;
        if (k === 14) g.fillRect(U(x) - 0.09 * S, Z(z) - 0.09 * S, 0.18 * S, 0.18 * S);
        else { g.beginPath(); g.arc(U(x), Z(z), 0.095 * S, 0, Math.PI * 2); g.fill(); g.stroke(); }
      }
      g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
      g.font = `800 ${0.11 * S}px Nunito, Arial, sans-serif`;
      const vert = (t, x, z, align) => { g.save(); g.translate(U(x), Z(z)); g.rotate(-Math.PI / 2); g.textAlign = align; g.fillText(t, 0, 0); g.restore(); };
      NEAR_PINS.forEach((t, k) => vert(t, pinColX(k), HEADER_Z - 0.14, 'left'));
      FAR_PINS.forEach((t, k) => vert(t, pinColX(k), FAR_HEADER_Z + 0.14, 'right'));
      vert('EN', ESP.x1 - 0.42, cz + 0.4, 'center');
      vert('BOOT', ESP.x1 - 0.42, cz - 0.42, 'center');
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
      // gold boxes around the pins this lab uses
      g.strokeStyle = '#F2B705'; g.lineWidth = 6;
      for (const [side, k] of highlight || []) {
        const near = side === 'near';
        roundRect(g, U(pinColX(k) - 0.15), Z(near ? HEADER_Z - 0.62 : FAR_HEADER_Z - 0.14), 0.3 * S, 0.76 * S, 12); g.stroke();
      }
      return texFrom(c);
    }
    function moduleTexture(w, d) {
      const S = 220;
      const [c, g] = canvasFor(w, d, S);
      g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8d36a';
      for (let k = 0; k < 13; k++) { const x = (0.62 + k * 0.105) * S; g.fillRect(x, 0, 0.06 * S, 0.07 * S); g.fillRect(x, c.height - 0.07 * S, 0.06 * S, 0.07 * S); }
      for (let k = 0; k < 10; k++) g.fillRect(c.width - 0.07 * S, (0.32 + k * 0.105) * S, 0.07 * S, 0.06 * S);
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
      g.font = `800 ${0.16 * S}px Nunito, Arial, sans-serif`; g.fillText('ESP-WROOM-32', 0, -0.36 * S);
      g.font = `800 ${0.34 * S}px Nunito, Arial, sans-serif`; g.fillText('C  E', -0.12 * S, 0.02 * S);
      g.font = `700 ${0.09 * S}px Nunito, Arial, sans-serif`; g.fillText('FCC ID: 2AC7Z-ESPWROOM32', 0, 0.4 * S);
      g.restore();
      g.fillStyle = '#111'; g.beginPath(); g.arc(c.width - 0.14 * S, c.height - 0.14 * S, 0.05 * S, 0, Math.PI * 2); g.fill();
      return texFrom(c);
    }
    function chipTexture(w, d, lines) {
      const S = 260;
      const [c, g] = canvasFor(w, d, S);
      g.fillStyle = '#26272a'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#8f9196'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `600 ${0.075 * S}px 'JetBrains Mono', monospace`;
      lines.forEach((t, i) => g.fillText(t, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 0.09 * S));
      return texFrom(c);
    }
    function topBox(w, h, d, sideMat, tex, x, y, z, tint = 0xffffff) {
      const m = [sideMat, sideMat, new THREE.MeshStandardMaterial({ map: tex, color: tint, roughness: 0.5 }), sideMat, sideMat, sideMat];
      return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    }
    function makeESP32(highlight) {
      const g = new THREE.Group();
      const { cx, cz, W, D, y } = ESP;
      const top = y + 0.03;
      g.add(topBox(W, 0.06, D, mat(0x46474b, { roughness: 0.6 }), esp32Texture(highlight), cx, y, cz));
      const dark = mat(0x1d1e21, { roughness: 0.5 });
      const silver = mat(0xd3d6da, { metalness: 0.45, roughness: 0.3 });
      for (const x of [ESP.x0 + 0.2, ESP.x1 - 0.2]) for (const z of [cz - 1.02, cz + 1.02]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, y + 0.4 - 0.03, 12), dark, x, (-0.4 + y - 0.03) / 2, z));
      const pinGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
      const pinMat = mat(0xd9b44a, { metalness: 0.4, roughness: 0.35 });
      for (const z of [HEADER_Z, FAR_HEADER_Z]) {
        g.add(mesh(new THREE.BoxGeometry(15 * P, 0.08, 0.22), dark, 0, top + 0.04, z));
        for (let k = 0; k < 15; k++) g.add(mesh(pinGeo, pinMat, pinColX(k), top + 0.2, z, false));
      }
      const mx0 = ESP.x0 + 0.04, mx1 = pinColX(7) + 0.05, mw = mx1 - mx0, md = 1.44;
      g.add(topBox(mw, 0.06, md, dark, moduleTexture(mw, md), (mx0 + mx1) / 2, top + 0.03, cz));
      const sw = 1.52, sd = 1.32, sx = mx1 - 0.06 - sw / 2;
      g.add(topBox(sw, 0.1, sd, silver, shieldTexture(sw, sd), sx, top + 0.11, cz, 0x9a9da2));
      // red power LED: lit only while the USB cable is plugged in
      const pwrMat = mat(0x7a2a2a, { emissive: 0xff2020, emissiveIntensity: 0 });
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.09), pwrMat, 0.42, top + 0.025, cz + 0.45, false));
      const pwrGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff3030, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      pwrGlow.scale.set(0.7, 0.7, 1); pwrGlow.position.set(0.42, top + 0.1, cz + 0.45); g.add(pwrGlow);
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.09), mat(0x2aa7e0, { roughness: 0.4 }), 0.42, top + 0.025, cz - 0.45, false));
      g.add(topBox(0.57, 0.12, 0.28, dark, chipTexture(0.57, 0.28, ['AMS1117', '3.3']), 1.3, top + 0.06, cz + 0.48));
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.03, 0.3), silver, 1.3, top + 0.015, cz + 0.72, false));
      g.add(topBox(0.44, 0.08, 0.44, dark, chipTexture(0.44, 0.44, ['CP2102', 'DCL0CH']), 1.34, top + 0.04, cz - 0.56));
      for (const z of [cz + 0.71, cz - 0.71]) {
        g.add(mesh(new THREE.BoxGeometry(0.43, 0.12, 0.25), silver, ESP.x1 - 0.25, top + 0.06, z));
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 16), dark, ESP.x1 - 0.25, top + 0.15, z));
      }
      g.add(tagPart(mesh(new THREE.BoxGeometry(0.5, 0.2, 0.68), silver, ESP.x1 - 0.17, top + 0.1, cz), 'usb'));
      tagPart(g, 'controller');
      g.userData.setPower = (on) => { pwrMat.emissiveIntensity = on ? 1.1 : 0; pwrMat.color.set(on ? 0xff2a2a : 0x7a2a2a); pwrGlow.material.opacity = on ? 0.8 : 0; };
      return g;
    }

    /* ---------- USB cable: plugged into the board's USB port, or pulled out ---------- */
    function makeUSB() {
      const g = new THREE.Group();
      const top = ESP.y + 0.03, y = top + 0.1, x = ESP.x1 + 0.25, z = ESP.cz;
      const black = mat(0x22252a, { roughness: 0.55 });
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.26, 0.46), black, x + 0.22, y, z));
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.36), metal, x - 0.1, y, z));
      const curve = new THREE.CatmullRomCurve3([V(x + 0.48, y, z), V(x + 1.3, y, z), V(x + 2.1, -0.3, z - 0.7), V(x + 2.9, -0.36, z - 2.6), V(x + 3.6, -0.36, z - 5.5)]);
      g.add(mesh(new THREE.TubeGeometry(curve, 60, 0.07, 10, false), black));
      g.userData.setPlugged = (on) => { g.position.set(on ? 0 : 1.15, on ? 0 : 0.12, on ? 0 : 0.25); };
      return tagPart(g, 'usb');
    }

    /* ---------- LED (legs along x: anode at x = 0, cathode at x = spread; the flat edge is on the cathode side) ---------- */
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
    // LED colours: OFF is dark tinted plastic and ON is the pure colour with a coloured halo, so nobody can mix them up
    function ledColours(hex) {
      const hsl = {}; new THREE.Color(hex).getHSL(hsl);
      const c = (s, l) => new THREE.Color().setHSL(hsl.h, s, l);
      return { base: c(1, 0.32), hot: c(1, 0.5), halo: c(1, 0.55), dim: c(hsl.s * 0.55, 0.13) };
    }
    function makeLED(hex, scale = 1, legs = [0.5, 0.5], spread = P) {
      const g = new THREE.Group();
      const s = scale;
      const leg = mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });
      const legTop = 0.45 * s;
      g.add(rod(V(0, legTop - legs[0] * s, 0), V(0, legTop, 0), 0.018 * s, leg));
      g.add(rod(V(spread, legTop - legs[1] * s, 0), V(spread, legTop, 0), 0.018 * s, leg));
      const body = mat(hex, { transparent: true, opacity: 0.93, roughness: 0.25, emissive: hex, emissiveIntensity: 0 });
      const cx = spread / 2;
      g.add(mesh(flangeGeometry(0.29 * s, 0.06 * s), body, cx, legTop, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.25 * s, 0.25 * s, 0.32 * s, 28), body, cx, legTop + 0.22 * s, 0));
      g.add(mesh(new THREE.SphereGeometry(0.25 * s, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), body, cx, legTop + 0.38 * s, 0));
      const light = new THREE.PointLight(hex, 0, 4.5 * s, 2);
      light.position.set(cx, legTop + 0.4 * s, 0); g.add(light);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: hex, transparent: true, opacity: 0, depthWrite: false }));
      glow.scale.set(1.7 * s, 1.7 * s, 1); glow.position.set(cx, legTop + 0.35 * s, 0); g.add(glow);
      const L = Object.assign({ body, light, glow, scale: s }, ledColours(hex));
      glow.material.color.copy(L.halo); body.emissive.copy(L.hot);
      g.userData.led = L;
      // level: 0 off, 1 on, >1 too bright (the pretend "no resistor" demo)
      g.userData.setLit = (level) => {
        const on = level > 0;
        L.body.color.copy(on ? L.base : L.dim);
        L.body.emissiveIntensity = on ? 0.9 * Math.min(level, 1.6) : 0;
        L.body.opacity = on ? 0.97 : 0.93;
        L.light.intensity = on ? 2.4 * level : 0;
        L.glow.material.opacity = on ? 0.7 : 0;
        L.glow.scale.setScalar(1.7 * s * (level > 1 ? 1.9 : 1));
      };
      g.userData.setLit(0);
      return g;
    }

    /* ---------- resistor (330 Ω: orange, orange, brown, gold), standing on two holes in one column ---------- */
    function makeResistor(zA = ROWZ.d, zB = ROWZ.g) {
      const g = new THREE.Group();
      const lead = mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });
      const yb = 0.3, half = 0.27, zc = (zA + zB) / 2;
      g.add(rod(V(0, -0.05, zA), V(0, yb, zA), 0.016, lead));
      g.add(rod(V(0, -0.05, zB), V(0, yb, zB), 0.016, lead));
      g.add(rod(V(0, yb, Math.min(zA, zB)), V(0, yb, zc - half), 0.016, lead));
      g.add(rod(V(0, yb, zc + half), V(0, yb, Math.max(zA, zB)), 0.016, lead));
      const bodyMat = mat(0xd8c08e, { roughness: 0.5 });
      const body = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 20), bodyMat, 0, yb, zc);
      body.rotation.x = Math.PI / 2; g.add(body);
      for (const z of [-0.2, 0.2]) g.add(mesh(new THREE.SphereGeometry(0.1, 16, 12), bodyMat, 0, yb, zc + z));
      const bands = [[-0.17, 0xf08a24], [-0.08, 0xf08a24], [0.01, 0x7a4a22], [0.17, 0xc9a227]];
      for (const [z, col] of bands) {
        const b = mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.045, 20), mat(col, { roughness: 0.4, metalness: col === 0xc9a227 ? 0.6 : 0 }), 0, yb, zc + z);
        b.rotation.x = Math.PI / 2; g.add(b);
      }
      g.userData.bodyMat = bodyMat;
      return g;
    }

    /* ---------- jumper wire through a list of points (ends at the top of the black sleeves) ---------- */
    const SEGS = 120, RADIAL = 10;
    function makeWire(points, color) {
      const g = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const geo = new THREE.TubeGeometry(curve, SEGS, 0.045, RADIAL, false);
      g.add(mesh(geo, mat(color, { roughness: 0.45 })));
      const sleeveMat = mat(0x24272c, { roughness: 0.5 });
      const ends = [];
      for (const p of [points[0], points[points.length - 1]]) {
        const e = new THREE.Group();
        e.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, SLEEVE, 12), sleeveMat, p.x, p.y - SLEEVE / 2, p.z));
        e.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), metal, p.x, p.y - SLEEVE - 0.05, p.z));
        g.add(e); ends.push(e);
      }
      const w = { group: g, curve, geo, ends, progress: 1 };
      w.set = (f) => { w.progress = f; geo.setDrawRange(0, Math.floor(f * SEGS) * RADIAL * 6); ends[0].visible = f > 0; ends[1].visible = f >= 1; };
      g.userData.wire = w;
      return w;
    }
    // a natural arc between two wire ends (both already at sleeve height)
    function wirePoints(A, B, extra = 0) {
      const d = A.distanceTo(B);
      const h = Math.min(1.7, Math.max(0.28, d * 0.22)) + extra;
      const top = Math.max(A.y, B.y);
      return [A, V(A.x, A.y + 0.22 + h * 0.4, A.z), V((A.x + B.x) / 2, top + h, (A.z + B.z) / 2), V(B.x, B.y + 0.22 + h * 0.4, B.z), B];
    }

    /* ---------- labels that stay readable while the camera moves ---------- */
    const labels = [];
    let showLabels = true;
    function addLabel(html, posFn, o = {}) {
      const el = document.createElement('div');
      el.className = 'lbl ' + (o.cls || '');
      if (o.lift != null) el.style.setProperty('--lift', o.lift + 'px');
      el.innerHTML = '<span>' + html + '</span>';
      layer.appendChild(el);
      const L = { el, pos: typeof posFn === 'function' ? posFn : () => posFn, obj: o.obj || null, kind: o.kind || 'part', update: o.update || null, show: o.show || null };
      labels.push(L);
      return L;
    }
    function removeLabel(L) { const i = labels.indexOf(L); if (i >= 0) labels.splice(i, 1); L.el.remove(); }
    function visibleInScene(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
    const tmpV = new THREE.Vector3();
    function updateLabels() {
      const w = layer.clientWidth, h = layer.clientHeight;
      for (const L of labels) {
        let show = L.kind === 'callout' || (showLabels && (!L.obj || visibleInScene(L.obj)) && (!L.show || L.show()));
        if (show) { tmpV.copy(L.pos()).project(camera); if (tmpV.z > 1 || tmpV.z < -1) show = false; }
        if (!show) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; continue; }
        if (L.el.style.display === 'none') L.el.style.display = '';
        if (L.update) L.update(L);
        L.el.style.transform = `translate(${((tmpV.x + 1) / 2 * w).toFixed(1)}px, ${((1 - tmpV.y) / 2 * h).toFixed(1)}px)`;
      }
    }

    /* ---------- temporary helpers: gold rings, glowing strips, callouts ---------- */
    let temps = [], callouts = [];
    const basicT = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    function ring(pos, color = 0xf2b705, r = 0.17) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 10, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(pos); m.position.y += 0.02;
      m.renderOrder = 6; m.userData.pulse = true;
      scene.add(m); temps.push(m);
      return m;
    }
    function strip(points, color) {
      const g = new THREE.Group();
      const a = points[0], b = points[points.length - 1];
      const alongZ = Math.abs(b.z - a.z) > Math.abs(b.x - a.x);
      const len = a.distanceTo(b) + 0.22;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.19 : len, 0.01, alongZ ? len : 0.19), basicT(color, 0.42));
      bar.position.set((a.x + b.x) / 2, 0.009, (a.z + b.z) / 2);
      g.add(bar);
      for (const p of points) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.014, 0.135), basicT(color, 0.95)); s.position.set(p.x, 0.013, p.z); g.add(s); }
      scene.add(g); temps.push(g);
      return g;
    }
    function callout(text, pos, cls = '', lift = 26) { const L = addLabel(text, pos, { kind: 'callout', cls: 'callout ' + cls, lift }); callouts.push(L); return L; }
    function dispose(o) {
      o.traverse((x) => {
        if (x.geometry) x.geometry.dispose();
        if (x.material && x.material.dispose) x.material.dispose();
        const i = pickables.indexOf(x); if (i >= 0) pickables.splice(i, 1);
      });
    }
    function clearTemps() { temps.forEach((o) => { scene.remove(o); dispose(o); }); temps = []; callouts.forEach(removeLabel); callouts = []; }
    // the holes of one strip, or of a rail
    const stripHoles = (c, half) => (half === 'far' ? FAR_ROWS : NEAR_ROWS).map((r) => holeAt(c, r));
    const railHoles = (rail) => RAIL_COLS.map((c) => railAt(c, rail));

    /* ---------- animations (cancelled when the lab moves to another step) ---------- */
    let token = 0, tweens = [];
    const easeInOut = (f) => (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
    const easeOut = (f) => 1 - Math.pow(1 - f, 3);
    const speed = reduceMotion ? 0.35 : 1;
    function tween(dur, fn, ease = easeInOut) { const t = token; return new Promise((res) => tweens.push({ e: 0, dur: Math.max(0.001, dur * speed), fn, ease, t, res })); }
    const wait = (dur) => { const t = token; return new Promise((res) => tweens.push({ e: 0, dur: Math.max(0.001, dur), fn: () => {}, ease: (f) => f, t, res })); };
    function cancelAnimations() { token++; tweens = []; }
    const isCurrent = (t) => t === token;
    function updateTweens(dt) {
      const keep = [];
      for (const tw of tweens) {
        if (tw.t !== token) continue;
        tw.e += dt;
        const f = Math.min(1, tw.e / tw.dur);
        tw.fn(tw.ease(f));
        if (f >= 1) tw.res(); else keep.push(tw);
      }
      tweens = keep;
    }
    async function dropIn(o) { o.visible = true; const y0 = o.position.y; await tween(0.7, (f) => { o.position.y = y0 + (1 - f) * 1.6; }, easeOut); }
    async function drawWire(w, dur = 1.1) { w.group.visible = true; w.set(0); await tween(dur, (f) => w.set(f)); }

    /* ---------- camera moves ---------- */
    let camTw = null;
    function flyTo(c, instant) {
      const to = { p: V(...c.p), t: V(...c.t) };
      if (camera.aspect < 1.25) to.p.sub(to.t).multiplyScalar(1 + (1.25 - camera.aspect) * 0.45).add(to.t);
      if (instant || reduceMotion) { camera.position.copy(to.p); controls.target.copy(to.t); camTw = null; return; }
      camTw = { e: 0, dur: 1.2, fp: camera.position.clone(), ft: controls.target.clone(), to };
    }
    function updateCam(dt) {
      if (!camTw) return;
      camTw.e += dt;
      const f = easeInOut(Math.min(1, camTw.e / camTw.dur));
      camera.position.lerpVectors(camTw.fp, camTw.to.p, f);
      controls.target.lerpVectors(camTw.ft, camTw.to.t, f);
      if (f >= 1) camTw = null;
    }
    controls.addEventListener('start', () => { camTw = null; });

    /* ---------- tapping: holes, rail holes, header pins, custom points, and parts ----------
       A tap (not a drag) calls onTap({ point, part }). point is the nearest enabled target on screen within reach:
       { kind: 'hole', c, r } | { kind: 'rail', rail, c } | { kind: 'pin', id, name } | { kind: 'custom', id }.
       part is the first tagged object under the finger ('led', 'resistor', 'usb', …), with its object. */
    const allTargets = [];
    for (let c = 1; c <= 30; c++) for (const r in ROWZ) allTargets.push({ kind: 'hole', c, r, half: FAR_ROWS.includes(r) ? 'far' : 'near', pos: holeAt(c, r, 0.01) });
    for (const rail in RAILZ) for (const c of RAIL_COLS) allTargets.push({ kind: 'rail', rail, c, pos: railAt(c, rail, 0.01) });
    PINS.forEach((p) => allTargets.push({ kind: 'pin', id: p.id, name: p.name, side: p.side, pos: V(p.x, 0.12, p.z) }));
    const customs = [];
    const api = { kinds: new Set(), skipParts: new Set(['breadboard']), onTap: null, onHover: null };
    function addPoint(id, posFn) { const t = { kind: 'custom', id, posFn }; customs.push(t); return t; }
    function clearPoints() { customs.length = 0; }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function screenXY(v) { tmpV.copy(v).project(camera); const r = renderer.domElement.getBoundingClientRect(); return [(tmpV.x + 1) / 2 * r.width, (1 - tmpV.y) / 2 * r.height, tmpV.z]; }
    function nearestPoint(x, y, reach) {
      let best = null, bd = reach;
      const consider = (t, pos) => {
        const [sx, sy, sz] = screenXY(pos);
        if (sz > 1) return;
        const d = Math.hypot(sx - x, sy - y);
        if (d < bd) { bd = d; best = t; }
      };
      for (const t of allTargets) if (api.kinds.has(t.kind)) consider(t, t.pos);
      if (api.kinds.has('custom')) for (const t of customs) consider(t, t.posFn());
      return best;
    }
    function partAt(x, y) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const inScene = (o) => { while (o.parent) o = o.parent; return o === scene; };
      const hits = ray.intersectObjects(pickables.filter((o) => visibleInScene(o) && inScene(o)), true);
      for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.part) o = o.parent;
        if (o && !api.skipParts.has(o.userData.part)) return { part: o.userData.part, obj: o };
      }
      return null;
    }
    const el = renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp, type: e.pointerType }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = e.timeStamp - down.t;
      const type = down.type; down = null;
      if (moved > 8 || dt > 700 || !api.onTap) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      api.onTap({ point: nearestPoint(x, y, type === 'mouse' ? 18 : 30), part: partAt(x, y), x, y });
    });
    // mouse hover: a ring shows which hole or pin a click would pick
    const hoverRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 30), new THREE.MeshBasicMaterial({ color: 0x0a7480, transparent: true, opacity: 0.85, depthTest: false }));
    hoverRing.rotation.x = -Math.PI / 2; hoverRing.renderOrder = 7; hoverRing.visible = false; scene.add(hoverRing);
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || down) { hoverRing.visible = false; return; }
      const r = el.getBoundingClientRect();
      const t = nearestPoint(e.clientX - r.left, e.clientY - r.top, 18);
      hoverRing.visible = !!t && t.kind !== 'custom';
      if (t && t.kind !== 'custom') { hoverRing.position.copy(t.pos); hoverRing.position.y += 0.02; }
      el.style.cursor = t ? 'pointer' : 'grab';
      if (api.onHover) api.onHover(t);
    });
    el.addEventListener('pointerleave', () => { hoverRing.visible = false; });

    /* ---------- the loop ---------- */
    const frameFns = [];
    function resize() {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 1 ? 52 : 40;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(host);
    resize();
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      updateTweens(dt); updateCam(dt);
      const tt = now / 1000;
      for (const o of temps) if (o.userData.pulse) o.scale.setScalar(1 + 0.22 * Math.sin(tt * 6));
      for (const fn of frameFns) fn(dt, tt);
      controls.update();
      renderer.render(scene, camera);
      updateLabels();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return Object.assign(api, {
      THREE, scene, camera, controls, renderer, reduceMotion, V,
      P, colX, ROWZ, FAR_ROWS, NEAR_ROWS, RAILZ, RAIL_COLS, HEADER_Z, FAR_HEADER_Z, HEADER_TOP, SLEEVE, ESP, PINS, pinById,
      holeAt, railAt, pinAt, stripHoles, railHoles,
      mat, mesh, rod, tagPart, getGlowTexture,
      makeBreadboard, makeESP32, makeUSB, makeLED, makeResistor, makeWire, wirePoints,
      addLabel, removeLabel, ring, strip, callout, clearTemps, dispose,
      tween, wait, dropIn, drawWire, cancelAnimations, isCurrent, easeOut,
      flyTo, addPoint, clearPoints, onFrame: (fn) => frameFns.push(fn),
    }) && Object.defineProperties(api, {
      token: { get: () => token },
      labelsOn: { get: () => showLabels, set: (v) => { showLabels = v; } },
    });
  }

  window.CircuitKit = { create };
})();
