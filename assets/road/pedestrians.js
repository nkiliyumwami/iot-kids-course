/* Pedestrians for the model road (assets/road/model-road.js). People walk along the pavements, wait at the
   zebra crossing and cross only when the lesson's program says they may, and only when the road is clear.
   Cars always give way to anyone on the crossing.

   Usage (after ModelRoad.create):
     const walkers = Pedestrians.create({ THREE, road: roadApi, reduceMotion,
       walkWindow: () => seconds people may still start crossing (0 = not now, Infinity = while it lasts),
       minWindow: 2,                // don't start crossing with less time than this
       signals: true,               // show the pedestrian lights (red standing / green walking figure)
       getPressed: () => bool,      // the learner is pressing the button: a walker presses the pole button
       getWaiting: () => bool });   // optional: the program remembers a press, so the WAIT light is on
     walkers.update(dt) every frame.
   Lesson 1 (no button in the circuit) passes no signals/getPressed: people simply cross while cars wait at red. */
(function () {
  'use strict';

  function create(o) {
    const THREE = o.THREE, R = o.road, root = R.group;
    const ROAD_Z = R.ROAD_Z, ROAD_W = R.ROAD_W, STOP_S = R.STOP_S;
    const NEAR_WAIT = ROAD_Z + ROAD_W / 2 + 0.22, FAR_WAIT = ROAD_Z - ROAD_W / 2 - 0.22;   // just behind each kerb
    const NEAR_WALK = ROAD_Z + ROAD_W / 2 + 0.5, FAR_WALK = ROAD_Z - ROAD_W / 2 - 0.5;    // along each pavement
    const PAVE_Y = 0.12, EDGE_X = 11.5, WALK_V = 0.85, STROLL_V = 0.6;
    const std = (color, p = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, envMap: R.envMap || null, envMapIntensity: 0.3 }, p));
    function mesh(geo, m, x = 0, y = 0, z = 0) {
      const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; return k;
    }
    function canvasTex(w, h, draw) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
      return new THREE.CanvasTexture(cv);
    }

    /* ---------- pedestrian lights and the WAIT light on the push button box ---------- */
    const figure = (walking, color) => canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#0d1114'; g.fillRect(0, 0, w, h);
      g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round'; g.lineWidth = 14;
      g.beginPath(); g.arc(64, 26, 12, 0, Math.PI * 2); g.fill();
      g.beginPath();
      if (walking) { g.moveTo(62, 44); g.lineTo(56, 78); g.moveTo(56, 78); g.lineTo(38, 112); g.moveTo(56, 78); g.lineTo(78, 110); g.moveTo(60, 50); g.lineTo(40, 70); g.moveTo(60, 50); g.lineTo(84, 66); }
      else { g.moveTo(64, 44); g.lineTo(64, 80); g.moveTo(64, 80); g.lineTo(52, 114); g.moveTo(64, 80); g.lineTo(76, 114); g.moveTo(64, 50); g.lineTo(46, 82); g.moveTo(64, 50); g.lineTo(82, 82); }
      g.stroke();
    });
    const lights = [];
    let waitPanels = [];
    if (o.signals) {
      const body = std(0x22272d, { roughness: 0.45 });
      const stopTex = figure(false, '#ff4a3a'), walkTex = figure(true, '#3ee08a');
      [[-2.35, ROAD_Z + ROAD_W / 2 + 0.4, -1], [2.35, ROAD_Z - ROAD_W / 2 - 0.4, 1]].forEach(([x, z, face]) => {
        // the head faces the people waiting on the other side of the road
        const g = new THREE.Group(); g.position.set(x, PAVE_Y + 1.18, z); if (face < 0) g.rotation.y = Math.PI;
        g.add(mesh(new THREE.BoxGeometry(0.26, 0.52, 0.16), body));
        // lamps on both faces: one for the people across the road, one so learners can see it too
        const lamp = (tex, y) => {
          const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, color: 0x555555, roughness: 0.3 });
          for (const f of [1, -1]) {
            const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), m); p.position.set(0, y, 0.082 * f); if (f < 0) p.rotation.y = Math.PI; g.add(p);
            g.add(mesh(new THREE.BoxGeometry(0.24, 0.02, 0.08), body, 0, y + 0.12, 0.11 * f));
          }
          return m;
        };
        lights.push({ stop: lamp(stopTex, 0.12), walk: lamp(walkTex, -0.12) });
        root.add(g);
      });
      if (o.getWaiting) {
        const waitTex = canvasTex(128, 64, (g, w, h) => {
          g.fillStyle = '#1a1206'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#ffd36a'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WAIT', w / 2, h / 2 + 2);
        });
        [[-2.35, ROAD_Z + ROAD_W / 2 + 0.4], [2.35, ROAD_Z - ROAD_W / 2 - 0.4]].forEach(([x, z]) => {
          const m = new THREE.MeshStandardMaterial({ map: waitTex, emissiveMap: waitTex, emissive: 0xffffff, emissiveIntensity: 0, color: 0x444444 });
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), m);
          p.position.set(x, PAVE_Y + 0.47, z + 0.125); root.add(p); waitPanels.push(m);
        });
      }
    }

    /* ---------- people ---------- */
    const LOOKS = [
      { h: 0.77, skin: 0x8d5524, shirt: 0x2c4e9e, legs: 0x2b2f36, hair: 0x1b1410 },
      { h: 0.56, skin: 0xf1c27d, shirt: 0xf2b705, legs: 0x3a5a8c, hair: 0x6b3e1e, bag: 0xc93131 },
      { h: 0.72, skin: 0xc68642, shirt: 0x0a7480, legs: 0x4a4f57, hair: 0x2a1c12 },
      { h: 0.54, skin: 0x5c3a21, shirt: 0xd9821a, legs: 0x24324a, hair: 0x120c08, bag: 0x2c4e9e },
      { h: 0.75, skin: 0xe0ac69, shirt: 0xc93131, legs: 0x2b2f36, hair: 0x8a6a3a },
    ];
    function makePerson(L) {
      const h = L.h, g = new THREE.Group();
      const skin = std(L.skin, { roughness: 0.8 }), shirt = std(L.shirt), legs = std(L.legs), shoe = std(0x1a1b1d), hair = std(L.hair, { roughness: 0.9 });
      const hipY = 0.46 * h, legLen = 0.44 * h;
      const leg = (sx) => {
        const p = new THREE.Group(); p.position.set(sx * 0.055 * h, hipY, 0);
        p.add(mesh(new THREE.CylinderGeometry(0.048 * h, 0.04 * h, legLen, 10), legs, 0, -legLen / 2, 0));
        p.add(mesh(new THREE.BoxGeometry(0.08 * h, 0.04 * h, 0.15 * h), shoe, 0, -legLen - 0.005 * h, 0.03 * h));
        g.add(p); return p;
      };
      const legL = leg(-1), legR = leg(1);
      const torso = new THREE.Group(); torso.position.y = hipY; g.add(torso);
      torso.add(mesh(new THREE.CylinderGeometry(0.115 * h, 0.1 * h, 0.34 * h, 14), shirt, 0, 0.17 * h, 0));
      torso.add(mesh(new THREE.SphereGeometry(0.115 * h, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), shirt, 0, 0.34 * h, 0));
      if (L.bag) torso.add(mesh(new THREE.BoxGeometry(0.16 * h, 0.2 * h, 0.08 * h), std(L.bag), 0, 0.2 * h, -0.12 * h));
      const arm = (sx) => {
        const p = new THREE.Group(); p.position.set(sx * 0.14 * h, 0.33 * h, 0);
        p.add(mesh(new THREE.CylinderGeometry(0.034 * h, 0.03 * h, 0.3 * h, 8), shirt, 0, -0.15 * h, 0));
        p.add(mesh(new THREE.SphereGeometry(0.036 * h, 10, 8), skin, 0, -0.31 * h, 0));
        torso.add(p); return p;
      };
      const armL = arm(-1), armR = arm(1);
      const head = new THREE.Group(); head.position.y = 0.42 * h; torso.add(head);
      head.add(mesh(new THREE.CylinderGeometry(0.03 * h, 0.035 * h, 0.06 * h, 8), skin, 0, -0.02 * h, 0));
      head.add(mesh(new THREE.SphereGeometry(0.08 * h, 16, 12), skin, 0, 0.06 * h, 0));
      head.add(mesh(new THREE.SphereGeometry(0.085 * h, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.07 * h, -0.008 * h));
      const mats = [];
      g.traverse((n) => { if (n.material && !mats.includes(n.material)) mats.push(n.material); });
      g.userData = { legL, legR, armL, armR, head, torso, mats, h };
      return g;
    }

    const people = LOOKS.map((L, i) => {
      const g = makePerson(L); root.add(g);
      return { g, side: i % 2 ? -1 : 1, x: 0, z: 0, state: 'off', t: 1 + i * 1.6, slot: null, phase: Math.random() * 6, look: 0, press: 0, tx: 0, tz: 0, a: -1, speed: STROLL_V };
    });
    // where people wait: a few spots on each kerb next to the zebra, plus the spot by the push button (button lessons)
    const SLOTS = { 1: [-0.75, -0.3, 0.15, 0.6], [-1]: [0.75, 0.3, -0.15, -0.6] };
    const POLE = { 1: { x: -2.12, z: ROAD_Z + ROAD_W / 2 + 0.66 }, [-1]: { x: 2.12, z: ROAD_Z - ROAD_W / 2 - 0.14 } };
    const taken = new Set();
    const freeSlot = (side) => SLOTS[side].find((x) => !taken.has(side + ':' + x));
    // a few people start already waiting, so there is something to see straight away
    // (in the button lessons the first one stands by the push button)
    people.forEach((p, i) => {
      if (i >= 3) return;
      if (i === 0 && o.getPressed) { p.side = 1; taken.add('1:pole'); p.slot = 'pole'; p.x = POLE[1].x; p.z = POLE[1].z; p.state = 'wait'; return; }
      const x = freeSlot(p.side); if (x != null) { taken.add(p.side + ':' + x); p.slot = x; p.x = x; p.z = p.side > 0 ? NEAR_WAIT : FAR_WAIT; p.state = 'wait'; }
    });

    function setOpacity(p, a) {
      if (a === p.a) return; p.a = a;
      p.g.visible = a > 0.01;
      p.g.userData.mats.forEach((m) => { m.transparent = a < 1; m.opacity = a; });
    }
    const crossing = () => people.some((p) => p.state === 'cross');
    if (R.setYield) R.setYield(crossing);

    // is it safe to step onto the road? No car between the stop line and the far side of the crossing, and no car
    // so close to the line, or so fast, that it might not stop.
    function roadClear() {
      for (const c of R.cars) {
        if (!c.g.visible) continue;
        const front = c.s + c.L / 2, rear = c.s - c.L / 2;
        if (rear < 1.6 && front > STOP_S - 0.05) return false;
        if (front <= STOP_S && c.v > 0.4 && STOP_S - front < (c.v * c.v) / (2 * 2.5) + 0.3) return false;
        if (front <= STOP_S && c.go) return false;
      }
      return true;
    }

    let wasPressed = false;
    function update(dt) {
      if (!root.visible) return;
      const win = o.walkWindow ? o.walkWindow() : 0;
      const walkOK = win > 0;
      lights.forEach((l) => { l.walk.emissiveIntensity = walkOK ? 1.6 : 0; l.walk.color.setHex(walkOK ? 0xffffff : 0x262626); l.stop.emissiveIntensity = walkOK ? 0 : 1.4; l.stop.color.setHex(walkOK ? 0x262626 : 0xffffff); });
      const waiting = o.getWaiting ? !!o.getWaiting() : false;
      waitPanels.forEach((m) => { m.emissiveIntensity = waiting ? 1.5 : 0; m.color.setHex(waiting ? 0xffffff : 0x444444); });
      // the learner pressed: whoever stands by the near pole presses the real button
      const pressed = o.getPressed ? !!o.getPressed() : false;
      if (pressed && !wasPressed) {
        const p = people.find((q) => q.state === 'wait' && q.slot === 'pole') || people.find((q) => q.state === 'wait' && q.side > 0);
        if (p) p.press = 1;
      }
      wasPressed = pressed;

      for (const p of people) {
        const ud = p.g.userData;
        let moving = false, dir = null;
        p.t -= dt;
        if (p.press > 0) p.press = Math.max(0, p.press - dt * 0.9);
        if (p.state === 'off') {
          setOpacity(p, 0);
          if (p.t <= 0 && !o.reduceMotion) {
            // walk in from the end of a pavement towards a free waiting spot
            const pole = o.getPressed && !people.some((q) => q !== p && q.slot === 'pole' && q.side === p.side) && p.side > 0;
            const x = pole ? 'pole' : freeSlot(p.side);
            if (x == null) { p.t = 2; continue; }
            taken.add(p.side + ':' + x); p.slot = x;
            const from = Math.random() < 0.5 ? -1 : 1;
            p.x = from * EDGE_X; p.z = p.side > 0 ? NEAR_WALK : FAR_WALK;
            const target = x === 'pole' ? POLE[p.side] : { x, z: p.side > 0 ? NEAR_WAIT : FAR_WAIT };
            p.tx = target.x; p.tz = target.z; p.state = 'approach'; p.speed = STROLL_V + Math.random() * 0.15;
          }
        } else if (p.state === 'approach') {
          // along the pavement first, then step up to the kerb
          const tx = p.tx, tz = Math.abs(p.x - p.tx) > 0.02 ? (p.side > 0 ? NEAR_WALK : FAR_WALK) : p.tz;
          const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = p.speed * dt;
          if (d <= step) { p.x = tx; p.z = tz; if (tx === p.tx && tz === p.tz) { p.state = 'wait'; p.t = 0.5; } }
          else { p.x += (dx / d) * step; p.z += (dz / d) * step; moving = true; dir = [dx, dz]; }
        } else if (p.state === 'wait') {
          // the one by the pole moves to the crossing after pressing
          if (p.slot === 'pole' && p.press === 0 && (walkOK || (o.getWaiting && waiting))) {
            const x = freeSlot(p.side);
            if (x != null) { taken.delete(p.side + ':pole'); taken.add(p.side + ':' + x); p.slot = x; p.tx = x; p.tz = p.side > 0 ? NEAR_WAIT : FAR_WAIT; p.state = 'approach'; p.speed = STROLL_V; }
          } else if (p.slot !== 'pole' && p.t <= 0 && !o.reduceMotion && win >= (o.minWindow || 0) && roadClear()) {
            p.state = 'look'; p.t = 0.9;
          }
        } else if (p.state === 'look') {
          // look left, look right, then go only if it is still clear
          ud.head.rotation.y = Math.sin((0.9 - p.t) / 0.9 * Math.PI * 2) * 0.7;
          if (p.t <= 0) {
            ud.head.rotation.y = 0;
            if (walkOK && roadClear()) { p.state = 'cross'; taken.delete(p.side + ':' + p.slot); p.tz = p.side > 0 ? FAR_WAIT : NEAR_WAIT; }
            else { p.state = 'wait'; p.t = 0.4; }
          }
        } else if (p.state === 'cross') {
          const dz = p.tz - p.z, step = WALK_V * dt;
          if (Math.abs(dz) <= step) { p.z = p.tz; p.state = 'leave'; p.tz = p.side > 0 ? FAR_WALK : NEAR_WALK; p.tx = (Math.random() < 0.5 ? -1 : 1) * (EDGE_X + 0.5); }
          else { p.z += Math.sign(dz) * step; moving = true; dir = [0, dz]; }
        } else if (p.state === 'leave') {
          const tz = p.tz, dz = tz - p.z;
          if (Math.abs(dz) > 0.02) { const s = Math.min(Math.abs(dz), STROLL_V * dt); p.z += Math.sign(dz) * s; moving = true; dir = [0, dz]; }
          else {
            const dx = p.tx - p.x, s = STROLL_V * dt;
            if (Math.abs(dx) <= s) { p.state = 'off'; p.side = -p.side; p.slot = null; p.t = 1 + Math.random() * 4; }
            else { p.x += Math.sign(dx) * s; moving = true; dir = [dx, 0]; }
          }
        }
        if (p.state === 'off') continue;
        // fade in and out at the ends of the pavement
        setOpacity(p, Math.max(0, Math.min(1, (EDGE_X + 0.3 - Math.abs(p.x)) / 1.2)));
        p.g.position.set(p.x, PAVE_Y * (p.state === 'cross' && Math.abs(p.z - ROAD_Z) < ROAD_W / 2 ? 0.25 : 1), p.z);
        if (dir) p.g.rotation.y = Math.atan2(dir[0], dir[1]);
        else if (p.state === 'wait' || p.state === 'look') p.g.rotation.y = p.slot === 'pole' ? (p.side > 0 ? Math.PI : 0) : (p.side > 0 ? Math.PI : 0);
        // walking: swing legs and arms; standing: still, with a raised arm while pressing the button
        if (moving) p.phase += dt * (p.state === 'cross' ? 9 : 7);
        const sw = moving ? Math.sin(p.phase) : 0;
        ud.legL.rotation.x = sw * 0.55; ud.legR.rotation.x = -sw * 0.55;
        ud.armL.rotation.x = -sw * 0.45;
        ud.armR.rotation.x = p.press > 0 ? -1.35 : sw * 0.45;
        ud.torso.position.y = 0.46 * ud.h + (moving ? Math.abs(Math.cos(p.phase)) * 0.012 : 0);
      }
    }
    people.forEach((p) => { if (p.state === 'wait') { setOpacity(p, 1); p.g.position.set(p.x, PAVE_Y, p.z); p.g.rotation.y = p.side > 0 ? Math.PI : 0; } else setOpacity(p, 0); });
    return { update, people, crossing };
  }
  window.Pedestrians = { create };
})();
