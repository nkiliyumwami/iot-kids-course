/* Virtual Traffic Light Lab: what the lab teaches, as plain data (no 3D, no page).
   Works in the browser (window.VLabCurriculum) and in Node (require), so tests can check it without a browser.
   The 24 steps follow the lab's design specification (section 5), grouped into stages.
   Steps with ready: false are planned but not built yet; the page never lets a learner into them. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLabCurriculum = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The canonical circuit (the same as Lesson 1 and AGENT.md). Each LED gets its own 330 Ω resistor.
  const CHANNELS = [
    { key: 'red', name: 'Red', pin: 'near:D25', gpio: 25, col: 7, led: 0xff3030, wire: 0xe0413b },
    { key: 'yellow', name: 'Yellow', pin: 'near:D26', gpio: 26, col: 15, led: 0xffb400, wire: 0xf2c12e },
    { key: 'green', name: 'Green', pin: 'near:D27', gpio: 27, col: 23, led: 0x1fd067, wire: 0x2fae5f },
  ];
  const GROUND_PIN = 'near:GND'; // the GND pin next to D13
  const RESISTOR_OHMS = 330;

  const STAGES = [
    { id: 'ready', name: 'Get ready', icon: '🧰' },
    { id: 'red', name: 'Red light', icon: '🔴' },
    { id: 'yellow', name: 'Yellow light', icon: '🟡' },
    { id: 'green', name: 'Green light', icon: '🟢' },
    { id: 'power', name: 'Power up', icon: '🔌' },
    { id: 'code', name: 'Code and run', icon: '💻' },
    { id: 'fix', name: 'Fix it', icon: '🔧' },
    { id: 'yours', name: 'Make it yours', icon: '⭐' },
  ];

  // Lessons the lab builds on. Shown as links; nothing is locked.
  const PREREQS = [
    { slug: '00-meet-esp32', name: 'Pin Detective' },
    { slug: 'lab1-light-it-up', name: 'Circuit Lab 1: Light It Up' },
    { slug: 'lab2-code-switch', name: 'Circuit Lab 2: Let Code Switch It' },
    { slug: '01-traffic-light', name: 'Lesson 1: My First Traffic Light' },
  ];

  const SAFETY = 'This is a learning simulation. Check real wiring with a knowledgeable adult before applying power.';

  // What each part on the bench is, what it does, and why it is in this circuit. word = a maker word in board.js.
  const PARTS = {
    controller: { name: 'ESP32 DevKit', word: 'devkit',
      does: 'A tiny computer. Your program tells its pins when to switch on and off.',
      why: 'Pins D25, D26 and D27 will each control one light. The gold boxes show the pins this lab uses.' },
    breadboard: { name: 'Breadboard', word: 'breadboard',
      does: 'Holds parts and wires without soldering. You just push them into the holes.',
      why: 'Metal strips hidden under the holes join parts together. You’ll explore them in the next step.' },
    'led-red': { name: 'Red LED', word: 'led',
      does: 'A small light. Electricity can only flow through it one way.',
      why: 'Its long leg (anode, +) goes towards the pin, its short leg (cathode, −) towards ground. Backwards, it stays dark.' },
    'led-yellow': { name: 'Yellow LED', word: 'led',
      does: 'A small light. Electricity can only flow through it one way.',
      why: 'Its long leg (anode, +) goes towards the pin, its short leg (cathode, −) towards ground. Backwards, it stays dark.' },
    'led-green': { name: 'Green LED', word: 'led',
      does: 'A small light. Electricity can only flow through it one way.',
      why: 'Its long leg (anode, +) goes towards the pin, its short leg (cathode, −) towards ground. Backwards, it stays dark.' },
    resistor: { name: '330 Ω resistor', word: 'resistor',
      does: 'Slows down the flow of electricity (the current), so the LED isn’t damaged.',
      why: 'Every LED needs its own. The bands orange, orange, brown mean 330 Ω (ohms).' },
    'wire-signal': { name: 'Jumper wire (signal)', word: 'jumper',
      does: 'Carries electricity from one place to another.',
      why: 'A coloured wire joins each light’s pin (D25, D26 or D27) to the breadboard.' },
    'wire-ground': { name: 'Jumper wire (ground, black)', word: 'jumper',
      does: 'Carries electricity back to GND, the road home.',
      why: 'Black wires join each LED’s short leg to the blue − rail, and the rail to the GND pin.' },
    usb: { name: 'USB cable', word: 'usb',
      does: 'Brings power and your code from the computer to the ESP32.',
      why: 'Plug it in last, after you’ve checked your wiring. Unplug it before you change anything.' },
  };
  // The six kinds of part a learner meets in "Meet the kit" (the three LEDs count as one kind).
  const KIT_KINDS = [
    { id: 'controller', name: 'ESP32', parts: ['controller'] },
    { id: 'breadboard', name: 'Breadboard', parts: ['breadboard'] },
    { id: 'led', name: 'LEDs', parts: ['led-red', 'led-yellow', 'led-green'] },
    { id: 'resistor', name: 'Resistors', parts: ['resistor'] },
    { id: 'wire', name: 'Jumper wires', parts: ['wire-signal', 'wire-ground'] },
    { id: 'usb', name: 'USB cable', parts: ['usb'] },
  ];

  const STEPS = [
    { id: 'welcome', stage: 'ready', ready: true, title: 'Welcome to your lab', cam: 'kit', task: 'mode',
      text: 'This is your own electronics bench. You’ll build a traffic-light circuit, check it, then watch code switch the lights.',
      hint: 'Drag to look around. Tap anything to find out what it is.' },
    { id: 'meet-kit', words: ['led', 'resistor'], stage: 'ready', ready: true, title: 'Meet the kit', cam: 'kit', task: 'parts',
      text: 'Everything for your traffic light is on the bench. Tap each kind of part to meet it.',
      why: { q: 'Why three resistors, not one?', a: 'Each LED gets its own resistor. Then each light has its own safe path, and one light can be on while the others are off.' } },
    { id: 'hidden-strips', words: ['breadboard', 'rail'], stage: 'ready', ready: true, title: 'Explore the hidden connections', cam: 'board', task: 'strips',
      text: 'Under the holes are metal strips. Holes on the same strip are joined, so electricity can travel between them.',
      target: { c: 7, r: 'b' },
      why: { q: 'Why is there a gap in the middle?', a: 'The gap splits every numbered row into two strips that are not joined. A part that crosses the gap, like your resistor, joins them on purpose.' } },
    { id: 'unplug', words: ['short'], stage: 'ready', ready: true, title: 'Safety before power', cam: 'usb', task: 'unplug',
      text: 'Always unplug the USB cable before you add or move parts. Then nothing has power while your hands are busy.',
      why: { q: 'Why unplug first?', a: 'A loose wire touching the wrong pin while the board has power could make a short circuit: a shortcut that lets far too much current flow.' } },
    // Building: steps 5–17 are made below from CHANNELS, so the words always match the wiring table.
    ...buildSteps(),
    { id: 'inspect', words: ['circuit'], stage: 'power', ready: true, title: 'Inspect before USB', cam: 'kit', task: 'inspect',
      text: 'Before any power goes in, check everything. The circuit checker follows each light’s path, from its pin all the way home to GND.',
      why: { q: 'Why check before plugging in?', a: 'A mistake with the power off is harmless. The same mistake with power on can damage a part. Engineers always check first.' },
      wrong: 'A missing resistor or a short circuit could break the LED or the ESP32 the moment power arrives.' },
    { id: 'plug-in', words: ['high'], stage: 'power', ready: true, title: 'Connect the USB cable', cam: 'kit', task: 'plugin',
      text: 'Your circuit passed the check, so now it’s safe to plug in. Every pin starts off (LOW) until a program switches it on.',
      why: { q: 'Why don’t the lights come on by themselves?', a: 'D25, D26 and D27 are outputs your code controls. Until the code says HIGH, they stay LOW: no push, no light.' },
      wrong: 'If a light came on by itself, it would be wired to 3V3 (always on) instead of to its pin.' },
    { id: 'read-code', words: ['micropython', 'loop'], stage: 'code', ready: true, title: 'Read the code', cam: 'kit', task: 'code',
      text: 'This is the program for your traffic light. Tap a line to find out what it does: the bench shows the pin and the light it talks to.',
      why: { q: 'The code says Pin(25), the board says D25. Same pin?', a: 'Yes! <code>Pin(25)</code> means GPIO 25, and the board prints it as D25. It is not the 25th pin along the header.' },
      wrong: 'If the code said Pin(26) for red, it would switch the pin that is wired to the yellow light.' },
    { id: 'run', stage: 'code', ready: true, title: 'Run the traffic light', cam: 'kit', task: 'run',
      text: 'Press ▶ Run. The highlighted line, the pins and the lights all move together. Then try ⏸ Pause and ⏭ Step.',
      why: { q: 'Why does nothing change during time.sleep()?', a: 'sleep() only waits. The pins keep what the last value() lines said, so the light stays on until the next block.' },
      wrong: 'Without time.sleep(), the lights would switch thousands of times a second: far too fast to see.' },
    { id: 'fix-it', words: ['debug'], stage: 'fix', ready: true, title: 'Fix-it workshop', cam: 'kit', task: 'fixit',
      text: 'Someone has been at your bench! Each round hides one fault. Check the circuit, read Officer Ohm’s hints, then fix it with your own hands.',
      why: { q: 'Why practise fixing?', a: 'Most circuits don’t work the first time. Finding a fault calmly, one path at a time, is a real engineering skill called debugging.' },
      wrong: 'Swapping random wires can turn one fault into three. Check first, then change one thing.' },
    { id: 'make-yours', words: ['variable'], stage: 'yours', ready: true, title: 'Make it yours', cam: 'kit', task: 'yours',
      text: 'Change how long each light stays on. First predict what will happen, then run it and see if you were right.',
      why: { q: 'Why are RED_S, GREEN_S and YELLOW_S at the top?', a: 'They are names for numbers. Change one at the top and the whole program uses the new time. Capitals tell people “this is a setting”.' },
      wrong: 'A very short yellow is dangerous on a real road: drivers would not have time to stop.' },
    { id: 'quiz', stage: 'yours', ready: true, title: 'Quick check and celebrate', cam: 'kit', task: 'quiz',
      text: 'Three questions. A wrong answer gets a hint and another try.' },
  ];

  /* ---------- phase 3: the quiz, the fix-it workshop, and the parts for experiment mode ---------- */
  const QUIZ = [
    { id: 'q-resistor', q: 'Why does each LED get its own 330 Ω resistor?',
      opts: ['So each light is protected and can switch on and off by itself', 'To make the lights brighter', 'Because the breadboard needs one in every row'], right: 0,
      hint: 'Think about what a resistor does to the current, and whether the lights work together or alone.',
      why: 'Yes! Each resistor limits the current for its own LED, so every light is safe and can switch by itself.' },
    { id: 'q-pin', q: 'The code says red = Pin(25, Pin.OUT). Where must the red light’s wire go?',
      opts: ['Pin 25 counting along the header', 'D25 on the board', 'Any free pin, the code finds it'], right: 1,
      hint: 'Pin(25) means GPIO 25. How is GPIO 25 printed on the board?',
      why: 'Right: Pin(25) is GPIO 25, printed D25. The code and the wire must match, or the wrong light switches.' },
    { id: 'q-ground', q: 'Why does the LED’s short leg connect to GND?',
      opts: ['It makes the LED brighter', 'It just holds the LED in place', 'Current needs a way back home to close the loop'], right: 2,
      hint: 'Remember the circuit doctor: what happened when the ground wire was missing?',
      why: 'Yes! Current leaves the LED through its short leg (cathode) and goes home through GND, closing the loop.' },
  ];
  // three faults to repair, one at a time: a polarity mistake, a wrong pin, and a dangerous one
  const WORKSHOP = ['reverse-red', 'swap-red-yellow', 'no-res-yellow'];
  // "Fix it for me": which planned parts put a channel right again, for each kind of problem
  function fixParts(code, key, refs) {
    if (code === 'reversed') return ['led-' + key];
    if (['wrongPin', 'alwaysOn', 'signalWrongStrip', 'noSignalWire', 'wireLoose', 'short', 'pinFight', 'overvoltage'].includes(code)) return ['sig-' + key];
    if (['noResistor', 'noResistorPath', 'resistorSameStrip', 'resistorWrongRow', 'extraResistor'].includes(code)) return ['res-' + key, 'sig-' + key];
    if (code === 'noGround') return ['gw-' + key];
    if (code === 'railNotGrounded') return refs && refs.rail === 'BN' ? ['gnd'] : ['gw-' + key];
    if (code === 'sharedResistor') return ['led-' + key, 'res-' + key];
    return ['res-' + key, 'led-' + key, 'gw-' + key, 'sig-' + key];
  }
  // what a learner can add to the board in experiment mode
  const ADD_KINDS = [
    { id: 'resistor', label: '330 Ω resistor', type: 'resistor' },
    ...CHANNELS.map((ch) => ({ id: 'led-' + ch.key, label: `${ch.name} LED`, type: 'led', color: ch.key })),
    ...CHANNELS.map((ch) => ({ id: 'wire-' + ch.key, label: `${ch.name} wire`, type: 'wire', color: ch.key })),
    { id: 'wire-black', label: 'Black wire', type: 'wire', color: 'black' },
  ];

  /* ---------- the canonical circuit as parts (the same as Lesson 1 and Circuit Lab 1) ---------- */
  function H(c, r) { return { k: 'hole', c, r }; }
  function R(c, rail) { return { k: 'rail', rail: rail || 'BN', c }; }
  function PIN(id) { return { k: 'pin', id }; }
  function canonicalParts() {
    const parts = {};
    for (const ch of CHANNELS) {
      const c = ch.col;
      parts['res-' + ch.key] = { type: 'resistor', a: H(c, 'd'), b: H(c, 'g') };
      parts['led-' + ch.key] = { type: 'led', color: ch.key, a: H(c, 'i'), b: H(c + 1, 'i') };
      parts['gw-' + ch.key] = { type: 'wire', a: H(c + 1, 'j'), b: R(c + 1) };
      parts['sig-' + ch.key] = { type: 'wire', a: PIN(ch.pin), b: H(c, 'b') };
    }
    parts.gnd = { type: 'wire', a: PIN(GROUND_PIN), b: R(30) };
    return parts;
  }
  const PLAN = { channels: CHANNELS.map((ch) => ({ key: ch.key, pin: ch.pin })) };

  // One step per part: resistor, LED, ground wire, signal wire for each light, then the shared ground wire.
  function buildSteps() {
    const out = [];
    CHANNELS.forEach((ch, i) => {
      const c = ch.col, first = i === 0, name = ch.name.toLowerCase(), pin = ch.pin.slice(5);
      const w = (list) => (first ? list : []);
      out.push({ id: ch.key + '-resistor', words: w(['current', 'ohm']), stage: ch.key, ready: true, title: `${ch.name} light: resistor`, task: 'place', place: 'res-' + ch.key, holding: '330 Ω resistor',
        text: first ? `Put a 330 Ω resistor across the middle gap in row ${c}: one leg in <b>d${c}</b>, the other in <b>g${c}</b>.`
          : `Same job, new row: a 330 Ω resistor from <b>d${c}</b> to <b>g${c}</b>, across the gap.`,
        why: first ? { q: 'Why across the gap?', a: `Then electricity arriving at the top strip (from your pin) can only reach the LED by going through the resistor.` }
          : { q: 'Why a new resistor?', a: 'Each light gets its own. Then each LED is protected, and each light can switch on and off by itself.' },
        wrong: first ? 'If both legs were on one strip, the resistor would join that strip to itself and no current could reach the LED.'
          : 'Sharing one resistor would make the lights depend on each other.' });
      out.push({ id: ch.key + '-led', words: w(['anode', 'cathode']), stage: ch.key, ready: true, title: `${ch.name} light: LED`, task: 'place', place: 'led-' + ch.key, holding: `${name} LED`,
        text: `Push the ${name} LED in: <b>long leg</b> (anode, +) in <b>i${c}</b>, <b>short leg</b> (cathode, −) in <b>i${c + 1}</b>.`,
        why: { q: `Why does the long leg go in row ${c}?`, a: `Row ${c} below the gap is joined to the resistor. Current must go into an LED through its long leg.` },
        wrong: 'Backwards, the LED blocks the current and stays dark.' });
      out.push({ id: ch.key + '-ground', words: w(['gnd']), stage: ch.key, ready: true, title: `${ch.name} light: ground wire`, task: 'place', place: 'gw-' + ch.key, holding: 'black jumper wire',
        text: `A black wire from <b>j${c + 1}</b> (the short leg’s strip) to the <b>blue − rail</b> just below it.`,
        why: { q: 'Why the blue rail?', a: 'The rail runs along the whole board, so all three lights can share one road home to GND.' },
        wrong: 'Without it the current has no way home: the loop is open and the LED stays dark.' });
      out.push({ id: ch.key + '-signal', words: w(['gpio']), stage: ch.key, ready: true, title: `${ch.name} light: signal wire`, task: 'place', place: 'sig-' + ch.key, holding: `${name} jumper wire`,
        text: `A ${name} wire from pin <b>${pin}</b> on the ESP32 to hole <b>b${c}</b>.`,
        why: { q: `Why ${pin}?`, a: `Your code will say <code>Pin(${ch.gpio})</code>. ${pin} is GPIO ${ch.gpio}, so this wire lets the code switch the ${name} light. <a class="pin-link" href="../../pins.html?pin=${pin}" target="_blank" rel="noopener">🔍 About ${pin}</a>` },
        wrong: 'On a different pin, the light would switch when another light should (or never).' });
    });
    out.push({ id: 'close-loop', stage: 'power', ready: true, title: 'Close the loop', task: 'place', place: 'gnd', holding: 'black jumper wire',
      text: 'One last black wire: from the <b>GND</b> pin next to D13 to the <b>blue − rail</b> (hole 30).',
      why: { q: 'Why only one wire?', a: 'All three lights already meet on the rail. One wire takes all their current back to the ESP32.' },
      wrong: 'Without it the rail isn’t joined to GND, so none of the lights could ever switch on.' });
    return out;
  }

  /* ---------- what Officer Ohm says about a mistake: [what happened and why, where to look, what to try] ---------- */
  // ctx: { color: 'red', name: f(end) → 'd7', strip: f(end) → 'a7–e7', ...refs from the checker }
  const ISSUES = {
    noResistor: (x) => [`<b>Danger:</b> nothing slows the current to the ${x.color} LED. With no resistor, far too much current would flow: a real LED could overheat and break, and the pin could be damaged.`,
      `Look at the ${x.color} LED’s long leg in <b>${x.name(x.anode)}</b>: its strip is joined straight to the pin.`, 'Put a 330 Ω resistor across the gap, so the current has to pass through it.'],
    reversed: (x) => [`The ${x.color} LED is backwards. An LED only lets current through one way, so it stays dark.`,
      `Its long leg is in <b>${x.name(x.anode)}</b> (towards ground) and its short leg in <b>${x.name(x.cathode)}</b> (towards the pin).`, 'Swap the legs: long leg on the resistor’s side, short leg on the ground side.'],
    wrongPin: (x) => [`The ${x.color} light is wired to <b>${x.found.join(', ')}</b>, not <b>${x.want}</b>. Your code switches ${x.want}, so this light would come on at the wrong time.`,
      `Follow the wire into the ${x.color} light’s row back to the ESP32.`, `Move that wire’s end to pin <b>${x.want}</b>.`],
    alwaysOn: (x) => [`The ${x.color} light is wired to an always-on power pin (${x.found.join(', ')}), so your code could never switch it off.`,
      'Follow its wire back to the ESP32.', `Move the wire to pin <b>${x.want}</b>.`],
    noGround: (x) => [`The ${x.color} LED’s short leg has no way home to GND. Current flows in a loop: with the loop open, the LED stays dark.`,
      `The short leg is in <b>${x.name(x.cathode)}</b>; its strip ${x.strip(x.cathode)} needs a black wire.`, 'Add a black wire from that strip to the blue − rail.'],
    railNotGrounded: (x) => [`The ${x.color} light reaches ${x.railName(x.rail)}, but that rail isn’t joined to a GND pin. A rail is only joined to itself, so this road home is a dead end.`,
      x.rail === 'BN' ? 'Look for the black wire from the blue − rail to the GND pin next to D13.' : 'The ground wires of the other lights go to the blue − rail on the near side.',
      x.rail === 'BN' ? 'Add one black wire from the GND pin to the blue − rail.' : 'Move this black wire’s end to the blue − rail on the near side.'],
    resistorSameStrip: (x) => [`Both legs of a resistor are on the same strip (${x.name(x.res)} and ${x.name(x.res2)}). It joins that strip to itself, so no current can cross to the LED.`,
      `The strip is ${x.strip(x.res)}.`, 'Put one leg above the gap and one below, in the same numbered row.'],
    resistorWrongRow: (x) => [`The resistor starts in the right strip, but its other leg is in <b>${x.name(x.res)}</b>. The current goes off to the wrong strip and never reaches the LED.`,
      `The LED’s long leg is in <b>${x.name(x.anode)}</b>, on strip ${x.strip(x.anode)}.`, 'Move the resistor’s bottom leg into the LED’s strip.'],
    signalWrongStrip: (x) => [`The ${x.want} wire goes into <b>${x.name(x.wire)}</b>, but the resistor’s top leg is in <b>${x.name(x.res)}</b>. Those are different strips, so the pin and the resistor aren’t joined.`,
      `The resistor’s strip is ${x.strip(x.res)}.`, `Move the wire’s end into ${x.strip(x.res)}.`],
    noSignalWire: (x) => [`Nothing joins pin <b>${x.want}</b> to the ${x.color} light, so your code can’t switch it.`,
      x.res ? `The resistor’s top leg is in <b>${x.name(x.res)}</b>.` : 'Find the resistor for this light.', `Add a wire from ${x.want} into the resistor’s strip.`],
    wireLoose: (x) => [`The ${x.pin} wire is only pushed in at one end. A wire hanging in the air joins nothing.`,
      x.end ? `Its other end is in <b>${x.name(x.end)}</b>.` : 'Look for the loose end.', 'Push the loose end into the strip with the resistor’s top leg.'],
    noResistorPath: (x) => [`Nothing joins the ${x.color} LED’s long leg (${x.name(x.anode)}) to its pin. The resistor should bridge the gap between the pin’s strip and the LED’s strip.`,
      `The pin’s wire ends in <b>${x.name(x.wire)}</b>; the LED’s long leg is in <b>${x.name(x.anode)}</b>.`, 'Put a 330 Ω resistor across the gap between those two strips.'],
    extraResistor: (x) => [`The ${x.color} light has two resistors in a row, so it would be very dim.`, 'Follow the path from the pin to the LED.', 'Use one 330 Ω resistor per light.'],
    sharedResistor: (x) => [`The ${x.color} LED shares a resistor with the ${x.others.join(' and ')} LED. Each light needs its own resistor, or the lights depend on each other.`,
      `The ${x.color} LED’s long leg is in <b>${x.name(x.anode)}</b>.`, 'Give each LED its own row and its own resistor.'],
    short: (x) => [`<b>Danger: short circuit!</b> ${x.pins.join(' and ')} are joined by wires with nothing in between. Current would rush straight from one to the other and could damage the ESP32.`,
      `Look for a wire that joins ${x.pins.join(' and ')} directly.`, 'Take that wire out. A pin should only reach GND through a resistor and an LED.'],
    pinFight: (x) => [`<b>Danger:</b> pins ${x.pins.join(' and ')} are joined. If the code made one HIGH and the other LOW, they would fight: a short circuit inside the ESP32.`,
      'Two signal wires end up on the same strip.', 'Give each pin its own row: move one of the wires.'],
    overvoltage: (x) => [`<b>Danger:</b> VIN (5 volts) is joined to ${x.pins.filter((p) => p !== 'VIN').join(', ')}. ESP32 pins only take 3.3 volts.`, 'Look for the wire from VIN.', 'Remove it: this circuit doesn’t use VIN.'],
    ledMissing: (x) => [`The ${x.color} LED isn’t on the board yet.`, `Its long leg goes in i${x.col}, its short leg in i${x.col + 1}.`, 'Place the LED.'],
  };

  /* ---------- hints while placing a part (the tap was not the planned hole or pin) ---------- */
  // ctx: { got, want, part, name(), strip(), half() }. Again [what and why, where, what to try].
  const PLACE_HINTS = {
    occupied: (x) => [`Hole <b>${x.name(x.got)}</b> already has something in it. One leg or wire end per hole!`, `This part goes in <b>${x.name(x.want)}</b>.`, 'Tap the free hole shown with the gold ring.'],
    sameStrip: (x) => [`Good thinking: <b>${x.name(x.got)}</b> is on the same strip as ${x.name(x.want)}, so electrically it would work too! For this build, use <b>${x.name(x.want)}</b> so your board matches the wiring plan.`,
      `It’s on strip ${x.strip(x.want)}.`, `Tap <b>${x.name(x.want)}</b>.`],
    acrossGap: (x) => [`Close! <b>${x.name(x.got)}</b> is across the middle gap from where this goes. The gap splits row ${x.got.c} into two strips that are not joined.`,
      `This end goes ${x.half(x.want) === 'far' ? 'above' : 'below'} the gap: <b>${x.name(x.want)}</b>.`, `Tap <b>${x.name(x.want)}</b>.`],
    wrongRow: (x) => [`That’s row ${x.got.c}. A strip is one numbered row, so this part would be joined to the wrong things.`,
      `Look in row <b>${x.want.c}</b>: <b>${x.name(x.want)}</b>.`, `Tap <b>${x.name(x.want)}</b>.`],
    ledLegs: (x) => [`That’s where the <b>short</b> leg goes. Start with the long leg (anode, +): it must face the resistor, or the LED will be backwards.`,
      `The long leg goes in <b>${x.name(x.want)}</b>, next to it.`, `Tap <b>${x.name(x.want)}</b> first.`],
    wantHole: (x) => [`This end goes into a breadboard hole, not ${x.got.k === 'pin' ? 'an ESP32 pin' : 'a rail'}.`, `Find hole <b>${x.name(x.want)}</b>.`, `Tap <b>${x.name(x.want)}</b>.`],
    wantRail: (x) => [`This wire ends on the <b>blue − rail</b>, the long strip along the near edge, so every light can share it.`, `The rail hole right below: column ${x.want.c}.`, 'Tap the gold-ringed rail hole.'],
    wrongRail: (x) => [`That’s ${x.railName(x.got.rail)}. ${x.got.rail.endsWith('P') ? 'A red + rail is for power, not for the way home.' : 'It isn’t joined to the near blue rail, so it would be a dead end.'}`,
      'Use the <b>blue − rail</b> on the near side, closest to the LEDs.', 'Tap the gold-ringed rail hole.'],
    sameRail: (x) => [`That’s the right rail, and electrically any hole on it would work! For a short, tidy wire use the hole in column <b>${x.want.c}</b>.`, `Column ${x.want.c} of the blue − rail.`, 'Tap the gold-ringed rail hole.'],
    wantPin: (x) => [`This end goes onto an ESP32 pin, not into the breadboard.`, `Pin <b>${x.name(x.want)}</b> on the side nearest the breadboard.`, `Tap pin <b>${x.name(x.want)}</b>.`],
    wrongPin: (x) => [`That’s pin <b>${x.name(x.got)}</b>. ${x.want.id.endsWith('GND') ? 'The road home needs a GND pin (0 volts).' : `Your code will use ${x.name(x.want)}, so the wire must be on that pin.`}`,
      `${x.name(x.want)} is on the side nearest the breadboard${x.want.id.endsWith('GND') ? ', next to D13' : ''}.`, `Tap pin <b>${x.name(x.want)}</b>.`],
    otherGnd: (x) => [`That’s also a GND pin: they’re all joined inside the ESP32, so it would work! Use the one <b>next to D13</b>: it’s closer to your rail, so the wire stays short.`,
      'Near side, between D13 and VIN.', 'Tap the GND pin next to D13.'],
  };

  // Pretend mistakes for the circuit doctor (and later the fix-it workshop). Each changes a copy of the right circuit.
  const MISTAKES = [
    { id: 'reverse-red', label: 'Red LED backwards', apply: (p) => { p['led-red'] = { ...p['led-red'], a: p['led-red'].b, b: p['led-red'].a }; } },
    { id: 'no-res-yellow', label: 'A wire instead of the yellow resistor', apply: (p) => { p['res-yellow'] = { type: 'wire', a: H(15, 'd'), b: H(15, 'g') }; } },
    { id: 'res-row-yellow', label: 'Yellow resistor in the wrong row', apply: (p) => { p['res-yellow'] = { ...p['res-yellow'], b: H(16, 'g') }; } },
    // (a header pin holds one jumper, so a wrong pin is a swap or a free pin, never two wires on one pin)
    { id: 'swap-red-yellow', label: 'Red and yellow wires swapped (D26 / D25)', apply: (p) => { p['sig-red'] = { ...p['sig-red'], a: PIN('near:D26') }; p['sig-yellow'] = { ...p['sig-yellow'], a: PIN('near:D25') }; } },
    { id: 'no-ground-red', label: 'Red ground wire missing', apply: (p) => { delete p['gw-red']; } },
    { id: 'far-rail-red', label: 'Red ground wire on the far rail', apply: (p) => { p['gw-red'] = { ...p['gw-red'], b: R(8, 'TN') }; } },
    { id: 'no-close-loop', label: 'Rail not joined to GND', apply: (p) => { delete p.gnd; } },
    { id: 'red-wire-row-8', label: 'Red wire in the wrong row (b8)', apply: (p) => { p['sig-red'] = { ...p['sig-red'], b: H(8, 'b') }; } },
    { id: 'loose-green', label: 'Green wire loose at one end', apply: (p) => { p['sig-green'] = { ...p['sig-green'], b: null }; } },
    { id: 'yellow-in-red-row', label: 'Yellow wire in the red row (a7)', apply: (p) => { p['sig-yellow'] = { ...p['sig-yellow'], b: H(7, 'a') }; } },
    { id: 'short-d25', label: 'Red wire straight into the − rail', apply: (p) => { p['sig-red'] = { ...p['sig-red'], b: R(10, 'BN') }; } },
  ];
  function withMistake(id) {
    const p = JSON.parse(JSON.stringify(canonicalParts()));
    const m = MISTAKES.find((x) => x.id === id);
    if (m) m.apply(p);
    return p;
  }

  const stageOf = (step) => STAGES.findIndex((s) => s.id === step.stage);
  const lastReady = () => STEPS.reduce((m, s, i) => (s.ready ? i : m), -1);
  const placeSteps = () => STEPS.filter((s) => s.task === 'place');

  return { CHANNELS, GROUND_PIN, RESISTOR_OHMS, STAGES, PREREQS, SAFETY, PARTS, KIT_KINDS, STEPS, stageOf, lastReady, placeSteps,
    canonicalParts, PLAN, ISSUES, PLACE_HINTS, MISTAKES, withMistake, QUIZ, WORKSHOP, fixParts, ADD_KINDS };
});
