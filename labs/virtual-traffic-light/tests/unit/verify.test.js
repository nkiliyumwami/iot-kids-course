// Independent verification of the circuit model (phase 4). A second, separately written reference model below is
// compared with netlist.js on thousands of random miswirings of the canonical circuit, plus rule invariants that must
// hold whatever the wiring. The reference shares no code with netlist.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../../../../assets/virtual-lab/netlist.js');
const C = require('../../../../assets/virtual-lab/curriculum.js');

/* ---------- the reference model (the documented rules, written again from scratch) ---------- */
// rows a–e of a column are one strip, f–j another; each rail is one strip; every GND pin is one node.
function refNode(e) {
  if (e.k === 'hole') return ('abcde'.includes(e.r) ? 'top' : 'bottom') + '-' + e.c;
  if (e.k === 'rail') return 'rail-' + e.rail;
  const name = e.id.split(':')[1];
  return name === 'GND' ? 'gnd' : 'pin-' + name;
}
// Which LEDs light when one of D25/D26/D27 is HIGH and the other two LOW (power on). Returns { ledId: 1 | 2 } or
// 'short' when a HIGH node is wired straight to a 0 V node. 2 = no resistor in the path (too much current).
// Sources: a HIGH GPIO or 3V3 (3.3 V: enough for one LED in a path) and VIN (about 5 V from USB: up to two in a row).
function refLit(build, high) {
  const parent = {};
  const root = (x) => { while (parent[x] && parent[x] !== x) x = parent[x]; return x; };
  const join = (x, y) => { const a = root(x), b = root(y); if (a !== b) parent[a] = b; };
  for (const p of Object.values(build)) for (const e of [p.a, p.b]) if (e) { const n = refNode(e); if (!parent[n]) parent[n] = n; }
  for (const n of ['gnd', 'pin-D25', 'pin-D26', 'pin-D27', 'pin-3V3', 'pin-VIN']) if (!parent[n]) parent[n] = n;
  for (const p of Object.values(build)) if (p.type === 'wire' && p.a && p.b) join(refNode(p.a), refNode(p.b));
  const level = {};
  for (const n of Object.keys(parent)) {
    const r = root(n);
    const v = n === 'gnd' ? 0 : n === 'pin-3V3' ? 'H' : n === 'pin-VIN' ? 'H5' : ['pin-D25', 'pin-D26', 'pin-D27'].includes(n) ? (n === 'pin-' + high ? 'H' : 0) : null;
    if (v === null) continue;
    if (level[r] !== undefined && level[r] !== v) return 'short';
    level[r] = v;
  }
  const parts = Object.entries(build).filter(([, p]) => p.type !== 'wire' && p.a && p.b).map(([id, p]) => ({ id, type: p.type, a: root(refNode(p.a)), b: root(refNode(p.b)) }));
  const lit = {};
  let maxLeds = 1;
  const dfs = (net, visited, used, leds, res) => {
    if (level[net] === 0) { if (leds.length >= 1 && leds.length <= maxLeds) for (const l of leds) lit[l] = Math.max(lit[l] || 0, res ? 1 : 2); return; }
    for (const p of parts) {
      if (used.includes(p.id)) continue;
      const steps = p.type === 'resistor' ? [[p.a, p.b], [p.b, p.a]] : [[p.a, p.b]]; // an LED only from anode to cathode
      for (const [from, to] of steps) {
        if (from !== net || visited.includes(to)) continue;
        dfs(to, visited.concat(to), used.concat(p.id), p.type === 'led' ? leds.concat(p.id) : leds, res + (p.type === 'resistor' ? 1 : 0));
      }
    }
  };
  for (const n of Object.keys(level)) if (level[n] === 'H' || level[n] === 'H5') { maxLeds = level[n] === 'H5' ? 2 : 1; dfs(n, [n], [], [], 0); }
  return lit;
}
const netlistLit = (build, high) => {
  const pins = { D25: 'low', D26: 'low', D27: 'low' }; pins[high] = 'high';
  return Object.fromEntries(Object.entries(N.ledStates(build, { powered: true, pins })).filter(([, v]) => v.level > 0).map(([id, v]) => [id, v.level]));
};

/* ---------- random miswirings ---------- */
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ROWS = 'abcdefghij';
const PINS = ['near:D25', 'near:D26', 'near:D27', 'near:D14', 'near:D13', 'near:GND', 'far:GND', 'far:3V3', 'near:VIN', 'near:D33'];
function randomEnd(r, forWire) {
  const k = r();
  if (forWire && k < 0.2) return { k: 'pin', id: PINS[Math.floor(r() * PINS.length)] };
  if (k < 0.35) { let c; do c = 1 + Math.floor(r() * 30); while (!N.railHasCol(c)); return { k: 'rail', rail: ['BN', 'BP', 'TN', 'TP'][Math.floor(r() * 4)], c }; }
  return { k: 'hole', c: 1 + Math.floor(r() * 30), r: ROWS[Math.floor(r() * 10)] };
}
function mutate(r) {
  const b = C.canonicalParts();
  const ids = Object.keys(b);
  const n = 1 + Math.floor(r() * 3); // one to three mistakes at once
  for (let i = 0; i < n; i++) {
    const id = ids[Math.floor(r() * ids.length)];
    if (!b[id]) continue;
    const what = r();
    if (what < 0.15) delete b[id];
    else if (what < 0.3 && b[id].type === 'led') b[id] = { ...b[id], a: b[id].b, b: b[id].a };
    else { const end = r() < 0.5 ? 'a' : 'b'; b[id] = { ...b[id], [end]: randomEnd(r, b[id].type === 'wire') }; }
  }
  return b;
}

test('the reference model agrees with the documented circuit: each pin lights only its own LED', () => {
  const b = C.canonicalParts();
  assert.deepEqual(refLit(b, 'D25'), { 'led-red': 1 });
  assert.deepEqual(refLit(b, 'D26'), { 'led-yellow': 1 });
  assert.deepEqual(refLit(b, 'D27'), { 'led-green': 1 });
});

test('3000 random miswirings: netlist.js and the reference model agree on every LED, for every pin', () => {
  const r = rng(20261017);
  const mismatches = [];
  let shorts = 0, compared = 0;
  for (let i = 0; i < 3000; i++) {
    const b = mutate(r);
    for (const high of ['D25', 'D26', 'D27']) {
      const ref = refLit(b, high);
      if (ref === 'short') { shorts++; assert.equal(N.isSafe(b), false, 'a short must be unsafe'); continue; }
      compared++;
      const got = netlistLit(b, high);
      if (JSON.stringify(Object.entries(got).sort()) !== JSON.stringify(Object.entries(ref).sort())) mismatches.push({ i, high, got, ref, b });
    }
  }
  assert.ok(compared > 6000, `compared ${compared}`);
  assert.equal(mismatches.length, 0, JSON.stringify(mismatches.slice(0, 2)));
  console.log(`# compared ${compared} pin settings, ${shorts} shorts (all flagged unsafe)`);
});

test('rule invariants hold for 3000 random miswirings', () => {
  const r = rng(7);
  for (let i = 0; i < 3000; i++) {
    const b = mutate(r);
    const check = N.lessonCheck(b, C.PLAN);
    // 1. "matches the plan" means: each pin lights exactly its own LED, at a safe level
    if (check.ok) {
      assert.ok(check.safe);
      assert.deepEqual(netlistLit(b, 'D25'), { 'led-red': 1 }, `case ${i}`);
      assert.deepEqual(netlistLit(b, 'D26'), { 'led-yellow': 1 }, `case ${i}`);
      assert.deepEqual(netlistLit(b, 'D27'), { 'led-green': 1 }, `case ${i}`);
    }
    // 2. any way an LED could get too much current (no resistor) makes the circuit unsafe, so it is never powered
    for (const high of ['D25', 'D26', 'D27']) {
      if (Object.values(netlistLit(b, high)).includes(2)) assert.equal(check.safe, false, `case ${i}: no-resistor path must be unsafe`);
    }
    // 3. an unsafe circuit gets no predictions (it stays unplugged)
    if (!check.safe) assert.equal(N.predict(b, C.PLAN), null);
    // 4. every problem found has words for the learner
    for (const ch of check.channels) for (const is of ch.issues) assert.ok(C.ISSUES[is.code], is.code);
    // 5. with no power, nothing ever lights
    assert.ok(Object.values(N.ledStates(b, { powered: false, pins: { D25: 'high', D26: 'high', D27: 'high' } })).every((v) => v.level === 0));
  }
});

test('documented rules, one by one', () => {
  const b = C.canonicalParts();
  const pins = Object.fromEntries(['red', 'yellow', 'green'].map((k) => [k, b['sig-' + k].a.id]));
  assert.deepEqual(pins, { red: 'near:D25', yellow: 'near:D26', green: 'near:D27' }, 'GPIO25 red, GPIO26 yellow, GPIO27 green');
  assert.equal(Object.values(b).filter((p) => p.type === 'resistor').length, 3, 'three resistors');
  for (const k of ['red', 'yellow', 'green']) {
    // take this LED's resistor away (a plain wire across the gap instead): unsafe
    const x = C.canonicalParts(); x['res-' + k] = { type: 'wire', a: x['res-' + k].a, b: x['res-' + k].b };
    assert.equal(N.isSafe(x), false, `${k} without its resistor is unsafe`);
    // share one resistor between two LEDs: flagged
    const y = C.canonicalParts(); y['led-' + k] = { ...y['led-' + k], a: { k: 'hole', c: k === 'red' ? 15 : 7, r: 'h' }, b: { k: 'hole', c: k === 'red' ? 16 : 8, r: 'h' } };
    const issues = N.lessonCheck(y, C.PLAN).channels.flatMap((c) => c.issues.map((i) => i.code));
    assert.ok(issues.includes('sharedResistor'), `${k}: ${issues}`);
  }
});
