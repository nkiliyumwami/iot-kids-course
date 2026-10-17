// The electrical model: right circuit, every wrong and unsafe circuit, and LED behaviour for pin levels.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../../../../assets/virtual-lab/netlist.js');
const C = require('../../../../assets/virtual-lab/curriculum.js');

const H = (c, r) => ({ k: 'hole', c, r }), R = (c, rail = 'BN') => ({ k: 'rail', rail, c }), PIN = (id) => ({ k: 'pin', id });
const good = () => C.canonicalParts();
const check = (b) => N.lessonCheck(b, C.PLAN);
const codes = (b, key) => check(b).channels.find((c) => c.key === key).issues.map((i) => i.code);
const okKeys = (b) => check(b).channels.filter((c) => c.ok).map((c) => c.key);
const on = (pins) => ({ powered: true, pins });
const lit = (b, pins) => Object.entries(N.ledStates(b, on(pins))).filter(([, v]) => v.level > 0).map(([id, v]) => `${id}:${v.level}`).sort();
const ALL_LOW = { D25: 'low', D26: 'low', D27: 'low' };

/* ---------- the breadboard itself ---------- */
test('strips: a–e of a column are one node, f–j another; the gap separates them', () => {
  assert.equal(N.nodeOf(H(7, 'a')), N.nodeOf(H(7, 'e')));
  assert.equal(N.nodeOf(H(7, 'f')), N.nodeOf(H(7, 'j')));
  assert.notEqual(N.nodeOf(H(7, 'e')), N.nodeOf(H(7, 'f')));
  assert.notEqual(N.nodeOf(H(7, 'a')), N.nodeOf(H(8, 'a')));
});
test('rails are separate: BN, BP, TN, TP are never joined unless a wire joins them', () => {
  const cx = N.connectivity({ w: { type: 'wire', a: R(2, 'BN'), b: R(28, 'BN') } });
  assert.equal(cx.net(R(2)), cx.net(R(28)));
  for (const other of ['BP', 'TN', 'TP']) assert.notEqual(cx.net(R(2)), cx.net(R(2, other)));
  assert.ok(!N.railHasCol(7) && N.railHasCol(8), 'rail holes skip columns 1, 7, 13, 19, 25');
});
test('all GND pins are one node (joined inside the ESP32); 3V3 and GPIOs are their own', () => {
  assert.equal(N.nodeOf(PIN('near:GND')), N.nodeOf(PIN('far:GND')));
  assert.notEqual(N.nodeOf(PIN('near:D25')), N.nodeOf(PIN('near:D26')));
  assert.equal(N.pinInfo('near:D25').gpio, 25);
  assert.equal(N.pinInfo('near:D34').canOutput, false, 'D34 is input-only');
});
test('a wire joins only its own two ends: wires that cross in the air join nothing', () => {
  const b = { w1: { type: 'wire', a: H(3, 'a'), b: H(20, 'a') }, w2: { type: 'wire', a: H(10, 'f'), b: H(12, 'a') } };
  const cx = N.connectivity(b);
  assert.notEqual(cx.net(H(3, 'a')), cx.net(H(10, 'f')));
});

/* ---------- the right circuit ---------- */
test('correct circuit: all three lights match the plan, it is safe, every LED path is closed', () => {
  const r = check(good());
  assert.ok(r.ok && r.safe, JSON.stringify(r.channels.map((c) => c.issues)));
  assert.deepEqual(r.hazards, []);
  assert.deepEqual(r.closed, { red: true, yellow: true, green: true });
});
test('correct circuit: each pin HIGH lights only its own LED; all LOW or no power lights none', () => {
  const b = good();
  assert.deepEqual(lit(b, { ...ALL_LOW, D25: 'high' }), ['led-red:1']);
  assert.deepEqual(lit(b, { ...ALL_LOW, D26: 'high' }), ['led-yellow:1']);
  assert.deepEqual(lit(b, { ...ALL_LOW, D27: 'high' }), ['led-green:1']);
  assert.deepEqual(lit(b, ALL_LOW), []);
  assert.deepEqual(lit(b, {}), [], 'pins not driven (before any code runs)');
  assert.ok(Object.values(N.ledStates(b, { powered: false, pins: { D25: 'high' } })).every((v) => v.level === 0 && v.reason === 'unpowered'));
  assert.deepEqual(N.predict(b, C.PLAN).map((p) => p.lit), [['red'], ['yellow'], ['green']]);
});

/* ---------- wrong circuits: the checker says what is wrong, and the LEDs do what the wiring really does ---------- */
test('missing ground wire: red is open (dark), others fine, still safe', () => {
  const b = C.withMistake('no-ground-red');
  assert.deepEqual(codes(b, 'red'), ['noGround']);
  assert.deepEqual(okKeys(b), ['yellow', 'green']);
  assert.ok(check(b).safe);
  assert.equal(N.ledStates(b, on({ ...ALL_LOW, D25: 'high' }))['led-red'].reason, 'noPath');
  assert.equal(check(b).closed.red, false);
});
test('rail not joined to GND: every light reports the dead-end rail, none can light', () => {
  const b = C.withMistake('no-close-loop');
  for (const k of ['red', 'yellow', 'green']) assert.deepEqual(codes(b, k), ['railNotGrounded']);
  assert.deepEqual(lit(b, { D25: 'high', D26: 'high', D27: 'high' }), []);
});
test('ground wire on the far rail (TN): not joined to the near rail, so red is a dead end', () => {
  const b = C.withMistake('far-rail-red');
  assert.deepEqual(codes(b, 'red'), ['railNotGrounded']);
  assert.equal(check(b).channels[0].issues[0].refs.rail, 'TN');
});
test('reversed LED: detected, stays dark even with its pin HIGH, and is not a hazard', () => {
  const b = C.withMistake('reverse-red');
  assert.deepEqual(codes(b, 'red'), ['reversed']);
  assert.ok(check(b).safe);
  const s = N.ledStates(b, on({ ...ALL_LOW, D25: 'high' }))['led-red'];
  assert.deepEqual([s.level, s.reason], [0, 'backwards']);
});
test('missing resistor (a wire in its place): UNSAFE, explained as too much current, never a working circuit', () => {
  const b = C.withMistake('no-res-yellow');
  const r = check(b);
  assert.equal(r.safe, false);
  assert.ok(r.hazards.some((h) => h.kind === 'noResistor' && h.leds.includes('led-yellow')));
  assert.ok(codes(b, 'yellow').includes('noResistor'));
  assert.equal(r.ok, false);
  assert.equal(N.predict(b, C.PLAN), null, 'no predictions for an unsafe circuit: it stays unplugged');
  // what physics says would happen (the lab never powers it): the LED gets too much current, it does NOT stay dark
  assert.equal(N.ledStates(b, on({ ...ALL_LOW, D26: 'high' }))['led-yellow'].reason, 'tooMuchCurrent');
});
test('resistor with both legs on one strip: bypassed, LED open', () => {
  const b = good(); b['res-red'] = { type: 'resistor', a: H(7, 'd'), b: H(7, 'e') };
  assert.deepEqual(codes(b, 'red'), ['resistorSameStrip']);
});
test('resistor in the wrong row: current goes to the wrong strip, LED open', () => {
  const b = C.withMistake('res-row-yellow');
  assert.deepEqual(codes(b, 'yellow'), ['resistorWrongRow']);
  assert.ok(check(b).safe, 'a 330 Ω resistor to ground is not dangerous');
  assert.deepEqual(lit(b, { ...ALL_LOW, D26: 'high' }), []);
});
test('wrong GPIO (red and yellow wires swapped): each light answers the other light’s pin', () => {
  const b = C.withMistake('swap-red-yellow');
  assert.deepEqual(codes(b, 'red'), ['wrongPin']);
  assert.deepEqual(codes(b, 'yellow'), ['wrongPin']);
  assert.deepEqual(check(b).channels[0].issues[0].refs.found, ['D26']);
  assert.ok(check(b).safe);
  assert.deepEqual(lit(b, { ...ALL_LOW, D26: 'high' }), ['led-red:1'], 'the red LED lights when D26 is HIGH');
  assert.deepEqual(lit(b, { ...ALL_LOW, D25: 'high' }), ['led-yellow:1']);
});
test('wrong GPIO (green on a free pin, D14): green never answers the program', () => {
  const b = good(); b['sig-green'] = { type: 'wire', a: PIN('near:D14'), b: H(23, 'b') };
  assert.deepEqual(codes(b, 'green'), ['wrongPin']);
  assert.deepEqual(lit(b, { ...ALL_LOW, D27: 'high' }), []);
});
test('wire to 3V3 instead of a GPIO: always on, flagged', () => {
  const b = good(); b['sig-red'] = { type: 'wire', a: PIN('far:3V3'), b: H(7, 'b') };
  assert.deepEqual(codes(b, 'red'), ['alwaysOn']);
  assert.deepEqual(lit(b, ALL_LOW), ['led-red:1']);
});
test('disconnected wire (one end loose): joins nothing, LED open', () => {
  const b = C.withMistake('loose-green');
  assert.deepEqual(codes(b, 'green'), ['wireLoose']);
  assert.deepEqual(lit(b, { ...ALL_LOW, D27: 'high' }), []);
});
test('wire in the wrong breadboard row (b8): pin and resistor are on different strips', () => {
  const b = C.withMistake('red-wire-row-8');
  assert.deepEqual(codes(b, 'red'), ['signalWrongStrip']);
  assert.deepEqual(lit(b, { ...ALL_LOW, D25: 'high' }), []);
});
test('no signal wire at all', () => {
  const b = good(); delete b['sig-red'];
  assert.deepEqual(codes(b, 'red'), ['noSignalWire']);
});
test('no resistor and no wire across the gap: nothing joins pin to LED', () => {
  const b = good(); delete b['res-green'];
  assert.deepEqual(codes(b, 'green'), ['noResistorPath']);
});

/* ---------- dangerous circuits ---------- */
test('short circuit: a GPIO wired straight to the ground rail is unsafe', () => {
  const b = C.withMistake('short-d25');
  const r = check(b);
  assert.equal(r.safe, false);
  assert.ok(r.hazards.some((h) => h.kind === 'short' && h.pins.includes('D25') && h.pins.includes('GND')));
  assert.ok(codes(b, 'red').includes('short'));
  assert.deepEqual(codes(b, 'yellow'), [], 'the yellow light itself is fine');
});
test('short circuit: 3V3 wired to GND is unsafe even with no LED involved', () => {
  const b = good(); b.oops = { type: 'wire', a: PIN('far:3V3'), b: R(2) };
  assert.ok(N.hazards(b).some((h) => h.kind === 'short' && h.pins.includes('3V3')));
  assert.equal(check(b).ok, false);
});
test('two signal wires in one strip (yellow into the red row): pins fight, flagged on both lights', () => {
  const b = C.withMistake('yellow-in-red-row');
  const r = check(b);
  assert.equal(r.safe, false);
  assert.ok(r.hazards.some((h) => h.kind === 'pinFight' && h.pins.includes('D25') && h.pins.includes('D26')));
  assert.ok(codes(b, 'red').includes('pinFight'));
  assert.ok(codes(b, 'yellow').includes('pinFight') && codes(b, 'yellow').includes('signalWrongStrip'));
});
test('two LEDs sharing one resistor: wrong pin for one, shared resistor for both', () => {
  const b = good();
  b['led-yellow'] = { type: 'led', color: 'yellow', a: H(7, 'h'), b: H(8, 'h') }; // yellow moved next to red
  assert.ok(codes(b, 'red').includes('sharedResistor'));
  assert.deepEqual(codes(b, 'yellow').sort(), ['sharedResistor', 'wrongPin']);
  assert.deepEqual(lit(b, { ...ALL_LOW, D25: 'high' }), ['led-red:1', 'led-yellow:1']);
});
test('VIN (5 V) on a GPIO strip is flagged as over-voltage', () => {
  const b = good(); b.oops = { type: 'wire', a: PIN('near:VIN'), b: H(7, 'a') };
  assert.ok(N.hazards(b).some((h) => h.kind === 'overvoltage'));
});
test('an LED straight from a pin to GND with no resistor is unsafe', () => {
  const b = { sig: { type: 'wire', a: PIN('near:D25'), b: H(5, 'a') }, led: { type: 'led', color: 'red', a: H(5, 'e'), b: H(6, 'e') }, g: { type: 'wire', a: H(6, 'a'), b: PIN('near:GND') } };
  assert.ok(N.hazards(b).some((h) => h.kind === 'noResistor'));
  assert.equal(N.isSafe(b), false);
});
test('two LEDs in a row on 3.3 V stay dark (not enough voltage), and that is not a hazard', () => {
  const b = { sig: { type: 'wire', a: PIN('near:D25'), b: H(5, 'a') }, r: { type: 'resistor', a: H(5, 'c'), b: H(5, 'g') },
    l1: { type: 'led', color: 'red', a: H(5, 'j'), b: H(6, 'j') }, l2: { type: 'led', color: 'yellow', a: H(6, 'h'), b: H(9, 'h') }, g: { type: 'wire', a: H(9, 'j'), b: PIN('near:GND') } };
  assert.equal(N.isSafe(b), true);
  const s = N.ledStates(b, on({ D25: 'high' }));
  assert.deepEqual([s.l1.level, s.l2.level], [0, 0]);
});

/* ---------- every checker code has words for the learner, with three hint levels ---------- */
test('every mistake in the circuit doctor is detected, and every issue code has 3 hint levels', () => {
  const name = N.endName, strip = N.stripName;
  for (const m of C.MISTAKES) {
    const r = check(C.withMistake(m.id));
    assert.equal(r.ok, false, `${m.id} must not pass`);
    for (const ch of r.channels) for (const is of ch.issues) {
      assert.ok(C.ISSUES[is.code], `no words for ${is.code}`);
      const lines = C.ISSUES[is.code]({ ...is.refs, color: ch.key, col: 7, name, strip, railName: (k) => N.RAIL_NAMES[k] });
      assert.equal(lines.length, 3, `${is.code} has 3 levels`);
      assert.ok(lines.every((l) => typeof l === 'string' && l.length > 10 && !/undefined|\[object/.test(l)), `${is.code}: ${lines.join(' | ')}`);
    }
  }
});
test('cleanBuild drops broken parts and keeps good ones (loose wire ends allowed)', () => {
  const raw = { ...good(), bad1: { type: 'led', a: H(99, 'z'), b: H(1, 'a') }, bad2: { type: 'magic' }, 'sig-green': { type: 'wire', a: PIN('near:D27'), b: null }, '<x>': { type: 'wire', a: H(1, 'a'), b: H(2, 'a') } };
  const b = N.cleanBuild(raw);
  assert.ok(!b.bad1 && !b.bad2 && !b['<x>']);
  assert.equal(b['sig-green'].b, null);
  assert.equal(Object.keys(b).length, 13);
  assert.deepEqual(N.cleanBuild('nope'), {});
});
