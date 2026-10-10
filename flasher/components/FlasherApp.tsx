'use client';
/* The flasher page: editor + bottom bar [Compile] [Connect ▾] [Flash] [Monitor], progress, log and serial monitor.
   One owner of the port at a time: the monitor is stopped before flashing and re-opened afterwards. */
import { useEffect, useReducer, useRef, useState } from 'react';
import { initialState, reducer, busy, canCompile, canFlash, canMonitor } from '../lib/state';
import { decodeImages, type ApiImage } from '../lib/images';
import type { Monitor } from '../lib/monitor';
// lib/flasher only touches navigator.serial / esptool-js inside its functions, so this import is SSR-safe
import { pickPort, portLabel, flashWithRetry } from '../lib/flasher';

const BLINK = `#include <Arduino.h>

// Blink the blue LED on GPIO 2 and print to the Serial Monitor.
void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
}

void loop() {
  digitalWrite(2, HIGH);
  Serial.println("LED on");
  delay(500);
  digitalWrite(2, LOW);
  Serial.println("LED off");
  delay(500);
}
`;

const C = { accent: '#0A7480', dark: '#13202A', line: '#D2DCE3', muted: '#526170', gold: '#F2B705', red: '#C93131', green: '#2E9E57' };
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  border: `2px solid ${primary ? C.accent : C.line}`, background: primary ? C.accent : '#fff', color: primary ? '#fff' : '#15202A',
  borderRadius: 999, padding: '8px 16px', fontWeight: 800, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
});

export default function FlasherApp() {
  const [s, dispatch] = useReducer(reducer, initialState);
  const [code, setCode] = useState(BLINK);
  const [log, setLog] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [baud, setBaud] = useState(115200);
  const [send, setSend] = useState('');
  const [supported, setSupported] = useState(true);
  const [menu, setMenu] = useState(false);
  const port = useRef<SerialPort | null>(null);
  const mon = useRef<Monitor | null>(null);
  const logEnd = useRef<HTMLPreElement>(null);
  const monEnd = useRef<HTMLPreElement>(null);

  useEffect(() => { setSupported(typeof navigator !== 'undefined' && 'serial' in navigator); }, []);
  useEffect(() => { logEnd.current?.scrollTo(0, logEnd.current.scrollHeight); }, [log]);
  useEffect(() => { monEnd.current?.scrollTo(0, monEnd.current.scrollHeight); }, [lines]);
  const addLog = (t: string) => setLog((l) => [...l.slice(-800), ...t.split(/\r?\n/).filter(Boolean)]);

  /* ---- compile (server) ---- */
  async function compile() {
    dispatch({ type: 'COMPILE_START' });
    setLog([]);
    try {
      const r = await fetch('/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: 'esp32dev', files: { 'src/main.cpp': code } }) });
      const j = await r.json();
      addLog(j.log || '');
      if (!r.ok || !j.ok) { dispatch({ type: 'COMPILE_FAIL', message: r.status === 422 ? 'Compile failed: see the errors in the log.' : (j.log || `Compile failed (${r.status})`) }); return; }
      decodeImages(j.images as ApiImage[]); // sanity-check before enabling Flash
      for (const i of j.images as ApiImage[]) addLog(`image ${i.name} @ 0x${i.address.toString(16)}`);
      dispatch({ type: 'COMPILE_OK', images: j.images });
    } catch (e) {
      dispatch({ type: 'COMPILE_FAIL', message: 'Compile failed: ' + (e as Error).message });
    }
  }

  /* ---- connect: requestPort must be the first thing in the click handler ---- */
  function connect(all: boolean) {
    const picked = pickPort(all); // first statement: keeps Chrome's user gesture
    setMenu(false);
    picked.then(async (p) => {
      if (mon.current) { await mon.current.stop(); mon.current = null; dispatch({ type: 'MONITOR', on: false }); }
      port.current = p;
      dispatch({ type: 'PORT_SELECTED', label: portLabel(p) });
      addLog(`Port selected: ${portLabel(p)}`);
    }).catch((e: Error) => {
      if (e?.name !== 'NotFoundError') addLog('Connect failed: ' + e.message);
      else addLog(all ? 'No port chosen.' : 'No port chosen. If your board is not listed, use Connect ▾ → "Show all serial ports".');
    });
  }

  /* ---- monitor ---- */
  async function openMonitor() {
    if (!port.current) return;
    const { startMonitor } = await import('../lib/monitor');
    setLines([]);
    try {
      mon.current = await startMonitor(port.current, baud, (l) => setLines((x) => [...x.slice(-1000), l]));
      dispatch({ type: 'MONITOR', on: true });
    } catch (e) { addLog('Monitor failed to open: ' + (e as Error).message); }
  }
  async function closeMonitor() {
    if (mon.current) { await mon.current.stop(); mon.current = null; }
    dispatch({ type: 'MONITOR', on: false });
  }

  /* ---- flash (browser, esptool-js) ---- */
  async function doFlash() {
    if (!port.current || !s.images) return;
    const reopen = !!mon.current;
    await closeMonitor(); // one owner of the port at a time
    dispatch({ type: 'FLASH_START' });
    try {
      const images = decodeImages(s.images);
      const used = await flashWithRetry(port.current, images, (pct, msg) => {
        if (pct < 0) addLog(msg); else { dispatch({ type: 'FLASH_PROGRESS', pct, message: msg }); addLog(msg); }
      });
      if (used !== port.current) { port.current = used; dispatch({ type: 'PORT_SELECTED', label: portLabel(used) }); }
      dispatch({ type: 'FLASH_DONE' });
      if (reopen) await openMonitor(); // re-open the monitor if it was open before flashing
    } catch (e) {
      const err = e as Error & { hint?: string };
      addLog('Flash failed: ' + err.message);
      dispatch({ type: 'FLASH_FAIL', message: 'Flash failed: ' + err.message.split('\n')[0], hint: err.hint ?? null });
    }
  }

  const phaseColor = s.phase === 'error' ? C.red : s.phase === 'done' ? C.green : C.accent;
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: '100vh' }}>
      <header style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Kunda<span style={{ color: C.accent }}>Kode</span><span style={{ color: C.gold }}>.</span> Flasher</h1>
        <span style={{ color: C.muted, fontSize: 14 }}>ESP32 DevKit · Arduino C++ · compile on the server, flash from Chrome</span>
      </header>

      <style>{`.fl-main{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px;padding:0 16px 12px;min-height:0}
        @media (max-width: 820px){.fl-main{grid-template-columns:minmax(0,1fr)}}`}</style>
      <main className="fl-main">
        {!supported && (
          <div role="alert" style={{ gridColumn: '1 / -1', background: '#FDECEC', borderLeft: `5px solid ${C.red}`, borderRadius: 12, padding: '10px 14px' }}>
            <b>This browser can’t talk to USB boards.</b> Use <b>Chrome</b> or <b>Edge</b> on a computer, on <code>https://</code> or <code>http://localhost</code>. Firefox and Safari don’t support Web Serial.
          </div>
        )}
        <section style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 360 }}>
          <label htmlFor="code" style={{ fontWeight: 800, fontSize: 13, color: C.muted, margin: '0 0 6px' }}>src/main.cpp</label>
          <textarea id="code" value={code} spellCheck={false}
            onChange={(e) => { setCode(e.target.value); dispatch({ type: 'CODE_CHANGED' }); }}
            style={{ width: '100%', minHeight: 360, resize: 'vertical', boxSizing: 'border-box', background: C.dark, color: '#E3ECF1', border: 0, borderRadius: 14, padding: 14, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 14, lineHeight: 1.6 }} />
        </section>
        <section style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 360, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>Serial Monitor</b>
            <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={s.monitor} aria-label="Baud rate" style={{ borderRadius: 8, padding: 4 }}>
              {[9600, 57600, 115200, 230400, 460800].map((b) => <option key={b} value={b}>{b} baud</option>)}
            </select>
            <button type="button" style={btn(false, !s.monitor)} disabled={!s.monitor} onClick={() => mon.current?.reset()}>Reset board</button>
            <button type="button" style={btn(false)} onClick={() => setLines([])}>Clear</button>
          </div>
          <pre ref={monEnd} aria-live="polite" style={{ margin: '8px 0', background: '#0E1820', color: '#CFE3EA', borderRadius: 10, padding: 10, overflow: 'auto', fontSize: 13, whiteSpace: 'pre-wrap', minHeight: 200 }}>
            {lines.length ? lines.join('\n') : s.monitor ? 'Waiting for the board…' : 'Open the monitor to see what your board prints (Serial.println).'}
          </pre>
          <form onSubmit={(e) => { e.preventDefault(); if (mon.current && send) { mon.current.send(send); setSend(''); } }} style={{ display: 'flex', gap: 8 }}>
            <input value={send} onChange={(e) => setSend(e.target.value)} disabled={!s.monitor} placeholder="Send a line to the board" aria-label="Send to board" style={{ flex: 1, borderRadius: 999, border: `2px solid ${C.line}`, padding: '6px 12px' }} />
            <button type="submit" style={btn(false, !s.monitor)} disabled={!s.monitor}>Send</button>
          </form>
        </section>
      </main>

      <footer style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${C.line}`, padding: '10px 16px', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btn(true, !canCompile(s))} disabled={!canCompile(s)} onClick={compile}>{s.phase === 'compiling' ? 'Compiling…' : '⚙ Compile'}</button>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <button type="button" style={{ ...btn(false, busy(s) || !supported), borderRadius: '999px 0 0 999px' }} disabled={busy(s) || !supported} onClick={() => connect(false)}>
              🔌 {s.port ? s.port : 'Connect'}
            </button>
            <button type="button" aria-label="More connect options" style={{ ...btn(false, busy(s) || !supported), borderRadius: '0 999px 999px 0', borderLeft: 0, padding: '8px 10px' }} disabled={busy(s) || !supported} onClick={() => setMenu((m) => !m)}>▾</button>
            {menu && (
              <span role="menu" style={{ position: 'absolute', bottom: '110%', left: 0, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.15)', whiteSpace: 'nowrap', zIndex: 5 }}>
                <button type="button" role="menuitem" style={{ ...btn(false), border: 0, display: 'block' }} onClick={() => connect(false)}>Choose a USB board…</button>
                <button type="button" role="menuitem" style={{ ...btn(false), border: 0, display: 'block' }} onClick={() => connect(true)}>Show all serial ports (board not listed?)</button>
              </span>
            )}
          </span>
          <button type="button" style={btn(true, !canFlash(s))} disabled={!canFlash(s)} onClick={doFlash} title={!s.images ? 'Compile first' : !s.port ? 'Connect a board first' : ''}>⚡ Flash</button>
          <button type="button" style={btn(false, !canMonitor(s))} disabled={!canMonitor(s)} onClick={() => (s.monitor ? closeMonitor() : openMonitor())}>{s.monitor ? '■ Close monitor' : '🖥 Monitor'}</button>
          <span style={{ marginLeft: 'auto', fontWeight: 800, color: phaseColor, fontSize: 14 }} aria-live="polite">{s.message}</span>
        </div>
        {(s.phase === 'connecting' || s.phase === 'flashing' || s.phase === 'done') && (
          <div aria-hidden="true" style={{ height: 8, background: '#E3EBF0', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${s.progress}%`, height: '100%', background: phaseColor, transition: 'width .2s' }} />
          </div>
        )}
        {s.hint && <div role="alert" style={{ background: '#FFF1DF', borderLeft: `5px solid #D9821A`, borderRadius: 10, padding: '8px 12px', fontWeight: 700 }}>💡 {s.hint}</div>}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Log (compiler and esptool output)</summary>
          <pre ref={logEnd} style={{ margin: '6px 0 0', background: C.dark, color: '#E3ECF1', borderRadius: 10, padding: 10, maxHeight: 240, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n') || 'Nothing yet.'}</pre>
        </details>
      </footer>
    </div>
  );
}
