/* Virtual Traffic Light Lab: experiment mode (phase 3). Learners may wire things WRONG on purpose here: move any end to
   any hole or pin, flip an LED, take parts out, add parts. It edits the learner's own build, so the program then runs on
   exactly what they wired. The same circuit model (netlist.js) judges every change: connected? matches the plan? safe?
   An unsafe circuit is never powered. Hints come one level at a time; "Fix it for me" only after the third. */
(function () {
  'use strict';

  function create(ctx) {
    const { UI, view, kit, N, C, st } = ctx;
    const $ = UI.$;
    const CANON = C.canonicalParts();
    let host = null, sel = null, mode = 'select', moveEnd = null, addKind = null, first = null, level = 1, usedFix = false;
    let undo = [], round = null; // round: { id, n, total, onSolved }
    const label = (id) => { const p = st.build[id]; if (!p) return id;
      return p.type === 'led' ? `${p.color[0].toUpperCase()}${p.color.slice(1)} LED` : p.type === 'resistor' ? '330 Ω resistor'
        : `${p.color ? p.color[0].toUpperCase() + p.color.slice(1) : id.startsWith('sig-') ? id.slice(4).replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase()) : id.startsWith('res-') ? 'Purple' : 'Black'} wire`; };
    const ends = (p) => (p.type === 'led' ? `long leg ${N.endName(p.a)}, short leg ${N.endName(p.b)}` : `${N.endName(p.a)} → ${N.endName(p.b)}`);
    const toEnd = (p) => (p.kind === 'hole' ? { k: 'hole', c: p.c, r: p.r } : p.kind === 'rail' ? { k: 'rail', rail: p.rail, c: p.c } : p.kind === 'pin' ? { k: 'pin', id: p.id } : null);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function occupant(e, except) { for (const [id, p] of Object.entries(st.build)) if (id !== except) for (const x of [p.a, p.b]) if (x && same(x, e)) return id; return null; }
    // LED and resistor legs go into holes (breadboard or rail); only a jumper wire's end can go onto an ESP32 pin
    const fits = (type, e) => (type === 'wire' ? true : e.k !== 'pin');

    function change(fn, msg) {
      undo.push(JSON.stringify(st.build)); if (undo.length > 50) undo.shift();
      if (view.plugged) { ctx.unplug(); msg = 'I unplugged the USB cable first: never change a circuit with the power on. ' + (msg || ''); }
      fn();
      view.sync(st.build); ctx.saveBuild();
      kit.clearTemps();
      if (sel && st.build[sel]) markSel();
      if (msg) UI.say(msg, true);
      render();
      checkRound();
    }
    function newId(kind) {
      const prefer = kind.type === 'resistor' ? C.CHANNELS.map((c) => 'res-' + c.key) : kind.type === 'led' ? ['led-' + kind.color]
        : kind.color === 'black' ? C.CHANNELS.map((c) => 'gw-' + c.key).concat('gnd') : ['sig-' + kind.color];
      for (const id of prefer) if (!st.build[id]) return id;
      const stem = kind.type === 'resistor' ? 'res-x' : kind.type === 'led' ? 'led-' + kind.color : kind.color === 'black' ? 'gw-x' : 'sig-' + kind.color;
      for (let i = 2; ; i++) if (!st.build[stem + '-' + i]) return stem + '-' + i;
    }
    function markSel() { const p = st.build[sel]; [p.a, p.b].forEach((e) => { if (e) view.markEnd(e, 0xf2b705); }); } // the part's own tags already name its legs
    function select(id) { sel = id; mode = 'select'; kit.clearTemps(); if (id) markSel(); render(); if (id) UI.say(`Selected: <b>${label(id)}</b> (${ends(st.build[id])}).`, true); }

    // taps on the bench while experiment mode is open. Returns true when it used the tap.
    function onTap(hit) {
      if (!host) return false;
      const pt = hit.point ? toEnd(hit.point) : null;
      if (mode === 'move' && sel) {
        if (!pt) { UI.say('Tap a hole, a rail hole or a pin for this end.', false); return true; }
        const p = st.build[sel];
        if (!fits(p.type, pt)) { UI.say('An LED or resistor leg goes into a hole. Only a jumper wire can go onto an ESP32 pin.', false); return true; }
        const who = occupant(pt, sel); if (who) { UI.say(`${N.endName(pt)} already has the ${label(who)} in it. One end per hole!`, false); return true; }
        const which = moveEnd; mode = 'select';
        change(() => { st.build[sel] = Object.assign({}, p, { [which]: pt }); }, `Moved to <b>${N.endName(pt)}</b>. The checker below says what that does.`);
        return true;
      }
      if (mode === 'add' && addKind) {
        if (!pt) { UI.say('Tap a hole, a rail hole or a pin.', false); return true; }
        if (!fits(addKind.type, pt)) { UI.say('An LED or resistor leg goes into a hole. Only a jumper wire can go onto an ESP32 pin.', false); return true; }
        const who = occupant(pt); if (who) { UI.say(`${N.endName(pt)} already has the ${label(who)} in it.`, false); return true; }
        if (!first) { first = pt; kit.clearTemps(); view.markEnd(pt, 0x2e9e57); UI.say(`${addKind.type === 'led' ? 'Long leg' : 'First end'} in <b>${N.endName(pt)}</b>. Now tap where the ${addKind.type === 'led' ? 'short leg' : 'other end'} goes.`, true); return true; }
        if (same(first, pt)) return true;
        const id = newId(addKind), part = { type: addKind.type, a: first, b: pt };
        if (addKind.color) part.color = addKind.color;
        const k = addKind; first = null; addKind = null; mode = 'select'; sel = id;
        change(() => { st.build[id] = part; }, `Added the ${k.label}: ${ends(part)}.`);
        return true;
      }
      // select: tap a part, or one of the holes it sits in
      const id = (hit.part && hit.part.obj && hit.part.obj.userData.buildId) || (pt && occupant(pt));
      if (id) { select(id); return true; }
      return false;
    }

    /* ---------- the panel ---------- */
    const issueList = (r) => r.channels.flatMap((c) => c.issues.map((i) => ({ key: c.key, ...i })));
    function render() {
      if (!host) return;
      // redrawing replaces the controls: remember which one had keyboard focus and give it back afterwards
      const a = document.activeElement, keep = a && host.contains(a) ? (a.id ? '#' + a.id : a.dataset.x ? `[data-x="${a.dataset.x}"]` : null) : null;
      draw();
      const back = keep && host.querySelector(keep);
      if (back) back.focus();
    }
    function draw() {
      const p = sel && st.build[sel];
      const r = N.lessonCheck(st.build, C.PLAN);
      const issues = issueList(r);
      const parts = Object.keys(st.build).sort();
      host.innerHTML = `<div class="exp">
        <h4>🧪 Experiment mode</h4>
        ${round ? `<p class="round"><b>Round ${round.n} of ${round.total}:</b> one thing is wrong. Check, read the hints, then fix it yourself.</p>`
          : '<p class="small">Wire it any way you like, even wrong. The checker says what would really happen, and a dangerous circuit never gets power.</p>'}
        <div class="exprow"><label for="expSel">Part</label><select id="expSel"><option value="">Choose a part on the board…</option>${parts.map((id) => `<option value="${id}"${id === sel ? ' selected' : ''}>${UI.esc(label(id))} (${UI.esc(ends(st.build[id]))})</option>`).join('')}</select></div>
        ${p ? `<div class="btn-row">
          ${p.type === 'led' ? '<button type="button" class="btn small-btn" data-x="flip">↔ Flip the legs</button>' : ''}
          <button type="button" class="btn small-btn" data-x="move-a">✥ Move ${p.type === 'led' ? 'long leg' : 'end'} (${UI.esc(N.endName(p.a))})</button>
          ${p.b || p.type !== 'wire' ? `<button type="button" class="btn small-btn" data-x="move-b">✥ Move ${p.type === 'led' ? 'short leg' : 'other end'} (${UI.esc(N.endName(p.b))})</button>` : '<button type="button" class="btn small-btn" data-x="move-b">✥ Plug in the loose end</button>'}
          <button type="button" class="btn small-btn" data-x="remove">🗑 Take it out</button></div>` : '<p class="small">Tap a part on the board, or one of its holes, to choose it.</p>'}
        <div class="exprow"><label for="expAdd">Add</label><select id="expAdd">${C.ADD_KINDS.map((k) => `<option value="${k.id}">${UI.esc(k.label)}</option>`).join('')}</select><button type="button" class="btn small-btn" data-x="add">＋ Add</button></div>
        <div class="btn-row"><button type="button" class="btn small-btn" data-x="undo"${undo.length ? '' : ' disabled'}>↶ Undo</button>
          ${round ? '' : '<button type="button" class="btn small-btn" data-x="planned">⟲ Back to the planned circuit</button>'}</div>
        <div class="expstatus">${ctx.reportHtml(st.build, level).html}</div>
        ${issues.length ? `<div class="btn-row">${level < 3 ? '<button type="button" class="btn small-btn" data-x="hint">💡 Another hint</button>' : ''}
          ${level >= 3 ? '<button type="button" class="btn small-btn" data-x="showfix">👀 Show me the fix</button><button type="button" class="btn small-btn" data-x="fixit">✋ Fix it for me</button>' : ''}</div>` : ''}
      </div>`;
      ctx.markIssues(r);
      if (sel && st.build[sel]) markSel();
    }
    function onClick(e) {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const a = b.dataset.x, p = sel && st.build[sel];
      if (a === 'flip' && p) change(() => { st.build[sel] = Object.assign({}, p, { a: p.b, b: p.a }); }, `Flipped: the long leg is now in <b>${N.endName(p.b)}</b>.`);
      else if ((a === 'move-a' || a === 'move-b') && p) { mode = 'move'; moveEnd = a === 'move-a' ? 'a' : 'b'; UI.say(`Now tap the new hole${p.type === 'wire' ? ' or pin' : ''} for that end.`, true); }
      else if (a === 'remove' && p) { const id = sel; sel = null; change(() => { delete st.build[id]; }, `Took the ${label(id) || 'part'} out. It’s back in the tray.`); }
      else if (a === 'add') { addKind = C.ADD_KINDS.find((k) => k.id === $('#expAdd').value); first = null; mode = 'add'; sel = null; kit.clearTemps();
        UI.say(`Holding a ${addKind.label}. Tap where ${addKind.type === 'led' ? 'its long leg' : 'one end'} goes.`, true); }
      else if (a === 'undo' && undo.length) { const prev = undo.pop(); if (view.plugged) ctx.unplug(); st.build = JSON.parse(prev); view.sync(st.build); ctx.saveBuild(); sel = null; kit.clearTemps(); render(); UI.say('Undone.', true); checkRound(); }
      else if (a === 'planned') { if (b.dataset.armed) { change(() => { st.build = JSON.parse(JSON.stringify(CANON)); }, 'Back to the planned circuit.'); sel = null; render(); } else { b.dataset.armed = '1'; b.textContent = '⚠️ Tap again: undo all my experiments'; } }
      else if (a === 'hint') { level = Math.min(3, level + 1); render(); }
      else if (a === 'showfix') showFix();
      else if (a === 'fixit') fixForMe();
    }
    function fixTargets() {
      const r = N.lessonCheck(st.build, C.PLAN);
      return [...new Set(issueList(r).flatMap((i) => C.fixParts(i.code, i.key, i.refs)))];
    }
    function showFix() {
      kit.clearTemps();
      for (const id of fixTargets()) { const p = CANON[id]; [p.a, p.b].forEach((e, i) => view.markEnd(e, 0x2e9e57, `${id.startsWith('led') ? (i ? '− ' : '+ ') : ''}${N.endName(e)}`)); }
      UI.say('The green rings show where the planned parts go. Move or add them there yourself.', true);
    }
    function fixForMe() {
      const ids = fixTargets(); usedFix = true;
      change(() => {
        for (const id of ids) {
          const want = JSON.parse(JSON.stringify(CANON[id]));
          // anything else sitting in those holes comes out first (one end per hole)
          for (const e of [want.a, want.b]) { const who = occupant(e, id); if (who && !CANON[who]) delete st.build[who]; else if (who && who !== id) st.build[who] = JSON.parse(JSON.stringify(CANON[who])); }
          st.build[id] = want;
        }
      }, 'Fixed for you. Look at what changed on the board, so you can spot it next time.');
    }
    function checkRound() {
      if (!round) return;
      if (N.lessonCheck(st.build, C.PLAN).ok) { const r = round; round = null; level = 1; r.onSolved(usedFix); }
    }

    return {
      mount(el, opts) { host = el; sel = null; mode = 'select'; first = null; addKind = null; level = 1; undo = []; usedFix = false; round = (opts && opts.round) || null;
        el.addEventListener('click', onClick);
        el.addEventListener('change', (e) => { if (e.target.id === 'expSel') select(e.target.value || null); });
        render(); },
      unmount() { host = null; round = null; },
      onTap, render, select,
      get active() { return !!host; }, get selected() { return sel; }, get mode() { return mode; },
    };
  }

  window.VLabExperiment = { create };
})();
