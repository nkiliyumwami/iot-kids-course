/* Virtual Traffic Light Lab: the MicroPython program, made from settings (never from typed text).
   Works in the browser (window.VLabCode) and in Node (require).

   A program is a choice of pattern plus its times, or "my own pattern" with up to four phases. generate() turns it into
   (1) the MicroPython a learner sees, in the course's style (Lesson 1 and 2: from machine import Pin, import time,
   Pin(25, Pin.OUT), .value(1)/.value(0), while True:, time.sleep(), RED_S/GREEN_S/YELLOW_S), and
   (2) a list of operations, one per line, that the browser simulation (simulator.js) follows step by step.
   Both come from the same loop below, so the code on screen and the simulation can't disagree.
   This is NOT a MicroPython interpreter: only programs this file generates can be "run" in the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLabCode = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // the three lights: variable name in the code, GPIO number, the pin's name on the board
  const LIGHTS = [
    { key: 'red', gpio: 25, pin: 'D25' },
    { key: 'yellow', gpio: 26, pin: 'D26' },
    { key: 'green', gpio: 27, pin: 'D27' },
  ];

  // The same three patterns as Lesson 2. Each phase says which lights are on and which time name it waits for.
  const PATTERNS = {
    classic: { name: 'Classic traffic light', vars: { RED_S: 5, GREEN_S: 5, YELLOW_S: 2 },
      varNotes: { RED_S: 'seconds of red: stop', GREEN_S: 'seconds of green: go', YELLOW_S: 'seconds of yellow: get ready to stop' },
      phases: [{ on: ['red'], v: 'RED_S', say: 'Red light: stop' }, { on: ['green'], v: 'GREEN_S', say: 'Green light: go' }, { on: ['yellow'], v: 'YELLOW_S', say: 'Yellow light: get ready to stop' }] },
    flasher: { name: 'Warning flasher', vars: { FLASH_S: 0.5 }, varNotes: { FLASH_S: 'seconds on, then the same seconds off' },
      phases: [{ on: ['yellow'], v: 'FLASH_S', say: 'Flash on' }, { on: [], v: 'FLASH_S', say: 'Flash off' }] },
    chase: { name: 'Light chase', vars: { STEP_S: 1 }, varNotes: { STEP_S: 'seconds for each light' },
      phases: [{ on: ['red'], v: 'STEP_S', say: 'Red' }, { on: ['yellow'], v: 'STEP_S', say: 'Yellow' }, { on: ['green'], v: 'STEP_S', say: 'Green' }] },
  };
  // Allowed values: whole seconds for the traffic light (1–30), quarter seconds for the fast patterns.
  const LIMITS = { RED_S: [1, 30, 1], GREEN_S: [1, 30, 1], YELLOW_S: [1, 30, 1], FLASH_S: [0.25, 5, 0.25], STEP_S: [0.25, 5, 0.25], custom: [0.5, 30, 0.5] };
  const MAX_CUSTOM = 4;

  const DEFAULT = () => ({ pattern: 'classic', vars: { ...PATTERNS.classic.vars }, custom: [{ on: ['red'], s: 3 }, { on: ['green'], s: 3 }] });

  function snap(x, [lo, hi, step]) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, Math.round(n / step) * step));
  }
  // Keep only valid settings (used for saved progress too). Unknown or broken values fall back to the defaults.
  function cleanProgram(raw) {
    const p = DEFAULT();
    if (!raw || typeof raw !== 'object') return p;
    if (PATTERNS[raw.pattern] || raw.pattern === 'custom') p.pattern = raw.pattern;
    const base = PATTERNS[p.pattern] ? PATTERNS[p.pattern].vars : {};
    p.vars = { ...base };
    if (raw.vars && typeof raw.vars === 'object') for (const k of Object.keys(base)) { const v = snap(raw.vars[k], LIMITS[k]); if (v != null) p.vars[k] = v; }
    if (Array.isArray(raw.custom) && raw.custom.length) {
      p.custom = raw.custom.slice(0, MAX_CUSTOM).map((ph) => ({
        on: Array.isArray(ph && ph.on) ? LIGHTS.map((l) => l.key).filter((k) => ph.on.includes(k)) : [],
        s: snap(ph && ph.s, LIMITS.custom) || 1,
      }));
    }
    return p;
  }

  const phasesOf = (prog) => (prog.pattern === 'custom'
    ? prog.custom.map((ph, i) => ({ on: ph.on, s: ph.s, say: `Phase ${i + 1}: ${ph.on.length ? ph.on.join(' + ') : 'all off'}` }))
    : PATTERNS[prog.pattern].phases.map((ph) => ({ on: ph.on, v: ph.v, s: prog.vars[ph.v], say: ph.say })));

  // Safety rules for a traffic light, checked before anything runs: never red and green together.
  function validate(prog) {
    const problems = [];
    phasesOf(prog).forEach((ph, i) => {
      if (ph.on.includes('red') && ph.on.includes('green')) problems.push({ code: 'redGreen', phase: i });
    });
    if (prog.pattern === 'custom' && !prog.custom.length) problems.push({ code: 'empty' });
    return { ok: problems.length === 0, problems };
  }

  const fmt = (s) => (Number.isInteger(s) ? String(s) : String(+s.toFixed(2)));
  // Build the program text and its operations together, line by line.
  function generate(raw) {
    const prog = cleanProgram(raw);
    const lines = [], ops = [];
    const add = (text, kind, op, extra) => { lines.push(Object.assign({ n: lines.length + 1, text, kind }, extra)); if (op) ops.push(Object.assign({ line: lines.length }, op)); };
    const pat = PATTERNS[prog.pattern];
    add(`# ${pat ? pat.name : 'My own light pattern'} (ESP32)`, 'comment');
    add('from machine import Pin', 'import', { op: 'noop' }, { what: 'machine' });
    add('import time', 'import', { op: 'noop' }, { what: 'time' });
    add('', 'blank');
    if (pat) {
      for (const [k, v] of Object.entries(prog.vars)) add(`${k} = ${fmt(v)}`.padEnd(14) + `# ${pat.varNotes[k]}`, 'var', { op: 'noop' }, { name: k });
      add('', 'blank');
    }
    for (const l of LIGHTS) add(`${l.key} = Pin(${l.gpio}, Pin.OUT)`, 'pin', { op: 'setup', pin: l.pin }, { light: l.key });
    add('', 'blank');
    add('while True:', 'loop', { op: 'loop' });
    const loopOp = ops.length - 1;
    phasesOf(prog).forEach((ph, i) => {
      if (i) add('', 'blank');
      add(`    # ${ph.say}`, 'comment', null, { phase: i });
      for (const l of LIGHTS) {
        const v = ph.on.includes(l.key) ? 1 : 0;
        add(`    ${l.key}.value(${v})`, 'set', { op: 'set', pin: l.pin, value: v, phase: i }, { light: l.key, value: v, phase: i });
      }
      add(`    time.sleep(${ph.v || fmt(ph.s)})`, 'sleep', { op: 'sleep', s: ph.s, phase: i }, { phase: i, seconds: ph.s });
    });
    const phases = phasesOf(prog).map((ph, i) => ({ i, on: ph.on, s: ph.s, say: ph.say }));
    return { program: prog, text: lines.map((l) => l.text).join('\n') + '\n', lines, ops, loopOp, phases, cycle: phases.reduce((a, p) => a + p.s, 0), valid: validate(prog) };
  }

  // What each kind of line does, for "tap a line to learn it". Short, and always the real reason.
  const LINE_HELP = {
    comment: () => 'A comment. Everything after # is a note for people; the ESP32 skips it.',
    import: (l) => (l.what === 'machine'
      ? '<code>from machine import Pin</code> borrows Pin from MicroPython’s toolbox, so your code can control the ESP32’s pins.'
      : '<code>import time</code> brings in the clock tools. We need <code>time.sleep()</code> to wait.'),
    var: (l) => `<code>${l.name}</code> is a variable: a name that stores a number. Change it once at the top, and every <code>time.sleep(${l.name})</code> below waits that long.`,
    pin: (l) => { const L = LIGHTS.find((x) => x.key === l.light); return `<code>Pin(${L.gpio}, Pin.OUT)</code> makes GPIO ${L.gpio} (printed <b>${L.pin}</b> on the board) an output: the ESP32 can now switch it HIGH or LOW. It starts LOW. The wire from ${L.pin} leads to the ${l.light} light.`; },
    loop: () => '<code>while True:</code> repeats the indented lines below forever. That’s why a traffic light never stops by itself.',
    set: (l) => { const L = LIGHTS.find((x) => x.key === l.light); return l.value
      ? `<code>${l.light}.value(1)</code> makes ${L.pin} HIGH (3.3 volts). Current can flow through the resistor and the ${l.light} LED to GND, so it lights up.`
      : `<code>${l.light}.value(0)</code> makes ${L.pin} LOW (0 volts). No push, no current: the ${l.light} LED is off.`; },
    sleep: (l) => `<code>time.sleep()</code> waits ${fmt(l.seconds)} second${l.seconds === 1 ? '' : 's'} before the next line. The lights stay exactly as they are while it waits.`,
  };

  return { LIGHTS, PATTERNS, LIMITS, MAX_CUSTOM, DEFAULT, cleanProgram, validate, generate, phasesOf, LINE_HELP, fmt };
});
