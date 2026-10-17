// Narration guard: Officer Ohm's recorded ElevenLabs voice must keep playing everywhere it plays today.
//
// The course finds a recording by a fingerprint of the exact words spoken (assets/voice/voice.js), so a rewritten
// sentence, title or punctuation mark silently swaps Naledi's voice for the browser's robot voice. This test fails
// if that happens. It compares the site with narration-baseline.json, recorded from the published course:
//   1. files: the 43 MP3s are all there and byte-for-byte the same (SHA-256), lines.json and voice.js unchanged;
//   2. lessons: a real browser walks every step of the narrated lessons (00, Circuit Lab 1, Circuit Lab 2), presses
//      🔊 Listen, and checks the page asks for the same words and fingerprint as before, the MP3 is served (200) and
//      plays, and the browser's speech fallback is never used;
//   3. "Read every step to me": with the saved preference on, changing step reads the new step from its MP3;
//   4. home page and story page: the six narrator lines still fingerprint to their recordings and play.
// It only reads and listens: nothing is generated, renamed, deleted or changed.
//
// Run:    cd labs/virtual-traffic-light/tests && npm run narration
// Other copy of the site:  NARRATION_ROOT=/path/to/site node narration.mjs
// Re-record the baseline (only when the owner has approved new or changed recordings): node narration.mjs --record
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.NARRATION_ROOT || path.resolve(HERE, '../../..'));
const BASELINE = path.join(HERE, 'narration-baseline.json');
const RECORD = process.argv.includes('--record');
const LESSONS = ['00-meet-esp32', 'lab1-light-it-up', 'lab2-code-switch'];
const STORY_PAGES = ['index.html', 'story.html'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

let pass = 0, fail = 0;
const ok = (cond, msg, detail) => { if (cond) { pass++; console.log('PASS  ' + msg); } else { fail++; console.log('FAIL  ' + msg + (detail ? '  — ' + detail : '')); } return cond; };

// ---------- serve the site on a private local port ----------
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const BASE = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch (e) { await sleep(100); } }

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

// Watch the real KKVoice (the page's own voice.js, its own cleaning and fingerprint): what it is asked to say, which
// MP3 it requests, whether that file plays, and whether the browser's speech fallback is used. Speech is muted.
const WATCH = () => {
  window.__said = []; window.__tts = []; window.__played = [];
  if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__tts.push(u.text); setTimeout(() => u.onend && u.onend(), 0); };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { this.muted = true; const p = play.call(this); const src = this.src; if (p && p.then) p.then(() => window.__played.push(src), () => {}); return p; };
  let real;
  Object.defineProperty(window, 'KKVoice', { configurable: true, get: () => real, set(v) {
    const say = v.say;
    v.say = (t, o) => { window.__said.push({ text: v.clean(t), id: v.id(t) }); return say(t, o); };
    real = v;
  } });
};

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  if (opts.readToMe) await ctx.addInitScript(() => { try { localStorage.setItem('kk-read-to-me', '1'); } catch (e) { /* */ } });
  await ctx.addInitScript(WATCH);
  const page = await ctx.newPage();
  const served = {};
  page.on('response', (r) => { const m = r.url().match(/assets\/voice\/en\/([0-9a-f]{8})\.mp3/); if (m) served[m[1]] = r.status(); });
  return { ctx, page, served };
}
const take = (page) => page.evaluate(() => { const o = { said: window.__said.splice(0), tts: window.__tts.splice(0), played: window.__played.splice(0) }; return o; });
const title = (page) => page.evaluate(() => (document.getElementById('stepTitle') || {}).textContent || '');

// press 🔊 Listen on the current step and report what happened
async function listen(page, served) {
  await page.click('#listenBtn');
  let r;
  for (let i = 0; i < 40; i++) { await sleep(100); r = await page.evaluate(() => ({ said: window.__said.length, tts: window.__tts.length, played: window.__played.length })); if (r.said && (r.played || r.tts)) break; }
  const got = await take(page);
  if ((await page.getAttribute('#listenBtn', 'aria-pressed')) === 'true') await page.click('#listenBtn'); // stop
  const said = got.said[got.said.length - 1] || null;
  return { said, status: said ? served[said.id] : undefined, played: got.played.some((u) => said && u.includes(said.id)), tts: got.tts };
}
async function next(page) {
  const before = await title(page);
  await page.evaluate(() => { const n = document.getElementById('nextBtn'); n.disabled = false; n.click(); }); // walk past gated tasks
  for (let i = 0; i < 30; i++) { await sleep(100); if ((await title(page)) !== before) return true; }
  return false;
}

// ---------- collect what the site says now ----------
async function walkLesson(slug) {
  const { ctx, page, served } = await newPage();
  await page.goto(`${BASE}lessons/${slug}/index.html`);
  await page.waitForSelector('#listenBtn');
  await sleep(1500);
  const steps = [];
  for (let i = 0; i < 60; i++) {
    const r = await listen(page, served);
    steps.push({ step: i + 1, title: await title(page), ...r });
    if (!(await next(page))) break;
  }
  await ctx.close();
  return steps;
}
async function readToMe(slug) {
  const { ctx, page, served } = await newPage({ readToMe: true });
  await page.goto(`${BASE}lessons/${slug}/index.html`);
  await page.waitForSelector('#listenBtn'); await sleep(1500);
  const checked = await page.isChecked('#readToMe');
  await take(page);
  await next(page);
  let got = { said: [], tts: [], played: [] };
  for (let i = 0; i < 40 && !(got.said.length && (got.played.length || got.tts.length)); i++) { await sleep(100); const t = await take(page); got = { said: got.said.concat(t.said), tts: got.tts.concat(t.tts), played: got.played.concat(t.played) }; }
  await ctx.close();
  const said = got.said[got.said.length - 1];
  return { checked, said, status: said && served[said.id], played: !!said && got.played.some((u) => u.includes(said.id)), tts: got.tts };
}
// the narrator lines of the home-page story, read from the page the same way tools/voice/collect.mjs does, then
// fingerprinted and played by that page's own KKVoice
async function story(file) {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  const narr = src.slice(src.indexOf('const NARR = {'), src.indexOf('};', src.indexOf('const NARR = {')));
  const lines = [...narr.matchAll(/(\w+): '([^']*)'/g)].map((m) => ({ chapter: m[1], raw: m[2] }));
  const { ctx, page, served } = await newPage();
  await page.goto(BASE + file);
  await page.waitForFunction(() => typeof window.KK_V !== 'undefined');
  // the story loads voice.js lazily (when it scrolls into view); load the very same file it would load
  await page.evaluate(() => new Promise((res, rej) => { if (window.KKVoice) return res(); const s = document.createElement('script'); s.src = 'assets/voice/voice.js?v=' + window.KK_V; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
  const out = [];
  for (const l of lines) {
    await take(page);
    await page.evaluate((t) => window.KKVoice.say(t, { base: '' }), l.raw);
    let got = { said: [], tts: [], played: [] };
    for (let i = 0; i < 40 && !(got.played.length || got.tts.length); i++) { await sleep(100); const t = await take(page); got = { said: got.said.concat(t.said), tts: got.tts.concat(t.tts), played: got.played.concat(t.played) }; }
    const said = got.said[0];
    out.push({ chapter: l.chapter, said, status: said && served[said.id], played: !!said && got.played.some((u) => u.includes(said.id)), tts: got.tts });
  }
  await page.evaluate(() => window.KKVoice.stop());
  await ctx.close();
  return out;
}

const files = () => readdirSync(path.join(ROOT, 'assets/voice/en')).filter((f) => f.endsWith('.mp3')).sort();
const now = { lessons: {}, story: {} };
for (const slug of LESSONS) now.lessons[slug] = await walkLesson(slug);
for (const f of STORY_PAGES) now.story[f] = await story(f);

// ---------- record mode: write the baseline from the published course ----------
if (RECORD) {
  const lines = JSON.parse(readFileSync(path.join(ROOT, 'assets/voice/lines.json'), 'utf8'));
  const base = {
    note: 'Officer Ohm narration recorded from the published course. Do not edit by hand; see narration.mjs.',
    voiceJs: sha(path.join(ROOT, 'assets/voice/voice.js')),
    linesJson: sha(path.join(ROOT, 'assets/voice/lines.json')),
    recordings: files().map((f) => { const id = f.slice(0, 8); const l = lines.find((x) => x.id === id) || {}; return { id, where: l.where, text: l.text, sha256: sha(path.join(ROOT, 'assets/voice/en', f)) }; }),
    lessons: Object.fromEntries(Object.entries(now.lessons).map(([slug, steps]) => [slug, steps.map((s) => ({ title: s.title, id: s.said && s.said.id, text: s.said && s.said.text }))])),
    story: Object.fromEntries(Object.entries(now.story).map(([f, ls]) => [f, ls.map((l) => ({ chapter: l.chapter, id: l.said && l.said.id }))])),
  };
  const bad = Object.values(now.lessons).flat().filter((s) => !s.said || s.status !== 200 || !s.played || s.tts.length).length +
    Object.values(now.story).flat().filter((l) => !l.said || l.status !== 200 || !l.played || l.tts.length).length;
  if (bad) { console.log(`Not recording: ${bad} lines do not play their MP3 right now.`); process.exitCode = 1; }
  else { writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n'); console.log(`Baseline recorded: ${base.recordings.length} recordings, ` + Object.entries(base.lessons).map(([k, v]) => `${k} ${v.length} steps`).join(', ') + '.'); }
  await browser.close(); server.kill(); process.exit();
}

// ---------- compare with the baseline ----------
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
console.log(`Site: ${ROOT}\nBaseline: ${base.recordings.length} recordings, ${Object.values(base.lessons).reduce((n, s) => n + s.length, 0)} narrated lesson steps, ${base.story['index.html'].length} story lines\n`);

// 1. files
const have = files();
const missing = base.recordings.filter((r) => !have.includes(r.id + '.mp3'));
ok(!missing.length, `all ${base.recordings.length} recordings are present`, missing.map((r) => `${r.id}.mp3 (${r.where})`).join(', '));
const changed = base.recordings.filter((r) => have.includes(r.id + '.mp3') && sha(path.join(ROOT, 'assets/voice/en', r.id + '.mp3')) !== r.sha256);
ok(!changed.length, 'every recording is byte-for-byte unchanged (SHA-256)', changed.map((r) => `${r.id}.mp3 (${r.where})`).join(', '));
const extra = have.filter((f) => !base.recordings.some((r) => r.id + '.mp3' === f));
if (extra.length) console.log(`note  ${extra.length} new recording(s) not in the baseline: ${extra.join(', ')}`);
ok(sha(path.join(ROOT, 'assets/voice/voice.js')) === base.voiceJs, 'assets/voice/voice.js is unchanged (same cleaning, fingerprint and fallback)');
ok(sha(path.join(ROOT, 'assets/voice/lines.json')) === base.linesJson, 'assets/voice/lines.json (the transcript list) is unchanged');
const lines = JSON.parse(readFileSync(path.join(ROOT, 'assets/voice/lines.json'), 'utf8'));
const textDrift = base.recordings.filter((r) => { const l = lines.find((x) => x.id === r.id); return !l || l.text !== r.text; });
ok(!textDrift.length, 'every recording still has its transcript in lines.json', textDrift.map((r) => r.id).join(', '));

// 2. lessons: same words, same fingerprint, MP3 served and playing, no browser speech
for (const slug of LESSONS) {
  const want = base.lessons[slug], got = now.lessons[slug];
  ok(got.length === want.length, `${slug}: ${want.length} narrated steps`, `found ${got.length}`);
  want.forEach((w, i) => {
    const g = got[i] || {};
    const label = `${slug} step ${i + 1} “${w.title}”`;
    if (!g.said) { ok(false, label + ': 🔊 Listen says something', 'nothing was said'); return; }
    if (g.said.text !== w.text) { ok(false, label + ': narrated words unchanged', `now “${g.said.text.slice(0, 90)}…”, recorded “${w.text.slice(0, 90)}…”`); return; }
    const playsMp3 = g.said.id === w.id && g.status === 200 && g.played && !g.tts.length;
    ok(playsMp3, `${label}: plays ${w.id}.mp3, no browser speech`, `id ${g.said.id}, HTTP ${g.status}, played ${g.played}, browser speech ${g.tts.length}`);
  });
}

// 3. read every step to me
for (const slug of LESSONS) {
  const r = await readToMe(slug);
  const want = base.lessons[slug][1];
  ok(r.checked && r.said && r.said.id === want.id && r.status === 200 && r.played && !r.tts.length,
    `${slug}: “Read every step to me” (saved preference) reads step 2 from ${want.id}.mp3`, JSON.stringify({ checked: r.checked, id: r.said && r.said.id, status: r.status, played: r.played, tts: r.tts.length }));
}

// 4. story narrator
for (const f of STORY_PAGES) {
  const want = base.story[f], got = now.story[f];
  ok(got.length === want.length, `${f}: ${want.length} narrator lines`, `found ${got.length}`);
  want.forEach((w, i) => {
    const g = got[i] || {};
    ok(g.said && g.said.id === w.id && g.status === 200 && g.played && !g.tts.length, `${f} narrator “${w.chapter}”: plays ${w.id}.mp3, no browser speech`,
      g.said ? `id ${g.said.id}, HTTP ${g.status}, played ${g.played}, browser speech ${g.tts.length}` : 'line missing');
  });
}

await browser.close(); server.kill();
console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail ? 1 : 0;
