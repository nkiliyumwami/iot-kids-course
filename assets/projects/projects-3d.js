/* 3D loops for the "Real problems your child can solve" cards on the landing page.
   Real-size scenes (1 unit = 1 metre) from everyday life in Rwanda: a compound gate, a Cash Power meter, a solar
   security light, a rain tank and pump, a charcoal kitchen, a bean garden, a school football pitch and a street bin,
   with a velvet sofa and a walking figure from real 3D models (see assets/projects/CREDITS.md), lit by a studio
   environment with soft shadows. One WebGL renderer draws every scene and copies the picture into each card's own canvas, so six cards cost
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
    // a copy of a model for each scene; fresh = load it again (the walking figure needs its own skeleton every time)
    function model(name, fresh) {
      if (fresh) return gltf.loadAsync(BASE + 'models/' + name + '.glb').then((g) => { g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return { root: g.scene, animations: g.animations }; });
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
    function camera(pos, look, fov = 38) { const c = new THREE.PerspectiveCamera(fov, 1.6, 0.05, 120); c.position.set(...pos); c.lookAt(...look); return c; }

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

    /* =================================================================================================
       Rwandan homes, yards, kitchens and gardens. Outdoor scenes share a sky over green hills
       ("the land of a thousand hills"), red soil, banana trees, plastered walls and tin roofs.
       Alerts appear on a phone in the corner of the picture, the way a family would see them.
       ================================================================================================= */
    const hillsTex = (dusk) => canvasTex(1024, 512, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
      sky.addColorStop(0, dusk ? '#1d2f57' : '#7fb8e6'); sky.addColorStop(1, dusk ? '#e9a46b' : '#e6f2fa');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      // layers of hills, far (hazy blue-green) to near (deep green), each with terraced fields
      const layers = dusk ? ['#5b6f78', '#465d55', '#33493c', '#263a2b'] : ['#a9c6b8', '#7fae86', '#5d9562', '#467d48'];
      layers.forEach((col, i) => {
        const base = h * (0.42 + i * 0.1), amp = h * (0.07 - i * 0.008), f1 = 0.006 + i * 0.003, ph = i * 1.7;
        g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, base - amp * (Math.sin(x * f1 + ph) * 0.6 + Math.sin(x * f1 * 2.3 + ph * 2) * 0.4));
        g.lineTo(w, h); g.fill();
        if (i >= 2) { g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; for (let y = base; y < h; y += 9) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 3); g.stroke(); } }
      });
    });
    const soilTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#a5512b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16000; i++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(120,50,20,${0.15 + rnd() * 0.2})` : `rgba(200,110,60,${0.1 + rnd() * 0.15})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3); }
      for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 40, gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(90,120,50,.35)'); gr.addColorStop(1, 'rgba(90,120,50,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    }, [8, 8]);
    const plasterTex = (base) => canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,70,50'},${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
    }, [3, 2]);
    const tinTex = (hex) => canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = hex; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(0.5, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(255,255,255,.25)'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
    }, [6, 1]);
    const glowDot = (parent, hex, size, x, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: hex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); sp.position.set(x, y, z); sp.scale.setScalar(size); parent.add(sp); return sp; };

    // an outdoor scene: sky and hills far behind, red soil, warm sun with soft shadows
    function yard(o = {}) {
      const s = new THREE.Scene();
      s.background = C(o.dusk ? 0x1d2f57 : 0x9cc8ea); s.environment = env;
      const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a5a3a, o.hemi == null ? 0.5 : o.hemi); s.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0d6, o.sun == null ? 1.9 : o.sun);
      sun.position.set(...(o.sunPos || [6, 9, 5])); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
      s.add(sun); s.add(sun.target);
      const hillMap = o.hills || hillsTex(false); hillMap.wrapS = THREE.RepeatWrapping; hillMap.repeat.x = 3;
      const sky = add(s, new THREE.PlaneGeometry(360, 45), new THREE.MeshBasicMaterial({ map: hillMap, toneMapped: false, fog: false }), 0, 12, -40, false);
      const ground = add(s, new THREE.PlaneGeometry(90, 90), mat(0xffffff, { map: soilTex, roughness: 0.95 }), 0, 0, -10, false); ground.rotation.x = -Math.PI / 2;
      s.fog = new THREE.Fog(o.dusk ? 0x2b3a5c : 0xcfe2ee, 18, 55);
      return { s, hemi, sun, sky };
    }
    // a banana tree: a trunk and big drooping leaves
    const leafM = mat(0x4f8f3a, { roughness: 0.65, side: THREE.DoubleSide });
    function leafGeo(len, wid, droop) {
      const g = new THREE.PlaneGeometry(len, wid, 14, 2), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + len / 2, f = x / len, y = p.getY(i);
        p.setXYZ(i, x, -droop * f * f * len + Math.abs(y) * 0.25, y * Math.sin(Math.PI * Math.min(1, f * 1.15 + 0.05)));
      }
      g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
    }
    function banana(s, x, z, h = 2.4, seed0 = 0) {
      const g = new THREE.Group(); g.position.set(x, 0, z); s.add(g);
      cyl(g, 0.11, 0.16, h, mat(0x7a8a4a, { roughness: 0.8 }), 0, h / 2, 0, 12);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + seed0, l = new THREE.Mesh(leafGeo(1.4 + (i % 3) * 0.2, 0.42, 0.45 + (i % 2) * 0.2), leafM);
        l.castShadow = true; l.position.y = h - 0.05; l.rotation.set(0, a, 0.5 + (i % 3) * 0.12); g.add(l);
      }
      return g;
    }
    // a plastered house wall with a tin roof edge above it
    function house(s, o) {
      const g = new THREE.Group(); g.position.set(o.x || 0, 0, o.z || 0); g.rotation.y = o.ry || 0; s.add(g);
      const W = o.w || 6, H = o.h || 2.8;
      add(g, new THREE.BoxGeometry(W, H, 0.25), mat(0xffffff, { map: plasterTex(o.wall || '#e9dcc4'), roughness: 0.9 }), 0, H / 2, 0);
      add(g, new THREE.BoxGeometry(W + 0.02, 0.7, 0.27), mat(o.band || 0x8c4a2f, { roughness: 0.85 }), 0, 0.35, 0, false); // the darker painted band
      const roof = add(g, new THREE.BoxGeometry(W + 0.8, 0.04, 1.6), mat(0xffffff, { map: tinTex(o.roof || '#7b2f2a'), roughness: 0.45, metalness: 0.5 }), 0, H + 0.35, -0.35);
      roof.rotation.x = 0.35;
      return g;
    }
    // a yellow 20-litre jerrycan
    function jerrycan(s, x, y, z, ry = 0) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; s.add(g);
      const yel = mat(0xf2c200, { roughness: 0.5 });
      rbox(g, 0.26, 0.36, 0.17, 0.03, yel, 0, 0.18, 0);
      rbox(g, 0.14, 0.035, 0.03, 0.012, yel, -0.03, 0.4, 0); cyl(g, 0.025, 0.025, 0.05, mat(0x2a6fd6, { roughness: 0.4 }), 0.08, 0.385, 0, 14);
      return g;
    }
    // the figure from the "walking" model, loaded fresh each time so every scene has its own skeleton
    function walker(s) {
      const w = { root: null, set() {} };
      w.ready = model('person', true).then(({ root, animations }) => {
        s.add(root); w.root = root;
        root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = mat(/joint/i.test(o.material.name) ? 0x2b3038 : 0x9fb3c4, { roughness: /joint/i.test(o.material.name) ? 0.4 : 0.55, skinning: true }); } });
        const mixer = new THREE.AnimationMixer(root), clip = (n) => animations.find((a) => a.name === n);
        const walk = mixer.clipAction(clip('walk')), idle = mixer.clipAction(clip('idle')); walk.play(); idle.play();
        w.set = (x, z, ry, walking, t, visible = true) => { root.visible = visible; root.position.set(x, 0, z); root.rotation.y = ry; walk.setEffectiveWeight(walking ? 1 : 0); idle.setEffectiveWeight(walking ? 0 : 1); mixer.setTime(t); };
      });
      return w;
    }
    // a phone held up in the corner of the picture: it slides in when there is news
    function hudPhone(s, cam, draw) {
      s.add(cam);
      const g = new THREE.Group(); cam.add(g);
      const body = rbox(g, 0.3, 0.6, 0.03, 0.045, phys(0x1c1f24, { roughness: 0.25, metalness: 0.4 }), 0, 0.3, 0, false);
      let state = null;
      const t = canvasTex(240, 480, (c, w, h) => draw(c, w, h, state));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.56), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.set(0, 0.3, 0.0155); g.add(scr);
      [body, scr].forEach((m) => { m.renderOrder = 10; m.material.depthTest = false; });
      let k = 0;
      return {
        set(st) { const key = JSON.stringify(st); if (key !== g.userData.k) { g.userData.k = key; state = st; t.redraw(); } },
        update(show, dt = 1 / 30) {
          k += ((show ? 1 : 0) - k) * Math.min(1, dt * 7);
          const d = 0.9, hh = Math.tan(cam.fov * Math.PI / 360) * d, ww = hh * cam.aspect, sc = hh * 0.95 / 0.6;
          g.scale.setScalar(sc); g.position.set(ww - 0.17 * sc - hh * 0.06, -hh - 0.62 * sc + k * (0.62 * sc + hh * 0.06), -d); g.visible = k > 0.01;
        },
      };
    }
    // the usual lock screen with one alert card on it
    function alertScreen(c, w, h, a) {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#22344a'); gr.addColorStop(1, '#0d1a26'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,.92)'; c.font = '600 54px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText(a && a.time || '18:45', w / 2, 110);
      c.font = '600 18px Nunito, sans-serif'; c.fillStyle = 'rgba(255,255,255,.7)'; c.fillText('Saturday', w / 2, 140);
      if (!a) return;
      const x0 = 12, y0 = 176, ww = w - 24, hh = 118;
      c.fillStyle = 'rgba(255,255,255,.97)'; c.beginPath(); if (c.roundRect) c.roundRect(x0, y0, ww, hh, 20); else c.rect(x0, y0, ww, hh); c.fill();
      c.fillStyle = a.color || '#c93131'; c.beginPath(); if (c.roundRect) c.roundRect(x0 + 12, y0 + 14, 30, 30, 8); else c.rect(x0 + 12, y0 + 14, 30, 30); c.fill();
      c.textAlign = 'left'; c.fillStyle = '#526170'; c.font = '700 15px Nunito, sans-serif'; c.fillText((a.app || 'HOME') + ' · now', x0 + 52, y0 + 34);
      const fit = (txt, weight, size, y) => { let px = size; do { c.font = `${weight} ${px}px Nunito, sans-serif`; px -= 1; } while (c.measureText(txt).width > ww - 26 && px > 10); c.fillText(txt, x0 + 14, y); };
      c.fillStyle = '#15202a'; fit(a.title, 800, 21, y0 + 72);
      c.fillStyle = '#334452'; fit(a.text, 600, 16, y0 + 96);
      if (a.text2) fit(a.text2, 600, 16, y0 + 114);
    }
    // a small grey box on a wall that holds the ESP32 (lid open so the board shows)
    function espBox(s, x, y, z, ry = 0, sc = 2.2) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; s.add(g);
      rbox(g, 0.16, 0.12, 0.05, 0.01, mat(0xd9dcdf, { roughness: 0.5 }), 0, 0, 0.025);
      const b = esp32(g, 0, -0.012, 0.055, sc); b.g.rotation.x = Math.PI / 2; b.g.rotation.z = 0;
      return b;
    }
    const steel = mat(0x5b636b, { metalness: 0.8, roughness: 0.35 });

    /* ---------- 1. gate doorbell ---------- */
    function gate() {
      const R = yard({ sunPos: [5, 8, 6] }), s = R.s;
      const cam = camera([2.9, 1.6, 4.4], [0.3, 1.2, -0.6], 42);
      // the compound wall (plastered, with a terracotta cap) and a blue metal gate
      const wallM = mat(0xffffff, { map: plasterTex('#efe2c9'), roughness: 0.9 }), cap = mat(0xb4562e, { roughness: 0.8 });
      for (const [x0, x1] of [[-6, -1.1], [1.1, 6]]) { add(s, new THREE.BoxGeometry(x1 - x0, 2.2, 0.22), wallM, (x0 + x1) / 2, 1.1, -1); add(s, new THREE.BoxGeometry(x1 - x0 + 0.04, 0.08, 0.3), cap, (x0 + x1) / 2, 2.24, -1); }
      for (const x of [-1.2, 1.2]) { rbox(s, 0.3, 2.5, 0.32, 0.02, wallM, x, 1.25, -1); rbox(s, 0.36, 0.08, 0.38, 0.01, cap, x, 2.54, -1); }
      const gateM = mat(0x1f4e79, { metalness: 0.6, roughness: 0.4 });
      for (const sx of [-1, 1]) {
        const leaf = new THREE.Group(); leaf.position.set(sx * 0.525, 0, -1); s.add(leaf);
        box(leaf, 1.03, 2.1, 0.04, gateM, 0, 1.12, 0);
        for (let i = 0; i < 7; i++) box(leaf, 0.035, 2.0, 0.03, mat(0x2a649a, { metalness: 0.6, roughness: 0.35 }), -0.45 + i * 0.15, 1.12, 0.03);
        box(leaf, 1.03, 0.06, 0.05, mat(0x2a649a, { metalness: 0.6, roughness: 0.35 }), 0, 1.6, 0.035);
      }
      // the house roof and banana trees behind the wall
      const hs = house(s, { x: -0.5, z: -5, w: 8, h: 3.0 }); void hs;
      banana(s, -3.2, -2.6, 2.6, 0.3); banana(s, 3.6, -2.4, 2.3, 1.1); banana(s, 5.2, -3.2, 2.8, 2.0);
      // the doorbell button and the ESP32 box beside the gate, the light on the pillar
      const btn = new THREE.Group(); btn.position.set(1.45, 1.3, -0.88); s.add(btn);
      rbox(btn, 0.09, 0.13, 0.03, 0.01, mat(0x2b2f35, { roughness: 0.5 }), 0, 0, 0.015);
      const ring = glow(0x3fa9ff); cyl(btn, 0.024, 0.024, 0.02, ring, 0, 0.01, 0.035, 20).rotation.x = Math.PI / 2;
      const ringHalo = glowDot(btn, 0x3fa9ff, 0.12, 0, 0.01, 0.06);
      const b = espBox(s, 1.48, 0.95, -0.89); setLed(b, 0x34c759, true);
      cable(s, [[1.45, 1.22, -0.87], [1.47, 1.05, -0.87]], 0x30343a, 0.004);
      const lampM = glow(0xffe2a8); const lamp = new THREE.Group(); lamp.position.set(1.2, 2.62, -0.95); s.add(lamp);
      rbox(lamp, 0.16, 0.12, 0.16, 0.02, steel, 0, 0.06, 0); sph(lamp, 0.06, lampM, 0, 0, 0, false);
      const lampHalo = glowDot(lamp, 0xffd27a, 0.7, 0, 0, 0.05);
      const spot = new THREE.PointLight(0xffd9a0, 0, 5, 2); spot.position.set(1.2, 2.5, -0.7); s.add(spot);
      const visitor = walker(s);
      const ph = hudPhone(s, cam, alertScreen);
      return { s, cam, period: 9, ready: visitor.ready, update(t) {
        // the visitor walks up (0–2.6 s), presses the bell (3 s) and waits; the house knows at once
        const x = t < 2.6 ? lerp(5.5, 1.5, t / 2.6) : 1.5;
        visitor.set(x, 0.05, t < 2.6 ? -Math.PI / 2 : lerp(-Math.PI / 2, Math.PI, ease((t - 2.6) / 0.5)), t < 2.6, t);
        const rang = t > 3.0 && t < 8.6;
        ring.emissiveIntensity = rang ? 3 : 0.6; ringHalo.material.opacity = rang ? 0.9 : 0.2;
        lampM.emissiveIntensity = rang ? 3 : 0; lampHalo.material.opacity = rang ? 0.85 : 0; spot.intensity = rang ? 2.2 : 0;
        setLed(b, rang ? 0x2a9dff : 0x34c759, rang ? Math.floor(t * 4) % 2 === 0 : true);
        ph.set(rang ? { title: 'Someone is at the gate', text: 'The gate light is on.', app: 'GATE', color: '#2a7fd0' } : null);
        ph.update(rang && t > 3.3);
      } };
    }

    /* ---------- 2. Cash Power watcher ---------- */
    function power() {
      const R = room({ bg: 0x27303a, wall: 0xe8e1d4, hemi: 0.3, key: 0.7, keyPos: [-2, 3.5, 3] }), s = R.s;
      const cam = camera([0.95, 1.42, 0.55], [0.12, 1.22, -1.38], 44);
      // the prepaid electricity meter on the wall: a keypad, a screen and a red light that blinks with every bit of energy used
      const meter = new THREE.Group(); meter.position.set(0.15, 1.35, -1.38); s.add(meter);
      rbox(meter, 0.2, 0.3, 0.08, 0.015, mat(0xdfe6ea, { roughness: 0.4 }), 0, 0, 0.04);
      rbox(meter, 0.19, 0.11, 0.01, 0.01, mat(0x1d5aa8, { roughness: 0.4 }), 0, 0.085, 0.082);
      let units = 0;
      const lcd = canvasTex(160, 64, (g, w, h) => { g.fillStyle = units < 5 ? '#c9d48a' : '#a9d8a4'; g.fillRect(0, 0, w, h); g.fillStyle = '#18240f'; g.font = '700 30px monospace'; g.textAlign = 'right'; g.fillText(units.toFixed(1), w - 52, 42); g.font = '700 18px monospace'; g.fillText('kWh', w - 6, 42); });
      const lcdM = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.06), new THREE.MeshBasicMaterial({ map: lcd, toneMapped: false })); lcdM.position.set(0, 0.085, 0.088); meter.add(lcdM);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) rbox(meter, 0.035, 0.025, 0.012, 0.006, mat(0xf4f5f6, { roughness: 0.5 }), -0.045 + c * 0.045, -0.015 - r * 0.033, 0.084);
      const pulse = glow(0xff3b30); sph(meter, 0.006, pulse, 0.075, -0.125, 0.082, false);
      const pulseHalo = glowDot(meter, 0xff3b30, 0.06, 0.075, -0.125, 0.09);
      // a light sensor in a small black cap sits over that red light, wired to the ESP32 box beside the meter
      cyl(meter, 0.012, 0.012, 0.02, mat(0x15181b), 0.075, -0.125, 0.092, 16).rotation.x = Math.PI / 2;
      const b = espBox(s, 0.45, 1.3, -1.38);
      cable(s, [[0.225, 1.225, -1.28], [0.3, 1.2, -1.3], [0.4, 1.27, -1.33]], 0x15181b, 0.003);
      // a TV on a stand and the sofa: the home using electricity
      const stand = woodTop(0xcfb08c); rbox(s, 1.3, 0.45, 0.4, 0.01, stand, -1.0, 0.225, -1.15);
      rbox(s, 1.1, 0.64, 0.05, 0.01, mat(0x15181b, { roughness: 0.3, metalness: 0.3 }), -1.0, 0.82, -1.25);
      const tvScr = canvasTex(256, 144, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b7fd6'); gr.addColorStop(1, '#1a9c6b'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '800 26px Nunito, sans-serif'; g.fillText('Football ⚽ 2 – 1', 18, 80); });
      const tv = add(s, new THREE.PlaneGeometry(1.04, 0.58), new THREE.MeshBasicMaterial({ map: tvScr, toneMapped: false }), -1.0, 0.82, -1.222, false);
      const ph = hudPhone(s, cam, alertScreen);
      const ready = model('sofa').then(({ root }) => place(root, -0.9, 0, 0.55, Math.PI, 0.95) && s.add(root));
      return { s, cam, period: 10, ready, update(t) {
        // units go down while the TV and lights are on; under 5 kWh the family gets a warning; at 8 s they top up
        const u = t < 8 ? 6.2 - t * 0.28 : 25.0;
        if (Math.abs(u - units) > 0.049) { units = u; lcd.redraw(); }
        const blink = (t * 3.2) % 1 < 0.18; pulse.emissiveIntensity = blink ? 4 : 0.1; pulseHalo.material.opacity = blink ? 0.9 : 0;
        const low = units < 5 && t < 8, topped = t >= 8;
        setLed(b, low ? 0xffb400 : 0x34c759, low ? Math.floor(t * 4) % 2 === 0 : true);
        ph.set(low ? { title: 'Cash Power is low', text: `${units.toFixed(1)} kWh left.`, text2: 'Top up before the lights go out.', app: 'POWER', color: '#e09b00' }
          : topped ? { title: 'Topped up: 25 kWh', text: 'Thank you! Power is safe.', app: 'POWER', color: '#16834a' } : null);
        ph.update(low || topped);
        tv.material.color.setScalar(0.85 + 0.15 * Math.sin(t * 5));
      } };
    }

    /* ---------- 3. solar security light ---------- */
    function solar() {
      const R = yard({ hills: hillsTex(true), dusk: true, sun: 1.2, sunPos: [-6, 4, 4] }), s = R.s;
      const cam = camera([3.8, 1.7, 4.8], [-0.2, 1.3, -1.4], 42);
      const h = house(s, { x: 0, z: -1.6, w: 7, h: 2.8, wall: '#e3d5bd', roof: '#5f6b75' });
      // a steel door, a window with burglar bars, the lamp above the door
      rbox(h, 0.9, 2.0, 0.06, 0.01, mat(0x2d4a63, { metalness: 0.5, roughness: 0.4 }), -0.6, 1.0, 0.14);
      rbox(h, 1.1, 0.9, 0.04, 0.01, mat(0x1b2733, { roughness: 0.1, metalness: 0.4 }), 1.4, 1.5, 0.13);
      for (let i = 0; i < 6; i++) cyl(h, 0.008, 0.008, 0.9, steel, 0.95 + i * 0.18, 1.5, 0.17, 8);
      const lampM = glow(0xfff0c8); const lamp = new THREE.Group(); lamp.position.set(-0.6, 2.35, 0.2); h.add(lamp);
      rbox(lamp, 0.28, 0.08, 0.18, 0.02, steel, 0, 0, 0); box(lamp, 0.24, 0.02, 0.14, lampM, 0, -0.045, 0, false);
      const lampHalo = glowDot(lamp, 0xffe2a8, 1.4, 0, -0.08, 0.1);
      const light = new THREE.SpotLight(0xffe7c0, 0, 9, 0.9, 0.6, 1.5); light.position.set(-0.6, 2.3, -1.3); light.target.position.set(-0.4, 0, 0.8); light.castShadow = true; light.shadow.mapSize.set(1024, 1024); s.add(light); s.add(light.target);
      // the solar panel on the roof, the battery box with its four charge lights, and the light sensor
      const panel = new THREE.Group(); panel.position.set(1.6, 3.3, -2.1); panel.rotation.x = -0.6; s.add(panel);
      const cells = canvasTex(256, 160, (g, w, hh) => { g.fillStyle = '#c9ced4'; g.fillRect(0, 0, w, hh); for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { g.fillStyle = '#16264a'; g.fillRect(4 + i * 42, 4 + j * 39, 39, 36); g.fillStyle = 'rgba(120,160,230,.25)'; g.fillRect(4 + i * 42, 4 + j * 39, 39, 2); } });
      box(panel, 1.4, 0.04, 0.9, mat(0xffffff, { map: cells, roughness: 0.2, metalness: 0.4 }), 0, 0, 0);
      const bat = new THREE.Group(); bat.position.set(0.55, 1.15, -1.45); s.add(bat);
      rbox(bat, 0.3, 0.22, 0.12, 0.015, mat(0x2b2f35, { roughness: 0.5 }), 0, 0, 0.06);
      const bars = [0, 1, 2, 3].map((i) => { const m = glow(0x34c759); box(bat, 0.04, 0.025, 0.01, m, -0.075 + i * 0.05, 0.05, 0.125, false); return m; });
      const b = espBox(s, 0.55, 0.85, -1.45);
      const ldr = sph(s, 0.03, phys(0xffffff, { roughness: 0.2 }), 0.1, 2.55, -1.42);
      const visitor = walker(s);
      return { s, cam, period: 10, ready: visitor.ready, update(t) {
        // sunset (0–3 s); in the dark the lamp glows softly; someone walks in (5–7.5 s): full brightness; then soft again
        const night = clamp01((t - 1) / 2.5);
        R.sun.intensity = 1.2 * (1 - night) + 0.05; R.hemi.intensity = 0.5 - 0.38 * night;
        s.background.setRGB(lerp(0.45, 0.04, night), lerp(0.55, 0.06, night), lerp(0.75, 0.16, night));
        R.sky.material.color.setScalar(1 - 0.72 * night);
        const x = t < 5 ? 6 : t < 7.5 ? lerp(6, 0.0, (t - 5) / 2.5) : t < 8.5 ? 0.0 : lerp(0.0, -6, (t - 8.5) / 1.5);
        visitor.set(x, 0.6, t < 8.5 ? -Math.PI / 2 : -Math.PI / 2, !(t > 7.5 && t < 8.5), t, t > 5);
        const near = t > 5.6 && t < 9.4;
        const k = night < 0.8 ? 0 : near ? 1 : 0.45;
        lampM.emissiveIntensity = 4 * k; lampHalo.material.opacity = 0.9 * Math.min(1, k * 1.6); light.intensity = 3.2 * k;
        ldr.material.emissive = ldr.material.emissive || new THREE.Color(); ldr.material.emissive.setHex(0x222222);
        const level = t < 3 ? 4 : 3; bars.forEach((m, i) => { m.emissiveIntensity = i < level ? 2.5 : 0.02; });
        setLed(b, k > 0.5 ? 0xffd27a : night > 0.8 ? 0x2a9dff : 0x34c759, true);
      } };
    }

    /* ---------- 4. rain tank and automatic pump ---------- */
    function tank() {
      const R = yard({ sunPos: [6, 9, 4] }), s = R.s;
      const cam = camera([3.4, 2.2, 4.6], [0.1, 1.6, -0.8], 42);
      house(s, { x: -2.2, z: -1.9, w: 5, h: 2.8, wall: '#e9dcc4' });
      banana(s, 3.6, -2.8, 2.6, 0.7); banana(s, -5, -0.8, 2.4, 1.9);
      // a brick tower with a black ribbed water tank on top
      const brick = mat(0xffffff, { map: tex('brick.jpg', [1, 1]), roughness: 1 });
      box(s, 1.4, 1.6, 1.4, brick, 0.9, 0.8, -1.1);
      const prof = []; for (let i = 0; i <= 20; i++) { const y = i / 20 * 1.6; prof.push(new THREE.Vector2(0.62 + (i % 4 === 0 ? 0.03 : 0), y)); }
      prof.push(new THREE.Vector2(0.45, 1.72), new THREE.Vector2(0.12, 1.75), new THREE.Vector2(0, 1.75));
      add(s, new THREE.LatheGeometry(prof, 40), mat(0x1c2024, { roughness: 0.6 }), 0.9, 1.6, -1.1);
      cyl(s, 0.14, 0.14, 0.06, mat(0x1c2024, { roughness: 0.5 }), 0.9, 3.38, -1.1, 20);
      // the level lights on the tower (blue: how full), the float sensor's ESP32 box, the tap and a jerrycan
      const lv = new THREE.Group(); lv.position.set(0.9, 1.0, -0.39); s.add(lv);
      rbox(lv, 0.14, 0.42, 0.04, 0.01, mat(0xf2f3f4, { roughness: 0.4 }), 0, 0, 0.02);
      const lvl = [0, 1, 2, 3].map((i) => { const m = glow(0x2a9dff); rbox(lv, 0.08, 0.06, 0.01, 0.01, m, 0, -0.14 + i * 0.095, 0.045); return m; });
      const b = espBox(s, 0.9, 0.42, -0.39);
      const pipeM = mat(0xdfe3e6, { roughness: 0.4 });
      add(s, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.9, 1.6, -0.48), V(0.9, 1.25, -0.3), V(0.9, 0.55, -0.25)]), 20, 0.025, 10, false), pipeM);
      cyl(s, 0.03, 0.02, 0.1, mat(0xc9a35a, { metalness: 0.9, roughness: 0.3 }), 0.9, 0.5, -0.22, 12);
      jerrycan(s, 0.85, 0, -0.1, 0.2);
      const fill = [0, 1, 2].map(() => sph(s, 0.012, phys(0x4ea3e6, { roughness: 0.05 }), 0.9, 0.45, -0.22, false));
      // the pump on the ground and the pipe that climbs to the top of the tank
      const pump = new THREE.Group(); pump.position.set(2.3, 0, -0.4); s.add(pump);
      rbox(pump, 0.4, 0.25, 0.25, 0.03, mat(0x1d5aa8, { roughness: 0.4, metalness: 0.3 }), 0, 0.15, 0); cyl(pump, 0.11, 0.11, 0.3, mat(0x2a6fd6, { metalness: 0.5, roughness: 0.3 }), -0.2, 0.15, 0, 20).rotation.z = Math.PI / 2;
      const up = new THREE.CatmullRomCurve3([V(2.3, 0.28, -0.4), V(2.3, 1.2, -0.7), V(2.0, 3.0, -1.0), V(1.5, 3.4, -1.1), V(1.25, 3.3, -1.1)]);
      add(s, new THREE.TubeGeometry(up, 60, 0.03, 10, false), mat(0x2b2f35, { roughness: 0.5 }));
      const flow = [0, 1, 2, 3, 4, 5].map(() => sph(s, 0.03, phys(0x4ea3e6, { roughness: 0.05 }), 0, 0, 0, false));
      const ph = hudPhone(s, cam, alertScreen);
      return { s, cam, period: 10, update(t) {
        // the family fills a jerrycan and the level drops; at one light the pump starts and fills the tank; full: pump off
        const level = t < 3 ? lerp(0.45, 0.2, t / 3) : t < 8 ? lerp(0.2, 1, (t - 3) / 5) : 1;
        const pumping = t >= 3 && t < 8;
        const n = Math.max(1, Math.ceil(level * 4 - 0.01));
        lvl.forEach((m, i) => { m.emissiveIntensity = i < n ? 2.5 : 0.03; });
        flow.forEach((d, i) => { d.visible = pumping; if (pumping) d.position.copy(up.getPoint(((t * 0.7) + i / 6) % 1)); });
        fill.forEach((d, i) => { d.visible = t < 3; d.position.y = 0.45 - (((t * 1.8) + i / 3) % 1) * 0.1; });
        pump.children[1].rotation.x = pumping ? t * 20 : 0;
        setLed(b, pumping ? 0x2a9dff : 0x34c759, true);
        ph.set(pumping ? { title: 'Water is low', text: 'The pump is filling the tank.', app: 'WATER', color: '#2a7fd0' } : t >= 8 ? { title: 'Tank full', text: 'The pump switched itself off.', app: 'WATER', color: '#16834a' } : null);
        ph.update(t > 3.3);
      } };
    }

    /* ---------- 5. charcoal kitchen smoke alarm ---------- */
    function smoke() {
      const R = room({ bg: 0xe9e4dc, wall: 0xcbb89a, hemi: 0.4, key: 1.2, keyPos: [2, 3.5, 3], back: 1.1, window: [0.95, 1.6, 0.7, 0.6] }), s = R.s;
      R.s.children.filter((o) => o.isMesh && o.geometry.parameters && o.geometry.parameters.depth === 5 && o.position.y < 0).forEach((o) => { o.material = mat(0x9a948a, { roughness: 0.9 }); }); // a concrete floor
      const cam = camera([0.95, 1.15, 1.3], [-0.25, 0.85, -0.75], 44);
      const shelf = woodTop(0x9c7a55); rbox(s, 1.0, 0.03, 0.25, 0.005, shelf, -1.2, 1.25, -0.96);
      [[-1.55, 0x9aa3ab, 0.09], [-1.3, 0xc9cdd1, 0.11], [-1.02, 0xb8603a, 0.08], [-0.8, 0xe8e4dc, 0.06]].forEach(([x, c, r2]) => cyl(s, r2, r2 * 0.9, r2 * 1.1, mat(c, { metalness: c === 0xc9cdd1 || c === 0x9aa3ab ? 0.8 : 0, roughness: 0.4 }), x, 1.265 + r2 * 0.55, -0.96, 24));
      jerrycan(s, -1.0, 0, -0.75, 0.4);
      const stool = woodTop(0x8a6a48); cyl(s, 0.16, 0.16, 0.03, stool, 0.45, 0.32, -0.2, 24); for (let i = 0; i < 3; i++) { const a = i * 2.1; cyl(s, 0.015, 0.015, 0.31, stool, 0.45 + Math.cos(a) * 0.11, 0.155, -0.2 + Math.sin(a) * 0.11, 8); }
      // the charcoal stove (imbabura) with glowing charcoal and a cooking pot on top
      const stove = new THREE.Group(); stove.position.set(-0.3, 0, -0.55); s.add(stove);
      const prof = [[0, 0.12], [0.17, 0.12], [0.2, 0.2], [0.2, 0.36], [0.17, 0.38], [0.16, 0.36]].map(([r, y]) => new THREE.Vector2(r, y));
      add(stove, new THREE.LatheGeometry(prof, 32), mat(0x3a3d40, { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }), 0, 0, 0);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; cyl(stove, 0.012, 0.012, 0.13, steel, Math.cos(a) * 0.15, 0.065, Math.sin(a) * 0.15, 8); }
      const coalM = glow(0xff5a1f, { roughness: 0.9 }); for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = rnd() * 0.12; const c = sph(stove, 0.035, i % 3 ? mat(0x1a1a1a, { roughness: 1 }) : coalM, Math.cos(a) * r, 0.33, Math.sin(a) * r, false); c.scale.y = 0.6; }
      const ember = new THREE.PointLight(0xff6a2a, 1.2, 1.5, 2); ember.position.set(0, 0.45, 0); stove.add(ember);
      const potP = [[0, 0], [0.19, 0], [0.2, 0.02], [0.2, 0.2], [0.21, 0.21], [0.2, 0.21]].map(([r, y]) => new THREE.Vector2(r, y));
      add(stove, new THREE.LatheGeometry(potP, 32), mat(0xc9cdd1, { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), 0, 0.38, 0);
      // the smoke sensor (MQ-2: blue board, metal mesh can) on the wall, the buzzer, the wall fan
      const sens = new THREE.Group(); sens.position.set(0.35, 1.55, -1.08); s.add(sens);
      rbox(sens, 0.08, 0.06, 0.01, 0.004, mat(0x1d5aa8, { roughness: 0.45 }), 0, 0, 0.01);
      cyl(sens, 0.02, 0.02, 0.025, mat(0xb9bec2, { metalness: 0.8, roughness: 0.4 }), 0, 0, 0.025, 16).rotation.x = Math.PI / 2;
      const b = espBox(s, 0.35, 1.38, -1.08);
      const rings = [0, 1, 2].map(() => add(s, new THREE.TorusGeometry(0.05, 0.003, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0, toneMapped: false }), 0.35, 1.38, -1.0, false));
      const fan = new THREE.Group(); fan.position.set(-0.9, 1.85, -1.08); s.add(fan);
      rbox(fan, 0.36, 0.36, 0.06, 0.03, mat(0xf2f3f4, { roughness: 0.4 }), 0, 0, 0.03);
      add(fan, new THREE.TorusGeometry(0.15, 0.008, 8, 40), steel, 0, 0, 0.065);
      const blades = new THREE.Group(); blades.position.z = 0.06; fan.add(blades);
      for (let i = 0; i < 4; i++) { const bl = box(blades, 0.13, 0.05, 0.005, mat(0xc9ced4, { roughness: 0.4 }), 0.07, 0, 0); bl.geometry.translate(0, 0, 0); bl.rotation.z = 0; const p = new THREE.Group(); p.rotation.z = i * Math.PI / 2; blades.add(p); p.add(bl); }
      const puffs = []; for (let i = 0; i < 24; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0x8d8f92, transparent: true, opacity: 0, depthWrite: false })); sp.userData = { o: rnd(), dx: rnd() - 0.5, dz: rnd() - 0.5 }; s.add(sp); puffs.push(sp); }
      const ph = hudPhone(s, cam, alertScreen);
      return { s, cam, period: 9, update(t) {
        // smoke builds up (0–4 s); the sensor sounds the alarm and switches on the fan; the smoke is pulled out (5–8 s)
        const level = t < 4 ? t / 4 : t < 5 ? 1 : clamp01(1 - (t - 5) / 3);
        const alarm = t > 3 && t < 7.5;
        puffs.forEach((p) => { const u = p.userData, k = (t * 0.25 + u.o) % 1, toFan = alarm ? clamp01((t - 4) / 2) : 0;
          p.position.set(lerp(-0.3 + u.dx * 0.3 * k, -0.9, toFan * k), 0.6 + k * 1.3, lerp(-0.55 + u.dz * 0.3, -1.0, toFan * k));
          p.scale.setScalar(0.15 + k * 0.45); p.material.opacity = 0.42 * level * Math.sin(Math.PI * k); });
        rings.forEach((r, i) => { const f = ((t * 1.6) + i / 3) % 1; r.scale.setScalar(1 + f * 2.5); r.material.opacity = alarm ? 0.85 * (1 - f) : 0; });
        blades.rotation.z = t > 3.5 ? -(t - 3.5) * 25 : 0;
        ember.intensity = 1.0 + Math.sin(t * 9) * 0.25; coalM.emissiveIntensity = 1.6 + Math.sin(t * 7) * 0.4;
        setLed(b, alarm ? 0xff3b30 : 0x34c759, alarm ? Math.floor(t * 6) % 2 === 0 : true);
        ph.set(alarm ? { title: 'Smoke in the kitchen!', text: 'The fan is on. Open the door', text2: 'and check the stove.', app: 'KITCHEN', color: '#c93131' } : null);
        ph.update(alarm && t > 3.4);
      } };
    }

    /* ---------- 6. smart garden watering ---------- */
    function garden() {
      const R = yard({ sunPos: [5, 9, 6] }), s = R.s;
      const cam = camera([2.1, 1.35, 2.3], [-0.35, 0.35, -0.45], 42);
      banana(s, -4.2, -1.6, 2.4, 0.2); banana(s, -5.2, -0.2, 2.2, 1.4);
      house(s, { x: 2.0, z: -6.5, w: 6, h: 2.8, wall: '#e9dcc4', roof: '#7b2f2a' });
      // two raised beds of beans with a black drip pipe along each row
      const bedSoil = mat(0xffffff, { map: soilTex, roughness: 1 }), dry = C(0xd08a5c), wet = C(0x7a3a1d);
      const beds = [];
      for (const z of [-0.9, 0.2]) {
        const bed = rbox(s, 2.6, 0.22, 0.75, 0.04, mat(0xffffff, { map: soilTex, roughness: 1 }), -0.4, 0.11, z); beds.push(bed);
        add(s, new THREE.TubeGeometry(new THREE.LineCurve3(V(-1.7, 0.24, z), V(0.9, 0.24, z)), 4, 0.012, 8, false), mat(0x15181b, { roughness: 0.5 }));
      }
      void bedSoil;
      const plants = [], leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.05, 0.04, 0.11, 0); leafShape.quadraticCurveTo(0.05, -0.04, 0, 0);
      const lg = new THREE.ShapeGeometry(leafShape, 8); lg.rotateX(-Math.PI / 2);
      const beanM = mat(0x4f9a3c, { roughness: 0.55, side: THREE.DoubleSide }), stemM = mat(0x5f8a3a, { roughness: 0.7 });
      for (const z of [-0.9, 0.2]) for (let i = 0; i < 8; i++) {
        const p = new THREE.Group(); p.position.set(-1.55 + i * 0.32, 0.22, z + (i % 2 ? 0.12 : -0.12)); p.scale.setScalar(1.9); s.add(p); plants.push(p); p.userData.s = 1.9;
        cyl(p, 0.006, 0.008, 0.28, stemM, 0, 0.14, 0, 6);
        for (let k = 0; k < 9; k++) { const l = add(p, lg, beanM, 0, 0.1 + (k % 3) * 0.07, 0); l.rotation.set(0.2 + (k % 3) * 0.15, k * 2.4, 0.25); }
      }
      // the rain tank at the end of the beds, the valve box, the soil sensor and the ESP32 on a post
      const prof = []; for (let i = 0; i <= 16; i++) prof.push(new THREE.Vector2(0.45 + (i % 4 === 0 ? 0.025 : 0), i / 16 * 1.2)); prof.push(new THREE.Vector2(0.1, 1.28), new THREE.Vector2(0, 1.28));
      add(s, new THREE.LatheGeometry(prof, 36), mat(0x2f6b3a, { roughness: 0.55 }), 1.6, 0, -0.35);
      rbox(s, 0.16, 0.12, 0.12, 0.02, mat(0x1d5aa8, { roughness: 0.4 }), 1.08, 0.2, -0.35);
      add(s, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(1.16, 0.2, -0.35), V(1.0, 0.24, -0.9), V(0.9, 0.24, -0.9)]), 20, 0.012, 8, false), mat(0x15181b));
      add(s, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(1.0, 0.2, -0.35), V(0.95, 0.24, 0.2), V(0.9, 0.24, 0.2)]), 20, 0.012, 8, false), mat(0x15181b));
      box(s, 0.06, 0.9, 0.06, mat(0x6a4a2c, { roughness: 0.8 }), 1.15, 0.45, 0.65);
      const b = espBox(s, 1.15, 0.85, 0.69, 0, 2.2);
      rbox(s, 0.02, 0.12, 0.004, 0.003, mat(0x1d5aa8), 0.6, 0.27, 0.32);
      cable(s, [[0.6, 0.33, 0.32], [0.85, 0.35, 0.5], [1.12, 0.8, 0.69]], 0x15181b, 0.004);
      const drips = []; for (const z of [-0.9, 0.2]) for (let i = 0; i < 8; i++) drips.push(sph(s, 0.01, phys(0x4ea3e6, { roughness: 0.05 }), -1.55 + i * 0.32, 0.23, z, false));
      const ph = hudPhone(s, cam, alertScreen);
      return { s, cam, period: 9, update(t) {
        // the soil dries in the sun (0–3 s); the sensor opens the valve: drips along every row (3–6.5 s); wet soil, happy beans
        const m = t < 3 ? 1 - t / 3 * 0.85 : t < 6.5 ? lerp(0.15, 1, (t - 3) / 3.5) : 1;
        const watering = t >= 3 && t < 6.5;
        beds.forEach((bd) => bd.material.color.copy(dry).lerp(wet, ease(m)));
        plants.forEach((p, i) => { p.scale.y = p.userData.s * lerp(0.82, 1, ease(m)); p.rotation.z = lerp(0.18, 0, ease(m)) * (i % 2 ? 1 : -1); });
        drips.forEach((d, i) => { d.visible = watering; d.position.y = 0.23 - ((t * 1.5 + i * 0.13) % 1) * 0.02; d.scale.setScalar(0.6 + ((t * 1.5 + i * 0.13) % 1)); });
        setLed(b, watering ? 0x2a9dff : m < 0.35 ? 0xff3b30 : 0x34c759, true);
        ph.set(watering ? { title: 'Garden is thirsty', text: 'Watering the beans from', text2: 'the rain tank.', app: 'GARDEN', color: '#2a7fd0' } : null);
        ph.update(watering && t > 3.3);
      } };
    }

    /* ---------- 7. football goal counter ---------- */
    function football() {
      const R = yard({ sunPos: [-5, 9, 6] }), s = R.s;
      const cam = camera([3.0, 1.6, 3.9], [0.0, 0.95, -1.6], 44);
      const grass = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#5f9a3f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,90,30' : '140,170,80'},.25)`; g.fillRect(rnd() * w, rnd() * h, 1, 3); } for (let i = 0; i < 30; i++) { const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 20, gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(165,81,43,.55)'); gr.addColorStop(1, 'rgba(165,81,43,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } }, [6, 6]);
      const pitch = add(s, new THREE.PlaneGeometry(14, 12), mat(0xffffff, { map: grass, roughness: 0.95 }), 0, 0.005, 1, false); pitch.rotation.x = -Math.PI / 2;
      const lineM = mat(0xf4f4f0, { roughness: 0.6 });
      box(s, 5.2, 0.006, 0.08, lineM, -0.4, 0.01, -1.6, false); box(s, 0.08, 0.006, 1.8, lineM, -2.96, 0.01, -0.7, false); box(s, 0.08, 0.006, 1.8, lineM, 2.16, 0.01, -0.7, false); box(s, 5.2, 0.006, 0.08, lineM, -0.4, 0.01, 0.2, false);
      // the goal: white posts and crossbar, a net of thin cords
      const post = mat(0xf7f7f5, { roughness: 0.4 }), gw = 3.0, gh = 1.6, gx = -0.4, gz = -1.6;
      cyl(s, 0.045, 0.045, gh, post, gx - gw / 2, gh / 2, gz, 16); cyl(s, 0.045, 0.045, gh, post, gx + gw / 2, gh / 2, gz, 16);
      cyl(s, 0.045, 0.045, gw + 0.09, post, gx, gh, gz, 16).rotation.z = Math.PI / 2;
      const netM = new THREE.LineBasicMaterial({ color: 0xe8ecef, transparent: true, opacity: 0.7 }), pts = [];
      for (let i = 0; i <= 15; i++) { const x = gx - gw / 2 + i * gw / 15; pts.push(V(x, gh, gz), V(x, 0, gz - 0.9), V(x, gh, gz), V(x, gh, gz - 0.5)); }
      for (let j = 0; j <= 8; j++) { const y = j * gh / 8, zz = gz - 0.9 * (1 - y / gh) - 0.5 * (y / gh) * 0; pts.push(V(gx - gw / 2, y, zz), V(gx + gw / 2, y, zz)); }
      s.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), netM));
      // the goal sensor: an infrared beam across the goal mouth, a little box on each post
      for (const sx of [-1, 1]) rbox(s, 0.08, 0.08, 0.06, 0.01, mat(0x2b2f35, { roughness: 0.5 }), gx + sx * (gw / 2 + 0.08), 0.3, gz + 0.02);
      const beam = box(s, gw, 0.008, 0.008, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, toneMapped: false }), gx, 0.3, gz + 0.02, false);
      const b = espBox(s, gx + gw / 2 + 0.09, 0.55, gz + 0.05, 0, 2.2);
      // the scoreboard on a stand beside the pitch
      let score = [0, 0];
      const board = canvasTex(320, 160, (g, w, h) => {
        g.fillStyle = '#0d1418'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#9fb3c4'; g.font = '800 22px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('BLUE', w * 0.25, 34); g.fillText('RED', w * 0.75, 34);
        g.fillStyle = '#ffcf33'; g.font = '800 82px monospace'; g.fillText(String(score[0]), w * 0.25, 120); g.fillText(String(score[1]), w * 0.75, 120);
        g.fillStyle = '#ffcf33'; g.fillRect(w / 2 - 6, 70, 12, 12); g.fillRect(w / 2 - 6, 96, 12, 12);
      });
      const sb = new THREE.Group(); sb.position.set(2.0, 0, -1.9); sb.rotation.y = -0.35; s.add(sb);
      for (const x of [-0.45, 0.45]) cyl(sb, 0.03, 0.03, 1.4, steel, x, 0.7, 0, 10);
      rbox(sb, 1.2, 0.62, 0.08, 0.02, mat(0x1d2328, { roughness: 0.4 }), 0, 1.65, 0);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: board, toneMapped: false })); scr.position.set(0, 1.65, 0.042); sb.add(scr);
      banana(s, -5.5, -3.6, 2.6, 0.4); banana(s, 4.6, -4.2, 2.4, 1.5);
      // the ball: a white ball with dark patches, kicked into the goal twice
      const ballTex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1d20'; for (let i = 0; i < 12; i++) { const x = (i % 6) * w / 6 + (i < 6 ? 0 : w / 12), y = i < 6 ? h * 0.3 : h * 0.72; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); } g.fill(); } });
      const ball = sph(s, 0.11, mat(0xffffff, { map: ballTex, roughness: 0.45 }), 0, 0.11, 2);
      const kicks = [{ t0: 0.6, from: V(1.6, 0.11, 3.2), to: V(-0.9, 0.55, gz - 0.6) }, { t0: 4.6, from: V(-2.4, 0.11, 3.0), to: V(0.3, 0.35, gz - 0.6) }];
      const ph = hudPhone(s, cam, alertScreen);
      return { s, cam, period: 8, update(t) {
        // each kick flies for 1.1 s, crosses the beam, then rolls into the net; the ESP32 adds one to the score
        let k = kicks[0]; if (t >= kicks[1].t0) k = kicks[1];
        const f = clamp01((t - k.t0) / 1.1);
        ball.position.lerpVectors(k.from, k.to, f); ball.position.y = lerp(k.from.y, k.to.y, f) + Math.sin(Math.PI * f) * 0.9; ball.rotation.set(t * 8, t * 5, 0);
        const goals = (t > kicks[0].t0 + 1.0 ? 1 : 0) + (t > kicks[1].t0 + 1.0 ? 1 : 0);
        if (goals !== score[0] || score[1] !== 1) { score = [goals, 1]; board.redraw(); }
        const cross = (t > kicks[0].t0 + 0.85 && t < kicks[0].t0 + 1.2) || (t > kicks[1].t0 + 0.85 && t < kicks[1].t0 + 1.2);
        beam.material.opacity = cross ? 0.08 : 0.55;
        const flash = (t > kicks[0].t0 + 1 && t < kicks[0].t0 + 2) || (t > kicks[1].t0 + 1 && t < kicks[1].t0 + 2);
        setLed(b, flash ? 0xffcf33 : 0x34c759, flash ? Math.floor(t * 6) % 2 === 0 : true);
        ph.set(goals ? { title: 'GOAL! Blue ' + goals + ' – 1 Red', text: 'School match, second half.', app: 'SCORE', color: '#2a7fd0' } : null);
        ph.update(flash);
      } };
    }

    /* ---------- 8. smart bin ---------- */
    function bin() {
      const R = yard({ sunPos: [6, 9, 5] }), s = R.s;
      const cam = camera([1.25, 1.3, 1.55], [-0.3, 0.75, -0.6], 44);
      // a paved pavement along a street, a low wall, banana trees and a house behind
      const paving = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#9b9a95'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { g.fillStyle = `rgb(${170 + rnd() * 20},${168 + rnd() * 18},${160 + rnd() * 16})`; g.fillRect(i * 64 + 2 + (j % 2) * 32, j * 32 + 2, 60, 28); } }, [6, 4]);
      const pave = add(s, new THREE.PlaneGeometry(12, 5), mat(0xffffff, { map: paving, roughness: 0.9 }), 0, 0.01, 0, false); pave.rotation.x = -Math.PI / 2;
      const kerb = box(s, 12, 0.12, 0.2, mat(0xd9d6cf, { roughness: 0.8 }), 0, 0.06, 2.4, false); void kerb;
      const wallM = mat(0xffffff, { map: plasterTex('#efe2c9'), roughness: 0.9 });
      add(s, new THREE.BoxGeometry(12, 1.4, 0.22), wallM, 0, 0.7, -1.5); add(s, new THREE.BoxGeometry(12.04, 0.07, 0.3), mat(0xb4562e, { roughness: 0.8 }), 0, 1.43, -1.5);
      banana(s, -2.4, -2.6, 2.6, 0.5); banana(s, 2.8, -2.8, 2.4, 1.8); house(s, { x: 0.5, z: -5.5, w: 7, h: 2.8, roof: '#5f6b75' });
      const sign = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#1f6b3f'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = '800 46px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText('KEEP OUR CITY CLEAN', w / 2, 62); g.font = '700 26px Nunito, sans-serif'; g.fillStyle = '#cfe8d6'; g.fillText('Use the bin · Thank you', w / 2, 102); });
      add(s, new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 }), -2.05, 0.98, -1.385, false);
      const shrub = mat(0x3f7f35, { roughness: 0.8 }), flower = mat(0xd9534f, { roughness: 0.6 });
      for (let i = 0; i < 7; i++) { const x = -2.6 + i * 0.75 + (i > 2 ? 0.9 : 0); if (Math.abs(x + 2.05) < 0.9) continue; rbox(s, 0.6, 0.3, 0.35, 0.03, mat(0x9a948a, { roughness: 0.9 }), x, 0.15, -1.18); for (let k = 0; k < 4; k++) { sph(s, 0.14 + rnd() * 0.06, shrub, x - 0.18 + k * 0.12, 0.38 + rnd() * 0.08, -1.18 + (rnd() - 0.5) * 0.1); } sph(s, 0.035, flower, x + 0.05, 0.55, -1.08); sph(s, 0.035, flower, x - 0.12, 0.52, -1.06); }
      // the bin: green, on a short post, with a lid; the distance sensor looks down from under the lid
      const binG = new THREE.Group(); binG.position.set(-0.3, 0, -0.6); s.add(binG);
      const prof = [[0, 0.3], [0.26, 0.3], [0.3, 1.05], [0.32, 1.06], [0.32, 1.08], [0.29, 1.08]].map(([r, y]) => new THREE.Vector2(r, y));
      add(binG, new THREE.LatheGeometry(prof, 40), mat(0x2f7d4a, { roughness: 0.45, side: THREE.DoubleSide }), 0, 0, 0);
      cyl(binG, 0.04, 0.05, 0.3, steel, 0, 0.15, 0, 12);
      const lid = new THREE.Group(); lid.position.set(0, 1.09, -0.3); binG.add(lid);
      cyl(lid, 0.33, 0.33, 0.03, mat(0x24603a, { roughness: 0.45 }), 0, 0, 0.3, 40);
      const sens = new THREE.Group(); sens.position.set(0, -0.03, 0.3); lid.add(sens);
      rbox(sens, 0.12, 0.02, 0.05, 0.005, mat(0x1d5aa8), 0, 0, 0); for (const x of [-0.03, 0.03]) cyl(sens, 0.012, 0.012, 0.02, mat(0xd7dbdf, { metalness: 0.9, roughness: 0.3 }), x, -0.015, 0, 14);
      // the fill level on the front: five lights, green to red
      const lv = new THREE.Group(); lv.position.set(0, 0.7, 0.29); lv.rotation.x = -0.05; binG.add(lv);
      rbox(lv, 0.08, 0.3, 0.02, 0.01, mat(0xf2f3f4, { roughness: 0.4 }), 0, 0, 0);
      const cols = [0x34c759, 0x34c759, 0xffb400, 0xff8a00, 0xff3b30];
      const lvl = cols.map((c, i) => { const m = glow(c); sph(lv, 0.016, m, 0, -0.11 + i * 0.055, 0.014, false); return m; });
      const b = espBox(s, -0.3, 0.22, -0.55, 0, 2.2);
      // rubbish inside (bags and bottles stacking up) and one more piece dropped in from above
      const junk = new THREE.Group(); binG.add(junk); const items = [];
      for (let i = 0; i < 18; i++) { const c = [0x3a8fd6, 0xe0e0dc, 0x2b2f35, 0xd9534f, 0x5cb85c][i % 5]; const it = i % 3 === 0 ? cyl(junk, 0.03, 0.03, 0.14, phys(c, { roughness: 0.2, transparent: true, opacity: 0.85 }), 0, 0, 0, 12) : sph(junk, 0.07 + rnd() * 0.04, mat(c, { roughness: 0.8 }), 0, 0, 0); const a = rnd() * 6.28, r = rnd() * 0.16; it.userData = { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.36 + i * 0.04, rx: rnd() * 3 }; items.push(it); }
      const drop = sph(s, 0.06, mat(0xe0e0dc, { roughness: 0.8 }), 0, 0, 0);
      const ph = hudPhone(s, cam, alertScreen);
      return { s, cam, period: 9, update(t) {
        // the bin fills up (0–5 s); at 90 % it tells the collectors; at 7 s it is emptied
        const fill = t < 5 ? t / 5 * 0.95 : t < 7 ? 0.95 : 0.05;
        const shown = Math.round(fill * items.length);
        items.forEach((it, i) => { it.visible = i < shown; const u = it.userData; it.position.set(u.x, u.y, u.z); it.rotation.set(u.rx, u.rx * 2, 0); });
        const n = Math.ceil(fill * 5 - 0.001); lvl.forEach((m, i) => { m.emissiveIntensity = i < n ? 2.6 : 0.04; });
        const open = t > 1.2 && t < 2.4; lid.rotation.x = open ? -0.9 * Math.sin(Math.PI * (t - 1.2) / 1.2) : 0;
        drop.visible = open; drop.position.set(-0.3, 1.6 - (t - 1.2) * 0.9, -0.6);
        const full = fill > 0.85 && t < 7;
        setLed(b, full ? 0xff3b30 : 0x34c759, full ? Math.floor(t * 4) % 2 === 0 : true);
        ph.set(full ? { title: 'Bin 12 is 90% full', text: 'Time for collection on', text2: 'KN 5 Road.', app: 'CLEAN CITY', color: '#16834a' } : t >= 7 ? { title: 'Bin 12 emptied', text: 'Thank you, collectors!', app: 'CLEAN CITY', color: '#16834a' } : null);
        ph.update(full || t >= 7);
      } };
    }


    /* ---------- draw the scenes into the cards ---------- */
    const MAKERS = { gate, power, solar, tank, smoke, garden, football, bin };
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
