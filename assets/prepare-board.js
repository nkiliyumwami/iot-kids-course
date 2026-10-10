/* "Prepare my board": installs MicroPython on an ESP32 DevKit V1 from the browser, the same way esptool, ESP Web Tools
   and Schematik flash boards. It talks to the ESP32's built-in bootloader, which every ESP32 has, so it works whatever
   program is on the board now. Uses Espressif's esptool-js (assets/vendor) and the official MicroPython firmware that
   .github/workflows/micropython-firmware.yml keeps in firmware/micropython/.
   Usage: PrepareBoard.open({ link, base: '' | '../../', onDone(port) }) */
(function () {
  'use strict';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const CSS = `
.pb-back{position:fixed;inset:0;z-index:70;background:rgba(21,32,42,.5);display:grid;place-items:center;padding:16px}
.pb{background:#fff;border-radius:20px;width:min(560px,100%);max-height:92vh;overflow:auto;padding:18px 20px;font-family:'Nunito','Segoe UI',system-ui,sans-serif;color:#15202A;box-shadow:0 24px 60px rgba(21,32,42,.3)}
.pb h2{font-family:'Baloo 2','Trebuchet MS',sans-serif;font-size:26px;line-height:1.1;margin:0 0 6px}
.pb p{margin:6px 0}.pb ul,.pb ol{margin:6px 0;padding-left:22px}.pb li{margin:3px 0}
.pb .top{display:flex;justify-content:space-between;align-items:start;gap:10px}
.pb .x{border:0;background:#F1F5F8;border-radius:50%;width:34px;height:34px;font-weight:800;cursor:pointer;flex:none}
.pb .warn{background:#FFF1DF;border-left:5px solid #D9821A;border-radius:12px;padding:8px 12px;margin:10px 0}
.pb .ok{background:#E3F5EA;border-left:5px solid #2E9E57;border-radius:12px;padding:8px 12px;margin:10px 0}
.pb .bad{background:#FDECEC;border-left:5px solid #C93131;border-radius:12px;padding:8px 12px;margin:10px 0}
.pb label{display:flex;gap:8px;align-items:start;font-weight:700;margin:10px 0}
.pb label input{width:20px;height:20px;margin-top:2px}
.pb .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.pb .btn{display:inline-flex;align-items:center;gap:6px;border:2px solid #D2DCE3;background:#fff;border-radius:999px;padding:9px 18px;font:inherit;font-weight:800;cursor:pointer;color:#15202A}
.pb .btn.primary{background:#0A7480;border-color:#0A7480;color:#fff}.pb .btn:disabled{opacity:.45;cursor:not-allowed}
.pb .steps{list-style:none;padding:0;display:grid;gap:6px;margin:12px 0}
.pb .steps li{display:flex;gap:10px;align-items:center;font-weight:700;color:#8A96A0}
.pb .steps li i{width:22px;height:22px;border-radius:50%;border:2px solid #D2DCE3;flex:none;display:grid;place-items:center;font-style:normal;font-size:13px}
.pb .steps li.now{color:#15202A}.pb .steps li.now i{border-color:#F2B705;animation:pbSpin 1s linear infinite;border-top-color:transparent}
.pb .steps li.fail{color:#C93131}.pb .steps li.fail i{border-color:#C93131;color:#C93131}.pb .steps li.fail i::before{content:'✕'}
.pb .steps li.done{color:#15202A}.pb .steps li.done i{background:#2E9E57;border-color:#2E9E57;color:#fff}.pb .steps li.done i::before{content:'✓'}
@keyframes pbSpin{to{transform:rotate(360deg)}}
.pb .bar{height:12px;border-radius:99px;background:#E3EBF0;overflow:hidden;margin:8px 0}.pb .bar b{display:block;height:100%;width:0;background:#0A7480;transition:width .2s}
.pb details{margin-top:10px;font-size:13px}.pb summary{cursor:pointer;font-weight:800}
.pb pre{background:#13202A;color:#E3ECF1;border-radius:10px;padding:8px 10px;font-size:11.5px;white-space:pre-wrap;max-height:180px;overflow:auto}
@media (prefers-reduced-motion: reduce){.pb .steps li.now i{animation:none}}`;

  function binaryString(buf) {
    const bytes = new Uint8Array(buf); let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return out;
  }

  function open(opts) {
    opts = opts || {};
    const base = opts.base || '';
    if (!document.getElementById('pb-css')) { const s = document.createElement('style'); s.id = 'pb-css'; s.textContent = CSS; document.head.appendChild(s); }
    const back = document.createElement('div');
    back.className = 'pb-back';
    back.innerHTML = `<div class="pb" role="dialog" aria-modal="true" aria-labelledby="pbTitle"><div data-v></div></div>`;
    document.body.appendChild(back);
    const view = back.querySelector('[data-v]');
    let busy = false, log = '';
    const close = () => { if (!busy) back.remove(); };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    const head = (title) => `<div class="top"><h2 id="pbTitle">${title}</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>`;
    const wire = () => view.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

    let fw = null;
    fetch(base + 'firmware/micropython/firmware.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { fw = j; intro(); }).catch(() => intro());

    function intro() {
      view.innerHTML = head('🧰 Prepare my board') + `
        <p>This installs <b>MicroPython</b>${fw ? ` ${esc(fw.version)}` : ''} on your ESP32: the software that lets it understand Python.
        You only need to do it <b>once</b>. It takes about a minute.</p>
        <div class="warn"><b>It erases the board.</b> Any program on it now (for example one from Arduino, Schematik or another app) will be removed.
        Your lessons and code in this browser are not affected.</div>
        <ol><li>Keep the USB cable plugged in the whole time.</li><li>Use Chrome or Edge on a computer.</li><li>Close Thonny, Arduino or other tabs that use the board.</li></ol>
        ${fw ? '' : `<div class="bad"><b>The MicroPython file isn’t on this site yet.</b> Please try again later.</div>`}
        <label><input type="checkbox" data-ok> An adult said it’s OK to erase and prepare this board.</label>
        <div class="row"><button type="button" class="btn primary" data-go disabled>Install MicroPython</button><button type="button" class="btn" data-close>Not now</button></div>`;
      wire();
      const ok = view.querySelector('[data-ok]'), go = view.querySelector('[data-go]');
      ok.addEventListener('change', () => { go.disabled = !ok.checked || !fw; });
      go.addEventListener('click', run);
    }

    const STEPS = ['Get the board ready', 'Talk to the board', 'Erase the old program', 'Install MicroPython', 'Restart and check'];
    function progressView() {
      view.innerHTML = head('🧰 Preparing your board…') + `<ol class="steps">${STEPS.map((s, i) => `<li data-s="${i}"><i></i>${s}</li>`).join('')}</ol>
        <div class="bar" aria-hidden="true"><b data-bar></b></div><p data-msg>Starting…</p>
        <div data-end></div><details><summary>Technical details (for grown-ups)</summary><pre data-log></pre></details>`;
      wire();
    }
    function step(i) { view.querySelectorAll('[data-s]').forEach((li) => { const n = +li.dataset.s; li.className = n < i ? 'done' : n === i ? 'now' : ''; }); }
    function msg(t) { const m = view.querySelector('[data-msg]'); if (m) m.textContent = t; }
    function bar(p) { const b = view.querySelector('[data-bar]'); if (b) b.style.width = Math.round(p * 100) + '%'; }
    function addLog(t) { log += t; const l = view.querySelector('[data-log]'); if (l) { l.textContent = log.slice(-8000); l.scrollTop = l.scrollHeight; } }
    const terminal = { clean() {}, writeLine: (d) => addLog(d + '\n'), write: (d) => addLog(d) };

    async function run() {
      busy = true; progressView(); step(0);
      let port = null, transport = null;
      try {
        // 1. get the port: reuse the connected one so the learner doesn't have to pick it again
        if (opts.link && (opts.link.port || opts.link.lastPort)) port = await opts.link.release();
        if (!port) {
          msg('Choose your board in the window that opens (for example “USB-SERIAL CH340 (COM5)” or “USB Serial (ttyUSB0)”).');
          port = await navigator.serial.requestPort({ filters: (window.BoardLink && window.BoardLink.FILTERS) || [] });
        }
        if (port.readable || port.writable) { try { await port.close(); } catch (e) { /* still open somewhere */ } }
        const info = port.getInfo ? port.getInfo() : {};
        if (info.usbVendorId == null) throw Object.assign(new Error('Not a USB port'), { code: 'not-usb' });
        addLog(`Port: USB vendor 0x${info.usbVendorId.toString(16)} product 0x${(info.usbProductId || 0).toString(16)}\n`);
        msg('Downloading MicroPython…');
        const [{ ESPLoader, Transport }, bin] = await Promise.all([
          import(new URL(base + 'assets/vendor/esptool-js-0.5.4.js', location.href).href),
          fetch(base + 'firmware/micropython/esp32-generic.bin').then((r) => { if (!r.ok) throw new Error('Firmware download failed (' + r.status + ')'); return r.arrayBuffer(); }),
        ]);
        addLog(`Firmware: ${fw.file} (${bin.byteLength} bytes)\n`);
        // 2. talk to the ESP32's bootloader (esptool-js pulses EN and BOOT through the USB chip's DTR/RTS lines)
        step(1); msg('Talking to the board…');
        transport = new Transport(port, false);
        const loader = new ESPLoader({ transport, baudrate: 460800, romBaudrate: 115200, terminal, debugLogging: false });
        let chip;
        // never wait forever: esptool tries several resets; give up after 45 s and show the BOOT-button help
        try { chip = await Promise.race([loader.main(), sleep(45000).then(() => { throw new Error('No answer from the bootloader after 45 s'); })]); }
        catch (e) {
          if (/open|InvalidState/i.test(e && e.message || '')) throw Object.assign(e, { code: 'busy' });
          throw Object.assign(e, { code: 'sync' });
        }
        addLog(`Chip: ${chip}\n`);
        if (!/^ESP32(?![-‑]?[SCHP]\d)/i.test(String(chip).trim()) || (loader.chip && loader.chip.CHIP_NAME && loader.chip.CHIP_NAME !== 'ESP32')) {
          throw Object.assign(new Error('This board is a ' + chip), { code: 'chip', chip });
        }
        // 3. erase
        step(2); msg('Erasing the old program… (about 10 seconds)'); bar(0.05);
        await loader.eraseFlash();
        // 4. write MicroPython at 0x1000, where the ESP32 looks for its bootloader
        step(3); msg('Installing MicroPython…');
        await loader.writeFlash({
          fileArray: [{ data: binaryString(bin), address: fw.address || 0x1000 }],
          flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep', eraseAll: false, compress: true,
          reportProgress: (_i, written, total) => { bar(0.1 + 0.85 * (written / total)); msg(`Installing MicroPython… ${Math.round(written / total * 100)}%`); },
        });
        // 5. restart into MicroPython and check it answers
        step(4); bar(1); msg('Restarting your board…');
        await loader.after('hard_reset');
        try { await transport.disconnect(); } catch (e) { /* ignore */ }
        transport = null;
        await sleep(1500);
        let version = '';
        if (opts.link) {
          const r = await opts.link.connect({ port });
          if (!r.micropython) throw Object.assign(new Error('MicroPython did not answer after installing'), { code: 'check' });
          version = r.version;
        }
        step(STEPS.length); busy = false;
        view.querySelector('[data-end]').innerHTML = `<div class="ok"><b>Your board is ready! 🎉</b><p>MicroPython ${esc(version.replace(/^micropython\s*/i, '').replace(/\s+esp32\S*$/i, '') || (fw && fw.version) || '')} is installed. Close this window and press <b>Run on my ESP32</b>.</p></div>
          <div class="row"><button type="button" class="btn primary" data-close>Let’s code!</button></div>`;
        msg('Done.'); wire();
        if (opts.onDone) opts.onDone(port);
      } catch (e) {
        busy = false;
        view.querySelectorAll('.steps li.now').forEach((li) => { li.className = 'fail'; });
        addLog('\nERROR: ' + (e && e.message) + '\n');
        try { if (transport) await transport.disconnect(); } catch (x) { /* ignore */ }
        const end = view.querySelector('[data-end]');
        const tryAgain = '<div class="row"><button type="button" class="btn primary" data-again>Try again</button><button type="button" class="btn" data-close>Close</button></div>';
        if (e && e.name === 'NotFoundError') { close(); return; }
        if (e && e.code === 'sync') end.innerHTML = `<div class="bad"><b>The board didn’t answer</b><p>Some boards need a little help to start installing:</p>
          <ol><li>Press <b>Try again</b>.</li><li>As soon as it says “Talking to the board…”, <b>press and hold the BOOT button</b> on the board.</li><li>Let go when the progress bar starts moving.</li></ol>
          <p>Still stuck? Try another USB cable or socket, and close other programs that use the board.</p></div>${tryAgain}`;
        else if (e && e.code === 'not-usb') end.innerHTML = `<div class="bad"><b>That port isn’t your board</b><p>Pick the one that says <b>USB</b>, <b>CH340</b> or <b>CP210x</b> (for example “USB Serial (ttyUSB0)” on Linux or “USB-SERIAL CH340 (COM5)” on Windows). Nothing was erased.</p></div>${tryAgain}`;
        else if (e && e.code === 'busy') end.innerHTML = `<div class="bad"><b>Another program is using the board</b><p>Close Thonny, Arduino IDE, a terminal (screen/minicom) or other tabs using the board, then try again. Nothing was erased.</p></div>${tryAgain}`;
        else if (e && e.code === 'chip') end.innerHTML = `<div class="bad"><b>This is a different kind of ESP32 (${esc(e.chip)})</b><p>This course and its MicroPython file are made for the ESP32 DevKit V1 (classic ESP32). Nothing was erased.</p></div><div class="row"><button type="button" class="btn" data-close>Close</button></div>`;
        else if (e && e.code === 'check') end.innerHTML = `<div class="warn"><b>MicroPython is installed, but the board didn’t answer yet</b><p>Press the <b>EN</b> button on the board, then press <b>Connect my board</b> again.</p></div><div class="row"><button type="button" class="btn primary" data-close>OK</button></div>`;
        else end.innerHTML = `<div class="bad"><b>Something went wrong</b><p>${esc(e && e.message || e)}</p><p>Unplug the board, plug it back in and try again. Nothing is broken: you can always run the installer again.</p></div>${tryAgain}`;
        msg('Stopped.'); wire();
        const again = view.querySelector('[data-again]'); if (again) again.addEventListener('click', run);
      }
    }
  }
  window.PrepareBoard = { open };
})();
