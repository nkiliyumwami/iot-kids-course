/* "Try it on my real board" for lesson pages: a button in the lesson header opens a panel with THIS lesson's
   program already in it, plus Connect / Run / Stop / Board messages (assets/run-panel.js) and Prepare my board.
   Usage, after board-link.js, prepare-board.js and run-panel.js:
     KKBoard.attach({ id: '01-traffic-light', base: '../../', program: () => '…python…', wiring: 'Wire D25, D26, D27 like this lesson.' })
   The panel stays alive while the page is open, so the board stays connected between openings. */
(function () {
  'use strict';
  const CSS = `
.kkb-open{display:inline-flex;align-items:center;gap:6px;border:2px solid #0A7480;background:#0A7480;color:#fff;border-radius:999px;padding:6px 14px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(10,116,128,.25);white-space:nowrap}
.kkb-open:hover{background:#075A63}
.progress .kkb-open{margin-left:10px;padding:5px 12px;font-size:13px}
.kkb-back{position:fixed;inset:0;z-index:60;background:rgba(21,32,42,.45);display:flex;justify-content:flex-end}
.kkb-back[hidden]{display:none!important}
.kkb{background:#fff;width:min(620px,100%);height:100%;overflow:auto;padding:16px 18px;box-shadow:-12px 0 40px rgba(21,32,42,.25);font-family:'Nunito','Segoe UI',system-ui,sans-serif;color:#15202A;display:grid;gap:12px;align-content:start}
.kkb-top{display:flex;justify-content:space-between;align-items:start;gap:10px}
.kkb-top h2{font-family:'Baloo 2','Trebuchet MS',sans-serif;font-size:24px;line-height:1.1;margin:0}
.kkb-top p{margin:2px 0 0;color:#526170;font-size:14px}
.kkb-x{border:0;background:#F1F5F8;border-radius:50%;width:36px;height:36px;font-weight:800;cursor:pointer;flex:none}
.kkb-steps{margin:0;padding-left:20px;font-size:14px}.kkb-steps li{margin:2px 0}
.kkb-wire{background:#FFF6D6;border-left:5px solid #F2B705;border-radius:12px;padding:8px 12px;font-size:14px}
.kkb-reset{border:1px solid #D2DCE3;background:#fff;border-radius:999px;padding:4px 12px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;justify-self:start}`;

  function attach(opts) {
    if (!window.RunPanel || !window.BoardLink) return;
    if (!document.getElementById('kkb-css')) { const st = document.createElement('style'); st.id = 'kkb-css'; st.textContent = CSS; document.head.appendChild(st); }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'kkb-open'; btn.innerHTML = '🔌 Try it on my real board';
    btn.title = 'Run this lesson’s program on your own ESP32 (Chrome or Edge on a computer)';
    const host = document.querySelector(opts.buttonHost || 'header.top') || document.body;
    host.appendChild(btn);

    const back = document.createElement('div');
    back.className = 'kkb-back'; back.hidden = true;
    back.innerHTML = `<aside class="kkb" role="dialog" aria-modal="true" aria-labelledby="kkbTitle">
      <div class="kkb-top"><div><h2 id="kkbTitle">🔌 Run it on my real board</h2><p>The same program as in this lesson, running on your own ESP32.</p></div>
        <button type="button" class="kkb-x" aria-label="Close">✕</button></div>
      <ol class="kkb-steps"><li>Plug your ESP32 into the computer with a USB <b>data</b> cable.</li>
        <li><b>Connect my board</b>, then <b>▶ Run on my ESP32</b>. Change a number and run it again!</li>
        <li>First time? <b>🧰 Prepare my board</b> installs MicroPython once (about 2 minutes).</li></ol>
      ${opts.wiring ? `<div class="kkb-wire">🔧 <b>Wiring:</b> ${opts.wiring} Only change wires while the board is <b>unplugged</b>, and ask an adult to check.</div>` : ''}
      <button type="button" class="kkb-reset">↺ Put the lesson’s program back</button>
      <section data-panel></section></aside>`;
    document.body.appendChild(back);
    let panel = null;
    const program = () => { try { return String(opts.program() || ''); } catch (e) { return ''; } };
    function open() {
      back.hidden = false;
      back.querySelector('.kkb').scrollTop = 0;
      if (!panel) panel = window.RunPanel.mount(back.querySelector('[data-panel]'), { id: 'lesson-' + opts.id, base: opts.base || '', code: program(), fresh: true });
      else if (!panel.edited) panel.setCode(program()); // follow the lesson (e.g. a changed slider) until the child edits
      back.querySelector('.kkb-x').focus();
    }
    function close() { back.hidden = true; btn.focus(); }
    btn.addEventListener('click', open);
    back.querySelector('.kkb-x').addEventListener('click', close);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !back.hidden && !document.querySelector('.pb-back')) close(); });
    back.querySelector('.kkb-reset').addEventListener('click', () => { if (panel) { panel.setCode(program()); panel.edited = false; } });
    back.addEventListener('input', (e) => { if (panel && e.target.matches('[data-r="code"]')) panel.edited = true; });
    return { open, close };
  }
  window.KKBoard = { attach };
})();
