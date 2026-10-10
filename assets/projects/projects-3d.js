/* Small 3D loops for the "Real problems your child can solve" cards on the landing page.
   One WebGL renderer draws every scene and copies the picture into each card's own canvas, so six cards cost about
   as much as one. Only cards on screen are drawn, at about 30 frames a second. Needs three.js r128 loaded first.

   Usage: KKProjects.mount(document.querySelectorAll('canvas[data-proj]'), { reduceMotion }) */
(function () {
  'use strict';

  function mount(canvases, opts) {
    opts = opts || {};
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(1);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const mat = (color, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, p));
    const glowMat = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.3 });
    function add(parent, geo, m, x = 0, y = 0, z = 0) { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); parent.add(k); return k; }
    const box = (p, w, h, d, m, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
    const cyl = (p, rt, rb, h, m, x, y, z, seg = 20) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
    const sph = (p, r, m, x, y, z) => add(p, new THREE.SphereGeometry(r, 18, 12), m, x, y, z);
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const ease = (x) => { x = clamp01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
    const lerp = (a, b, f) => a + (b - a) * f;
    function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.redraw = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; }; t.redraw(); return t; }

    // a clean little room: floor, back wall, soft light
    function base(bg, floor, wall) {
      const s = new THREE.Scene();
      s.background = new THREE.Color(bg);
      s.add(new THREE.HemisphereLight(0xffffff, 0xc9d4dc, 0.75));
      const sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(2, 4, 3); s.add(sun);
      box(s, 4, 0.06, 3, mat(floor, { roughness: 0.85 }), 0, -0.03, 0);
      if (wall) box(s, 4, 2.2, 0.06, mat(wall, { roughness: 0.9 }), 0, 1.1, -1.2);
      return s;
    }
    // the "brain": a tiny ESP32 board with a status light
    function board(parent, x, y, z) {
      const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
      box(g, 0.42, 0.03, 0.22, mat(0x2b2e33), 0, 0.015, 0);
      box(g, 0.16, 0.03, 0.15, mat(0xb9bec4, { metalness: 0.5, roughness: 0.3 }), -0.08, 0.045, 0);
      const led = glowMat(0x33dd77); sph(g, 0.022, led, 0.13, 0.045, 0.06);
      return { g, led };
    }
    function setLed(led, color, on) { led.color.setHex(color); led.emissive.setHex(color); led.emissiveIntensity = on ? 1.6 : 0.1; }
    function person(parent, shirt) {
      const g = new THREE.Group(); parent.add(g);
      const legs = mat(0x2b3a52), skin = mat(0xc68642);
      const lL = new THREE.Group(), lR = new THREE.Group(); lL.position.set(-0.05, 0.36, 0); lR.position.set(0.05, 0.36, 0); g.add(lL, lR);
      cyl(lL, 0.035, 0.03, 0.34, legs, 0, -0.17, 0, 10); cyl(lR, 0.035, 0.03, 0.34, legs, 0, -0.17, 0, 10);
      cyl(g, 0.09, 0.08, 0.3, mat(shirt), 0, 0.51, 0, 14);
      sph(g, 0.075, skin, 0, 0.75, 0); sph(g, 0.078, mat(0x1b1410), 0, 0.775, -0.01).scale.set(1, 0.7, 1);
      g.userData = { lL, lR };
      return g;
    }
    function phone(parent, x, y, z, ry) {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; parent.add(g);
      box(g, 0.3, 0.56, 0.03, mat(0x1d2126, { roughness: 0.4 }), 0, 0.28, 0);
      let text = '';
      const tex = canvasTex(150, 280, (c, w, h) => {
        c.fillStyle = '#0f1a24'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#9fb3c4'; c.font = 'bold 36px sans-serif'; c.textAlign = 'center'; c.fillText('12:00', w / 2, 70);
        if (text) { c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect ? c.roundRect(10, 110, w - 20, 80, 14) : c.rect(10, 110, w - 20, 80); c.fill(); c.fillStyle = '#c93131'; c.font = 'bold 20px sans-serif'; c.fillText(text[0], w / 2, 145); c.fillStyle = '#15202a'; c.font = '17px sans-serif'; c.fillText(text[1], w / 2, 172); }
      });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.5), new THREE.MeshBasicMaterial({ map: tex })); scr.position.set(0, 0.28, 0.016); g.add(scr);
      return { g, show(t) { const k = t ? t.join('|') : ''; if (k !== g.userData.k) { g.userData.k = k; text = t; tex.redraw(); } } };
    }

    /* ---------- 1. self-watering plant ---------- */
    function plant() {
      const s = base(0xeef4f7, 0xe6d3b5, 0xdfe9ef);
      const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50); cam.position.set(0.4, 1.55, 3.0); cam.lookAt(0, 0.55, 0);
      cyl(s, 0.33, 0.25, 0.5, mat(0xc8643c), 0.15, 0.25, 0);
      const soil = mat(0x4a3424, { roughness: 1 }); cyl(s, 0.31, 0.31, 0.03, soil, 0.15, 0.49, 0);
      const stemM = mat(0x3e8e41), leafM = mat(0x5aac4e, { roughness: 0.7 });
      cyl(s, 0.025, 0.03, 0.7, stemM, 0.15, 0.85, 0, 8);
      const leaves = [];
      [[0.62, 0], [0.75, 2.1], [0.88, 4.2], [1.0, 1.0], [1.12, 3.2]].forEach(([y, a]) => {
        const p = new THREE.Group(); p.position.set(0.15, y, 0); p.rotation.y = a; s.add(p);
        const l = sph(p, 0.17, leafM, 0.17, 0, 0); l.scale.set(1, 0.18, 0.45);
        leaves.push(p);
      });
      box(s, 0.03, 0.3, 0.06, mat(0x9aa3ab, { metalness: 0.4 }), 0.33, 0.55, 0.12); // soil sensor
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.3), mat(0xd6eef7, { transparent: true, opacity: 0.35, roughness: 0.1 })); tank.position.set(-0.85, 0.275, -0.1); s.add(tank);
      const water = box(s, 0.36, 0.4, 0.26, mat(0x3f9fd8, { transparent: true, opacity: 0.75 }), -0.85, 0.2, -0.1);
      cyl(s, 0.06, 0.06, 0.1, mat(0x2b2e33), -0.85, 0.6, -0.1);
      const curve = new THREE.CatmullRomCurve3([V(-0.85, 0.65, -0.1), V(-0.6, 1.05, -0.05), V(-0.1, 1.05, 0), V(0.05, 0.7, 0)]);
      add(s, new THREE.TubeGeometry(curve, 40, 0.018, 8, false), mat(0x8fd0ef, { transparent: true, opacity: 0.6 }));
      const drops = []; for (let i = 0; i < 7; i++) drops.push(sph(s, 0.025, mat(0x2f8fd0), 0, 0, 0));
      const b = board(s, 0.85, 0, 0.25);
      const dry = new THREE.Color(0xa58560), wet = new THREE.Color(0x4a3424);
      return { s, cam, period: 9, update(t) {
        // 0–3.5 s drying, 3.5–6 s pumping, then fresh again
        const m = t < 3.5 ? 1 - t / 3.5 : clamp01((t - 3.8) / 2.4);
        const pumping = t > 3.6 && t < 6.2;
        soil.color.copy(dry).lerp(wet, m);
        leaves.forEach((p, i) => { p.rotation.z = lerp(-0.75, 0.25, ease(m)) - i * 0.03; });
        water.scale.y = lerp(1, 0.75, clamp01((t - 3.6) / 2.6)) * (t > 8.6 ? 1 : 1); water.position.y = 0.2 * water.scale.y;
        drops.forEach((d, i) => { d.visible = pumping; if (pumping) d.position.copy(curve.getPoint(((t * 0.9) + i / drops.length) % 1)); });
        setLed(b.led, m < 0.35 ? 0xff4040 : pumping ? 0x3d9bff : 0x33dd77, true);
      } };
    }

    /* ---------- 2. lights that save energy ---------- */
    function lights() {
      const s = base(0xe9eef2, 0xd9cdb8, 0xe6edf2);
      s.children[0].intensity = 0.58; s.children[1].intensity = 0.3;
      const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50); cam.position.set(0.3, 1.5, 3.1); cam.lookAt(0, 0.7, 0);
      box(s, 0.06, 2.2, 2.4, mat(0xdde6ec), -1.6, 1.1, 0);
      cyl(s, 0.006, 0.006, 0.5, mat(0x333333), 0, 1.95, -0.2, 6);
      cyl(s, 0.05, 0.28, 0.2, mat(0xf2f2f2, { side: THREE.DoubleSide }), 0, 1.62, -0.2, 24);
      const bulb = glowMat(0xfff1c2); sph(s, 0.08, bulb, 0, 1.55, -0.2);
      const lamp = new THREE.PointLight(0xffe2a8, 0, 4.5, 2); lamp.position.set(0, 1.45, -0.2); s.add(lamp);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.005, -0.1); s.add(pool);
      sph(s, 0.07, mat(0xf4f4f4), 1.1, 1.6, -1.15).scale.set(1, 1, 0.6); // motion sensor (PIR)
      const pir = glowMat(0xff4040); sph(s, 0.018, pir, 1.1, 1.53, -1.1);
      const who = person(s, 0x2c4e9e);
      board(s, -1.3, 0.9, -1.1).g.rotation.x = Math.PI / 2;
      return { s, cam, period: 9, update(t) {
        // walk in (0–2 s), stay (2–4 s), walk out (4–6 s); the light stays on 1.5 s after the room is empty
        const x = t < 2 ? lerp(2.2, 0.4, ease(t / 2)) : t < 4 ? 0.4 : lerp(0.4, 2.4, ease((t - 4) / 2));
        const walking = (t < 2) || (t > 4 && t < 6);
        who.position.set(x, 0, 0.3); who.rotation.y = t < 3 ? -Math.PI / 2 : Math.PI / 2;
        const sw = walking ? Math.sin(t * 10) * 0.5 : 0; who.userData.lL.rotation.x = sw; who.userData.lR.rotation.x = -sw;
        const inRoom = x < 1.5;
        const on = inRoom || (t > 6 && t < 7.5);
        const k = on ? 1 : clamp01(1 - (t - 7.5) / 0.4);
        lamp.intensity = 0.75 * k; bulb.emissiveIntensity = 1.4 * k; pool.material.opacity = 0.22 * k;
        pir.emissiveIntensity = inRoom ? 1.5 : 0;
      } };
    }

    /* ---------- 3. door and window alarm ---------- */
    function door() {
      const s = base(0xeef2f5, 0xcfc3ae, 0xe2e9ee);
      const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50); cam.position.set(0.9, 1.4, 3.0); cam.lookAt(0.1, 0.8, -0.6);
      const frameM = mat(0xf4f4f4);
      box(s, 0.08, 1.8, 0.12, frameM, -0.85, 0.9, -1.15); box(s, 0.08, 1.8, 0.12, frameM, 0.05, 0.9, -1.15); box(s, 0.98, 0.08, 0.12, frameM, -0.4, 1.82, -1.15);
      const hinge = new THREE.Group(); hinge.position.set(-0.81, 0, -1.12); s.add(hinge);
      box(hinge, 0.82, 1.76, 0.05, mat(0x8a5a3c, { roughness: 0.7 }), 0.41, 0.88, 0);
      sph(hinge, 0.035, mat(0xd4af37, { metalness: 0.8, roughness: 0.3 }), 0.72, 0.9, 0.05);
      box(hinge, 0.04, 0.12, 0.03, mat(0xffffff), 0.79, 1.2, 0.04); // magnet on the door
      box(s, 0.04, 0.12, 0.03, mat(0xffffff), 0.1, 1.2, -1.08);      // reed switch on the frame
      box(s, 0.6, 0.04, 0.3, mat(0xd8c4a3), 0.75, 0.6, -0.95);       // shelf
      const b = board(s, 0.65, 0.62, -0.95);
      cyl(s, 0.06, 0.06, 0.05, mat(0x1d2126), 0.92, 0.645, -0.95);  // buzzer
      const rings = [0, 1, 2].map(() => { const r = add(s, new THREE.TorusGeometry(0.1, 0.008, 6, 32), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0 }), 0.92, 0.75, -0.95); r.rotation.x = Math.PI / 2; return r; });
      const ph = phone(s, 1.25, 0.0, 0.2, -0.45);
      return { s, cam, period: 7, update(t) {
        const open = t < 1 ? 0 : t < 2.2 ? ease((t - 1) / 1.2) : t < 4.8 ? 1 : t < 6 ? 1 - ease((t - 4.8) / 1.2) : 0;
        hinge.rotation.y = -1.1 * open;
        const alarm = open > 0.05 && t < 6.2;
        rings.forEach((r, i) => { const k = ((t * 1.4) + i / 3) % 1; r.scale.setScalar(1 + k * 3); r.material.opacity = alarm ? 0.8 * (1 - k) : 0; });
        setLed(b.led, alarm ? 0xff4040 : 0x33dd77, alarm ? Math.floor(t * 6) % 2 === 0 : true);
        ph.show(alarm && t > 1.6 ? ['🔔 Alert', 'Front door opened!'] : null);
      } };
    }

    /* ---------- 4. water-leak warning ---------- */
    function leak() {
      const s = base(0xeef3f6, 0xd8dee3, 0xe4ebf0);
      const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50); cam.position.set(0.5, 1.5, 2.9); cam.lookAt(0, 0.45, -0.4);
      box(s, 1.3, 0.9, 0.5, mat(0xf2f2f2), -0.6, 0.45, -0.95);                 // cabinet
      box(s, 1.36, 0.06, 0.56, mat(0x9aa3ab, { roughness: 0.4 }), -0.6, 0.93, -0.95);
      const pipeM = mat(0xc9ced4, { metalness: 0.6, roughness: 0.3 });
      cyl(s, 0.045, 0.045, 0.7, pipeM, 0.3, 0.75, -1.12, 12);
      const elbow = add(s, new THREE.TorusGeometry(0.12, 0.045, 10, 16, Math.PI / 2), pipeM, 0.42, 0.4, -1.12); elbow.rotation.z = Math.PI;
      box(s, 0.12, 0.12, 0.12, mat(0x8f969c, { metalness: 0.6 }), 0.3, 0.43, -1.1); // leaky joint
      const drops = [0, 1, 2].map(() => sph(s, 0.025, mat(0x3f9fd8), 0.3, 0.35, -1.06));
      const puddle = add(s, new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: 0x5fb3e6, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.2 }), 0.3, 0.004, -0.95);
      puddle.rotation.x = -Math.PI / 2;
      box(s, 0.22, 0.02, 0.08, mat(0x2b2e33), 0.3, 0.01, -0.45);                 // the two-wire sensor
      box(s, 0.015, 0.012, 0.07, mat(0xd4af37, { metalness: 0.8 }), 0.25, 0.026, -0.45); box(s, 0.015, 0.012, 0.07, mat(0xd4af37, { metalness: 0.8 }), 0.35, 0.026, -0.45);
      const b = board(s, 0.95, 0, -0.3);
      const ph = phone(s, 1.35, 0, 0.35, -0.5);
      return { s, cam, period: 8, update(t) {
        const r = t < 0.6 ? 0.001 : t < 4.5 ? lerp(0.05, 0.62, (t - 0.6) / 3.9) : t < 6.8 ? 0.62 : lerp(0.62, 0.001, (t - 6.8) / 1.2);
        puddle.scale.setScalar(Math.max(0.001, r));
        drops.forEach((d, i) => { const k = ((t * 1.3) + i / 3) % 1; d.position.y = 0.36 - k * 0.36; d.visible = t < 6.6; });
        const wet = r > 0.52;
        setLed(b.led, wet ? 0xff4040 : 0x33dd77, wet ? Math.floor(t * 6) % 2 === 0 : true);
        ph.show(wet ? ['💧 Leak!', 'Water under the sink'] : null);
      } };
    }

    /* ---------- 5. classroom air checker ---------- */
    function air() {
      const s = base(0xeef3f6, 0xcbbfa8, 0xe2eaef);
      const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50); cam.position.set(0.4, 1.45, 2.9); cam.lookAt(0, 0.75, -0.4);
      box(s, 1.6, 0.06, 0.8, mat(0xb98b5e), -0.2, 0.62, -0.5);
      [[-0.9, -0.8], [0.5, -0.8], [-0.9, -0.2], [0.5, -0.2]].forEach(([x, z]) => box(s, 0.05, 0.6, 0.05, mat(0x8a6a48), x, 0.3, z));
      box(s, 0.34, 0.5, 0.2, mat(0xf4f6f8), 0.15, 0.9, -0.5);                     // sensor box with a mini traffic light
      box(s, 0.16, 0.42, 0.02, mat(0x1d2126), 0.15, 0.9, -0.39);
      const lamps = [0xff3030, 0xffb400, 0x1fd067].map((c, i) => { const m = glowMat(c); sph(s, 0.045, m, 0.15, 1.03 - i * 0.13, -0.37); return m; });
      // the window on the back wall
      const fr = mat(0xf4f4f4);
      box(s, 1.0, 0.06, 0.08, fr, -0.6, 1.95, -1.15); box(s, 1.0, 0.06, 0.08, fr, -0.6, 1.25, -1.15); box(s, 0.06, 0.76, 0.08, fr, -1.1, 1.6, -1.15); box(s, 0.06, 0.76, 0.08, fr, -0.1, 1.6, -1.15);
      box(s, 0.94, 0.66, 0.01, mat(0xbfe3f5, { roughness: 0.1 }), -0.6, 1.6, -1.18);
      const sash = new THREE.Group(); sash.position.set(-1.07, 1.6, -1.12); s.add(sash);
      box(sash, 0.46, 0.64, 0.03, mat(0xe9f6fc, { transparent: true, opacity: 0.6, roughness: 0.05 }), 0.23, 0, 0);
      const puffs = []; for (let i = 0; i < 14; i++) { const p = sph(s, 0.06 + (i % 3) * 0.02, new THREE.MeshStandardMaterial({ color: 0x9aa7b2, transparent: true, opacity: 0, roughness: 1 }), 0, 0, 0); p.userData = { x: -1.2 + (i * 0.37) % 2.2, z: -0.9 + (i * 0.53) % 1.4, sp: 0.15 + (i % 4) * 0.05, o: i * 0.71 }; puffs.push(p); }
      return { s, cam, period: 10, update(t) {
        const level = t < 4.5 ? t / 4.5 : t < 5.2 ? 1 : clamp01(1 - (t - 5.2) / 3.5);
        const open = t < 4.6 ? 0 : t < 5.4 ? ease((t - 4.6) / 0.8) : t < 9 ? 1 : 1 - ease((t - 9) / 0.8);
        sash.rotation.y = -1.0 * open;
        const k = level < 0.4 ? 2 : level < 0.75 ? 1 : 0;
        lamps.forEach((m, i) => { m.emissiveIntensity = i === k ? 1.8 : 0; });
        puffs.forEach((p, i) => { const u = p.userData; p.position.set(u.x + Math.sin(t + u.o) * 0.1, 0.8 + ((t * u.sp + u.o) % 1.2), u.z); p.material.opacity = (i / puffs.length < level ? 0.35 : 0); });
      } };
    }

    /* ---------- 6. parking helper ---------- */
    function parking() {
      const s = base(0xe9edf0, 0x7d868f, 0xd9dfe4);
      const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 50); cam.position.set(2.0, 1.7, 2.4); cam.lookAt(0, 0.4, -0.3);
      box(s, 0.06, 0.02, 2.4, mat(0xf2b705), -0.6, 0.005, 0.1); box(s, 0.06, 0.02, 2.4, mat(0xf2b705), 0.6, 0.005, 0.1); // parking lines
      box(s, 0.3, 0.42, 0.1, mat(0xf4f6f8), 0, 0.95, -1.13);                        // sensor box
      [-0.06, 0.06].forEach((x) => { const e = cyl(s, 0.035, 0.035, 0.04, mat(0xc9ced4, { metalness: 0.6 }), x, 0.82, -1.06, 16); e.rotation.x = Math.PI / 2; });
      const lamps = [0xff3030, 0xffb400, 0x1fd067].map((c, i) => { const m = glowMat(c); sph(s, 0.035, m, -0.09 + i * 0.09, 1.08, -1.07); return m; });
      const waves = [0, 1, 2].map(() => { const w = add(s, new THREE.TorusGeometry(0.1, 0.006, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3d9bff, transparent: true, opacity: 0 }), 0, 0.82, -1.0); return w; });
      // a simple car, nose towards the wall
      const car = new THREE.Group(); s.add(car);
      const paint = mat(0xc93131, { metalness: 0.3, roughness: 0.35 });
      box(car, 0.72, 0.22, 1.45, paint, 0, 0.22, 0);
      box(car, 0.62, 0.2, 0.75, mat(0x22303b, { roughness: 0.15, metalness: 0.2 }), 0, 0.42, 0.08);
      box(car, 0.6, 0.03, 0.6, paint, 0, 0.53, 0.1);
      [[-0.37, -0.45], [0.37, -0.45], [-0.37, 0.45], [0.37, 0.45]].forEach(([x, z]) => { const w = cyl(car, 0.13, 0.13, 0.1, mat(0x1a1b1d), x, 0.13, z, 18); w.rotation.z = Math.PI / 2; });
      [-0.22, 0.22].forEach((x) => box(car, 0.14, 0.05, 0.02, glowMat(0xfff4cf), x, 0.27, -0.73).material.emissiveIntensity = 0.6);
      return { s, cam, period: 7.5, update(t) {
        const z = t < 3.2 ? lerp(2.4, 0.15, ease(t / 3.2)) : t < 5.2 ? 0.15 : lerp(0.15, 2.4, ease((t - 5.2) / 2));
        car.position.set(0, 0, z);
        const gap = z - 0.725 + 1.13 - 0.75; // nose-to-wall distance
        const k = gap > 1.3 ? 2 : gap > 0.75 ? 1 : 0;
        lamps.forEach((m, i) => { m.emissiveIntensity = i === k ? 1.8 : 0; });
        waves.forEach((w, i) => { const f = ((t * 1.5) + i / 3) % 1; w.position.z = -1.0 + f * Math.max(0.2, gap); w.scale.setScalar(1 + f * 2); w.material.opacity = 0.7 * (1 - f); });
      } };
    }

    const MAKERS = { plant, lights, door, leak, air, parking };
    const items = [];
    [...canvases].forEach((cv) => {
      const make = MAKERS[cv.dataset.proj]; if (!make) return;
      const sc = make();
      items.push({ cv, ctx: cv.getContext('2d'), sc, visible: false, t0: Math.random() * 3 });
    });
    if (!items.length) return null;

    // one renderer, sized to the biggest card
    let rw = 0, rh = 0;
    function sizeAll() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let mw = 1, mh = 1;
      items.forEach((it) => {
        const w = Math.max(1, Math.round(it.cv.clientWidth * dpr)), h = Math.max(1, Math.round(it.cv.clientHeight * dpr));
        if (it.cv.width !== w || it.cv.height !== h) { it.cv.width = w; it.cv.height = h; }
        it.w = w; it.h = h; mw = Math.max(mw, w); mh = Math.max(mh, h);
        it.sc.cam.aspect = w / h; it.sc.cam.updateProjectionMatrix();
      });
      if (mw !== rw || mh !== rh) { rw = mw; rh = mh; renderer.setSize(rw, rh, false); }
    }
    function draw(it, t) {
      it.sc.update(t % it.sc.period);
      renderer.setViewport(0, 0, it.w, it.h); renderer.setScissor(0, 0, it.w, it.h); renderer.setScissorTest(true);
      renderer.render(it.sc.s, it.sc.cam);
      // the picture sits in the bottom-left corner of the renderer's canvas
      it.ctx.drawImage(renderer.domElement, 0, rh - it.h, it.w, it.h, 0, 0, it.w, it.h);
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
    // draw one picture of each straight away (and keep it still with reduced motion)
    items.forEach((it) => draw(it, it.sc.period * 0.45));
    return { items, draw, start };
  }
  window.KKProjects = { mount };
})();
