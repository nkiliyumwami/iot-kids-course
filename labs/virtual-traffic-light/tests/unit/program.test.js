// The program (code.js) and its browser simulation (simulator.js), checked against the circuit model (netlist.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const K = require('../../../../assets/virtual-lab/code.js');
const S = require('../../../../assets/virtual-lab/simulator.js');
const N = require('../../../../assets/virtual-lab/netlist.js');
const C = require('../../../../assets/virtual-lab/curriculum.js');

const lit = (build, pins, powered = true) => Object.entries(N.ledStates(build, { powered, pins })).filter(([, v]) => v.level > 0).map(([id]) => build[id].color).sort();
// run the simulation and record which lights are on at each moment
function lightsAt(build, prog, times) {
  const gen = K.generate(prog), sim = S.create(gen);
  sim.start(); let now = 0;
  const out = [];
  for (const t of times) { sim.tick(t - now); now = t; out.push(lit(build, sim.state().pins).join('+') || 'none'); }
  return out;
}

test('the default program is the course’s traffic light, in Lesson 1/2 style', () => {
  const g = K.generate(K.DEFAULT());
  const want = ['from machine import Pin', 'import time', 'RED_S = 5', 'GREEN_S = 5', 'YELLOW_S = 2',
    'red = Pin(25, Pin.OUT)', 'yellow = Pin(26, Pin.OUT)', 'green = Pin(27, Pin.OUT)', 'while True:',
    '    red.value(1)', '    time.sleep(RED_S)', '    green.value(1)', '    time.sleep(GREEN_S)', '    yellow.value(1)', '    time.sleep(YELLOW_S)'];
  for (const w of want) assert.ok(g.text.includes(w), `missing: ${w}`);
  assert.ok(!/;/.test(g.text), 'one command per line, no semicolons');
  assert.ok(!/from time import/.test(g.text), 'import time, not from time import sleep');
  assert.deepEqual(g.phases.map((p) => [p.on.join(), p.s]), [['red', 5], ['green', 5], ['yellow', 2]]);
  assert.equal(g.cycle, 12);
  assert.ok(g.valid.ok);
});

test('simulation: red 5 s → green 5 s → yellow 2 s → red again, one light at a time, on the correct circuit', () => {
  const b = C.canonicalParts();
  assert.deepEqual(lightsAt(b, K.DEFAULT(), [0, 4.99, 5.0, 9.99, 10.0, 11.99, 12.0, 17.0, 24.5]),
    ['red', 'red', 'green', 'green', 'yellow', 'yellow', 'red', 'green', 'red']);
});

test('the pins and the highlighted line follow the program exactly', () => {
  const gen = K.generate(K.DEFAULT()), sim = S.create(gen);
  assert.deepEqual(sim.state().pins, { D25: 'off', D26: 'off', D27: 'off' }, 'not running: pins released');
  sim.start(); sim.tick(0);
  let st = sim.state();
  assert.deepEqual(st.pins, { D25: 'high', D26: 'low', D27: 'low' });
  assert.equal(gen.lines[st.line - 1].text.trim(), 'time.sleep(RED_S)', 'waiting on the red sleep line');
  sim.tick(5); st = sim.state();
  assert.deepEqual(st.pins, { D25: 'low', D26: 'low', D27: 'high' });
  assert.equal(gen.lines[st.line - 1].text.trim(), 'time.sleep(GREEN_S)');
});

test('pause really pauses (no hidden fast-forward), resume continues, stop releases every pin', () => {
  const gen = K.generate(K.DEFAULT()), sim = S.create(gen);
  sim.start(); sim.tick(3);
  sim.pause(); sim.tick(100);
  assert.equal(sim.state().t, 3, 'time did not move while paused');
  assert.equal(sim.state().pins.D25, 'high');
  sim.start(); sim.tick(2.5);
  assert.equal(sim.state().pins.D27, 'high', 'resumed: 5.5 s is green');
  sim.stop();
  assert.deepEqual(sim.state().pins, { D25: 'off', D26: 'off', D27: 'off' });
  assert.equal(sim.state().status, 'stopped');
});

test('step goes one line at a time; a sleep step jumps the clock by that sleep', () => {
  const gen = K.generate(K.DEFAULT()), sim = S.create(gen);
  // after each step, the highlighted line is the NEXT line to run
  const lineText = () => gen.lines[sim.state().line - 1].text.trim();
  const seen = [];
  for (let i = 0; i < 40; i++) { sim.step(); seen.push(lineText()); if (lineText() === 'time.sleep(RED_S)') break; }
  assert.equal(sim.state().status, 'paused');
  assert.deepEqual(seen.slice(-3), ['yellow.value(0)', 'green.value(0)', 'time.sleep(RED_S)']);
  assert.ok(seen.includes('red = Pin(25, Pin.OUT)') && seen.includes('while True:') && seen.includes('red.value(1)'), seen.join(' | '));
  assert.equal(sim.state().t, 0, 'no time has passed: only instant lines ran');
  assert.deepEqual(sim.state().pins, { D25: 'high', D26: 'low', D27: 'low' }, 'red is on before its sleep');
  sim.step();
  assert.equal(sim.state().t, 5, 'stepping over the red sleep moves the clock 5 s');
  assert.equal(lineText(), 'red.value(0)', 'next comes the green block');
});

test('changing the times changes the code and the simulation together', () => {
  const prog = { pattern: 'classic', vars: { RED_S: 2, GREEN_S: 7, YELLOW_S: 1 } };
  const g = K.generate(prog);
  assert.ok(g.text.includes('GREEN_S = 7') && g.text.includes('RED_S = 2'));
  assert.equal(g.cycle, 10);
  assert.deepEqual(lightsAt(C.canonicalParts(), prog, [1, 2.5, 8.9, 9.5, 10.2]), ['red', 'green', 'green', 'yellow', 'red']);
});

test('times are kept inside safe limits; broken saved settings fall back to the defaults', () => {
  assert.equal(K.cleanProgram({ pattern: 'classic', vars: { GREEN_S: 999 } }).vars.GREEN_S, 30);
  assert.equal(K.cleanProgram({ pattern: 'classic', vars: { GREEN_S: -4 } }).vars.GREEN_S, 1);
  assert.equal(K.cleanProgram({ pattern: 'classic', vars: { GREEN_S: 'abc' } }).vars.GREEN_S, 5);
  assert.deepEqual(K.cleanProgram('garbage'), K.DEFAULT());
  assert.equal(K.cleanProgram({ pattern: 'rm -rf' }).pattern, 'classic');
  const c = K.cleanProgram({ pattern: 'custom', custom: [{ on: ['red', 'purple'], s: 2 }, null, 7, {}, { on: ['green'], s: 1 }] });
  assert.equal(c.custom.length, 4, 'at most four phases');
  assert.deepEqual(c.custom[0].on, ['red'], 'unknown colours dropped');
});

test('the other patterns: warning flasher and light chase', () => {
  const b = C.canonicalParts();
  assert.deepEqual(lightsAt(b, { pattern: 'flasher' }, [0.1, 0.6, 1.1]), ['yellow', 'none', 'yellow']);
  assert.deepEqual(lightsAt(b, { pattern: 'chase', vars: { STEP_S: 1 } }, [0.5, 1.5, 2.5, 3.5]), ['red', 'yellow', 'green', 'red']);
});

test('my own pattern: red and green together is refused before it can run', () => {
  const bad = K.generate({ pattern: 'custom', custom: [{ on: ['red', 'green'], s: 2 }, { on: ['yellow'], s: 1 }] });
  assert.equal(bad.valid.ok, false);
  assert.deepEqual(bad.valid.problems, [{ code: 'redGreen', phase: 0 }]);
  const ok = K.generate({ pattern: 'custom', custom: [{ on: ['red', 'yellow'], s: 2 }, { on: ['green'], s: 3 }] });
  assert.ok(ok.valid.ok);
  assert.ok(ok.text.includes('time.sleep(2)') && ok.text.includes('time.sleep(3)'));
});

test('no USB power: the code can’t light anything, whatever the pins say', () => {
  assert.deepEqual(lit(C.canonicalParts(), { D25: 'high', D26: 'high', D27: 'high' }, false), []);
});

test('the program runs on the circuit as it is really wired', () => {
  // red and yellow wires swapped: yellow shows in the red phase and red in the yellow phase
  assert.deepEqual(lightsAt(C.withMistake('swap-red-yellow'), K.DEFAULT(), [1, 6, 11]), ['yellow', 'green', 'red']);
  // red LED backwards: the red phase is dark
  assert.deepEqual(lightsAt(C.withMistake('reverse-red'), K.DEFAULT(), [1, 6, 11]), ['none', 'green', 'yellow']);
  // rail not joined to GND: nothing at all
  assert.deepEqual(lightsAt(C.withMistake('no-close-loop'), K.DEFAULT(), [1, 6, 11]), ['none', 'none', 'none']);
  // repaired: back to normal
  assert.deepEqual(lightsAt(C.canonicalParts(), K.DEFAULT(), [1, 6, 11]), ['red', 'green', 'yellow']);
});

/* ---------- the code on screen is real MicroPython: run it in Python with stand-in machine/time modules ---------- */
const HARNESS = String.raw`
import sys, types, json
LIMIT = float(sys.argv[1]); log = []; clock = [0.0]
class Stop(Exception): pass
machine = types.ModuleType('machine')
class Pin:
    OUT = 1
    def __init__(self, n, mode):
        assert mode == Pin.OUT
        self.n = n
    def value(self, v):
        log.append({'t': round(clock[0], 6), 'pin': 'D%d' % self.n, 'value': 'high' if v else 'low'})
machine.Pin = Pin
time = types.ModuleType('time')
def sleep(s):
    assert s > 0
    clock[0] += s
    if clock[0] > LIMIT: raise Stop()
time.sleep = sleep
sys.modules['machine'] = machine; sys.modules['time'] = time
try:
    exec(compile(sys.stdin.read(), 'main.py', 'exec'), {})
except Stop:
    pass
print(json.dumps(log))
`;
function pythonChanges(text, limit) {
  const r = spawnSync('python3', ['-I', '-c', HARNESS, String(limit)], { input: text, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const last = {}, out = [];
  for (const e of JSON.parse(r.stdout)) { if ((last[e.pin] || 'low') !== e.value) out.push({ t: e.t, pin: e.pin, value: e.value }); last[e.pin] = e.value; }
  return out;
}
function simChanges(gen, limit) {
  const sim = S.create(gen); sim.start(); sim.tick(limit - 1e-6);
  return sim.state().log.map((e) => ({ t: e.t, pin: e.pin, value: e.value }));
}
for (const [name, prog] of [['classic', K.DEFAULT()], ['changed times', { pattern: 'classic', vars: { RED_S: 3, GREEN_S: 8, YELLOW_S: 1 } }],
  ['flasher', { pattern: 'flasher', vars: { FLASH_S: 0.75 } }], ['chase', { pattern: 'chase' }],
  ['my own', { pattern: 'custom', custom: [{ on: ['red', 'yellow'], s: 1.5 }, { on: ['green'], s: 2 }, { on: [], s: 0.5 }] }]]) {
  test(`real Python runs the shown code (${name}) and switches the pins exactly like the simulation`, () => {
    const gen = K.generate(prog);
    const limit = gen.cycle * 2 + 0.1;
    assert.deepEqual(pythonChanges(gen.text, limit), simChanges(gen, limit));
  });
}
