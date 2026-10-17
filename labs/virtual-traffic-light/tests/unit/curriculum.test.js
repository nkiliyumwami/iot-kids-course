// Checks the lab's teaching data against the canonical circuit (AGENT.md, Lesson 1) and the spec's 24 steps.
// Run: cd labs/virtual-traffic-light/tests && npm run unit
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../../../assets/virtual-lab/curriculum.js');

test('canonical channels: D25 red row 7, D26 yellow row 15, D27 green row 23', () => {
  assert.deepEqual(C.CHANNELS.map((c) => [c.key, c.pin, c.gpio, c.col]), [
    ['red', 'near:D25', 25, 7],
    ['yellow', 'near:D26', 26, 15],
    ['green', 'near:D27', 27, 23],
  ]);
  for (const c of C.CHANNELS) assert.equal(Number(c.pin.slice(6)), c.gpio, 'Pin(n) means GPIO n, printed Dn');
});

test('ground is the GND next to D13, and resistors are 330 Ω', () => {
  assert.equal(C.GROUND_PIN, 'near:GND');
  assert.equal(C.RESISTOR_OHMS, 330);
});

test('24 steps with unique ids, every one in a known stage, stages in order', () => {
  assert.equal(C.STEPS.length, 24);
  assert.equal(new Set(C.STEPS.map((s) => s.id)).size, 24);
  const order = C.STEPS.map((s) => C.stageOf(s));
  assert.ok(order.every((i) => i >= 0), 'every step belongs to a stage');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'stages never go backwards');
  assert.equal(new Set(order).size, C.STAGES.length, 'every stage has steps');
});

test('ready steps come first, with no gaps, and each has text, a task and a camera or a part', () => {
  const last = C.lastReady();
  assert.equal(C.STEPS[last].id, 'quiz', 'phase 3: all 24 steps are ready');
  assert.equal(last, 23);
  C.STEPS.forEach((s, i) => {
    assert.equal(!!s.ready, i <= last, `step ${i} (${s.id}) ready flag`);
    if (s.ready) assert.ok(s.text && s.title && s.task && (s.cam || s.place), `step ${s.id} is complete`);
  });
});

test('building steps follow the spec: resistor, LED, ground, signal per light, then close the loop', () => {
  assert.deepEqual(C.placeSteps().map((s) => s.place), [
    'res-red', 'led-red', 'gw-red', 'sig-red', 'res-yellow', 'led-yellow', 'gw-yellow', 'sig-yellow',
    'res-green', 'led-green', 'gw-green', 'sig-green', 'gnd']);
  for (const s of C.placeSteps()) assert.ok(s.why && s.wrong && s.holding, `${s.id} explains why and what goes wrong`);
});

test('the canonical build is exactly the wiring table (spec section 3)', () => {
  const p = C.canonicalParts();
  const e = (x) => (x.k === 'hole' ? `${x.r}${x.c}` : x.k === 'rail' ? `${x.rail}${x.c}` : x.id);
  const table = Object.fromEntries(Object.entries(p).map(([id, v]) => [id, `${e(v.a)}→${e(v.b)}`]));
  assert.deepEqual(table, {
    'res-red': 'd7→g7', 'led-red': 'i7→i8', 'gw-red': 'j8→BN8', 'sig-red': 'near:D25→b7',
    'res-yellow': 'd15→g15', 'led-yellow': 'i15→i16', 'gw-yellow': 'j16→BN16', 'sig-yellow': 'near:D26→b15',
    'res-green': 'd23→g23', 'led-green': 'i23→i24', 'gw-green': 'j24→BN24', 'sig-green': 'near:D27→b23',
    gnd: 'near:GND→BN30',
  });
});

test('quiz: the spec’s three questions, each with one right answer, a hint and a reason', () => {
  assert.equal(C.QUIZ.length, 3);
  assert.deepEqual(C.QUIZ.map((q) => q.id), ['q-resistor', 'q-pin', 'q-ground']);
  for (const q of C.QUIZ) assert.ok(q.opts.length === 3 && q.opts[q.right] && q.hint && q.why, q.id);
  assert.notDeepEqual(C.QUIZ.map((q) => q.right), [0, 0, 0], 'the right answer is not always first');
});

test('fix-it workshop: three faults (polarity, wrong pin, unsafe), and "fix it for me" really fixes each', () => {
  const N = require('../../../../assets/virtual-lab/netlist.js');
  assert.equal(C.WORKSHOP.length, 3);
  const unsafe = C.WORKSHOP.filter((id) => !N.isSafe(C.withMistake(id)));
  assert.equal(unsafe.length, 1, 'exactly one is dangerous');
  const canon = C.canonicalParts();
  for (const id of C.WORKSHOP) {
    const b = C.withMistake(id);
    for (const ch of N.lessonCheck(b, C.PLAN).channels) for (const is of ch.issues) for (const part of C.fixParts(is.code, ch.key, is.refs)) b[part] = JSON.parse(JSON.stringify(canon[part]));
    assert.ok(N.lessonCheck(b, C.PLAN).ok, `${id} fixed`);
  }
});

test('every placing hint has three levels and no gaps in its words', () => {
  const N = require('../../../../assets/virtual-lab/netlist.js');
  const ctx = { got: { k: 'hole', c: 8, r: 'd' }, want: { k: 'hole', c: 7, r: 'd' }, name: N.endName, strip: N.stripName, half: () => 'far', railName: (k) => N.RAIL_NAMES[k] };
  for (const [code, f] of Object.entries(C.PLACE_HINTS)) {
    const x = Object.assign({}, ctx);
    if (code === 'wrongRail' || code === 'sameRail') Object.assign(x, { got: { k: 'rail', rail: 'TN', c: 8 }, want: { k: 'rail', rail: 'BN', c: 8 } });
    if (code === 'wrongPin' || code === 'otherGnd' || code === 'wantPin') Object.assign(x, { got: { k: 'pin', id: 'near:D26' }, want: { k: 'pin', id: 'near:D25' } });
    const lines = f(x);
    assert.equal(lines.length, 3, code);
    assert.ok(lines.every((l) => l.length > 10 && !/undefined|NaN|\[object/.test(l)), `${code}: ${lines.join(' | ')}`);
  }
});

test('every part in "Meet the kit" has a description, and every description says why', () => {
  for (const k of C.KIT_KINDS) for (const p of k.parts) assert.ok(C.PARTS[p], `part ${p}`);
  for (const [k, p] of Object.entries(C.PARTS)) assert.ok(p.name && p.does && p.why, `part ${k}`);
});

test('no 220 Ω anywhere in the lab text (the course uses 330 Ω)', () => {
  assert.ok(!/220\s*Ω|220 ?ohm/i.test(JSON.stringify(C)));
});
