// Confirms the real lesson is untouched: opens lessons/00-meet-esp32 normally (no cinema page, no flags),
// waits for the 3D board, screenshots step 1 and checks it rendered with no script errors.
//   node video/lesson-00/check-lesson.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { server, url } = await serve(path.resolve(HERE, '../..'));
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errors.push(m.text()); });
await page.goto(`${url}/lessons/00-meet-esp32/index.html`);
await page.waitForFunction(() => window.__lesson && window.__lesson.viewer && Object.keys(window.__lesson.viewer.pads).length === 30, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  step: window.__lesson.step, title: document.querySelector('#stepTitle').textContent, task: document.querySelector('#task b.t')?.textContent,
  canvas: !!document.querySelector('#scene canvas'), reset: !!document.querySelector('#resetView'), progress: document.querySelector('#progressText').textContent,
}));
const shot = path.join(HERE, 'out', 'LESSON_CHECK_step1.png');
await page.screenshot({ path: shot });
// do step 1 like a learner: drag the board to spin it, which should complete the task
const box = await page.locator('#scene canvas').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 260, box.y + box.height / 2 + 40, { steps: 20 }); await page.mouse.up();
await page.waitForTimeout(800);
const done = await page.evaluate(() => document.querySelector('#task')?.classList.contains('done'));
await page.screenshot({ path: path.join(HERE, 'out', 'LESSON_CHECK_step1_done.png') });
await browser.close(); server.close();
const ok = info.step === 0 && info.canvas && info.reset && done && !errors.length;
console.log(JSON.stringify({ ...info, spinCompletesTask: done, errors }, null, 2));
console.log(ok ? 'LESSON OK' : 'LESSON PROBLEM');
process.exitCode = ok ? 0 : 1;
