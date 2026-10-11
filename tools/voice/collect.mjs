// Lists every line Officer Ohm says on the site and the voice file each one needs.
// Writes assets/voice/lines.json: [{ id, file, where, text, done }]. The ids are the same fingerprint
// assets/voice/voice.js uses in the browser, so a changed sentence simply needs a new file.
// Run from the repository root: node tools/voice/collect.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
// the same as voice.js: drop the HTML tags, keep the words, squeeze the spaces
const clean = (t) => String(t).replace(/<[^>]*>/g, '').replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? m).replace(/\s+/g, ' ').trim();
function id(text) {
  const t = clean(text); let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const lines = [];
const add = (where, text) => { const t = clean(text), k = id(t), file = `assets/voice/en/${k}.mp3`; if (!lines.some((l) => l.id === k)) lines.push({ id: k, file, where, text: t, done: existsSync(file) }); };

// 1. the landing page story: each chapter's title and line (the CAPS table in index.html)
const home = readFileSync('index.html', 'utf8');
const caps = home.slice(home.indexOf('const CAPS = {'), home.indexOf('};', home.indexOf('const CAPS = {')));
for (const m of caps.matchAll(/(\w+): \['([^']*)', '([^']*)', '([^']*)'\]/g)) add(`story ${m[1]}`, `${m[3]}. ${m[4]}`);

// 2. lesson steps: "title. text" for every step that has both (lessons with a voice: see VOICED)
const VOICED = ['00-meet-esp32', 'lab1-light-it-up', 'lab2-code-switch'];
for (const slug of VOICED) {
  const src = readFileSync(`lessons/${slug}/index.html`, 'utf8');
  const body = src.slice(src.indexOf('const STEPS = ['));
  for (const m of body.matchAll(/title: '((?:[^'\\]|\\.)*)',(?:\s*\w+: '[^']*',)*\s*text: `([^`]*)`/g)) { const title = m[1].replace(/\\'/g, "'"); add(`${slug} · ${title}`, title + (/[.!?]$/.test(title) ? ' ' : '. ') + m[2]); }
}

writeFileSync('assets/voice/lines.json', JSON.stringify(lines, null, 2) + '\n');
const todo = lines.filter((l) => !l.done);
console.log(`${lines.length} lines, ${todo.length} still need a voice file, ${todo.reduce((n, l) => n + l.text.length, 0)} characters to generate.`);
