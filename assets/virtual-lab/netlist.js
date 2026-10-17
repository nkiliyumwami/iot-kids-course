/* Virtual Traffic Light Lab: the electrical model. Pure logic, no 3D and no page, so it can be tested in Node.
   Works in the browser (window.VLabNetlist) and in Node (require).

   A deliberately small EDUCATIONAL model, not a circuit simulator: it knows which holes are joined, which way an LED
   conducts, where the resistors are and what each pin can do. It never measures volts or milliamps, and it is never a
   substitute for an adult checking a real circuit.

   A build is a map of parts:  { id: { type: 'wire' | 'resistor' | 'led', a, b } }   (for an LED, a = anode, b = cathode)
   An end is  { k: 'hole', c: 1–30, r: 'a'–'j' }  |  { k: 'rail', rail: 'TN'|'TP'|'BP'|'BN', c }  |  { k: 'pin', id: 'near:D25' }
   A wire end may be null: the wire is hanging loose.

   Four separate questions, four separate answers:
   1. connectivity(build)        which holes, rails and pins are joined (nets), and which LED paths are closed
   2. hazards(build)             is it safe to power, whatever the pins do? (shorts, no resistor, pin fights)
   3. lessonCheck(build, plan)   is each light wired the way the lesson intends?
   4. ledStates(build, state)    which LEDs light for these pin levels, with power on? */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLabNetlist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- the board ---------- */
  const FAR_ROWS = ['a', 'b', 'c', 'd', 'e'], NEAR_ROWS = ['f', 'g', 'h', 'i', 'j'];
  const RAILS = ['TN', 'TP', 'BP', 'BN'];
  const RAIL_NAMES = { BN: 'the blue − rail (near side)', BP: 'the red + rail (near side)', TN: 'the blue − rail (far side)', TP: 'the red + rail (far side)' };
  // rail holes come in groups of five: columns 1, 7, 13, 19 and 25 have none (the same as kit3d.js)
  const railHasCol = (c) => Number.isInteger(c) && c >= 1 && c <= 30 && (c - 1) % 6 !== 0;
  const NEAR_PINS = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'];
  const FAR_PINS = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND', '3V3'];
  const SPECIAL_GPIO = { TX0: 1, RX0: 3, TX2: 17, RX2: 16, VP: 36, VN: 39 };
  const INPUT_ONLY = [34, 35, 36, 39];

  function pinInfo(id) {
    if (typeof id !== 'string') return null;
    const [side, name] = id.split(':');
    const list = side === 'near' ? NEAR_PINS : side === 'far' ? FAR_PINS : null;
    if (!list || !list.includes(name)) return null;
    const m = /^D(\d+)$/.exec(name);
    const gpio = m ? Number(m[1]) : SPECIAL_GPIO[name] != null ? SPECIAL_GPIO[name] : null;
    const kind = name === 'GND' ? 'gnd' : name === '3V3' ? 'v33' : name === 'VIN' ? 'vin' : name === 'EN' ? 'en' : 'gpio';
    return { id, side, name, gpio, kind, canOutput: kind === 'gpio' && !INPUT_ONLY.includes(gpio) };
  }

  function validEnd(e) {
    if (!e || typeof e !== 'object') return false;
    if (e.k === 'hole') return Number.isInteger(e.c) && e.c >= 1 && e.c <= 30 && (FAR_ROWS.includes(e.r) || NEAR_ROWS.includes(e.r));
    if (e.k === 'rail') return RAILS.includes(e.rail) && railHasCol(e.c);
    if (e.k === 'pin') return !!pinInfo(e.id);
    return false;
  }
  // Keep only well-formed parts (used when loading a saved build). Wires may have one loose (null) end.
  function cleanBuild(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [id, p] of Object.entries(raw)) {
      if (!p || !['wire', 'resistor', 'led'].includes(p.type) || !/^[a-z0-9-]{1,40}$/.test(id)) continue;
      const a = validEnd(p.a) ? { ...p.a } : null, b = validEnd(p.b) ? { ...p.b } : null;
      if (p.type === 'wire' ? !(a || b) : !(a && b)) continue;
      // the same key order as the planned parts ({ type, color, a, b }), so a saved part compares equal to the plan
      const part = { type: p.type };
      if ((p.type === 'led' || p.type === 'wire') && typeof p.color === 'string' && /^[a-z]{1,12}$/.test(p.color)) part.color = p.color;
      part.a = a; part.b = b;
      out[id] = part;
    }
    return out;
  }

  // Every end sits on a "node": one hidden strip, one rail, or one pin. All GND pins are joined inside the ESP32.
  function nodeOf(e) {
    if (e.k === 'hole') return (FAR_ROWS.includes(e.r) ? 'T' : 'B') + e.c;
    if (e.k === 'rail') return 'R:' + e.rail;
    const p = pinInfo(e.id);
    return p.kind === 'gnd' ? 'GND' : 'P:' + p.name;
  }
  const endName = (e) => (!e ? 'nowhere' : e.k === 'hole' ? `${e.r}${e.c}` : e.k === 'rail' ? RAIL_NAMES[e.rail] : pinInfo(e.id).name);
  // the five holes that share a hole's strip, e.g. 'a7–e7'
  const stripName = (e) => (e.k !== 'hole' ? endName(e) : FAR_ROWS.includes(e.r) ? `a${e.c}–e${e.c}` : `f${e.c}–j${e.c}`);
  const sameEnd = (x, y) => !!x && !!y && x.k === y.k && (x.k === 'pin' ? pinInfo(x.id).name === pinInfo(y.id).name && (x.id === y.id || pinInfo(x.id).kind === 'gnd') : x.c === y.c && x.r === y.r && x.rail === y.rail);

  /* ---------- 1. connectivity ---------- */
  // Wires join nodes into nets. Parts that merely look close, or wires that cross in the air, join nothing.
  function connectivity(build) {
    const parent = new Map();
    const find = (n) => { if (!parent.has(n)) parent.set(n, n); let r = n; while (parent.get(r) !== r) r = parent.get(r); parent.set(n, r); return r; };
    const join = (x, y) => { const a = find(x), b = find(y); if (a !== b) parent.set(a, b); };
    const parts = Object.entries(build || {}).map(([id, p]) => ({ id, ...p }));
    for (const p of parts) { if (p.a) find(nodeOf(p.a)); if (p.b) find(nodeOf(p.b)); }
    for (const p of parts) if (p.type === 'wire' && p.a && p.b) join(nodeOf(p.a), nodeOf(p.b));
    const net = (e) => find(nodeOf(e));
    // what each net is attached to: pins (by name; all GNDs are one), rails, strips
    const nets = new Map();
    const info = (n) => { if (!nets.has(n)) nets.set(n, { id: n, nodes: [], pins: [] }); return nets.get(n); };
    for (const node of parent.keys()) {
      const n = info(find(node)); n.nodes.push(node);
      if (node === 'GND') n.pins.push({ name: 'GND', kind: 'gnd', gpio: null, canOutput: false });
      else if (node.startsWith('P:')) { const name = node.slice(2); n.pins.push(pinInfo((NEAR_PINS.includes(name) ? 'near:' : 'far:') + name)); }
    }
    // two-legged parts become edges between nets (wires are already merged away)
    const edges = parts.filter((p) => p.type !== 'wire' && p.a && p.b).map((p) => ({ id: p.id, type: p.type, color: p.color, from: net(p.a), to: net(p.b) }));
    return { net, nets, edges, parts, netOf: (e) => (e ? net(e) : null), pinsOn: (n) => (nets.get(n) || { pins: [] }).pins };
  }

  // Simple paths between nets. LEDs only conduct anode → cathode unless backwards is allowed.
  function paths(cx, fromNets, isTarget, o = {}) {
    const out = [];
    const walk = (n, seen, trail) => {
      if (trail.length && isTarget(n, trail)) { out.push(trail.slice()); return; }
      if (out.length > 200) return;
      for (const e of cx.edges) {
        if (o.skip && o.skip(e)) continue;
        for (const [a, b, fwd] of [[e.from, e.to, true], [e.to, e.from, false]]) {
          if (a !== n || seen.has(b) || trail.some((t) => t.e === e)) continue;
          if (e.type === 'led' && !fwd && !o.backwards) continue;
          seen.add(b); trail.push({ e, from: a, to: b, fwd });
          walk(b, seen, trail);
          trail.pop(); seen.delete(b);
        }
      }
    };
    for (const f of fromNets) walk(f, new Set([f]), []);
    return out;
  }
  const count = (trail, type) => trail.filter((t) => t.e.type === type).length;

  /* ---------- 2. safety: what could go wrong once powered, whatever the program does ---------- */
  // A "driver" is something that can push a net high or pull it low: GND, 3V3, VIN, or any output pin.
  const driversOf = (pins) => pins.filter((p) => p.kind === 'gnd' || p.kind === 'v33' || p.kind === 'vin' || (p.kind === 'gpio' && p.canOutput));
  function hazards(build) {
    const cx = connectivity(build);
    const out = [];
    for (const n of cx.nets.values()) {
      const d = driversOf(n.pins);
      const names = [...new Set(d.map((p) => p.name))];
      if (names.length < 2) continue;
      const kinds = new Set(d.map((p) => p.kind));
      const kind = kinds.has('vin') && kinds.has('gpio') ? 'overvoltage' : kinds.size === 1 && kinds.has('gpio') ? 'pinFight' : 'short';
      out.push({ kind, net: n.id, pins: names, nodes: n.nodes.slice() });
    }
    // an LED between something that can push and something that can pull, with no resistor anywhere on the way
    const sources = [...cx.nets.values()].filter((n) => driversOf(n.pins).some((p) => p.kind !== 'gnd'));
    for (const s of sources) {
      const sNames = driversOf(s.pins).map((p) => p.name);
      const found = paths(cx, [s.id], (n) => n !== s.id && driversOf(cx.pinsOn(n)).some((p) => !sNames.includes(p.name)));
      for (const t of found) {
        if (count(t, 'led') >= 1 && count(t, 'resistor') === 0) {
          const leds = t.filter((x) => x.e.type === 'led').map((x) => x.e.id);
          if (!out.some((h) => h.kind === 'noResistor' && h.leds.join() === leds.join())) out.push({ kind: 'noResistor', leds, from: sNames, to: driversOf(cx.pinsOn(t[t.length - 1].to)).map((p) => p.name) });
        }
      }
    }
    return out;
  }
  const isSafe = (build) => hazards(build).length === 0;

  /* ---------- 4. which LEDs light, for given pin levels (power on) ---------- */
  // state: { powered: bool, pins: { D25: 'high' | 'low' | 'off', … } }  Pins not listed are off (not driving).
  // Each LED: level 0 (dark) or 1 (lit), or 2 = "too much current" (no resistor: it would glow too bright and could be
  // damaged; the lab never powers such a circuit, this only says what would happen), plus a short reason.
  function ledStates(build, state) {
    const cx = connectivity(build);
    const st = state || {};
    const leds = cx.edges.filter((e) => e.type === 'led');
    const res = {};
    if (!st.powered) { leds.forEach((e) => { res[e.id] = { level: 0, reason: 'unpowered' }; }); return res; }
    const volts = (n) => {
      const v = new Set();
      for (const p of driversOf(cx.pinsOn(n))) {
        if (p.kind === 'gnd') v.add(0); else if (p.kind === 'v33') v.add(3.3); else if (p.kind === 'vin') v.add(5);
        else if (st.pins && st.pins[p.name] === 'high') v.add(3.3); else if (st.pins && st.pins[p.name] === 'low') v.add(0);
      }
      return v.size === 1 ? [...v][0] : v.size > 1 ? 'fight' : null;
    };
    const highs = [...cx.nets.keys()].filter((n) => typeof volts(n) === 'number' && volts(n) > 0);
    const lit = new Map();
    for (const h of highs) {
      const maxLeds = volts(h) >= 4.5 ? 2 : 1; // a red/yellow/green LED needs about 2 V: 3.3 V can light one at a time in a row
      for (const t of paths(cx, [h], (n) => volts(n) === 0)) {
        const nLed = count(t, 'led');
        if (nLed === 0 || nLed > maxLeds) continue;
        const level = count(t, 'resistor') ? 1 : 2;
        t.filter((x) => x.e.type === 'led').forEach((x) => lit.set(x.e.id, Math.max(lit.get(x.e.id) || 0, level)));
      }
    }
    for (const e of leds) {
      if (lit.has(e.id)) { res[e.id] = { level: lit.get(e.id), reason: lit.get(e.id) === 2 ? 'tooMuchCurrent' : 'lit' }; continue; }
      const fwd = paths(cx, highs, (n) => volts(n) === 0, { backwards: false }).some((t) => t.some((x) => x.e === e));
      const back = paths(cx, highs, (n) => volts(n) === 0, { backwards: true }).some((t) => t.some((x) => x.e === e && !x.fwd));
      res[e.id] = { level: 0, reason: back ? 'backwards' : fwd ? 'tooManyInARow' : [volts(e.from), volts(e.to)].includes('fight') ? 'pinFight' : 'noPath' };
    }
    return res;
  }

  /* ---------- 3. does each light match the lesson? ---------- */
  // plan: { channels: [{ key: 'red', pin: 'near:D25' }], ground: 'GND' }. Issues are codes plus the holes/pins involved;
  // the words a learner sees live in curriculum.js.
  function lessonCheck(build, plan) {
    const cx = connectivity(build);
    const hz = hazards(build);
    const parts = cx.parts;
    const ledOf = (key) => parts.find((p) => p.type === 'led' && p.color === key && p.a && p.b);
    const resistors = parts.filter((p) => p.type === 'resistor' && p.a && p.b);
    const pinNames = (n) => cx.pinsOn(n).map((p) => p.name);
    // where a net leads through resistors only (no LEDs): the pins it reaches and how many resistors are on the way
    function reach(n, skipLed) {
      const found = [];
      const seenNets = new Set([n]);
      const walk = (x, rs, via) => {
        for (const name of pinNames(x)) found.push({ name, resistors: rs, via: via.slice() });
        for (const e of cx.edges) {
          if (e.type !== 'resistor') continue;
          const y = e.from === x ? e.to : e.to === x ? e.from : null;
          if (!y || seenNets.has(y)) continue;
          seenNets.add(y); via.push(e.id); walk(y, rs + 1, via); via.pop();
        }
      };
      walk(n, 0, []);
      return found;
    }
    const channels = plan.channels.map((ch) => {
      const want = pinInfo(ch.pin).name;
      const led = ledOf(ch.key);
      const issues = [];
      const add = (code, refs) => issues.push({ code, refs: refs || {} });
      if (!led) { add('ledMissing'); return { key: ch.key, ok: false, issues }; }
      const an = cx.net(led.a), ca = cx.net(led.b);
      const up = reach(an), down = reach(ca);
      const upPins = up.filter((x) => x.name !== 'GND'), upGnd = up.some((x) => x.name === 'GND');
      const downGnd = down.find((x) => x.name === 'GND' && x.resistors === 0);
      const downWant = down.find((x) => x.name === want);
      // safety first: a hazard belongs to this light when it involves this light's LED or its pin
      for (const h of hz) {
        if (h.kind === 'noResistor' && h.leds.includes(led.id)) add('noResistor', { led: led.id, cathode: led.b, anode: led.a, pins: h.from });
        else if (h.kind !== 'noResistor' && h.pins.includes(want)) add(h.kind, { pins: h.pins, nodes: h.nodes });
      }
      // the LED the wrong way round: its short leg leads to the pin, its long leg to ground
      if (upGnd && downWant) add('reversed', { anode: led.a, cathode: led.b });
      else if (!issues.some((i) => i.code === 'noResistor')) {
        const fromWant = up.find((x) => x.name === want);
        const others = upPins.filter((x) => x.name !== want);
        if (fromWant && fromWant.resistors === 0) add('noResistor', { led: led.id, anode: led.a, pins: [want] });
        else if (!fromWant && others.length) add(others.some((x) => x.name === '3V3' || x.name === 'VIN') ? 'alwaysOn' : 'wrongPin', { found: others.map((x) => x.name), want, anode: led.a });
        else if (!fromWant) {
          // nothing reaches the long leg: find out why, most specific first
          const pinNet = cx.net({ k: 'pin', id: ch.pin });
          const touches = (r, n) => cx.net(r.a) === n || cx.net(r.b) === n;
          const otherEnd = (r, n) => (cx.net(r.a) === n ? r.b : r.a);
          const sameStrip = resistors.find((r) => cx.net(r.a) === cx.net(r.b) && (cx.net(r.a) === an || cx.net(r.a) === pinNet));
          const sig = parts.find((p) => p.type === 'wire' && [p.a, p.b].some((e) => e && e.k === 'pin' && pinInfo(e.id).name === want));
          const fromPin = resistors.find((r) => touches(r, pinNet) && !touches(r, an));
          const toLed = resistors.find((r) => touches(r, an) && !touches(r, pinNet));
          if (sameStrip) add('resistorSameStrip', { res: sameStrip.a, res2: sameStrip.b });
          else if (sig && (!sig.a || !sig.b)) add('wireLoose', { pin: want, end: sig.a || sig.b });
          else if (!sig) add('noSignalWire', { want, res: toLed ? otherEnd(toLed, an) : null, anode: led.a });
          // the LED has its resistor, so the wire is what's off; otherwise the resistor leaves the pin's strip for the wrong one
          else if (toLed) add('signalWrongStrip', { want, wire: sig.a.k === 'pin' ? sig.b : sig.a, res: otherEnd(toLed, an) });
          else if (fromPin) add('resistorWrongRow', { res: otherEnd(fromPin, pinNet), anode: led.a, want });
          else add('noResistorPath', { anode: led.a, wire: sig.a.k === 'pin' ? sig.b : sig.a });
        } else if (fromWant.resistors > 1) add('extraResistor', { want });
      }
      // the road home
      if (!issues.some((i) => i.code === 'reversed') && !downGnd) {
        const rails = cx.nets.get(ca) ? cx.nets.get(ca).nodes.filter((x) => x.startsWith('R:')).map((x) => x.slice(2)) : [];
        if (rails.length) add('railNotGrounded', { rail: rails[0], cathode: led.b });
        else add('noGround', { cathode: led.b });
      }
      // each LED needs its own resistor
      const mine = up.find((x) => x.name !== 'GND' && x.resistors === 1);
      if (mine) {
        const r = cx.edges.find((e) => e.id === mine.via[0]);
        const sharers = parts.filter((p) => p.type === 'led' && p !== led && p.a && (cx.net(p.a) === r.from || cx.net(p.a) === r.to));
        if (sharers.length) add('sharedResistor', { others: sharers.map((p) => p.color), anode: led.a });
      }
      return { key: ch.key, ok: issues.length === 0, issues };
    });
    // a closed path exists for each LED (electrically connected), whatever the lesson wanted
    const closed = {};
    for (const p of parts.filter((x) => x.type === 'led' && x.a && x.b)) {
      const drv = [...cx.nets.values()].filter((n) => driversOf(n.pins).some((d) => d.kind !== 'gnd')).map((n) => n.id);
      closed[p.color || p.id] = paths(cx, drv, (n, t) => driversOf(cx.pinsOn(n)).length > 0 && t.length > 0, {}).some((t) => t.some((x) => x.e.id === p.id));
    }
    return { channels, hazards: hz, safe: hz.length === 0, ok: hz.length === 0 && channels.every((c) => c.ok), closed };
  }

  // What each LED does when one pin at a time is HIGH and the other lesson pins are LOW (power on). Used to show what
  // a mistake would do. It never claims anything for an unsafe circuit: that one stays unplugged.
  function predict(build, plan) {
    if (!isSafe(build)) return null;
    const names = plan.channels.map((c) => pinInfo(c.pin).name);
    return names.map((hi) => {
      const pins = {}; names.forEach((n) => { pins[n] = n === hi ? 'high' : 'low'; });
      const s = ledStates(build, { powered: true, pins });
      const lit = Object.entries(s).filter(([, v]) => v.level > 0).map(([id]) => (build[id] && build[id].color) || id);
      return { high: hi, lit };
    });
  }

  // The strips, rails and pins an LED's current passes through: its long leg's strip, the strip on the other side of its
  // resistor(s), and its short leg's strip with everything joined to it. Used to make the active path glow (an
  // illustration of where current flows, not a measurement).
  function pathNodes(build, ledId) {
    const cx = connectivity(build);
    const led = build[ledId];
    if (!led || led.type !== 'led' || !led.a || !led.b) return { anode: [], cathode: [] };
    const an = cx.net(led.a), ca = cx.net(led.b);
    const nodesOf = (n) => (cx.nets.get(n) || { nodes: [] }).nodes;
    const anode = new Set(nodesOf(an));
    for (const e of cx.edges) if (e.type === 'resistor' && (e.from === an || e.to === an)) nodesOf(e.from === an ? e.to : e.from).forEach((x) => anode.add(x));
    return { anode: [...anode], cathode: nodesOf(ca).slice() };
  }

  return { pathNodes, FAR_ROWS, NEAR_ROWS, RAILS, RAIL_NAMES, NEAR_PINS, FAR_PINS, railHasCol, pinInfo, validEnd, cleanBuild, nodeOf,
    endName, stripName, sameEnd, connectivity, hazards, isSafe, ledStates, lessonCheck, predict };
});
