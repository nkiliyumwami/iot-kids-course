// Course integration of the Circuit Challenge Lab (the Virtual Lab as an optional extra). Compares the course as
// published (origin/main, unpacked into a temporary folder) with this branch, side by side in the same browser:
//   - every existing lesson link, the lesson order, "Start/Continue", badges, certificates and the lessons' "Next" are
//     exactly the same; the only new link is the optional lab, shown right after Lesson 1;
//   - the lab's progress lives under its own id and can't change any lesson's progress, badge or certificate;
//   - reopening the lab (even twice) offers to carry on where the learner was; Reset lab forgets only the lab;
//   - the lab's voice follows the narrated lessons: same joining rule, the shared "Read every step to me" choice,
//     one voice at a time, the browser's voice when there is no recording;
//   - the real-ESP32 panel is still on every lesson that had it, with the same program;
//   - no new accessibility problems on the lessons page. Screenshots go to .out/integration.
// Run: cd labs/virtual-traffic-light/tests && npm run integration      (needs git, python3 and internet for three.js)
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '.out/integration'); mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAB = 'labs/virtual-traffic-light/index.html', ID = 'circuit-challenge-lab', KEY = 'iotkids.progress';
let pass = 0, fail = 0;
const check = (cond, msg, detail) => { if (cond) { pass++; console.log('PASS  ' + msg); } else { fail++; console.log('FAIL  ' + msg + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } return cond; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// the published course, unpacked from git into a temporary folder (read-only use)
const PUB = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'kk-published-'));
execFileSync('bash', ['-c', `git -C "${ROOT}" archive origin/main | tar -x -C "${PUB}"`]);
async function serve(dir) {
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 50; i++) { try { await fetch(base); break; } catch (e) { await sleep(100); } }
  return { base, proc };
}
const before = await serve(PUB), after = await serve(ROOT);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

// a learner who has done some of the course (no real names: the certificate name is a placeholder)
const SEED = {
  '00-meet-esp32': { step: 11, steps: 12, done: true, at: 1760000000000 },
  'lab1-light-it-up': { step: 13, steps: 14, done: true, at: 1760000001000 },
  'lab2-code-switch': { step: 4, steps: 11, at: 1760000002000 },
  '01-traffic-light': { step: 15, steps: 16, done: true, at: 1760000003000 },
};
async function open(site, file, store, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  if (store) {
    await page.goto(site.base + 'pins.html');
    await page.evaluate(([s, KEY]) => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, [Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v])), KEY]);
  }
  await page.goto(site.base + file);
  return { ctx, page };
}
const store = (prog, extra) => Object.assign({ [KEY]: prog }, extra || {});
const readProg = (page) => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY) || '{}'), KEY);

// ---------- 1. links, order, buttons, badges, certificates: published vs this branch ----------
async function courseView(site, prog) {
  const { ctx, page } = await open(site, 'lessons.html', prog ? store(prog, { 'iotkids.name': 'Test Maker' }) : null);
  await page.waitForSelector('.lesson');
  const v = await page.evaluate(() => ({
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href').replace(location.origin + '/', '')),
    lessons: [...document.querySelectorAll('article.lesson:not(.extra)')].map((a) => ({ cls: a.className, text: a.innerText })),
    badges: document.getElementById('badgeCount').textContent,
    shelf: [...document.querySelectorAll('#badgeRow img')].map((i) => i.className + ' ' + i.getAttribute('src') + ' ' + i.alt),
    start: [document.getElementById('startBtn').getAttribute('href'), document.getElementById('startBtn').textContent],
    cert: document.getElementById('courseCert').textContent,
    next: window.COURSE.lessons.map((l) => [l.slug, (window.COURSE.nextLesson(l.slug) || {}).slug || null]),
  }));
  await ctx.close();
  const home = await open(site, 'index.html', prog ? store(prog) : null);
  v.home = await home.page.evaluate(() => ({ links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href').replace(location.origin + '/', '')), start: ['startBtn', 'startBtn2'].map((id) => { const b = document.getElementById(id); return b && [b.getAttribute('href'), b.textContent]; }) }));
  await home.ctx.close();
  v.certs = {};
  for (const q of ['all', '01-traffic-light', '00-meet-esp32', 'lab2-code-switch']) {
    const c = await open(site, 'certificate.html?lesson=' + q, prog ? store(prog, { 'iotkids.name': 'Test Maker' }) : null);
    await sleep(300);
    v.certs[q] = await c.page.evaluate(() => document.body.innerText);
    await c.ctx.close();
  }
  return v;
}
const views = {};
for (const [label, prog, compareWith] of [['a new learner', null], ['a learner part-way through', SEED], ['a learner who only opened the new lab (vs a new learner on the published site)', { [ID]: { step: 5, steps: 24, at: 1 } }, 'a new learner']]) {
  const b = compareWith ? views[compareWith] : await courseView(before, prog), a = await courseView(after, prog);
  views[label] = b;
  const added = a.links.filter((h) => !b.links.includes(h)), removed = b.links.filter((h) => !a.links.includes(h));
  check(!removed.length && same(added, [LAB]), `${label}: lessons page keeps every link; the only new one is the optional lab`, { added, removed });
  check(same(a.lessons, b.lessons), `${label}: every lesson card (order, status, progress) is unchanged`);
  check(a.badges === b.badges && same(a.shelf, b.shelf) && a.cert === b.cert, `${label}: badges “${a.badges}” and the course certificate button are unchanged`);
  check(same(a.start, b.start) && same(a.home.start, b.home.start), `${label}: “${a.start[1]}” and the home page start buttons are unchanged`, { before: [b.start, b.home.start], after: [a.start, a.home.start] });
  check(same(a.home.links, b.home.links), `${label}: home page links unchanged`);
  check(same(a.next, b.next), `${label}: every lesson’s “Next” lesson is unchanged (Lesson 1 → Lesson 2)`);
  check(same(a.certs, b.certs), `${label}: certificates (course, Lesson 1, Lesson 0, Circuit Lab 2) unchanged`);
}

// ---------- 2. the optional lab card ----------
{
  const { ctx, page } = await open(after, 'lessons.html', store(SEED));
  await page.waitForSelector('[data-extra]');
  const card = await page.evaluate((ID) => {
    const x = document.querySelector(`[data-extra="${ID}"]`), li = x.closest('li'), prev = li.previousElementSibling;
    return { text: x.innerText, href: x.querySelector('a').getAttribute('href'), after: prev && prev.querySelector('a') && prev.querySelector('a').getAttribute('href'),
      inUnit: x.closest('section.unit').querySelector('h2').textContent, lessons: window.COURSE.lessons.length, isLesson: !!window.COURSE.lessonBySlug(ID),
      slugs: window.COURSE.lessons.map((l) => l.slug), img: !!x.querySelector('img') };
  }, ID);
  check(card.after === 'lessons/01-traffic-light/index.html' && /Build the thing/.test(card.inUnit), 'the optional lab is listed right after Lesson 1 (My First Traffic Light)', card.after);
  check(/Circuit Challenge Lab: Experiment & Fix It/.test(card.text) && /Optional challenge/i.test(card.text) && /doesn’t need it/.test(card.text), 'its card names it, marks it optional and says the next lesson doesn’t need it');
  check(['three-LED circuit', 'mistakes safely', 'wrong GPIO pins, reversed LEDs and missing parts', 'timing', 'troubleshooting'].every((w) => card.text.includes(w)), 'its card lists what learners can do there');
  check(card.lessons === 13 && !card.isLesson && !card.slugs.includes(ID) && !card.img, 'it is not a lesson: 13 lessons as before, its own id, no badge image', card);
  const r = await fetch(after.base + card.href); check(r.status === 200, 'its link opens the lab (HTTP 200)');
  await page.locator('[data-extra]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -140));
  await page.screenshot({ path: `${OUT}/01_lessons_desktop_optional_card.png` });
  await ctx.close();
  const p2 = await open(after, 'lessons.html', store(SEED), { width: 400, height: 860 });
  await p2.page.locator('[data-extra]').scrollIntoViewIfNeeded(); await p2.page.evaluate(() => window.scrollBy(0, -120));
  await p2.page.screenshot({ path: `${OUT}/02_lessons_phone_optional_card.png` });
  check(await p2.page.evaluate(() => document.documentElement.scrollWidth <= 400), 'phone: the lessons page still has no sideways scrolling');
  await p2.ctx.close();
}

// ---------- 3. progress: own id, no overwrite, finish, resume, reset ----------
async function labPage(prog, viewport) {
  const o = await open(after, LAB, store(prog), viewport);
  await o.page.waitForFunction(() => window.__lesson && window.__lesson.kit);
  return o;
}
{
  const { ctx, page } = await labPage(SEED);
  check(same(await readProg(page), SEED), 'opening the lab changes no saved progress (it shows the welcome step)');
  // finish the whole lab, answering the quiz for real
  await page.evaluate(() => { const l = window.__lesson; l.state.mode = 'guided'; l.buildUpTo('-'); for (const s of l.STEPS.slice(0, l.idx('quiz'))) l.done(s.id); l.goTo(l.idx('quiz')); });
  await page.evaluate(() => { for (const q of window.VLabCurriculum.QUIZ) document.querySelector(`[data-q="${q.id}"] [data-a="${q.right}"]`).click(); });
  await page.waitForSelector('#quizDone');
  const p = await readProg(page);
  const lessonsSame = Object.keys(SEED).every((k) => same(p[k], SEED[k]));
  check(lessonsSame, 'finishing the lab leaves every lesson’s progress exactly as it was');
  check(p[ID] && p[ID].done === true && p[ID].steps === 24, 'the lab saves “finished” under its own id', p[ID]);
  check(Object.keys(p).every((k) => k === ID || SEED[k]), 'the lab wrote no other progress entry', Object.keys(p));
  check(!(await page.$('#quizDone .reward')) && !/badge/i.test(await page.locator('#quizDone').innerText()), 'no badge or certificate in the lab (not approved yet)');
  const back = await page.getAttribute('a.back', 'href');
  check(back === '../../lessons.html' && (await fetch(after.base + 'lessons.html')).status === 200, 'the lab’s “← All lessons” link returns to the course');
  const nextHref = await page.locator('#quizDone a.btn').getAttribute('href');
  check(nextHref === '../../lessons/02-patterns/index.html', 'Lesson 1 already done: the lab’s summary points on to Lesson 2', nextHref);
  // the course page shows it finished, without counting it as a lesson
  const c = await page.context().newPage(); await c.goto(after.base + 'lessons.html'); await c.waitForSelector('[data-extra]');
  const cv = await c.evaluate((ID) => ({ card: document.querySelector(`[data-extra="${ID}"]`).innerText, badges: document.getElementById('badgeCount').textContent }), ID);
  check(/Finished ✓/i.test(cv.card) && cv.badges === '3 of 13 earned', 'lessons page: the lab shows “Finished ✓”; badges still “3 of 13 earned”', cv);
  await c.locator('[data-extra]').scrollIntoViewIfNeeded(); await c.evaluate(() => window.scrollBy(0, -140));
  await c.screenshot({ path: `${OUT}/03_lessons_lab_finished.png` });
  await ctx.close();
}
{
  // resume: work up to step 11, then reopen twice
  const { ctx, page } = await labPage({});
  await page.click('[data-mode="guided"]');
  await page.evaluate(() => { const l = window.__lesson; l.buildUpTo('yellow-ground'); for (const s of l.STEPS.slice(0, 10)) l.done(s.id); l.goTo(10); });
  const where = await page.evaluate(() => window.__lesson.STEPS[10].title);
  let ok = true;
  for (let i = 1; i <= 2; i++) {
    await page.reload(); await page.waitForFunction(() => window.__lesson && window.__lesson.kit);
    const btn = await page.locator('#resumeBtn').textContent().catch(() => null);
    ok = check(btn && btn.includes('step 11'), `reopened (${i}${i === 1 ? 'st' : 'nd'} time): the lab offers “Carry on from step 11”`, btn) && ok;
  }
  await page.click('#resumeBtn');
  const at = await page.evaluate(() => ({ step: window.__lesson.step, title: document.getElementById('stepTitle').textContent, parts: Object.keys(window.__lesson.state.build).length }));
  check(at.step === 10 && at.title === where && at.parts >= 6, 'carrying on returns to the same step with the circuit still built', at);
  const p = await readProg(page);
  check(p[ID] && p[ID].step === 10 && !p[ID].done, 'the course knows the lab is in progress (step 11 of 24)', p[ID]);
  const c = await page.context().newPage(); await c.goto(after.base + 'lessons.html'); await c.waitForSelector('[data-extra]');
  check(/In progress · 46%/i.test(await c.locator('[data-extra]').innerText()), 'lessons page: the lab card shows “In progress · 46%”');
  await c.locator('[data-extra]').scrollIntoViewIfNeeded(); await c.evaluate(() => window.scrollBy(0, -140));
  await c.screenshot({ path: `${OUT}/04_lessons_lab_in_progress.png` }); await c.close();
  await ctx.close();
}
{
  // reset forgets only the lab
  const { ctx, page } = await labPage(Object.assign({}, SEED, { [ID]: { step: 7, steps: 24, at: 5 } }));
  await page.click('#resetLab'); await page.click('#resetLab'); await sleep(200);
  const p = await readProg(page);
  check(!p[ID] && Object.keys(SEED).every((k) => same(p[k], SEED[k])), 'Reset lab removes only the lab’s own course entry; lessons untouched', Object.keys(p));
  await ctx.close();
}

// ---------- 4. the lab's voice ----------
const WATCH = () => {
  window.__log = [];
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => { window.__log.push(['speak', u.text]); window.__utter = u; };
    const cancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel = () => { window.__log.push(['cancel']); cancel(); };
  }
  let real;
  Object.defineProperty(window, 'KKVoice', { configurable: true, get: () => real, set(v) { const say = v.say; v.say = (t, o) => { window.__log.push(['say', v.clean(t), v.id(t)]); return say(t, o); }; real = v; } });
};
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(WATCH);
  const page = await ctx.newPage();
  const mp3 = [];
  page.on('response', (r) => { const m = r.url().match(/voice\/en\/([0-9a-f]{8})\.mp3/); if (m) mp3.push([m[1], r.status()]); });
  await page.goto(after.base + LAB); await page.waitForFunction(() => window.__lesson && window.__lesson.kit);
  check(await page.isVisible('#listenBtn') && await page.isVisible('#readToMe'), 'the lab has 🔊 Listen and “Read every step to me”');
  check(!(await page.isChecked('#readToMe')), 'read-aloud starts off, like the lessons');
  // Listen: the lessons' joining rule, the browser's voice when there is no recording
  await page.evaluate(() => { window.__log = []; });
  await page.click('#listenBtn'); await sleep(800);
  let log = await page.evaluate(() => window.__log);
  const s0 = await page.evaluate(() => { const s = window.__lesson.STEPS[0]; return window.KKVoice.clean(s.title + '. ' + s.text); });
  const said = log.find((e) => e[0] === 'say'), spoke = log.find((e) => e[0] === 'speak');
  check(said && said[1] === s0, '🔊 Listen says “title. text”, exactly like the lessons');
  check(mp3.some(([id, st]) => said && id === said[2] && st === 404) && spoke && spoke[1] === s0, 'no recording for the lab yet: it asks for the MP3, then the browser reads the same words');
  check((await page.getAttribute('#listenBtn', 'aria-pressed')) === 'true', 'the button turns into ■ Stop while it talks');
  await page.click('#listenBtn');
  check((await page.getAttribute('#listenBtn', 'aria-pressed')) === 'false' && (await page.evaluate(() => window.__log.some((e) => e[0] === 'cancel'))), '■ Stop stops the voice');
  // a title ending in ? or ! is joined with a space, never “?.”, as in the lessons
  await page.evaluate(() => { window.__lesson.STEPS[0].__t = window.__lesson.STEPS[0].title; window.__lesson.STEPS[0].title = 'Ready to build?'; window.__log = []; });
  await page.click('#listenBtn'); await sleep(300); await page.click('#listenBtn');
  log = await page.evaluate(() => { window.__lesson.STEPS[0].title = window.__lesson.STEPS[0].__t; return window.__log; });
  const q = log.find((e) => e[0] === 'say');
  check(q && q[1].startsWith('Ready to build? ') && !q[1].includes('?.'), 'a title ending in “?” is joined with a space (“Ready to build? …”)', q && q[1].slice(0, 30));
  // read every step: shared preference, reads each new step, one voice at a time
  await page.check('#readToMe'); await sleep(300); await page.click('#listenBtn').catch(() => {}); // stop the line ticking it started
  check(await page.evaluate(() => localStorage.getItem('kk-read-to-me')) === '1', 'ticking it saves the course’s shared choice (kk-read-to-me)');
  const lab1 = await ctx.newPage(); await lab1.goto(after.base + 'lessons/lab1-light-it-up/index.html'); await lab1.waitForSelector('#readToMe');
  check(await lab1.isChecked('#readToMe'), 'Circuit Lab 1 now shows “Read every step to me” ticked too');
  await lab1.uncheck('#readToMe'); await lab1.close();
  await page.reload(); await page.waitForFunction(() => window.__lesson && window.__lesson.kit);
  check(!(await page.isChecked('#readToMe')), 'and unticking it in Circuit Lab 1 unticks it in the lab');
  await page.check('#readToMe'); await sleep(200);
  await page.evaluate(() => { const l = window.__lesson; l.state.mode = 'guided'; l.done('welcome'); window.__log = []; });
  await page.click('#nextBtn'); await sleep(1000);
  await page.evaluate(() => { window.__lesson.done(window.__lesson.STEPS[1].id); });
  await page.click('#nextBtn'); await sleep(800);
  log = await page.evaluate(() => window.__log);
  const says = log.filter((e) => e[0] === 'say').map((e) => e[1].split('.')[0]);
  const titles = await page.evaluate(() => [1, 2].map((i) => window.__lesson.STEPS[i].title));
  check(same(says, titles), 'with it ticked, each new step is read as it opens', { says, titles });
  const speaks = log.map((e, i) => [e, i]).filter(([e]) => e[0] === 'speak').map(([, i]) => i);
  const stoppedFirst = speaks.slice(1).every((i) => log.slice(speaks[speaks.indexOf(i) - 1] + 1, i).some((e) => e[0] === 'cancel'));
  check(speaks.length === 2 && stoppedFirst, 'changing step stops the last line before the next starts (no overlapping voices)', log.map((e) => e[0]));
  await page.locator('.voice-row').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/05_lab_voice_controls.png` });
  await page.evaluate(() => window.KKVoice.stop());
  await ctx.close();
  const phone = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
  const ph = { ctx: phone, page: await phone.newPage() }; await ph.page.goto(after.base + LAB);
  await ph.page.waitForFunction(() => window.__lesson && window.__lesson.kit);
  await ph.page.locator('.voice-row').scrollIntoViewIfNeeded();
  await ph.page.screenshot({ path: `${OUT}/06_lab_phone_voice_controls.png` });
  const t = await ph.page.evaluate(() => { const r = document.getElementById('readToMe').closest('label').getBoundingClientRect(); return { h: r.height, wide: document.documentElement.scrollWidth }; });
  check(t.h >= 44 && t.wide <= 400, 'phone: the read-aloud choice is a 44 px touch target and the page doesn’t scroll sideways', t);
  await ph.ctx.close();
}

// ---------- 5. the real-ESP32 panel on every lesson that had it ----------
{
  const slugs = JSON.parse(execFileSync('node', ['-e', `global.window={};require(${JSON.stringify(path.join(PUB, 'course.js'))});console.log(JSON.stringify(window.COURSE.lessons.map(l=>l.slug)))`]).toString());
  const rows = [];
  for (const slug of slugs) {
    const row = [];
    for (const site of [before, after]) {
      const { ctx, page } = await open(site, `lessons/${slug}/index.html`);
      await sleep(1500);
      const r = await page.evaluate(() => ({ board: !!window.KKBoard, link: !!window.BoardLink, flash: !!window.PrepareBoard, btn: document.querySelectorAll('.kkb-open').length }));
      if (r.btn) { await page.click('.kkb-open'); await sleep(300); r.program = await page.evaluate(() => { const t = document.querySelector('.kkb-back textarea'); return t ? t.value : null; }); }
      row.push(r); await ctx.close();
    }
    rows.push([slug, row]);
  }
  const withPanel = rows.filter(([, [b]]) => b.btn).map(([s]) => s);
  check(rows.every(([, [b, a]]) => same(a, b)), `real-ESP32 panel (Connect, Run, Prepare my board) unchanged on all 13 lessons; present on ${withPanel.length}: ${withPanel.join(', ')}`,
    rows.filter(([, [b, a]]) => !same(a, b)).map(([s]) => s));
  check(rows.find(([s]) => s === '01-traffic-light')[1][1].program && /Pin\(25/.test(rows.find(([s]) => s === '01-traffic-light')[1][1].program), 'Lesson 1’s panel still opens with its traffic-light program');
}

// ---------- 6. files the integration must not touch ----------
{
  const diff = execFileSync('git', ['-C', ROOT, 'diff', '--name-only', 'origin/main', '--', 'lessons', 'assets/voice', 'assets/badges', 'assets/ohm', 'assets/circuit', 'assets/rewards.js', 'assets/board-link.js', 'assets/prepare-board.js', 'assets/run-panel.js', 'assets/board-drawer.js', 'certificate.html', 'story.html', 'run.html', 'pins.html', 'tools', 'firmware']).toString().trim();
  check(diff === '', 'no lesson, voice file, badge, certificate, real-board code or course tool is changed', diff);
  const touched = execFileSync('git', ['-C', ROOT, 'diff', '--name-only', 'origin/main', '--', '.', ':!labs', ':!assets/virtual-lab']).toString().trim().split('\n').filter(Boolean).sort();
  check(same(touched, ['course.js', 'index.html', 'lessons.html']), 'outside the lab, only course.js, lessons.html and index.html changed', touched);
}

// ---------- 7. accessibility of the lessons page: nothing new ----------
for (const width of [1400, 400]) {
  const res = [];
  for (const site of [before, after]) {
    const { ctx, page } = await open(site, 'lessons.html', store(SEED), { width, height: 900 });
    await page.waitForSelector('.lesson'); await sleep(500);
    await page.addScriptTag({ content: AXE });
    res.push(await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.flatMap((v) => v.nodes.map((n) => v.id + ' ' + n.target.join(' ')))));
    await ctx.close();
  }
  const fresh = res[1].filter((v) => !res[0].includes(v));
  check(!fresh.length, `lessons page at ${width} px: no new accessibility problems (axe, WCAG 2.2 AA)${res[0].length ? ` (${res[0].length} already on the published page)` : ''}`, fresh);
}

await browser.close(); before.proc.kill(); after.proc.kill();
rmSync(PUB, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${OUT}`);
process.exitCode = fail ? 1 : 0;
