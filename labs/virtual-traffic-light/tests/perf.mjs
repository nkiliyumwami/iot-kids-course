// Performance measurements for the Virtual Lab (phase 4). Headless Chromium with SwiftShader, i.e. WebGL drawn by the
// CPU: a pessimistic stand-in for a school laptop's GPU. Prints load timing, bytes downloaded, JS memory, frame rate
// (idle and while the program runs, also with the CPU slowed 4×), step-change time and scene size.
// Run: cd labs/virtual-traffic-light/tests && npm run perf     (needs internet for three.js and fonts, like the lab)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const URL = `http://127.0.0.1:${port}/labs/virtual-traffic-light/index.html`;
for (let i = 0; i < 50; i++) { try { await fetch(URL); break; } catch (e) { await sleep(100); } }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function measure(width, height, throttle) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const bytes = {};
  page.on('response', async (r) => {
    try { const b = (await r.body()).length; const u = r.url(); const k = /three|OrbitControls/.test(u) ? 'three.js (CDN)' : /fonts\.g/.test(u) ? 'fonts (Google)' : /virtual-lab/.test(u) ? 'lab code' : /\.svg/.test(u) ? 'Officer Ohm (svg)' : /\.mp3/.test(u) ? 'voice' : 'course scripts + page'; bytes[k] = (bytes[k] || 0) + b; } catch (e) { /* redirects etc. */ }
  });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  await page.waitForFunction(() => window.__lesson && window.__lesson.kit);
  const readyMs = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  await sleep(1500);
  const fps = async (ms) => page.evaluate((ms) => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < ms) requestAnimationFrame(f); else res(n / ((performance.now() - t) / 1000)); }; requestAnimationFrame(f); }), ms);
  const idle = await fps(3000);
  // build everything, go to "Run", plug in and run the program
  const stepTimes = await page.evaluate(() => {
    const l = window.__lesson; l.state.mode = 'guided'; l.buildUpTo('-'); for (const s of l.STEPS.slice(0, l.idx('run'))) l.done(s.id);
    const out = []; for (const i of [0, 4, 10, 17, 19, 20, 22, 23]) { const t = performance.now(); l.goTo(i); out.push(performance.now() - t); }
    l.goTo(l.idx('run')); document.querySelector('[data-sim="plug"]').click(); document.querySelector('[data-sim="run"]').click();
    return { max: Math.max(...out), avg: out.reduce((a, b) => a + b, 0) / out.length };
  });
  await sleep(500);
  const running = await fps(3000);
  const info = await page.evaluate(() => { const r = window.__lesson.kit.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures }; });
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  await ctx.close();
  return { width, throttle, loadMs, readyMs, nav, idle, running, stepTimes, info, heapMB: m.JSHeapUsedSize / 1048576, nodes: m.Nodes, bytes };
}

const runs = [await measure(1400, 860, 0), await measure(400, 820, 0), await measure(1400, 860, 4)];
for (const r of runs) {
  console.log(`\n== ${r.width} px${r.throttle ? `, CPU slowed ${r.throttle}×` : ''}`);
  console.log(`load event ${r.nav.load} ms (DOM ready ${r.nav.dcl} ms) · 3D ready ${r.readyMs} ms after navigation started`);
  console.log(`frame rate: idle ${r.idle.toFixed(1)} fps · program running ${r.running.toFixed(1)} fps`);
  console.log(`step change: average ${r.stepTimes.avg.toFixed(0)} ms, slowest ${r.stepTimes.max.toFixed(0)} ms`);
  console.log(`scene: ${r.info.calls} draw calls, ${r.info.triangles} triangles, ${r.info.geometries} geometries, ${r.info.textures} textures`);
  console.log(`JS heap ${r.heapMB.toFixed(1)} MB · DOM nodes ${r.nodes}`);
  if (!r.throttle && r.width === 1400) console.log('downloaded: ' + Object.entries(r.bytes).map(([k, v]) => `${k} ${kb(v)}`).join(' · ') + ` · total ${kb(Object.values(r.bytes).reduce((a, b) => a + b, 0))}`);
}
await browser.close(); server.kill();
