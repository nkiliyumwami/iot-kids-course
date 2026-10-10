/* "Run on my ESP32" panel: Connect board · code editor · Run · Stop · Board messages.
   Usage:  RunPanel.mount(element, { code: '...', examples: [{ name, code }], pinsHref: 'pins.html' })
   Needs assets/board-link.js first. Works in Chrome or Edge on a computer; elsewhere it explains why not. */
(function () {
  'use strict';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const DRIVERS = {
    CH340: 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
    CP2102: 'https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers',
  };

  const CSS = `
.rp{--rp-accent:#0A7480;--rp-accent-d:#075A63;--rp-soft:#DAEEF0;--rp-line:#D2DCE3;--rp-muted:#526170;--rp-ink:#15202A;--rp-code:#13202A;--rp-code-ink:#E3ECF1;
  display:grid;gap:12px;font-family:'Nunito','Segoe UI',system-ui,sans-serif;color:var(--rp-ink)}
.rp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.rp-status{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:14px;padding:6px 12px;border-radius:999px;background:#F1F5F8;border:1px solid var(--rp-line)}
.rp-status i{width:10px;height:10px;border-radius:50%;background:#9AA6B0}
.rp-status.ok i{background:#2E9E57;box-shadow:0 0 0 4px rgba(46,158,87,.18)}.rp-status.run i{background:#F2B705;animation:rpPulse 1s infinite}.rp-status.warn i{background:#D9821A}
@keyframes rpPulse{50%{box-shadow:0 0 0 6px rgba(242,183,5,.25)}}
.rp-btn{display:inline-flex;align-items:center;gap:6px;border:2px solid var(--rp-line);background:#fff;border-radius:999px;padding:8px 16px;font:inherit;font-weight:800;cursor:pointer;color:var(--rp-ink)}
.rp-btn:hover:not(:disabled){border-color:var(--rp-accent)}
.rp-btn.primary{background:var(--rp-accent);border-color:var(--rp-accent);color:#fff;box-shadow:0 4px 12px rgba(10,116,128,.28)}
.rp-btn.primary:hover:not(:disabled){background:var(--rp-accent-d)}
.rp-btn.stop{background:#C93131;border-color:#C93131;color:#fff}
.rp-btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.rp-ml{margin-left:auto}
.rp-editor{display:grid;grid-template-columns:auto minmax(0,1fr);background:var(--rp-code);border-radius:14px;overflow:hidden;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.6}
.rp-gutter{padding:12px 8px 12px 12px;color:#6F8794;text-align:right;user-select:none;white-space:pre;overflow:hidden}
.rp-gutter .bad{color:#fff;background:#C93131;border-radius:4px;padding:0 3px}
.rp-editor textarea{border:0;outline:0;resize:vertical;min-height:220px;padding:12px;background:transparent;color:var(--rp-code-ink);font:inherit;line-height:inherit;white-space:pre;overflow:auto;tab-size:4}
.rp-editor:focus-within{outline:3px solid #F2B705;outline-offset:2px}
.rp-examples{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;color:var(--rp-muted);font-weight:700}
.rp-examples button{border:1px solid var(--rp-line);background:#fff;border-radius:999px;padding:3px 10px;font:inherit;font-weight:800;cursor:pointer}
.rp-msgs{display:grid;gap:8px;max-height:340px;overflow:auto;padding:2px}
.rp-msgs h4{margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--rp-muted)}
.rp-out{background:#0E1820;color:#CFE3EA;border-radius:10px;padding:8px 10px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;max-height:160px;overflow:auto}
.rp-card{border-radius:12px;padding:10px 12px;border-left:5px solid var(--rp-accent);background:var(--rp-soft)}
.rp-card.error{border-color:#C93131;background:#FDECEC}.rp-card.warn{border-color:#D9821A;background:#FFF1DF}.rp-card.good{border-color:#2E9E57;background:#E3F5EA}
.rp-card b{display:block;margin-bottom:2px}.rp-card p{margin:4px 0}.rp-card ul{margin:6px 0;padding-left:20px}.rp-card code{font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,.7);border-radius:5px;padding:0 4px}
.rp-card details{margin-top:6px}.rp-card summary{cursor:pointer;font-weight:800;font-size:13px}
.rp-card pre{margin:6px 0 0;background:#fff;border-radius:8px;padding:6px 8px;font-size:12px;white-space:pre-wrap}
.rp-card a{color:var(--rp-accent-d);font-weight:800}
.rp-mon pre{background:#0E1820;color:#CFE3EA;max-height:220px;overflow:auto}.rp-mon .rp-btn{padding:5px 10px;font-size:13px}.rp-hint{font-size:13px;color:var(--rp-muted)}.rp-card .rp-hint b{display:inline;margin:0}
`;

  function mount(root, opts) {
    opts = opts || {};
    if (!document.getElementById('rp-css')) { const s = document.createElement('style'); s.id = 'rp-css'; s.textContent = CSS; document.head.appendChild(s); }
    const BL = window.BoardLink;
    const link = new BL();
    root.classList.add('rp');
    root.innerHTML = `
      <div class="rp-bar">
        <span class="rp-status" data-r="status"><i></i><span>No board connected</span></span>
        <button type="button" class="rp-btn primary rp-ml" data-r="connect">🔌 Connect my board</button>
        <button type="button" class="rp-btn" data-r="disconnect" hidden>Disconnect</button>
        <button type="button" class="rp-btn" data-r="prepare" title="Install MicroPython on the board (once)">🧰 Prepare my board</button>
      </div>
      ${opts.examples && opts.examples.length ? `<div class="rp-examples">Examples: ${opts.examples.map((e, i) => `<button type="button" data-ex="${i}">${esc(e.name)}</button>`).join('')}</div>` : ''}
      <div class="rp-editor"><div class="rp-gutter" data-r="gutter" aria-hidden="true">1</div>
        <textarea data-r="code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Your MicroPython program"></textarea></div>
      <div class="rp-bar">
        <button type="button" class="rp-btn primary" data-r="run" disabled>▶ Run on my ESP32</button>
        <button type="button" class="rp-btn stop" data-r="stop" disabled>■ Stop</button>
        <span class="rp-ml" style="font-size:13px;color:var(--rp-muted);font-weight:700" data-r="hint">Connect your board to run your code on it.</span>
      </div>
      <div class="rp-msgs" aria-live="polite"><h4>Board messages</h4><div data-r="msgs"></div></div>`;
    const $ = (k) => root.querySelector(`[data-r="${k}"]`);
    const ta = $('code'), gutter = $('gutter'), msgs = $('msgs');
    ta.value = opts.code || '';
    let badLine = null, running = false, outEl = null;

    /* ---------- editor: line numbers, Tab = 4 spaces, keep the lesson's code saved on this device ---------- */
    const KEY = 'iotkids.code.' + (opts.id || location.pathname);
    try { const saved = localStorage.getItem(KEY); if (saved) ta.value = saved; } catch (e) { /* not remembered */ }
    function lines() {
      const n = ta.value.split('\n').length;
      gutter.innerHTML = Array.from({ length: n }, (_, i) => (i + 1 === badLine ? `<span class="bad">${i + 1}</span>` : String(i + 1))).join('\n');
      gutter.scrollTop = ta.scrollTop;
    }
    ta.addEventListener('input', () => { badLine = null; lines(); try { localStorage.setItem(KEY, ta.value); } catch (e) { /* ignore */ } });
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      if (e.key === 'Enter') { // keep the indent, and add 4 spaces after a colon
        const s = ta.selectionStart, before = ta.value.slice(0, s), cur = before.split('\n').pop();
        const ind = (cur.match(/^ */) || [''])[0] + (/:\s*$/.test(cur) ? '    ' : '');
        if (ind) { e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (!$('run').disabled) run(); }
    });
    lines();
    root.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
      if (running) return;
      ta.value = opts.examples[+b.dataset.ex].code; ta.dispatchEvent(new Event('input'));
    }));

    /* ---------- messages ---------- */
    function card(kind, html) {
      const d = document.createElement('div'); d.className = 'rp-card ' + kind; d.innerHTML = html;
      msgs.appendChild(d); d.scrollIntoView({ block: 'nearest' }); return d;
    }
    function clearMsgs() { msgs.innerHTML = ''; outEl = null; }
    function status(kind, text) { const s = $('status'); s.className = 'rp-status ' + (kind || ''); s.lastElementChild.textContent = text; }
    function buttons() {
      const ready = link.state === 'ready';
      $('connect').hidden = link.state !== 'disconnected';
      $('disconnect').hidden = link.state === 'disconnected';
      $('run').disabled = !ready || running;
      $('stop').disabled = !running;
      $('hint').textContent = running ? 'Your program is running on the board.' : ready ? 'Change the code, then press Run. (Ctrl+Enter works too.)' : 'Connect your board to run your code on it.';
    }
    link.addEventListener('state', (e) => { if (e.detail === 'connected') status('run', 'Talking to your board… (a few seconds)'); });
    link.addEventListener('disconnect', () => {
      running = false; status('warn', 'Board unplugged'); buttons();
      card('warn', '<b>The board was unplugged</b><p>Plug it back in and press <b>Connect my board</b> again.</p>');
    });

    if (!BL.supported()) {
      $('connect').disabled = true;
      status('warn', 'This browser can’t talk to boards');
      card('warn', `<b>Use Chrome or Edge on a computer</b><p>Sending code to a real board needs a feature only Chrome and Edge have on Windows, Mac, Linux and Chromebook.
        It doesn’t work on iPhone, iPad, Safari or Firefox. You can still do every lesson on screen!</p>`);
      return { link };
    }

    /* ---------- connect ---------- */
    const logBox = () => `<details class="rp-mon"><summary>🔧 Board monitor (for grown-ups): see exactly what the board sends</summary>
      <pre data-live>${esc(link.log.trim() || 'Nothing received from the board yet.')}</pre>
      <p style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="rp-btn" data-m="en">Restart board (EN)</button>
        <button type="button" class="rp-btn" data-m="cc">Send Ctrl-C</button>
        <button type="button" class="rp-btn" data-m="cr">Send Enter</button>
        <button type="button" class="rp-btn" data-m="cd">Soft reboot (Ctrl-D)</button>
        <button type="button" class="rp-btn" data-m="off">Lines DTR/RTS off</button>
        <button type="button" class="rp-btn" data-m="on">Lines DTR/RTS on</button>
        <button type="button" class="rp-btn primary" data-m="look">Look for MicroPython again</button></p>
      <p class="rp-hint">Tip: press the board’s <b>EN</b> button while watching. MicroPython prints a line starting with “MicroPython v…” and then <code>&gt;&gt;&gt;</code>.</p></details>`;
    function wireMonitor(c) {
      const pre = c.querySelector('[data-live]'); if (!pre) return;
      const tick = setInterval(() => {
        if (!document.body.contains(pre)) return clearInterval(tick);
        const t = link.log.trim() || 'Nothing received from the board yet.';
        if (pre.textContent !== t) { pre.textContent = t; pre.scrollTop = pre.scrollHeight; }
      }, 400);
      c.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', async () => {
        try {
          const m = b.dataset.m;
          if (m === 'en') await link.resetEN();
          else if (m === 'cc') await link.sendRaw('\x03');
          else if (m === 'cr') await link.sendRaw('\r\n');
          else if (m === 'cd') await link.sendRaw('\x04');
          else if (m === 'off') await link.setLines(false, false);
          else if (m === 'on') await link.setLines(true, true);
          else if (m === 'look') {
            b.disabled = true; b.textContent = 'Looking…';
            const ok = await link.retry();
            b.disabled = false; b.textContent = 'Look for MicroPython again';
            if (ok) { clearMsgs(); status('ok', `Connected · ${boardName()} · ${nice(link.version)}`); card('good', '<b>Found MicroPython! Your board is connected 🎉</b><p>Press <b>Run on my ESP32</b>.</p>'); buttons(); }
          }
        } catch (e) { link._note('Monitor action failed: ' + e.message); }
      }));
    }
    const boardName = () => (link.chip === 'serial port' ? 'COM port' : link.chip + ' board');
    function prepareCard(lead, offerPrepare) {
      const c = card('warn', `${lead}
        ${offerPrepare === false ? '' : '<p>If the board has no MicroPython, <b>Prepare my board</b> installs it (about a minute, once).</p>'}
        <p style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="rp-btn primary" data-again>↻ Try again</button>
        ${offerPrepare === false ? '' : '<button type="button" class="rp-btn" data-prep>🧰 Prepare my board</button>'}
        <button type="button" class="rp-btn" data-copy>📋 Copy details</button></p>${logBox()}`);
      c.querySelector('[data-again]').addEventListener('click', async () => { await link.release(); connect({ port: link.lastPort }); });
      const pr = c.querySelector('[data-prep]'); if (pr) pr.addEventListener('click', prepare);
      wireMonitor(c);
      c.querySelector('[data-copy]').addEventListener('click', (e) => {
        const t = `KundaKode board check\n${navigator.userAgent}\n${link.log}`;
        const done = () => { e.target.textContent = '✓ Copied'; };
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => {}); else done();
      });
    }
    async function connect(opts) {
      clearMsgs(); status('', 'Choose your board in the window that opens…');
      try {
        const r = await link.connect(opts || {});
        if (r.micropython) {
          status('ok', `Connected · ${boardName()}${r.version ? ' · ' + nice(r.version) : ''}`);
          card('good', `<b>Your board is connected! 🎉</b><p>Press <b>Run on my ESP32</b> to send your program to it.</p>`);
        } else {
          status('warn', `Connected · ${boardName()} · MicroPython not found`);
          if (r.reason === 'micropython-busy') prepareCard(`<b>MicroPython is on your board, but it didn’t answer in time</b><p>Press the <b>EN</b> button on the board, wait two seconds, then press <b>Try again</b>. If a program is running in a fast loop, this stops it.</p>`, false);
          else if (r.reason === 'other-program') prepareCard(`<b>Your board is running a different program</b><p>It’s talking, but not in Python: it probably has a program from Arduino, Schematik or another app on it.</p>`);
          else if (r.reason === 'download-mode') prepareCard(`<b>Your board is waiting to be programmed</b><p>Another tool left it in “download mode”. Press the <b>EN</b> button on the board and connect again, or prepare it with MicroPython now.</p>`);
          else prepareCard(`<b>Nothing came back from this port</b><p>An ESP32 with MicroPython always answers, so this is probably not your board, or the board is busy:</p>
            <ul><li>Close Thonny, Arduino IDE or a terminal that is connected to the board.</li>
            <li>Press the <b>EN</b> button on the board, then <b>Try again</b>.</li>
            <li>Still nothing? Unplug the board, plug it back in and connect again.</li></ul>`, false);
        }
      } catch (e) {
        status('', 'No board connected');
        if (e.code === 'cancelled') connectHelp();
        else if (e.code === 'not-usb') card('error', `<b>That port isn’t your board</b><p>It’s a built-in port of the computer (like <b>ttyS0</b> on Linux, or <b>COM1</b> / Bluetooth on Windows). Choose the one that says <b>USB</b>, <b>CH340</b> or <b>CP210x</b>.</p>`);
        else if (e.code === 'busy') card('error', `<b>Another program is using the board</b><p>Close Thonny, Arduino IDE, Schematik or any other tab that is connected to the board (only one program can use it at a time), then try again.</p>`);
        else card('error', `<b>We couldn’t open the board</b><p>Unplug it, plug it back in, and try again.</p><details><summary>Original message</summary><pre>${esc(e.message)}</pre></details>`);
      }
      buttons();
    }
    function prepare() {
      if (!window.PrepareBoard) { card('error', '<b>The installer didn’t load.</b> Reload the page and try again.'); return; }
      window.PrepareBoard.open({ link, base: opts.base || '', onDone: () => {
        clearMsgs();
        status('ok', `Connected · ${boardName()}${link.version ? ' · ' + nice(link.version) : ''}`);
        card('good', '<b>MicroPython is installed and your board is connected! 🎉</b><p>Press <b>Run on my ESP32</b>.</p>');
        buttons();
      } });
    }
    $('prepare').addEventListener('click', prepare);
    const nice = (v) => (v || '').replace(/^micropython\s*/i, 'MicroPython ').replace(/\s+esp32\S*$/i, '').trim();
    function connectHelp() {
      card('warn', `<b>Don’t see your board in the list?</b><ul>
        <li><b>Check the cable.</b> Some USB cables only charge and can’t carry data. Try another one.</li>
        <li><b>USB-C board?</b> Use a USB-A → USB-C cable (rectangular plug at the computer end). Some boards don’t start with a USB-C → USB-C cable.</li>
        <li>Is the board’s little <b>red light</b> on? If not, it isn’t getting power: try another USB socket.</li>
        <li>It may need a free driver for its USB chip: <a href="${DRIVERS.CH340}" target="_blank" rel="noopener">CH340</a> or
          <a href="${DRIVERS.CP2102}" target="_blank" rel="noopener">CP2102</a> (look at the small chip next to the USB socket). Ask an adult to install it.</li>
        <li>Close Thonny, Arduino IDE or Schematik if they are open: only one program can use the board at a time.</li>
        <li>Your board shows up as e.g. “USB-SERIAL CH340 (COM5)” on Windows or “USB Serial (ttyUSB0)” on Linux.</li></ul>
`);
    }
    $('connect').addEventListener('click', () => connect());
    $('disconnect').addEventListener('click', async () => { await link.disconnect(); running = false; status('', 'No board connected'); buttons(); });

    /* ---------- run / stop ---------- */
    async function run() {
      const code = ta.value;
      if (!code.trim()) { card('warn', '<b>There’s no code to run yet</b>'); return; }
      clearMsgs(); badLine = null; lines();
      running = true; status('run', 'Running on your board…'); buttons();
      outEl = null;
      const onOut = (text) => {
        if (!outEl) { outEl = document.createElement('div'); outEl.className = 'rp-out'; msgs.appendChild(outEl); }
        outEl.textContent += text.replace(/\r/g, '');
        if (outEl.textContent.length > 20000) outEl.textContent = outEl.textContent.slice(-15000);
        outEl.scrollTop = outEl.scrollHeight;
      };
      try {
        const r = await link.exec(code, { onOut });
        const x = BL.explain(r.err, code);
        if (!x) card('good', '<b>Your program finished ✓</b>');
        else if (x.kind === 'stopped') {
          card('', `<b>${x.title}</b><p>${x.help}</p>`);
          await lightsOff(code);
        } else {
          badLine = x.line; lines();
          card('error', `<b>${x.title}</b><p>${x.help}</p><details open><summary>The board’s original message</summary><pre>${esc(x.original)}</pre></details>`);
        }
      } catch (e) {
        if (e.code !== 'unplugged') card('error', `<b>The board stopped answering</b><p>Press the <b>EN</b> button on the board, then disconnect and connect again.</p><details><summary>Original message</summary><pre>${esc(e.message)}</pre></details>`);
      }
      running = false;
      if (link.state === 'ready') status('ok', `Connected · ${boardName()}${link.version ? ' · ' + nice(link.version) : ''}`);
      buttons();
    }
    // after Stop, switch off the pins the program used as outputs, so no light is left on
    async function lightsOff(code) {
      const pins = BL.outputPins(code);
      if (!pins.length || link.state !== 'ready') return;
      try { await link.exec(`from machine import Pin\nfor n in (${pins.join(', ')},):\n    Pin(n, Pin.OUT).value(0)`, { timeout: 3000 }); } catch (e) { /* not important */ }
    }
    $('run').addEventListener('click', run);
    $('stop').addEventListener('click', () => link.stop());
    buttons();
    return { link, run, stop: () => link.stop(), get code() { return ta.value; } };
  }

  window.RunPanel = { mount };
})();
