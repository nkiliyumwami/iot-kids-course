/* Small 3D loops for the "Real problems your child can solve" cards on the landing page.
   One WebGL renderer draws every scene (film-like tone mapping, soft shadows, reflections) and copies the picture
   into each card's own canvas, so six cards cost about as much as one. Only cards on screen are drawn, at about
   30 frames a second. Everything is modelled in code; no image or model files. Needs three.js r128 loaded first.

   Usage: KKProjects.mount(document.querySelectorAll('canvas[data-proj]'), { reduceMotion }) */
(function () {
  'use strict';

  function mount(canvases, opts) {
    opts = opts || {};
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    /* ---------- helpers ---------- */
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const mat = (hex, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: C(hex), roughness: 0.55, metalness: 0, envMapIntensity: 0.7 }, p));
    const phys = (hex, p = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(hex), roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1 }, p));
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
      r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
      const g = new THREE.ExtrudeGeometry(rshape(w - 2 * r, h - 2 * r, Math.min(r, (w - 2 * r) / 2, (h - 2 * r) / 2) * 0.999 || 0.0001), { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 6 });
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
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
      t.redraw = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; }; t.redraw(); return t;
    }
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    /* ---------- shared textures ---------- */
    const woodTex = (base, dark, rep) => canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(0, i * h / 6, w, 2); } // plank seams
      for (let i = 0; i < 220; i++) { g.strokeStyle = `rgba(${dark},${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 8 - 4, w * 0.6, y + rnd() * 8 - 4, w, y + rnd() * 6 - 3); g.stroke(); }
    }, rep);
    const floorWood = woodTex('#d9b98f', '120,80,40', [2, 2]);
    const deskWood = woodTex('#c9935e', '90,50,20', [1, 1]);
    const tiles = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#d5dce2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,130,140,${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
      g.strokeStyle = '#c3cbd2'; g.lineWidth = 4; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 2); g.lineTo(w, k * h / 2); g.stroke(); }
    }, [5, 4]);
    const concrete = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#9aa1a8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { const v = 130 + rnd() * 60; g.fillStyle = `rgba(${v},${v + 4},${v + 8},.35)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    }, [4, 3]);
    const softDot = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

    /* ---------- a soft studio sky for reflections ---------- */
    let env = null;
    try {
      const pm = new THREE.PMREMGenerator(renderer); const es = new THREE.Scene();
      const sg = new THREE.SphereGeometry(10, 32, 16), col = [], pos = sg.attributes.position, top = new THREE.Color(0xdde8f0), mid = new THREE.Color(0xfafbfc), low = new THREE.Color(0x8a939b), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) { const t = pos.getY(i) / 10; if (t > 0) c.copy(mid).lerp(top, Math.min(1, t * 1.5)); else c.copy(mid).lerp(low, Math.min(1, -t * 3)); col.push(c.r, c.g, c.b); }
      sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      es.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      for (const [x, z, w] of [[3, 3, 6], [-4, -2, 5]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); p.position.set(x, 7, z); p.lookAt(0, 0, 0); es.add(p); }
      env = pm.fromScene(es, 0.04).texture; pm.dispose();
    } catch (e) { env = null; }

    // a room corner: floor, back wall and left wall with skirting boards, warm key light with soft shadows
    function room(o = {}) {
      const s = new THREE.Scene();
      s.background = C(o.bg || 0xeef3f6);
      if (env) s.environment = env;
      const hemi = new THREE.HemisphereLight(0xffffff, 0xa9b4bd, o.hemi == null ? 0.45 : o.hemi); s.add(hemi);
      const key = new THREE.DirectionalLight(0xfff4e6, o.key == null ? 1.6 : o.key);
      key.position.set(2.5, 4.5, 3.2); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
      key.shadow.bias = -0.0004; key.shadow.radius = 5; s.add(key);
      const fill = new THREE.DirectionalLight(0xdfeeff, 0.35); fill.position.set(-3, 2, 2); s.add(fill);
      add(s, new THREE.BoxGeometry(5, 0.06, 4), o.floor || mat(0xffffff, { map: floorWood, roughness: 0.6 }), 0, -0.03, 0.2, false);
      const wallM = mat(o.wall || 0xdfe6eb, { roughness: 0.95 });
      add(s, new THREE.BoxGeometry(5, 2.6, 0.08), wallM, 0, 1.3, -1.25, false);
      add(s, new THREE.BoxGeometry(0.08, 2.6, 4), wallM, -1.95, 1.3, 0.2, false);
      const skirt = mat(0xffffff, { roughness: 0.5 });
      add(s, new THREE.BoxGeometry(5, 0.1, 0.03), skirt, 0, 0.05, -1.2, false);
      add(s, new THREE.BoxGeometry(0.03, 0.1, 4), skirt, -1.9, 0.05, 0.2, false);
      return { s, hemi, key };
    }
    function camera(pos, look, fov = 34) { const c = new THREE.PerspectiveCamera(fov, 1.6, 0.1, 30); c.position.set(...pos); c.lookAt(...look); c.userData.look = V(...look); return c; }

    // the "brain": an ESP32 DevKit with header pins, the metal module and two small lights
    function esp32(parent, x, y, z, s = 1) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
      rbox(g, 0.5, 0.025, 0.26, 0.01, mat(0x1d2a2b, { roughness: 0.45 }), 0, 0.0125, 0);
      rbox(g, 0.19, 0.03, 0.17, 0.006, mat(0xc4c9ce, { metalness: 0.85, roughness: 0.3 }), -0.1, 0.04, 0);
      rbox(g, 0.06, 0.022, 0.17, 0.004, mat(0x14181a), -0.22, 0.035, 0);
      const pin = mat(0xd9b44a, { metalness: 0.8, roughness: 0.3 }), hdr = mat(0x121416);
      for (const zz of [-0.115, 0.115]) {
        box(g, 0.46, 0.03, 0.025, hdr, 0, 0.04, zz);
        for (let i = 0; i < 15; i++) box(g, 0.008, 0.05, 0.008, pin, -0.21 + i * 0.03, 0.07, zz);
      }
      rbox(g, 0.05, 0.025, 0.07, 0.006, mat(0xc9ced4, { metalness: 0.9, roughness: 0.25 }), 0.24, 0.035, 0);
      const led = glow(0x2a9dff); sph(g, 0.012, led, 0.13, 0.035, 0.05, false);
      return { g, led };
    }
    function setLed(led, hex, on) { led.color.copy(C(hex)); led.emissive.copy(C(hex)); led.emissiveIntensity = on ? 3 : 0.15; }

    // a person: rounded clothes, hair, a natural walk
    function person(parent, o) {
      const h = o.h || 1.2, g = new THREE.Group(); parent.add(g);
      const skin = mat(o.skin || 0xc68642, { roughness: 0.7 }), shirt = mat(o.shirt, { roughness: 0.8 }), pants = mat(o.pants || 0x2b3a52, { roughness: 0.85 }), shoe = mat(0x1d1f22, { roughness: 0.5 }), hair = mat(o.hair || 0x1b1410, { roughness: 0.9 });
      const hip = 0.47 * h, leg = 0.45 * h;
      const legs = [-1, 1].map((sx) => {
        const p = new THREE.Group(); p.position.set(sx * 0.055 * h, hip, 0); g.add(p);
        cyl(p, 0.045 * h, 0.036 * h, leg, pants, 0, -leg / 2, 0, 14);
        const sh = sph(p, 0.05 * h, shoe, 0, -leg - 0.005 * h, 0.035 * h); sh.scale.set(0.9, 0.55, 1.6);
        return p;
      });
      const torso = new THREE.Group(); torso.position.y = hip; g.add(torso);
      const prof = [[0.0, 0], [0.1, 0], [0.11, 0.08], [0.115, 0.2], [0.125, 0.3], [0.1, 0.35], [0.04, 0.37], [0, 0.37]].map(([r, y]) => new THREE.Vector2(r * h, y * h));
      add(torso, new THREE.LatheGeometry(prof, 20), shirt, 0, 0, 0);
      cyl(torso, 0.028 * h, 0.032 * h, 0.06 * h, skin, 0, 0.39 * h, 0, 10);
      const head = new THREE.Group(); head.position.y = 0.47 * h; torso.add(head);
      const hd = sph(head, 0.075 * h, skin, 0, 0, 0); hd.scale.set(0.95, 1.08, 1);
      const hr = sph(head, 0.079 * h, hair, 0, 0.018 * h, -0.008 * h); hr.scale.set(1, 0.85, 1.02);
      for (const sx of [-1, 1]) sph(head, 0.009 * h, mat(0x15181b), sx * 0.025 * h, 0.01 * h, 0.07 * h, false);
      const arms = [-1, 1].map((sx) => {
        const p = new THREE.Group(); p.position.set(sx * 0.125 * h, 0.32 * h, 0); torso.add(p);
        cyl(p, 0.033 * h, 0.03 * h, 0.17 * h, shirt, 0, -0.085 * h, 0, 10);
        cyl(p, 0.026 * h, 0.022 * h, 0.15 * h, skin, 0, -0.24 * h, 0, 10);
        sph(p, 0.028 * h, skin, 0, -0.32 * h, 0);
        return p;
      });
      g.userData = { legs, arms, torso, head, h };
      g.walk = (ph, on) => { const sw = on ? Math.sin(ph) : 0; legs[0].rotation.x = sw * 0.5; legs[1].rotation.x = -sw * 0.5; arms[0].rotation.x = -sw * 0.4; arms[1].rotation.x = sw * 0.4; torso.position.y = hip + (on ? Math.abs(Math.cos(ph)) * 0.012 * h : 0); };
      return g;
    }

    // a smartphone with a real-looking lock screen and alert card
    function phone(parent, x, y, z, ry, rx) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx || 0, ry || 0, 0); parent.add(g);
      rbox(g, 0.3, 0.6, 0.03, 0.045, phys(0x1c1f24, { roughness: 0.25, metalness: 0.4 }), 0, 0.3, 0);
      let alert = null;
      const tex = canvasTex(240, 480, (c, w, h) => {
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
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.56), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(0, 0.3, 0.0155); g.add(scr);
      return { g, show(a) { const k = a ? a.join('|') : ''; if (k !== g.userData.k) { g.userData.k = k; alert = a; tex.redraw(); } } };
    }

    /* ---------- 1. self-watering plant ---------- */
    function plant() {
      const R = room({ bg: 0xeef4f7 }), s = R.s;
      const cam = camera([0.35, 1.3, 2.75], [-0.1, 0.62, 0]);
      rbox(s, 2.4, 0.08, 1.1, 0.03, mat(0xffffff, { map: deskWood, roughness: 0.45 }), 0, 0.3, -0.25);
      const top = 0.34;
      // a glazed pot with a rim (lathe)
      const potProf = [[0, 0], [0.2, 0], [0.22, 0.02], [0.27, 0.36], [0.3, 0.38], [0.3, 0.42], [0.27, 0.42], [0.25, 0.4]].map(([r, y]) => new THREE.Vector2(r, y));
      add(s, new THREE.LatheGeometry(potProf, 40), phys(0xc8643c, { roughness: 0.4, clearcoat: 0.3 }), 0.15, top, 0);
      const soilM = mat(0x4a3424, { roughness: 1 }); cyl(s, 0.255, 0.255, 0.02, soilM, 0.15, top + 0.39, 0, 32);
      // stem and real leaf shapes
      const stemM = mat(0x3f7f3a, { roughness: 0.6 });
      const stem = new THREE.CatmullRomCurve3([V(0.15, top + 0.39, 0), V(0.13, top + 0.62, 0.02), V(0.17, top + 0.86, -0.01), V(0.15, top + 1.0, 0)]);
      add(s, new THREE.TubeGeometry(stem, 30, 0.02, 8, false), stemM);
      const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.09, 0.06, 0.24, 0); leafShape.quadraticCurveTo(0.09, -0.06, 0, 0);
      const leafGeo = new THREE.ShapeGeometry(leafShape, 12); leafGeo.rotateX(-Math.PI / 2);
      const leafM = mat(0x3f9a3c, { roughness: 0.45, side: THREE.DoubleSide });
      const leaves = [];
      [[0.12, 0.3], [0.2, 2.4], [0.3, 4.4], [0.38, 1.2], [0.47, 3.4], [0.55, 5.5], [0.64, 0.4], [0.72, 2.9], [0.8, 5.0], [0.88, 1.8], [0.95, 3.9], [1.0, 0.9]].forEach(([u, a]) => {
        const pnt = stem.getPoint(u); const p = new THREE.Group(); p.position.copy(pnt); p.rotation.y = a; s.add(p);
        const l = add(p, leafGeo, leafM, 0, 0, 0); l.scale.setScalar(1.9 - u * 0.6);
        leaves.push(p);
      });
      // soil-moisture sensor (the fork shape) and its wire
      rbox(s, 0.05, 0.22, 0.012, 0.006, mat(0x1d5aa8, { roughness: 0.5 }), 0.32, top + 0.43, 0.1);
      // water tank, pump and tube
      rbox(s, 0.34, 0.46, 0.26, 0.03, phys(0xdff2fb, { transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 }), -0.75, top + 0.24, -0.1);
      const water = rbox(s, 0.3, 0.36, 0.22, 0.02, phys(0x3a9bd8, { transparent: true, opacity: 0.8, roughness: 0.05 }), -0.75, top + 0.2, -0.1);
      rbox(s, 0.12, 0.08, 0.12, 0.02, mat(0x2b2f35), -0.75, top + 0.5, -0.1);
      const curve = new THREE.CatmullRomCurve3([V(-0.75, top + 0.54, -0.1), V(-0.55, top + 0.95, -0.06), V(-0.1, top + 0.98, -0.02), V(0.02, top + 0.58, 0)]);
      add(s, new THREE.TubeGeometry(curve, 50, 0.014, 10, false), phys(0xbfe6f7, { transparent: true, opacity: 0.55, roughness: 0.05 }));
      const drops = []; for (let i = 0; i < 9; i++) drops.push(sph(s, 0.016, phys(0x2f8fd0, { roughness: 0.05 }), 0, 0, 0, false));
      const b = esp32(s, 0.75, top + 0.04, 0.2, 0.9); b.g.rotation.y = -0.35;
      const dry = C(0xa88a63), wet = C(0x3f2c1e);
      return { s, cam, period: 9, update(t) {
        const m = t < 3.5 ? 1 - t / 3.5 : clamp01((t - 3.8) / 2.4);  // soil moisture
        const pumping = t > 3.6 && t < 6.2;
        soilM.color.copy(dry).lerp(wet, m);
        leaves.forEach((p, i) => { p.rotation.z = lerp(-0.8, 0.25, ease(m)) - i * 0.02; });
        water.scale.y = lerp(1, 0.72, clamp01((t - 3.6) / 2.6)); water.position.y = top + 0.02 + 0.18 * water.scale.y;
        drops.forEach((d, i) => { d.visible = pumping; if (pumping) d.position.copy(curve.getPoint(((t * 0.8) + i / drops.length) % 1)); });
        setLed(b.led, m < 0.35 ? 0xff3b30 : pumping ? 0x2a9dff : 0x34c759, true);
      } };
    }

    /* ---------- 2. lights that save energy ---------- */
    function lights() {
      const R = room({ bg: 0xd9dfe4, hemi: 0.18, key: 0.25 }), s = R.s;
      const cam = camera([0.6, 1.25, 3.3], [-0.05, 0.95, -0.2], 40);
      // sofa, rug and a plant make it a real living room
      const sofaM = mat(0x5a6f8c, { roughness: 0.9 });
      rbox(s, 1.5, 0.3, 0.6, 0.08, sofaM, -0.6, 0.25, -0.85); rbox(s, 1.5, 0.45, 0.16, 0.07, sofaM, -0.6, 0.55, -1.08);
      rbox(s, 0.16, 0.42, 0.6, 0.07, sofaM, -1.36, 0.35, -0.85); rbox(s, 0.16, 0.42, 0.6, 0.07, sofaM, 0.16, 0.35, -0.85);
      rbox(s, 0.62, 0.14, 0.4, 0.05, mat(0x6d84a3, { roughness: 0.9 }), -0.95, 0.46, -0.82); rbox(s, 0.62, 0.14, 0.4, 0.05, mat(0x6d84a3, { roughness: 0.9 }), -0.25, 0.46, -0.82);
      add(s, new THREE.CylinderGeometry(0.85, 0.85, 0.01, 48), mat(0x9c8a72, { roughness: 1 }), -0.3, 0.005, -0.1, false);
      cyl(s, 0.12, 0.09, 0.22, phys(0xeeeeee, { roughness: 0.3 }), 0.95, 0.11, -0.9); sph(s, 0.2, mat(0x4f8f4a, { roughness: 0.8 }), 0.95, 0.38, -0.9);
      // pendant lamp
      cyl(s, 0.004, 0.004, 0.55, mat(0x222222), -0.3, 2.15, -0.3, 6);
      const shade = add(s, new THREE.CylinderGeometry(0.06, 0.26, 0.2, 32, 1, true), mat(0xf4f1ea, { side: THREE.DoubleSide, roughness: 0.7 }), -0.3, 1.8, -0.3);
      const bulb = glow(0xfff1c2); sph(s, 0.06, bulb, -0.3, 1.74, -0.3, false);
      const lamp = new THREE.PointLight(0xffd9a0, 0, 5, 2); lamp.position.set(-0.3, 1.65, -0.3); lamp.castShadow = true; lamp.shadow.mapSize.set(512, 512); lamp.shadow.radius = 6; s.add(lamp);
      void shade;
      // motion sensor (PIR) on the wall, with the ESP32 in a little box under it
      const pirG = new THREE.Group(); pirG.position.set(1.15, 1.75, -1.2); s.add(pirG);
      rbox(pirG, 0.18, 0.18, 0.06, 0.02, mat(0xf4f5f6), 0, 0, 0.03);
      const dome = sph(pirG, 0.06, phys(0xfafafa, { roughness: 0.2, transparent: true, opacity: 0.95 }), 0, 0, 0.07); dome.scale.z = 0.7;
      const pir = glow(0xff3b30); sph(pirG, 0.012, pir, 0.06, -0.06, 0.07, false);
      const who = person(s, { shirt: 0xd9821a, pants: 0x2b3a52, skin: 0x8d5524, h: 1.25 });
      return { s, cam, period: 9, update(t) {
        // walk in (0–2 s), sit… stand (2–4 s), walk out (4–6 s); the light stays on 1.5 s after the room is empty
        const x = t < 2 ? lerp(2.4, 0.5, ease(t / 2)) : t < 4 ? 0.5 : lerp(0.5, 2.6, ease((t - 4) / 2));
        const walking = (t < 2) || (t > 4 && t < 6);
        who.position.set(x, 0, 0.35); who.rotation.y = t < 3 ? -Math.PI / 2 : Math.PI / 2;
        who.walk(t * 9, walking);
        const inRoom = x < 1.6;
        const on = inRoom || (t > 6 && t < 7.5);
        const k = on ? 1 : clamp01(1 - (t - 7.5) / 0.4);
        lamp.intensity = 6 * k; bulb.emissiveIntensity = 5 * k; R.hemi.intensity = 0.18 + 0.32 * k; R.key.intensity = 0.25 + 0.6 * k;
        pir.emissiveIntensity = inRoom ? 3 : 0;
      } };
    }

    /* ---------- 3. door and window alarm ---------- */
    function door() {
      const R = room({ bg: 0xeef2f5, wall: 0xe5ebef }), s = R.s;
      const cam = camera([0.95, 1.3, 2.7], [0.05, 0.85, -0.6], 36);
      const frameM = mat(0xffffff, { roughness: 0.45 });
      rbox(s, 0.09, 2.0, 0.12, 0.015, frameM, -0.95, 1.0, -1.18); rbox(s, 0.09, 2.0, 0.12, 0.015, frameM, 0.05, 1.0, -1.18); rbox(s, 1.09, 0.09, 0.12, 0.015, frameM, -0.45, 2.0, -1.18);
      add(s, new THREE.BoxGeometry(0.92, 1.95, 0.02), mat(0x2a3138), -0.45, 0.98, -1.195, false); // dark hallway behind the door (in front of the wall so the two never flicker)
      const hinge = new THREE.Group(); hinge.position.set(-0.9, 0, -1.16); s.add(hinge);
      const doorM = mat(0x8a5a3c, { roughness: 0.55 });
      rbox(hinge, 0.9, 1.94, 0.05, 0.012, doorM, 0.45, 0.97, 0);
      for (const y of [0.55, 1.4]) rbox(hinge, 0.62, 0.6, 0.02, 0.01, mat(0x7a4c30, { roughness: 0.55 }), 0.45, y, 0.03);
      const brass = mat(0xd4af37, { metalness: 0.9, roughness: 0.25 });
      cyl(hinge, 0.025, 0.025, 0.04, brass, 0.8, 0.95, 0.05, 16).rotation.x = Math.PI / 2; rbox(hinge, 0.13, 0.025, 0.03, 0.01, brass, 0.75, 0.95, 0.08);
      rbox(hinge, 0.035, 0.12, 0.03, 0.008, mat(0xffffff), 0.86, 1.4, 0.04); // magnet
      rbox(s, 0.035, 0.12, 0.03, 0.008, mat(0xffffff), 0.1, 1.4, -1.1);       // reed switch on the frame
      // a small shelf with the ESP32 and a buzzer, and a phone on the side table
      rbox(s, 0.7, 0.04, 0.3, 0.012, mat(0xffffff, { map: deskWood }), 0.75, 0.95, -1.02);
      const b = esp32(s, 0.65, 0.97, -1.0, 0.9);
      cyl(s, 0.055, 0.055, 0.05, mat(0x15181b, { roughness: 0.4 }), 0.98, 1.0, -1.0, 24);
      const rings = [0, 1, 2].map(() => { const r = add(s, new THREE.TorusGeometry(0.08, 0.006, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0, toneMapped: false }), 0.98, 1.1, -1.0, false); r.rotation.x = Math.PI / 2; return r; });
      rbox(s, 0.6, 0.5, 0.45, 0.03, mat(0xffffff, { map: deskWood }), 1.1, 0.25, 0.25);
      const ph = phone(s, 1.08, 0.5, 0.3, -0.5, -1.25);
      return { s, cam, period: 7, update(t) {
        const open = t < 1 ? 0 : t < 2.2 ? ease((t - 1) / 1.2) : t < 4.8 ? 1 : t < 6 ? 1 - ease((t - 4.8) / 1.2) : 0;
        hinge.rotation.y = -1.15 * open;
        const alarm = open > 0.05 && t < 6.2;
        rings.forEach((r, i) => { const k = ((t * 1.4) + i / 3) % 1; r.scale.setScalar(1 + k * 3); r.material.opacity = alarm ? 0.85 * (1 - k) : 0; });
        setLed(b.led, alarm ? 0xff3b30 : 0x34c759, alarm ? Math.floor(t * 6) % 2 === 0 : true);
        ph.show(alarm && t > 1.6 ? ['Front door opened', 'Nobody is home', '#c93131'] : null);
      } };
    }

    /* ---------- 4. water-leak warning ---------- */
    function leak() {
      const R = room({ bg: 0xeef3f6, floor: mat(0xffffff, { map: tiles, roughness: 0.35 }), wall: 0xe8eef2 }), s = R.s;
      const cam = camera([0.75, 1.25, 2.55], [-0.05, 0.45, -0.5], 36);
      // sink cabinet with its doors open, the waste pipe (a P-trap) inside
      const cab = mat(0xf7f7f5, { roughness: 0.4 });
      rbox(s, 1.4, 0.04, 0.55, 0.01, cab, -0.55, 0.06, -0.92); rbox(s, 0.04, 0.85, 0.55, 0.01, cab, -1.23, 0.45, -0.92); rbox(s, 0.04, 0.85, 0.55, 0.01, cab, 0.13, 0.45, -0.92);
      rbox(s, 1.42, 0.05, 0.6, 0.012, mat(0x3a4048, { roughness: 0.25, metalness: 0.2 }), -0.55, 0.9, -0.9);
      for (const [x, a] of [[-1.25, 1.9], [0.15, -1.9]]) { const d = new THREE.Group(); d.position.set(x, 0.08, -0.64); d.rotation.y = a; s.add(d); rbox(d, 0.68, 0.78, 0.03, 0.01, cab, (x < 0 ? 1 : -1) * 0.34, 0.4, 0); }
      const pipeM = mat(0xdfe3e6, { metalness: 0.7, roughness: 0.25 });
      const trap = new THREE.CatmullRomCurve3([V(-0.4, 0.88, -0.95), V(-0.4, 0.5, -0.95), V(-0.32, 0.36, -0.95), V(-0.18, 0.42, -0.95), V(-0.12, 0.58, -0.98), V(-0.12, 0.6, -1.2)]);
      add(s, new THREE.TubeGeometry(trap, 50, 0.035, 12, false), pipeM);
      rbox(s, 0.1, 0.06, 0.1, 0.01, mat(0x9aa1a7, { metalness: 0.6, roughness: 0.3 }), -0.32, 0.37, -0.95); // the loose joint
      const drops = [0, 1, 2].map(() => sph(s, 0.016, phys(0x3a9bd8, { roughness: 0.05 }), -0.32, 0.33, -0.95, false));
      // the puddle: a blob shape with a wet, reflective surface
      const blob = new THREE.Shape(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 1 + 0.18 * Math.sin(a * 3) + 0.1 * Math.cos(a * 5); const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0) blob.moveTo(px, py); else blob.lineTo(px, py); }
      const puddle = add(s, new THREE.ShapeGeometry(blob, 24), phys(0x2f8fd8, { transparent: true, opacity: 0.75, roughness: 0.02, clearcoat: 1, metalness: 0.1 }), -0.3, 0.012, -0.65, false);
      puddle.rotation.x = -Math.PI / 2;
      // the leak sensor on the floor: two gold strips on a small black pad, wired to the ESP32
      rbox(s, 0.2, 0.02, 0.1, 0.008, mat(0x15181b), 0.05, 0.02, -0.4);
      for (const dx of [-0.03, 0.03]) box(s, 0.012, 0.006, 0.08, mat(0xd9b44a, { metalness: 0.85, roughness: 0.25 }), 0.05 + dx, 0.032, -0.4);
      const b = esp32(s, 0.6, 0.02, -0.3, 0.9); b.g.rotation.y = -0.5;
      const ph = phone(s, 0.95, 0.0, 0.25, -0.45, 0);
      return { s, cam, period: 8, update(t) {
        const r = t < 0.6 ? 0.001 : t < 4.5 ? lerp(0.04, 0.42, (t - 0.6) / 3.9) : t < 6.8 ? 0.42 : lerp(0.42, 0.001, (t - 6.8) / 1.2);
        puddle.scale.set(Math.max(0.001, r * 1.3), Math.max(0.001, r), 1);
        drops.forEach((d, i) => { const k = ((t * 1.3) + i / 3) % 1; d.position.y = 0.33 - k * 0.31; d.visible = t < 6.6; });
        const wet = r > 0.33;
        setLed(b.led, wet ? 0xff3b30 : 0x34c759, wet ? Math.floor(t * 6) % 2 === 0 : true);
        ph.show(wet ? ['Water leak!', 'Under the kitchen sink', '#2a7fd0'] : null);
      } };
    }

    /* ---------- 5. classroom air checker ---------- */
    function air() {
      const R = room({ bg: 0xedf2f5, wall: 0xe9eef1 }), s = R.s;
      const cam = camera([0.6, 1.35, 2.7], [0.0, 0.85, -0.5], 36);
      // desk and chair
      rbox(s, 1.5, 0.05, 0.7, 0.015, mat(0xffffff, { map: deskWood, roughness: 0.45 }), -0.1, 0.72, -0.5);
      const steel = mat(0x5b6670, { metalness: 0.7, roughness: 0.35 });
      for (const [x, z] of [[-0.8, -0.8], [0.6, -0.8], [-0.8, -0.2], [0.6, -0.2]]) cyl(s, 0.02, 0.02, 0.7, steel, x, 0.35, z, 10);
      rbox(s, 0.45, 0.04, 0.42, 0.02, mat(0x2c6e9e), -0.2, 0.45, 0.15); rbox(s, 0.45, 0.42, 0.04, 0.02, mat(0x2c6e9e), -0.2, 0.68, 0.37);
      for (const [x, z] of [[-0.4, -0.02], [0.0, -0.02], [-0.4, 0.33], [0.0, 0.33]]) cyl(s, 0.015, 0.015, 0.45, steel, x, 0.22, z, 8);
      // whiteboard and window on the wall
      rbox(s, 0.9, 0.55, 0.03, 0.01, mat(0xfcfcfc, { roughness: 0.2 }), 0.8, 1.55, -1.2);
      const sky = canvasTex(128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fd2f2'); gr.addColorStop(1, '#e3f3fc'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#7fbf6a'; g.fillRect(0, h * 0.8, w, h * 0.2); });
      add(s, new THREE.PlaneGeometry(0.86, 0.66), new THREE.MeshBasicMaterial({ map: sky }), -0.7, 1.6, -1.205, false);
      const fr = mat(0xffffff, { roughness: 0.4 });
      rbox(s, 0.98, 0.06, 0.08, 0.01, fr, -0.7, 1.96, -1.18); rbox(s, 0.98, 0.06, 0.08, 0.01, fr, -0.7, 1.24, -1.18); rbox(s, 0.06, 0.78, 0.08, 0.01, fr, -1.19, 1.6, -1.18); rbox(s, 0.06, 0.78, 0.08, 0.01, fr, -0.21, 1.6, -1.18);
      const sash = new THREE.Group(); sash.position.set(-1.16, 1.6, -1.14); s.add(sash);
      rbox(sash, 0.46, 0.66, 0.03, 0.008, phys(0xe9f6fc, { transparent: true, opacity: 0.35, roughness: 0.02, clearcoat: 1 }), 0.23, 0, 0);
      // the air checker: a rounded white box with a CO₂ display and a traffic light
      const dev = new THREE.Group(); dev.position.set(0.3, 0.745, -0.45); dev.rotation.y = -0.25; s.add(dev);
      rbox(dev, 0.34, 0.4, 0.14, 0.04, phys(0xf8f9fa, { roughness: 0.35 }), 0, 0.2, 0);
      rbox(dev, 0.12, 0.33, 0.02, 0.02, mat(0x15181b), -0.08, 0.2, 0.07);
      const lamps = [0xff3b30, 0xffb400, 0x34c759].map((c, i) => { const m = glow(c); sph(dev, 0.032, m, -0.08, 0.31 - i * 0.105, 0.08, false); return m; });
      let co2 = 0;
      const lcd = canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#0f1a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#9fe7c4'; g.font = '700 30px monospace'; g.textAlign = 'center'; g.fillText(String(co2), w / 2, 48); g.font = '600 16px monospace'; g.fillStyle = '#7fa8c9'; g.fillText('CO2 ppm', w / 2, 76); });
      const lcdM = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.105), new THREE.MeshBasicMaterial({ map: lcd, toneMapped: false })); lcdM.position.set(0.075, 0.22, 0.071); dev.add(lcdM);
      // stale air: soft grey puffs that build up, and blow away when the window opens
      const puffs = []; for (let i = 0; i < 20; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0x7d8a96, transparent: true, opacity: 0, depthWrite: false })); sp.userData = { x: -1.4 + rnd() * 2.6, z: -1.0 + rnd() * 1.6, y: 0.8 + rnd() * 1.2, sp: 0.06 + rnd() * 0.06, o: rnd() * 6, k: rnd() }; s.add(sp); puffs.push(sp); }
      return { s, cam, period: 10, update(t) {
        const level = t < 4.5 ? t / 4.5 : t < 5.2 ? 1 : clamp01(1 - (t - 5.2) / 3.5);
        const open = t < 4.6 ? 0 : t < 5.4 ? ease((t - 4.6) / 0.8) : t < 9 ? 1 : 1 - ease((t - 9) / 0.8);
        sash.rotation.y = -1.05 * open;
        const k = level < 0.4 ? 2 : level < 0.75 ? 1 : 0;
        lamps.forEach((m, i) => { m.emissiveIntensity = i === k ? 3 : 0.05; });
        const ppm = Math.round(450 + level * 1250); if (Math.abs(ppm - co2) > 15) { co2 = ppm; lcd.redraw(); }
        puffs.forEach((p) => { const u = p.userData; p.position.set(u.x + Math.sin(t * 0.6 + u.o) * 0.12 + (open > 0.5 ? (t - 5) * 0.25 * -1 : 0), u.y + Math.sin(t * u.sp * 6 + u.o) * 0.08, u.z); p.scale.setScalar(0.09 + u.k * 0.08); p.material.opacity = (u.k < level ? 0.32 : 0); });
      } };
    }

    /* ---------- 6. parking helper ---------- */
    function parking() {
      const R = room({ bg: 0xe8ecef, floor: mat(0xffffff, { map: concrete, roughness: 0.8 }), wall: 0xdfe4e8 }), s = R.s;
      const cam = camera([1.75, 1.35, 2.2], [-0.1, 0.55, -0.45], 38);
      const line = mat(0xf2b705, { roughness: 0.6 });
      box(s, 0.06, 0.006, 2.8, line, -0.62, 0.003, 0.2, false); box(s, 0.06, 0.006, 2.8, line, 0.62, 0.003, 0.2, false);
      rbox(s, 0.9, 0.12, 0.14, 0.03, mat(0xf2b705, { roughness: 0.5 }), 0, 0.06, -1.1); // wheel stop
      // ultrasonic sensor (HC-SR04: blue board, two silver "eyes") and a traffic light on the wall
      const sens = new THREE.Group(); sens.position.set(0, 0.62, -1.19); sens.scale.setScalar(1.6); s.add(sens);
      rbox(sens, 0.3, 0.13, 0.015, 0.008, mat(0x1d5aa8, { roughness: 0.45 }), 0, 0, 0.01);
      for (const x of [-0.075, 0.075]) { const e = cyl(sens, 0.05, 0.05, 0.08, mat(0xd7dbdf, { metalness: 0.85, roughness: 0.3 }), x, 0, 0.055, 28); e.rotation.x = Math.PI / 2; const m = cyl(sens, 0.035, 0.035, 0.082, mat(0x2b2f35, { roughness: 0.9 }), x, 0, 0.056, 20); m.rotation.x = Math.PI / 2; }
      const tl = new THREE.Group(); tl.position.set(0, 1.15, -1.17); tl.scale.setScalar(1.7); s.add(tl);
      rbox(tl, 0.42, 0.16, 0.08, 0.03, mat(0x22272d, { roughness: 0.45 }), 0, 0, 0.04);
      const lamps = [0xff3b30, 0xffb400, 0x34c759].map((c, i) => { const m = glow(c); sph(tl, 0.045, m, -0.13 + i * 0.13, 0, 0.085, false); return m; });
      const waves = [0, 1, 2].map(() => add(s, new THREE.TorusGeometry(0.1, 0.006, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3d9bff, transparent: true, opacity: 0, toneMapped: false }), 0, 0.62, -1.08, false));
      // a proper car: extruded side profile with wheel arches, glass, lights
      const car = new THREE.Group(); s.add(car);
      const L = 1.5, W = 0.66, wr = 0.14, wx = 0.47, sill = 0.14, h2 = L / 2, ar = wr + 0.03;
      const b = new THREE.Shape();
      b.moveTo(-h2, sill + 0.06); b.quadraticCurveTo(-h2, sill, -h2 + 0.06, sill); b.lineTo(-wx - ar, sill); b.absarc(-wx, wr, ar, Math.PI, 0, true);
      b.lineTo(wx - ar, sill); b.absarc(wx, wr, ar, Math.PI, 0, true); b.lineTo(h2 - 0.06, sill); b.quadraticCurveTo(h2, sill, h2, sill + 0.08);
      b.lineTo(h2 - 0.01, 0.33); b.quadraticCurveTo(h2 - 0.03, 0.37, h2 - 0.16, 0.38); b.lineTo(0.28, 0.4); b.lineTo(-0.55, 0.4); b.quadraticCurveTo(-h2 + 0.01, 0.4, -h2, 0.33); b.closePath();
      const body = new THREE.ExtrudeGeometry(b, { depth: W, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 4, curveSegments: 18 }); body.translate(0, 0, -W / 2);
      const paint = phys(0xc93131, { metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
      const carBody = new THREE.Group(); carBody.rotation.y = -Math.PI / 2; car.add(carBody); // nose towards the wall (−z)
      add(carBody, body, paint);
      const c2 = new THREE.Shape(); c2.moveTo(0.28, 0.39); c2.lineTo(0.06, 0.58); c2.quadraticCurveTo(0.02, 0.6, -0.04, 0.6); c2.lineTo(-0.38, 0.6); c2.quadraticCurveTo(-0.43, 0.6, -0.46, 0.56); c2.lineTo(-0.56, 0.39); c2.closePath();
      const cg = new THREE.ExtrudeGeometry(c2, { depth: W - 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }); cg.translate(0, 0, -(W - 0.1) / 2);
      add(carBody, cg, phys(0x17222c, { roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
      rbox(carBody, 0.05, 0.2, W - 0.06, 0.01, paint, -0.18, 0.49, 0);
      const tyre = mat(0x18191b, { roughness: 0.85 }), rim = mat(0xd7dbdf, { metalness: 0.9, roughness: 0.25 });
      for (const x of [-wx, wx]) for (const z of [-1, 1]) { const w = cyl(carBody, wr, wr, 0.1, tyre, x, wr, z * (W / 2 - 0.01), 28); w.rotation.x = Math.PI / 2; const r2 = cyl(carBody, wr * 0.62, wr * 0.62, 0.104, rim, x, wr, z * (W / 2 - 0.01), 20); r2.rotation.x = Math.PI / 2; }
      const head = glow(0xfff6dc); for (const z of [-0.22, 0.22]) { rbox(carBody, 0.03, 0.04, 0.14, 0.008, head, h2 + 0.03, 0.29, z); rbox(carBody, 0.03, 0.045, 0.15, 0.008, glow(0xff2a2a), -h2 - 0.03, 0.31, z); }
      head.emissiveIntensity = 1.5;
      return { s, cam, period: 7.5, update(t) {
        const z = t < 3.2 ? lerp(2.6, 0.0, ease(t / 3.2)) : t < 5.2 ? 0.0 : lerp(0.0, 2.6, ease((t - 5.2) / 2));
        car.position.set(0, 0, z);
        const gap = z - 0.75 + 1.17;   // nose to wall
        const k = gap > 1.3 ? 2 : gap > 0.75 ? 1 : 0;
        lamps.forEach((m, i) => { m.emissiveIntensity = i === k ? 3 : 0.05; });
        waves.forEach((w, i) => { const f = ((t * 1.5) + i / 3) % 1; w.position.z = -1.08 + f * Math.max(0.2, gap - 0.1); w.scale.setScalar(1 + f * 2.2); w.material.opacity = 0.75 * (1 - f); });
      } };
    }

    /* ---------- draw the scenes into the cards ---------- */
    const MAKERS = { plant, lights, door, leak, air, parking };
    const items = [];
    [...canvases].forEach((cv) => {
      const make = MAKERS[cv.dataset.proj]; if (!make) return;
      items.push({ cv, ctx: cv.getContext('2d'), sc: make(), visible: false, t0: Math.random() * 3 });
    });
    if (!items.length) return null;
    let rw = 0, rh = 0;
    function sizeAll() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let mw = 1, mh = 1;
      items.forEach((it) => {
        const w = Math.max(1, Math.round(it.cv.clientWidth * dpr)), h = Math.max(1, Math.round(it.cv.clientHeight * dpr));
        if (it.cv.width !== w || it.cv.height !== h) { it.cv.width = w; it.cv.height = h; }
        it.w = w; it.h = h; mw = Math.max(mw, w); mh = Math.max(mh, h);
        const cam = it.sc.cam; cam.aspect = w / h;
        cam.fov = (cam.userData.fov0 || (cam.userData.fov0 = cam.fov)) * (cam.aspect < 1.5 ? 1.5 / cam.aspect * 0.9 + 0.1 : 1);
        cam.updateProjectionMatrix();
      });
      if (mw !== rw || mh !== rh) { rw = mw; rh = mh; renderer.setSize(rw, rh, false); }
    }
    function draw(it, t) {
      it.sc.update(t % it.sc.period);
      renderer.setViewport(0, 0, it.w, it.h); renderer.setScissor(0, 0, it.w, it.h); renderer.setScissorTest(true);
      renderer.render(it.sc.s, it.sc.cam);
      it.ctx.drawImage(renderer.domElement, 0, rh - it.h, it.w, it.h, 0, 0, it.w, it.h); // the picture sits in the bottom-left corner
    }
    const io = new IntersectionObserver((es) => { es.forEach((e) => { const it = items.find((x) => x.cv === e.target); if (it) it.visible = e.isIntersecting; }); if (items.some((x) => x.visible)) start(); }, { rootMargin: '100px 0px' });
    items.forEach((it) => io.observe(it.cv));
    new ResizeObserver(() => { sizeAll(); if (opts.reduceMotion) items.forEach((it) => draw(it, it.sc.period * 0.45)); }).observe(items[0].cv.parentElement.parentElement);
    sizeAll();
    let raf = 0, last = 0, clock = 0;
    function loop(now) {
      raf = 0;
      if (document.hidden || !items.some((x) => x.visible)) return;
      if (now - last >= 33) { // about 30 frames a second is plenty for these loops
        clock += Math.min(0.1, (now - (last || now)) / 1000); last = now;
        items.forEach((it) => { if (it.visible) draw(it, clock + it.t0); });
      }
      raf = requestAnimationFrame(loop);
    }
    function start() { if (opts.reduceMotion) return; if (!raf) raf = requestAnimationFrame(loop); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    items.forEach((it) => draw(it, it.sc.period * 0.45)); // one picture straight away (and kept still with reduced motion)
    return { items, draw, start };
  }
  window.KKProjects = { mount };
})();
