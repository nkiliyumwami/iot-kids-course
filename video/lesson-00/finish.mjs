// After render.mjs: builds out/CONTACT_SHEET.png (first / middle / last frame of every clip, and every still, labelled)
// and out/MANIFEST.json (every file with its ID, length, size, fps, alpha, narration line and verification result).
//   node video/lesson-00/finish.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out'), THUMBS = path.join(HERE, 'frames', 'contact');
const FFMPEG = process.env.FFMPEG || ffmpegPath;
const verified = JSON.parse(fs.readFileSync(path.join(OUT, 'verify.json'), 'utf8'));
fs.mkdirSync(THUMBS, { recursive: true });

const run = (argv) => new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, argv, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
  p.stderr.on('data', (d) => { err += d; }); p.on('close', (c) => (c ? reject(new Error(err)) : resolve()));
});
// thumbnails come from the encoded 4K files, so the sheet shows what the editor will get
async function frameOf(mp4, n, out) { await run(['-y', '-v', 'error', '-i', mp4, '-vf', `select=eq(n\\,${n}),scale=640:360:flags=lanczos`, '-frames:v', '1', out]); }
async function thumbOf(png, out, alpha) {
  const vf = alpha ? 'scale=640:360:flags=lanczos,format=rgba' : 'scale=640:360:flags=lanczos';
  await run(['-y', '-v', 'error', '-i', png, '-vf', vf, out]);
}

const ids = Object.keys(verified).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
function order(id) { return id.startsWith('S') && !id.startsWith('ST') ? 0 : id.startsWith('C') ? 1 : 2; }
const cells = [];
for (const id of ids) {
  const v = verified[id];
  if (v.kind === 'clip') {
    const mp4 = path.join(OUT, v.file);
    for (const [name, n] of [['first', 0], ['middle', Math.floor(v.frames / 2)], ['last', v.frames - 1]]) {
      const f = path.join(THUMBS, `${id}_${name}.png`); await frameOf(mp4, n, f);
      cells.push({ img: f, label: `${id} · ${name} (frame ${n})`, ok: v.ok });
    }
  } else if (v.kind === 'still') {
    const f = path.join(THUMBS, `${id}.png`); await thumbOf(path.join(OUT, v.file), f);
    cells.push({ img: f, label: `${id}.png`, ok: v.ok });
    if (v.alpha_file) { const a = path.join(THUMBS, `${id}_alpha.png`); await thumbOf(path.join(OUT, v.alpha_file), a, true); cells.push({ img: a, label: `${id}_alpha.png (on checkerboard)`, ok: v.ok, alpha: true }); }
  }
}

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font:600 15px/1.3 'Nunito',system-ui,sans-serif;color:#15202A}
h1{font:800 26px 'Baloo 2',system-ui,sans-serif;margin:18px 20px 4px}p{margin:0 20px 14px;color:#526170}
.g{display:grid;grid-template-columns:repeat(3,640px);gap:14px 14px;padding:0 20px 20px}
figure{margin:0}img{display:block;width:640px;height:360px;border:1px solid #D2DCE3}
img.alpha{background:repeating-conic-gradient(#cfd6dc 0 25%,#fff 0 50%) 0 0/32px 32px}
figcaption{padding:4px 2px}.bad{color:#D9443A}</style>
<h1>KundaKode Lesson 0 · video assets contact sheet</h1><p>Clips: 3840×2160, 60 fps, H.264 (with 1 s handles). Rendered ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.</p>
<div class="g">${cells.map((c) => `<figure><img class="${c.alpha ? 'alpha' : ''}" src="file://${c.img}"><figcaption class="${c.ok ? '' : 'bad'}">${c.ok ? '' : '⚠ '}${c.label}</figcaption></figure>`).join('')}</div>`;
const htmlFile = path.join(THUMBS, 'sheet.html'); fs.writeFileSync(htmlFile, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 800 } });
await page.goto('file://' + htmlFile); await page.waitForLoadState('load');
await page.screenshot({ path: path.join(OUT, 'CONTACT_SHEET.png'), fullPage: true });
await browser.close();

/* the manifest */
const manifest = { project: 'KundaKode Lesson 0 — Pin Detective: Meet Your ESP32', generated: new Date().toISOString(),
  notes: 'Clip times include 1 s of handle before and after the narration length. Clips: H.264 High, yuv420p, BT.709, CRF 14 (4K) / CRF 18 (1080 proxy). Background #F6F8FA unless alpha.',
  files: [] };
for (const id of ids) {
  const v = verified[id], status = v.ok ? 'verified' : 'problems: ' + (v.problems || []).join('; ');
  if (v.kind === 'clip') {
    const base = { id, narration_seconds: v.length, handles_seconds: v.handle, duration_seconds: +v.duration.toFixed(3), fps: 60, intended_line: v.line, verification: status };
    manifest.files.push({ file: v.file, ...base, resolution: '3840x2160', alpha: false });
    manifest.files.push({ file: v.proxy, ...base, resolution: '1920x1080', alpha: false, proxy_of: v.file });
    manifest.files.push({ file: `${id}_first.png`, id, kind: 'still (first frame)', resolution: '3840x2160', alpha: false, intended_line: v.line, verification: status });
    manifest.files.push({ file: `${id}_last.png`, id, kind: 'still (last frame)', resolution: '3840x2160', alpha: false, intended_line: v.line, verification: status });
    if (v.alpha_zip) manifest.files.push({ file: v.alpha_zip, ...base, kind: 'PNG sequence, transparent background (00000.png … at 60 fps)', resolution: '3840x2160', alpha: true });
  } else if (v.kind === 'still') {
    manifest.files.push({ file: v.file, id, kind: 'still', resolution: '3840x2160', alpha: false, intended_line: v.line, verification: status });
    if (v.alpha_file) manifest.files.push({ file: v.alpha_file, id, kind: 'still', resolution: '3840x2160', alpha: true, intended_line: v.line, verification: status });
  } else {
    manifest.files.push({ id, verification: status });
  }
}
manifest.files.push({ file: 'CONTACT_SHEET.png', kind: 'contact sheet', verification: 'reviewed by eye' });
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log(`contact sheet: ${cells.length} cells; manifest: ${manifest.files.length} files`);
