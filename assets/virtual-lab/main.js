/* Virtual Traffic Light Lab: starts the lab and runs its steps.
   Phase 1: the bench, tapping or picking anything to learn what it is, the four "Get ready" steps.
   Phase 2 (this version): building the circuit part by part, the circuit checker, the circuit doctor (pretend mistakes),
   and plugging in with a pin tester. The learner's circuit is one piece of data (`st.build`); the 3D scene, the checker
   and the saved progress all read it, so they can never disagree. Code and run arrive in Phase 3. */
(function () {
  'use strict';
  const C = window.VLabCurriculum, UI = window.VLabUI, E = window.ESP32, N = window.VLabNetlist, K = window.VLabCode, S = window.VLabSimulator;
  const { $ } = UI;
  const STEPS = C.STEPS, LAST = C.lastReady();
  const BASE = '../../';
  const CANON = C.canonicalParts();
  const idx = (id) => STEPS.findIndex((s) => s.id === id);
  const PLACE = C.placeSteps();

  const progress = window.VLabProgress.create({ stepIds: STEPS.map((s) => s.id), cleanBuild: N.cleanBuild, cleanProgram: K.cleanProgram });
  const saved = progress.load();
  const st = { mode: saved.mode, done: new Set(saved.completedStepIds), helped: new Set(saved.helpedStepIds), build: saved.build,
    program: saved.program || K.DEFAULT(), solved: new Set(saved.solvedErrors), helpedErrors: new Set(saved.helpedErrors),
    quizCorrect: new Set(saved.quizCorrect), quizFirst: new Set(saved.quizFirst) };
  let step = 0;

  $('#safety').textContent = '⚠️ ' + C.SAFETY;
  if (E) {
    E.initWords();
    const countWords = () => { $('#wordCount').textContent = `(${E.book.list().length})`; };
    document.addEventListener('makerword', countWords); countWords();
  }
  const chip = (key) => (E && E.WORDS[key] ? E.chip(key) : '');

  /* ---------- start the 3D, or explain honestly why it can't ---------- */
  function webglWorks() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  }
  function fallback(reason) {
    document.body.classList.add('no3d');
    const fb = $('#fallback');
    fb.hidden = false;
    $('#fallbackWhy').textContent = reason;
    $('#fallbackWiring').innerHTML = C.CHANNELS.map((ch) =>
      `<li><b>${ch.name} light:</b> pin ${ch.pin.slice(5)} → hole b${ch.col}; 330 Ω resistor d${ch.col} → g${ch.col}; LED long leg i${ch.col}, short leg i${ch.col + 1}; black wire j${ch.col + 1} → blue − rail.</li>`).join('') +
      '<li><b>Shared ground:</b> one black wire from the blue − rail to the GND pin next to D13.</li>';
    $('#fallbackLinks').innerHTML = C.PREREQS.map((p) => `<li><a href="${BASE}lessons/${p.slug}/index.html">${UI.esc(p.name)}</a></li>`).join('');
  }
  $('#retry3d').addEventListener('click', () => location.reload());

  let view = null;
  try {
    if (!window.THREE || !window.THREE.OrbitControls || !window.CircuitKit) throw new Error('scripts');
    if (!webglWorks()) throw new Error('webgl');
    view = window.VLabView.create({ host: $('#scene'), layer: $('#labels'), curriculum: C });
  } catch (e) {
    if (window.console) console.warn('Virtual Lab: 3D unavailable:', e && e.message);
    fallback(e && e.message === 'scripts'
      ? 'The 3D tools could not be downloaded. Check your internet connection, then try again.'
      : 'This browser or device can’t show 3D graphics (WebGL is switched off or not supported). Try Chrome, Edge, Firefox or Safari on another device.');
    window.__lesson = { goTo() {}, get step() { return 0; }, STEPS, fallback: true };
    return;
  }
  const kit = view.kit;
  kit.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    $('#lost').hidden = false;
  });
  $('#lostReload').addEventListener('click', () => location.reload());
  view.setPlugged(!saved.completedStepIds.includes('unplug'));
  view.sync(st.build);

  /* ---------- what a tapped (or picked) thing is ---------- */
  const PIN_INFO = (id) => {
    const p = kit.pinById(id);
    const facts = E ? E.PINS.find((q) => q.side === (p.side === 'near' ? 'L' : 'R') && q.pos === p.k + 1) : null;
    return { p, facts };
  };
  // the job a hole has in the finished traffic light, if any
  function holeRole(c, r) {
    for (const ch of C.CHANNELS) {
      const n = ch.col;
      if (c === n && r === 'b') return `Your ${ch.name.toLowerCase()} signal wire from ${ch.pin.slice(5)} goes here.`;
      if (c === n && r === 'd') return `The top leg of the ${ch.name.toLowerCase()} light’s resistor goes here.`;
      if (c === n && r === 'g') return `The bottom leg of the ${ch.name.toLowerCase()} light’s resistor goes here.`;
      if (c === n && r === 'i') return `The ${ch.name.toLowerCase()} LED’s long leg (anode, +) goes here.`;
      if (c === n + 1 && r === 'i') return `The ${ch.name.toLowerCase()} LED’s short leg (cathode, −) goes here.`;
      if (c === n + 1 && r === 'j') return `A black wire from here to the blue − rail takes the ${ch.name.toLowerCase()} light’s current home.`;
    }
    return '';
  }
  function describe(hit) {
    const p = hit.point;
    if (p && p.kind === 'hole') {
      view.showHole(p.c, p.r);
      const role = holeRole(p.c, p.r);
      UI.inspect(`Hole ${p.r}${p.c}`, [
        `Row ${p.c}, ${view.half(p.r) === 'far' ? 'above' : 'below'} the middle gap. It’s joined to ${view.stripRange(p.c, p.r)}: five holes on one hidden strip.`,
        `It is <b>not</b> joined to ${view.half(p.r) === 'far' ? `f${p.c}–j${p.c}` : `a${p.c}–e${p.c}`}, across the gap.`,
      ].concat(role ? [`<b>In your circuit:</b> ${role}`] : []), chip('breadboard'));
      return;
    }
    if (p && p.kind === 'rail') {
      view.showRail(p.rail);
      const R = view.RAILS[p.rail];
      const job = p.rail === 'BN' ? 'Every LED’s short leg reaches this rail with a black wire, and one more black wire joins it to GND.'
        : p.rail === 'TN' ? 'It is <b>not</b> joined to the blue rail on the near side. This circuit doesn’t use it.'
          : 'A red + rail. This circuit doesn’t use it: the ESP32’s pins give the power.';
      UI.inspect(R.name, ['A rail is one long strip along the edge of the breadboard: all its holes are joined.', job], chip('rail'));
      return;
    }
    if (p && p.kind === 'pin') {
      view.showPin(p.id);
      const { p: pin, facts } = PIN_INFO(p.id);
      const ch = C.CHANNELS.find((x) => x.pin === pin.id);
      const lines = [facts ? UI.esc(facts.text) : 'A pin on the ESP32.'];
      if (ch) lines.push(`<b>In your circuit:</b> it switches the ${ch.name.toLowerCase()} light. In code it’s <code>Pin(${ch.gpio})</code>.`);
      if (pin.id === C.GROUND_PIN) lines.push('<b>In your circuit:</b> the blue − rail joins here. Every light’s current comes home through this pin.');
      UI.inspect(`Pin ${pin.name}`, lines, chip(ch ? 'gpio' : pin.name === 'GND' ? 'gnd' : 'pin'));
      return;
    }
    if (hit.part) {
      const info = C.PARTS[hit.part.part];
      if (!info) return;
      view.showPart(hit.part.part, hit.part.obj);
      const tip = hit.part.part === 'controller' && kit.kinds.has('pin') ? ['<span class="small">Tip: zoom in to tap a single pin.</span>'] : [];
      UI.inspect(info.name, [info.does, '<b>Why it’s here:</b> ' + info.why].concat(tip), chip(info.word));
    }
  }

  /* ---------- progress ---------- */
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // a building step is done when its part is in the build, exactly where the plan says
  const placedOk = (s) => !!st.build[s.place] && same(st.build[s.place], CANON[s.place]);
  const isDone = (id) => { const s = STEPS[idx(id)]; return s && s.task === 'place' ? st.done.has(id) || placedOk(s) : st.done.has(id); };
  const doneIds = () => STEPS.filter((s) => isDone(s.id)).map((s) => s.id);
  // The course's own progress store (course.js, the lessons page) knows this lab as an optional extra under its own id,
  // so it can show "In progress" or "Finished" there. It never touches a lesson's entry, badge or certificate.
  const COURSE_ID = 'circuit-challenge-lab';
  function courseSave(patch) {
    const Cs = window.COURSE;
    if (!Cs || !Cs.extras || !Cs.extras.some((x) => x.id === COURSE_ID) || Cs.lessonBySlug(COURSE_ID)) return;
    Cs.saveProgress(COURSE_ID, Object.assign({ steps: STEPS.length }, patch));
  }
  function complete(id, msg) {
    st.done.add(id); progress.complete(id);
    if (id === STEPS[LAST].id) courseSave({ step: LAST, done: true });
    UI.taskDone();
    if (msg) UI.say(msg, true);
    updateNav(); refreshProgress();
    showStageEnd();
  }
  // During a fix-it round the bench shows a temporary copy (st.workshop): it is saved on its own, and the learner's
  // build (st.own) is never overwritten. Outside a round, st.build IS the learner's build.
  function saveBuild() {
    if (st.workshop) progress.save({ workshop: { id: st.workshop.id, build: st.build } });
    else progress.save({ build: st.build, helpedStepIds: [...st.helped] });
  }
  function startWorkshop(id) {
    st.own = st.build;
    const saved = progress.state.workshop;
    let copy;
    if (saved && saved.id === id && Object.keys(saved.build).length) copy = saved.build; // resume after a reload
    else {
      // the fault goes onto a copy of the learner's own circuit (or the planned one, if theirs is already off-plan)
      const base = N.lessonCheck(st.own, C.PLAN).ok ? JSON.parse(JSON.stringify(st.own)) : C.canonicalParts();
      try { C.MISTAKES.find((m) => m.id === id).apply(base); copy = base; } catch (e) { copy = C.withMistake(id); }
    }
    st.workshop = { id };
    st.build = copy;
    view.sync(st.build); saveBuild();
  }
  function endWorkshop() {
    if (!st.workshop) return false;
    if (view.plugged) unplug();
    st.workshop = null; st.build = st.own || st.build; st.own = null;
    progress.save({ workshop: null });
    view.sync(st.build);
    return true;
  }
  const allPoints = () => new Set(['hole', 'rail', 'pin']);
  const ctxFor = (extra) => Object.assign({ name: N.endName, strip: N.stripName, half: (e) => (N.FAR_ROWS.includes(e.r) ? 'far' : 'near'), railName: (k) => N.RAIL_NAMES[k] }, extra);

  /* ---------- building: one generic handler for every placing step ---------- */
  const toEnd = (p) => (p.kind === 'hole' ? { k: 'hole', c: p.c, r: p.r } : p.kind === 'rail' ? { k: 'rail', rail: p.rail, c: p.c } : p.kind === 'pin' ? { k: 'pin', id: p.id } : null);
  // which build part (if any) already uses this hole, rail hole or pin
  function occupant(e, except) {
    for (const [id, p] of Object.entries(st.build)) if (id !== except) for (const x of [p.a, p.b]) if (x && same(x, e)) return id;
    return null;
  }
  // the planned end a wrong tap was probably aiming for: same kind of thing first, then the same row
  function aimedAt(got, cands) {
    return cands.find((w) => w.k === got.k && (w.k !== 'hole' || w.c === got.c)) || cands.find((w) => w.k === got.k) || cands[0];
  }
  function placeHint(got, want, s, first) {
    if (occupant(got, s.place)) return 'occupied';
    if (want.k === 'hole') {
      if (got.k !== 'hole') return 'wantHole';
      const P = CANON[s.place];
      if (P.type === 'led' && !first && same(got, P.b)) return 'ledLegs';
      if (N.nodeOf(got) === N.nodeOf(want)) return 'sameStrip';
      return got.c === want.c ? 'acrossGap' : 'wrongRow';
    }
    if (want.k === 'rail') return got.k !== 'rail' ? 'wantRail' : got.rail !== want.rail ? 'wrongRail' : 'sameRail';
    if (got.k !== 'pin') return 'wantPin';
    return N.pinInfo(got.id).kind === 'gnd' && N.pinInfo(want.id).kind === 'gnd' ? 'otherGnd' : 'wrongPin';
  }
  const endLabel = (P, e) => (P.type === 'led' ? (same(e, P.a) ? `long leg → ${N.endName(e)}` : `short leg → ${N.endName(e)}`) : N.endName(e));
  // the last part placed (only that one can be undone, so the build is always a clean sequence)
  const topPlaced = () => { for (let i = PLACE.length - 1; i >= 0; i--) if (st.build[PLACE[i].place]) return PLACE[i]; return null; };

  function placeHandler() {
    return {
      enter(s, o) {
        kit.kinds = allPoints();
        const P = CANON[s.place];
        s.first = null; s.misses = 0;
        s.home = () => view.flyToEnds([P.a, P.b]);
        view.flyToEnds([P.a, P.b], o.instant);
        if (placedOk(s)) {
          const undo = topPlaced() === s ? '<button type="button" class="btn" id="undoBtn">↶ Undo this part</button>' : '';
          UI.task(`Place the ${s.holding}`, `<span class="small">${st.helped.has(s.id) ? 'Placed with help.' : 'Placed.'} It stays on the board for the next steps.</span> ${undo}`);
          UI.taskDone();
          if (undo) $('#undoBtn').addEventListener('click', () => undoPart(s));
          if (o.replay) { [P.a, P.b].forEach((e, i) => view.markEnd(e, 0xf2b705, endLabel(P, e), i ? 54 : 26)); view.animateIn(s.place).then(() => { if (cur() === s) kit.clearTemps(); }); }
          return;
        }
        hand(`🖐 Holding: ${s.holding}`);
        this.prompt(s);
        // guided: both ends are ringed and named before anything is placed; practice: only on request
        if (st.mode !== 'practice') [P.a, P.b].forEach((e, i) => view.markEnd(e, 0xf2b705, endLabel(P, e), i ? 54 : 26));
      },
      prompt(s) {
        const P = CANON[s.place];
        const next = s.first ? (P.type === 'led' ? P.b : (same(s.first, P.a) ? P.b : P.a)) : P.a;
        const what = P.type === 'led' ? (s.first ? 'the short leg' : 'the long leg') : P.type === 'resistor' ? (s.first ? 'the other leg' : 'one leg') : (s.first ? 'the other end' : 'one end');
        const where = st.mode === 'practice' && !s.first ? '' : ` (${N.endName(next)}${s.first ? '' : P.type === 'led' ? '' : ' or ' + N.endName(P.b)})`;
        UI.task(`Tap where ${what} goes${where}`, `<button type="button" class="btn" id="showMeBtn">👀 Show me</button>${s.misses >= 3 ? ' <button type="button" class="btn" id="doItBtn">✋ Do it for me</button>' : ''}`);
        $('#showMeBtn').addEventListener('click', () => { kit.clearTemps(); [P.a, P.b].forEach((e, i) => view.markEnd(e, 0xf2b705, endLabel(P, e), i ? 54 : 26)); if (s.first) view.markEnd(s.first, 0x2e9e57); });
        const d = $('#doItBtn'); if (d) d.addEventListener('click', () => this.place(s, true));
      },
      onTap(hit, s) {
        if (placedOk(s) || s.busy) { describe(hit); return; }
        const p = hit.point;
        if (!p) { if (hit.part) { describe(hit); UI.say(`You’re holding the ${s.holding}. Tap a ${CANON[s.place].a.k === 'pin' ? 'pin or hole' : 'hole'} to put it in.`, false); } return; }
        const got = toEnd(p); if (!got) return;
        const P = CANON[s.place];
        const cands = s.first ? [P.type === 'led' ? P.b : (same(s.first, P.a) ? P.b : P.a)] : P.type === 'led' ? [P.a] : [P.a, P.b];
        const match = cands.find((w) => same(w, got));
        if (match && !occupant(got, s.place)) {
          if (!s.first) {
            s.first = match;
            kit.clearTemps();
            view.markEnd(match, 0x2e9e57);
            const other = P.type === 'led' ? P.b : (same(match, P.a) ? P.b : P.a);
            if (st.mode !== 'practice') view.markEnd(other, 0xf2b705, endLabel(P, other), 54);
            UI.say(`${P.type === 'led' ? 'Long leg' : P.type === 'resistor' ? 'One leg' : 'One end'} in <b>${N.endName(match)}</b>. ✓ Now ${P.type === 'led' ? 'the short leg' : 'the other end'}.`, true);
            this.prompt(s);
            return;
          }
          this.place(s, false);
          return;
        }
        // a wrong tap: say what happened and why, then (on later tries) where, then what to do, then offer help
        const want = aimedAt(got, cands);
        const code = placeHint(got, want, s, !!s.first);
        s.misses++;
        const lines = C.PLACE_HINTS[code](ctxFor({ got, want, part: P }));
        const level = Math.min(3, s.misses);
        UI.say(`<span class="hintno">Hint ${level} of 3</span> ` + lines.slice(0, level).join(' '), false);
        if (level >= 2) view.markEnd(want, 0xf2b705, endLabel(P, want));
        if (s.misses === 3) this.prompt(s);
      },
      async place(s, helped) {
        const P = CANON[s.place];
        s.busy = true;
        kit.clearTemps(); hand(null);
        st.build[s.place] = JSON.parse(JSON.stringify(P));
        if (helped) st.helped.add(s.id); else st.helped.delete(s.id);
        view.sync(st.build);
        saveBuild();
        const msg = helped ? `Here it is: ${N.endName(P.a)} to ${N.endName(P.b)}. Watch where it went, so you can do the next one yourself.` : PLACED_MSG(s, P);
        complete(s.id, msg);
        this.enter(s, { instant: true });
        s.busy = true;
        [P.a, P.b].forEach((e, i) => view.markEnd(e, 0x2e9e57, endLabel(P, e), i ? 54 : 26));
        await view.animateIn(s.place);
        s.busy = false;
        if (cur() !== s) return;
        kit.clearTemps();
        if (s.id === 'close-loop') showAllPaths();
      },
    };
  }
  function PLACED_MSG(s, P) {
    const n = N.endName;
    if (P.type === 'resistor') return `Resistor in: <b>${n(P.a)}</b> to <b>${n(P.b)}</b>, across the gap. Now any current for this LED has to go through it.`;
    if (P.type === 'led') return `LED in: long leg in <b>${n(P.a)}</b>, short leg in <b>${n(P.b)}</b>. The right way round!`;
    if (s.place === 'gnd') return 'The loop is closed: all three lights now have a road home to GND.';
    if (s.place.startsWith('gw-')) return `Ground wire in: <b>${n(P.a)}</b> to the blue − rail. The short leg has its road home.`;
    return `Signal wire in: pin <b>${n(P.a)}</b> to <b>${n(P.b)}</b>. Now the code can switch this light.`;
  }
  function undoPart(s) {
    delete st.build[s.place];
    st.helped.delete(s.id);
    st.done.delete(s.id); progress.save({ completedStepIds: [...st.done] });
    view.sync(st.build);
    saveBuild();
    go(step, { replay: true });
    UI.say(`Taken out. The ${s.holding} is back in your hand: place it again.`, true);
  }
  // after the loop is closed: each light's whole path glows in turn (an illustration, not a measurement)
  async function showAllPaths() {
    const t = kit.token;
    for (const ch of C.CHANNELS) {
      if (!kit.isCurrent(t)) return;
      kit.clearTemps();
      view.glowNodes(['T' + ch.col, 'B' + ch.col], 0xf2b705);
      view.glowNodes(['B' + (ch.col + 1), 'R:BN'], 0x2e3136);
      kit.callout(`${ch.name}: ${ch.pin.slice(5)} → resistor → LED → rail → GND`, kit.holeAt(ch.col, 'a'), 'gold', 40);
      await (kit.reduceMotion ? Promise.resolve() : kit.wait(1.6));
    }
    if (!kit.isCurrent(t)) return;
    kit.callout('Glowing paths are an illustration, not a measurement', kit.railAt(27, 'BN'), 'ground', 22);
  }

  /* ---------- the circuit checker report ---------- */
  const ICON = { ok: '✅', bad: '⚠️', danger: '⛔' };
  const DANGER = ['noResistor', 'short', 'pinFight', 'overvoltage'];
  function issueLines(code, refs, key, level) {
    const ch = C.CHANNELS.find((c) => c.key === key) || C.CHANNELS[0];
    return C.ISSUES[code](ctxFor(Object.assign({}, refs, { color: key || 'circuit', col: ch.col }))).slice(0, level);
  }
  function reportHtml(build, level) {
    const r = N.lessonCheck(build, C.PLAN);
    const nClosed = Object.values(r.closed).filter(Boolean).length;
    const rows = r.channels.map((c) => {
      const ch = C.CHANNELS.find((x) => x.key === c.key);
      const danger = c.issues.some((i) => DANGER.includes(i.code));
      const icon = c.ok ? ICON.ok : danger ? ICON.danger : ICON.bad;
      const body = c.ok ? `${ch.pin.slice(5)} → b${ch.col} → resistor → LED (i${ch.col}, i${ch.col + 1}) → j${ch.col + 1} → rail → GND`
        : c.issues.map((i) => `<div class="issue">${issueLines(i.code, i.refs, c.key, level).join(' ')}</div>`).join('');
      return `<li class="${c.ok ? 'ok' : danger ? 'danger' : 'bad'}"><b>${icon} ${ch.name} light (${ch.pin.slice(5)})</b><div>${body}</div></li>`;
    }).join('');
    // hazards that don't belong to one light (for example 3V3 wired to GND)
    const loose = r.hazards.filter((h) => h.kind !== 'noResistor' && !r.channels.some((c) => c.issues.some((i) => i.code === h.kind)));
    const extra = loose.map((h) => `<li class="danger"><b>${ICON.danger} Whole circuit</b><div>${issueLines(h.kind, h, null, level).join(' ')}</div></li>`).join('');
    const pred = N.predict(build, C.PLAN);
    const predHtml = pred ? `<table class="pred"><caption>With power on, what would each pin light?</caption><tr><th>Pin HIGH</th><th>Lights</th></tr>${pred.map((p) => `<tr><td>${p.high}</td><td>${p.lit.length ? p.lit.map((k) => k[0].toUpperCase() + k.slice(1)).join(' + ') : 'none (dark)'}</td></tr>`).join('')}</table>` : '';
    return { r, html: `<div class="report">
      <ul class="verdicts">
        <li class="${nClosed === 3 ? 'ok' : 'bad'}">${nClosed === 3 ? ICON.ok : ICON.bad} <b>Connected:</b> ${nClosed} of 3 lights have a closed loop</li>
        <li class="${r.channels.every((c) => c.ok) ? 'ok' : 'bad'}">${r.channels.every((c) => c.ok) ? ICON.ok : ICON.bad} <b>Matches the plan:</b> ${r.channels.filter((c) => c.ok).length} of 3 lights</li>
        <li class="${r.safe ? 'ok' : 'danger'}">${r.safe ? ICON.ok : ICON.danger} <b>Safe to plug in:</b> ${r.safe ? 'yes' : 'NO: the USB cable stays unplugged'}</li>
      </ul>
      <ol class="channels">${rows}${extra}</ol>${predHtml}</div>` };
  }
  // ring the holes and pins a report talks about (red for danger, orange for a mistake)
  function markIssues(r) {
    for (const c of r.channels) for (const i of c.issues) {
      const color = DANGER.includes(i.code) ? 0xd93b3b : 0xd9821a;
      for (const k of ['anode', 'cathode', 'wire', 'res', 'res2', 'end']) if (i.refs[k] && N.validEnd(i.refs[k])) view.markEnd(i.refs[k], color);
      // a wire on the wrong pin: ring that pin and name it (D26 sits right next to D27, easy to miss)
      for (const name of i.refs.found || []) { const p = kit.pinById(name); if (p) view.markEnd({ k: 'pin', id: p.id }, color, `${name}?`); }
    }
  }

  /* ---------- phase 3: the program runner and experiment mode share the build, the checker and the power gate ---------- */
  const saveProgram = () => progress.save({ program: st.program });
  const runner = window.VLabRunner.create({ UI, view, kit, N, C, K, S, st, saveProgram, plugIn: () => plugIn() });
  const exp = window.VLabExperiment.create({ UI, view, kit, N, C, st, saveBuild: () => saveBuild(), unplug: () => unplug(),
    reportHtml: (b, l) => reportHtml(b, l), markIssues: (r) => markIssues(r) });

  /* ---------- the steps ---------- */
  const HANDLERS = {
    welcome: {
      enter(s) {
        kit.kinds = allPoints();
        const links = C.PREREQS.map((p) => `<a href="${BASE}lessons/${p.slug}/index.html">${UI.esc(p.name)}</a>`).join(' · ');
        const resume = saved.currentStep > 0 && saved.currentStep <= LAST && !s.resumeShown;
        UI.task('Choose how you want to work', `
          <div class="mode-row" role="group" aria-label="How do you want to work?">
            <button type="button" class="btn mode" data-mode="guided" aria-pressed="${st.mode === 'guided'}">🌱 I’m new<span>Hints and “Why?” answers open for you</span></button>
            <button type="button" class="btn mode" data-mode="practice" aria-pressed="${st.mode === 'practice'}">⚡ Practise what I know<span>Fewer hints: same circuit, same checks</span></button>
          </div>
          ${resume ? `<button type="button" class="btn" id="resumeBtn">↪ Carry on from step ${saved.currentStep + 1}</button>` : ''}
          <p class="small">New to circuits? These come first: ${links}</p>`);
        if (st.mode) UI.taskDone();
        $('#taskBox').querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
          st.mode = b.dataset.mode;
          progress.save({ mode: st.mode });
          $('#taskBox').querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          complete('welcome', st.mode === 'guided' ? 'Great! I’ll open the “Why?” answers for you as we go.' : 'Great! Fewer hints, but the same careful checks.');
        }));
        const r = $('#resumeBtn');
        if (r) r.addEventListener('click', () => { s.resumeShown = true; go(saved.currentStep); });
      },
      onTap(hit) { describe(hit); },
    },

    'meet-kit': {
      enter(s) {
        kit.kinds = new Set();
        s.found = s.found || new Set(isDone('meet-kit') ? C.KIT_KINDS.map((k) => k.id) : []);
        const list = () => `<ul class="checklist">${C.KIT_KINDS.map((k) => `<li class="${s.found.has(k.id) ? 'ok' : ''}">${k.name}</li>`).join('')}</ul>`;
        s.list = list;
        UI.task(`Tap each kind of part (${s.found.size} of ${C.KIT_KINDS.length})`, list());
        if (isDone('meet-kit')) UI.taskDone();
      },
      onTap(hit, s) {
        if (!hit.part) { if (hit.point) describe(hit); return; }
        describe(hit);
        const kind = C.KIT_KINDS.find((k) => k.parts.includes(hit.part.part));
        if (!kind || isDone('meet-kit')) return;
        s.found.add(kind.id);
        $('#task b.t').textContent = `🎯 Tap each kind of part (${s.found.size} of ${C.KIT_KINDS.length})`;
        UI.taskBody(s.list());
        if (s.found.size === C.KIT_KINDS.length) complete('meet-kit', 'You’ve met the whole kit! Every part has a job in the circuit.');
      },
    },

    'hidden-strips': {
      enter(s) {
        kit.kinds = new Set(['hole', 'rail']);
        const T = s.target;
        s.tapped = new Set();
        s.phase = isDone('hidden-strips') ? 'done' : 'explore';
        if (s.phase === 'done') { UI.task(`Find a hole joined to ${T.r}${T.c}`); UI.taskDone(); }
        else UI.task('Tap 3 different holes', '<span class="count">0 of 3</span>');
        view.stripsDemo(); // plays again on Replay; tapping a hole stops it
      },
      onTap(hit, s) {
        kit.cancelAnimations(); // stop the demo: the learner is exploring now
        const p = hit.point, T = s.target;
        if (!p) { if (hit.part) { describe(hit); UI.say('Tap a <b>hole</b> on the breadboard to find its hidden strip.', false); } return; }
        if (s.phase === 'explore' || s.phase === 'done') {
          describe(hit);
          if (s.phase === 'done') return;
          s.tapped.add(p.kind === 'hole' ? `${p.r}${p.c}` : p.rail);
          UI.taskBody(`<span class="count">${Math.min(3, s.tapped.size)} of 3</span>`);
          if (s.tapped.size >= 3) {
            s.phase = 'challenge';
            UI.task(`Find a hole joined to ${T.r}${T.c}`, `Your red signal wire will go into <b>${T.r}${T.c}</b>. Which other holes share its strip?`);
            UI.say('You found the strips! Now a challenge…', true);
            kit.ring(kit.holeAt(T.c, T.r), 0xf2b705);
            kit.callout(`⭐ ${T.r}${T.c}`, kit.holeAt(T.c, 'a'), 'gold', 40);
          }
          return;
        }
        const star = `⭐ ${T.r}${T.c}`;
        if (p.kind === 'rail') { UI.say(`Rails run along the long edge and are only joined to themselves. Look in row ${T.c}, near the ${star}.`, false); return; }
        if (p.c === T.c && p.r === T.r) { UI.say(`That’s the ${star} hole itself. Find a <b>different</b> hole on the same strip.`, false); return; }
        if (p.c === T.c && view.half(p.r) !== view.half(T.r)) {
          UI.say(`So close! <b>${p.r}${p.c}</b> is across the middle gap. The gap splits row ${T.c} into two strips that are <b>not</b> joined.`, false);
          view.showHole(p.c, p.r);
          return;
        }
        if (p.c !== T.c) { UI.say(`That’s row ${p.c}. A strip is one numbered row of 5 holes, so look in row ${T.c}.`, false); return; }
        describe(hit);
        s.phase = 'done';
        complete('hidden-strips', `Yes! <b>${p.r}${p.c}</b> and <b>${T.r}${T.c}</b> share a strip, so anything in one is joined to the other. That’s how the resistor in d${T.c} will meet your signal wire.`);
      },
    },

    unplug: {
      enter(s) {
        kit.kinds = new Set();
        if (isDone('unplug')) { UI.task('Unplug the USB cable'); UI.taskDone(); return; }
        UI.task('Unplug the USB cable', 'Tap the USB cable, or use this button: <button type="button" class="btn" id="unplugBtn">🔌 Unplug the USB cable</button>');
        $('#unplugBtn').addEventListener('click', () => this.onTap({ part: { part: 'usb', obj: null } }, s));
      },
      onTap(hit) {
        if (hit.part && hit.part.part === 'usb' && !isDone('unplug')) {
          view.setPlugged(false);
          const b = $('#unplugBtn'); if (b) { b.disabled = true; b.textContent = '✓ Unplugged'; }
          describe(hit);
          complete('unplug', 'Unplugged! The red power light on the ESP32 went out: nothing has power now, so it’s safe to build.');
          return;
        }
        describe(hit);
        if (!isDone('unplug') && hit.part) UI.say('That’s not the USB cable. It’s the black cable plugged into the end of the ESP32.', false);
      },
    },

    inspect: {
      enter(s) {
        kit.kinds = allPoints();
        s.level = 1; s.mistake = null;
        UI.task('Run the circuit checker', '<button type="button" class="btn primary" id="checkBtn">🔍 Check my circuit</button>');
        if (isDone('inspect')) UI.taskDone();
        $('#checkBtn').addEventListener('click', () => this.check(s));
        if (isDone('inspect')) this.check(s, true);
      },
      check(s, quiet) {
        view.sync(st.build); s.mistake = null;
        kit.clearTemps();
        const { r, html } = reportHtml(st.build, 3);
        $('#extraBox').innerHTML = html + this.doctorHtml();
        this.wireDoctor(s);
        if (r.ok) {
          showAllPaths();
          if (!quiet) complete('inspect', 'All three lights pass: every path is closed, wired to the right pin, with its own resistor, and nothing is dangerous. Ready for power!');
        } else {
          markIssues(r);
          UI.say('The checker found something to fix before power can go in. Read the report below.', false);
        }
      },
      doctorHtml() {
        return `<details class="doctor" id="doctor"><summary>🩺 Circuit doctor: try a pretend mistake</summary>
          <p class="small">Pick a mistake. The bench shows it, and the checker tells you what it finds. Your own circuit is safe: “Put my circuit back” returns it.</p>
          <div class="mistakes">${C.MISTAKES.map((m) => `<button type="button" class="btn small-btn" data-mistake="${m.id}">${UI.esc(m.label)}</button>`).join('')}</div>
          <div id="doctorOut" role="status" aria-live="polite"></div></details>`;
      },
      wireDoctor(s) {
        $('#doctor').addEventListener('click', (e) => {
          const b = e.target.closest('[data-mistake]');
          if (b) { s.mistake = b.dataset.mistake; s.level = 1; this.showMistake(s); return; }
          if (e.target.closest('#moreHint')) { s.level = Math.min(3, s.level + 1); this.showMistake(s); return; }
          if (e.target.closest('#restoreBtn')) { s.mistake = null; view.sync(st.build); kit.clearTemps(); $('#doctorOut').innerHTML = ''; UI.say('Your own circuit is back on the bench.', true); }
        });
      },
      showMistake(s) {
        const b = C.withMistake(s.mistake);
        view.sync(b); kit.clearTemps();
        const { r, html } = reportHtml(b, s.level);
        markIssues(r);
        const m = C.MISTAKES.find((x) => x.id === s.mistake);
        $('#doctorOut').innerHTML = `<h4>Pretend mistake: ${UI.esc(m.label)}</h4>${html}
          <div class="btn-row">${s.level < 3 ? '<button type="button" class="btn small-btn" id="moreHint">💡 Another hint</button>' : ''}<button type="button" class="btn small-btn" id="restoreBtn">↩ Put my circuit back</button></div>`;
        // wide screens: the guide scrolls on its own, so bring the doctor's answer to the top of it
        const sc = $('#scroll');
        if (getComputedStyle(sc).overflowY === 'auto') sc.scrollTop += $('#doctorOut').getBoundingClientRect().top - sc.getBoundingClientRect().top - 8;
        UI.say(r.safe ? `The checker caught it: ${r.channels.filter((c) => !c.ok).map((c) => c.key).join(', ')} light${r.channels.filter((c) => !c.ok).length > 1 ? 's' : ''} would not work as planned.`
          : '⛔ The checker caught a <b>dangerous</b> mistake: this circuit must not get power.', false);
      },
      leave() { view.sync(st.build); },
    },

    'plug-in': {
      enter(s) {
        kit.kinds = new Set();
        s.pins = {}; s.tested = s.tested || new Set();
        if (isDone('plug-in')) { view.setPlugged(true); this.tester(s); UI.taskDone(); return; }
        view.setPlugged(false); // power only ever goes in through plug(), after the safety check
        UI.task('Plug in the USB cable', 'Tap the USB cable, or: <button type="button" class="btn primary" id="plugBtn">🔌 Plug in the USB cable</button>');
        $('#plugBtn').addEventListener('click', () => this.plug(s));
      },
      onTap(hit, s) {
        if (hit.part && hit.part.part === 'usb' && !view.plugged) { this.plug(s); return; }
        describe(hit);
      },
      // the only way power goes in: the safety check must pass first
      plug(s) { if (plugIn()) this.tester(s); },
      // a pretend pin switch: set D25, D26, D27 HIGH or LOW and see what the wiring really does
      tester(s) {
        const btns = C.CHANNELS.map((ch) => { const n = ch.pin.slice(5); const on = s.pins[n] === 'high';
          return `<button type="button" class="btn pinbtn" data-pin="${n}" aria-pressed="${on}">${n} <span>${on ? 'HIGH' : 'LOW'}</span></button>`; }).join('');
        UI.task(`Switch each pin HIGH once (${Math.min(3, s.tested.size)} of 3)`, `<div class="pinrow" role="group" aria-label="Pretend pin switches">${btns}</div>
          <p class="small">A pretend switch for each pin. In the next steps your code does this: <code>value(1)</code> is HIGH, <code>value(0)</code> is LOW.</p>`);
        if (isDone('plug-in')) UI.taskDone();
        $('#taskBox').querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', () => {
          const n = b.dataset.pin;
          s.pins[n] = s.pins[n] === 'high' ? 'low' : 'high';
          if (s.pins[n] === 'high') s.tested.add(n);
          this.apply(s, n);
          this.tester(s);
          if (s.tested.size === 3 && !isDone('plug-in')) complete('plug-in', 'Every pin switches its own light, and only its own. Your circuit is ready for code!');
        }));
      },
      apply(s, changed) {
        const pins = {}; C.CHANNELS.forEach((ch) => { const n = ch.pin.slice(5); pins[n] = s.pins[n] || 'low'; });
        const res = N.ledStates(st.build, { powered: view.plugged, pins });
        view.setLeds(Object.fromEntries(Object.entries(res).map(([id, v]) => [id, v.level])));
        if (!changed) return;
        const ch = C.CHANNELS.find((c) => c.pin.endsWith(':' + changed));
        const led = res['led-' + ch.key];
        UI.say(pins[changed] === 'high'
          ? (led && led.level ? `${changed} is HIGH: current flows ${changed} → resistor → ${ch.name.toLowerCase()} LED → GND, so the <b>${ch.name.toLowerCase()} light is on</b>.` : `${changed} is HIGH, but the ${ch.name.toLowerCase()} LED stays dark: ${led ? led.reason : 'no LED'}.`)
          : `${changed} is LOW: no push, so the ${ch.name.toLowerCase()} light is off.`, true);
      },
      leave(s) { s.pins = {}; view.setLeds({}); },
    },

    'read-code': {
      enter(s) {
        kit.kinds = allPoints();
        const need = ['import', 'pin', 'loop', 'set', 'sleep'];
        const names = { import: 'an import line', pin: 'a Pin(…) line', loop: 'while True:', set: 'a value() line', sleep: 'a time.sleep() line' };
        s.seen = s.seen || new Set(isDone('read-code') ? need : []);
        const show = () => { UI.task(`Tap each kind of line (${s.seen.size} of 5)`, `<ul class="checklist">${need.map((k) => `<li class="${s.seen.has(k) ? 'ok' : ''}">${names[k]}</li>`).join('')}</ul>`); if (isDone('read-code')) UI.taskDone(); };
        show();
        mountCode();
        s.off = runner.on((ev) => {
          if (ev.type !== 'line') return;
          explainLine(ev.line);
          if (need.includes(ev.line.kind) && !s.seen.has(ev.line.kind)) {
            s.seen.add(ev.line.kind); show();
            if (s.seen.size === need.length && !isDone('read-code')) complete('read-code', 'You can read the whole program now! Next: run it.');
          }
        });
      },
      leave(s) { if (s.off) s.off(); },
    },

    run: {
      enter(s) {
        kit.kinds = allPoints();
        s.chk = s.chk || (isDone('run') ? { run: 1, cycle: 1, pause: 1, step: 1 } : {});
        const items = [['run', '▶ Run the program'], ['cycle', 'Watch a whole cycle: red → green → yellow'], ['pause', '⏸ Pause it'], ['step', '⏭ Step one line']];
        const show = () => { UI.task('Run it, then take control', `<ul class="checklist">${items.map(([k, t]) => `<li class="${s.chk[k] ? 'ok' : ''}">${t}</li>`).join('')}</ul>`); if (isDone('run')) UI.taskDone(); };
        const mark = (k) => { if (s.chk[k]) return; s.chk[k] = 1; show(); if (items.every(([x]) => s.chk[x]) && !isDone('run')) complete('run', 'You ran your traffic light, paused it and stepped through it. The code, the pins and the lights always agree.'); };
        show();
        mountCode({ experiment: true });
        s.off = runner.on((ev) => {
          if (ev.type === 'run') mark('run'); else if (ev.type === 'pause') mark('pause'); else if (ev.type === 'step') mark('step');
          else if (ev.type === 'tick' && ev.state.cycles >= 1 && !s.chk.cycle) {
            if (N.lessonCheck(st.build, C.PLAN).ok) { UI.say(`One full cycle: ${runner.gen.phases.map((p) => `${p.say.split(':')[0]} ${K.fmt(p.s)} s`).join(', ')} = ${K.fmt(runner.gen.cycle)} s. Then it starts again, forever.`, true); mark('cycle'); }
            else UI.say('The program ran a whole cycle, but your wiring doesn’t match the plan, so the lights didn’t all do their job. Fix the wiring, then run again.', false);
          }
        });
      },
      leave(s) { if (s.off) s.off(); },
    },

    'fix-it': {
      enter(s) {
        kit.kinds = allPoints();
        mountCode({ experiment: false });
        const host = document.createElement('div'); $('#extraBox').appendChild(host);
        const nextId = C.WORKSHOP.find((id) => !st.solved.has(id));
        if (!nextId) {
          UI.task('Fix all three faults'); UI.taskDone();
          UI.taskBody(`<span class="small">Fixed: ${C.WORKSHOP.length} of ${C.WORKSHOP.length}. Now it’s your turn: make your own mistakes below, predict what will happen, then plug in and run.</span>`);
          exp.mount(host);
          return;
        }
        const n = C.WORKSHOP.indexOf(nextId) + 1;
        UI.task(`Round ${n} of ${C.WORKSHOP.length}: find the fault and fix it`, '<span class="small">Tip: plug in and press ▶ Run to see what the fault does, or read the checker. A dangerous fault can’t be plugged in at all.</span>');
        // the fault goes onto a temporary copy of the circuit (power off); the learner's own build is kept safe
        if (view.plugged) unplug();
        startWorkshop(nextId);
        UI.say('🔧 This is a copy of your circuit with one fault. Your own circuit is kept safe and comes back when you finish or leave.', true);
        exp.mount(host, { round: { id: nextId, n, total: C.WORKSHOP.length, onSolved: (helped) => {
          st.solved.add(nextId); if (helped) st.helpedErrors.add(nextId);
          progress.save({ solvedErrors: [...st.solved], helpedErrors: [...st.helpedErrors] });
          const m = C.MISTAKES.find((x) => x.id === nextId);
          setTimeout(() => { if (cur() === s && st.workshop && st.workshop.id === nextId) { endWorkshop(); exp.render(); } }, 1500); // let them see the fixed copy first (only THIS round's copy: a quick “Next fault” may have started the next one)
          if (C.WORKSHOP.every((id) => st.solved.has(id))) { complete('fix-it', `🔧 Fixed: <b>${UI.esc(m.label)}</b>. All three faults repaired${helped ? ' (one with help)' : ''}! You debugged like an engineer. Your own circuit is back on the bench.`); $('#nextBtn').focus(); }
          else { UI.say(`🔧 Fixed! The fault was: <b>${UI.esc(m.label)}</b>. The checker agrees: every light matches the plan. Your own circuit is back on the bench.`, true);
            UI.taskBody('<button type="button" class="btn primary" id="nextRound">Next fault →</button>'); $('#nextRound').addEventListener('click', () => go(step, { replay: true }));
            $('#nextRound').focus(); } // keyboard users land on the next action instead of far down the page
        } } });
      },
      // leaving the workshop (Back, Next, another step) always puts the learner's own circuit back
      leave() { endWorkshop(); },
    },

    'make-yours': {
      enter(s) {
        kit.kinds = allPoints();
        s.ranAfter = s.ranAfter || isDone('make-yours'); s.predicted = s.predicted || isDone('make-yours');
        const host = document.createElement('div'); host.className = 'yours'; $('#extraBox').appendChild(host);
        mountCode({ experiment: true });
        const changed = () => JSON.stringify(st.program) !== JSON.stringify(K.DEFAULT());
        const show = () => {
          UI.task('Change it, predict, then test it', `<ul class="checklist"><li class="${changed() ? 'ok' : ''}">Change a time or the pattern</li><li class="${s.predicted ? 'ok' : ''}">Predict how long one cycle takes</li><li class="${s.ranAfter ? 'ok' : ''}">Run your new program for a whole cycle</li></ul>`);
          if (isDone('make-yours')) UI.taskDone();
        };
        const check = () => { show(); if (changed() && s.predicted && s.ranAfter && !isDone('make-yours')) complete('make-yours', 'Your own traffic light: changed, predicted and tested. That’s how engineers try ideas!'); };
        const render = () => { host.innerHTML = yoursHtml(s); };
        render(); show();
        host.addEventListener('click', (e) => {
          const b = e.target.closest('[data-y]'); if (!b) return;
          const p = JSON.parse(JSON.stringify(st.program)), a = b.dataset.y;
          if (a === 'pattern') { const pat = b.dataset.v; p.pattern = pat; p.vars = pat === 'custom' ? {} : { ...K.PATTERNS[pat].vars }; }
          else if (a === 'dec' || a === 'inc') { const k = b.dataset.v, [lo, hi, d] = K.LIMITS[k]; p.vars[k] = Math.min(hi, Math.max(lo, +(p.vars[k] + (a === 'inc' ? d : -d)).toFixed(2))); }
          else if (a === 'ph-light') { const ph = p.custom[+b.dataset.i], k = b.dataset.v; ph.on = ph.on.includes(k) ? ph.on.filter((x) => x !== k) : ph.on.concat(k); }
          else if (a === 'ph-dec' || a === 'ph-inc') { const ph = p.custom[+b.dataset.i], [lo, hi, d] = K.LIMITS.custom; ph.s = Math.min(hi, Math.max(lo, ph.s + (a === 'ph-inc' ? d : -d))); }
          else if (a === 'ph-add' && p.custom.length < K.MAX_CUSTOM) p.custom.push({ on: [], s: 1 });
          else if (a === 'ph-del' && p.custom.length > 1) p.custom.splice(+b.dataset.i, 1);
          else if (a === 'guess') {
            const right = Number(b.dataset.v) === runner.gen.cycle;
            if (right) { s.predicted = true; s.guessFor = JSON.stringify(st.program); UI.say(`Yes! ${runner.gen.phases.map((x) => K.fmt(x.s)).join(' + ')} = <b>${K.fmt(runner.gen.cycle)} s</b>. Now press ▶ Run and watch one whole cycle.`, true); }
            else UI.say('Not quite. Add up the time of every phase in the loop: each <code>time.sleep()</code> once.', false);
            render(); check(); return;
          } else return;
          runner.setProgram(p);
          s.ranAfter = false; if (s.guessFor !== JSON.stringify(st.program)) s.predicted = false;
          render(); check();
          const v = runner.gen.valid;
          if (!v.ok) UI.say(`⛔ Phase ${v.problems[0].phase + 1} turns red and green on together. A real traffic light must never do that: drivers wouldn’t know whether to stop or go. The program won’t run until you change it.`, false);
          else UI.say('Changed! The code on the right changed too. Predict the new cycle, then run it.', true);
        });
        s.off = runner.on((ev) => { if (ev.type === 'tick' && ev.state.cycles >= 1 && changed() && !s.ranAfter) { s.ranAfter = true; check(); UI.say(`That’s one whole cycle of your own program: ${K.fmt(runner.gen.cycle)} s.`, true); } });
      },
      leave(s) { if (s.off) s.off(); },
    },

    quiz: {
      enter(s) {
        kit.kinds = new Set();
        s.tries = s.tries || {};
        const host = document.createElement('div'); $('#extraBox').appendChild(host); // a fresh box each visit: no doubled listeners
        const show = () => {
          host.innerHTML = C.QUIZ.map((q, i) => `<div class="qcard" data-q="${q.id}"><p><b>${i + 1}. ${UI.esc(q.q)}</b></p><div class="opts">${q.opts.map((o, j) => `<button type="button" class="opt-btn${st.quizCorrect.has(q.id) && j === q.right ? ' right' : ''}" data-a="${j}"${st.quizCorrect.has(q.id) ? ' disabled' : ''}>${UI.esc(o)}</button>`).join('')}</div><div class="qfb" role="status">${st.quizCorrect.has(q.id) ? `<div class="feedback good">${q.why}</div>` : ''}</div></div>`).join('') + summaryHtml();
          UI.task(`Answer all three (${st.quizCorrect.size} of 3)`); if (isDone('quiz')) UI.taskDone();
        };
        show();
        host.addEventListener('click', (e) => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          const card = b.closest('[data-q]'), q = C.QUIZ.find((x) => x.id === card.dataset.q);
          s.tries[q.id] = (s.tries[q.id] || 0) + 1;
          if (Number(b.dataset.a) === q.right) {
            st.quizCorrect.add(q.id); if (s.tries[q.id] === 1) st.quizFirst.add(q.id);
            progress.save({ quizCorrect: [...st.quizCorrect], quizFirst: [...st.quizFirst] });
            show();
            if (st.quizCorrect.size === C.QUIZ.length && !isDone('quiz')) { complete('quiz', '🎉 Lab complete! Scroll down for your summary.'); show(); }
          } else { b.classList.add('wrong'); card.querySelector('.qfb').innerHTML = `<div class="feedback try">Not quite. ${q.hint}</div>`; }
        });
      },
    },
  };
  for (const s of PLACE) HANDLERS[s.id] = placeHandler();

  /* ---------- phase 3 helpers: the code panel, the "make it yours" controls, the summary ---------- */
  function mountCode(o) {
    const host = document.createElement('div'); $('#extraBox').appendChild(host);
    runner.mount(host);
    if (o && o.experiment) {
      const box = document.createElement('div'); $('#extraBox').appendChild(box);
      box.innerHTML = '<button type="button" class="btn small-btn" id="expToggle">🧪 Experiment with the wiring</button><div id="expHost"></div>';
      $('#expToggle').addEventListener('click', () => {
        if (exp.active) { exp.unmount(); $('#expHost').innerHTML = ''; $('#expToggle').textContent = '🧪 Experiment with the wiring'; kit.clearTemps(); return; }
        const h = document.createElement('div'); $('#expHost').appendChild(h); exp.mount(h); $('#expToggle').textContent = '✕ Close experiment mode';
      });
    }
  }
  function explainLine(l) {
    kit.clearTemps();
    UI.inspect(`Line ${l.n}: <code>${UI.esc(l.text.trim())}</code>`, [K.LINE_HELP[l.kind] ? K.LINE_HELP[l.kind](l) : 'A blank line keeps the code easy to read.']);
    if (l.light) {
      const L = K.LIGHTS.find((x) => x.key === l.light);
      view.markEnd({ k: 'pin', id: 'near:' + L.pin }, 0xf2b705, L.pin);
      const led = Object.values(st.build).find((p) => p.type === 'led' && p.color === l.light);
      if (led) view.markEnd(led.a, 0xf2b705, `${l.light} LED`);
    }
  }
  function yoursHtml(s) {
    const p = st.program, gen = runner.gen;
    const pats = [...Object.entries(K.PATTERNS).map(([k, v]) => [k, v.name]), ['custom', 'My own pattern']];
    const steppers = p.pattern === 'custom' ? '' : Object.keys(p.vars).map((k) => `<div class="stepper"><code>${k}</code><button type="button" class="btn small-btn" data-y="dec" data-v="${k}" aria-label="Less ${k}">−</button><output>${K.fmt(p.vars[k])} s</output><button type="button" class="btn small-btn" data-y="inc" data-v="${k}" aria-label="More ${k}">+</button></div>`).join('');
    const custom = p.pattern !== 'custom' ? '' : `<div class="phases">${p.custom.map((ph, i) => `<div class="phase"><b>Phase ${i + 1}</b>${K.LIGHTS.map((l) => `<button type="button" class="lightbtn ${l.key}" data-y="ph-light" data-i="${i}" data-v="${l.key}" aria-pressed="${ph.on.includes(l.key)}">${l.key}</button>`).join('')}
      <span class="stepper"><button type="button" class="btn small-btn" data-y="ph-dec" data-i="${i}" aria-label="Shorter phase ${i + 1}">−</button><output>${K.fmt(ph.s)} s</output><button type="button" class="btn small-btn" data-y="ph-inc" data-i="${i}" aria-label="Longer phase ${i + 1}">+</button></span>
      ${p.custom.length > 1 ? `<button type="button" class="linkbtn" data-y="ph-del" data-i="${i}">remove</button>` : ''}</div>`).join('')}
      ${p.custom.length < K.MAX_CUSTOM ? '<button type="button" class="btn small-btn" data-y="ph-add">＋ Add a phase</button>' : ''}</div>`;
    const c = gen.cycle, guesses = [...new Set([c, c + (c > 4 ? 2 : 1), Math.max(0.5, c - (c > 4 ? 3 : 0.5)), gen.phases[0].s])].filter((x) => x > 0).slice(0, 3).sort((a, b) => a - b);
    return `<div class="yourbox"><div class="pattern" role="radiogroup" aria-label="Light pattern">${pats.map(([k, n]) => `<button type="button" class="btn small-btn" role="radio" aria-checked="${p.pattern === k}" data-y="pattern" data-v="${k}">${n}</button>`).join('')}</div>
      ${steppers ? `<div class="steppers">${steppers}</div>` : custom}
      ${gen.valid.ok ? '' : '<p class="feedback try">⛔ Red and green together is not allowed: change that phase.</p>'}
      <div class="guess"><p><b>Predict:</b> one full cycle of this program takes…</p><div class="btn-row">${guesses.map((g) => `<button type="button" class="btn small-btn${s.predicted && g === c ? ' on' : ''}" data-y="guess" data-v="${g}">${K.fmt(g)} s</button>`).join('')}</div></div></div>`;
  }
  // The completion summary: what was learned, what was done alone and what with help (help is fine; it is just shown
  // honestly), and where to go next. Nothing here leaves this browser.
  function summaryHtml() {
    if (!isDone('quiz')) return '';
    const built = PLACE.filter((x) => isDone(x.id)), helped = built.filter((x) => st.helped.has(x.id)).length;
    const fixed = C.WORKSHOP.filter((id) => st.solved.has(id)), fixedHelp = fixed.filter((id) => st.helpedErrors.has(id)).length;
    const changed = JSON.stringify(st.program) !== JSON.stringify(K.DEFAULT());
    const tick = (ok) => (ok ? '✅' : '⬜');
    const skills = [
      [built.length === PLACE.length, 'Wired three LEDs, each with its own 330 Ω resistor, the right way round'],
      [isDone('inspect') && isDone('plug-in'), 'Checked the circuit before power, then powered it safely'],
      [isDone('read-code'), 'Read a MicroPython program line by line: Pin(), value(), while True, time.sleep()'],
      [isDone('run'), 'Ran, paused and stepped the program, watching pins and lights'],
      [isDone('fix-it'), 'Found and fixed faults in a circuit (debugging)'],
      [isDone('make-yours'), 'Changed the timing and predicted what would happen'],
    ];
    const quiz = C.QUIZ.map((q, i) => `<li>${st.quizFirst.has(q.id) ? '⭐ first try' : '✅ after a hint'}: question ${i + 1}</li>`).join('');
    // the next lesson: Lesson 1 if they haven't built it for real yet, otherwise the one after it (read from the course list)
    let next = { href: `${BASE}lessons/01-traffic-light/index.html`, name: 'Lesson 1: My First Traffic Light', why: 'Build this circuit on a real breadboard and run the code on a real ESP32 (it has a “Try it on my real board” panel).' };
    try {
      const Cs = window.COURSE, p = Cs.readProgress()['01-traffic-light'];
      const n = p && p.done ? Cs.nextLesson('01-traffic-light') : null;
      if (n) next = { href: `${BASE}lessons/${n.slug}/index.html`, name: `${Cs.name(n)}: ${n.title}`, why: n.idea };
    } catch (e) { /* the course list isn't available: keep Lesson 1 */ }
    return `<div class="done-card" id="quizDone"><h3>🎉 Circuit Challenge Lab: complete!</h3>
      <h4>Skills</h4><ul class="checklist plain">${skills.map(([ok, t]) => `<li>${tick(ok)} ${t}</li>`).join('')}</ul>
      <table class="pred summary"><caption>What you did</caption><tr><th></th><th>On your own</th><th>With help</th></tr>
        <tr><td>Building: parts placed</td><td>${built.length - helped} of ${PLACE.length}</td><td>${helped}</td></tr>
        <tr><td>Code: lines explored, run, timing</td><td>${[isDone('read-code'), isDone('run'), isDone('make-yours') && changed].filter(Boolean).length} of 3</td><td>0</td></tr>
        <tr><td>Repairs: faults fixed</td><td>${fixed.length - fixedHelp} of ${C.WORKSHOP.length}</td><td>${fixedHelp}</td></tr>
        <tr><td>Quiz: right answers</td><td>${st.quizFirst.size} of 3 first try</td><td>${C.QUIZ.length - st.quizFirst.size} after a hint</td></tr></table>
      <ul class="plain quizlist">${quiz}</ul>
      <p class="small">“With help” means you used “Do it for me” or “Fix it for me”. That’s fine: engineers ask for help too. Try those parts again on your own next time!</p>
      <h4>Next</h4><p><a class="btn primary" href="${next.href}">${UI.esc(next.name)} →</a></p><p class="small">${UI.esc(next.why || '')}</p>
      <p class="small">${UI.esc(C.SAFETY)}</p></div>`;
  }
  function plugIn() {
    const r = N.lessonCheck(st.build, C.PLAN);
    if (!r.safe) { UI.say('⛔ Not safe to plug in: the checker found a dangerous mistake (a short or a missing resistor). Fix it first, with the power off.', false); return false; }
    view.setPlugged(true);
    UI.say(r.ok ? 'Plugged in! The ESP32’s red power light is on. The LEDs stay dark: every pin starts LOW until code switches it on.'
      : 'Plugged in. It’s safe, but not every light matches the plan, so some lights won’t do what the code says.', r.ok);
    runner.update(true);
    return true;
  }
  function unplug() { runner.stop(); view.setPlugged(false); runner.update(true); }

  // After the last step built so far: say what's done and what comes next, honestly.
  // (every step is built now: the quiz step ends with the completion summary instead)
  function showStageEnd() {}

  function cur() { return STEPS[step]; }
  function canNext() { return step < LAST && isDone(cur().id); }
  function updateNav() {
    const done = isDone(cur().id);
    let label = 'Next →';
    if (!done) label = 'Do the task first';
    else if (step >= LAST) label = '🎉 Lab complete';
    UI.nav({ back: step > 0, next: canNext(), nextLabel: label });
  }
  function refreshProgress() { UI.progress(C, step, doneIds()); }
  function hand(text) { const h = $('#hand'); h.hidden = !text; h.textContent = text || ''; }

  function go(i, o = {}) {
    const h0 = HANDLERS[cur().id];
    if (h0 && h0.leave) h0.leave(cur());
    runner.unmount(); exp.unmount();
    kit.cancelAnimations(); kit.clearTemps(); kit.clearPoints(); view.settle(); hand(null);
    step = Math.max(0, Math.min(LAST, i));
    const s = cur(), h = HANDLERS[s.id];
    // never build with the power on: going back from "plugged in" unplugs first
    let unplugged = false;
    if (isDone('unplug') && step < idx('plug-in') && view.plugged) { view.setPlugged(false); unplugged = true; }
    $('#eyebrow').textContent = C.STAGES[C.stageOf(s)].name;
    $('#stepTitle').textContent = s.title;
    // in the code steps the "Why?" starts closed: every code line can be tapped for its own explanation, and the code stays in view
    // In the code steps the "Why?" cards go below the code, so the code sits right beside the bench without scrolling.
    const codeStep = ['code', 'run', 'fixit', 'yours'].includes(s.task);
    const cards = `${s.why ? UI.why(s.why.q, s.why.a, st.mode !== 'practice' && !codeStep) : ''}${s.wrong ? UI.wrong(s.wrong) : ''}`;
    // new maker words for this step, as tappable chips from the course word book (one or two at a time)
    const words = (s.words || []).filter((k) => E && E.WORDS[k]);
    $('#stepText').innerHTML = `<p>${s.text}</p>${s.hint ? `<p class="small">${s.hint}</p>` : ''}${words.length ? `<p class="words">New word${words.length > 1 ? 's' : ''}: ${words.map(chip).join(' ')}</p>` : ''}${codeStep ? '' : cards}`;
    $('#taskBox').innerHTML = ''; UI.clearFeedback(); UI.clearInspect(); $('#extraBox').innerHTML = '';
    if (s.cam) view.fly(s.cam, o.instant);
    if (h && h.enter) h.enter.call(h, s, o);
    if (codeStep && cards) $('#extraBox').insertAdjacentHTML('beforeend', `<div class="cards">${cards}</div>`);
    showStageEnd();
    refreshProgress(); updateNav();
    $('#scroll').scrollTop = 0;
    if (!o.instant && !o.replay) $('#stepTitle').focus({ preventScroll: true });
    // phones: the Next button is at the bottom of the page, far below the bench. Bring the bench back into view and put
    // the step's instruction on the card over it, so building never needs scrolling back and forth.
    if (UI.isNarrow() && !o.instant) {
      UI.tip(`<b>${s.title}</b> ${s.text}`, 'info');
      const v = $('.viewport').getBoundingClientRect();
      if (v.top < 0 || v.top > window.innerHeight * 0.4) $('.viewport').scrollIntoView({ block: 'start', behavior: kit.reduceMotion ? 'auto' : 'smooth' });
    }
    if (unplugged) UI.say('I unplugged the USB cable for you: never change a circuit while it has power.', true);
    // opening the lab shows the welcome step but keeps the place to carry on from (and the course's record of it)
    if (!o.boot) { progress.save({ currentStep: step }); courseSave({ step }); }
    stopTalking();
    if (readToMe.checked) listen();
  }
  // The kit picks the nearest pin within 18–30 px, and from far away the pins are only a few pixels apart, so almost
  // any tap on the ESP32 would land on some pin. A tap on the board counts as a pin only when it is right on the pin:
  // within half the gap to the next pin on screen (at most 12 px). Zoomed out, you get the board; zoomed in, the pin.
  function preferBoardOverFarPin(hit) {
    const p = hit.point;
    if (!p || p.kind !== 'pin' || !hit.part || hit.part.part !== 'controller' || hit.x == null) return hit;
    const pin = kit.pinById(p.id), next = kit.PINS.find((q) => q.side === pin.side && Math.abs(q.k - pin.k) === 1);
    const r = kit.renderer.domElement.getBoundingClientRect();
    const a = view.screenOf({ pin: pin.id }), b = view.screenOf({ pin: next.id });
    const reach = Math.min(12, Math.hypot(a.x - b.x, a.y - b.y) / 2);
    return Math.hypot(a.x - r.left - hit.x, a.y - r.top - hit.y) > reach ? Object.assign({}, hit, { point: null }) : hit;
  }
  function tap(hit) {
    const s = cur(), h = HANDLERS[s.id]; hit = preferBoardOverFarPin(hit);
    if (exp.active && exp.onTap(hit)) return;
    if (h && h.onTap) h.onTap.call(h, hit, s); else describe(hit);
  }
  kit.onTap = tap;
  UI.buildPicker(kit, C, N, tap); // keyboard users pick from lists; it works exactly like a tap

  kit.onHover = (t) => {
    const hint = $('#vhint');
    if (!t || t.kind === 'custom') hint.textContent = DEFAULT_HINT;
    else hint.textContent = t.kind === 'hole' ? `Hole ${t.r}${t.c} · row ${t.c}, ${view.half(t.r) === 'far' ? 'above' : 'below'} the gap`
      : t.kind === 'rail' ? view.RAILS[t.rail].name : `Pin ${t.name}`;
  };
  const DEFAULT_HINT = $('#vhint').textContent;

  /* ---------- buttons ---------- */
  $('#prevBtn').addEventListener('click', () => go(step - 1));
  $('#nextBtn').addEventListener('click', () => { if (canNext()) go(step + 1); });
  $('#replayBtn').addEventListener('click', () => go(step, { replay: true }));
  $('#resetView').addEventListener('click', () => { const s = cur(); if (s.cam) view.fly(s.cam); else if (s.home) s.home(); });
  const labelsBtn = $('#labelsBtn');
  labelsBtn.addEventListener('click', () => {
    kit.labelsOn = !kit.labelsOn;
    labelsBtn.setAttribute('aria-pressed', String(kit.labelsOn));
  });
  // Reset Lab asks twice (no pop-up dialogs), then forgets only this lab's progress
  const resetBtn = $('#resetLab');
  let armed = 0;
  resetBtn.addEventListener('click', () => {
    if (Date.now() > armed) { armed = Date.now() + 4000; resetBtn.textContent = '⚠️ Tap again to start over'; setTimeout(() => { if (Date.now() > armed) resetBtn.textContent = '⟲ Reset lab'; }, 4100); return; }
    armed = 0; resetBtn.textContent = '⟲ Reset lab';
    progress.reset();
    Object.assign(saved, window.VLabProgress.fresh());
    runner.unmount(); exp.unmount();
    st.workshop = null; st.own = null;
    st.mode = null; st.done.clear(); st.helped.clear(); st.build = {};
    st.solved.clear(); st.helpedErrors.clear(); st.quizCorrect.clear(); st.quizFirst.clear();
    runner.setProgram(K.DEFAULT());
    STEPS.forEach((x) => { ['found', 'resumeShown', 'tested', 'seen', 'chk', 'ranAfter', 'predicted', 'guessFor', 'tries'].forEach((k) => delete x[k]); });
    view.sync(st.build);
    view.setPlugged(true);
    if (window.COURSE && window.COURSE.forgetExtra) window.COURSE.forgetExtra(COURSE_ID); // only this lab's own entry
    go(0, { boot: true });
    UI.say('Lab reset. Your progress in this lab was cleared; other lessons are untouched.', true);
  });

  // Read aloud, the same way as the narrated lessons: Officer Ohm's recorded voice when there is a recording of exactly
  // these words (assets/voice/voice.js), otherwise the browser's voice. The title and text are joined exactly as the
  // lessons join them, "Read every step to me" is the course's shared choice (kk-read-to-me), and changing step stops
  // the last line before the next one starts, so two voices never overlap.
  const listenBtn = $('#listenBtn'), readToMe = $('#readToMe');
  const spoken = (s) => s.title + (/[.!?]$/.test(s.title) ? ' ' : '. ') + s.text;
  try { readToMe.checked = localStorage.getItem('kk-read-to-me') === '1'; } catch (e) { /* no storage: off */ }
  readToMe.addEventListener('change', () => { try { localStorage.setItem('kk-read-to-me', readToMe.checked ? '1' : '0'); } catch (e) { /* fine */ } if (readToMe.checked) listen(); else stopTalking(); });
  function setListening(on) { listenBtn.setAttribute('aria-pressed', String(on)); listenBtn.textContent = on ? '■ Stop' : '🔊 Listen'; }
  function stopTalking() { if (window.KKVoice) KKVoice.stop(); setListening(false); }
  function listen() { if (!window.KKVoice) return; const s = cur(); setListening(true); KKVoice.say(spoken(s), { base: BASE, onend: () => setListening(false) }); }
  listenBtn.addEventListener('click', () => (listenBtn.getAttribute('aria-pressed') === 'true' ? stopTalking() : listen()));
  if (!window.KKVoice) { listenBtn.hidden = true; readToMe.closest('label').hidden = true; }
  if (isDone(STEPS[LAST].id)) courseSave({ step: LAST, done: true }); // finished before the course knew about the lab

  if (!progress.available) UI.say('Your browser isn’t letting this page save, so the lab won’t remember where you got to. Everything else works.', false);
  if (window.innerWidth < 600) kit.labelsOn = true;
  go(0, { instant: true, boot: true });

  // for automated tests (tools/check.sh calls goTo)
  window.__lesson = {
    goTo: (i) => go(i, { instant: true }), get step() { return step; }, STEPS, LAST, kit, view, N, K, runner, exp,
    screenOf: view.screenOf, counts: view.counts, tap, progress, state: st, idx,
    done: (id) => { st.done.add(id); progress.complete(id); updateNav(); refreshProgress(); },
    // put the planned parts for every building step before `id` on the board (to start a test mid-way)
    buildUpTo: (id) => { for (const s of PLACE) { if (s.id === id) break; st.build[s.place] = JSON.parse(JSON.stringify(CANON[s.place])); } view.sync(st.build); saveBuild(); refreshProgress(); updateNav(); },
    check: () => N.lessonCheck(st.build, C.PLAN),
  };
})();
