/* Virtual Traffic Light Lab: the browser simulation of the program. Pure logic (no page, no 3D), testable in Node.
   Works in the browser (window.VLabSimulator) and in Node (require).

   It follows the operations that code.js made from the program, one per line, on a simulated clock:
   - the lines before the loop run once (imports, variables, Pin(..., Pin.OUT) makes a pin an output, LOW),
   - every value() line sets one pin HIGH or LOW at once,
   - every time.sleep() line waits its seconds of simulated time, then the next line runs,
   - after the last line of the loop it jumps back to while True.
   Time only moves when tick(seconds) is called (the page passes real elapsed time), so pausing really pauses and the
   speed of the screen never changes the timing. Stopping releases every pin (off), like stopping a real program.
   Which LEDs light is NOT decided here: the page asks the circuit model (netlist.js) with these pin levels. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLabSimulator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-9;

  function create(gen) {
    const ops = gen.ops, loopOp = gen.loopOp;
    let s;
    const pinNames = [...new Set(ops.filter((o) => o.pin).map((o) => o.pin))];
    function fresh() {
      return { status: 'stopped', pc: 0, line: null, t: 0, sleepLeft: null, phase: null, cycles: 0,
        pins: Object.fromEntries(pinNames.map((p) => [p, 'off'])), log: [] };
    }
    s = fresh();
    const lvl = (v) => (v ? 'high' : 'low');

    // run the operation at pc. Returns the seconds of simulated time it used (only sleeps use time).
    function exec(budget) {
      const op = ops[s.pc];
      s.line = op.line;
      if (op.phase != null) s.phase = op.phase;
      if (op.op === 'sleep') {
        if (s.sleepLeft == null) s.sleepLeft = op.s;
        const use = Math.min(budget, s.sleepLeft);
        s.sleepLeft -= use; s.t += use;
        if (s.sleepLeft > EPS) return use;            // still waiting on this line
        s.sleepLeft = null;
        advance();
        return use;
      }
      if (op.op === 'setup') s.pins[op.pin] = 'low';
      else if (op.op === 'set') {
        const v = lvl(op.value);
        if (s.pins[op.pin] !== v) s.log.push({ t: +s.t.toFixed(6), pin: op.pin, value: v, line: op.line });
        s.pins[op.pin] = v;
      }
      advance();
      return 0;
    }
    function advance() {
      s.pc++;
      if (s.pc >= ops.length) { s.pc = loopOp; s.cycles++; }
    }

    function start() { if (s.status === 'stopped') { s = fresh(); s.line = ops[0].line; } s.status = 'running'; }
    // move simulated time forward. Lines that take no time run immediately; a sleep line waits.
    function tick(dt) {
      if (s.status !== 'running') return state();
      let budget = Math.max(0, dt), guard = 0;
      // lines that take no time always run; a sleep line runs only while there is time left in this tick
      while (guard++ < 10000) {
        if (ops[s.pc].op === 'sleep' && budget <= EPS) break;
        budget -= exec(budget);
      }
      // after a tick, point at the line we are on (the sleep being waited on, or the next line to run)
      s.line = ops[s.pc].line;
      return state();
    }
    // one line at a time (the learner presses "Step"). A sleep line is finished at once: the clock jumps on.
    function step() {
      if (s.status === 'stopped') { s = fresh(); }
      s.status = 'paused';
      exec(Infinity);
      s.line = ops[s.pc].line;
      return state();
    }
    function pause() { if (s.status === 'running') s.status = 'paused'; return state(); }
    function stop() { s = fresh(); return state(); }
    function state() { return { status: s.status, line: s.line, t: s.t, sleepLeft: s.sleepLeft, phase: s.phase, cycles: s.cycles, pins: { ...s.pins }, nextLine: ops[s.pc].line, log: s.log.slice() }; }

    return { start, tick, step, pause, stop, state, get running() { return s.status === 'running'; } };
  }

  // Which phase is showing at time t into the loop (used by tests and the "how long is one cycle?" question).
  function phaseAt(gen, t) {
    const T = gen.cycle; let x = ((t % T) + T) % T;
    for (const p of gen.phases) { if (x < p.s - EPS) return p.i; x -= p.s; }
    return gen.phases.length - 1;
  }

  return { create, phaseAt };
});
