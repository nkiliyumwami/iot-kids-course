/* Cinema mode for the Lesson 0 explainer video.
   Builds the board with the lesson's own viewer (ESP32.createViewer: same GLB, lights, pad colours, LED looks and
   pin labels), then exposes window.cinema so render.mjs can set every frame exactly:
     cinema.seek(shotId, t)   draw shot `shotId` at clip time t seconds (t = 0 is the first frame, handles included)
     cinema.shots             { id: { length, still, alpha, line } }
   Every frame is computed from t alone (no state carried between frames), so frames can be drawn in any order. */
(function () {
  'use strict';
  const E = window.ESP32, T = THREE;
  const NEUTRAL = '#6B7883';                    // the lesson's colour for pins whose group is not discovered yet
  const GROUP = (g) => E.GROUPS[g].css;         // gnd dark grey, power red, gpio green, special orange
  const YELLOW = '#F2B705', GOOD = '#2E9E57';   // the lesson's highlight yellow and "found it" green
  const HANDLE = 1;                             // seconds of extra footage before and after each shot
  const $ = (s) => document.querySelector(s);

  /* ---------- easing and timing helpers (u is "narration time": 0 = start of the shot, without the handle) ---------- */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
  const cubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const quint = (x) => { x = clamp(x); return x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2; };
  const linear = (x) => clamp(x);
  const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const outBack = (x) => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const seg = (u, a, b, ease = sine) => ease((u - a) / (b - a));
  // 0 -> 1 -> 0 envelope: rises over `up` seconds from `start`, holds, falls over `down` seconds
  const env = (u, start, up, hold, down) => (u < start ? 0 : u < start + up ? sine((u - start) / up)
    : u < start + up + hold ? 1 : 1 - sine((u - start - up - hold) / down));
  const v3 = (a) => new T.Vector3(a[0], a[1], a[2]);

  /* ---------- the board, built exactly as the lesson builds it ---------- */
  const state = { labels: false, mode: 'printed', colours: {}, sel: new Set() };
  const viewer = E.createViewer({
    host: $('#scene'), layer: $('#labels'), model: '../../assets/models/esp32-devkit-v1.glb',
    label: (p) => ({ show: state.labels, color: state.colours[p.node] || NEUTRAL, cls: state.sel.has(p.node) ? 'sel' : '',
      text: state.mode === 'gpio' ? (p.gpio != null ? 'GPIO' + p.gpio : p.printed) : p.printed }),
  });
  const camera = viewer.camera, scene = viewer.scene;
  viewer.controls.update = () => {};            // the camera is driven by the shot list, not by the mouse
  viewer.controls.enabled = false;

  const ext = { pivot: null, inner: null, rings: [], ledBase: {}, ledMesh: {}, glowSprite: {}, halo: {}, haloScale: {}, shadow: null,
    antennaMats: [], moduleMats: [], moduleHalo: null, antennaHalo: null };

  function softTexture(rgb, shape) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');
    if (shape === 'rect') {
      // a soft rounded-rectangle glow, for halos around the metal module and the antenna
      ctx.filter = 'blur(22px)'; ctx.fillStyle = `rgba(${rgb},1)`;
      ctx.beginPath(); ctx.roundRect(48, 48, 160, 160, 18); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.3, `rgba(${rgb},.5)`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; return tex;
  }
  function flatOnBoard(mesh, y) { mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; return mesh; }

  const ready = viewer.ready.then(() => {
    const r = window.__renderer;
    // supersample: draw the board at 2x the output size; the 2:1 screenshot downscale is an exact 2x2 box filter
    r.setPixelRatio(window.devicePixelRatio * (window.CINEMA_SS || 2));
    r.setSize(1920, 1080, false);
    camera.aspect = 16 / 9; camera.updateProjectionMatrix();

    // put the board and everything on it into a pivot, so shots can spin and flip it while the lights stay put
    const pivot = new T.Group(), inner = new T.Group();
    pivot.position.set(0, 0.8, 0.5); inner.position.set(0, -0.8, -0.5); pivot.add(inner);
    scene.children.filter((o) => !o.isLight).forEach((o) => inner.add(o));
    scene.add(pivot); ext.pivot = pivot; ext.inner = inner;

    // the two LEDs: the lesson's mesh, base colour and glow sprite, so their brightness can fade smoothly
    const sprites = []; inner.traverse((o) => { if (o.isSprite) sprites.push(o); });
    [['blue', 'blue_led_body', '58,160,255'], ['power', 'power_led_body', '255,60,40']].forEach(([k, name, rgb]) => {
      const m = inner.getObjectByName(name);
      ext.ledMesh[k] = m; ext.ledBase[k] = m.material.color.clone();
      const c = new T.Box3().setFromObject(m).getCenter(new T.Vector3());
      ext.glowSprite[k] = sprites.slice().sort((a, b) => a.position.distanceTo(c) - b.position.distanceTo(c))[0];
      // a wider, softer halo on top of the lesson's glow: reads as "bloom" in close-ups
      const halo = new T.Sprite(new T.SpriteMaterial({ map: softTexture(rgb), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      halo.position.set(c.x, c.y + 0.8, c.z); halo.visible = false; inner.add(halo); ext.halo[k] = halo;
    });

    // own copies of the antenna and module materials, so they can glow without touching anything else
    const own = (root, list) => root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); list.push(o.material); } });
    own(inner.getObjectByName('pcb_antenna'), ext.antennaMats);
    own(inner.getObjectByName('module_shield'), ext.moduleMats);
    own(inner.getObjectByName('module_shield_lip'), ext.moduleMats);
    ext.antennaMats.concat(ext.moduleMats).forEach((m) => { m.userData.emissive0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; });
    const haloMat = (rgb) => new T.MeshBasicMaterial({ map: softTexture(rgb, 'rect'), blending: T.AdditiveBlending, transparent: true, depthWrite: false });
    ext.moduleHalo = flatOnBoard(new T.Mesh(new T.PlaneGeometry(16.4 * 1.6, 17.8 * 1.6), haloMat('242,183,5')), 2.42);
    ext.moduleHalo.position.set(0, 2.42, -8.9); inner.add(ext.moduleHalo);
    ext.antennaHalo = flatOnBoard(new T.Mesh(new T.PlaneGeometry(12.5 * 1.7, 6.7 * 1.9), haloMat('255,201,60')), 2.46);
    ext.antennaHalo.position.set(0, 2.46, -20.5); inner.add(ext.antennaHalo);

    // a soft contact shadow under the board, so it sits on the page instead of floating (hidden in alpha renders)
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 512;
    const sx = sc.getContext('2d'); sx.filter = 'blur(26px)'; sx.fillStyle = 'rgba(21,32,42,1)';
    sx.beginPath(); sx.roundRect(64, 64, 128, 384, 30); sx.fill();
    ext.shadow = flatOnBoard(new T.Mesh(new T.PlaneGeometry(28.2 * 2, 52.4 * 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false })), -9.5);
    ext.shadow.position.z = 0.5; ext.shadow.renderOrder = -1; scene.add(ext.shadow);

    // a pool of rings that lie flat on the board around a pad
    for (let i = 0; i < 24; i++) {
      const m = new T.Mesh(new T.RingGeometry(1, 1.32, 64), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide }));
      flatOnBoard(m, 1.72); m.visible = false; m.renderOrder = 5; inner.add(m); ext.rings.push(m);
    }
    return document.fonts.ready;
  });

  /* ---------- applying one frame ---------- */
  const tmp = new T.Vector3(), cA = new T.Color(), cB = new T.Color();
  function setCamera(c) {
    const az = c.az * Math.PI / 180, pol = Math.max(0.0001, c.pol) * Math.PI / 180;
    const tg = v3(c.target);
    camera.fov = c.fov || 36; camera.near = 0.5; camera.far = 2000; camera.updateProjectionMatrix();
    camera.position.set(tg.x + c.dist * Math.sin(pol) * Math.sin(az), tg.y + c.dist * Math.cos(pol), tg.z + c.dist * Math.sin(pol) * Math.cos(az));
    // "up" turns smoothly with the camera, so a straight-down view never flips
    camera.up.set(-Math.sin(az) * Math.cos(pol), Math.sin(pol), -Math.cos(az) * Math.cos(pol));
    camera.lookAt(tg);
    camera.updateMatrixWorld();
  }
  const mixCam = (a, b, k) => ({ target: a.target.map((x, i) => lerp(x, b.target[i], k)), dist: lerp(a.dist, b.dist, k),
    az: lerp(a.az, b.az, k), pol: lerp(a.pol, b.pol, k), fov: lerp(a.fov || 36, b.fov || 36, k) });

  // the lesson's LED look (dim colour when off, emissive + glow sprite when on), with a level from 0 to 1
  function setLed(k, level) {
    const m = ext.ledMesh[k].material;
    m.color.copy(ext.ledBase[k]).multiplyScalar(0.3 + 0.7 * level);
    m.emissive.set(level > 0 ? (k === 'blue' ? 0x3aa0ff : 0xff2a1a) : 0x000000);
    m.emissiveIntensity = 2.4 * level;
    const g = ext.glowSprite[k]; g.visible = level > 0.002; g.material.opacity = level;
    const h = ext.halo[k], hs = ext.haloScale[k] || 0;
    h.visible = level > 0.002 && hs > 0; h.material.opacity = 0.55 * level; h.scale.set(hs, hs, 1);
  }
  function setGlow(mats, colour, level) {
    mats.forEach((m) => {
      if (level > 0) { m.emissive.set(colour); m.emissiveIntensity = level; } else { m.emissive.copy(m.userData.emissive0); m.emissiveIntensity = m.userData.ei0; }
    });
  }

  // every shot returns a partial frame description, merged on top of this
  const DEFAULT = () => ({ cam: null, spin: 0, tilt: 0, power: 1, blue: 0, labels: false, mode: 'printed', colours: {},
    sel: [], glow: {}, rings: [], labelFx: {}, fx: [], moduleGlow: 0, antennaGlow: 0, halo: {}, shadow: 1, labelSize: 1 });

  let pending = null;
  function apply(d) {
    setCamera(d.cam);
    ext.pivot.rotation.set(0, d.spin * Math.PI / 180, d.tilt * Math.PI / 180, 'ZYX');
    ext.pivot.updateMatrixWorld(true);
    ext.shadow.visible = !document.body.classList.contains('alpha') && d.shadow > 0;
    ext.shadow.material.opacity = 0.16 * d.shadow;
    ext.haloScale = d.halo;
    // pads: the lesson's group colour (or grey) and the lesson's yellow glow for selected pins
    E.PINS.forEach((p) => {
      const pad = viewer.pads[p.node];
      pad.material.color.set(d.colours[p.node] || NEUTRAL);
      const gl = d.glow[p.node] || 0;
      pad.material.emissive.set(gl > 0 ? YELLOW : 0x000000); pad.material.emissiveIntensity = 0.9 * gl;
    });
    state.labels = d.labels; state.mode = d.mode; state.colours = d.colours; state.sel = new Set(d.sel);
    viewer.refresh();
    ext.rings.forEach((m) => { m.visible = false; });
    d.rings.forEach((r, i) => {
      const m = ext.rings[i]; if (!m || r.alpha <= 0) return;
      viewer.pads[r.node].getWorldPosition(tmp); ext.inner.worldToLocal(tmp);
      m.position.set(tmp.x, 1.72, tmp.z); m.scale.setScalar(r.radius); m.material.color.set(r.colour); m.material.opacity = r.alpha;
      m.visible = true;
    });
    setGlow(ext.moduleMats, 0xF2B705, d.moduleGlow * 0.14);
    ext.moduleHalo.visible = d.moduleGlow > 0; ext.moduleHalo.material.opacity = 0.9 * d.moduleGlow;
    setGlow(ext.antennaMats, 0xFFC93C, d.antennaGlow * 1.6);
    ext.antennaHalo.visible = d.antennaGlow > 0; ext.antennaHalo.material.opacity = 0.9 * d.antennaGlow;
    pending = d;
  }
  // runs inside the viewer's own frame, after its LED update and before it renders
  viewer.onFrame(() => { if (!pending) return; setLed('power', pending.power); setLed('blue', pending.blue); });

  /* labels and 2D effects, placed after the viewer has positioned its labels */
  const project = (node) => {
    viewer.pads[node].getWorldPosition(tmp); tmp.project(camera);
    return { x: (tmp.x + 1) / 2 * 1920, y: (1 - tmp.y) / 2 * 1080, z: tmp.z };
  };
  const SIDE = { L: [], R: [] }; E.PINS.forEach((p) => { SIDE[p.side][p.pos] = p; });
  function pitchAt(p) {
    const n = SIDE[p.side][p.pos === 15 ? 14 : p.pos + 1];
    const a = project(p.node), b = project(n.node);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function styleLabels(d) {
    viewer.labels.forEach(({ el, p }) => {
      if (el.hidden) return;
      const fx = d.labelFx[p.node] || {};
      // sized from the on-screen pin pitch, in the same proportion as in the lesson, so labels stay "attached" in push-ins
      const size = clamp(pitchAt(p) * 0.36, 11, 40) * d.labelSize;
      const s = fx.scale == null ? 1 : fx.scale, sy = fx.scaleY == null ? 1 : fx.scaleY;
      const gap = size * 0.55;
      el.style.fontSize = size.toFixed(2) + 'px';
      el.style.transformOrigin = p.side === 'L' ? 'right center' : 'left center';
      el.style.transform = (p.side === 'L' ? `translate(calc(-100% - ${gap.toFixed(1)}px), -50%)` : `translate(${gap.toFixed(1)}px, -50%)`) + ` scale(${s}, ${s * sy})`;
      el.style.opacity = fx.alpha == null ? 1 : fx.alpha;
      el.style.boxShadow = fx.ring ? `0 0 0 ${(fx.ring.size * size).toFixed(1)}px ${fx.ring.colour}` : '';
    });
  }
  const WARN_SVG = '<svg viewBox="0 0 24 22" width="1.25em" height="1.15em" style="display:block"><path d="M12 1.5 23 20.5H1z" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 8v6.2" stroke="#D9443A" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.5" fill="#D9443A"/></svg>';
  function drawFx(d) {
    const one = (f) => {
      if (!(f.alpha > 0)) return '';
      const at = f.at || (f.node ? project(f.node) : { x: 0, y: 0 });
      const x = at.x + (f.dx || 0), y = at.y + (f.dy || 0);
      const style = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;opacity:${f.alpha.toFixed(3)};font-size:${f.size}px;transform:translate(-50%,-50%) scale(${(f.scale || 1).toFixed(3)})`;
      if (f.kind === 'warn') return `<div class="fx warn" style="${style}">${WARN_SVG}</div>`;
      if (f.kind === 'count') return `<div class="fx count" style="${style}">${f.text}</div>`;
      if (f.kind === 'capsule') {
        const a = project(f.nodes[0]), b = project(f.nodes[1]);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, len = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        return `<div class="fx" style="left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;width:${(len + f.pad * 2).toFixed(1)}px;height:${f.pad * 2}px;border:${f.stroke}px solid ${f.colour};border-radius:999px;opacity:${f.alpha.toFixed(3)};transform:translate(-50%,-50%) rotate(${ang.toFixed(2)}deg) scale(${(f.scale || 1).toFixed(3)});box-shadow:0 0 ${f.pad}px ${f.colour}, inset 0 0 ${f.pad * 0.6}px ${f.colour}"></div>`;
      }
      return '';
    };
    // capsules go under the labels so they never hide a pin name; badges go on top
    const under = d.fx.filter((f) => f.kind === 'capsule').map(one).join(''), over = d.fx.filter((f) => f.kind !== 'capsule').map(one).join('');
    if ($('#fxUnder').innerHTML !== under) $('#fxUnder').innerHTML = under;
    if ($('#fx').innerHTML !== over) $('#fx').innerHTML = over;
  }

  /* ---------- shot list ---------- */
  // cameras: target (board mm), dist, az (deg, 0 = from the USB end), pol (deg from straight down), fov (deg)
  const HERO = { target: [0, 1, 1], dist: 93.5, az: 0, pol: 29, fov: 36 };   // the lesson's own "home" view
  const ALL = {}; E.PINS.forEach((p) => { ALL[p.node] = GROUP(E.groupOf(p)); });
  const groupsOn = (...gs) => { const c = {}; E.PINS.forEach((p) => { if (gs.includes(E.groupOf(p))) c[p.node] = GROUP(E.groupOf(p)); }); return c; };
  const fade = (from, to, k) => { cA.set(from); cB.set(to); return '#' + cA.lerp(cB, clamp(k)).getHexString(); };
  const fadeColours = (base, nodes, colour, k) => { const c = Object.assign({}, base); nodes.forEach((n) => { c[n] = fade(base[n] || NEUTRAL, colour, k); }); return c; };
  // a ring that expands from the pad and fades: the lesson's "found it" pulse, in 3D
  const ringPulse = (node, u, start, colour, big = 3.4) => {
    const k = (u - start) / 0.9; if (k < 0 || k > 1) return null;
    return { node, colour, radius: lerp(1.1, big, outCubic(k)), alpha: 0.95 * (1 - sine(k)) };
  };
  // label "pop": grows past full size, then settles
  const labelPop = (u, start, peak = 1.45) => { const k = (u - start) / 0.9; if (k < 0 || k > 1) return 1; return k < 0.3 ? lerp(1, peak, outCubic(k / 0.3)) : lerp(peak, 1, cubic((k - 0.3) / 0.7)); };

  const S = {};
  // S01: hero ¾ view, slow 30° orbit with a gentle push-in. Board on, labels off (as at the start of the lesson).
  S.S01_hero_orbit = { length: 10, alpha: true, line: 'Intro + outro',
    frame: (u) => { const k = seg(u, 0, 10); return { cam: { target: [0, 1, 1], dist: lerp(104, 90, k), az: lerp(-15, 15, k), pol: lerp(33, 30, k) } }; } };
  // S02: straight-on top view, a full spin, a tilt to show the underside, back to the top. Unplugged, like step 1.
  S.S02_spin_flip = { length: 8, line: '"Spin it. Look underneath too."',
    frame: (u) => {
      const spin = 360 * seg(u, 0.35, 4.55, quint);
      const tilt = 150 * (seg(u, 4.45, 6.05, cubic) - seg(u, 6.4, 7.85, cubic));
      return { cam: { target: [0, 1, 0.5], dist: 112, az: 0, pol: 0, fov: 36 }, spin, tilt, power: 0, shadow: 1 - Math.min(1, tilt / 40) };
    } };
  // S03: push in from the full board to the metal module; a soft glow on the module from t = 2 s
  S.S03_brain_pushin = { length: 6, line: '"the brain hides under a shiny metal lid"',
    frame: (u) => {
      const k = seg(u, 0.2, 4.6, quint);
      const near = { target: [0, 3.8, -9.2], dist: 44, az: -8, pol: 36, fov: 34 };
      return { cam: mixCam({ target: [0, 1, 1], dist: 98, az: 0, pol: 30, fov: 36 }, near, k), power: 0,
        moduleGlow: env(u, 2.0, 0.7, 0.5, 1.0) * 0.6 + 0.4 * seg(u, 2.0, 2.7) };
    } };
  // S04: close on the zig-zag antenna, drifting sideways; the antenna pulses twice
  S.S04_antenna = { length: 5, line: '"That\'s the antenna"',
    frame: (u) => {
      const k = sine(seg(u, -1, 6, linear));
      return { cam: { target: [lerp(-1.6, 1.6, k), 2.4, -19.6], dist: 30, az: lerp(-14, 6, k), pol: 38, fov: 34 }, power: 0,
        antennaGlow: env(u, 0.9, 0.35, 0.25, 0.6) + env(u, 2.5, 0.35, 0.25, 0.6) };
    } };
  // S05: the USB socket; the red power LED wakes up at t = 2 s
  S.S05_usb_power_on = { length: 6, line: '"Plug in the USB and the red light wakes up"',
    frame: (u) => {
      const k = sine(seg(u, -1, 7, linear));
      const on = seg(u, 2.0, 2.12, linear), flare = env(u, 2.0, 0.08, 0.05, 0.6);
      return { cam: { target: [-1.2, 2.4, 16.5], dist: lerp(50, 43, k), az: lerp(-8, 4, k), pol: 55, fov: 34 },
        power: on, halo: { power: 9 + 9 * on + 6 * flare } };
    } };
  // S06: pan down the left header, across, and up the right header; labels pop in as the camera reaches them
  const S06path = new T.CatmullRomCurve3([v3([-7.5, 1.6, -16]), v3([-7.5, 1.6, -2]), v3([-7.5, 1.6, 14]), v3([-2, 1.6, 17.5]), v3([5, 1.6, 15]), v3([7.5, 1.6, 4]), v3([7.5, 1.6, -11])], false, 'centripetal');
  const S06cam = (u) => ({ target: S06path.getPointAt(seg(u, 0, 7.9, (x) => sine(x) * 0.85 + clamp(x) * 0.15)).toArray(), dist: 52, az: 0, pol: 26, fov: 34 });
  const popTimes = {};
  S.S06_pin_headers = { length: 8, line: '"Thirty of them, fifteen per side"',
    init() {
      // when does each pad first come into the middle of the frame? that is when its label pops in
      const cam = new T.PerspectiveCamera(34, 16 / 9, 0.5, 2000), w = new T.Vector3();
      for (let u = -1; u <= 9; u += 1 / 60) {
        const c = S06cam(u), pol = c.pol * Math.PI / 180, tg = v3(c.target);
        cam.position.set(tg.x, tg.y + c.dist * Math.cos(pol), tg.z + c.dist * Math.sin(pol)); cam.up.set(0, Math.sin(pol), -Math.cos(pol));
        cam.lookAt(tg); cam.updateMatrixWorld();
        E.PINS.forEach((p) => {
          if (popTimes[p.node] != null) return;
          viewer.pads[p.node].getWorldPosition(w); w.project(cam);
          if (Math.abs(w.y) < 0.62 && Math.abs(w.x) < 0.9) popTimes[p.node] = Math.max(0.15, u);
        });
      }
      E.PINS.forEach((p) => { if (popTimes[p.node] == null) popTimes[p.node] = 7; });
    },
    frame: (u) => {
      const labelFx = {};
      E.PINS.forEach((p) => { const k = (u - popTimes[p.node]) / 0.42; labelFx[p.node] = { alpha: clamp(k / 0.45), scale: k <= 0 ? 0.001 : lerp(0.35, 1, outBack(k)) }; });
      return { cam: S06cam(u), labels: true, labelFx };
    } };
  // S07: GND pins go dark grey with a ring at 1 s, 3V3 and VIN go red at 5 s, a short-circuit warning at 8 s
  S.S07_gnd_then_power = { length: 10, line: 'GND / 3V3 / VIN / safety rule',
    frame: (u) => {
      const gnd = ['L14_GND', 'R14_GND'], pow = ['R15_3V3', 'L15_VIN'];
      let colours = fadeColours({}, gnd, GROUP('gnd'), seg(u, 1, 1.35));
      colours = fadeColours(colours, pow, GROUP('power'), seg(u, 5, 5.35));
      const glow = {}, labelFx = {};
      gnd.forEach((n) => { glow[n] = env(u, 1, 0.25, 1.2, 1.0) * 0.8; labelFx[n] = { scale: labelPop(u, 1, 1.3) }; });
      pow.forEach((n) => { glow[n] = env(u, 5, 0.25, 1.2, 1.0) * 0.8; labelFx[n] = { scale: labelPop(u, 5, 1.3) }; });
      const rings = [...gnd.map((n) => ringPulse(n, u, 1, '#3D4148')), ...gnd.map((n) => ringPulse(n, u, 1.45, '#3D4148', 2.6)),
        ...pow.map((n) => ringPulse(n, u, 5, '#D9443A')), ...pow.map((n) => ringPulse(n, u, 5.45, '#D9443A', 2.6))].filter(Boolean);
      // the warning: two quick red flashes around the 3V3-GND pair, then it fades
      const w = Math.max(env(u, 8, 0.1, 0.25, 0.2), env(u, 8.6, 0.1, 0.55, 0.4));
      const pop = lerp(0.85, 1, outBack(seg(u, 8, 8.25, linear)));
      const fx = [{ kind: 'capsule', nodes: ['R14_GND', 'R15_3V3'], pad: 22, stroke: 6, colour: 'rgba(217,68,58,.95)', alpha: w, scale: pop },
        { kind: 'warn', node: 'R15_3V3', dx: 190, dy: -24, size: 40, alpha: w, scale: pop }];
      const k = sine(seg(u, -1, 11, linear));
      return { cam: { target: [0, 1, 1.5], dist: 86, az: lerp(9, 3, k), pol: lerp(26, 23, k) }, labels: true, colours, glow, rings, labelFx, fx };
    } };
  // S08: D2 and the blue LED; D2 lights up at 1 s, the LED goes ON at 3, OFF at 5, ON at 6.5
  S.S08_d2_led = { length: 8, line: '"Press ON… Press OFF"',
    frame: (u) => {
      const blue = seg(u, 3, 3.07, linear) - seg(u, 5, 5.1, linear) + seg(u, 6.5, 6.57, linear);
      const k = sine(seg(u, -1, 9, linear));
      return { cam: { target: [8.6, 1.8, 9.2], dist: lerp(54, 48, k), az: lerp(-6, 4, k), pol: 30, fov: 34 }, labels: true,
        colours: groupsOn('gnd', 'power'), sel: u >= 1 ? ['R12_GPIO2'] : [], glow: { R12_GPIO2: seg(u, 1, 1.3) },
        rings: [ringPulse('R12_GPIO2', u, 1, YELLOW), ringPulse('R12_GPIO2', u, 1.4, YELLOW, 2.6)].filter(Boolean),
        labelFx: { R12_GPIO2: { scale: labelPop(u, 1, 1.35) } }, blue, halo: { blue: 12 } };
    } };
  // S09: count down the left header 1…8 and stop on D25; at 5 s the labels flip to GPIO numbers, then back at 7 s
  S.S09_d25_trick = { length: 8, line: '"Pin(25) means GPIO 25, printed D25"',
    frame: (u) => {
      const hop = 0.36, tFound = 1 + 7 * hop, n = clamp((u - 1) / hop, 0, 7);   // n: 0 … 7 = pin 1 … pin 8
      const i = Math.floor(n), pos = Math.min(7, i + cubic(Math.min(1, (n - i) / 0.55)));
      const a = project(SIDE.L[Math.floor(pos) + 1].node), b = project(SIDE.L[Math.min(8, Math.floor(pos) + 2)].node);
      const at = { x: lerp(a.x, b.x, pos - Math.floor(pos)), y: lerp(a.y, b.y, pos - Math.floor(pos)) };
      const found = u >= tFound;
      const countAlpha = seg(u, 0.85, 1.0, linear) * (1 - seg(u, 4.2, 4.7));
      const bump = u < tFound + 0.1 ? 0.2 * (1 - Math.min(1, (n - i) / 0.4)) : 0;
      const fx = [{ kind: 'count', at, dx: 46, size: 30, alpha: countAlpha, text: String(Math.round(pos) + 1), scale: 1 + bump }];
      const rings = [];
      if (!found && countAlpha > 0) rings.push({ node: SIDE.L[Math.round(pos) + 1].node, colour: YELLOW, radius: 1.5, alpha: 0.9 * countAlpha });
      [ringPulse('L08_GPIO25', u, tFound, GOOD), ringPulse('L08_GPIO25', u, tFound + 0.4, GOOD, 2.6)].forEach((r) => r && rings.push(r));
      // label flip: squash to a line, swap the text, open again
      const flipK = (t0) => { const k = (u - t0) / 0.32; return k < 0 || k > 1 ? null : k; };
      const fk = flipK(5) != null ? flipK(5) : flipK(7);
      const mode = (u >= 5.16 && u < 7.16) ? 'gpio' : 'printed';
      const scaleY = fk == null ? 1 : Math.max(0.04, Math.abs(Math.cos(fk * Math.PI)));
      const labelFx = {}; E.PINS.forEach((p) => { labelFx[p.node] = { scaleY }; });
      if (found) labelFx.L08_GPIO25.scale = labelPop(u, tFound, 1.4);
      const k = sine(seg(u, -1, 9, linear));
      return { cam: { target: [-6.5, 1.8, -2.5], dist: lerp(62, 56, k), az: lerp(5, -3, k), pol: 27, fov: 34 }, labels: true, mode,
        colours: groupsOn('gnd', 'power', 'gpio'), sel: found ? ['L08_GPIO25'] : [], glow: { L08_GPIO25: found ? seg(u, tFound, tFound + 0.3) : 0 }, rings, labelFx, fx };
    } };
  // S10: every special-job pin turns orange together
  S.S10_special_pins = { length: 5, line: '"The orange pins talk to your computer…"',
    frame: (u) => {
      const special = E.PINS.filter((p) => E.groupOf(p) === 'special').map((p) => p.node);
      const colours = fadeColours(groupsOn('gnd', 'power', 'gpio'), special, GROUP('special'), seg(u, 0.8, 1.2));
      const glow = {}, labelFx = {}, rings = [];
      special.forEach((n) => { glow[n] = env(u, 0.8, 0.25, 1.4, 1.2) * 0.75; labelFx[n] = { scale: labelPop(u, 0.8, 1.25) }; const r = ringPulse(n, u, 0.8, '#D9821A', 3.0); if (r) rings.push(r); });
      const k = sine(seg(u, -1, 6, linear));
      return { cam: { target: [0, 1, 1.5], dist: lerp(88, 84, k), az: lerp(-5, 3, k), pol: 24 }, labels: true, colours, glow, labelFx, rings };
    } };
  // S11: the pin hunt: D27, a GND, D26, 3V3, D32, D2, 1.8 s apart
  S.S11_pin_hunt = { length: 12, line: 'Pin hunt',
    frame: (u) => {
      const order = ['L10_GPIO27', 'L14_GND', 'L09_GPIO26', 'R15_3V3', 'L06_GPIO32', 'R12_GPIO2'];
      const glow = {}, labelFx = {}, rings = [], sel = [];
      order.forEach((n, i) => {
        const t0 = 1 + i * 1.8;
        glow[n] = env(u, t0, 0.15, 0.6, 0.6);
        labelFx[n] = { scale: labelPop(u, t0, 1.55) };
        if (u >= t0 && u < t0 + 1.3) sel.push(n);
        [ringPulse(n, u, t0, GOOD, 3.6), ringPulse(n, u, t0 + 0.3, GOOD, 2.6)].forEach((r) => r && rings.push(r));
      });
      const k = sine(seg(u, -1, 13, linear));
      return { cam: { target: [0, 1, 1.5], dist: lerp(87, 83, k), az: lerp(6, -6, k), pol: lerp(25, 23, k) }, labels: true, colours: ALL, glow, labelFx, rings, sel };
    } };
  // S12: the S01 view, the other way, slower, settling into a clean hold for the end card
  S.S12_hero_slow = { length: 10, line: 'Outro (end card)',
    frame: (u) => { const k = seg(u, 0, 7.6, (x) => 1 - Math.pow(1 - clamp(x), 2.4)); return { cam: { target: [0, 1, 1], dist: lerp(90, 98, k), az: lerp(14, -6, k), pol: lerp(30, 31, k) } }; } };

  // stills (one frame each)
  const still = (line, fn, alpha) => ({ still: true, length: 0, alpha: !!alpha, line, frame: fn });
  S.ST01_board_top = still('Straight-on board, all labels', () => ({ cam: { target: [0, 1, 0.5], dist: 92, az: 0, pol: 0 }, labels: true, colours: ALL }), true);
  S.ST02_board_angled = still('Hero angle', () => ({ cam: Object.assign({}, HERO, { dist: 97 }) }), true);
  S.ST03_module_closeup = still('Metal module close-up', () => ({ cam: { target: [0, 3.8, -9.2], dist: 44, az: -8, pol: 36, fov: 34 }, power: 0 }));
  // one header at a time: only that side's labels, a little larger
  const oneSide = (side) => { const fx = {}; E.PINS.forEach((p) => { if (p.side !== side) fx[p.node] = { alpha: 0 }; }); return fx; };
  S.ST04_pinout_left = still('Left header pinout', () => ({ cam: { target: [-5, 1.6, 1.2], dist: 68, az: 0, pol: 8, fov: 34 }, labels: true, colours: ALL, labelFx: oneSide('L'), labelSize: 1.2 }));
  S.ST05_pinout_right = still('Right header pinout', () => ({ cam: { target: [5, 1.6, 1.2], dist: 68, az: 0, pol: 8, fov: 34 }, labels: true, colours: ALL, labelFx: oneSide('R'), labelSize: 1.2 }));
  S.ST06_gnd_power_highlight = still('GND and power pins highlighted', () => {
    const nodes = ['L14_GND', 'R14_GND', 'R15_3V3', 'L15_VIN'], glow = {}; nodes.forEach((n) => { glow[n] = 0.8; });
    return { cam: { target: [0, 1, 1.5], dist: 86, az: 6, pol: 25 }, labels: true, colours: groupsOn('gnd', 'power'), glow, sel: nodes };
  });
  S.ST07_d2_highlight = still('D2 highlighted, blue LED on', () => ({ cam: { target: [8.6, 1.8, 9.2], dist: 50, az: 0, pol: 30, fov: 34 }, labels: true,
    colours: groupsOn('gnd', 'power'), sel: ['R12_GPIO2'], glow: { R12_GPIO2: 1 }, blue: 1, halo: { blue: 12 } }));
  S.ST08_d25_highlight = still('D25 highlighted', () => ({ cam: { target: [-6.5, 1.8, -2.5], dist: 58, az: 0, pol: 27, fov: 34 }, labels: true,
    colours: groupsOn('gnd', 'power', 'gpio'), sel: ['L08_GPIO25'], glow: { L08_GPIO25: 1 } }));

  const inited = new Set();
  function seek(id, t, opts) {
    const shot = S[id]; if (!shot) throw new Error('no shot ' + id);
    if (shot.init && !inited.has(id)) { shot.init(); inited.add(id); }
    const alpha = !!(opts && opts.alpha);
    document.body.classList.toggle('alpha', alpha);
    scene.background = alpha ? null : new T.Color(0xF6F8FA);
    window.__renderer.setClearColor(0x000000, alpha ? 0 : 1);
    const u = shot.still ? 0 : t - HANDLE;
    // place the camera and the board first: some effects (like the counting badge) are placed in screen space
    const d0 = Object.assign(DEFAULT(), shot.frame(u));
    setCamera(d0.cam); ext.pivot.rotation.set(0, d0.spin * Math.PI / 180, d0.tilt * Math.PI / 180, 'ZYX'); ext.pivot.updateMatrixWorld(true);
    const d = Object.assign(DEFAULT(), shot.frame(u));
    apply(d);
    window.__viewerFrame(100000 + Math.round(t * 1000));   // the viewer's own frame: LEDs, our hook, render, label positions
    styleLabels(d);
    drawFx(d);
    return true;
  }
  const shots = {};
  Object.keys(S).forEach((id) => { shots[id] = { length: S[id].length, still: !!S[id].still, alpha: !!S[id].alpha, line: S[id].line, handle: S[id].still ? 0 : HANDLE }; });
  window.cinema = { ready, shots, seek, viewer,
    // step through a whole shot (for poking at it by hand in devtools); render.mjs calls seek() itself
    play(id, onFrame) { const n = Math.round((S[id].length + 2 * HANDLE) * 60); for (let i = 0; i < n; i++) { seek(id, i / 60); if (onFrame) onFrame(i); } } };
})();
