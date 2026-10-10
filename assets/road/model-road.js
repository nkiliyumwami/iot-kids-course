/* Model road for the traffic-light lessons: a pretend street behind the breadboard, so learners see what each
   light means for real traffic. Shared by every lesson that shows the road (lessons 1, 3, 4…).

   Red: cars wait at the stop line. Yellow: a car that can stop safely stops; a car already too close to stop
   carries on (braking hard is dangerous). Green: cars cross. The two traffic lights copy the LEDs.

   Usage (inside a lesson script, after the scene exists):
     const R = ModelRoad.create({ THREE, scene, renderer, getLit: () => litIndex, reduceMotion,
                                  glow: getGlowTexture, tagPart, suddenRed: false });
     R.group, R.cars, R.update(dt), R.setLamps(idx), R.placeAll(), R.ROAD_Z, R.ROAD_W
   getLit() returns 0 red, 1 yellow, 2 green, anything else = lights off.
   suddenRed: true when red can come straight after green (a pedestrian button): a car too close to stop carries on.

   Everything is drawn by code (no image files), with a small built-in reflection map so paint and glass look real. */
(function () {
  'use strict';

  function create(o) {
    const THREE = o.THREE;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const ROAD_Z = -9.6, LANE = 0.7, ROAD_W = 2.8, ROAD_X = 13, STOP_S = -1.85;
    const road = new THREE.Group();
    road.position.y = -0.38;
    o.scene.add(road);

    function mesh(geo, m, x = 0, y = 0, z = 0, shadow = true) {
      const k = new THREE.Mesh(geo, m);
      k.position.set(x, y, z);
      k.castShadow = shadow; k.receiveShadow = true;
      return k;
    }

    /* ---------- a soft studio sky for reflections (only used by the road's own materials) ---------- */
    let envMap = null;
    try {
      const pm = new THREE.PMREMGenerator(o.renderer);
      const es = new THREE.Scene();
      const sg = new THREE.SphereGeometry(10, 32, 16);
      const col = [], pos = sg.attributes.position, top = new THREE.Color(0xd6e4ee), mid = new THREE.Color(0xf6f8fa), low = new THREE.Color(0x7d878f), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / 10;
        if (t > 0) c.copy(mid).lerp(top, Math.min(1, t * 1.6)); else c.copy(mid).lerp(low, Math.min(1, -t * 3));
        col.push(c.r, c.g, c.b);
      }
      sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      es.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      for (const [x, z, w] of [[3, 2, 6], [-4, -3, 5], [0, 6, 4]]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        p.position.set(x, 8, z); p.lookAt(0, 0, 0); es.add(p);
      }
      envMap = pm.fromScene(es, 0.03).texture;
      pm.dispose();
    } catch (e) { envMap = null; }
    const std = (color, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0, envMap, envMapIntensity: 0.6 }, p));
    const phys = (color, p = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.3, metalness: 0, envMap, envMapIntensity: 1 }, p));

    /* ---------- canvas textures: asphalt, paving, contact shadow ---------- */
    function canvas(w, h, draw) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, o.renderer.capabilities.getMaxAnisotropy ? o.renderer.capabilities.getMaxAnisotropy() : 1);
      return t;
    }
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const asphaltTex = canvas(512, 512, (g, w, h) => {
      g.fillStyle = '#4b535b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 60 + rnd() * 50; g.fillStyle = `rgba(${v},${v + 4},${v + 8},${0.25 + rnd() * 0.35})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
      // darker tyre tracks along each lane (v runs across the road)
      for (const lane of [-1, 1]) for (const off of [-0.27, 0.27]) {
        const y = h * (0.5 + (lane * LANE + off) / ROAD_W);
        const grd = g.createLinearGradient(0, y - 18, 0, y + 18);
        grd.addColorStop(0, 'rgba(30,34,38,0)'); grd.addColorStop(0.5, 'rgba(30,34,38,.28)'); grd.addColorStop(1, 'rgba(30,34,38,0)');
        g.fillStyle = grd; g.fillRect(0, y - 18, w, 36);
      }
      g.strokeStyle = 'rgba(28,32,36,.22)'; g.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    });
    asphaltTex.repeat.set((ROAD_X * 2 + 1) / ROAD_W, 1);
    const pavingTex = canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#cdd3d8'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { const v = 195 + rnd() * 40; g.fillStyle = `rgba(${v},${v + 3},${v + 6},.5)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      g.strokeStyle = '#b4bcc3'; g.lineWidth = 3;
      for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 2); g.lineTo(w, k * h / 2); g.stroke(); }
    });
    const shadowTex = canvas(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });

    /* ---------- the street ---------- */
    (function buildStreet() {
      const len = ROAD_X * 2 + 1;
      const asphalt = std(0xffffff, { map: asphaltTex, roughness: 0.95, envMapIntensity: 0.2 });
      road.add(mesh(new THREE.BoxGeometry(len, 0.03, ROAD_W), asphalt, 0, 0.015, ROAD_Z, false));
      const paint = std(0xf1f3f4, { roughness: 0.7, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
      const amber = std(0xf2b705, { roughness: 0.7, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
      const mark = (w, d, m, x, z) => road.add(mesh(new THREE.BoxGeometry(w, 0.006, d), m, x, 0.033, z, false));
      // sidewalks with paving and a rounded kerb stone
      const kerbShape = new THREE.Shape();
      kerbShape.moveTo(0, 0); kerbShape.lineTo(0.12, 0); kerbShape.lineTo(0.12, 0.1); kerbShape.quadraticCurveTo(0.12, 0.13, 0.09, 0.13); kerbShape.lineTo(0, 0.13);
      const kerbGeo = new THREE.ExtrudeGeometry(kerbShape, { depth: len, bevelEnabled: false });
      kerbGeo.rotateY(Math.PI / 2); kerbGeo.translate(-len / 2, 0, 0);
      const kerbMat = std(0xc9ced2, { roughness: 0.85 });
      for (const side of [-1, 1]) {
        const tex = pavingTex.clone(); tex.needsUpdate = true; tex.repeat.set(len / 0.72, 0.72 / 0.72);
        road.add(mesh(new THREE.BoxGeometry(len, 0.12, 0.72), std(0xffffff, { map: tex, roughness: 0.9, envMapIntensity: 0.2 }), 0, 0.06, ROAD_Z + side * (ROAD_W / 2 + 0.42)));
        // the kerb's rounded edge faces the road
        const k = mesh(kerbGeo, kerbMat, 0, 0, ROAD_Z + side * (ROAD_W / 2 + 0.12));
        if (side < 0) k.rotation.y = Math.PI;
        road.add(k);
        mark(len, 0.05, paint, 0, ROAD_Z + side * (ROAD_W / 2 - 0.12)); // edge line
      }
      for (let x = -ROAD_X + 0.4; x < ROAD_X; x += 1.1) if (Math.abs(x) > 2.4) mark(0.6, 0.05, amber, x, ROAD_Z);
      for (let z = ROAD_Z - ROAD_W / 2 + 0.25; z < ROAD_Z + ROAD_W / 2 - 0.1; z += 0.34) mark(2.2, 0.18, paint, 0, z); // zebra crossing
      mark(0.1, LANE * 2 - 0.1, paint, STOP_S, ROAD_Z + LANE);
      mark(0.1, LANE * 2 - 0.1, paint, -STOP_S, ROAD_Z - LANE);

      // street lamps and a few trees on the far pavement (nothing on the near side, so the road stays visible)
      const metal = std(0x8d969e, { metalness: 0.7, roughness: 0.35, envMapIntensity: 1 });
      for (const x of [-7.2, 7.8]) {
        const g = new THREE.Group(); g.position.set(x, 0.12, ROAD_Z - ROAD_W / 2 - 0.5);
        g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 16), metal, 0, 0.06, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.5, 12), metal, 0, 1.3, 0));
        const arm = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 10), metal, 0, 2.5, 0.25); arm.rotation.x = Math.PI / 2 - 0.25; g.add(arm);
        g.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.32), std(0x3a4148, { roughness: 0.4 }), 0, 2.56, 0.55));
        g.add(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.26), std(0xfff6dc, { emissive: 0xfff2cc, emissiveIntensity: 0.25 }), 0, 2.525, 0.55, false));
        road.add(g);
      }
      const trunk = std(0x6b4f3a, { roughness: 0.9, envMapIntensity: 0.2 });
      [[-10.6, 1.0], [-4.4, 0.9], [4.6, 1.05], [10.4, 0.95]].forEach(([x, s], i) => {
        const g = new THREE.Group(); g.position.set(x, 0.12, ROAD_Z - ROAD_W / 2 - 0.45); g.scale.setScalar(s);
        g.add(mesh(new THREE.BoxGeometry(0.42, 0.015, 0.42), std(0x5d4a3c, { roughness: 1 }), 0, 0.008, 0, false));
        g.add(mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.0, 10), trunk, 0, 0.5, 0));
        const leaf = std([0x4f8a4a, 0x5a9450, 0x467f45, 0x5c8f4c][i], { roughness: 0.85, envMapIntensity: 0.25 });
        for (const [lx, ly, lz, r] of [[0, 1.25, 0, 0.42], [0.22, 1.08, 0.08, 0.3], [-0.2, 1.1, -0.06, 0.32], [0.05, 1.5, -0.05, 0.3]]) g.add(mesh(new THREE.IcosahedronGeometry(r, 2), leaf, lx, ly, lz));
        road.add(g);
      });
    })();

    /* ---------- traffic lights: facing the learner, with a second set of lamps facing their cars ---------- */
    const lamps = [[], [], []]; // per colour: { m, glow, hex }
    const OFF = (hex) => new THREE.Color(hex).lerp(new THREE.Color(0x161b20), 0.86);
    function roundedRect(w, h, r) {
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return s;
    }
    function makeSignal(x, z, side) {
      const g = new THREE.Group(); g.position.set(x, 0.12, z);
      const pole = std(0x9aa3ab, { metalness: 0.75, roughness: 0.35, envMapIntensity: 1 });
      const body = std(0x22272d, { roughness: 0.45, envMapIntensity: 0.8 });
      const Y = 2.18, GAP = 0.36, R = 0.13;
      g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 20), pole, 0, 0.03, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.055, 0.065, Y - 0.5, 16), pole, 0, (Y - 0.5) / 2, 0));
      // a pedestrian push button, like the one in lesson 3
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.18, 0.08), std(0xf2b705, { roughness: 0.5 }), 0, 0.42, 0.08)); // at hand height
      const btn = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), std(0x15202a), 0, 0.39, 0.13, false); btn.rotation.x = Math.PI / 2; g.add(btn);
      const housingGeo = new THREE.ExtrudeGeometry(roundedRect(0.4, 1.12, 0.07), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 6 });
      housingGeo.translate(0, 0, -0.15);
      g.add(mesh(housingGeo, body, 0, Y, 0));
      const plateGeo = new THREE.ExtrudeGeometry(roundedRect(0.7, 1.42, 0.06), { depth: 0.02, bevelEnabled: false, curveSegments: 6 });
      g.add(mesh(plateGeo, std(0xf4f6f8, { roughness: 0.6 }), 0, Y, -0.24, false));
      g.add(mesh(new THREE.ExtrudeGeometry(roundedRect(0.64, 1.36, 0.05), { depth: 0.02, bevelEnabled: false, curveSegments: 6 }), body, 0, Y, -0.225, false));
      const hoodMat = std(0x22272d, { roughness: 0.5, side: THREE.DoubleSide });
      [0xff3030, 0xffb400, 0x1fd067].forEach((hex, k) => {
        const y = Y + GAP - k * GAP;
        const m = phys(OFF(hex), { roughness: 0.35, envMapIntensity: 0.35, emissive: hex, emissiveIntensity: 0 });
        const lens = mesh(new THREE.CylinderGeometry(R, R, 0.03, 28), m, 0, y, 0.17, false); lens.rotation.x = Math.PI / 2; g.add(lens);
        const hood = mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.16, 24, 1, true, -Math.PI / 2, Math.PI), hoodMat, 0, y, 0.25, false);
        hood.rotation.x = -Math.PI / 2; g.add(hood); // open half-tube over the top of the lens
        const sideLens = mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.03, 24), m, side * 0.215, y, 0, false); sideLens.rotation.z = Math.PI / 2; g.add(sideLens);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: o.glow(), color: hex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.set(0.95, 0.95, 1); glow.position.set(0, y, 0.3); g.add(glow);
        lamps[k].push({ m, glow, hex });
      });
      road.add(g);
    }
    makeSignal(-2.35, ROAD_Z + ROAD_W / 2 + 0.4, -1); // for cars driving to the right (near lane)
    makeSignal(2.35, ROAD_Z - ROAD_W / 2 - 0.4, 1);   // for cars driving to the left (far lane)
    function setLamps(idx) {
      lamps.forEach((list, k) => list.forEach((l) => {
        const on = idx === k;
        l.m.emissiveIntensity = on ? 2.2 : 0;
        l.m.color.copy(on ? new THREE.Color(l.hex) : OFF(l.hex));
        l.glow.material.opacity = on ? 0.9 : 0;
      }));
    }

    /* ---------- cars: three body styles with wheel arches, glass, lights, mirrors and plates ---------- */
    const STYLES = {
      sedan: { L: 1.6, W: 0.66, wr: 0.15, wx: 0.5, sill: 0.15, belt: 0.42, hoodY: 0.385, wsx: 0.3, roofF: 0.04, roofB: -0.38, roofY: 0.625, rx: -0.6, rearY: 0.39 },
      hatch: { L: 1.42, W: 0.64, wr: 0.145, wx: 0.45, sill: 0.15, belt: 0.43, hoodY: 0.39, wsx: 0.27, roofF: 0.03, roofB: -0.5, roofY: 0.645, rx: -0.69, rearY: 0.43 },
      suv: { L: 1.72, W: 0.7, wr: 0.175, wx: 0.54, sill: 0.19, belt: 0.52, hoodY: 0.49, wsx: 0.36, roofF: 0.12, roofB: -0.7, roofY: 0.8, rx: -0.84, rearY: 0.52 },
    };
    const geoCache = {};
    function carGeos(st) {
      if (geoCache[st]) return geoCache[st];
      const p = STYLES[st], h = p.L / 2, ar = p.wr + 0.035;
      const b = new THREE.Shape();
      b.moveTo(-h, p.sill + 0.07);
      b.quadraticCurveTo(-h, p.sill, -h + 0.06, p.sill);
      b.lineTo(-p.wx - ar, p.sill);
      b.absarc(-p.wx, p.wr, ar, Math.PI, 0, true);
      b.lineTo(p.wx - ar, p.sill);
      b.absarc(p.wx, p.wr, ar, Math.PI, 0, true);
      b.lineTo(h - 0.06, p.sill);
      b.quadraticCurveTo(h, p.sill, h, p.sill + 0.08);
      b.lineTo(h - 0.01, p.hoodY - 0.05);
      b.quadraticCurveTo(h - 0.03, p.hoodY, h - 0.16, p.hoodY + 0.01);
      b.lineTo(p.wsx, p.belt);
      b.lineTo(p.rx, p.belt);
      b.quadraticCurveTo(-h + 0.01, p.belt - 0.005, -h, p.rearY - 0.04);
      b.closePath();
      const body = new THREE.ExtrudeGeometry(b, { depth: p.W, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 4, curveSegments: 18 });
      body.translate(0, 0, -p.W / 2);
      const c = new THREE.Shape();
      c.moveTo(p.wsx, p.belt - 0.01);
      c.lineTo(p.roofF + 0.04, p.roofY - 0.02);
      c.quadraticCurveTo(p.roofF, p.roofY, p.roofF - 0.06, p.roofY);
      c.lineTo(p.roofB + 0.05, p.roofY);
      c.quadraticCurveTo(p.roofB, p.roofY - 0.005, p.roofB - 0.03, p.roofY - 0.04);
      c.lineTo(p.rx, p.belt - 0.01);
      c.closePath();
      const gw = p.W - 0.1;
      const glass = new THREE.ExtrudeGeometry(c, { depth: gw, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 10 });
      glass.translate(0, 0, -gw / 2);
      const r = new THREE.Shape();
      r.moveTo(p.roofF + 0.02, p.roofY - 0.005); r.quadraticCurveTo(p.roofF - 0.01, p.roofY + 0.025, p.roofF - 0.07, p.roofY + 0.025);
      r.lineTo(p.roofB + 0.06, p.roofY + 0.025); r.quadraticCurveTo(p.roofB + 0.01, p.roofY + 0.02, p.roofB - 0.01, p.roofY - 0.01); r.closePath();
      const rw = gw + 0.02;
      const roof = new THREE.ExtrudeGeometry(r, { depth: rw, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8 });
      roof.translate(0, 0, -rw / 2);
      // tyre: a lathe with rounded shoulders; rim with five spokes
      const R = p.wr, w = 0.11;
      const tyre = new THREE.LatheGeometry([V(R * 0.62, -w / 2, 0), V(R * 0.9, -w / 2, 0), V(R, -w * 0.32, 0), V(R, w * 0.32, 0), V(R * 0.9, w / 2, 0), V(R * 0.62, w / 2, 0)].map((v) => new THREE.Vector2(v.x, v.y)), 28);
      tyre.rotateX(Math.PI / 2);
      const rim = new THREE.CylinderGeometry(R * 0.64, R * 0.64, w * 0.8, 24); rim.rotateX(Math.PI / 2);
      const spoke = new THREE.BoxGeometry(R * 1.12, 0.022, 0.014);
      const cap = new THREE.CylinderGeometry(R * 0.16, R * 0.16, w * 0.86, 12); cap.rotateX(Math.PI / 2);
      const shadow = new THREE.PlaneGeometry(p.L + 0.35, p.W + 0.35); shadow.rotateX(-Math.PI / 2);
      return (geoCache[st] = { body, glass, roof, tyre, rim, spoke, cap, shadow });
    }
    function makeCar(st, hex) {
      const p = STYLES[st], G = carGeos(st), h = p.L / 2, half = p.W / 2 + 0.035;
      const g = new THREE.Group();
      const paint = phys(hex, { metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
      const glass = phys(0x16202a, { roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.5 });
      const trim = std(0x16191d, { roughness: 0.65, envMapIntensity: 0.3 });
      const chrome = std(0xd9dde1, { metalness: 1, roughness: 0.18, envMapIntensity: 1.2 });
      const rubber = std(0x1a1b1d, { roughness: 0.92, envMapIntensity: 0.1 });
      const head = std(0xfffbea, { emissive: 0xfff4cf, emissiveIntensity: 0.55, roughness: 0.1, envMapIntensity: 1 });
      const tail = std(0x7a1212, { emissive: 0xff2020, emissiveIntensity: 0.25, roughness: 0.2 });
      const plate = std(0xf4f5f0, { roughness: 0.5 });
      const shade = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
      shade.userData.alwaysTransparent = true;
      g.add(mesh(G.body, paint));
      g.add(mesh(G.glass, glass));
      g.add(mesh(G.roof, paint));
      // B-pillars between the side windows
      g.add(mesh(new THREE.BoxGeometry(0.05, p.roofY - p.belt - 0.02, p.W - 0.07), paint, (p.roofF + p.roofB) / 2 + 0.02, (p.roofY + p.belt) / 2, 0));
      // bumpers, grille, lights, plates, mirrors, door handles
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.07, p.W + 0.06), trim, h + 0.03, p.sill + 0.04, 0, false));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.07, p.W + 0.06), trim, -h - 0.03, p.sill + 0.04, 0, false));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.06, p.W * 0.42), trim, h + 0.03, p.hoodY - 0.11, 0, false));
      for (const z of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(0.03, 0.045, 0.15), head, h + 0.03, p.hoodY - 0.065, z * (p.W / 2 - 0.08), false));
        g.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.17), tail, -h - 0.032, p.rearY - 0.08, z * (p.W / 2 - 0.07), false));
        const mirror = mesh(new THREE.BoxGeometry(0.07, 0.045, 0.05), paint, p.wsx - 0.05, p.belt + 0.04, z * (half + 0.03), false); g.add(mirror);
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), chrome, 0.05, p.belt - 0.04, z * (half + 0.004), false));
        g.add(mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), chrome, -0.3, p.belt - 0.04, z * (half + 0.004), false));
      }
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.05, 0.17), plate, h + 0.058, p.sill + 0.09, 0, false));
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.05, 0.17), plate, -h - 0.058, p.sill + 0.09, 0, false));
      const wheels = [];
      for (const x of [-p.wx, p.wx]) for (const z of [-1, 1]) {
        const w = new THREE.Group(); w.position.set(x, p.wr, z * (p.W / 2 - 0.02));
        w.add(mesh(G.tyre, rubber));
        w.add(mesh(G.rim, chrome, 0, 0, 0, false));
        for (let k = 0; k < 5; k++) { const s = mesh(G.spoke, chrome, 0, 0, z * 0.046, false); s.rotation.z = (k * Math.PI * 2) / 5; w.add(s); }
        w.add(mesh(G.cap, trim, 0, 0, 0, false));
        g.add(w); wheels.push(w);
      }
      const sh = new THREE.Mesh(G.shadow, shade); sh.position.y = 0.004; sh.renderOrder = 1; g.add(sh);
      const mats = [paint, glass, trim, chrome, rubber, head, tail, plate, shade];
      g.userData = { wheels, tail, mats, shadow: sh };
      return g;
    }

    // two lanes: dir +1 drives to the right (near lane), dir -1 to the left (far lane); s runs along the driving direction
    const FLEET = [['sedan', 0xf4f6f8], ['suv', 0x2c4e9e], ['hatch', 0xc93131], ['sedan', 0x5b6670], ['hatch', 0x0a7480], ['suv', 0x1f262d], ['sedan', 0x7fa8c9], ['hatch', 0xd9821a]];
    const cars = [];
    [[1, -9.6], [1, -5.6], [1, 1.5], [1, 7.5], [-1, -8.2], [-1, -4.2], [-1, 3.4], [-1, 9.4]].forEach(([dir, s], k) => {
      const [st, hex] = FLEET[k];
      const g = makeCar(st, hex);
      g.rotation.y = dir > 0 ? 0 : Math.PI;
      road.add(g);
      cars.push({ g, dir, s, L: STYLES[st].L, wr: STYLES[st].wr, v: o.reduceMotion ? 0 : 1.2, vmax: [2.5, 2.1, 2.7, 2.3][k % 4], go: false, warned: false, a: 1 });
    });
    let yieldTo = null; // set by the pedestrians: () => true while someone is crossing
    const CAR_A = 1.8, CAR_B = 3.2, CAR_COMFY = 1.8, GAP = 0.55, FADE = 1.4;
    function placeCar(c) {
      c.g.position.set(c.dir * c.s, 0.035, ROAD_Z + c.dir * LANE);
      const a = Math.max(0, Math.min(1, (ROAD_X - Math.abs(c.s)) / FADE));
      c.g.visible = a > 0.01;
      if (a !== c.a) {
        c.a = a;
        c.g.userData.mats.forEach((m) => { m.transparent = a < 1 || !!m.userData.alwaysTransparent; m.opacity = a; });
      }
    }
    function update(dt) {
      if (!road.visible) return;
      const lit = o.getLit();
      const state = lit === 2 ? 'go' : lit === 1 ? 'warn' : 'stop';
      for (const dir of [1, -1]) {
        const lane = cars.filter((c) => c.dir === dir).sort((a, b) => b.s - a.s);
        let entered = false; // one car per lane may come back in each frame
        lane.forEach((c, i) => {
          const front = c.s + c.L / 2;
          const before = front <= STOP_S + 0.02;
          if (!before) { c.go = false; c.warned = false; }
          // yellow (or a sudden red): decide once. Too close to stop gently → carry on; otherwise stop at the line.
          if (before && (state === 'warn' || (o.suddenRed && state === 'stop')) && !c.warned) {
            c.warned = true;
            const d = STOP_S - front;
            c.go = d < (c.v * c.v) / (2 * CAR_COMFY) && c.v > 0.5; // stopping here would need hard braking
          }
          if (state === 'go') { c.go = false; c.warned = false; }
          let limit = Infinity;
          if (before && state !== 'go' && !c.go) limit = STOP_S - c.L / 2 - 0.06;
          // give way to anyone on the crossing, whatever colour the light is
          if (before && yieldTo && yieldTo()) limit = Math.min(limit, STOP_S - c.L / 2 - 0.06);
          // keep a safe gap to the car in front
          const lead = i > 0 ? lane[i - 1] : null;
          if (lead && lead.g.visible) limit = Math.min(limit, lead.s - lead.L / 2 - c.L / 2 - GAP);
          const room = Math.max(0, limit - c.s);
          const target = o.reduceMotion ? 0 : Math.min(c.vmax, Math.sqrt(2 * CAR_B * room));
          const v0 = c.v;
          c.v += Math.max(-CAR_B * 2 * dt, Math.min(CAR_A * dt, target - c.v));
          c.v = Math.max(0, c.v);
          c.s = Math.min(c.s + c.v * dt, limit === Infinity ? Infinity : Math.max(c.s, limit));
          // drove off the far end: come back in at the start after a short random wait, at a slightly different
          // speed, so the traffic doesn't fall into step with the lights
          if (c.s > ROAD_X + 0.2) {
            if (c.wait == null) c.wait = Math.random() * 3;
            c.wait -= dt;
            const last = lane[lane.length - 1];
            if (c.wait <= 0 && !entered && (last === c || last.s - last.L / 2 > -ROAD_X - 0.2 + c.L / 2 + GAP)) {
              entered = true;
              c.s = -ROAD_X - 0.2; c.vmax = 2 + Math.random() * 0.8; c.v = c.vmax * 0.8; c.wait = null;
            }
          }
          c.g.userData.wheels.forEach((w) => { w.rotation.z -= (c.v * dt) / c.wr; });
          if (dt > 0) {
            const braking = c.v < 0.05 || c.v < v0 - 0.0005;
            c.g.userData.tail.emissiveIntensity = braking ? 1.8 : 0.25;
          }
          placeCar(c);
        });
      }
    }
    cars.forEach(placeCar);

    /* ---------- optional car models (.glb) ----------
       Set CAR_MODELS (below) to use model files from assets/models/cars/ instead of the code-drawn car bodies.
       If it is null, or anything fails to load, the code-drawn cars stay. Example:
         { credit: 'Car Kit by Kenney (kenney.nl), CC0', forward: '+z', wheelAxis: 'x',
           models: [ { file: 'sedan.glb' }, { file: 'suv.glb', length: 1.75 } ] }
       forward: the direction the model's nose points in its file (+z, -z, +x or -x); length: how long the car should be
       on our road (default 1.6); wheels are the nodes whose name contains "wheel" and spin around wheelAxis. */
    const CAR_MODELS = null;
    const base = o.base == null ? '../../' : o.base;
    function loadScript(src) {
      return new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    }
    async function useModels() {
      const man = o.carModels !== undefined ? o.carModels : CAR_MODELS;
      if (!man || !man.models || !man.models.length) return;
      if (!THREE.GLTFLoader) await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
      const loader = new THREE.GLTFLoader();
      const files = {};
      const get = (f) => files[f] || (files[f] = new Promise((ok, no) => loader.load(base + 'assets/models/cars/' + f, (g) => ok(g.scene), undefined, no)));
      const turn = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 }[man.forward || '+z'];
      const axis = (man.wheelAxis || 'x').toLowerCase();
      await Promise.all(cars.map(async (c, k) => {
        const spec = man.models[k % man.models.length];
        const src = await get(spec.file);
        const model = src.clone(true);
        const holder = new THREE.Group();
        holder.add(model);
        model.rotation.y = turn; // nose along +x, like the code-drawn cars
        holder.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model), size = new THREE.Vector3(), mid = new THREE.Vector3();
        box.getSize(size); box.getCenter(mid);
        const L = spec.length || man.length || 1.6, k2 = L / size.x;
        holder.scale.setScalar(k2);
        model.position.set(-mid.x, -box.min.y, -mid.z);
        const mats = [], wheels = [];
        model.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true; n.receiveShadow = true;
            n.material = Array.isArray(n.material) ? n.material.map((m) => m.clone()) : n.material.clone();
            (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (envMap && !m.envMap) { m.envMap = envMap; m.envMapIntensity = 0.7; } mats.push(m); });
          }
          if (/wheel/i.test(n.name) && !wheels.some((w) => { let p = n.parent; while (p) { if (p === w) return true; p = p.parent; } return false; })) wheels.push(n);
        });
        const g = c.g, shadow = g.userData.shadow;
        g.clear();
        g.add(holder);
        if (shadow) { const pp = shadow.geometry.parameters; shadow.scale.set((L + 0.35) / pp.width, 1, (size.z * k2 + 0.35) / pp.height); g.add(shadow); mats.push(shadow.material); }
        c.L = L; c.wr = Math.max(0.08, (spec.wheelRadius || size.y * 0.22) * (spec.wheelRadius ? 1 : k2));
        const spin = wheels.map((w) => ({ w, axis }));
        g.userData = { wheels: spin.map((x) => ({ rotation: { set z(v) { x.w.rotation[x.axis] = -v; }, get z() { return -x.w.rotation[x.axis]; } } })), tail: { emissiveIntensity: 0 }, mats, shadow };
        c.a = -1; placeCar(c);
      }));
      road.userData.carCredit = man.credit || '';
    }
    useModels().catch(() => { /* keep the code-drawn cars */ });
    if (o.tagPart) o.tagPart(road, 'road');
    return { group: road, cars, update, setLamps, placeCar, placeAll: () => cars.forEach(placeCar), setYield: (fn) => { yieldTo = fn; }, envMap, ROAD_Z, ROAD_W, LANE, STOP_S };
  }
  window.ModelRoad = { create };
})();
