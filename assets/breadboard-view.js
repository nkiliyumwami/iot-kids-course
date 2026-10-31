/* The "Breadboard" tab of the sensor modules: the module's circuit built on two half-size breadboards.
   An ESP32 DevKit V1 is too wide for one breadboard (its headers are 10 holes apart), so it sits across two:
   its 3V3 header (R) in row a of the front board, its EN / VIN header (L) in row j of the back board,
   USB end over column 1. Pin k of a header (1 = the antenna end) is in column 17 - k.

   window.Breadboard.plan(spec)          -> where every pin and wire goes (no 3D needed)
   window.Breadboard.steps(spec)         -> { place: [html], wires: [{ c, html }] } for the page's Breadboard card
   window.Breadboard.build(host, spec, o)-> the 3D desk (three.js r128 with GLTFLoader + DRACOLoader + OrbitControls)

   spec = {
     parts: [{ id, glb, name, label, color, board: 'front'|'back', row: 'a'..'j', pins: { NAME: column, ... },
               stand: true (a parts.py module with right-angle pins: it stands up, face to the front) | false (proto-*.glb),
               face: 'front'|'back', sink: mm the pin tips go below the top (default 5 standing, 6 proto),
               lens: '#hex' (recolour a proto-led), share: [pins meant to share a strip with another part], place: html for the card }
            | { id, glb, name, label, desk: { x, z, y, rot } (lies on the desk beside the boards, rot about Y),
               hide: [node names], pinNames: { Signal: 'orange' }, place }   wired with male-female jumpers to its Pin_ or Sock_
            | { id, glb, mount: { part, node, basis: [x, y, z axes], pos: [x, y, z] } } (carried by another part's node) ],
     wires: [{ c: '#hex', from: END, to: END, label: 'short tag' }],   END = { esp: 'D14' | 'GND' | '3V3', side: 'L'|'R' }
            | { part: id, pin: NAME, row } | { rail: 'front+' | 'front-' | 'back+' | 'back-' } | { hole: ['front', 'c', 24] }
   } */
(function () {
  'use strict';
  const P = 2.54, TOP = 8.5, CZ = 26.67;
  const ROWS = 'abcdefghij';
  const ROWY = {}; ROWS.split('').forEach((r, i) => { ROWY[r] = i < 5 ? 13.97 - i * P : -3.81 - (i - 5) * P; });
  const RAIL = { '-': 18.8, '+': 21.34 };
  const RAIL_COLS = []; for (let g = 0; g < 5; g++) for (let c = 2 + g * 6; c < 7 + g * 6; c++) RAIL_COLS.push(c);
  const colX = (c) => (c - 15.5) * P;
  // the DOIT ESP32 DevKit V1 headers, pin 1 at the antenna end, as printed on the board
  const HEAD = {
    L: ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'],
    R: ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'],
  };
  const ESP_ROW = { L: 'j', R: 'a' }, ESP_BOARD = { L: 'back', R: 'front' };
  const half = (row) => (ROWS.indexOf(row) < 5 ? 0 : 1);
  const boardName = (b) => (b === 'front' ? 'front board' : 'back board');

  // the world position (mm, board pair centred on the origin, y = 0 on the desk) of a hole's top
  function holePos(board, row, col) { return { x: colX(col), y: TOP, z: (board === 'front' ? CZ : -CZ) - ROWY[row] }; }
  function railPos(board, sign, col) {
    const s = board === 'front' ? -1 : 1;              // the outer rails: the front edge of the front board, the back edge of the back board
    return { x: colX(col), y: TOP, z: (board === 'front' ? CZ : -CZ) - s * RAIL[sign] };
  }

  function plan(spec) {
    const used = new Set();
    const key = (b, r, c) => b + ':' + r + ':' + c;
    const strips = {};                                   // what sits in each 5-hole strip (to keep two parts out of one strip)
    const take = (b, r, c, what) => { used.add(key(b, r, c)); const s = b + ':' + half(r) + ':' + c; (strips[s] = strips[s] || []).push(what); };
    const esp = {};
    ['L', 'R'].forEach((side) => HEAD[side].forEach((nm, i) => {
      const col = 16 - i, pin = { side, name: nm, board: ESP_BOARD[side], row: ESP_ROW[side], col };
      esp[side + ':' + nm] = pin; take(pin.board, pin.row, col, 'ESP32 ' + nm);
    }));
    const parts = {};
    (spec.parts || []).forEach((p) => {
      if (!p.pins) { parts[p.id] = Object.assign({}, p, { at: {} }); return; }   // on the desk or carried by another part
      const pins = {};
      Object.entries(p.pins).forEach(([nm, col]) => {
        const s = p.board + ':' + half(p.row) + ':' + col;
        if (strips[s] && !(p.share || []).includes(nm)) console.warn('Breadboard: ' + p.id + ' ' + nm + ' shares a strip with', strips[s]);
        pins[nm] = { board: p.board, row: p.row, col }; take(p.board, p.row, col, p.id + ' ' + nm);
      });
      parts[p.id] = Object.assign({}, p, { at: pins });
    });
    function freeRow(board, row, col, prefer) {
      const i = ROWS.indexOf(row), lo = i < 5 ? 0 : 5;
      const order = prefer || [-2, -1, -3, -4, 1, 2, 3, 4].map((d) => (board === 'front' ? d : -d)); // behind the part first
      for (const d of order) {
        const j = typeof d === 'string' ? ROWS.indexOf(d) : i + d;
        if (j < lo || j > lo + 4) continue;
        if (!used.has(key(board, ROWS[j], col))) return ROWS[j];
      }
      throw new Error('Breadboard: no free hole in column ' + col + ' of the ' + board + ' board');
    }
    function end(e, near) {
      if (e.esp) {
        const side = e.side || (HEAD.R.includes(e.esp) ? 'R' : 'L');
        const p = esp[side + ':' + e.esp]; if (!p) throw new Error('Breadboard: no ESP32 pin ' + e.esp);
        const row = e.row || freeRow(p.board, p.row, p.col, side === 'R' ? ['c', 'd', 'e', 'b'] : ['h', 'g', 'f', 'i']);
        used.add(key(p.board, row, p.col));
        return { board: p.board, row, col: p.col, pos: holePos(p.board, row, p.col), html: `ESP32 <b>${e.esp}</b> (${p.board} <b>${row}${p.col}</b>)` };
      }
      if (e.part && !parts[e.part].pins) {
        const pt = parts[e.part], nm = (pt.pinNames && pt.pinNames[e.pin]) || e.pin;
        return { part: e.part, pin: e.pin, at: e.at, pos: null, html: `${pt.name} <b>${nm}</b>` };
      }
      if (e.part) {
        const pt = parts[e.part], p = pt.at[e.pin];
        const row = e.row || freeRow(p.board, p.row, p.col);
        used.add(key(p.board, row, p.col));
        const nm = pt.pinNames && pt.pinNames[e.pin] != null ? pt.pinNames[e.pin] : e.pin.replace('MINUS', '−').replace('PLUS', '+');
        return { board: p.board, row, col: p.col, pos: holePos(p.board, row, p.col), html: `${pt.name}${nm ? ` <b>${nm}</b>` : ''} (${p.board} <b>${row}${p.col}</b>)` };
      }
      if (e.rail) {
        const board = e.rail.slice(0, -1), sign = e.rail.slice(-1);
        const cols = RAIL_COLS.slice().sort((a, b) => Math.abs(a - near) - Math.abs(b - near));
        const col = e.col || cols.find((c) => !used.has(key(board, 'rail' + sign, c)));
        used.add(key(board, 'rail' + sign, col));
        return { board, rail: sign, col, pos: railPos(board, sign, col), html: `the ${board} <b>${sign === '+' ? 'red +' : 'blue −'}</b> rail (by column ${col})` };
      }
      const [board, row, col] = e.hole; used.add(key(board, row, col));
      return { board, row, col, pos: holePos(board, row, col), html: `${board} <b>${row}${col}</b>` };
    }
    const wires = (spec.wires || []).map((w) => {
      const toDesk = w.to.part && !parts[w.to.part].pins;   // a rail wire to a part on the desk starts at the rail's right-hand end
      const a = end(w.from, toDesk ? 28 : 15);
      const b = end(w.to, a.col || 30);
      return { c: w.c, label: w.label, a, b, html: `${a.html} → ${b.html}` };
    });
    return { esp, parts, wires };
  }

  function steps(spec) {
    const pl = plan(spec);
    const place = [`Put two half-size breadboards side by side, long sides touching. Push the <b>ESP32</b> across both, USB end over column 1: its <b>3V3</b> side goes in row <b>a</b> of the front board (3V3 in a2), its <b>VIN</b> side in row <b>j</b> of the back board (VIN in j2). It is too wide for one breadboard, so two are needed.`];
    (spec.parts || []).forEach((p) => {
      if (p.place === '') return;                 // described together with another part
      if (!p.pins) { if (p.place) place.push(p.place); return; }
      const pins = Object.entries(p.pins).map(([nm, c]) => `${nm.replace('MINUS', '−').replace('PLUS', '+')} in <b>${p.row}${c}</b>`).join(', ');
      place.push(p.place || `Push the <b>${p.name}</b> into the ${boardName(p.board)}: ${pins}.`);
    });
    return { place, wires: pl.wires.map((w) => ({ c: w.c, html: w.html })) };
  }

  /* ---------------- 3D ---------------- */
  function build(host, spec, o) {
    const T = window.THREE, base = o.base || '../../';
    const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
    const loader = () => { const g = new T.GLTFLoader(), d = new T.DRACOLoader(); d.setDecoderPath(o.lib + 'libs/draco/gltf/'); g.setDRACOLoader(d); return g; };
    const load = (url) => new Promise((res, rej) => loader().load(url, (g) => res(g.scene), undefined, rej));
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.physicallyCorrectLights = true;
    host.prepend(renderer.domElement);
    const scene = new T.Scene(); scene.background = lin(0xf0f4f7);
    scene.environment = new T.PMREMGenerator(renderer).fromScene(new T.RoomEnvironment(), 0.04).texture;
    scene.add(new T.HemisphereLight(lin(0xffffff), lin(0xb8c4cc), 1.0));
    const key = new T.DirectionalLight(lin(0xffffff), 1.6); key.position.set(60, 200, 120); scene.add(key);
    const camera = new T.PerspectiveCamera(34, 1, 1, 3000);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.minDistance = 40; controls.maxDistance = 420; controls.maxPolarAngle = Math.PI * 0.48;
    // the wood desk, like the wiring tab
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
    g.fillStyle = '#d8c3a0'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 50; i++) { g.strokeStyle = '#9b7a4f'; g.globalAlpha = 0.12 + ((i * 37) % 17) / 90; g.lineWidth = 1 + (i % 3); g.beginPath(); const y = (i * 97) % 512; g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 6); g.stroke(); }
    const wood = new T.CanvasTexture(cv); wood.encoding = T.sRGBEncoding; wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(1.4, 1);
    const desk = new T.Mesh(new T.BoxGeometry(760, 8, 460), new T.MeshStandardMaterial({ map: wood, roughness: 0.85 }));
    desk.position.y = -4; scene.add(desk);
    const V = (p) => new T.Vector3(p.x, p.y, p.z);
    const label = (text, color) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = color || '#15202A'; x.beginPath();
      if (x.roundRect) x.roundRect(4, 8, 248, 48, 14); else x.rect(4, 8, 248, 48);
      x.fill(); x.fillStyle = '#fff'; x.font = 'bold 30px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false, toneMapped: false }));
      sp.scale.set(17, 4.25, 1); sp.renderOrder = 10; return sp;
    };
    const pl = plan(spec);
    const names = ['proto-board'].concat((spec.parts || []).map((p) => p.glb).filter((v, i, a) => a.indexOf(v) === i));
    const loads = names.map((n) => load(base + 'assets/models/modules/' + n + '.glb').catch(() => new T.Group()));
    loads.push(new Promise((res, rej) => new T.GLTFLoader().load(base + 'assets/models/esp32-devkit-v1.glb', (gl) => res(gl.scene), undefined, rej)));
    let visible = !host.hidden, onScreen = true;
    function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(host); else addEventListener('resize', size);
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }).observe(host);
    size();
    renderer.setAnimationLoop(() => { if (!visible || !onScreen) return; controls.update(); renderer.render(scene, camera); });
    const msg = host.querySelector('.msg');
    Promise.all(loads).then((got) => {
      const M = {}; names.forEach((n, i) => { M[n] = got[i]; }); const esp = got[got.length - 1];
      const prep = (r) => { r.scale.setScalar(1000); r.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.envMapIntensity = 0.7; } }); return r; };
      prep(M['proto-board']);
      ['back', 'front'].forEach((b) => { const bd = b === 'back' ? M['proto-board'] : M['proto-board'].clone(); bd.position.z = b === 'front' ? CZ : -CZ; scene.add(bd); });
      // ESP32: pins along +X with the USB end at column 1, the R header to the front; header plastic resting on the boards
      esp.scale.setScalar(1000); esp.rotation.y = -Math.PI / 2; scene.add(esp); esp.updateMatrixWorld(true);
      const pad = (n) => { const m = esp.getObjectByName('pad_' + n); return m ? m.getWorldPosition(new T.Vector3()) : null; };
      const plastic = new T.Box3().setFromObject(esp.getObjectByName('header_plastic_R') || esp);
      const p15 = pad('R15_3V3'), want = holePos('front', 'a', 2);
      if (p15) { esp.position.x += want.x - p15.x; esp.position.z += want.z - p15.z; }
      esp.position.y += TOP - plastic.min.y; esp.updateMatrixWorld(true);
      // parts
      const pinNode = (root, nm) => root.getObjectByName('Pin_' + nm) || root.getObjectByName('Sock_' + nm);
      const worldPin = (root, nm) => { const m = pinNode(root, nm); return m ? m.getWorldPosition(new T.Vector3()) : null; };
      const nodes = {};
      const addLabel = (g, p) => {
        const bb = new T.Box3().setFromObject(g), lb = label(p.label, p.color);
        lb.position.set((bb.min.x + bb.max.x) / 2, bb.max.y + 7, (bb.min.z + bb.max.z) / 2); scene.add(lb);
      };
      (spec.parts || []).forEach((p) => {
        const src = M[p.glb]; if (!src) return;
        const part = prep(src.parent ? src.clone() : src);
        (p.hide || []).forEach((n) => { const h = part.getObjectByName(n); if (h) h.visible = false; });
        if (p.pose) p.pose(part, T);
        const g = new T.Group(); g.add(part); nodes[p.id] = g;
        if (p.desk) {
          g.rotation.y = p.desk.rot || 0; g.position.set(p.desk.x, p.desk.y || 0, p.desk.z); scene.add(g); g.updateMatrixWorld(true);
          if (p.label) addLabel(g, p);
          return;
        }
        if (p.mount) {
          const host = nodes[p.mount.part] && nodes[p.mount.part].getObjectByName(p.mount.node); if (!host) return;
          const [bx, by, bz] = p.mount.basis.map((v) => new T.Vector3(v[0], v[1], v[2]));
          g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(bx, by, bz)); g.position.fromArray(p.mount.pos);
          g.scale.setScalar(1 / host.getWorldScale(new T.Vector3()).x); host.add(g); g.updateMatrixWorld(true);
          return;
        }
        const front = (p.face || 'front') === 'front';
        if (p.stand) g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, front ? 1 : -1), new T.Vector3(front ? 1 : -1, 0, 0)));
        else if (!front) g.rotation.y = Math.PI;
        scene.add(g); g.updateMatrixWorld(true);
        const [nm0] = Object.keys(p.pins), at = pl.parts[p.id].at[nm0], h = holePos(at.board, at.row, at.col);
        const tip = worldPin(g, nm0); if (!tip) return;
        g.position.set(h.x - tip.x, TOP - (p.sink != null ? p.sink : p.stand ? 5 : 6) - tip.y, h.z - tip.z); g.updateMatrixWorld(true);
        Object.keys(p.pins).forEach((nm) => {           // every other pin should now be in its own hole
          const t = worldPin(g, nm), a = pl.parts[p.id].at[nm], q = holePos(a.board, a.row, a.col);
          if (t && Math.hypot(t.x - q.x, t.z - q.z) > 0.4) console.warn('Breadboard: ' + p.id + ' ' + nm + ' misses its hole by ' + Math.hypot(t.x - q.x, t.z - q.z).toFixed(2) + ' mm');
        });
        if (p.lens) part.traverse((m) => { if (m.isMesh && (m.name === 'Lens' || (m.parent && m.parent.name === 'Lens'))) m.material.color = lin(p.lens); });
        if (p.label) addLabel(g, p);
      });
      scene.updateMatrixWorld(true);
      // jumper wires: male-male, a black plug at each end standing in its hole
      const plugMat = new T.MeshStandardMaterial({ color: lin(0x1c1f24), roughness: 0.5 });
      const plugGeo = new T.BoxGeometry(2.5, 13, 2.5); plugGeo.translate(0, 6.5, 0);
      let n = 0;                                     // labelled wires so far: stagger their labels
      const UP = new T.Vector3(0, 1, 0);
      function plugEnd(e) {                          // where the wire leaves the plug, and which way
        if (e.pos) {
          const m = new T.Mesh(plugGeo, plugMat); m.position.copy(V(e.pos)); scene.add(m);
          return { p: V(e.pos).setY(e.pos.y + 13), dir: UP.clone() };
        }
        const g = nodes[e.part]; if (!g) return null;
        let tip, dir;
        if (e.at) {                                  // a point near one of the part's meshes: { node, off: [x, y, z] from its box's bottom centre }
          const bb = new T.Box3().setFromObject(g.getObjectByName(e.at.node) || g), c = bb.getCenter(new T.Vector3()).setY(bb.min.y);
          tip = c.clone().add(new T.Vector3().fromArray(e.at.off)); dir = tip.clone().sub(c).setY(0).normalize();
        } else {
          const node = pinNode(g, e.pin); if (!node) return null;
          tip = node.getWorldPosition(new T.Vector3());
          if (node.name.startsWith('Pin_')) dir = new T.Vector3(-1, 0, 0).applyQuaternion(node.getWorldQuaternion(new T.Quaternion())).normalize(); // header pins point along the part's -X
          else { const c = new T.Box3().setFromObject(g).getCenter(new T.Vector3()); dir = tip.clone().sub(c).setY(0).normalize(); }  // a socket: away from the part
        }
        const m = new T.Mesh(plugGeo, plugMat); m.position.copy(tip).addScaledVector(dir, -4); m.quaternion.setFromUnitVectors(UP, dir); scene.add(m);
        return { p: tip.clone().addScaledVector(dir, 9), dir };
      }
      pl.wires.forEach((w, i) => {
        const A = plugEnd(w.a), B = plugEnd(w.b); if (!A || !B) return;
        const a1 = A.p, b1 = B.p, d = a1.distanceTo(b1), lift = 4 + Math.min(18, d * 0.18) + (i % 3) * 2.5;
        const s = Math.min(14, d * 0.25);
        const curve = new T.CatmullRomCurve3([a1, a1.clone().addScaledVector(A.dir, s).setY(a1.y + lift * 0.55), a1.clone().lerp(b1, 0.5).setY(Math.max(a1.y, b1.y) + lift), b1.clone().addScaledVector(B.dir, s).setY(b1.y + lift * 0.55), b1]);
        scene.add(new T.Mesh(new T.TubeGeometry(curve, 48, 0.8, 8, false), new T.MeshStandardMaterial({ color: lin(w.c), roughness: 0.45 })));
        if (w.label) { const lb = label(w.label, w.c); lb.position.copy(curve.getPoint([0.5, 0.3, 0.7][n % 3])); lb.position.y += 4 + (n % 2) * 4; scene.add(lb); n++; }
      });
      // frame everything on the desk (boards, parts, wires), from the front and above, on wide and narrow screens alike
      const all = new T.Box3();
      scene.children.forEach((c) => { if (c !== desk && !c.isSprite && !c.isLight) all.expandByObject(c); });
      const sphere = all.getBoundingSphere(new T.Sphere()), cam = spec.camera || {};
      const half = Math.min(camera.fov / 2, T.MathUtils.radToDeg(Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)));
      const dist = (sphere.radius / Math.sin(T.MathUtils.degToRad(half))) * 0.8 * (cam.dist || 1);
      const aim = sphere.center.clone().add(new T.Vector3(cam.x || 0, 0, cam.z || 0)).setY(Math.min(sphere.center.y, 20));
      camera.position.copy(aim).addScaledVector(new T.Vector3(0, 150, 125).normalize(), dist); controls.target.copy(aim);
      const grow = Math.max(1, dist / 210);           // labels stay readable when a big desk needs the camera further back
      scene.children.forEach((c) => { if (c.isSprite) c.scale.multiplyScalar(grow); });
      if (msg) msg.remove();
    }).catch(() => { if (msg) msg.textContent = 'The breadboard could not load. Please reload the page.'; });
    return { show(v) { visible = v; if (v) size(); }, scene, camera, controls };
  }

  window.Breadboard = { plan, steps, build, HEAD };
})();
