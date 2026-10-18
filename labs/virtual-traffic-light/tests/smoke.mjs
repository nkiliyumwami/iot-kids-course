// Browser checks for the Virtual Traffic Light Lab (phase 1). Serves the repo over local HTTP, opens the lab in
// headless Chromium with software WebGL (SwiftShader: CPU only, no GPU), and drives it with a real mouse, touch
// screen and keyboard. Prints PASS/FAIL for every check and saves screenshots in tests/.out/smoke/.
// Run: cd labs/virtual-traffic-light/tests && npm run smoke
// The page loads three.js and fonts from their CDNs, so this needs an internet connection.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '.out', 'smoke');
mkdirSync(OUT, { recursive: true });
const GL = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];

const results = [];
function check(name, ok, evidence) {
  results.push({ name, ok: !!ok, evidence });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${evidence ? '  — ' + evidence : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
const port = await freePort();
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const URL = `http://127.0.0.1:${port}/labs/virtual-traffic-light/index.html`;
for (let i = 0; i < 50; i++) { try { await fetch(URL); break; } catch (e) { await sleep(100); } }
console.log('Serving', URL);

function watch(page, bucket) {
  page.on('pageerror', (e) => bucket.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') bucket.push('console: ' + m.text()); });
}
async function open(browser, ctxOpts, initScript) {
  const ctx = await browser.newContext(ctxOpts);
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const errs = []; watch(page, errs);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lesson && (window.__lesson.fallback || window.__lesson.kit), null, { timeout: 30000 });
  await sleep(1500);
  return { ctx, page, errs };
}
const L = (page, fn, arg) => page.evaluate(fn, arg);
const camState = (page) => L(page, () => { const k = window.__lesson.kit; return { p: k.camera.position.toArray(), t: k.controls.target.toArray() }; });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const at = (page, q) => L(page, (q) => window.__lesson.screenOf(q), q);
const inspectText = (page) => page.locator('#inspectBox').innerText();
// pairs of visible part/pin labels whose boxes overlap (temporary callouts are left out)
const labelOverlaps = (page) => L(page, () => {
  const r = [...document.querySelectorAll('#labels .lbl:not(.callout)')].filter((e) => e.style.display !== 'none')
    .map((e) => ({ t: e.textContent, b: e.firstElementChild.getBoundingClientRect() }));
  const out = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i].b, b = r[j].b;
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${r[i].t} × ${r[j].t}`);
  }
  return out;
});
async function clickAt(page, q) { const s = await at(page, q); await page.mouse.click(s.x, s.y); await sleep(350); return s; }

const browser = await chromium.launch({ args: GL });

/* ================= desktop 1400 × 860 ================= */
{
  const { ctx, page, errs } = await open(browser, { viewport: { width: 1400, height: 860 } });
  check('A01 desktop: lab loads over HTTP with 3D, no fallback', await L(page, () => !!document.querySelector('#scene canvas') && document.querySelector('#fallback').hidden && window.__lesson.step === 0));
  await page.screenshot({ path: `${OUT}/desktop_step0.png` });
  const canvasBox = await page.locator('#scene canvas').boundingBox();
  const share = canvasBox.width / 1400;
  check('3D viewport is the dominant area (≥ 60% of width)', share >= 0.6, `${Math.round(share * 100)}%`);
  let ov = await labelOverlaps(page);
  check('desktop: no part or pin labels overlap', ov.length === 0, ov.join('; '));

  // camera: rotate (left drag), zoom (wheel), pan (right drag), reset view
  const c0 = await camState(page);
  const cx = canvasBox.x + canvasBox.width * 0.85, cy = canvasBox.y + canvasBox.height * 0.75; // empty table, away from parts
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 180, cy - 40, { steps: 12 }); await page.mouse.up(); await sleep(800);
  const c1 = await camState(page);
  check('rotate: dragging moves the camera around the target', dist(c0.p, c1.p) > 0.5 && dist(c0.t, c1.t) < 0.05, `camera moved ${dist(c0.p, c1.p).toFixed(2)}, target moved ${dist(c0.t, c1.t).toFixed(3)}`);
  const d1 = dist(c1.p, c1.t);
  await page.mouse.move(cx, cy); await page.mouse.wheel(0, -600); await sleep(900);
  const c2 = await camState(page);
  check('zoom: the scroll wheel brings the camera closer', dist(c2.p, c2.t) < d1 - 0.3, `distance ${d1.toFixed(2)} → ${dist(c2.p, c2.t).toFixed(2)}`);
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 150, cy + 60, { steps: 12 }); await page.mouse.up({ button: 'right' }); await sleep(800);
  const c3 = await camState(page);
  check('pan: right-dragging slides the view (target moves)', dist(c2.t, c3.t) > 0.3, `target moved ${dist(c2.t, c3.t).toFixed(2)}`);
  await page.click('#resetView'); await sleep(1800);
  const c4 = await camState(page), kitCam = await L(page, () => window.__lesson.view.CAM.kit);
  check('Reset view returns the camera to the step’s shot', dist(c4.p, kitCam.p) < 0.2 && dist(c4.t, kitCam.t) < 0.2, `off by ${dist(c4.p, kitCam.p).toFixed(3)}`);

  // tapping things on the bench (step 0 allows holes, rails, pins and parts)
  await clickAt(page, { part: 'controller' });
  let t = await inspectText(page);
  check('select a part: clicking the ESP32 names it and says why it’s here', /ESP32 DevKit/.test(t) && /Why it’s here/.test(t), t.split('\n')[0]);
  await clickAt(page, { part: 'led-red' });
  t = await inspectText(page);
  check('select a part: clicking the red LED in the tray', /Red LED/.test(t) && /anode/.test(t), t.split('\n')[0]);
  await clickAt(page, { hole: [7, 'd'] });
  t = await inspectText(page);
  check('identify a hole: d7 is joined to a7–e7, not across the gap', /Hole d7/.test(t) && /a7–e7/.test(t) && /not.*f7–j7/s.test(t) && /resistor/.test(t), t.replace(/\n/g, ' / ').slice(0, 140));
  await page.screenshot({ path: `${OUT}/desktop_hole_d7.png` });
  await clickAt(page, { hole: [8, 'i'] });
  t = await inspectText(page);
  check('identify a hole: i8 is the red LED’s short leg', /Hole i8/.test(t) && /short leg/.test(t), t.split('\n').pop());
  await clickAt(page, { pin: 'near:D25' });
  t = await inspectText(page);
  check('identify a pin: D25 drives the red light, Pin(25) in code', /Pin D25/.test(t) && /Pin\(25\)/.test(t) && /red/.test(t));
  await page.screenshot({ path: `${OUT}/desktop_pin_d25.png` });
  await clickAt(page, { pin: 'near:GND' });
  t = await inspectText(page);
  check('identify a pin: the GND next to D13', /Pin GND/.test(t) && /blue − rail/.test(t));
  await clickAt(page, { rail: ['BN', 10] });
  t = await inspectText(page);
  check('identify a rail: the near blue − rail', /Blue − rail \(near side\)/.test(t));
  await clickAt(page, { rail: ['TN', 10] });
  t = await inspectText(page);
  check('identify a rail: the far blue − rail is NOT joined to the near one', /far side/.test(t) && /not.*joined/is.test(t));

  // the four "Get ready" steps, start to finish
  check('Next is locked until the task is done', await page.locator('#nextBtn').isDisabled());
  await page.click('[data-mode="guided"]'); await sleep(200);
  check('step 0: choosing a path unlocks Next', !(await page.locator('#nextBtn').isDisabled()));
  await page.click('#nextBtn'); await sleep(1600);
  for (const part of ['controller', 'breadboard', 'led-yellow', 'resistor', 'wire-ground', 'usb']) await clickAt(page, { part });
  t = await page.locator('#taskBox').innerText();
  check('step 1: tapping all 6 kinds of part completes "Meet the kit"', /6 of 6/.test(t) && await page.locator('#task.done').count() === 1, t.split('\n')[0]);
  await page.screenshot({ path: `${OUT}/desktop_step1_done.png` });
  await page.click('#nextBtn'); await sleep(1600);
  await page.screenshot({ path: `${OUT}/desktop_step2_demo.png` });
  for (const h of [[3, 'a'], [12, 'h'], [20, 'c']]) await clickAt(page, { hole: h });
  t = await page.locator('#taskBox').innerText();
  check('step 2: after 3 holes the challenge asks for a hole joined to b7', /joined to b7/.test(t));
  await clickAt(page, { hole: [7, 'g'] });
  const fb = await page.locator('#fbBox').innerText();
  check('step 2: a hole across the gap gets a hint, not a pass', /across the middle gap/.test(fb) && await page.locator('#task.done').count() === 0, fb.slice(0, 80));
  await clickAt(page, { hole: [7, 'c'] });
  check('step 2: c7 shares b7’s strip, task done', await page.locator('#task.done').count() === 1);
  await page.click('#nextBtn'); await sleep(1600);
  check('step 3: USB starts plugged in (power light on)', await L(page, () => window.__lesson.view.plugged));
  ov = await labelOverlaps(page);
  check('step 3 close-up: no part or pin labels overlap', ov.length === 0, ov.join('; '));
  await clickAt(page, { part: 'usb' });
  check('step 3: tapping the USB cable unplugs it', !(await L(page, () => window.__lesson.view.plugged)) && await page.locator('#task.done').count() === 1);
  check('after unplugging, Next leads on to building (phase 2)', !(await page.locator('#nextBtn').isDisabled()), (await page.locator('#nextBtn').innerText()));
  await page.screenshot({ path: `${OUT}/desktop_step3_done.png` });

  // Back, Replay, no duplicates
  await page.click('#prevBtn'); await sleep(300);
  check('Back goes to step 2 and remembers it is done', await L(page, () => window.__lesson.step) === 2 && await page.locator('#task.done').count() === 1);
  const counts = [];
  for (let i = 0; i < 4; i++) { await page.click('#replayBtn'); await sleep(150); counts.push(await L(page, () => window.__lesson.counts())); }
  const same = counts.every((c) => c.objects === counts[0].objects && c.labels === counts[0].labels);
  check('Replay ×4 replays the demo without piling up 3D objects or labels', same, counts.map((c) => `${c.objects}/${c.labels}`).join(', '));
  check('USB stays unplugged after going back (finished work is kept)', !(await L(page, () => window.__lesson.view.plugged)));

  // labels toggle
  await page.click('#labelsBtn'); await sleep(300);
  const visibleLabels = await L(page, () => [...document.querySelectorAll('#labels .lbl:not(.callout)')].filter((e) => e.style.display !== 'none').length);
  check('Labels button hides the part and pin labels', visibleLabels === 0 && await page.getAttribute('#labelsBtn', 'aria-pressed') === 'false', `${visibleLabels} visible`);
  await page.click('#labelsBtn');

  // progress survives a reload
  await page.reload(); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(1200);
  const saved = await L(page, () => JSON.parse(localStorage.getItem('iotkids.virtualLab.trafficLight.v1')));
  check('A19 progress saved under the lab’s own key and resumes', saved && saved.mode === 'guided' && saved.completedStepIds.length === 4 && await page.locator('#resumeBtn').count() === 1,
    saved ? `steps done: ${saved.completedStepIds.join(', ')}` : 'nothing saved');
  await page.click('#resumeBtn'); await sleep(300);
  check('“Carry on” jumps to the saved step', await L(page, () => window.__lesson.step) === 2);

  // reset lab (two taps), only this lab's key
  await L(page, () => localStorage.setItem('iotkids.progress', '{"lab1-light-it-up":{"done":true}}'));
  await page.click('#resetLab'); await sleep(200);
  check('Reset lab asks again before clearing', await L(page, () => window.__lesson.step) === 2 && /Tap again/.test(await page.locator('#resetLab').innerText()));
  await page.click('#resetLab'); await sleep(400);
  const after = await L(page, () => ({ step: window.__lesson.step, key: localStorage.getItem('iotkids.virtualLab.trafficLight.v1'), course: localStorage.getItem('iotkids.progress'), plugged: window.__lesson.view.plugged }));
  check('Reset lab: back to step 1, USB plugged in again, only this lab forgotten', after.step === 0 && after.plugged && after.course && (!after.key || JSON.parse(after.key).completedStepIds.length === 0), JSON.stringify(after).slice(0, 120));

  check('desktop: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= keyboard only ================= */
{
  const { ctx, page, errs } = await open(browser, { viewport: { width: 1400, height: 860 } });
  async function tabTo(sel, max = 60) {
    for (let i = 0; i < max; i++) { await page.keyboard.press('Tab'); if (await L(page, (s) => document.activeElement && document.activeElement.matches(s), sel)) return true; }
    return false;
  }
  const reach = await tabTo('[data-mode="guided"]');
  await page.keyboard.press('Enter'); await sleep(200);
  check('keyboard: Tab reaches the “I’m new” button and Enter chooses it', reach && await page.locator('#task.done').count() === 1);
  await tabTo('#nextBtn'); await page.keyboard.press('Enter'); await sleep(1600);
  check('keyboard: Next with Enter', await L(page, () => window.__lesson.step) === 1);
  await tabTo('#picker summary'); await page.keyboard.press('Enter'); await sleep(200);
  // pick each kind of part with the keyboard: focus the list, type the first letters, Tab to Show, Enter
  for (const key of ['E', 'B', 'G', '3', 'J', 'U']) {
    await tabTo('#pkPart'); await page.keyboard.type(key); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(300);
  }
  let t = await page.locator('#taskBox').innerText();
  check('keyboard: all 6 parts found with the picker (no mouse)', /6 of 6/.test(t), t.split('\n')[0]);
  await tabTo('#nextBtn'); await page.keyboard.press('Enter'); await sleep(1600);
  await tabTo('#picker summary');
  if (!(await L(page, () => document.querySelector('#picker').open))) { await page.keyboard.press('Enter'); await sleep(150); }
  for (const [r, c] of [['a', '3'], ['h', '12'], ['c', '20'], ['e', '7']]) {
    await tabTo('#pkRow'); await page.keyboard.type(r); await page.keyboard.press('Tab'); await page.keyboard.type(c); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(300);
  }
  check('keyboard: step 2 done by picking holes (e7 joins b7)', await page.locator('#task.done').count() === 1, (await page.locator('#fbBox').innerText()).slice(0, 60));
  await page.screenshot({ path: `${OUT}/keyboard_step2.png` });
  await tabTo('#nextBtn'); await page.keyboard.press('Enter'); await sleep(1600);
  const okTab = await tabTo('#unplugBtn'); await page.keyboard.press('Enter'); await sleep(300);
  check('keyboard: the Unplug button completes step 3', okTab && !(await L(page, () => window.__lesson.view.plugged)));
  await tabTo('#replayBtn');
  const ring = await L(page, () => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`; });
  check('keyboard: the focused button shows a visible focus ring', /solid 3px/.test(ring), ring);
  check('keyboard: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= phone 400 × 820 (touch) ================= */
{
  const { ctx, page, errs } = await open(browser, { viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const sw = await L(page, () => document.documentElement.scrollWidth);
  check('A17 phone 400 px: no sideways scroll', sw <= 400, `scrollWidth ${sw}`);
  const ovp = await labelOverlaps(page);
  check('phone: no part or pin labels overlap', ovp.length === 0, ovp.join('; '));
  await page.screenshot({ path: `${OUT}/mobile_step0_viewport.png` });
  await page.screenshot({ path: `${OUT}/mobile_step0_full.png`, fullPage: true });
  const vp = await page.locator('.viewport').boundingBox();
  check('phone: 3D viewport comes first and is tall enough', vp.y < 300 && vp.height >= 380, `top ${Math.round(vp.y)}, height ${Math.round(vp.height)}`);
  const s = await at(page, { part: 'controller' });
  await page.touchscreen.tap(s.x, s.y); await sleep(400);
  let t = await inspectText(page);
  check('phone: tapping the ESP32 with a finger names it', /ESP32 DevKit/.test(t));
  const pd = await at(page, { pin: 'near:D25' });
  await page.touchscreen.tap(pd.x, pd.y); await sleep(400);
  t = await inspectText(page);
  check('phone: tapping right on pin D25 still picks the pin', /Pin D25/.test(t), t.split('\n')[1] || t);
  const h = await at(page, { hole: [15, 'b'] });
  await page.touchscreen.tap(h.x, h.y); await sleep(400);
  t = await inspectText(page);
  check('phone: tapping a hole identifies it (b15 → yellow signal wire)', /Hole b15/.test(t) && /yellow signal wire/.test(t), t.split('\n')[0]);
  const small = await L(page, () => [...document.querySelectorAll('.nav .btn, .vtools button, .btn.mode')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44).length);
  check('phone: main buttons are at least 44 px tall', small === 0, `${small} smaller`);
  await page.click('[data-mode="practice"]'); await page.click('#nextBtn'); await sleep(1500);
  await page.screenshot({ path: `${OUT}/mobile_step1_viewport.png` });
  check('phone: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= tablet 768 × 1024 ================= */
{
  const { ctx, page, errs } = await open(browser, { viewport: { width: 768, height: 1024 }, hasTouch: true });
  const sw = await L(page, () => document.documentElement.scrollWidth);
  check('tablet 768 px: no sideways scroll', sw <= 768, `scrollWidth ${sw}`);
  const ovt = await labelOverlaps(page);
  check('tablet: no part or pin labels overlap', ovt.length === 0, ovt.join('; '));
  await page.screenshot({ path: `${OUT}/tablet_step0.png` });
  check('tablet: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= reduced motion ================= */
{
  const { ctx, page, errs } = await open(browser, { viewport: { width: 1400, height: 860 }, reducedMotion: 'reduce' });
  await L(page, () => window.__lesson.goTo(2)); await sleep(300);
  const r = await L(page, () => ({ rm: window.__lesson.kit.reduceMotion, callouts: document.querySelectorAll('#labels .callout').length }));
  check('A18 reduced motion: kit sees it; the strips demo shows at once (no waiting animation)', r.rm && r.callouts === 4, `callouts after 0.3 s: ${r.callouts}`);
  check('reduced motion: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= storage blocked ================= */
{
  const { ctx, page, errs } = await open(browser, { viewport: { width: 1400, height: 860 } }, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });
  });
  await page.click('[data-mode="guided"]'); await sleep(200);
  check('A19 storage blocked: the lab still runs and says it can’t remember', await L(page, () => !!document.querySelector('#scene canvas')) && await page.locator('#task.done').count() === 1);
  check('storage blocked: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= three.js CDN unreachable ================= */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (r) => r.abort());
  const page = await ctx.newPage(); const errs = []; watch(page, errs);
  await page.goto(URL); await page.waitForFunction(() => window.__lesson, null, { timeout: 30000 }); await sleep(500);
  const t = await page.locator('#fallback').innerText().catch(() => '');
  check('A20 CDN down: honest limited fallback with retry, not a blank screen', /Limited version/.test(t) && /internet/.test(t) && /D25/.test(t) && await page.locator('#retry3d').isVisible());
  await page.screenshot({ path: `${OUT}/fallback_cdn.png` });
  await ctx.close();
}
await browser.close();

/* ================= no WebGL at all ================= */
{
  const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis', '--disable-gpu'] });
  const ctx = await b2.newContext({ viewport: { width: 400, height: 820 } });
  const page = await ctx.newPage(); const errs = []; watch(page, errs);
  await page.goto(URL); await page.waitForFunction(() => window.__lesson, null, { timeout: 30000 }); await sleep(500);
  const t = await page.locator('#fallback').innerText().catch(() => '');
  check('A20 no WebGL: limited text version, clearly marked, wiring listed', /Limited version/.test(t) && /WebGL/.test(t) && /330 Ω/.test(t));
  const sw = await L(page, () => document.documentElement.scrollWidth);
  check('no WebGL at 400 px: no sideways scroll, no script errors', sw <= 400 && errs.length === 0, `scrollWidth ${sw}; ${errs.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/fallback_nowebgl_400.png`, fullPage: true });
  await b2.close();
}

server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
