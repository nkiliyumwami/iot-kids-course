/* 3D loops for the "Real problems your child can solve" cards on the landing page.
   Real-size rooms (1 unit = 1 metre) with real 3D models: a potted plant, a velvet sofa, a lamp, an armchair,
   flowers, a sports car and a walking figure (see assets/projects/CREDITS.md), lit by a studio environment with soft
   shadows. One WebGL renderer draws every scene and copies the picture into each card's own canvas, so six cards cost
   about as much as one. A scene is built (and its models downloaded) only when its card comes near the screen, and
   only cards on screen are drawn, at about 30 frames a second. Needs three.js r128 loaded first.

   Usage: await KKProjects.mount(document.querySelectorAll('canvas[data-proj]'), { reduceMotion, base: 'assets/projects/' })
   Each canvas gets the class "on" once its scene is ready. */
(function () {
  'use strict';
  const LIB = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
  function script(src) {
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }

  async function mount(canvases, opts) {
    opts = opts || {};
    const THREE = window.THREE, BASE = opts.base || 'assets/projects/';
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    try {
      if (!THREE.GLTFLoader) await script(LIB + 'loaders/GLTFLoader.js');
      if (!THREE.DRACOLoader) await script(LIB + 'loaders/DRACOLoader.js');
      if (!THREE.RoomEnvironment) await script(LIB + 'environments/RoomEnvironment.js');
    } catch (e) { return null; }
    renderer.setPixelRatio(1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    /* ---------- loading models and textures ---------- */
    const gltf = new THREE.GLTFLoader();
    const draco = new THREE.DRACOLoader(); draco.setDecoderPath(LIB + 'libs/draco/gltf/'); gltf.setDRACOLoader(draco);
    const modelP = {};
    // a fresh copy of a model each time (the walking figure is only used once, so its skeleton is never cloned)
    function model(name) {
      if (!modelP[name]) modelP[name] = gltf.loadAsync(BASE + 'models/' + name + '.glb');
      return modelP[name].then((g) => {
        const root = g.used ? g.scene.clone(true) : g.scene; g.used = true;
        root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return { root, animations: g.animations };
      });
    }
    const texLoader = new THREE.TextureLoader(), texCache = {};
    function tex(name, rep, srgb = true) {
      const t = (texCache[name + rep] = texCache[name + rep] || texLoader.load(BASE + 'textures/' + name));
      t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
      if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, maxAniso);
      return t;
    }

    /* ---------- helpers ---------- */
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const mat = (hex, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: C(hex), roughness: 0.55, metalness: 0 }, p));
    const phys = (hex, p = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(hex), roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 }, p));
    const glow = (hex, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: C(hex), emissive: C(hex), emissiveIntensity: 0, roughness: 0.25 }, p));
    function add(parent, geo, m, x = 0, y = 0, z = 0, shadow = true) {
      const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.castShadow = shadow; k.receiveShadow = true; parent.add(k); return k;
    }
    function rshape(w, h, r) {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
    }
    const geoCache = {};
    // a box with rounded edges (w × h × d), centred
    function rboxGeo(w, h, d, r) {
      const key = [w, h, d, r].join(',');
      if (geoCache[key]) return geoCache[key];
      r = Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005);
      const g = new THREE.ExtrudeGeometry(rshape(w - 2 * r, h - 2 * r, Math.min(r, (w - 2 * r) / 2, (h - 2 * r) / 2) * 0.999 || 0.0001), { depth: Math.max(0.0001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 6 });
      g.translate(0, 0, -(d - 2 * r) / 2);
      return (geoCache[key] = g);
    }
    const rbox = (p, w, h, d, r, m, x, y, z, shadow) => add(p, rboxGeo(w, h, d, r), m, x, y, z, shadow);
    const box = (p, w, h, d, m, x, y, z, shadow) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, shadow);
    const cyl = (p, rt, rb, h, m, x, y, z, seg = 24, shadow) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, shadow);
    const sph = (p, r, m, x, y, z, shadow) => add(p, new THREE.SphereGeometry(r, 24, 16), m, x, y, z, shadow);
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const ease = (x) => { x = clamp01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
    const lerp = (a, b, f) => a + (b - a) * f;
    function canvasTex(w, h, draw, repeat) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, maxAniso);
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
      t.redraw = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; }; t.redraw(); return t;
    }
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    function place(o, x, y, z, ry = 0, s = 1) { o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); return o; }
    // how strongly every material in a scene picks up the studio light (0 = none); used for dusk and lamp-off moods
    function envScale(s, k) {
      s.traverse((o) => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.userData.env0 == null) m.userData.env0 = m.envMapIntensity == null ? 1 : m.envMapIntensity; m.envMapIntensity = m.userData.env0 * k; }); });
    }
    function sizeOf(o) { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); }

    /* ---------- shared surfaces ---------- */
    const woodFloor = (rep) => mat(0xffffff, { map: tex('wood.jpg', rep), roughnessMap: tex('wood_rough.jpg', rep, false), roughness: 0.9 });
    const woodTop = (hex = 0xffffff) => mat(hex, { map: tex('wood.jpg', [0.6, 0.6]), roughnessMap: tex('wood_rough.jpg', [0.6, 0.6], false), roughness: 0.75 });
    const tiles = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#8e9aa3'; g.fillRect(0, 0, w, h); // grout
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const v = 232 + rnd() * 10; g.fillStyle = `rgb(${v},${v + 1},${v + 2})`; g.fillRect(i * 256 + 3, j * 256 + 3, 250, 250);
        for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(150,160,170,${rnd() * 0.05})`; g.fillRect(i * 256 + rnd() * 250, j * 256 + rnd() * 250, 4, 4); }
      }
    }, [6, 6]);
    const concrete = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#a3a7aa'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 140 + rnd() * 50; g.fillStyle = `rgba(${v},${v + 2},${v + 4},.3)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      for (let i = 0; i < 14; i++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 60, gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(70,72,74,.10)'); gr.addColorStop(1, 'rgba(70,72,74,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
      g.strokeStyle = 'rgba(90,92,95,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); // saw cuts
    }, [3, 3]);
    const rugTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#d9cfbf'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 20000; i++) { const v = rnd() * 30; g.fillStyle = `rgba(${120 + v},${105 + v},${85 + v},.12)`; g.fillRect(rnd() * w, rnd() * h, 2, 1); }
      g.strokeStyle = '#8c7a62'; g.lineWidth = 10; g.strokeRect(26, 26, w - 52, h - 52); g.lineWidth = 3; g.strokeRect(46, 46, w - 92, h - 92);
    });
    const softDot = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const skyTex = (top, bottom, ground) => canvasTex(256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.7, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      if (ground) { g.fillStyle = ground; g.beginPath(); g.moveTo(0, h * 0.78); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.72 + 0.05 * Math.sin(x * 0.05) + 0.03 * Math.sin(x * 0.13))); g.lineTo(w, h); g.lineTo(0, h); g.fill(); }
    });

    /* ---------- the studio light every scene reflects ---------- */
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose();

    // a real-size room: floor, back wall (z = -back) and left wall (x = -left), skirting boards, and a key light
    // with soft shadows. A window can be cut into the back wall: it shows a sky picture and lets daylight in.
    function room(o = {}) {
      const s = new THREE.Scene();
      s.background = C(o.bg || 0xeef1f3); s.environment = env;
      const W = o.w || 6, D = o.d || 5, H = o.h || 2.7, back = o.back || 1.4, left = o.left || 2.2;
      const hemi = new THREE.HemisphereLight(0xffffff, 0x9a8f80, o.hemi == null ? 0.35 : o.hemi); s.add(hemi);
      const key = new THREE.DirectionalLight(0xfff1e0, o.key == null ? 1.5 : o.key);
      key.position.set(...(o.keyPos || [2.5, 4.2, 3.2])); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048); const sc = o.shadowBox || 3.2;
      Object.assign(key.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 0.5, far: 20 });
      key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = 4; s.add(key); s.add(key.target);
      add(s, new THREE.BoxGeometry(W, 0.04, D), o.floor || woodFloor([3, 3]), 0, -0.02, D / 2 - back, false);
      const wallM = o.wallM || mat(o.wall || 0xe6e3de, { roughness: 0.92 });
      if (o.window) {
        // the back wall in four pieces around the window opening
        const [wx, wy, ww, wh] = o.window, x0 = -W / 2, x1 = W / 2;
        const bx = (a, b2, y0, y1) => { if (b2 - a > 0.001 && y1 - y0 > 0.001) add(s, new THREE.BoxGeometry(b2 - a, y1 - y0, 0.1), wallM, (a + b2) / 2, (y0 + y1) / 2, -back - 0.05, false); };
        bx(x0, wx - ww / 2, 0, H); bx(wx + ww / 2, x1, 0, H); bx(wx - ww / 2, wx + ww / 2, 0, wy - wh / 2); bx(wx - ww / 2, wx + ww / 2, wy + wh / 2, H);
        add(s, new THREE.PlaneGeometry(ww * 1.6, wh * 1.6), new THREE.MeshBasicMaterial({ map: o.sky || skyTex('#8cc4ec', '#e4f2fb', '#88b874'), toneMapped: false }), wx, wy, -back - 0.6, false);
        const fr = mat(0xfafafa, { roughness: 0.35 });
        rbox(s, ww + 0.1, 0.06, 0.16, 0.01, fr, wx, wy - wh / 2 - 0.03, -back + 0.02); rbox(s, ww + 0.1, 0.05, 0.12, 0.01, fr, wx, wy + wh / 2 + 0.025, -back);
        rbox(s, 0.05, wh, 0.12, 0.01, fr, wx - ww / 2 - 0.025, wy, -back); rbox(s, 0.05, wh, 0.12, 0.01, fr, wx + ww / 2 + 0.025, wy, -back);
        rbox(s, 0.035, wh, 0.06, 0.005, fr, wx, wy, -back - 0.02);
      } else if (!o.noBack) add(s, new THREE.BoxGeometry(W, H, 0.1), wallM, 0, H / 2, -back - 0.05, false);
      add(s, new THREE.BoxGeometry(0.1, H, D), o.sideM || wallM, -left - 0.05, H / 2, D / 2 - back, false);
      const skirt = mat(0xf8f8f6, { roughness: 0.45 });
      add(s, new THREE.BoxGeometry(W, 0.08, 0.015), skirt, 0, 0.04, -back + 0.0075, false);
      add(s, new THREE.BoxGeometry(0.015, 0.08, D), skirt, -left + 0.0075, 0.04, D / 2 - back, false);
      return { s, hemi, key };
    }
    function camera(pos, look, fov = 38) { const c = new THREE.PerspectiveCamera(fov, 1.6, 0.05, 40); c.position.set(...pos); c.lookAt(...look); return c; }

    // the "brain": an ESP32 DevKit (52 × 28 mm) with header pins, the metal module and a status light.
    // Shown at the given scale so it reads in a room.
    function esp32(parent, x, y, z, s = 1) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s * 0.104); parent.add(g); // 0.5 units → 52 mm
      rbox(g, 0.5, 0.025, 0.26, 0.01, mat(0x1d2a2b, { roughness: 0.45 }), 0, 0.0125, 0);
      rbox(g, 0.19, 0.03, 0.17, 0.006, mat(0xc4c9ce, { metalness: 0.9, roughness: 0.28 }), -0.1, 0.04, 0);
      rbox(g, 0.06, 0.022, 0.17, 0.004, mat(0x14181a), -0.22, 0.035, 0);
      const pin = mat(0xd9b44a, { metalness: 0.85, roughness: 0.3 }), hdr = mat(0x121416);
      for (const zz of [-0.115, 0.115]) {
        box(g, 0.46, 0.03, 0.025, hdr, 0, 0.04, zz);
        for (let i = 0; i < 15; i++) box(g, 0.008, 0.05, 0.008, pin, -0.21 + i * 0.03, 0.07, zz);
      }
      rbox(g, 0.05, 0.025, 0.07, 0.006, mat(0xc9ced4, { metalness: 0.9, roughness: 0.25 }), 0.24, 0.035, 0);
      const led = glow(0x2a9dff); sph(g, 0.014, led, 0.13, 0.035, 0.05, false);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0x2a9dff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      halo.position.set(0.13, 0.05, 0.05); halo.scale.setScalar(0.18); g.add(halo);
      return { g, led, halo };
    }
    function setLed(b, hex, on) {
      b.led.color.copy(C(hex)); b.led.emissive.copy(C(hex)); b.led.emissiveIntensity = on ? 4 : 0.1;
      b.halo.material.color.setHex(hex); b.halo.material.opacity = on ? 0.9 : 0;
    }
    // a little wall-mounted traffic light (three LEDs in a dark case) for showing a sensor's decision
    function signal(parent, x, y, z, s = 1, horizontal = false) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
      rbox(g, horizontal ? 0.34 : 0.13, horizontal ? 0.13 : 0.34, 0.06, 0.025, mat(0x22272d, { roughness: 0.4 }), 0, 0, 0.03);
      const lamps = [0xff3b30, 0xffb400, 0x34c759].map((c, i) => {
        const m = glow(c); const d = horizontal ? [-0.105 + i * 0.105, 0] : [0, 0.105 - i * 0.105];
        sph(g, 0.038, m, d[0], d[1], 0.06, false);
        const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); h.position.set(d[0], d[1], 0.09); h.scale.setScalar(0.22); g.add(h);
        return { m, h };
      });
      return { g, set(k) { lamps.forEach((l, i) => { l.m.emissiveIntensity = i === k ? 3.5 : 0.04; l.h.material.opacity = i === k ? 0.8 : 0; }); } };
    }

    // a smartphone with a real-looking lock screen and alert card
    function phone(parent, x, y, z, ry, rx, s = 0.25) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx || 0, ry || 0, 0); g.scale.setScalar(s); parent.add(g);
      rbox(g, 0.3, 0.6, 0.03, 0.045, phys(0x1c1f24, { roughness: 0.25, metalness: 0.4 }), 0, 0.3, 0);
      let alert = null;
      const t = canvasTex(240, 480, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#22344a'); gr.addColorStop(1, '#0d1a26'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,.92)'; c.font = '600 54px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('12:00', w / 2, 120);
        c.font = '600 18px Nunito, sans-serif'; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText('Saturday', w / 2, 150);
        if (alert) {
          c.fillStyle = 'rgba(255,255,255,.96)'; const x0 = 14, y0 = 190, ww = w - 28, hh = 104;
          c.beginPath(); if (c.roundRect) c.roundRect(x0, y0, ww, hh, 20); else c.rect(x0, y0, ww, hh); c.fill();
          c.fillStyle = alert[2] || '#c93131'; c.beginPath(); if (c.roundRect) c.roundRect(x0 + 12, y0 + 14, 30, 30, 8); else c.rect(x0 + 12, y0 + 14, 30, 30); c.fill();
          c.textAlign = 'left'; c.fillStyle = '#526170'; c.font = '700 15px Nunito, sans-serif'; c.fillText('HOME · now', x0 + 52, y0 + 34);
          c.fillStyle = '#15202a'; c.font = '800 21px Nunito, sans-serif'; c.fillText(alert[0], x0 + 14, y0 + 70);
          c.fillStyle = '#334452'; c.font = '600 16px Nunito, sans-serif'; c.fillText(alert[1], x0 + 14, y0 + 92);
        }
      });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.56), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.set(0, 0.3, 0.0155); g.add(scr);
      return { g, show(a) { const k = a ? a.join('|') : ''; if (k !== g.userData.k) { g.userData.k = k; alert = a; t.redraw(); } } };
    }
    // a thin cable that follows a path
    const cable = (s, pts, hex = 0x1b1d20, r = 0.0035) => add(s, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), 60, r, 8, false), mat(hex, { roughness: 0.6 }));

    /* ---------- 1. self-watering plant ---------- */
    function plant() {
      const R = room({ bg: 0xf1eee9, wall: 0xebe5dc, window: [-0.55, 1.55, 1.1, 1.2], keyPos: [-1.5, 3.6, -3.5], key: 2.2, back: 0.9 }), s = R.s;
      R.key.target.position.set(0, 0.8, 0);
      const cam = camera([0.42, 1.18, 0.55], [-0.1, 0.96, -0.64], 40);
      // a white sideboard with a wooden top under the window
      const topY = 0.82;
      rbox(s, 1.7, 0.78, 0.46, 0.02, mat(0xf4f3f0, { roughness: 0.5 }), -0.2, 0.41, -0.62);
      for (const x of [-0.62, -0.2, 0.22]) rbox(s, 0.4, 0.66, 0.02, 0.006, mat(0xf7f6f3, { roughness: 0.45 }), x, 0.42, -0.385);
      for (const x of [-0.62, -0.2, 0.22]) cyl(s, 0.006, 0.006, 0.12, mat(0xb08d57, { metalness: 0.9, roughness: 0.3 }), x + 0.15, 0.5, -0.37, 10);
      rbox(s, 1.76, 0.04, 0.5, 0.01, woodTop(), -0.2, topY - 0.02, -0.62);
      // water tank (glass) with water and a small pump on its lid
      const tank = new THREE.Group(); tank.position.set(-0.5, topY, -0.66); s.add(tank);
      rbox(tank, 0.16, 0.24, 0.13, 0.012, phys(0xeaf6fb, { transparent: true, opacity: 0.25, roughness: 0.04, clearcoat: 1 }), 0, 0.12, 0);
      const water = rbox(tank, 0.145, 0.2, 0.115, 0.008, phys(0x3d9fe0, { transparent: true, opacity: 0.7, roughness: 0.05 }), 0, 0.105, 0);
      rbox(tank, 0.17, 0.015, 0.14, 0.005, mat(0x2b2f35, { roughness: 0.5 }), 0, 0.245, 0);
      rbox(tank, 0.06, 0.04, 0.05, 0.008, mat(0x1f2328, { roughness: 0.45 }), 0.02, 0.27, 0);
      const pot = new THREE.Group(); pot.position.set(-0.12, topY, -0.64); s.add(pot);
      const drops = []; for (let i = 0; i < 8; i++) drops.push(sph(s, 0.006, phys(0x2f8fd0, { roughness: 0.05 }), 0, 0, 0, false));
      const b = esp32(s, 0.34, topY, -0.52, 1.6); b.g.rotation.y = -0.4;
      let leafM = null, plantG = null, curve = null;
      const ready = model('plant').then(({ root }) => {
        place(root, 0, 0, 0, 0.6, 0.62); pot.add(root); plantG = root;
        root.traverse((o) => { if (o.isMesh && o.material.name === 'leaves') { leafM = o.material; leafM.userData.base = leafM.color.clone(); } });
        const bb = sizeOf(root), rim = bb.min.y + (bb.max.y - bb.min.y) * 0.4;
        // the tube from the pump to the soil, and the soil sensor next to the stem
        curve = new THREE.CatmullRomCurve3([V(-0.48, topY + 0.29, -0.66), V(-0.42, topY + 0.45, -0.66), V(-0.25, topY + 0.47, -0.64), V(-0.17, rim + 0.05, -0.62)]);
        add(s, new THREE.TubeGeometry(curve, 60, 0.005, 8, false), phys(0xcfeaf7, { transparent: true, opacity: 0.6, roughness: 0.05 }));
        const probe = rbox(s, 0.022, 0.09, 0.004, 0.003, mat(0x1d5aa8, { roughness: 0.45 }), -0.04, rim + 0.01, -0.57); probe.rotation.z = -0.12;
        cable(s, [[-0.04, rim + 0.055, -0.57], [0.05, rim + 0.08, -0.55], [0.22, topY + 0.04, -0.52], [0.3, topY + 0.01, -0.52]], 0xc93131, 0.0022);
        cable(s, [[-0.03, rim + 0.055, -0.57], [0.06, rim + 0.06, -0.56], [0.22, topY + 0.03, -0.53], [0.3, topY + 0.008, -0.53]], 0x1b1d20, 0.0022);
        cable(s, [[-0.44, topY + 0.27, -0.66], [-0.2, topY + 0.03, -0.55], [0.1, topY + 0.006, -0.5], [0.3, topY + 0.006, -0.5]], 0x1b1d20, 0.0022);
      });
      const thirsty = C(0xc8b47a);
      return { s, cam, period: 9, ready, update(t) {
        const m = t < 3.5 ? 1 - t / 3.5 : clamp01((t - 3.8) / 2.4);  // soil moisture
        const pumping = t > 3.6 && t < 6.2;
        if (leafM) leafM.color.copy(thirsty).lerp(leafM.userData.base, ease(m));
        if (plantG) { plantG.scale.y = 0.62 * lerp(0.94, 1, ease(m)); plantG.rotation.z = lerp(0.04, 0, ease(m)); }
        water.scale.y = lerp(1, 0.7, clamp01((t - 3.6) / 2.6)); water.position.y = 0.005 + 0.1 * water.scale.y;
        drops.forEach((d, i) => { d.visible = pumping && !!curve; if (d.visible) d.position.copy(curve.getPoint(((t * 0.9) + i / drops.length) % 1)); });
        setLed(b, m < 0.35 ? 0xff3b30 : pumping ? 0x2a9dff : 0x34c759, true);
      } };
    }

    /* ---------- 2. lights that save energy ---------- */
    function lights() {
      const R = room({ bg: 0x1c2430, wall: 0xd6dbe0, window: [-1.2, 1.5, 0.9, 1.2], sky: skyTex('#0e1a33', '#2b3f66', '#14202c'), hemi: 0.12, key: 0.25, keyPos: [-2, 3, -3] }), s = R.s;
      const cam = camera([0.9, 1.45, 3.4], [0.15, 0.85, -0.5], 42);
      add(s, new THREE.PlaneGeometry(2.4, 1.6), mat(0xffffff, { map: rugTex, roughness: 1 }), -0.3, 0.004, 0.15, false).rotation.x = -Math.PI / 2;
      // side table with the lamp, and the lamp's light
      const tbl = new THREE.Group(); tbl.position.set(1.05, 0, -0.95); s.add(tbl);
      cyl(tbl, 0.28, 0.28, 0.035, woodTop(0xe8d6c0), 0, 0.56, 0, 40); cyl(tbl, 0.03, 0.03, 0.54, mat(0x222428, { metalness: 0.6, roughness: 0.35 }), 0, 0.28, 0, 12); cyl(tbl, 0.18, 0.2, 0.02, mat(0x222428, { metalness: 0.6, roughness: 0.35 }), 0, 0.01, 0, 32);
      const bulb = new THREE.PointLight(0xffc98a, 0, 7, 2); bulb.position.set(1.05, 1.0, -0.95); bulb.castShadow = true; bulb.shadow.mapSize.set(1024, 1024); bulb.shadow.radius = 6; bulb.shadow.bias = -0.002; s.add(bulb);
      const ceiling = new THREE.PointLight(0xffe2b8, 0, 9, 2); ceiling.position.set(-0.2, 2.5, 0.2); s.add(ceiling);
      let shadeM = null;
      // motion sensor (PIR) on the wall, with the ESP32 in a small box under it
      const pirG = new THREE.Group(); pirG.position.set(1.75, 1.95, -1.4); s.add(pirG);
      rbox(pirG, 0.11, 0.11, 0.04, 0.012, mat(0xf4f5f6), 0, 0, 0.02);
      const dome = sph(pirG, 0.04, phys(0xfafafa, { roughness: 0.25, transparent: true, opacity: 0.95 }), 0, 0, 0.045); dome.scale.z = 0.7;
      const pir = glow(0xff3b30); sph(pirG, 0.007, pir, 0.035, -0.035, 0.045, false);
      rbox(s, 0.16, 0.1, 0.05, 0.01, mat(0xf4f5f6), 1.75, 1.72, -1.375);
      const pirHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); pirHalo.position.set(0.035, -0.035, 0.07); pirHalo.scale.setScalar(0.08); pirG.add(pirHalo);
      let mixer = null, walk = null, idle = null, who = null;
      const ready = Promise.all([
        model('sofa').then(({ root }) => place(root, -0.45, 0, -0.85, 0, 1) && s.add(root)),
        model('lamp').then(({ root }) => {
          place(root, 0, 0.578, 0, 0, 1.15); tbl.add(root);
          root.traverse((o) => { if (o.isMesh && o.material.name === 'IridescenceLamp') { shadeM = o.material; } });
        }),
        model('chair').then(({ root }) => place(root, -1.85, 0, -0.1, 1.0, 1) && s.add(root)),
        model('person').then(({ root, animations }) => {
          who = root; s.add(root);
          root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = mat(/joint/i.test(o.material.name) ? 0x2b3038 : 0x9fb3c4, { roughness: /joint/i.test(o.material.name) ? 0.4 : 0.55, skinning: true }); } });
          mixer = new THREE.AnimationMixer(root);
          const clip = (n) => animations.find((a) => a.name === n);
          walk = mixer.clipAction(clip('walk')); idle = mixer.clipAction(clip('idle')); walk.play(); idle.play();
        }),
      ]);
      return { s, cam, period: 10, ready, update(t) {
        // walk in (0–2.6 s), stand and look around (2.6–5 s), walk out (5–7.4 s); the light waits 1.5 s, then goes off
        const x = t < 2.6 ? lerp(3.2, 0.35, t / 2.6) : t < 5 ? 0.35 : lerp(0.35, 3.4, (t - 5) / 2.6);
        const walking = t < 2.6 || (t > 5 && t < 7.6);
        if (who) {
          who.position.set(x, 0, 0.05);
          who.rotation.y = t < 2.6 ? -Math.PI / 2 : t < 4.4 ? lerp(-Math.PI / 2, 0, ease((t - 2.6) / 0.6)) : t < 5 ? lerp(0, Math.PI / 2, ease((t - 4.4) / 0.6)) : Math.PI / 2;
          const wW = walking ? 1 : 0; walk.setEffectiveWeight(wW); idle.setEffectiveWeight(1 - wW); mixer.setTime(t);
        }
        // the sensor sees the person from x < 2.3 (0.85 s to 6.7 s); the light stays on 1.5 s after that
        const inRoom = x < 2.3;
        const k2 = clamp01((t - 0.85) / 0.25) * clamp01(1 - (t - 8.2) / 0.3);
        bulb.intensity = 3.2 * k2; ceiling.intensity = 1.6 * k2; R.hemi.intensity = 0.12 + 0.35 * k2; R.key.intensity = 0.25 + 0.3 * k2;
        if (shadeM) { shadeM.emissive = shadeM.emissive || new THREE.Color(); shadeM.emissive.setRGB(0.9, 0.6, 0.3); shadeM.emissiveIntensity = 0.5 * k2; }
        s.background.copy(C(0x1c2430)).lerp(C(0x9aa3ad), k2 * 0.6);
        if (Math.abs((s.userData.k ?? -1) - k2) > 0.01) { s.userData.k = k2; envScale(s, 0.06 + 0.55 * k2); }
        pir.emissiveIntensity = inRoom ? 4 : 0; pirHalo.material.opacity = inRoom ? 0.8 : 0;
      } };
    }

    /* ---------- 3. door and window alarm ---------- */
    function door() {
      const R = room({ bg: 0xeef0f2, wall: 0xe4e0d8, keyPos: [3, 4, 3], back: 1.3, noBack: true }), s = R.s;
      const cam = camera([1.25, 1.4, 2.0], [0.2, 0.95, -1.05], 42);
      const back = -1.3;
      // the doorway: white frame, the outside (garden and sky) seen through it
      const frameM = mat(0xf8f8f6, { roughness: 0.4 });
      const dw = 0.92, dh = 2.05, dx = -0.55;
      // the back wall around the doorway
      const wallM = mat(0xe4e0d8, { roughness: 0.92 });
      add(s, new THREE.BoxGeometry(3 - dw / 2 + dx, 2.7, 0.1), wallM, -3 + (3 - dw / 2 + dx) / 2, 1.35, back - 0.05, false);
      add(s, new THREE.BoxGeometry(3 - dw / 2 - dx, 2.7, 0.1), wallM, dx + dw / 2 + (3 - dw / 2 - dx) / 2, 1.35, back - 0.05, false);
      add(s, new THREE.BoxGeometry(dw, 2.7 - dh, 0.1), wallM, dx, dh + (2.7 - dh) / 2, back - 0.05, false);
      add(s, new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: skyTex('#8cc4ec', '#e8f4fb', '#7fb069'), toneMapped: false }), dx, 1.3, back - 1.2, false);
      add(s, new THREE.BoxGeometry(2, 0.02, 1.2), mat(0x9b9a95, { roughness: 0.9 }), dx, -0.01, back - 0.6, false); // the step outside
      rbox(s, 0.07, dh + 0.07, 0.14, 0.01, frameM, dx - dw / 2 - 0.035, (dh + 0.07) / 2, back + 0.01); rbox(s, 0.07, dh + 0.07, 0.14, 0.01, frameM, dx + dw / 2 + 0.035, (dh + 0.07) / 2, back + 0.01);
      rbox(s, dw + 0.14, 0.07, 0.14, 0.01, frameM, dx, dh + 0.035, back + 0.01);
      // the door: painted, with raised panels and a brass handle, hinged on the left
      const hinge = new THREE.Group(); hinge.position.set(dx - dw / 2, 0, back + 0.02); s.add(hinge);
      const paint = phys(0x2f5d62, { roughness: 0.4, clearcoat: 0.4 });
      rbox(hinge, dw - 0.01, dh - 0.01, 0.045, 0.006, paint, dw / 2, dh / 2, 0);
      for (const [px, py, pw, ph] of [[0.25, 1.45, 0.3, 0.75], [0.67, 1.45, 0.3, 0.75], [0.25, 0.5, 0.3, 0.7], [0.67, 0.5, 0.3, 0.7]]) rbox(hinge, pw, ph, 0.012, 0.01, paint, px, py, 0.026);
      const brass = mat(0xc9a35a, { metalness: 0.95, roughness: 0.25 });
      sph(hinge, 0.03, brass, dw - 0.09, 1.0, 0.06); cyl(hinge, 0.012, 0.012, 0.04, brass, dw - 0.09, 1.0, 0.035, 12).rotation.x = Math.PI / 2;
      // the magnet sensor: one half on the frame, one on the door
      rbox(s, 0.025, 0.07, 0.02, 0.004, mat(0xffffff), dx + dw / 2 + 0.035, 1.9, back + 0.09);
      rbox(hinge, 0.025, 0.07, 0.02, 0.004, mat(0xffffff), dw - 0.03, 1.9, 0.04);
      // console table with the ESP32, the buzzer and the phone
      const top = 0.8, cx = 0.75;
      rbox(s, 1.0, 0.035, 0.34, 0.008, woodTop(0xd9c4a8), cx, top - 0.017, back + 0.2);
      for (const x of [-0.46, 0.46]) for (const z of [-0.14, 0.14]) cyl(s, 0.015, 0.012, top - 0.035, mat(0x23262a, { metalness: 0.6, roughness: 0.35 }), cx + x, (top - 0.035) / 2, back + 0.2 + z, 10);
      const b = esp32(s, cx + 0.05, top, back + 0.24, 1.7); b.g.rotation.y = -0.2;
      const buzz = new THREE.Group(); buzz.position.set(cx + 0.24, top, back + 0.22); s.add(buzz);
      cyl(buzz, 0.028, 0.028, 0.03, mat(0x15181b, { roughness: 0.6 }), 0, 0.015, 0, 28); cyl(buzz, 0.006, 0.006, 0.032, mat(0x333333), 0, 0.016, 0, 10);
      const rings = [0, 1, 2].map(() => add(s, new THREE.TorusGeometry(0.05, 0.003, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0, toneMapped: false }), cx + 0.24, top + 0.05, back + 0.22, false));
      rings.forEach((r) => { r.rotation.x = -Math.PI / 2; });
      cable(s, [[dx + dw / 2 + 0.05, 1.9, back + 0.1], [dx + dw / 2 + 0.08, 1.4, back + 0.06], [cx - 0.1, top + 0.01, back + 0.12], [cx + 0.0, top + 0.006, back + 0.22]], 0xf2f2f2, 0.003);
      const ph = phone(s, cx + 0.38, top, back + 0.27, -0.5, -0.28, 0.27);
      const ready = Promise.all([
        model('flowers').then(({ root }) => place(root, cx - 0.32, top, back + 0.18, 0.3, 1.6) && s.add(root)),
        model('chair').then(({ root }) => place(root, -1.65, 0, -0.55, 0.9, 1) && s.add(root)),
      ]);
      return { s, cam, period: 8, ready, update(t) {
        const open = t < 1 ? 0 : t < 2.4 ? ease((t - 1) / 1.4) : t < 6 ? 1 : 1 - ease((t - 6) / 1.4);
        hinge.rotation.y = 1.25 * open;
        const alarm = open > 0.05 && t < 7;
        rings.forEach((r, i) => { const f = ((t * 1.6) + i / 3) % 1; r.scale.setScalar(1 + f * 2.5); r.position.y = top + 0.04 + f * 0.04; r.material.opacity = alarm ? 0.85 * (1 - f) : 0; });
        setLed(b, alarm ? 0xff3b30 : 0x34c759, alarm ? Math.floor(t * 6) % 2 === 0 : true);
        ph.show(alarm && t > 1.6 ? ['Front door opened', 'Nobody is home', '#c93131'] : null);
      } };
    }

    /* ---------- 4. water-leak warning ---------- */
    function leak() {
      const R = room({ bg: 0xeef2f4, floor: mat(0xffffff, { map: tiles, roughness: 0.3 }), wallM: mat(0xffffff, { map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#b9c3c9'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { g.fillStyle = '#f3f5f6'; g.fillRect(i * 64 + 2 + (j % 2) * 32, j * 32 + 2, 60, 28); } }, [6, 4]), roughness: 0.25 }), back: 1.1, keyPos: [2.5, 4, 3] }), s = R.s;
      const cam = camera([0.75, 1.12, 1.3], [-0.3, 0.52, -0.72], 44);
      // a sink cabinet in sage green with its doors open, a stone worktop and the steel sink
      const cab = mat(0x8fa79a, { roughness: 0.5 }), inside = mat(0xf2f2ee, { roughness: 0.6 }), z0 = -0.8;
      rbox(s, 1.2, 0.03, 0.56, 0.005, inside, -0.4, 0.1, z0); rbox(s, 0.03, 0.82, 0.56, 0.005, cab, -1.0, 0.5, z0); rbox(s, 0.03, 0.82, 0.56, 0.005, cab, 0.2, 0.5, z0);
      rbox(s, 1.2, 0.82, 0.02, 0.005, inside, -0.4, 0.5, z0 - 0.27); box(s, 1.2, 0.08, 0.5, mat(0x2b2f33), -0.4, 0.04, z0 + 0.02);
      rbox(s, 1.28, 0.04, 0.62, 0.008, phys(0x40464c, { roughness: 0.2, clearcoat: 0.8 }), -0.4, 0.93, z0 + 0.02);
      rbox(s, 0.5, 0.012, 0.4, 0.01, mat(0xd8dde0, { metalness: 0.95, roughness: 0.2 }), -0.4, 0.955, z0);
      const tap = new THREE.CatmullRomCurve3([V(-0.4, 0.95, z0 - 0.22), V(-0.4, 1.22, z0 - 0.22), V(-0.4, 1.26, z0 - 0.12), V(-0.4, 1.18, z0 - 0.04)]);
      add(s, new THREE.TubeGeometry(tap, 30, 0.014, 12, false), mat(0xe6e9ec, { metalness: 1, roughness: 0.15 }));
      const brass = mat(0xc9a35a, { metalness: 0.95, roughness: 0.25 });
      for (const [x, a] of [[-1.0, 1.95], [0.2, -1.95]]) {
        const d = new THREE.Group(); d.position.set(x, 0.1, z0 + 0.28); d.rotation.y = a; s.add(d);
        const sx = x < 0 ? 1 : -1; rbox(d, 0.59, 0.8, 0.02, 0.006, cab, sx * 0.295, 0.4, 0);
        rbox(d, 0.48, 0.66, 0.008, 0.006, mat(0x9db3a7, { roughness: 0.5 }), sx * 0.295, 0.4, 0.012);
        box(d, 0.012, 0.16, 0.02, brass, sx * 0.53, 0.55, 0.03);
      }
      // the waste pipe with a P-trap and a dripping joint
      const pipeM = mat(0xdfe3e6, { metalness: 0.9, roughness: 0.22 });
      const trap = new THREE.CatmullRomCurve3([V(-0.4, 0.95, z0), V(-0.4, 0.6, z0), V(-0.34, 0.47, z0), V(-0.24, 0.52, z0), V(-0.2, 0.64, z0 - 0.04), V(-0.2, 0.66, z0 - 0.26)]);
      add(s, new THREE.TubeGeometry(trap, 60, 0.022, 14, false), pipeM);
      cyl(s, 0.03, 0.03, 0.04, mat(0xb9bec2, { metalness: 0.9, roughness: 0.3 }), -0.4, 0.62, z0, 20);
      const drops = [0, 1, 2].map(() => sph(s, 0.008, phys(0x3a9bd8, { roughness: 0.05 }), -0.4, 0.58, z0, false));
      // the puddle spreads out of the cabinet onto the tiles
      const blob = new THREE.Shape(); for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2, r = 1 + 0.16 * Math.sin(a * 3) + 0.09 * Math.cos(a * 5); const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0) blob.moveTo(px, py); else blob.lineTo(px, py); }
      const puddle = add(s, new THREE.ShapeGeometry(blob, 32), phys(0x4f9fdc, { transparent: true, opacity: 0.7, roughness: 0.0, clearcoat: 1, metalness: 0.2 }), -0.4, 0.124, z0 + 0.0, false);
      puddle.rotation.x = -Math.PI / 2;
      const floorPuddle = add(s, new THREE.ShapeGeometry(blob, 32), phys(0x4f9fdc, { transparent: true, opacity: 0.7, roughness: 0.0, clearcoat: 1, metalness: 0.2 }), -0.35, 0.003, z0 + 0.45, false);
      floorPuddle.rotation.x = -Math.PI / 2;
      // the leak sensor: a small pad with two gold strips on the cabinet floor, wired to the ESP32
      rbox(s, 0.08, 0.012, 0.05, 0.004, mat(0x15181b), -0.15, 0.122, z0 + 0.05);
      for (const dx of [-0.012, 0.012]) box(s, 0.005, 0.004, 0.04, mat(0xd9b44a, { metalness: 0.9, roughness: 0.25 }), -0.15 + dx, 0.13, z0 + 0.05);
      const b = esp32(s, 0.06, 0.12, z0 - 0.08, 1.6); b.g.rotation.y = -0.3;
      cable(s, [[-0.11, 0.125, z0 + 0.05], [-0.05, 0.13, z0], [0.0, 0.125, z0 - 0.07]], 0xc93131, 0.002);
      // the phone on the worktop shows the alert
      const ph = phone(s, 0.0, 0.95, z0 + 0.12, -0.4, -0.25, 0.28);
      const ready = model('flowers').then(({ root }) => place(root, -0.85, 0.95, z0 - 0.1, 0, 1.5) && s.add(root));
      return { s, cam, period: 8, ready, update(t) {
        const r1 = t < 0.6 ? 0.001 : t < 3.6 ? lerp(0.03, 0.22, (t - 0.6) / 3) : t < 6.8 ? 0.22 : lerp(0.22, 0.001, (t - 6.8) / 1.2);
        const r2 = t < 2.6 ? 0.001 : t < 5 ? lerp(0.02, 0.2, (t - 2.6) / 2.4) : t < 6.8 ? 0.2 : lerp(0.2, 0.001, (t - 6.8) / 1.2);
        puddle.scale.set(Math.max(0.001, r1 * 1.4), Math.max(0.001, r1), 1);
        floorPuddle.scale.set(Math.max(0.001, r2 * 1.6), Math.max(0.001, r2), 1);
        drops.forEach((d, i) => { const k = ((t * 1.4) + i / 3) % 1; d.position.y = 0.58 - k * 0.46; d.visible = t < 6.6; });
        const wet = r1 > 0.12;
        setLed(b, wet ? 0xff3b30 : 0x34c759, wet ? Math.floor(t * 6) % 2 === 0 : true);
        ph.show(wet ? ['Water leak!', 'Under the kitchen sink', '#2a7fd0'] : null);
      } };
    }

    /* ---------- 5. classroom air checker ---------- */
    function air() {
      const R = room({ bg: 0xeef2f5, wall: 0xe7ebee, window: [-0.75, 1.55, 1.1, 1.1], keyPos: [-1.2, 3.8, -3.6], key: 1.8, back: 1.2 }), s = R.s;
      R.key.target.position.set(0, 0.6, 0);
      const cam = camera([0.85, 1.38, 2.15], [0.0, 0.95, -0.75], 40);
      // a desk with a wooden top and steel legs, and a whiteboard
      const steel = mat(0x4d5660, { metalness: 0.7, roughness: 0.35 });
      rbox(s, 1.4, 0.035, 0.7, 0.008, woodTop(), 0.1, 0.74, -0.75);
      for (const [x, z] of [[-0.55, -1.05], [0.75, -1.05], [-0.55, -0.45], [0.75, -0.45]]) box(s, 0.035, 0.72, 0.035, steel, x, 0.36, z);
      rbox(s, 1.0, 0.62, 0.025, 0.01, mat(0xfcfcfc, { roughness: 0.15 }), 0.95, 1.6, -1.19);
      rbox(s, 1.04, 0.66, 0.02, 0.012, mat(0xb9c0c6, { metalness: 0.7, roughness: 0.3 }), 0.95, 1.6, -1.195);
      // an opening window sash
      const sash = new THREE.Group(); sash.position.set(-1.3, 1.55, -1.18); s.add(sash);
      const sashM = mat(0xfafafa, { roughness: 0.35 });
      rbox(sash, 0.53, 0.04, 0.04, 0.006, sashM, 0.265, 0.51, 0); rbox(sash, 0.53, 0.04, 0.04, 0.006, sashM, 0.265, -0.51, 0);
      rbox(sash, 0.04, 1.06, 0.04, 0.006, sashM, 0.02, 0, 0); rbox(sash, 0.04, 1.06, 0.04, 0.006, sashM, 0.51, 0, 0);
      rbox(sash, 0.47, 1.0, 0.012, 0.004, phys(0xe9f6fc, { transparent: true, opacity: 0.25, roughness: 0.02, clearcoat: 1 }), 0.265, 0, 0.01);
      // the air checker: a white case with a CO₂ display and a traffic light
      const dev = new THREE.Group(); dev.position.set(0.42, 0.758, -0.72); dev.rotation.y = -0.3; s.add(dev);
      rbox(dev, 0.16, 0.19, 0.06, 0.018, phys(0xf8f9fa, { roughness: 0.35 }), 0, 0.095, 0);
      const sig = signal(dev, -0.04, 0.1, 0.03, 0.45);
      let co2 = 0;
      const lcd = canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#0f1a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#9fe7c4'; g.font = '700 30px monospace'; g.textAlign = 'center'; g.fillText(String(co2), w / 2, 48); g.font = '600 16px monospace'; g.fillStyle = '#7fa8c9'; g.fillText('CO2 ppm', w / 2, 76); });
      const lcdM = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.05), new THREE.MeshBasicMaterial({ map: lcd, toneMapped: false })); lcdM.position.set(0.035, 0.11, 0.0305); dev.add(lcdM);
      // books and a laptop make it a real study desk
      const bk = [0x2c6e9e, 0xc0533a, 0xe0b23c]; bk.forEach((c, i) => rbox(s, 0.22, 0.035, 0.16, 0.004, mat(c, { roughness: 0.7 }), -0.38, 0.775 + i * 0.036, -0.85 + i * 0.01));
      const lap = new THREE.Group(); lap.position.set(0.0, 0.758, -0.7); lap.rotation.y = 0.15; s.add(lap);
      rbox(lap, 0.34, 0.012, 0.23, 0.008, mat(0xc7cbd0, { metalness: 0.8, roughness: 0.3 }), 0, 0.006, 0);
      const scr = new THREE.Group(); scr.position.set(0, 0.012, -0.11); scr.rotation.x = -0.25; lap.add(scr);
      rbox(scr, 0.34, 0.22, 0.008, 0.008, mat(0xc7cbd0, { metalness: 0.8, roughness: 0.3 }), 0, 0.11, 0);
      box(scr, 0.31, 0.19, 0.002, new THREE.MeshBasicMaterial({ color: 0x2b4a6a }), 0, 0.11, 0.0045, false);
      // stale air: faint puffs that build up and drift out when the window opens
      const puffs = []; for (let i = 0; i < 16; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0x8a96a2, transparent: true, opacity: 0, depthWrite: false })); sp.userData = { x: -1.2 + rnd() * 2.4, z: -1.0 + rnd() * 1.4, y: 1.0 + rnd() * 1.1, sp: 0.06 + rnd() * 0.06, o: rnd() * 6, k: rnd() }; s.add(sp); puffs.push(sp); }
      const ready = Promise.all([
        model('chair').then(({ root }) => place(root, 0.1, 0, -0.05, Math.PI + 0.15, 0.95) && s.add(root)),
        model('plant').then(({ root }) => place(root, 1.7, 0, -0.85, 0.4, 1.0) && s.add(root)),
      ]);
      return { s, cam, period: 10, ready, update(t) {
        const level = t < 4.5 ? t / 4.5 : t < 5.2 ? 1 : clamp01(1 - (t - 5.2) / 3.5);
        const open = t < 4.6 ? 0 : t < 5.4 ? ease((t - 4.6) / 0.8) : t < 9 ? 1 : 1 - ease((t - 9) / 0.8);
        sash.rotation.y = -1.1 * open;
        sig.set(level < 0.4 ? 2 : level < 0.75 ? 1 : 0);
        const ppm = Math.round(450 + level * 1250); if (Math.abs(ppm - co2) > 15) { co2 = ppm; lcd.redraw(); }
        puffs.forEach((p) => { const u = p.userData; p.position.set(u.x + Math.sin(t * 0.6 + u.o) * 0.12 - (open > 0.5 ? (t - 5) * 0.3 : 0), u.y + Math.sin(t * u.sp * 6 + u.o) * 0.08, u.z); p.scale.setScalar(0.12 + u.k * 0.1); p.material.opacity = (u.k < level ? 0.22 : 0); });
      } };
    }

    /* ---------- 6. parking helper ---------- */
    function parking() {
      const R = room({ bg: 0xe2e5e8, w: 9, d: 11, h: 3, back: 2.6, left: 3.2, floor: mat(0xffffff, { map: concrete, roughness: 0.75 }),
        wallM: mat(0xffffff, { map: tex('brick.jpg', [3, 1.2]), roughnessMap: tex('brick_rough.jpg', [3, 1.2], false), roughness: 1 }), sideM: mat(0xd9dcde, { roughness: 0.9 }),
        keyPos: [3, 6, 4], key: 1.6, shadowBox: 5 }), s = R.s;
      const cam = camera([3.9, 2.3, 3.6], [0.0, 0.7, -1.2], 40);
      const back = -2.6;
      const line = mat(0xf2c200, { roughness: 0.6 });
      box(s, 0.1, 0.004, 6, line, -1.3, 0.002, 0.4, false); box(s, 0.1, 0.004, 6, line, 1.3, 0.002, 0.4, false);
      rbox(s, 1.6, 0.1, 0.16, 0.03, mat(0xf2c200, { roughness: 0.5 }), 0, 0.05, back + 0.35); // wheel stop
      // the distance sensor (HC-SR04: blue board, two silver "eyes") in a box on the wall, and a big traffic light
      const sens = new THREE.Group(); sens.position.set(0, 1.05, back); sens.scale.setScalar(1.7); s.add(sens);
      rbox(sens, 0.26, 0.14, 0.05, 0.012, mat(0xf2f3f4, { roughness: 0.4 }), 0, 0, 0.025);
      rbox(sens, 0.2, 0.09, 0.01, 0.004, mat(0x1d5aa8, { roughness: 0.45 }), 0, 0, 0.055);
      for (const x of [-0.05, 0.05]) { const e = cyl(sens, 0.032, 0.032, 0.05, mat(0xd7dbdf, { metalness: 0.9, roughness: 0.3 }), x, 0, 0.08, 28); e.rotation.x = Math.PI / 2; const m = cyl(sens, 0.024, 0.024, 0.052, mat(0x2b2f35, { roughness: 0.9 }), x, 0, 0.081, 20); m.rotation.x = Math.PI / 2; }
      const sig = signal(s, 0, 1.75, back, 2.2, true);
      cable(s, [[0.13, 1.05, back + 0.02], [0.3, 1.3, back + 0.02], [0.25, 1.62, back + 0.02]], 0x30343a, 0.006);
      const waves = [0, 1, 2].map(() => add(s, new THREE.TorusGeometry(0.08, 0.004, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3d9bff, transparent: true, opacity: 0, toneMapped: false }), 0, 1.05, back + 0.12, false));
      // shelves with boxes on the side wall make it a real garage
      for (const y of [0.9, 1.6]) rbox(s, 0.4, 0.03, 1.6, 0.005, mat(0x7a7f85, { metalness: 0.5, roughness: 0.5 }), -3.0, y, -1.2);
      [[0.9, -1.6, 0xc9a77c], [0.9, -1.1, 0xb48f63], [1.6, -1.5, 0x5a7fa6], [1.6, -0.8, 0xc9a77c]].forEach(([y, z, c]) => rbox(s, 0.34, 0.26, 0.4, 0.01, mat(c, { roughness: 0.85 }), -3.0, y + 0.145, z));
      const car = new THREE.Group(); s.add(car);
      const wheels = [];
      const shadow = add(car, new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), new THREE.MeshBasicMaterial({ map: tex('car_shadow.png'), blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, depthWrite: false }), 0, 0.006, 0, false);
      shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 2;
      const ready = model('car').then(({ root }) => {
        root.rotation.y = Math.PI; car.add(root); // nose towards the wall (−z)
        const body = root.getObjectByName('body'); if (body) body.material = new THREE.MeshPhysicalMaterial({ color: C(0x1f5fbf), metalness: 0.9, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.03 });
        const glass = root.getObjectByName('glass'); if (glass) glass.material = new THREE.MeshPhysicalMaterial({ color: 0x223040, metalness: 0.3, roughness: 0, transparent: true, opacity: 0.45 });
        ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].forEach((n) => { const w = root.getObjectByName(n); if (w) wheels.push(w); });
      });
      const L = 4.53, stopZ = back + 0.45 + L / 2; // the nose stops 0.45 m from the wall
      return { s, cam, period: 8, ready, update(t) {
        const z = t < 3.6 ? lerp(stopZ + 6, stopZ, ease(t / 3.6)) : t < 5.6 ? stopZ : lerp(stopZ, stopZ + 6, ease((t - 5.6) / 2.4));
        const dz = z - (car.userData.z == null ? z : car.userData.z); car.userData.z = z;
        car.position.set(0, 0, z);
        wheels.forEach((w) => { w.rotation.x += dz / 0.33; });
        const gap = z - L / 2 - back; // nose to wall
        sig.set(gap > 2.2 ? 2 : gap > 1.0 ? 1 : 0);
        waves.forEach((w, i) => { const f = ((t * 1.5) + i / 3) % 1; w.position.z = back + 0.12 + f * Math.max(0.3, Math.min(gap, 3) - 0.1); w.scale.setScalar(1 + f * 3); w.material.opacity = 0.75 * (1 - f); });
      } };
    }

    /* ---------- draw the scenes into the cards ---------- */
    const MAKERS = { plant, lights, door, leak, air, parking };
    const items = [];
    [...canvases].forEach((cv) => { if (MAKERS[cv.dataset.proj]) items.push({ cv, ctx: cv.getContext('2d'), sc: null, visible: false, near: false, ok: false, t0: Math.random() * 3 }); });
    if (!items.length) return null;
    let rw = 0, rh = 0;
    function sizeAll() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let mw = 1, mh = 1;
      items.forEach((it) => {
        const w = Math.max(1, Math.round(it.cv.clientWidth * dpr)), h = Math.max(1, Math.round(it.cv.clientHeight * dpr));
        if (it.cv.width !== w || it.cv.height !== h) { it.cv.width = w; it.cv.height = h; }
        it.w = w; it.h = h; mw = Math.max(mw, w); mh = Math.max(mh, h);
        if (it.sc) fit(it);
      });
      if (mw !== rw || mh !== rh) { rw = mw; rh = mh; renderer.setSize(rw, rh, false); }
    }
    function fit(it) {
      const cam = it.sc.cam; cam.aspect = it.w / it.h;
      cam.fov = (cam.userData.fov0 || (cam.userData.fov0 = cam.fov)) * (cam.aspect < 1.5 ? 1.5 / cam.aspect * 0.85 + 0.15 : 1);
      cam.updateProjectionMatrix();
    }
    function draw(it, t) {
      if (!it.ok) return;
      it.sc.update(t % it.sc.period);
      renderer.setViewport(0, 0, it.w, it.h); renderer.setScissor(0, 0, it.w, it.h); renderer.setScissorTest(true);
      renderer.render(it.sc.s, it.sc.cam);
      it.ctx.drawImage(renderer.domElement, 0, rh - it.h, it.w, it.h, 0, 0, it.w, it.h); // the picture sits in the bottom-left corner
    }
    // build a scene when its card comes near the screen; show it once its models have arrived
    function build(it) {
      if (it.sc) return;
      it.sc = MAKERS[it.cv.dataset.proj](); fit(it);
      const done = () => { if (it.cv.dataset.proj !== 'lights') envScale(it.sc.s, 0.7); it.ok = true; draw(it, it.sc.period * 0.45 + (opts.reduceMotion ? 0 : clock + it.t0)); it.cv.classList.add('on'); start(); };
      Promise.resolve(it.sc.ready).then(done, done); // a missing model never blocks the card
    }
    const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) build(items.find((x) => x.cv === e.target)); }), { rootMargin: '600px 0px' });
    const io = new IntersectionObserver((es) => { es.forEach((e) => { const it = items.find((x) => x.cv === e.target); if (it) it.visible = e.isIntersecting; }); start(); }, { rootMargin: '60px 0px' });
    items.forEach((it) => { near.observe(it.cv); io.observe(it.cv); });
    new ResizeObserver(() => { sizeAll(); items.forEach((it) => { if (it.ok && (opts.reduceMotion || !raf)) draw(it, it.sc.period * 0.45); }); }).observe(items[0].cv.closest('.projects') || items[0].cv.parentElement);
    sizeAll();
    let raf = 0, last = 0, clock = 0;
    function loop(now) {
      raf = 0;
      if (document.hidden || !items.some((x) => x.visible && x.ok)) return;
      if (now - last >= 33) { // about 30 frames a second is plenty for these loops
        clock += Math.min(0.1, (now - (last || now)) / 1000); last = now;
        items.forEach((it) => { if (it.visible) draw(it, clock + it.t0); });
      }
      raf = requestAnimationFrame(loop);
    }
    function start() { if (opts.reduceMotion) return; if (!raf) raf = requestAnimationFrame(loop); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    return { items, draw, build, start };
  }
  window.KKProjects = { mount };
})();
