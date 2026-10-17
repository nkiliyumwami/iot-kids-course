// Phase 2 browser checks: build the whole circuit by tapping real holes and pins, make mistakes on purpose, undo,
// replay, check, try the circuit doctor, plug in and test each pin. Software WebGL (CPU only), like smoke.mjs.
// Run: cd labs/virtual-traffic-light/tests && npm run assembly
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '.out', 'assembly');
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
  await page.goto(URL); await page.waitForFunction(() => window.__lesson && window.__lesson.kit, null, { timeout: 30000 }); await sleep(1200);
  return { ctx, page, errs };
}
const L = (page, fn, arg) => page.evaluate(fn, arg);
const fb = (page) => page.locator('#fbBox').innerText();
const built = (page) => L(page, () => Object.keys(window.__lesson.state.build).sort());
const stepId = (page) => L(page, () => window.__lesson.STEPS[window.__lesson.step].id);
async function tapAt(page, q, touch) {
  const s = await L(page, (q) => window.__lesson.screenOf(q), q);
  if (touch) await page.touchscreen.tap(s.x, s.y); else await page.mouse.click(s.x, s.y);
  await sleep(250);
}
// get past "Get ready" the quick way (those steps are tested in smoke.mjs), unplugging through the real button
async function getReady(page) {
  await page.click('[data-mode="guided"]');
  await L(page, () => { window.__lesson.done('meet-kit'); window.__lesson.done('hidden-strips'); window.__lesson.goTo(3); });
  await page.click('#unplugBtn');
  await page.click('#nextBtn'); await sleep(1500);
}
async function next(page) { await page.click('#nextBtn'); await sleep(1500); }
const H = (c, r) => ({ hole: [c, r] }), RL = (rail, c) => ({ rail: [rail, c] }), PIN = (id) => ({ pin: id });

/* ================= desktop: build it all ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 1400, height: 860 } });
  await getReady(page);
  check('step 5 is the red resistor, nothing placed yet', await stepId(page) === 'red-resistor' && (await built(page)).length === 0);
  await page.screenshot({ path: `${OUT}/01_red_resistor_targets.png` });

  // red resistor, with progressive hints
  await tapAt(page, H(8, 'd'));
  let t = await fb(page);
  check('wrong row (d8): hint 1 says what and why, nothing placed', /Hint 1 of 3/.test(t) && /row 8/.test(t) && (await built(page)).length === 0, t.slice(0, 90));
  await tapAt(page, H(9, 'd'));
  t = await fb(page);
  check('second miss: hint 2 adds where to look (d7)', /Hint 2 of 3/.test(t) && /d7/.test(t), t.slice(0, 120));
  await tapAt(page, H(10, 'd'));
  t = await fb(page);
  check('third miss: hint 3 says what to do and offers “Do it for me”', /Hint 3 of 3/.test(t) && await page.locator('#doItBtn').count() === 1);
  await page.screenshot({ path: `${OUT}/02_progressive_hint.png` });
  await tapAt(page, H(7, 'd'));
  await tapAt(page, H(7, 'c'));
  t = await fb(page);
  check('second leg on the same side of the gap (c7): explained as “across the gap”', /across the middle gap/.test(t) && (await built(page)).length === 0, t.slice(0, 90));
  await tapAt(page, H(7, 'g')); await sleep(1500);
  check('d7 then g7 places the red resistor and completes the step', JSON.stringify(await built(page)) === '["res-red"]' && !(await page.locator('#nextBtn').isDisabled()));
  check('the placed part left the tray (2 resistors left)', await L(page, () => window.__lesson.view.trayParts.filter((o) => o.userData.part === 'resistor' && o.visible).length) === 2);

  // red LED: long leg first
  await next(page);
  await tapAt(page, H(8, 'i'));
  t = await fb(page);
  check('LED: tapping the short leg’s hole first is caught (polarity)', /short/.test(t) && /long leg/.test(t), t.slice(0, 90));
  await tapAt(page, H(7, 'i')); await tapAt(page, H(8, 'i')); await sleep(1300);
  check('LED placed long leg i7, short leg i8', (await built(page)).includes('led-red'));
  await page.screenshot({ path: `${OUT}/03_red_led_placed.png` });

  // red ground wire: wrong rail, then right rail wrong hole, then right
  await next(page);
  await tapAt(page, H(8, 'j'));
  await tapAt(page, RL('BP', 8));
  t = await fb(page);
  check('ground wire to the red + rail: hint explains + is for power', /red \+ rail/.test(t) && /power/.test(t), t.slice(0, 100));
  await tapAt(page, RL('BN', 10));
  t = await fb(page);
  check('ground wire to the right rail but another hole: “would work, use column 8”', /any hole on it would work/.test(t) && /8/.test(t));
  await tapAt(page, RL('BN', 8)); await sleep(1500);
  check('ground wire placed j8 → blue rail', (await built(page)).includes('gw-red'));

  // red signal wire: wrong pin, then right
  await next(page);
  await tapAt(page, PIN('near:D26'));
  t = await fb(page);
  check('signal wire on D26: hint says the code uses D25', /D26/.test(t) && /D25/.test(t), t.slice(0, 100));
  await tapAt(page, PIN('near:D25')); await tapAt(page, H(7, 'b')); await sleep(1500);
  check('signal wire placed D25 → b7: red light complete', (await built(page)).includes('sig-red'));
  await page.screenshot({ path: `${OUT}/04_red_complete.png` });

  // replay: animates again, never duplicates
  const c0 = await L(page, () => window.__lesson.counts());
  const p0 = await L(page, () => window.__lesson.view.placedIds().length);
  for (let i = 0; i < 3; i++) { await page.click('#replayBtn'); await sleep(200); }
  // the replay rings both ends while the wire redraws; wait for that animation to end (software rendering can be slow)
  await page.waitForFunction((n) => window.__lesson.counts().objects === n, c0.objects, { timeout: 8000 }).catch(() => {});
  const c1 = await L(page, () => window.__lesson.counts());
  const p1 = await L(page, () => window.__lesson.view.placedIds().length);
  check('Replay ×3 on a placed wire: when the animation ends, the same 3D objects and parts as before (nothing duplicated)', c0.objects === c1.objects && p0 === p1 && (await built(page)).length === 4, `objects ${c0.objects} → ${c1.objects}, parts ${p0} → ${p1}`);

  // undo
  await page.click('#undoBtn'); await sleep(300);
  check('Undo takes the signal wire out and locks Next again', !(await built(page)).includes('sig-red') && await page.locator('#nextBtn').isDisabled());
  await tapAt(page, H(7, 'b')); await tapAt(page, PIN('near:D25')); await sleep(1500);
  check('placing it again (other end first) works', (await built(page)).includes('sig-red'));

  // back keeps everything
  await page.click('#prevBtn'); await sleep(1300);
  check('Back to the ground-wire step: still placed, no Undo (not the last part)', await stepId(page) === 'red-ground' && await page.locator('#task.done').count() === 1 && await page.locator('#undoBtn').count() === 0);
  await page.click('#nextBtn'); await sleep(1300);

  // yellow by mouse, the quick right way
  const P = { 'yellow-resistor': [H(15, 'd'), H(15, 'g')], 'yellow-led': [H(15, 'i'), H(16, 'i')], 'yellow-ground': [H(16, 'j'), RL('BN', 16)], 'yellow-signal': [PIN('near:D26'), H(15, 'b')] };
  for (const [id, ends] of Object.entries(P)) {
    await next(page);
    if (await stepId(page) !== id) break;
    for (const e of ends) await tapAt(page, e);
    await sleep(1400);
  }
  check('yellow light built (4 parts)', (await built(page)).filter((x) => x.endsWith('yellow')).length === 4);

  // green with the keyboard only (the picker lists)
  async function tabTo(sel, max = 80) { for (let i = 0; i < max; i++) { await page.keyboard.press('Tab'); if (await L(page, (s) => document.activeElement && document.activeElement.matches(s), sel)) return true; } return false; }
  async function pickHole(r, c) { await tabTo('#pkRow'); await page.keyboard.type(r); await page.keyboard.press('Tab'); await page.keyboard.type(String(c)); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(300); }
  // the rail list starts on the near blue rail (typing "B" would jump to the next "Blue…" option), so only the column is typed
  async function pickRail(c) { await tabTo('#pkRailCol'); await page.keyboard.type(String(c)); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(300); }
  async function pickPin(name) { await tabTo('#pkPin'); await page.keyboard.type(name); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(300); }
  async function nextKey() { await tabTo('#nextBtn'); await page.keyboard.press('Enter'); await sleep(1500); }
  await nextKey();
  await tabTo('#picker summary'); if (!(await L(page, () => document.querySelector('#picker').open))) await page.keyboard.press('Enter');
  await pickHole('d', 23); await pickHole('g', 23); await sleep(1300); await nextKey();
  await pickHole('i', 23); await pickHole('i', 24); await sleep(1300); await nextKey();
  await pickHole('j', 24); await pickRail(24); await sleep(1300); await nextKey();
  await pickPin('D27'); await pickHole('b', 23); await sleep(1300);
  check('green light built with the keyboard only', (await built(page)).filter((x) => x.endsWith('green')).length === 4, (await built(page)).join(','));

  // close the loop: the other GND first
  await nextKey();
  await tapAt(page, PIN('far:GND'));
  t = await fb(page);
  check('close the loop: the far-side GND is “also GND, use the one next to D13”', /also a GND/.test(t), t.slice(0, 80));
  await tapAt(page, PIN('near:GND')); await tapAt(page, RL('BN', 30)); await sleep(1600);
  check('all 13 parts placed', (await built(page)).length === 13);
  await page.screenshot({ path: `${OUT}/05_assembly_complete_paths.png` });
  await L(page, () => { const k = window.__lesson.kit; k.flyTo({ p: [0.5, 8.5, 9.5], t: [0, 0, -0.6] }, true); });
  await sleep(4500);
  await page.screenshot({ path: `${OUT}/06_assembly_complete.png` });

  // reload: the build comes back
  await page.reload(); await page.waitForFunction(() => window.__lesson && window.__lesson.kit); await sleep(1200);
  check('reload: all 13 placed parts come back from saved progress', (await L(page, () => window.__lesson.view.placedIds().length)) === 13);
  await page.click('#resumeBtn'); await sleep(1500);
  check('“Carry on” returns to the close-the-loop step', await stepId(page) === 'close-loop');

  // inspect: the real build passes
  await next(page);
  await page.click('#checkBtn'); await sleep(600);
  t = await page.locator('#extraBox').innerText();
  check('checker on the learner’s build: connected 3/3, matches 3/3, safe', /3 of 3 lights have a closed loop/.test(t) && /Matches the plan: 3 of 3/.test(t) && /Safe to plug in: yes/.test(t) && await page.locator('#task.done').count() === 1);
  check('checker predicts each pin lights only its own light', /D25\s*Red/.test(t) && /D26\s*Yellow/.test(t) && /D27\s*Green/.test(t));
  await page.screenshot({ path: `${OUT}/07_checker_pass.png` });

  // circuit doctor: pretend mistakes
  await page.click('#doctor summary');
  await page.click('[data-mistake="reverse-red"]'); await sleep(400);
  t = await page.locator('#doctorOut').innerText();
  check('doctor, LED backwards: detected, still “safe”, explained', /Red LED backwards/.test(t) && /backwards/.test(t) && /Safe to plug in: yes/.test(t) && /Matches the plan: 2 of 3/.test(t));
  await page.screenshot({ path: `${OUT}/08_doctor_reversed.png` });
  await page.click('[data-mistake="no-res-yellow"]'); await sleep(400);
  t = await page.locator('#doctorOut').innerText();
  check('doctor, wire instead of resistor: DANGER, too much current, stays unplugged, no predictions', /Danger/.test(t) && /too much current|far too much current/.test(t) && /NO: the USB cable stays unplugged/.test(t) && !/what would each pin light/i.test(t));
  check('doctor, hint 1 only at first (no “where”)', !/joined straight to the pin/.test(t));
  await page.click('#moreHint'); await sleep(300);
  t = await page.locator('#doctorOut').innerText();
  check('doctor, “Another hint” adds where to look', /joined straight to the pin/.test(t));
  await page.screenshot({ path: `${OUT}/09_doctor_no_resistor.png` });
  await page.click('[data-mistake="swap-red-yellow"]'); await sleep(400);
  t = await page.locator('#doctorOut').innerText();
  check('doctor, red and yellow wires swapped: D25 lights yellow, D26 lights red (from the netlist)', /D25\s*Yellow/.test(t) && /D26\s*Red/.test(t) && /wired to D26, not D25/.test(t));
  await page.screenshot({ path: `${OUT}/10_doctor_wrong_pin.png` });
  for (const [id, re] of [['no-ground-red', /no way home/], ['far-rail-red', /isn’t joined to a GND pin/], ['no-close-loop', /0 of 3 lights have a closed loop/], ['red-wire-row-8', /different strips/], ['loose-green', /one end/], ['yellow-in-red-row', /pins D25 and D26 are joined/], ['short-d25', /short circuit/i], ['res-row-yellow', /wrong strip/]]) {
    await page.click(`[data-mistake="${id}"]`); await sleep(300);
    t = await page.locator('#doctorOut').innerText();
    check(`doctor, ${id}: the checker explains it`, re.test(t), t.replace(/\n/g, ' ').slice(0, 90));
  }
  await page.screenshot({ path: `${OUT}/11_doctor_short.png` });
  await page.click('#restoreBtn'); await sleep(300);
  check('“Put my circuit back” restores the learner’s own build in 3D', await L(page, () => JSON.stringify(window.__lesson.check().ok)) === 'true');

  // plug in and test pins
  await next(page);
  check('step 19: USB still unplugged, LEDs dark', !(await L(page, () => window.__lesson.view.plugged)));
  await page.click('#plugBtn'); await sleep(300);
  check('plugging in a safe, correct circuit: power on, all LEDs still dark (pins LOW)', await L(page, () => window.__lesson.view.plugged) && await L(page, () => ['led-red', 'led-yellow', 'led-green'].every((id) => window.__lesson.view.ledLevel(id) === 0)));
  await page.click('[data-pin="D25"]'); await sleep(300);
  const lv = await L(page, () => ['led-red', 'led-yellow', 'led-green'].map((id) => window.__lesson.view.ledLevel(id) > 0));
  check('D25 HIGH lights the red LED only', JSON.stringify(lv) === '[true,false,false]', JSON.stringify(lv));
  await page.screenshot({ path: `${OUT}/12_pin_test_red.png` });
  await page.click('[data-pin="D25"]'); await page.click('[data-pin="D26"]'); await page.click('[data-pin="D27"]'); await sleep(300);
  check('D26 and D27 HIGH: yellow and green on, red off; step done', JSON.stringify(await L(page, () => ['led-red', 'led-yellow', 'led-green'].map((id) => window.__lesson.view.ledLevel(id) > 0))) === '[false,true,true]' && await page.locator('#task.done').count() === 1);
  await page.screenshot({ path: `${OUT}/13_pin_test_yellow_green.png` });
  check('after the pin test, Next leads on to the code (phase 3)', !(await page.locator('#nextBtn').isDisabled()));
  // the safety gate refuses an unsafe build (the same function the button uses)
  await L(page, () => { const b = window.__lesson.state.build; b.oops = { type: 'wire', a: { k: 'pin', id: 'near:D25' }, b: { k: 'rail', rail: 'BN', c: 10 } }; window.__lesson.view.setPlugged(false); window.__lesson.goTo(window.__lesson.idx('plug-in')); });
  await L(page, () => { delete window.__lesson.STEPS[window.__lesson.idx('plug-in')].tested; });
  const gate = await L(page, () => { const done = window.__lesson.state.done; done.delete('plug-in'); window.__lesson.goTo(window.__lesson.idx('plug-in')); document.querySelector('#plugBtn').click(); return { plugged: window.__lesson.view.plugged, msg: document.querySelector('#fbBox').innerText }; });
  check('an unsafe circuit is refused power: USB stays unplugged', !gate.plugged && /Not safe to plug in/.test(gate.msg), gate.msg.slice(0, 60));
  await L(page, () => { delete window.__lesson.state.build.oops; });

  // back unplugs
  await L(page, () => { window.__lesson.state.done.add('plug-in'); window.__lesson.goTo(window.__lesson.idx('plug-in')); });
  await page.click('#prevBtn'); await sleep(400);
  t = await fb(page);
  check('going back from power to a check step unplugs the USB cable, with a reason', !(await L(page, () => window.__lesson.view.plugged)) && /never change a circuit while it has power/.test(t));

  // reset
  await page.click('#resetLab'); await page.click('#resetLab'); await sleep(500);
  check('Reset lab: board empty, every part back in the tray, step 1', (await L(page, () => window.__lesson.view.placedIds().length)) === 0 && await L(page, () => window.__lesson.view.trayParts.every((o) => o.visible)) && await L(page, () => window.__lesson.step) === 0);
  check('desktop: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= phone: tap to build, message card over the 3D ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 400, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await getReady(page);
  const seen = await L(page, () => { const v = document.querySelector('.viewport').getBoundingClientRect(); return { top: Math.round(v.top), bottom: Math.round(v.bottom), h: innerHeight, tip: document.querySelector('#tip').innerText }; });
  check('phone: after Next (at the bottom of the page) the 3D bench is back on screen, with the instruction on its card', seen.top >= -1 && seen.bottom <= seen.h + 1 && /resistor/.test(seen.tip), JSON.stringify(seen).slice(0, 120));
  await page.screenshot({ path: `${OUT}/14a_phone_step_card.png` });
  await tapAt(page, H(8, 'd'), true);
  const tip = await L(page, () => { const t = document.querySelector('#tip'), v = document.querySelector('.viewport'); const a = t.getBoundingClientRect(), b = v.getBoundingClientRect();
    return { shown: !t.hidden && getComputedStyle(t).display !== 'none', text: t.innerText, inside: a.top >= b.top && a.bottom <= b.bottom + 1, share: a.height / b.height, live: t.getAttribute('aria-live'), panelLive: document.querySelector('#fbBox').getAttribute('aria-live') }; });
  check('phone: a wrong tap shows the hint on a card over the 3D view', tip.shown && /Hint 1 of 3/.test(tip.text), tip.text.slice(0, 60));
  check('phone: the card stays inside the 3D view and covers at most ~a third of it', tip.inside && tip.share <= 0.36, `share ${tip.share.toFixed(2)}`);
  check('phone: the card is the live region (panel copy quiet, no double reading)', tip.live === 'polite' && tip.panelLive === 'off');
  await page.screenshot({ path: `${OUT}/14_phone_hint_card.png` });
  await tapAt(page, H(7, 'd'), true); await tapAt(page, H(7, 'g'), true); await sleep(1500);
  check('phone: placing by touch works', JSON.stringify(await built(page)) === '["res-red"]');
  await page.screenshot({ path: `${OUT}/15_phone_placed.png` });
  await page.click('#tipClose'); await sleep(100);
  check('phone: the card can be closed', await L(page, () => document.querySelector('#tip').hidden));
  const sw = await L(page, () => document.documentElement.scrollWidth);
  check('phone: no sideways scroll while building', sw <= 400, `scrollWidth ${sw}`);
  check('phone: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================= tablet and reduced motion ================= */
{
  const { ctx, page, errs } = await open({ viewport: { width: 768, height: 1024 }, reducedMotion: 'reduce', hasTouch: true });
  await getReady(page);
  await tapAt(page, H(7, 'd'), true); await tapAt(page, H(7, 'g'), true); await sleep(400);
  check('tablet + reduced motion: placing works and finishes quickly', JSON.stringify(await built(page)) === '["res-red"]');
  const sw = await L(page, () => document.documentElement.scrollWidth);
  check('tablet: no sideways scroll', sw <= 768, `scrollWidth ${sw}`);
  await page.screenshot({ path: `${OUT}/16_tablet_reduced_motion.png` });
  check('tablet: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
