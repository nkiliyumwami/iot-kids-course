/* BoardLink: talk to a real ESP32 running MicroPython from the browser (Web Serial, Chrome / Edge on a computer).
   It uses MicroPython's "raw REPL", the same protocol Thonny and mpremote use:
     Ctrl-C (\x03) stops whatever is running, Ctrl-A (\x01) enters raw mode, then we send the code and Ctrl-D (\x04).
     The board answers "OK", then the program's output, \x04, any error message, \x04 and ">".
   Nothing is installed or erased here (assets/prepare-board.js does that). Like esptool and Schematik, we list every
   serial port (the board shows up as e.g. "USB-SERIAL CH340 (COM5)") and reset the board cleanly when connecting.
   If MicroPython doesn't answer, connect() says why: another program on the board, download mode, or silence.
   Exposes window.BoardLink. Events (BoardLink is an EventTarget): 'out' (text), 'state', 'disconnect'. */
(function () {
  'use strict';
  // USB-to-serial chips used on ESP32 boards (WCH CH340/CH9102, Silicon Labs CP210x, FTDI, Prolific, Espressif native USB)
  const CHIPS = { 0x10c4: 'CP2102', 0x1a86: 'CH340', 0x0403: 'FTDI', 0x067b: 'Prolific', 0x303a: 'ESP32 native USB' };
  const FILTERS = Object.keys(CHIPS).map((v) => ({ usbVendorId: +v }));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RAW_BANNER = 'raw REPL; CTRL-B to exit\r\n>';
  const hex = (n) => (n == null ? '?' : '0x' + n.toString(16).padStart(4, '0'));

  class BoardLink extends EventTarget {
    constructor() {
      super();
      this.port = null; this.reader = null; this.writer = null;
      this.buf = ''; this.job = null; this.state = 'disconnected';
      this.chip = ''; this.version = ''; this.micropython = false;
      this.decoder = new TextDecoder(); this.log = ''; this.reason = '';
      this._onDisconnect = (e) => { if (e.target === this.port || e.port === this.port) this._lost(); };
    }
    static supported() { return typeof navigator !== 'undefined' && 'serial' in navigator; }
    _set(state) { this.state = state; this.dispatchEvent(new CustomEvent('state', { detail: state })); }

    _note(t) { this.log += `\n[${new Date().toLocaleTimeString()}] ${t}\n`; if (this.log.length > 12000) this.log = this.log.slice(-10000); }

    /* Ask the learner to pick the board (the browser shows its own permission window), or reuse opts.port. */
    async connect(opts) {
      opts = opts || {};
      if (!BoardLink.supported()) throw Object.assign(new Error('Web Serial is not available'), { code: 'unsupported' });
      this.log = ''; this.reason = '';
      let port = opts.port || this.lastPort;
      if (!port || opts.choose !== false && !opts.port) {
        // List every serial port, like Schematik and esptool. A USB filter hides boards whose Windows driver
        // doesn't report USB details to Chrome (the board then appears only as e.g. "COM5").
        try { port = await navigator.serial.requestPort(opts.filtered ? { filters: FILTERS } : {}); }
        catch (e) { throw Object.assign(new Error('No board chosen'), { code: 'cancelled', cause: e }); }
      }
      const info = port.getInfo ? port.getInfo() : {};
      this.chip = info.usbVendorId == null ? 'serial port' : CHIPS[info.usbVendorId] || 'USB serial';
      this._note(info.usbVendorId == null ? 'Port chosen: no USB details from the driver (normal for some Windows COM ports)'
        : `Port chosen: USB vendor ${hex(info.usbVendorId)} product ${hex(info.usbProductId)} (${this.chip})`);
      try { await port.open({ baudRate: 115200, bufferSize: 4096 }); }
      catch (e) {
        this._note('Could not open the port: ' + e.message);
        throw Object.assign(new Error(e.message), { code: /already open|in use|access|denied|Failed to open/i.test(e.message) ? 'busy' : 'open', cause: e });
      }
      this.port = this.lastPort = port;
      this.writer = port.writable.getWriter();
      this._loop = this._readLoop();
      navigator.serial.addEventListener('disconnect', this._onDisconnect);
      this._set('connected');
      // 1) Like mpremote and Thonny: keep the board running (DTR and RTS released = no reset, normal boot) and
      //    talk to MicroPython straight away. Ctrl-C stops a running main.py.
      try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { this._note('Control lines not available: ' + e.message); }
      await sleep(250);
      this.micropython = await this._enterRaw(2, 1000);
      // 2) No answer? Restart the board through EN (like esptool's hard reset), give it time to boot, and try again.
      //    This also gets it out of download mode if another tool left it there. Native USB chips drop the
      //    connection on reset, so skip it there.
      if (!this.micropython && info.usbVendorId !== 0x303a && opts.reset !== false) {
        try {
          await port.setSignals({ dataTerminalReady: false, requestToSend: true });
          await sleep(150);
          await port.setSignals({ dataTerminalReady: false, requestToSend: false });
          this._note('No answer yet: restarted the board (EN) and waiting for it to boot');
        } catch (e) { this._note('Reset lines not available: ' + e.message); }
        await this._waitFor('>>>', 3000); // MicroPython prints ">>> " when it is ready
        this.micropython = await this._enterRaw(2, 1200);
      }
      // 3) Still nothing? Some Windows drivers treat the control lines the other way round, which can hold the
      //    board in reset. Try the lines "on" (what pyserial uses by default), then once more after a restart.
      if (!this.micropython && opts.reset !== false) {
        try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); this._note('Trying with DTR/RTS on'); } catch (e) { /* ignore */ }
        await sleep(1500);
        this.micropython = await this._enterRaw(2, 1000);
        if (!this.micropython) {
          try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* ignore */ }
        }
      }
      if (this.micropython) {
        const r = await this.exec("import sys\nprint(sys.implementation.name, '.'.join(str(x) for x in sys.implementation.version[:3]), sys.platform)", { timeout: 4000 });
        this.version = (r.out || '').trim();
        this._note('MicroPython answered: ' + this.version);
      } else {
        const heard = this.log.replace(/\[[^\]]*\][^\n]*\n/g, '');
        this.reason = /MicroPython|>>>|raw REPL/.test(heard) ? 'micropython-busy'
          : /waiting for download/i.test(heard) ? 'download-mode' : heard.trim() ? 'other-program' : 'silent';
        this._note('MicroPython did not answer (' + this.reason + ')');
      }
      this._set(this.micropython ? 'ready' : 'no-micropython');
      return { chip: this.chip, micropython: this.micropython, version: this.version, reason: this.reason };
    }

    /* Tools for the board monitor (for grown-ups): send raw bytes, set the control lines, restart through EN. */
    async sendRaw(text) { this._note('Sent ' + JSON.stringify(text)); await this._write(text); }
    async setLines(dtr, rts) {
      if (!this.port) return;
      await this.port.setSignals({ dataTerminalReady: dtr, requestToSend: rts });
      this._note(`Control lines: DTR ${dtr ? 'on' : 'off'}, RTS ${rts ? 'on' : 'off'}`);
    }
    async resetEN() {
      if (!this.port) return;
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: true }); await sleep(150);
      await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
      this._note('Restarted the board (EN)');
    }
    async retry() {
      // after the learner pressed EN or changed something: look for MicroPython again on the open port
      this.micropython = await this._enterRaw(3, 1200);
      if (this.micropython) {
        const r = await this.exec("import sys\nprint(sys.implementation.name, '.'.join(str(x) for x in sys.implementation.version[:3]), sys.platform)", { timeout: 4000 });
        this.version = (r.out || '').trim();
        this._note('MicroPython answered: ' + this.version);
        this._set('ready');
      }
      return this.micropython;
    }

    /* Give the port to another tool (the MicroPython installer) without asking the learner to choose it again. */
    async release() {
      try { if (this.job) await this.stop(); } catch (e) { /* ignore */ }
      const port = this.port || this.lastPort;
      await this._close();
      this._set('disconnected');
      return port;
    }

    async disconnect() {
      try { if (this.job) await this.stop(); } catch (e) { /* ignore */ }
      try { await this._write('\x02'); } catch (e) { /* back to the normal prompt */ }
      await this._close();
      this._set('disconnected');
    }

    async _close() {
      navigator.serial && navigator.serial.removeEventListener('disconnect', this._onDisconnect);
      const port = this.port, loop = this._loop;
      this.loopId = (this.loopId || 0) + 1; // tells the read loop to stop
      try { if (this.reader) await this.reader.cancel(); } catch (e) { /* ignore */ }
      if (loop) await Promise.race([loop, sleep(1000)]); // the loop releases its reader lock as it ends
      try { if (this.writer) { await this.writer.close().catch(() => {}); this.writer.releaseLock(); } } catch (e) { /* ignore */ }
      this.port = this.reader = this.writer = null;
      if (port) {
        // the port must really be closed before another tool (the installer) can open it
        for (let i = 0; i < 3; i++) {
          try { await port.close(); break; } catch (e) { if (!port.readable && !port.writable) break; this._note('Port still busy, retrying close: ' + e.message); await sleep(200); }
        }
      }
    }
    _lost() {
      if (this.job) { this.job.reject(Object.assign(new Error('Board unplugged'), { code: 'unplugged' })); this.job = null; }
      this._close();
      this._set('disconnected');
      this.dispatchEvent(new CustomEvent('disconnect'));
    }

    async _readLoop() {
      const port = this.port, id = (this.loopId = (this.loopId || 0) + 1);
      // stop when this loop is replaced (e.g. "Try again" reconnects the same port and starts a new loop)
      while (port && port.readable && this.port === port && this.loopId === id) {
        this.reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            const text = this.decoder.decode(value, { stream: true });
            this.buf += text;
            this.log += text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '<' + c.charCodeAt(0).toString(16).padStart(2, '0') + '>');
            if (this.log.length > 12000) this.log = this.log.slice(-10000);
            this._pump();
          }
        } catch (e) {
          // a read error usually means the cable was pulled out
        } finally {
          try { this.reader.releaseLock(); } catch (e) { /* ignore */ }
        }
        if (this.port !== port || this.loopId !== id || !port.readable) break;
        await sleep(50);
      }
    }

    async _write(text) {
      if (!this.writer) throw Object.assign(new Error('Not connected'), { code: 'not-connected' });
      const bytes = new TextEncoder().encode(text);
      // small chunks with a pause: the ESP32's receive buffer is small
      for (let i = 0; i < bytes.length; i += 128) {
        await this.writer.write(bytes.slice(i, i + 128));
        if (bytes.length > 128) await sleep(8);
      }
    }
    async _waitFor(text, ms) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const i = this.buf.indexOf(text);
        if (i >= 0) { this.buf = this.buf.slice(i + text.length); return true; }
        await sleep(20);
      }
      return false;
    }
    async _enterRaw(tries, wait) {
      for (let t = 0; t < (tries || 1); t++) {
        // Ctrl-B leaves a half-finished raw session, Ctrl-C (twice) stops any running program
        await this._write(t ? '\r\x02\x03\x03' : '\r\x03\x03');
        await sleep(t ? 400 : 150);
        this.buf = '';
        await this._write('\x01');
        if (await this._waitFor(RAW_BANNER, wait || 1000)) return true;
        // some USB adapters swallow the first bytes after opening: also accept a banner that ends with "\n>"
        const i = this.buf.search(/raw REPL; CTRL-B to exit\r?\n>/);
        if (i >= 0) { this.buf = this.buf.slice(this.buf.indexOf('>', i) + 1); return true; }
      }
      return false;
    }

    /* Run code. Resolves with { out, err } when the program finishes (or is stopped with stop()).
       opts.onOut(text) gets the program's output as it arrives. */
    async exec(code, opts) {
      opts = opts || {};
      if (this.job) throw Object.assign(new Error('A program is already running'), { code: 'busy-run' });
      if (!(await this._enterRaw(2))) throw Object.assign(new Error('MicroPython did not answer'), { code: 'no-reply' });
      this.buf = '';
      const job = { out: '', err: '', phase: 'ok', onOut: opts.onOut };
      const done = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
      this.job = job;
      await this._write(code.replace(/\r\n/g, '\n') + '\x04');
      this._pump();
      let timer = null;
      if (opts.timeout) timer = setTimeout(() => { if (this.job === job) { this.job = null; job.reject(Object.assign(new Error('No answer from the board'), { code: 'timeout' })); } }, opts.timeout);
      try { return await done; } finally { clearTimeout(timer); }
    }
    _pump() {
      const job = this.job; if (!job) return;
      if (job.phase === 'ok') {
        const i = this.buf.indexOf('OK');
        if (i < 0) {
          if (/raw REPL; CTRL-B to exit\r\n>$/.test(this.buf) && this.buf.length > RAW_BANNER.length) { /* still waiting */ }
          return;
        }
        this.buf = this.buf.slice(i + 2); job.phase = 'out';
      }
      if (job.phase === 'out') {
        const i = this.buf.indexOf('\x04');
        const chunk = i < 0 ? this.buf : this.buf.slice(0, i);
        if (chunk) { job.out += chunk; if (job.onOut) job.onOut(chunk); }
        if (i < 0) { this.buf = ''; return; }
        this.buf = this.buf.slice(i + 1); job.phase = 'err';
      }
      if (job.phase === 'err') {
        const i = this.buf.indexOf('\x04');
        if (i < 0) return;
        job.err = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        this.job = null;
        job.resolve({ out: job.out, err: job.err });
      }
    }

    /* Stop the running program (like pressing Ctrl-C in Thonny). */
    async stop() {
      if (!this.writer) return;
      await this._write('\x03');
      await sleep(120);
      if (this.job) await this._write('\x03');
    }
  }

  /* Friendly explanations for MicroPython errors. Always shown together with the original message. */
  function explain(err, code) {
    const text = String(err || '').trim();
    if (!text) return null;
    const lineM = text.match(/line (\d+)/g);
    const line = lineM ? +lineM[lineM.length - 1].replace(/\D/g, '') : null;
    const last = text.split(/\r?\n/).filter(Boolean).pop() || text;
    const src = line && code ? (code.split('\n')[line - 1] || '').trim() : '';
    const at = line ? ` Look at line ${line}${src ? `: <code>${esc(src)}</code>` : ''}.` : '';
    const R = (kind, title, help) => ({ kind, title, help: help + at, line, original: text });
    if (/KeyboardInterrupt/.test(last)) return { kind: 'stopped', title: 'Program stopped', help: 'You pressed Stop, so the board stopped running your program.', line: null, original: text };
    if (/IndentationError/.test(last)) return R('error', 'The spaces at the start of a line don’t match',
      /expected an indented block/.test(last) ? 'After a line ending in a colon (:), the next lines must be pushed in with 4 spaces.' :
      /unindent/.test(last) ? 'A line is pushed in by a different number of spaces than the lines around it.' :
        'A line is pushed in with spaces, but nothing before it ends with a colon (:). Python uses spaces to know which lines belong together.');
    if (/SyntaxError/.test(last)) return R('error', 'Python couldn’t read this line',
      'Check for a missing colon (:) after while/if/def, a missing bracket ( ), a missing quote mark, or a spelling mistake in a Python word.');
    let m;
    if ((m = last.match(/NameError: name '([^']+)' isn't defined|NameError: name '([^']+)' is not defined/))) {
      const n = m[1] || m[2];
      return R('error', `Python doesn’t know the name “${esc(n)}”`, `Is it spelled exactly the same everywhere (capital letters count)? Did you create it (with = or import) before using it?`);
    }
    if ((m = last.match(/ImportError: no module named '([^']+)'/i))) return R('error', `There’s no module called “${esc(m[1])}”`, 'Check the spelling. On the ESP32, pins live in <code>machine</code> and timing in <code>time</code>.');
    if ((m = last.match(/AttributeError: '([^']+)' object has no attribute '([^']+)'/))) return R('error', `A ${esc(m[1])} can’t do “${esc(m[2])}”`, 'This is usually a spelling mistake after the dot, like <code>.vaule</code> instead of <code>.value</code>.');
    if (/TypeError/.test(last)) return R('error', 'Something has the wrong type or the wrong number of values', 'Check what is inside the brackets: the right number of values, and numbers where numbers are needed (no quote marks around them).');
    if (/ValueError/.test(last) && /pin/i.test(last)) return R('error', 'That pin can’t do this job', 'Check the pin number. Some pins don’t exist, and D34, D35, VP and VN can only listen (they can’t be outputs). <a href="pins.html" target="_blank" rel="noopener">Open the Pin Explorer</a>.');
    if (/ValueError/.test(last)) return R('error', 'A value isn’t allowed here', 'A number or setting is outside what this command accepts.');
    if (/MemoryError/.test(last)) return R('error', 'The board ran out of memory', 'Your program is too big or makes very big lists. Try making it smaller.');
    if (/OSError/.test(last)) return R('error', 'The board had a hardware or file problem', 'Check the wiring and try again. If it keeps happening, unplug the board, plug it back in and reconnect.');
    return R('error', 'Your program hit a problem', 'Read the original message below: the last line says what went wrong.');
  }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* Pins the program set up as outputs, so Stop can switch those lights off again. */
  function outputPins(code) {
    const pins = new Set();
    String(code).replace(/Pin\(\s*(\d+)\s*,\s*Pin\.OUT/g, (_, n) => { pins.add(+n); return _; });
    return [...pins];
  }

  window.BoardLink = BoardLink;
  window.BoardLink.explain = explain;
  window.BoardLink.outputPins = outputPins;
  window.BoardLink.CHIPS = CHIPS;
  window.BoardLink.FILTERS = FILTERS;
})();
