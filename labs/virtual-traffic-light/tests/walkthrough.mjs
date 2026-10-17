// Screenshots of every step as a learner first sees it (earlier steps done, nothing yet done on this one),
// at desktop (1400 × 860) and phone (400 × 820) size, for reviewing the whole lab by eye.
// Run: cd labs/virtual-traffic-light/tests && npm run walkthrough   → .out/walkthrough/NN_<step>_<width>.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '.out', 'walkthrough');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const URL = `http://127.0.0.1:${port}/labs/virtual-traffic-light/index.html`;
for (let i = 0; i < 50; i++) { try { await fetch(URL); break; } catch (e) { await sleep(100); } }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
let errors = 0;
for (const [w, h, opts] of [[1400, 860, {}], [400, 820, { hasTouch: true, isMobile: true, deviceScaleFactor: 1 }]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors++; console.log('pageerror', e.message); });
  await page.goto(URL); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(800);
  const n = await page.evaluate(() => window.__lesson.STEPS.length);
  for (let i = 0; i < n; i++) {
    if (only && !only.includes(i + 1)) continue;
    const id = await page.evaluate((i) => {
      const l = window.__lesson, s = l.STEPS[i];
      localStorage.clear();
      l.state.mode = 'guided';
      for (const k of [...l.state.done]) l.state.done.delete(k);
      for (const k of Object.keys(l.state.build)) delete l.state.build[k];
      l.buildUpTo(s.task === 'place' ? s.id : '-');
      for (const x of l.STEPS.slice(0, i)) l.done(x.id);
      l.view.setPlugged(i < 3);
      l.goTo(i);
      if (i >= l.idx('read-code') && i !== l.idx('fix-it')) { const b = document.querySelector('[data-sim="plug"]'); if (b) b.click(); }
      return s.id;
    }, i);
    await sleep(w < 600 ? 1200 : 1500);
    if (w < 600) await page.evaluate(() => document.querySelector('.viewport').scrollIntoView({ block: 'start' }));
    await sleep(300);
    await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}_${id}_${w}.png`, fullPage: w < 600 });
  }
  await ctx.close();
}
await browser.close(); server.kill();
console.log(errors ? `${errors} page errors` : 'no page errors', '· screenshots in', OUT);
