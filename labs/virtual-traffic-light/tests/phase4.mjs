// Phase 4 browser checks: workshop isolation, multi-touch gestures, accessibility audit (axe-core) on every step,
// LEDs never hidden by labels, progress recovery, phone navigation, and the whole lab completed with the keyboard only.
// Touch gestures are sent through Chromium's own touch input (DevTools protocol): that is emulation, NOT a real phone.
// Run: cd labs/virtual-traffic-light/tests && npm run phase4
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '.out', 'phase4');
mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, evidence) { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${evidence ? '  — ' + evidence : ''}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const URL = `http://127.0.0.1:${port}/labs/virtual-traffic-light/index.html`;
for (let i = 0; i < 50; i++) { try { await fetch(URL); break; } catch (e) { await sleep(100); } }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const KEY = 'iotkids.virtualLab.trafficLight.v1';

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForFunction(() => window.__lesson && window.__lesson.kit, null, { timeout: 30000 }); await sleep(900);
  return { ctx, page, errs };
}
const L = (page, fn, arg) => page.evaluate(fn, arg);
const fb = (page) => page.locator('#fbBox').innerText();
const saved = (page) => L(page, (k) => JSON.parse(localStorage.getItem(k)), KEY);
async function setupTo(page, id) {
  await L(page, (id) => { const l = window.__lesson; l.state.mode = 'guided'; l.buildUpTo('-'); for (const s of l.STEPS) { if (s.id === id) break; l.done(s.id); } l.view.setPlugged(false); l.goTo(l.idx(id)); }, id);
  await sleep(500);
}
async function tapAt(page, q) { const s = await L(page, (q) => window.__lesson.screenOf(q), q); await page.mouse.click(s.x, s.y); await sleep(250); }

/* ================= 1. the fix-it workshop never touches the learner's own circuit ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 1400, height: 860 } });
  await setupTo(page, 'fix-it');
  // make the learner's circuit their own: the shared ground wire in rail hole 28 instead of 30 (still correct)
  await L(page, () => { const l = window.__lesson; l.goTo(l.idx('run')); });
  await sleep(300);
  await page.click('#expToggle'); await page.selectOption('#expSel', 'gnd'); await page.click('[data-x="move-b"]'); await tapAt(page, { rail: ['BN', 28] }); await sleep(300);
  const own = await L(page, () => JSON.stringify(window.__lesson.state.build));
  check('setup: the learner’s own circuit (ground wire in rail hole 28) is correct and saved', JSON.parse(own).gnd.b.c === 28 && await L(page, () => window.__lesson.check().ok) && JSON.stringify((await saved(page)).build) === own);
  await page.click('#nextBtn'); await sleep(800);
  let sv = await saved(page);
  check('workshop round 1: the bench shows a copy with a fault (and the learner’s rail hole 28)', await L(page, () => !window.__lesson.check().ok && window.__lesson.state.build.gnd.b.c === 28) && sv.workshop && sv.workshop.id === 'reverse-red');
  check('…while the saved learner circuit is untouched', JSON.stringify(sv.build) === own);
  // an unrelated edit to the copy, then a reload in the middle of the round
  await page.selectOption('#expSel', 'gw-yellow'); await page.click('[data-x="move-b"]'); await tapAt(page, { rail: ['BN', 17] }); await sleep(300);
  await page.reload(); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(800);
  check('reload mid-round: the lab opens on the learner’s own circuit', await L(page, () => JSON.stringify(window.__lesson.state.build)) === own);
  await page.click('#resumeBtn'); await sleep(800);
  check('“Carry on” resumes the same round, with the edit made before the reload', await L(page, () => window.__lesson.state.build['gw-yellow'].b.c === 17 && window.__lesson.state.build['led-red'].a.c === 8));
  await page.click('#prevBtn'); await sleep(500);
  sv = await saved(page);
  check('leaving the workshop (Back) puts the learner’s own circuit back, the copy is discarded', await L(page, () => JSON.stringify(window.__lesson.state.build)) === own && sv.workshop === null && JSON.stringify(sv.build) === own);
  await page.click('#nextBtn'); await sleep(800);
  await page.selectOption('#expSel', 'led-red'); await page.click('[data-x="flip"]'); await sleep(2000);
  check('finishing a round: “Fixed!”, then the learner’s own circuit returns', /Fixed!/.test(await fb(page)) && await L(page, () => JSON.stringify(window.__lesson.state.build)) === own);
  await page.screenshot({ path: `${OUT}/01_workshop_restored.png` });
  // the other two rounds, then the whole workshop is done
  // a quick “Next fault” (before the previous round's restore runs) must not lose the new round's fault
  await page.click('#nextRound'); await sleep(2000);
  check('a quick “Next fault” keeps the new round’s fault on the bench (round 2: wires swapped)', await L(page, () => window.__lesson.state.workshop && window.__lesson.state.workshop.id === 'swap-red-yellow' && window.__lesson.state.build['sig-red'].a.id === 'near:D26'));
  await page.selectOption('#expSel', 'sig-red'); await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D14' });
  await page.selectOption('#expSel', 'sig-yellow'); await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D26' });
  await page.selectOption('#expSel', 'sig-red'); await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D25' }); await sleep(300);
  await page.click('#nextRound'); await sleep(2200); // straight away, before round 2's delayed restore would have run
  check('“Next fault” pressed straight after a fix: round 3’s fault is still on the bench 2 s later (no race)', await L(page, () => window.__lesson.state.workshop && window.__lesson.state.workshop.id === 'no-res-yellow' && window.__lesson.state.build['res-yellow'].type === 'wire'));
  await page.click('[data-x="hint"]'); await page.click('[data-x="hint"]'); await page.click('[data-x="fixit"]'); await sleep(2000);
  sv = await saved(page);
  check('all three rounds done: the step is complete and the learner’s circuit is back, saved, unchanged', await page.locator('#task.done').count() === 1 && await L(page, () => JSON.stringify(window.__lesson.state.build)) === own && JSON.stringify(sv.build) === own && sv.workshop === null);
  check('workshop: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= 2. two-finger gestures (emulated through Chromium's touch input) ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  const cdp = await ctx.newCDPSession(page);
  await page.locator('.viewport').scrollIntoViewIfNeeded(); await sleep(300);
  const box = await page.locator('#scene canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const cam = () => L(page, () => { const k = window.__lesson.kit; return { p: k.camera.position.toArray(), t: k.controls.target.toArray() }; });
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  async function twoFinger(from, to) {
    const pts = (f) => f.map(([x, y], id) => ({ x, y, id }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
    for (let i = 1; i <= 10; i++) {
      const k = i / 10;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from.map(([x, y], j) => [x + (to[j][0] - x) * k, y + (to[j][1] - y) * k])) });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  }
  const c0 = await cam();
  await twoFinger([[cx - 30, cy], [cx + 30, cy]], [[cx - 110, cy], [cx + 110, cy]]);
  const c1 = await cam();
  check('pinch out (two fingers apart) zooms in', dist(c1.p, c1.t) < dist(c0.p, c0.t) - 0.3, `${dist(c0.p, c0.t).toFixed(2)} → ${dist(c1.p, c1.t).toFixed(2)}`);
  await twoFinger([[cx - 40, cy], [cx + 40, cy]], [[cx - 40, cy + 90], [cx + 40, cy + 90]]);
  const c2 = await cam();
  check('two-finger drag slides the view (pan)', dist(c1.t, c2.t) > 0.2, `target moved ${dist(c1.t, c2.t).toFixed(2)}`);
  const s0 = await cam();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx + 60, y: cy + 60 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 60 - i * 15, y: cy + 60 }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(700);
  const s1 = await cam();
  check('one-finger drag spins the view, and is not taken as a tap', dist(s0.p, s1.p) > 0.5 && !(await page.locator('#inspectBox').innerText()), `camera moved ${dist(s0.p, s1.p).toFixed(2)}`);
  check('touch gestures: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= 3. accessibility audit on every step, desktop and phone ================= */
for (const [w, h] of [[1400, 860], [400, 820]]) {
  const { ctx, page } = await open({ viewport: { width: w, height: h } });
  await page.addScriptTag({ content: AXE });
  const found = [];
  for (let i = 0; i < 24; i++) {
    await L(page, (i) => {
      const l = window.__lesson; l.state.mode = 'guided';
      l.buildUpTo(l.STEPS[i].task === 'place' ? l.STEPS[i].id : '-'); for (const x of l.STEPS.slice(0, i)) l.done(x.id); l.goTo(i);
      if (l.STEPS[i].id === 'inspect') document.querySelector('#checkBtn').click();
      if (l.STEPS[i].id === 'run') { document.querySelector('[data-sim="plug"]').click(); document.querySelector('[data-sim="run"]').click(); }
      if (l.STEPS[i].id === 'quiz') document.querySelectorAll('[data-a]').forEach((b) => b.click());
    }, i);
    await sleep(800); // let fade-in animations finish: half-faded text is not a real contrast problem
    const v = await L(page, async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}(${x.nodes.length}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('; ')})`));
    if (v.length) found.push(`step ${i + 1}: ${v.join(', ')}`);
  }
  check(`axe-core (WCAG 2.2 A/AA rules) on all 24 steps at ${w} px: no violations`, found.length === 0, found.slice(0, 4).join(' | '));
  await ctx.close();
}

/* ================= 4. the LEDs are never hidden by labels or cards ================= */
for (const [w, h, o] of [[1400, 860, {}], [400, 820, { hasTouch: true, isMobile: true }]]) {
  const { ctx, page } = await open({ viewport: { width: w, height: h }, ...o });
  const hidden = [];
  for (const id of ['inspect', 'run', 'make-yours']) {
    await setupTo(page, id);
    await page.locator('.viewport').scrollIntoViewIfNeeded(); await sleep(400);
    const r = await L(page, () => ['led-red', 'led-yellow', 'led-green'].map((led) => {
      const p = window.__lesson.screenOf({ placed: led });
      const covering = [...document.querySelectorAll('#labels .lbl > span, #hud, #tip, .vtools button, .hand')].filter((e) => {
        if (e.closest('[hidden]') || getComputedStyle(e).display === 'none' || (e.parentElement && e.parentElement.style.display === 'none')) return false;
        const b = e.getBoundingClientRect(); return b.width && p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom;
      }).map((e) => (e.textContent || e.id).trim().slice(0, 20));
      return covering.length ? `${led}: ${covering.join(',')}` : null;
    }).filter(Boolean));
    hidden.push(...r.map((x) => `${id} ${x}`));
  }
  check(`${w} px: no label, card or button covers the middle of any LED`, hidden.length === 0, hidden.join(' | '));
  await ctx.close();
}

/* ================= 5. progress recovery ================= */
for (const [name, value] of [['not JSON at all', '{oops'], ['a different schema version', JSON.stringify({ schemaVersion: 9, currentStep: 20 })],
  ['broken workshop and build', JSON.stringify({ schemaVersion: 1, currentStep: 21, completedStepIds: ['welcome'], workshop: { id: '../../etc', build: 'x' }, build: { 'led-red': { type: 'led', a: { k: 'hole', c: 70, r: 'z' } } }, quizFirst: [1, {}], program: { pattern: 'classic', vars: { GREEN_S: 1e9 } } })]]) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seed')) { sessionStorage.setItem('seed', '1'); localStorage.setItem(k, v); } }, [KEY, value]);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(600);
  const st = await L(page, () => ({ step: window.__lesson.step, parts: Object.keys(window.__lesson.state.build).length, green: window.__lesson.runner.gen.program.vars.GREEN_S }));
  check(`saved progress “${name}”: the lab still opens, cleanly, at step 1`, errs.length === 0 && st.step === 0 && st.parts === 0 && st.green <= 30, JSON.stringify(st) + errs.join('|'));
  await ctx.close();
}

/* ================= 6. phone navigation ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true });
  await setupTo(page, 'read-code');
  await L(page, () => scrollTo(0, document.body.scrollHeight)); await sleep(300);
  const nav = await L(page, () => { const n = document.querySelector('.nav').getBoundingClientRect(); return n.bottom <= innerHeight + 1 && n.top < innerHeight; });
  check('phone: Back / Replay / Next stay on screen at the bottom of a long step', nav);
  await page.tap('#prevBtn'); await sleep(900);
  const v = await L(page, () => { const r = document.querySelector('.viewport').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight * 0.4; });
  check('phone: after Back, the 3D bench is in view again with the step on its card', v && /Connect the USB cable/.test(await page.locator('#tip').innerText()));
  await page.tap('#nextBtn'); await sleep(900);
  await page.locator('.codebox').scrollIntoViewIfNeeded();
  const code = await L(page, () => { const r = document.querySelector('.code').getBoundingClientRect(); return r.height > 150 && r.width > 300; });
  check('phone: the code panel is reachable and readable below the bench', code);
  await page.screenshot({ path: `${OUT}/02_phone_code.png` });
  check('phone navigation: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= 7. the whole lab with the keyboard only ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 1400, height: 860 } });
  const focusIs = (sel) => L(page, (s) => !!document.activeElement && document.activeElement.matches(s), sel);
  async function tabTo(sel, max = 250) { if (await focusIs(sel)) return true; for (let i = 0; i < max; i++) { await page.keyboard.press('Tab'); if (await focusIs(sel)) return true; } throw new Error('cannot reach ' + sel); }
  async function press(sel) { await tabTo(sel); await page.keyboard.press('Enter'); await sleep(250); }
  async function next() { await press('#nextBtn'); await sleep(1400); }
  async function pickHole(r, c) { await tabTo('#pkRow'); await page.keyboard.type(r); await page.keyboard.press('Tab'); await page.keyboard.type(String(c)); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(250); }
  async function pickRail(c) { await tabTo('#pkRailCol'); await page.keyboard.type(String(c)); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(250); }
  async function pickPin(n) { await tabTo('#pkPin'); await page.keyboard.type(n); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(250); }
  async function choosePart(id) { await tabTo('#expSel'); await page.keyboard.press('Home'); for (let i = 0; i < 20 && !(await L(page, (id) => document.querySelector('#expSel').value === id, id)); i++) await page.keyboard.press('ArrowDown'); await sleep(200); }
  const stepId = () => L(page, () => window.__lesson.STEPS[window.__lesson.step].id);
  try {
    await press('[data-mode="guided"]'); await next();
    await press('#picker summary');
    for (const k of ['E', 'B', 'G', '3', 'J', 'U']) { await tabTo('#pkPart'); await page.keyboard.type(k); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(200); }
    await next();
    for (const [r, c] of [['a', 3], ['h', 12], ['c', 20], ['e', 7]]) await pickHole(r, c);
    await next();
    await press('#unplugBtn'); await next();
    for (const ch of [{ c: 7, pin: 'D25' }, { c: 15, pin: 'D26' }, { c: 23, pin: 'D27' }]) {
      await pickHole('d', ch.c); await pickHole('g', ch.c); await sleep(1200); await next();
      await pickHole('i', ch.c); await pickHole('i', ch.c + 1); await sleep(1200); await next();
      await pickHole('j', ch.c + 1); await pickRail(ch.c + 1); await sleep(1200); await next();
      await pickPin(ch.pin); await pickHole('b', ch.c); await sleep(1200); await next();
    }
    await pickPin('GND'); await pickRail(30); await sleep(1500); await next();
    await press('#checkBtn'); await next();
    await press('#plugBtn'); for (const n of ['D25', 'D26', 'D27']) await press(`[data-pin="${n}"]`); await next();
    for (const t of ['from machine import Pin', 'red = Pin(25, Pin.OUT)', 'while True:', 'red.value(1)', 'time.sleep(RED_S)']) {
      await tabTo('.code .cl'); for (let i = 0; i < 40 && !(await L(page, (t) => document.activeElement.textContent.trim() === t, t)); i++) await page.keyboard.press('Tab');
      await page.keyboard.press('Enter'); await sleep(150);
    }
    await next();
    if (!(await L(page, () => window.__lesson.view.plugged))) await press('[data-sim="plug"]');
    await press('[data-sim="run"]'); await L(page, () => window.__lesson.runner.tick(12.5)); await press('[data-sim="pause"]'); await press('[data-sim="step"]'); await next();
    // fix-it: three rounds, keyboard only
    await choosePart('led-red'); await press('[data-x="flip"]'); await sleep(1800); await press('#nextRound'); await sleep(800);
    await choosePart('sig-red'); await press('[data-x="move-a"]'); await pickPin('D14');
    await choosePart('sig-yellow'); await press('[data-x="move-a"]'); await pickPin('D26');
    await choosePart('sig-red'); await press('[data-x="move-a"]'); await pickPin('D25'); await sleep(1800); await press('#nextRound'); await sleep(800);
    await press('[data-x="hint"]'); await press('[data-x="hint"]'); await press('[data-x="fixit"]'); await sleep(1800); await next();
    await press('[data-y="inc"][data-v="GREEN_S"]'); await press('[data-y="inc"][data-v="GREEN_S"]'); await press('[data-y="guess"][data-v="14"]');
    if (!(await L(page, () => window.__lesson.view.plugged))) await press('[data-sim="plug"]');
    await press('[data-sim="run"]'); await L(page, () => window.__lesson.runner.tick(14.5)); await next();
    for (const [q, a] of [['q-resistor', 0], ['q-pin', 1], ['q-ground', 2]]) await press(`[data-q="${q}"] [data-a="${a}"]`);
  } catch (e) { check('keyboard-only run reached the end', false, `stuck at ${await stepId()}: ${e.message} | Ohm: ${(await fb(page)).slice(0, 120)} | led-red ${await L(page, () => JSON.stringify(window.__lesson.state.build['led-red'].a))} | sel ${await L(page, () => window.__lesson.exp.selected)} | focus ${await L(page, () => document.activeElement.outerHTML.slice(0, 80))}`); }
  const done = await L(page, () => window.__lesson.STEPS.filter((s) => window.__lesson.state.done.has(s.id)).length);
  check('the whole lab, all 24 steps, completed with the keyboard only', done === 24 && await page.locator('#quizDone').count() === 1, `${done} of 24 steps done`);
  const sum = await page.locator('#quizDone').innerText().catch(() => '');
  check('summary: skills, building, code, repairs, quiz and a next lesson', /Skills/.test(sum) && /Building: parts placed\s*13 of 13/.test(sum) && /Code: lines explored, run, timing\s*3 of 3/.test(sum) && /Repairs: faults fixed\s*2 of 3\s*1/.test(sum) && /Quiz: right answers\s*3 of 3 first try/.test(sum) && /Lesson 1: My First Traffic Light/.test(sum), sum.replace(/\s+/g, ' ').slice(0, 200));
  await page.locator('#quizDone').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/03_keyboard_complete_summary.png` });
  check('keyboard-only run: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
