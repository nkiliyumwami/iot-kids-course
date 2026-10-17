/* Virtual Traffic Light Lab: the 3D bench. A thin adapter over the shared CircuitKit (assets/circuit/kit3d.js):
   it builds the bench (breadboard, ESP32, USB cable and a parts tray) and shows what a hole, pin, rail or part is.
   The kit itself is not changed. Everything 3D lives here, so the rest of the lab never touches three.js.

   const view = VLabView.create({ host, layer, curriculum });   // throws if the 3D can't start */
(function () {
  'use strict';

  const GOLD = 0xf2b705, BLUE = 0x2f6fde, RED = 0xd93b3b, DARK = 0x6f7a85, TEAL = 0x0a7480, BLACK_WIRE = 0x2b2b2e;

  function create(opts) {
    const C = opts.curriculum;
    const kit = window.CircuitKit.create({ host: opts.host, layer: opts.layer });
    const { THREE, V, holeAt, railAt, pinAt, HEADER_TOP, FAR_ROWS, ESP } = kit;
    kit.skipParts.delete('breadboard'); // in this lab the breadboard itself can be tapped too
    const half = (r) => (FAR_ROWS.includes(r) ? 'far' : 'near');

    /* ---------- the bench ---------- */
    const breadboard = kit.makeBreadboard(); kit.scene.add(breadboard);
    // gold boxes on the pins this lab uses: D25, D26, D27 and the GND next to D13
    const pinK = (id) => kit.pinById(id).k;
    const esp = kit.makeESP32(C.CHANNELS.map((ch) => ['near', pinK(ch.pin)]).concat([['near', pinK(C.GROUND_PIN)]]));
    kit.scene.add(esp);
    const usb = kit.makeUSB(); kit.scene.add(usb);
    let plugged = true;
    function setPlugged(on) { plugged = on; usb.userData.setPlugged(on); esp.userData.setPower(on); }
    setPlugged(true);

    // the parts tray in front of the breadboard: 3 LEDs, 3 resistors, 3 signal wires and 4 black wires
    const TABLE = -0.39;
    const trayBase = new THREE.Group(); kit.scene.add(trayBase);
    trayBase.add(kit.mesh(new THREE.BoxGeometry(8.6, 0.06, 1.75), kit.mat(0xffffff, { roughness: 0.7 }), 0, TABLE + 0.03, 3.95, false));
    trayBase.add(kit.mesh(new THREE.BoxGeometry(8.6, 0.12, 0.06), kit.mat(0xb9d7dc, { roughness: 0.7 }), 0, TABLE + 0.06, 3.1, false));
    trayBase.add(kit.mesh(new THREE.BoxGeometry(8.6, 0.12, 0.06), kit.mat(0xb9d7dc, { roughness: 0.7 }), 0, TABLE + 0.06, 4.8, false));

    function looseResistor() {
      const g = new THREE.Group();
      const lead = kit.mat(0xc9ced4, { metalness: 0.3, roughness: 0.35 });
      g.add(kit.rod(V(-0.62, 0, 0), V(0.62, 0, 0), 0.016, lead));
      const bodyMat = kit.mat(0xd8c08e, { roughness: 0.5 });
      const body = kit.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 20), bodyMat); body.rotation.z = Math.PI / 2; g.add(body);
      for (const x of [-0.2, 0.2]) g.add(kit.mesh(new THREE.SphereGeometry(0.1, 16, 12), bodyMat, x, 0, 0));
      // 330 Ω: orange, orange, brown, then gold
      for (const [x, col] of [[-0.17, 0xf08a24], [-0.08, 0xf08a24], [0.01, 0x7a4a22], [0.17, 0xc9a227]]) {
        const b = kit.mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.045, 20), kit.mat(col, { roughness: 0.4, metalness: col === 0xc9a227 ? 0.6 : 0 }), x, 0, 0);
        b.rotation.z = Math.PI / 2; g.add(b);
      }
      return g;
    }
    const looseWire = (x, z, color) => kit.makeWire([V(x, TABLE + 0.39, z), V(x + 0.45, TABLE + 0.41, z + 0.3), V(x + 1.0, TABLE + 0.4, z + 0.12), V(x + 1.45, TABLE + 0.39, z + 0.36)], color).group;

    const trayParts = [];
    const put = (obj, part) => { kit.tagPart(obj, part); kit.scene.add(obj); trayParts.push(obj); return obj; };
    // kept by kind, so a part leaves the tray when it is placed on the board (see syncTray)
    const tray = { led: {}, sig: {}, res: [], black: [] };
    C.CHANNELS.forEach((ch, i) => {
      const led = kit.makeLED(ch.led); led.rotation.x = Math.PI / 2; led.position.set(-3.75 + i * 0.75, TABLE + 0.32, 3.55);
      tray.led[ch.key] = put(led, 'led-' + ch.key);
    });
    [3.45, 3.95, 4.45].forEach((z) => { const r = looseResistor(); r.position.set(-1.05, TABLE + 0.16, z); tray.res.push(put(r, 'resistor')); });
    C.CHANNELS.forEach((ch, i) => { tray.sig[ch.key] = put(looseWire(0.25, 3.3 + i * 0.45, ch.wire), 'wire-signal'); });
    [0, 1, 2, 3].forEach((i) => tray.black.push(put(looseWire(2.15 + (i % 2) * 0.1, 3.3 + i * 0.36, BLACK_WIRE), 'wire-ground')));

    /* ---------- labels that follow the camera (the "Show labels" switch hides them) ---------- */
    // Pin labels never cover each other: when D25, D26 and D27 are far enough apart on screen each gets its own label
    // (and the board its own name); otherwise one stacked label names the board and lists all three. Worked out once per frame.
    let pinsApart = false;
    kit.addLabel('ESP32 DevKit', V(ESP.x0 + 0.3, 0.05, ESP.cz), { obj: esp, lift: 6, show: () => pinsApart });
    kit.addLabel('Breadboard', V(-3.9, 0.02, 2.62), { obj: breadboard, lift: 6 });
    kit.addLabel('Parts tray', V(3.6, TABLE + 0.1, 4.75), { lift: 6 });
    kit.addLabel('USB cable', V(ESP.x1 + 1.6, 0.05, ESP.cz), { obj: usb, lift: 8 });
    // Part tags (330 Ω, + long, − short) only when holes are far enough apart on screen to fit them: zoomed out on a
    // phone they would cover the LEDs, and nothing may hide the LEDs. Zoom in and they come back.
    let tagsFit = true;
    kit.onFrame(() => {
      const a = screenOf({ pin: C.CHANNELS[0].pin }), b = screenOf({ pin: C.CHANNELS[1].pin });
      pinsApart = Math.abs(a.x - b.x) >= 70;
      const h1 = screenOf({ hole: [7, 'i'] }), h2 = screenOf({ hole: [8, 'i'] });
      tagsFit = Math.hypot(h1.x - h2.x, h1.y - h2.y) >= 14;
    });
    kit.addLabel('GND', pinAt(C.GROUND_PIN, HEADER_TOP + 0.05), { cls: 'pin', lift: 14 });
    // While a program runs, the pin labels say HIGH or LOW (green / grey), so the pins can be watched like the code.
    let pinState = null;
    const pinWord = (ch) => { const v = pinState && pinState[ch.pin.slice(5)]; return v === 'high' ? ' <i class="st high">HIGH</i>' : v === 'low' ? ' <i class="st low">LOW</i>' : ''; };
    const refresh = (html) => (L) => { const h = html(); if (L._h !== h) { L.el.firstElementChild.innerHTML = h; L._h = h; } };
    C.CHANNELS.forEach((ch) => { const html = () => `${ch.pin.slice(5)} · ${ch.name}${pinWord(ch)}`;
      kit.addLabel(html(), pinAt(ch.pin, HEADER_TOP + 0.05), { cls: 'pin', lift: 14, show: () => pinsApart, update: refresh(html) }); });
    const stackHtml = () => '<em>ESP32 DevKit</em>' + C.CHANNELS.map((ch) => `<b>${ch.pin.slice(5)} · ${ch.name}${pinWord(ch)}</b>`).join('');
    kit.addLabel(stackHtml(), pinAt(C.CHANNELS[1].pin, HEADER_TOP + 0.05), { cls: 'pin stack', lift: 40, show: () => !pinsApart, update: refresh(stackHtml) });
    function setPinStates(pins) { pinState = pins ? { ...pins } : null; }

    /* ---------- camera spots ---------- */
    const CAM = {
      kit: { p: [0.6, 7.6, 11.6], t: [0.2, -0.3, 1.6] },
      board: { p: [0, 8.4, 7.2], t: [0, 0, 0.2] },
      usb: { p: [5.6, 4.6, -0.4], t: [2.4, -0.2, -4.4] },
      tray: { p: [0.2, 5.2, 8.6], t: [0, -0.3, 3.9] },
      pins: { p: [0.6, 5.0, 1.8], t: [0, 0, -3.2] },
      // tall, narrow screens (phones): look down more steeply so the bench fills the height
      kitTall: { p: [0.4, 10.6, 7.6], t: [0.2, -0.3, -0.6] },
      boardTall: { p: [0, 10.6, 5.0], t: [0, 0, -1.0] },
    };
    const fly = (k, instant) => kit.flyTo(kit.camera.aspect < 0.8 && CAM[k + 'Tall'] ? CAM[k + 'Tall'] : CAM[k], instant);

    /* ---------- the learner's circuit, drawn from the build data: one object per part id, never duplicated ---------- */
    const SLEEVE = kit.SLEEVE;
    const surf = (e) => (e.k === 'pin' ? pinAt(e.id, HEADER_TOP) : e.k === 'rail' ? railAt(e.c, e.rail, 0.03) : holeAt(e.c, e.r, 0.03));
    const wireEnd = (e) => (e.k === 'pin' ? pinAt(e.id, HEADER_TOP + SLEEVE) : e.k === 'rail' ? railAt(e.c, e.rail, SLEEVE) : holeAt(e.c, e.r, SLEEVE));
    const CH = Object.fromEntries(C.CHANNELS.map((ch) => [ch.key, ch]));
    const placed = new Map(); // id → { obj, sig, base, wire, led, labels }
    function wireColor(id, p) {
      const key = id.replace(/^[a-z]+-/, '');
      if (p.color) return CH[p.color] ? CH[p.color].wire : BLACK_WIRE;
      if (id.startsWith('sig-') && CH[key]) return CH[key].wire;
      if (id.startsWith('res-')) return 0x8a5cf6; // a plain jumper where a resistor should be (a pretend mistake)
      return BLACK_WIRE;
    }
    function makePart(id, p) {
      const outer = new THREE.Group();
      const rec = { obj: outer, sig: JSON.stringify(p), labels: [] };
      outer.userData.buildId = id; // experiment mode selects a part by tapping it
      if (p.type === 'resistor') {
        const A = surf(p.a), B = surf(p.b), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
        outer.add(kit.makeResistor(-L / 2, L / 2));
        outer.position.set((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
        outer.rotation.y = Math.atan2(dx, dz);
        kit.tagPart(outer, 'resistor');
        // the colour bands, said in words (orange, orange, brown = 330 Ω; gold = within 5%)
        rec.labels.push(kit.addLabel('330 Ω', V((A.x + B.x) / 2, 0.42, (A.z + B.z) / 2), { cls: 'part-tag res', lift: 4, obj: outer, show: () => tagsFit }));
      } else if (p.type === 'led') {
        const A = surf(p.a), B = surf(p.b), dx = B.x - A.x, dz = B.z - A.z;
        const led = kit.makeLED(CH[p.color] ? CH[p.color].led : 0xff3030, 1, [0.5, 0.5], Math.hypot(dx, dz));
        outer.add(led); rec.led = led;
        // the flat edge of the rim is on the short-leg (cathode) side: a dark bar makes it easy to see
        const flat = kit.mesh(new THREE.BoxGeometry(0.02, 0.07, 0.34), kit.mat(0x15202a, { roughness: 0.6 }), Math.hypot(dx, dz) / 2 + 0.235, 0.48, 0, false);
        led.add(flat);
        // which leg is which, wherever the LED is (so a backwards LED shows: "+" ends up on the ground side)
        // its name in words, so the three lights never depend on colour alone
        rec.labels.push(kit.addLabel(`${p.color[0].toUpperCase()}${p.color.slice(1)} LED`, V((A.x + B.x) / 2, 0.95, (A.z + B.z) / 2), { cls: 'part-tag ledname', lift: 4, obj: outer, show: () => tagsFit }));
        rec.labels.push(kit.addLabel('+ long', V(A.x, 0.05, A.z + 0.16), { cls: 'part-tag pol plus', lift: 4, obj: outer, show: () => tagsFit })); // two heights, so the neighbours never overlap
        rec.labels.push(kit.addLabel('− short', V(B.x, 0.05, B.z + 0.16), { cls: 'part-tag pol minus', lift: 24, obj: outer, show: () => tagsFit }));
        outer.position.set(A.x, 0, A.z); // the long leg (anode) sits in its hole; the LED turns to reach the short leg's hole
        outer.rotation.y = Math.atan2(-dz, dx);
        kit.tagPart(outer, 'led-' + p.color);
      } else {
        let pts;
        if (p.a && p.b) {
          const A = wireEnd(p.a), B = wireEnd(p.b);
          // the shared ground wire takes Lesson 1's route around the end of the breadboard instead of over the lights
          const isGnd = (x, y) => x.k === 'pin' && x.id === C.GROUND_PIN && y.k === 'rail' && y.rail === 'BN' && y.c === 30;
          if (isGnd(p.a, p.b) || isGnd(p.b, p.a)) {
            const [g, r] = isGnd(p.a, p.b) ? [A, B] : [B, A];
            pts = [g, V(1.55, 0.85, -3.3), V(3.3, 1.5, -2.6), V(4.6, 1.35, -0.6), V(4.45, 1.0, 1.5), V(r.x, 0.72, r.z), r];
            if (g === B) pts.reverse();
          } else pts = kit.wirePoints(A, B, p.a.k === 'pin' || p.b.k === 'pin' ? 0.3 : 0);
        } else {
          // one end loose: it hangs in the air above where it should go
          const A = wireEnd(p.a || p.b);
          pts = [A, V(A.x, A.y + 0.7, A.z), V(A.x + 0.5, A.y + 1.0, A.z + 0.5), V(A.x + 0.9, A.y + 0.75, A.z + 0.9)];
        }
        const w = kit.makeWire(pts, wireColor(id, p));
        outer.add(w.group); rec.wire = w;
        kit.tagPart(outer, id.startsWith('sig-') ? 'wire-signal' : 'wire-ground');
      }
      rec.base = outer.position.clone();
      return rec;
    }
    function syncTray(build) {
      const parts = Object.entries(build);
      for (const ch of C.CHANNELS) {
        tray.led[ch.key].visible = !parts.some(([, p]) => p.type === 'led' && p.color === ch.key);
        tray.sig[ch.key].visible = !build['sig-' + ch.key];
      }
      const nRes = parts.filter(([, p]) => p.type === 'resistor').length;
      tray.res.forEach((o, i) => { o.visible = i >= nRes; });
      const nBlack = parts.filter(([id, p]) => p.type === 'wire' && (id.startsWith('gw-') || id === 'gnd')).length;
      tray.black.forEach((o, i) => { o.visible = i >= nBlack; });
    }
    // Make the scene match a build: add what's new, rebuild what changed, remove what's gone. Every LED starts dark.
    function sync(build) {
      for (const [id, rec] of [...placed]) {
        if (!build[id] || rec.sig !== JSON.stringify(build[id])) { kit.scene.remove(rec.obj); kit.dispose(rec.obj); rec.labels.forEach(kit.removeLabel); placed.delete(id); }
      }
      for (const [id, p] of Object.entries(build)) if (!placed.has(id)) { const rec = makePart(id, p); kit.scene.add(rec.obj); placed.set(id, rec); }
      syncTray(build);
      setLeds({});
    }
    // put every part exactly in place (after an animation was cut short by changing step)
    function settle() { for (const rec of placed.values()) { rec.obj.position.copy(rec.base); rec.obj.visible = true; if (rec.wire) rec.wire.set(1); } }
    // the placing animation for one part: parts drop into their holes, wires draw themselves from end to end
    async function animateIn(id) {
      const rec = placed.get(id); if (!rec) return;
      settle();
      if (rec.wire) { rec.wire.group.visible = true; await kit.drawWire(rec.wire, 1.1); }
      else await kit.dropIn(rec.obj);
    }
    // levels: { 'led-red': 1 } (0 off, 1 on, 2 the pretend "too much current" glow)
    function setLeds(levels) { for (const [id, rec] of placed) if (rec.led) rec.led.userData.setLit(levels[id] || 0); }

    // glow the strips and rails of a path: nodes like 'T7' (a7–e7), 'B8' (f8–j8), 'R:BN'
    function glowNodes(nodes, color) {
      for (const n of nodes) {
        if (n.startsWith('R:')) kit.strip(kit.railHoles(n.slice(2)), color);
        else if (/^[TB]\d+$/.test(n)) kit.strip(kit.stripHoles(Number(n.slice(1)), n[0] === 'T' ? 'far' : 'near'), color);
      }
    }
    // The running program's glow: where current flows right now (separate from the step's own highlights, so the
    // simulation can update it without wiping rings and callouts). paths: [{ nodes: ['T7', 'B7'], color }]
    const glowGroup = new THREE.Group(); kit.scene.add(glowGroup);
    let glowKey = '';
    const glowMats = new Map();
    const glowMat = (color, o) => { const k = color + ':' + o; if (!glowMats.has(k)) glowMats.set(k, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false })); return glowMats.get(k); };
    function setGlow(paths) {
      const key = JSON.stringify(paths || []);
      if (key === glowKey) return;
      glowKey = key;
      while (glowGroup.children.length) { const o = glowGroup.children.pop(); o.geometry.dispose(); }
      for (const { nodes, color } of paths || []) for (const n of nodes) {
        const pts = n.startsWith('R:') ? kit.railHoles(n.slice(2)) : /^[TB]\d+$/.test(n) ? kit.stripHoles(Number(n.slice(1)), n[0] === 'T' ? 'far' : 'near') : null;
        if (!pts) continue;
        const a = pts[0], b = pts[pts.length - 1], alongZ = Math.abs(b.z - a.z) > Math.abs(b.x - a.x), len = a.distanceTo(b) + 0.24;
        const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.21 : len, 0.012, alongZ ? len : 0.21), glowMat(color, 0.5));
        m.position.set((a.x + b.x) / 2, 0.011, (a.z + b.z) / 2); m.renderOrder = 5;
        glowGroup.add(m);
      }
    }

    // ring an end (hole, rail hole or pin) and name it
    function markEnd(e, color, text, lift) {
      kit.ring(e.k === 'pin' ? pinAt(e.id, 0.12) : surf(e), color || GOLD, e.k === 'pin' ? 0.14 : 0.17);
      if (text) kit.callout(text, e.k === 'pin' ? pinAt(e.id, HEADER_TOP + 0.2) : surf(e), 'gold', lift || 26);
    }
    // move the camera so both ends of a part are close and in view
    function flyToEnds(ends, instant) {
      const pts = ends.filter(Boolean).map(surf);
      const t = pts.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(1 / pts.length);
      const spread = Math.max(...pts.map((p) => p.distanceTo(t)), 0.5);
      const hasPin = ends.some((e) => e && e.k === 'pin');
      const k = Math.max(1, spread / 1.6);
      const off = hasPin ? [0.4, 5.6, 4.6] : [-0.3, 4.4, 4.0];
      kit.flyTo({ p: [t.x + off[0] * k, t.y + off[1] * k, t.z + off[2] * k], t: [t.x, 0, t.z] }, instant);
    }

    /* ---------- showing what something is ---------- */
    const holeName = (c, r) => `${r}${c}`;
    const stripRange = (c, r) => (half(r) === 'far' ? `a${c}–e${c}` : `f${c}–j${c}`);
    const RAILS = {
      BN: { name: 'Blue − rail (near side)', color: BLUE, cls: 'blue' },
      BP: { name: 'Red + rail (near side)', color: RED, cls: 'red' },
      TN: { name: 'Blue − rail (far side)', color: BLUE, cls: 'blue' },
      TP: { name: 'Red + rail (far side)', color: RED, cls: 'red' },
    };

    // A hole: its own strip glows gold; the strip across the gap is shown dark and marked "not joined".
    function showHole(c, r) {
      kit.clearTemps();
      const other = half(r) === 'far' ? 'near' : 'far';
      kit.strip(kit.stripHoles(c, half(r)), GOLD);
      kit.strip(kit.stripHoles(c, other), DARK);
      kit.ring(holeAt(c, r), TEAL);
      kit.callout(`${holeName(c, r)} is joined to ${stripRange(c, r)}`, holeAt(c, half(r) === 'far' ? 'a' : 'j'), 'gold', 22);
      kit.callout('not joined: across the gap', holeAt(c, other === 'far' ? 'a' : 'j'), 'ground', 22);
    }
    function showRail(rail) {
      kit.clearTemps();
      const R = RAILS[rail];
      kit.strip(kit.railHoles(rail), R.color);
      kit.callout(`${R.name}: one long strip`, railAt(15, rail), R.cls, 22);
    }
    function showPin(id) {
      kit.clearTemps();
      kit.ring(pinAt(id, 0.12), TEAL, 0.14);
      kit.callout(kit.pinById(id).name, pinAt(id, HEADER_TOP + 0.2), 'gold', 34);
    }
    function centerOf(obj) { return new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()); }
    function partObjects(part) { const out = []; kit.scene.traverse((o) => { if (o.userData.part === part && o.visible) out.push(o); }); return out; }
    function showPart(part, obj) {
      kit.clearTemps();
      const info = C.PARTS[part];
      const objs = obj ? [obj] : partObjects(part).slice(0, 1);
      objs.forEach((o) => {
        const p = part === 'controller' ? V(-1.2, 0.1, ESP.cz) : part === 'breadboard' ? V(0, 0.02, 0) : centerOf(o);
        kit.ring(V(p.x, Math.max(p.y, TABLE + 0.05), p.z), GOLD, part === 'controller' || part === 'breadboard' ? 0.6 : 0.42);
        kit.callout(info ? info.name : part, p, 'gold', 30);
      });
    }

    // The "hidden connections" demo: a7–e7, then f7–j7, then the gap, then the blue − rail. Resolves false if cut short.
    async function stripsDemo() {
      kit.clearTemps();
      const t = kit.token, quick = kit.reduceMotion;
      const pause = (s) => (quick ? Promise.resolve() : kit.wait(s));
      kit.strip(kit.stripHoles(7, 'far'), GOLD);
      kit.callout('a7–e7: one strip', holeAt(7, 'a'), 'gold', 22);
      await pause(1.4); if (!kit.isCurrent(t)) return false;
      kit.strip(kit.stripHoles(7, 'near'), GOLD);
      kit.callout('f7–j7: another strip', holeAt(7, 'j'), 'gold', 22);
      await pause(1.4); if (!kit.isCurrent(t)) return false;
      kit.callout('the gap: these two strips are NOT joined', V(kit.colX(11), 0.02, 0), 'ground', 22);
      await pause(1.6); if (!kit.isCurrent(t)) return false;
      kit.strip(kit.railHoles('BN'), BLUE);
      kit.callout('blue − rail: joined all the way along', railAt(21, 'BN'), 'blue', 22);
      await pause(1.4);
      return kit.isCurrent(t);
    }

    /* ---------- where things are on screen (for tests and for the keyboard picker's camera) ---------- */
    function worldOf(q) {
      if (q.hole) return holeAt(q.hole[0], q.hole[1], 0.01);
      if (q.rail) return railAt(q.rail[1], q.rail[0], 0.01);
      if (q.pin) return pinAt(q.pin, 0.12);
      if (q.placed) { const r = placed.get(q.placed); return r ? (r.wire ? r.wire.curve.getPoint(0.5) : centerOf(r.obj)) : null; }
      if (q.part) {
        if (q.part === 'controller') return V(-0.9, 0.2, ESP.cz); // the middle of the metal module
        if (q.part === 'breadboard') return V(-3.4, 0.02, 2.35);
        const o = partObjects(q.part)[q.index || 0];
        return o ? (o.userData.wire ? o.userData.wire.curve.getPoint(0.5) : centerOf(o)) : null;
      }
      return null;
    }
    function screenOf(q) {
      const v = worldOf(q); if (!v) return null;
      const r = kit.renderer.domElement.getBoundingClientRect();
      v.project(kit.camera);
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }
    // how much is in the scene and on the label layer (tests use this to prove replaying a step piles nothing up)
    const counts = () => ({ objects: kit.scene.children.length, labels: opts.layer.children.length });

    return { kit, CAM, fly, half, holeName, stripRange, RAILS, showHole, showRail, showPin, showPart, stripsDemo,
      setPlugged, get plugged() { return plugged; }, screenOf, counts, trayParts,
      sync, settle, animateIn, setLeds, setPinStates, setGlow, glowCount: () => glowGroup.children.length, glowNodes, markEnd, flyToEnds, placedIds: () => [...placed.keys()],
      ledLevel: (id) => { const r = placed.get(id); return r && r.led ? r.led.userData.led.light.intensity : null; } };
  }

  window.VLabView = { create };
})();
