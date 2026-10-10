/* BoardLink: talk to a real ESP32 running MicroPython from the browser (Web Serial, Chrome / Edge on a computer).
   It uses MicroPython's "raw REPL", the same protocol Thonny and mpremote use:
     Ctrl-C (\x03) stops whatever is running, Ctrl-A (\x01) enters raw mode, then we send the code and Ctrl-D (\x04).
     The board answers "OK", then the program's output, \x04, any error message, \x04 and ">".
   Nothing is installed or erased here: this only runs code on a board that already has MicroPython.
   Exposes window.BoardLink. Events (BoardLink is an EventTarget): 'out' (text), 'state', 'disconnect'. */
(function () {
  'use strict';
  const CHIPS = { 0x10c4: 'CP2102', 0x1a86: 'CH340', 0x0403: 'FTDI', 0x303a: 'ESP32 native USB' };
  const FILTERS = Object.keys(CHIPS).map((v) => ({ usbVendorId: +v }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RAW_BANNER = 'raw REPL; CTRL-B to exit\r\n>';

  class BoardLink extends EventTarget {
    constructor() {
      super();
      this.port = null; this.reader = null; this.writer = null;
      this.buf = ''; this.job = null; this.state = 'disconnected';
      this.chip = ''; this.version = ''; this.micropython = false;
      this.decoder = new TextDecoder();
      this._onDisconnect = (e) => { if (e.target === this.port || e.port === this.port) this._lost(); };
    }
    static supported() { return typeof navigator !== 'undefined' && 'serial' in navigator; }
    _set(state) { this.state = state; this.dispatchEvent(new CustomEvent('state', { detail: state })); }

    /* Ask the learner to pick the board (the browser shows its own permission window). */
    async connect(opts) {
      if (!BoardLink.supported()) throw Object.assign(new Error('Web Serial is not available'), { code: 'unsupported' });
      let port;
      try { port = await navigator.serial.requestPort(opts && opts.all ? {} : { filters: FILTERS }); }
      catch (e) { throw Object.assign(new Error('No board chosen'), { code: 'cancelled', cause: e }); }
      try { await port.open({ baudRate: 115200 }); }
      catch (e) { throw Object.assign(new Error(e.message), { code: /already open|in use|access/i.test(e.message) ? 'busy' : 'open', cause: e }); }
      this.port = port;
      // Opening the port can pulse the reset lines on DevKit boards; release both so the ESP32 runs normally.
      try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* not every adapter supports it */ }
      const info = port.getInfo ? port.getInfo() : {};
      this.chip = CHIPS[info.usbVendorId] || 'USB serial';
      this.writer = port.writable.getWriter();
      this._readLoop();
      navigator.serial.addEventListener('disconnect', this._onDisconnect);
      this._set('connected');
      // Is MicroPython there? Stop any running program (e.g. main.py), then try the raw REPL a few times while it boots.
      this.micropython = await this._enterRaw(4);
      if (this.micropython) {
        const r = await this.exec("import sys\nprint(sys.implementation.name, '.'.join(str(x) for x in sys.implementation.version[:3]), sys.platform)", { timeout: 4000 });
        this.version = (r.out || '').trim();
      }
      this._set(this.micropython ? 'ready' : 'no-micropython');
      return { chip: this.chip, micropython: this.micropython, version: this.version };
    }

    async disconnect() {
      try { if (this.job) await this.stop(); } catch (e) { /* ignore */ }
      try { await this._write('\x02'); } catch (e) { /* back to the normal prompt */ }
      await this._close();
      this._set('disconnected');
    }

    async _close() {
      navigator.serial && navigator.serial.removeEventListener('disconnect', this._onDisconnect);
      try { if (this.reader) await this.reader.cancel(); } catch (e) { /* ignore */ }
      try { if (this.writer) this.writer.releaseLock(); } catch (e) { /* ignore */ }
      try { if (this.port) await this.port.close(); } catch (e) { /* ignore */ }
      this.port = this.reader = this.writer = null;
    }
    _lost() {
      if (this.job) { this.job.reject(Object.assign(new Error('Board unplugged'), { code: 'unplugged' })); this.job = null; }
      this._close();
      this._set('disconnected');
      this.dispatchEvent(new CustomEvent('disconnect'));
    }

    async _readLoop() {
      const port = this.port;
      while (port && port.readable && this.port === port) {
        this.reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            this.buf += this.decoder.decode(value, { stream: true });
            this._pump();
          }
        } catch (e) {
          // a read error usually means the cable was pulled out
        } finally {
          try { this.reader.releaseLock(); } catch (e) { /* ignore */ }
        }
        if (this.port === port && !port.readable) break;
        if (this.port !== port) break;
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
    async _enterRaw(tries) {
      for (let t = 0; t < (tries || 1); t++) {
        await this._write('\r\x03\x03');
        await sleep(t ? 400 : 150);
        this.buf = '';
        await this._write('\x01');
        if (await this._waitFor(RAW_BANNER, 1200)) return true;
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
})();
