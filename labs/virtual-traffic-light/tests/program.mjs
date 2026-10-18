// Phase 3 browser checks: the code panel and the program running on the circuit, experiment mode, the fix-it
// workshop, timing changes, the quiz and the summary. Real clicks, taps and keys; simulated time is moved on with
// the runner's test hook where waiting 12 real seconds would only slow the test down.
// Run: cd labs/virtual-traffic-light/tests && npm run program
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '.out', 'program');
mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, evidence) { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${evidence ? '  — ' + evidence : ''}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const URL = `http://127.0.0.1:${port}/labs/virtual-traffic-light/index.html`;
for (let i = 0; i < 50; i++) { try { await fetch(URL); break; } catch (e) { await sleep(100); } }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForFunction(() => window.__lesson && window.__lesson.kit, null, { timeout: 30000 }); await sleep(1000);
  return { ctx, page, errs };
}
const L = (page, fn, arg) => page.evaluate(fn, arg);
const fb = (page) => page.locator('#fbBox').innerText();
// the circuit built and every earlier step finished (building is tested in assembly.mjs), then open a step
async function setupTo(page, id, plugged) {
  await L(page, ([id, plugged]) => {
    const l = window.__lesson;
    l.state.mode = 'guided';
    l.buildUpTo('nothing-after-this');
    for (const s of l.STEPS) { if (s.id === id) break; l.done(s.id); }
    l.view.setPlugged(false); // as after "Safety before power": the cable is out until the learner plugs it in
    l.goTo(l.idx(id));
    if (plugged) document.querySelector('[data-sim="plug"]') ? document.querySelector('[data-sim="plug"]').click() : null;
  }, [id, plugged]);
  await sleep(400);
}
const leds = (page) => L(page, () => ['led-red', 'led-yellow', 'led-green'].filter((id) => window.__lesson.view.ledLevel(id) > 0).map((id) => id.slice(4)).join('+') || 'none');
const nowLine = (page) => L(page, () => { const li = document.querySelector('.code li.now'); return li ? li.innerText.trim() : null; });
const chips = (page) => L(page, () => document.querySelector('.pinchips').innerText.replace(/\s+/g, ' ').trim());
const tick = (page, s) => L(page, (s) => window.__lesson.runner.tick(s), s);
async function tapAt(page, q, touch) { const s = await L(page, (q) => window.__lesson.screenOf(q), q); if (touch) await page.touchscreen.tap(s.x, s.y); else await page.mouse.click(s.x, s.y); await sleep(250); }

/* ================= desktop ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 1400, height: 860 } });

  // read the code
  await setupTo(page, 'read-code', true);
  check('read-code: the code panel shows the course-style program beside the bench', /from machine import Pin/.test(await page.locator('.code').innerText()) && /time\.sleep\(RED_S\)/.test(await page.locator('.code').innerText()));
  for (const text of ['from machine import Pin', 'red = Pin(25, Pin.OUT)', 'while True:', 'red.value(1)', 'time.sleep(RED_S)']) {
    await page.locator('.code .cl', { hasText: text }).first().click(); await sleep(150);
  }
  let t = await page.locator('#inspectBox').innerText();
  check('tapping a line explains it (time.sleep waits, lights stay as they are)', /waits 5 seconds/.test(t), t.slice(0, 80));
  check('read-code: tapping all 5 kinds of line completes the step', await page.locator('#task.done').count() === 1);
  await page.locator('.code .cl', { hasText: 'red = Pin(25, Pin.OUT)' }).first().click(); await sleep(200);
  t = await page.locator('#inspectBox').innerText();
  check('Pin(25) is explained as GPIO 25, printed D25, wired to the red light', /GPIO 25/.test(t) && /D25/.test(t) && /red light/.test(t));
  await page.screenshot({ path: `${OUT}/01_read_code.png` });

  // run
  await page.click('#nextBtn'); await sleep(800);
  check('run: no USB power yet means Run is refused, pins have no power', /no power/.test(await chips(page)) || await L(page, () => window.__lesson.view.plugged));
  if (!(await L(page, () => window.__lesson.view.plugged))) { await page.click('[data-sim="run"]'); check('Run without power is refused with a reason', /Plug in the USB cable first/.test(await fb(page))); await page.click('[data-sim="plug"]'); await sleep(200); }
  check('run: plugged in, program stopped: every LED off', await leds(page) === 'none');
  await page.click('[data-sim="run"]'); await sleep(300);
  check('Run: red phase — line “time.sleep(RED_S)” highlighted, D25 HIGH, only the red LED lit', /time\.sleep\(RED_S\)/.test(await nowLine(page)) && /D25 HIGH/.test(await chips(page)) && /D26 LOW/.test(await chips(page)) && await leds(page) === 'red', `${await nowLine(page)} | ${await chips(page)} | ${await leds(page)}`);
  check('the 3D pin label shows D25 HIGH, and the active path glows', await L(page, () => /D25 · Red\s*HIGH/.test(document.querySelector('#labels').innerText)) && await L(page, () => window.__lesson.view.glowCount()) > 0);
  check('the status card over the bench says what is running', /Red light: stop/.test(await page.locator('#hud').innerText()) && await page.locator('#hud').isVisible());
  await page.screenshot({ path: `${OUT}/02_run_red.png` });
  const t0 = await L(page, () => window.__lesson.runner.state.t); await sleep(1500); const t1 = await L(page, () => window.__lesson.runner.state.t);
  check('real time drives the clock (1.5 s of real time ≈ 1.5 s simulated, not slowed by the frame rate)', t1 - t0 > 1.1 && t1 - t0 < 2.0, `${(t1 - t0).toFixed(2)} s`);
  await tick(page, 5 - t1 + 0.2);
  check('after RED_S: green only, D27 HIGH, line time.sleep(GREEN_S)', await leds(page) === 'green' && /D27 HIGH/.test(await chips(page)) && /GREEN_S/.test(await nowLine(page)));
  await page.screenshot({ path: `${OUT}/03_run_green.png` });
  await tick(page, 5);
  check('after GREEN_S: yellow only', await leds(page) === 'yellow' && /D26 HIGH/.test(await chips(page)));
  await tick(page, 2);
  check('after YELLOW_S: back to red, one full cycle counted', await leds(page) === 'red' && /One full cycle/.test(await fb(page)));
  await page.click('[data-sim="pause"]'); const tp = await L(page, () => window.__lesson.runner.state.t); await sleep(1200);
  check('Pause: the clock stops, the red light stays on', await L(page, () => window.__lesson.runner.state.t) === tp && await leds(page) === 'red' && /⏸/.test(await page.locator('#hud').innerText()));
  const before = await nowLine(page);
  await page.click('[data-sim="step"]'); await sleep(200);
  check('Step: one line forward (the red sleep finishes, the next line is highlighted)', await nowLine(page) !== before, `${before} → ${await nowLine(page)}`);
  check('run step complete (run, cycle, pause, step)', await page.locator('#task.done').count() === 1);
  await page.click('[data-sim="run"]'); await sleep(300);
  check('Resume after pause carries on running', await L(page, () => window.__lesson.runner.state.status) === 'running');
  await page.click('[data-sim="stop"]'); await sleep(200);
  check('Stop: pins released, every LED off, status card hidden', await leds(page) === 'none' && /D25 off/.test(await chips(page)) && await page.locator('#hud').isHidden());
  await page.click('[data-sim="plug"]'); await sleep(200);
  await page.click('[data-sim="run"]'); await sleep(200);
  check('unplugged: Run refused, chips say “no power”, nothing lit', /Plug in the USB cable first/.test(await fb(page)) && /no power/.test(await chips(page)) && await leds(page) === 'none');
  await page.click('[data-sim="plug"]'); await sleep(200);

  // experiment mode on the learner's own build
  await page.click('#expToggle'); await sleep(200);
  await tapAt(page, { placed: 'led-red' });
  check('experiment: tapping the red LED selects it', /Selected: <b>|Selected:/.test(await fb(page)) && /Red LED/.test(await fb(page)));
  await page.click('[data-x="flip"]'); await sleep(300);
  let e = await page.locator('.exp').innerText();
  check('flip the LED (power goes off first), checker: backwards but still safe', /backwards/.test(e) && /Safe to plug in: yes/.test(e) && !(await L(page, () => window.__lesson.view.plugged)));
  check('desktop: the + long / − short / 330 Ω tags are shown', await L(page, () => [...document.querySelectorAll('#labels .lbl.part-tag')].filter((e) => e.style.display !== 'none').length) >= 6);
  check('the “+ long” label now sits on the ground side (i8)', await L(page, () => { const b = window.__lesson.state.build['led-red']; return b.a.c === 8; }));
  await page.click('[data-sim="plug"]'); await sleep(200); await page.click('[data-sim="run"]'); await sleep(300);
  check('runs on the miswired board: D25 HIGH but the backwards red LED stays dark', /D25 HIGH/.test(await chips(page)) && await leds(page) === 'none');
  await page.screenshot({ path: `${OUT}/04_experiment_reversed_running.png` });
  await page.click('[data-x="undo"]'); await sleep(300);
  check('Undo puts it back (and unplugs first)', await L(page, () => window.__lesson.state.build['led-red'].a.c) === 7 && !(await L(page, () => window.__lesson.view.plugged)));
  // wrong pin
  await page.selectOption('#expSel', 'sig-green'); await sleep(200);
  await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D26' }); await sleep(300);
  check('a pin holds one jumper: moving the green wire onto D26 (yellow’s pin) is refused', /already has the Yellow wire/.test(await fb(page)));
  await tapAt(page, { pin: 'near:D14' }); await sleep(300);
  e = await page.locator('.exp').innerText();
  check('move the green wire to D14: checker says wired to D14, not D27', /wired to D14, not D27/.test(e));
  await page.click('[data-sim="plug"]'); await sleep(200); await page.click('[data-sim="run"]'); await sleep(200); await tick(page, 5.5);
  check('runs: in the green phase (D27 HIGH) the green LED stays dark, its wire is on D14', /D27 HIGH/.test(await chips(page)) && await leds(page) === 'none');
  await page.screenshot({ path: `${OUT}/05_experiment_wrong_pin.png` });
  await page.click('[data-x="undo"]'); await sleep(200);
  // dangerous: red wire into the ground rail
  await page.selectOption('#expSel', 'sig-red'); await page.click('[data-x="move-b"]'); await tapAt(page, { rail: ['BN', 10] }); await sleep(300);
  e = await page.locator('.exp').innerText();
  check('wire D25 straight into the − rail: DANGER, short circuit, not safe', /short circuit/i.test(e) && /NO: the USB cable stays unplugged/.test(e));
  await page.click('[data-sim="plug"]'); await sleep(200);
  check('the unsafe circuit is refused power', !(await L(page, () => window.__lesson.view.plugged)) && /Not safe to plug in/.test(await fb(page)));
  await page.screenshot({ path: `${OUT}/06_experiment_short.png` });
  await page.click('[data-x="undo"]'); await sleep(200);
  check('after undo the circuit matches the plan again', await L(page, () => window.__lesson.check().ok));

  // fix-it workshop
  await page.click('#nextBtn'); await sleep(800);
  check('fix-it round 1: the bench now has a fault, power off', /Round 1 of 3/.test(await page.locator('.exp').innerText()) && !(await L(page, () => window.__lesson.check().ok)) && !(await L(page, () => window.__lesson.view.plugged)));
  await page.selectOption('#expSel', 'led-red'); await page.click('[data-x="flip"]'); await sleep(300);
  check('round 1 fixed by flipping the LED', /Fixed!/.test(await fb(page)) && /backwards/i.test(await fb(page)));
  await page.click('#nextRound'); await sleep(600);
  await page.click('[data-sim="plug"]'); await sleep(150); await page.click('[data-sim="run"]'); await sleep(200); await tick(page, 10.5);
  check('round 2 (wires swapped): running it, the RED LED lights in the yellow phase', await leds(page) === 'red' && /D26 HIGH/.test(await chips(page)));
  check('the chips separate the code from the wiring: “D25 LOW” but “Red ON”', /D25 LOW/.test(await chips(page)) && /Red ON/.test(await chips(page)), await chips(page));
  check('the running line (time.sleep(YELLOW_S)) is scrolled into view inside the code box', await L(page, () => { const li = document.querySelector('.code li.now'), box = document.querySelector('.code'); const a = li.getBoundingClientRect(), b = box.getBoundingClientRect(); return /YELLOW_S/.test(li.innerText) && a.top >= b.top && a.bottom <= b.bottom; }));
  await page.screenshot({ path: `${OUT}/07a_fixit_swapped_running.png` });
  await page.selectOption('#expSel', 'sig-red'); await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D14' });
  await page.selectOption('#expSel', 'sig-yellow'); await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D26' });
  await page.selectOption('#expSel', 'sig-red'); await page.click('[data-x="move-a"]'); await tapAt(page, { pin: 'near:D25' }); await sleep(300);
  check('round 2 fixed by hand: park red on a free pin, yellow to D26, red to D25', /Fixed!/.test(await fb(page)) && /swapped/.test(await fb(page)));
  await page.click('#nextRound'); await sleep(600);
  await page.click('[data-sim="plug"]'); await sleep(200);
  check('round 3 is dangerous: plugging in is refused', /Not safe to plug in/.test(await fb(page)));
  e = await page.locator('.exp').innerText();
  check('round 3 hint 1 says what and why only', /too much current/.test(e) && !/joined straight to the pin/.test(e));
  await page.click('[data-x="hint"]'); await sleep(150); await page.click('[data-x="hint"]'); await sleep(150);
  check('hints 2 and 3 add where and what to do; then “Show me the fix” and “Fix it for me”', /joined straight to the pin/.test(await page.locator('.exp').innerText()) && await page.locator('[data-x="fixit"]').count() === 1);
  await page.click('[data-x="showfix"]'); await sleep(200);
  await page.screenshot({ path: `${OUT}/07_fixit_round3_hints.png` });
  await page.click('[data-x="fixit"]'); await sleep(400);
  check('“Fix it for me” repairs it, the workshop is done (one with help)', await page.locator('#task.done').count() === 1 && /one with help/.test(await fb(page)) && await L(page, () => window.__lesson.check().ok));

  // make it yours
  await page.click('#nextBtn'); await sleep(800);
  await page.click('[data-y="inc"][data-v="GREEN_S"]'); await page.click('[data-y="inc"][data-v="GREEN_S"]'); await sleep(200);
  const code = await page.locator('.code').innerText();
  check('GREEN_S + + : the code now says GREEN_S = 7', /GREEN_S = 7/.test(code));
  await page.click('[data-y="guess"][data-v="16"]').catch(() => {}); await sleep(100);
  await page.click('[data-y="guess"][data-v="14"]'); await sleep(200);
  check('prediction: one cycle = 5 + 7 + 2 = 14 s', /14 s/.test(await fb(page)));
  await page.click('[data-sim="plug"]').catch(() => {}); await sleep(100);
  if (!(await L(page, () => window.__lesson.view.plugged))) await page.click('[data-sim="plug"]');
  await page.click('[data-sim="run"]'); await sleep(200);
  await tick(page, 5.5);
  check('the new green time is used: still green at 11.5 s (would be yellow with 5 s)', await leds(page) === 'green' || (await tick(page, 6), await leds(page) === 'green'));
  await tick(page, 9);
  check('make-yours complete after a whole cycle of the new program', await page.locator('#task.done').count() === 1);
  await page.screenshot({ path: `${OUT}/08_make_yours.png` });
  await page.click('[data-y="pattern"][data-v="custom"]'); await sleep(150);
  await page.click('[data-y="ph-light"][data-i="0"][data-v="green"]'); await sleep(150);
  await page.click('[data-sim="run"]'); await sleep(150);
  check('my own pattern with red and green together is refused before it runs', /must never do that/.test(await fb(page)) && await L(page, () => window.__lesson.runner.state.status) !== 'running');
  await page.screenshot({ path: `${OUT}/09_custom_red_green_refused.png` });
  await page.click('[data-y="pattern"][data-v="classic"]'); await sleep(150);

  // quiz
  await page.click('#nextBtn'); await sleep(800);
  await page.locator('[data-q="q-resistor"] [data-a="1"]').click(); await sleep(150);
  check('quiz: a wrong answer gives a hint and allows another try', /Not quite/.test(await page.locator('[data-q="q-resistor"]').innerText()));
  await page.locator('[data-q="q-resistor"] [data-a="0"]').click(); await page.locator('[data-q="q-pin"] [data-a="1"]').click(); await page.locator('[data-q="q-ground"] [data-a="2"]').click(); await sleep(300);
  const sum = await page.locator('#quizDone').innerText().catch(() => '');
  check('completion summary: on your own vs with help', /Building: parts placed/.test(sum) && /Repairs: faults fixed\s*2 of 3\s*1/.test(sum) && /2 of 3 first try/.test(sum) && /Next/.test(sum), sum.replace(/\s+/g, ' ').slice(0, 160));
  await page.locator('#quizDone').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/10_summary.png` });

  // persistence
  await page.reload(); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(1000);
  const s2 = await L(page, () => ({ done: window.__lesson.STEPS.filter((s) => window.__lesson.state.done.has(s.id)).length, parts: window.__lesson.view.placedIds().length, solved: window.__lesson.state.solved.size }));
  check('reload: every step, the 13 parts and the 3 fixes come back', s2.done === 24 && s2.parts === 13 && s2.solved === 3, JSON.stringify(s2));
  check('desktop: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= broken saved progress ================= */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1);
    localStorage.setItem('iotkids.virtualLab.trafficLight.v1', JSON.stringify({ schemaVersion: 1, currentStep: 'x', mode: 'hacker', completedStepIds: ['quiz', 5],
      build: { evil: { type: 'led', a: '<img src=x onerror=alert(1)>', b: null }, 'sig-red': { type: 'wire', a: { k: 'pin', id: 'near:D99' }, b: { k: 'hole', c: 7, r: 'b' } } },
      program: { pattern: 'rm -rf', vars: { RED_S: 'NaN' } } })); } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { errs.push('dialog!'); d.dismiss(); });
  await page.goto(URL); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(800);
  const r = await L(page, () => ({ step: window.__lesson.step, parts: Object.keys(window.__lesson.state.build), prog: window.__lesson.runner.gen.program.pattern }));
  check('invalid saved progress: no crash, bad parts and settings dropped, defaults used', errs.length === 0 && r.step === 0 && r.parts.length === 1 && r.prog === 'classic', JSON.stringify(r) + errs.join('|'));
  await ctx.close();
}

/* ================= keyboard only ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 1400, height: 860 } });
  await setupTo(page, 'run', false);
  async function tabTo(sel, max = 120) { for (let i = 0; i < max; i++) { await page.keyboard.press('Tab'); if (await L(page, (s) => document.activeElement && document.activeElement.matches(s), sel)) return true; } return false; }
  await tabTo('[data-sim="plug"]'); await page.keyboard.press('Enter'); await sleep(150);
  await tabTo('[data-sim="run"]'); await page.keyboard.press('Enter'); await sleep(300);
  check('keyboard: plug in and Run with Tab + Enter', await L(page, () => window.__lesson.runner.state.status) === 'running' && await leds(page) === 'red');
  await tabTo('[data-sim="pause"]'); await page.keyboard.press('Enter'); await sleep(150);
  await tabTo('[data-sim="step"]'); await page.keyboard.press('Enter'); await sleep(150);
  check('keyboard: Pause and Step', await L(page, () => window.__lesson.runner.state.status) === 'paused');
  await tabTo('#expToggle'); await page.keyboard.press('Enter'); await sleep(150);
  await tabTo('#expSel'); await page.keyboard.press('ArrowDown'); for (let i = 0; i < 12 && !(await L(page, () => document.querySelector('#expSel').value === 'led-red')); i++) await page.keyboard.press('ArrowDown');
  await sleep(200);
  await tabTo('[data-x="flip"]'); await page.keyboard.press('Enter'); await sleep(300);
  check('keyboard: experiment mode, choose the red LED from the list, flip it', await L(page, () => window.__lesson.state.build['led-red'].a.c) === 8);
  await tabTo('[data-x="undo"]'); await page.keyboard.press('Enter'); await sleep(200);
  check('keyboard: undo', await L(page, () => window.__lesson.state.build['led-red'].a.c) === 7);
  check('keyboard: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= phone and reduced motion ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await setupTo(page, 'run', false);
  await page.tap('[data-sim="plug"]'); await page.tap('[data-sim="run"]'); await sleep(300);
  check('phone: Run by touch, red lit', await leds(page) === 'red');
  await page.locator('.viewport').scrollIntoViewIfNeeded(); await sleep(300);
  const hud = await L(page, () => { const h = document.querySelector('#hud').getBoundingClientRect(), v = document.querySelector('.viewport').getBoundingClientRect(); return { inside: h.top >= v.top && h.bottom <= v.bottom, share: (h.width * h.height) / (v.width * v.height) }; });
  check('phone: the status card sits inside the 3D view and covers little of it', hud.inside && hud.share < 0.2, `share ${hud.share.toFixed(2)}`);
  const covered = await L(page, () => [...document.querySelectorAll('#labels .lbl.part-tag')].filter((e) => e.style.display !== 'none').length);
  check('phone, zoomed out: no part tags covering the LEDs (they return when zoomed in)', covered === 0, `${covered} tags shown`);
  await page.screenshot({ path: `${OUT}/11_phone_run.png` });
  await page.locator('.codebox').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/12_phone_code.png` });
  const sw = await L(page, () => document.documentElement.scrollWidth);
  check('phone: no sideways scroll with the code panel', sw <= 400, `scrollWidth ${sw}`);
  check('reduced motion: kit knows, program still runs and glows', await L(page, () => window.__lesson.kit.reduceMotion) && await L(page, () => window.__lesson.view.glowCount()) > 0);
  await page.tap('#expToggle'); await sleep(200);
  await page.locator('.viewport').scrollIntoViewIfNeeded(); await sleep(300);
  await tapAt(page, { placed: 'led-green' }, true);
  check('phone: tap the green LED by touch in experiment mode to select it', await L(page, () => window.__lesson.exp.selected) === 'led-green');
  await page.screenshot({ path: `${OUT}/13_phone_experiment.png` });
  check('phone: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
