/* Virtual Traffic Light Lab: the guide panel. Small helpers that write into the page (no 3D here).
   All text passed in is the lab's own; anything that could come from outside goes through esc(). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // feedback after an action: good (green) or try again (orange). Read out by screen readers (role=status).
  function say(html, good) {
    const d = document.createElement('div');
    d.className = 'feedback ' + (good ? 'good' : 'try');
    d.innerHTML = html;
    $('#fbBox').replaceChildren(d);
    tip(html, good ? 'good' : 'try');
  }

  /* ---------- phones: a small card over the bottom of the 3D view repeats the latest message, so learners don't have
     to scroll away from the circuit to read it. It never covers more than about a third of the view and can be closed.
     On phones it is the live region (the panel copies go quiet), so screen readers hear each message once. ---------- */
  const narrow = window.matchMedia ? window.matchMedia('(max-width: 860px)') : { matches: false, addEventListener() {} };
  function liveRegions() {
    const phone = narrow.matches;
    $('#fbBox').setAttribute('aria-live', phone ? 'off' : 'polite');
    $('#inspectBox').setAttribute('aria-live', phone ? 'off' : 'polite');
    $('#tip').setAttribute('aria-live', phone ? 'polite' : 'off');
  }
  function tip(html, tone) {
    const t = $('#tip'); if (!t) return;
    $('#tipText').innerHTML = html;
    t.className = 'tip ' + tone;
    t.hidden = false;
  }
  function initTip() {
    if (!$('#tip')) return;
    liveRegions();
    if (narrow.addEventListener) narrow.addEventListener('change', liveRegions);
    $('#tipClose').addEventListener('click', () => { $('#tip').hidden = true; });
    $('#tipMore').addEventListener('click', () => {
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('#fbBox').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTip); else initTip();
  const clearFeedback = () => { $('#fbBox').replaceChildren(); const t = $('#tip'); if (t) t.hidden = true; };

  function task(title, body) { $('#taskBox').innerHTML = `<div class="task" id="task"><b class="t">🎯 ${title}</b>${body ? `<div id="taskBody">${body}</div>` : ''}</div>`; }
  function taskBody(html) { const b = $('#taskBody'); if (b) b.innerHTML = html; }
  function taskDone() { const t = $('#task'); if (t) t.classList.add('done'); }

  // a "Why?" card the learner can open and close; open at the start in guided mode
  const why = (q, a, open) => `<details class="why"${open ? ' open' : ''}><summary>Why? ${q}</summary><p>${a}</p></details>`;
  // what would go wrong otherwise: always closed at first, one tap to open
  const wrong = (a) => `<details class="why wrong"><summary>What goes wrong otherwise?</summary><p>${a}</p></details>`;

  // the "what is this?" card for whatever was tapped or picked
  function inspect(title, lines, chipHtml) {
    $('#inspectBox').innerHTML = `<div class="inspect"><div class="ihead">🔍 <b>${title}</b>${chipHtml ? ' ' + chipHtml : ''}</div>${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
    tip(`🔍 <b>${title}</b> ${lines[0]}`, 'info');
    // on wide screens the guide scrolls on its own: bring the card into view there (never scroll the whole page,
    // which on a phone would pull the 3D bench away from the learner's finger)
    const sc = $('#scroll');
    if (getComputedStyle(sc).overflowY === 'auto') {
      const below = $('#inspectBox').getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom;
      if (below > 0) sc.scrollTop += below + 8;
    }
  }
  const clearInspect = () => $('#inspectBox').replaceChildren();

  // progress: "Step 3 of 24", a bar, and one pill per stage (done, now, coming soon)
  function progress(C, step, doneIds) {
    const total = C.STEPS.length, stageNow = C.stageOf(C.STEPS[step]);
    $('#progressText').textContent = `Step ${step + 1} of ${total}`;
    $('#barFill').style.width = ((step + 1) / total * 100) + '%';
    $('#stages').innerHTML = C.STAGES.map((s, i) => {
      const steps = C.STEPS.filter((x) => x.stage === s.id);
      const ready = steps.some((x) => x.ready);
      const done = steps.every((x) => doneIds.includes(x.id));
      const cls = i === stageNow ? 'now' : done ? 'done' : ready ? '' : 'soon';
      const state = i === stageNow ? 'current stage' : done ? 'done' : ready ? '' : 'coming soon';
      return `<li class="${cls}"${i === stageNow ? ' aria-current="step"' : ''}><span aria-hidden="true">${done && i !== stageNow ? '✓' : s.icon}</span> <span class="nm">${esc(s.name)}</span>${state ? `<span class="sr"> (${state})</span>` : ''}</li>`;
    }).join('');
    $('#stageName').textContent = `Stage ${stageNow + 1} of ${C.STAGES.length}: ${C.STAGES[stageNow].name}`;
  }

  function nav(o) {
    $('#prevBtn').disabled = !o.back;
    const n = $('#nextBtn');
    n.disabled = !o.next;
    n.textContent = o.nextLabel;
  }

  /* ---------- keyboard pickers: every tap target can also be chosen from a list ---------- */
  function buildPicker(kit, C, N, onPick) {
    const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
    const cols = Array.from({ length: 30 }, (_, i) => i + 1);
    const rows = 'abcdefghij'.split('');
    const pins = kit.PINS.map((p) => opt(p.id, `${p.name} (${p.side === 'near' ? 'near' : 'far'} side)`)).join('');
    const parts = Object.keys(C.PARTS).map((k) => opt(k, C.PARTS[k].name)).join('');
    $('#pickerBody').innerHTML = `
      <div class="prow"><label for="pkPart">Part</label><select id="pkPart">${parts}</select><button type="button" class="btn small-btn" data-pick="part">Use</button></div>
      <div class="prow"><label for="pkRow">Hole</label><select id="pkRow" aria-label="Hole letter">${rows.map((r) => opt(r, r)).join('')}</select><select id="pkCol" aria-label="Hole number">${cols.map((c) => opt(c, c)).join('')}</select><button type="button" class="btn small-btn" data-pick="hole">Use</button></div>
      <div class="prow"><label for="pkPin">Pin</label><select id="pkPin">${pins}</select><button type="button" class="btn small-btn" data-pick="pin">Use</button></div>
      <div class="prow"><label for="pkRail">Rail</label><select id="pkRail">${Object.keys({ BN: 1, BP: 1, TN: 1, TP: 1 }).map((r) => opt(r, { BN: 'Blue − rail (near)', BP: 'Red + rail (near)', TN: 'Blue − rail (far)', TP: 'Red + rail (far)' }[r])).join('')}</select><select id="pkRailCol" aria-label="Rail hole number">${cols.filter(N.railHasCol).map((c) => opt(c, c)).join('')}</select><button type="button" class="btn small-btn" data-pick="rail">Use</button></div>`;
    $('#pkCol').value = '7'; $('#pkRow').value = 'b'; $('#pkPin').value = 'near:D25';
    $('#pickerBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const kind = b.dataset.pick;
      if (kind === 'part') onPick({ part: { part: $('#pkPart').value, obj: null }, point: null, keyboard: true });
      else if (kind === 'hole') onPick({ point: { kind: 'hole', c: Number($('#pkCol').value), r: $('#pkRow').value }, part: null, keyboard: true });
      else if (kind === 'pin') { const p = kit.pinById($('#pkPin').value); onPick({ point: { kind: 'pin', id: p.id, name: p.name, side: p.side }, part: null, keyboard: true }); }
      else onPick({ point: { kind: 'rail', rail: $('#pkRail').value, c: Number($('#pkRailCol').value) }, part: null, keyboard: true });
    });
  }

  window.VLabUI = { $, esc, tip, isNarrow: () => narrow.matches, say, clearFeedback, task, taskBody, taskDone, why, wrong, inspect, clearInspect, progress, nav, buildPicker };
})();
