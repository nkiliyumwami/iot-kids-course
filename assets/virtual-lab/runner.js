/* Virtual Traffic Light Lab: the code panel and the program runner (phase 3).
   One place turns the simulation's pin levels into everything the learner sees, so nothing can disagree:
   simulator.js (which line, which pin HIGH/LOW) → netlist.js (which LEDs that wiring really lights) → the 3D LEDs, the
   glowing current paths, the pin labels, the highlighted code line, the pin chips and the status card over the bench.
   This is a browser simulation of the program shown, not a MicroPython interpreter. */
(function () {
  'use strict';

  function create(ctx) {
    const { UI, view, kit, N, C, K, S, st } = ctx;
    const $ = UI.$;
    let gen = K.generate(st.program), sim = S.create(gen);
    let lastNow = performance.now(), lastKey = '', host = null;
    const listeners = new Set();
    const emit = (ev) => listeners.forEach((f) => f(ev));
    const PIN_OF = Object.fromEntries(K.LIGHTS.map((l) => [l.pin, l]));
    const CH = Object.fromEntries(C.CHANNELS.map((c) => [c.key, c]));

    /* ---------- can it run? power, a safe circuit and a safe program first ---------- */
    function canRun() {
      if (!view.plugged) return { ok: false, why: '🔌 Plug in the USB cable first. With no power, the ESP32 can’t run anything and every pin is dead.' };
      if (!N.isSafe(st.build)) return { ok: false, why: '⛔ Not safe to run: the circuit has a dangerous mistake (a short or a missing resistor). Unplug and fix it first.' };
      if (!gen.valid.ok) return { ok: false, why: '⛔ This pattern turns red and green on together. A real traffic light must never do that: drivers wouldn’t know whether to stop or go. Change that phase first.' };
      return { ok: true };
    }
    function run() {
      const c = canRun(); if (!c.ok) { UI.say(c.why, false); return false; }
      const resumed = sim.state().status === 'paused';
      sim.start(); lastNow = performance.now(); sim.tick(0); update(true);
      UI.say(resumed ? '▶ Carrying on from the same line.' : '▶ Running. Watch the highlighted line, the pins and the lights change together.', true);
      emit({ type: 'run' }); return true;
    }
    function pause() { sim.pause(); update(true); emit({ type: 'pause' }); }
    function step() { const c = canRun(); if (!c.ok) { UI.say(c.why, false); return false; } sim.step(); update(true); emit({ type: 'step' }); return true; }
    function stop() { sim.stop(); update(true); emit({ type: 'stop' }); }
    function setProgram(p) {
      st.program = K.cleanProgram(p);
      gen = K.generate(st.program); sim = S.create(gen);
      ctx.saveProgram();
      if (host) render();
      update(true); emit({ type: 'program' });
    }

    // real elapsed time drives the simulation (not the screen's frame rate); a long gap (a hidden tab) never fast-forwards
    kit.onFrame(() => {
      const now = performance.now(), dt = Math.min(0.5, (now - lastNow) / 1000); lastNow = now;
      if (sim.running) { sim.tick(dt); update(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && sim.running) { pause(); UI.say('⏸ Paused while you were away. Press ▶ Run to carry on.', true); } });

    /* ---------- one state → everything on screen ---------- */
    function update(force) {
      const s = sim.state();
      const pins = view.plugged && s.status !== 'stopped' ? s.pins : null; // no power, or stopped: no pin is driving
      const key = JSON.stringify([s.line, s.status, pins, view.plugged, Object.keys(st.build).length]);
      if (force || key !== lastKey) { lastKey = key; apply(s, pins); emit({ type: 'tick', state: s }); announce(s, pins); }
      hud(s, pins);
    }
    function apply(s, pins) {
      const leds = pins ? N.ledStates(st.build, { powered: view.plugged, pins }) : {};
      view.setLeds(Object.fromEntries(Object.entries(leds).map(([id, v]) => [id, v.level])));
      view.setPinStates(pins);
      // the glow shows where current flows for each lit LED: its colour on the pin side, dark on the way home
      const paths = [];
      for (const [id, v] of Object.entries(leds)) if (v.level > 0) {
        const p = N.pathNodes(st.build, id), led = st.build[id];
        const ch = CH[led.color];
        paths.push({ nodes: p.anode, color: ch ? ch.led : 0xf2b705 }, { nodes: p.cathode, color: 0x2e3136 });
      }
      view.setGlow(paths);
      if (!host) return;
      host.querySelectorAll('.code li').forEach((li) => li.classList.toggle('now', s.status !== 'stopped' && Number(li.dataset.n) === s.line));
      const now = host.querySelector('.code li.now');
      if (now) { // keep the running line in view inside the code box (never scroll the page)
        const box = host.querySelector('.code'), top = now.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
        if (top < box.scrollTop + 10 || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = top - box.clientHeight / 3;
      }
      host.querySelector('.pinchips').innerHTML = pinChips(pins, leds);
      const b = (sel, on) => { const x = host.querySelector(sel); if (x) x.disabled = !on; };
      b('[data-sim="run"]', s.status !== 'running'); b('[data-sim="pause"]', s.status === 'running');
      b('[data-sim="step"]', s.status !== 'running'); b('[data-sim="stop"]', s.status !== 'stopped');
      const run = host.querySelector('[data-sim="run"]'); if (run) run.textContent = s.status === 'paused' ? '▶ Resume' : '▶ Run';
      const plug = host.querySelector('[data-sim="plug"]'); if (plug) plug.textContent = view.plugged ? '🔌 Unplug' : '🔌 Plug in';
    }
    // two separate rows: what the PINS say (the code's side) and what the LIGHTS do (the wiring's side). With a wiring
    // mistake they disagree, and that is the lesson.
    // screen readers hear each phase change once (not every tick): "Red light: stop. D25 HIGH. Lights on: Red."
    let lastSaid = '';
    function announce(s, pins) {
      const live = $('#simLive'); if (!live) return;
      let msg = '';
      if (s.status === 'running' && s.phase != null && pins) {
        const leds = N.ledStates(st.build, { powered: view.plugged, pins });
        const on = K.LIGHTS.filter((l) => Object.entries(leds).some(([id, v]) => v.level > 0 && st.build[id] && st.build[id].color === l.key)).map((l) => l.key);
        msg = `${gen.phases[s.phase].say}. ${K.LIGHTS.filter((l) => pins[l.pin] === 'high').map((l) => l.pin + ' HIGH').join(', ') || 'All pins LOW'}. Lights on: ${on.length ? on.join(', ') : 'none'}.`;
      } else if (s.status === 'stopped') msg = 'Program stopped. All lights off.';
      else if (s.status === 'paused') msg = 'Paused.';
      if (msg && msg !== lastSaid) { lastSaid = msg; live.textContent = msg; }
    }
    function pinChips(pins, leds) {
      const pinRow = K.LIGHTS.map((l) => {
        const v = pins ? pins[l.pin] : null;
        const word = !view.plugged ? 'no power' : v === 'high' ? 'HIGH' : v === 'low' ? 'LOW' : 'off';
        return `<span class="chip ${v || 'off'}"><b>${l.pin}</b> ${word}</span>`;
      }).join('');
      const lightRow = K.LIGHTS.map((l) => {
        const led = Object.entries(leds).find(([id]) => st.build[id] && st.build[id].color === l.key);
        const on = led && led[1].level > 0;
        return `<span class="chip light ${on ? 'lit' : ''}"><span class="lamp ${on ? 'on ' + l.key : ''}" aria-hidden="true"></span>${l.key[0].toUpperCase() + l.key.slice(1)} ${on ? 'ON' : 'off'}</span>`;
      }).join('');
      return `<div class="chiprow"><span class="rowname">Pins</span>${pinRow}</div><div class="chiprow"><span class="rowname">Lights</span>${lightRow}</div>`;
    }
    // the status card over the bench: what the program is doing right now
    function hud(s, pins) {
      const h = $('#hud'); if (!h) return;
      if (!host || s.status === 'stopped') { h.hidden = true; return; }
      h.hidden = false;
      const ph = s.phase != null && gen.phases[s.phase];
      const left = s.sleepLeft != null ? ` · ${s.sleepLeft.toFixed(1)} s` : '';
      h.innerHTML = `<b>${s.status === 'running' ? '▶' : '⏸'} ${ph ? UI.esc(ph.say) : 'Starting'}</b>${left}<br><span class="small">line ${s.line} · ${K.LIGHTS.map((l) => `${l.pin} ${pins && pins[l.pin] === 'high' ? 'HIGH' : 'LOW'}`).join(' · ')}</span>`;
    }

    /* ---------- the code panel ---------- */
    const hl = (t) => UI.esc(t).replace(/(#.*$)|\b(from|import|while|True)\b|\b(Pin|value|sleep|OUT)\b|\b([A-Z]+_S)\b|\b(\d+(?:\.\d+)?)\b/g,
      (m, c, kw, fn, v, n) => (c ? `<span class="c">${c}</span>` : kw ? `<span class="k">${kw}</span>` : fn ? `<span class="f">${fn}</span>` : v ? `<span class="v">${v}</span>` : `<span class="n">${n}</span>`));
    function render() {
      host.innerHTML = `<div class="codebox">
        <div class="simbar" role="group" aria-label="Program controls">
          <button type="button" class="btn small-btn" data-sim="plug">🔌 Plug in</button>
          <button type="button" class="btn small-btn primary" data-sim="run">▶ Run</button>
          <button type="button" class="btn small-btn" data-sim="pause">⏸ Pause</button>
          <button type="button" class="btn small-btn" data-sim="step">⏭ Step</button>
          <button type="button" class="btn small-btn" data-sim="stop">⏹ Stop</button>
        </div>
        <div class="pinchips" aria-live="off"></div>
        <ol class="code" aria-label="MicroPython program">${gen.lines.map((l) => `<li data-n="${l.n}" class="${l.kind}">${l.kind === 'blank' ? '&nbsp;' : `<button type="button" class="cl" data-line="${l.n}">${hl(l.text)}</button>`}</li>`).join('')}</ol>
        <p class="small simnote">🧪 <b>Browser simulation</b> of this exact program: it follows these lines, it doesn’t run other MicroPython. On a real ESP32 the same code runs for real.
          <button type="button" class="linkbtn" data-sim="copy">📋 Copy the code</button></p>
      </div>`;
      host.querySelector('.simbar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sim]'); if (!b) return;
        const a = b.dataset.sim;
        if (a === 'run') run(); else if (a === 'pause') pause(); else if (a === 'step') step(); else if (a === 'stop') stop();
        else if (a === 'plug') { if (view.plugged) { stop(); view.setPlugged(false); UI.say('Unplugged: no power, so every pin is dead and the lights are off.', true); update(true); } else ctx.plugIn(); }
      });
      host.querySelector('[data-sim="copy"]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(gen.text); UI.say('Copied! Paste it into Thonny as main.py to run it on a real ESP32.', true); } catch (e) { UI.say('Your browser didn’t allow copying. You can select the code and copy it by hand.', false); }
      });
      host.querySelector('.code').addEventListener('click', (e) => { const b = e.target.closest('[data-line]'); if (b) emit({ type: 'line', line: gen.lines[Number(b.dataset.line) - 1] }); });
      update(true);
    }
    function mount(el) { host = el; render(); }
    function unmount() { host = null; stop(); }

    return { mount, unmount, run, pause, step, stop, setProgram, canRun, update,
      on: (f) => { listeners.add(f); return () => listeners.delete(f); },
      get gen() { return gen; }, get state() { return sim.state(); },
      tick: (sec) => { sim.tick(sec); update(true); } }; // for tests: move simulated time on
  }

  window.VLabRunner = { create };
})();
