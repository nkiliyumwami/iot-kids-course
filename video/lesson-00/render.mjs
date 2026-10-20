// Renders every clip and still for the Lesson 0 explainer video into out/.
//   node video/lesson-00/render.mjs                 all shots (skips ones already rendered and verified)
//   node video/lesson-00/render.mjs S05_usb_power_on C02_led_on_off --force
//   options: --force (render again), --workers N (parallel browser pages, default 4), --keep-frames
// The 3D shots come from render.html (the lesson's own board viewer), the code clips from code.html.
// Every frame is drawn at an exact time (frame N at N/60 s) and captured from a 1920x1080 page at device scale 2 = 3840x2160.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { serve } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(HERE, 'out'), FRAMES = path.join(HERE, 'frames');
const FPS = 60, W = 3840, H = 2160;
const FFMPEG = process.env.FFMPEG || ffmpegPath, FFPROBE = process.env.FFPROBE || ffprobeStatic.path;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const FORCE = flag('--force'), KEEP = flag('--keep-frames'), WORKERS = +opt('--workers', 4);
const wanted = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--workers'));
const PAGES = ['render.html', 'code.html'];
const BROWSER_ARGS = ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'];
// if the GPU is not available, set SOFTWARE_GL=1: SwiftShader gives the same pictures, only slower
const LAUNCH = { args: process.env.SOFTWARE_GL ? ['--use-gl=swiftshader', '--hide-scrollbars'] : BROWSER_ARGS };

fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(FRAMES, { recursive: true });
const VERIFY_FILE = path.join(OUT, 'verify.json');
const verified = fs.existsSync(VERIFY_FILE) ? JSON.parse(fs.readFileSync(VERIFY_FILE, 'utf8')) : {};
const saveVerified = () => fs.writeFileSync(VERIFY_FILE, JSON.stringify(verified, null, 2));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function run(cmd, argv, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-1500)}`))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

/* ---------- browser pages ---------- */
async function openPages(browser, url, page, n) {
  const pages = [];
  for (let i = 0; i < n; i++) {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${url}/video/lesson-00/${page}`);
    await p.evaluate(() => window.cinema.ready);
    if (errors.length) throw new Error(`${page}: ${errors.join('; ')}`);
    pages.push(p);
  }
  return pages;
}
async function capture(p, id, t, file, alpha) {
  await p.evaluate(([id, t, alpha]) => window.cinema.seek(id, t, { alpha }), [id, t, alpha]);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 }, omitBackground: alpha, animations: 'disabled', caret: 'hide' });
}

/* ---------- verification ---------- */
// mean / spread of a picture's brightness, and how much of it is see-through, measured by ffmpeg
async function pictureStats(file, { frame } = {}) {
  const sel = frame != null ? [`select=eq(n\\,${frame})`] : [];
  const vf = [...sel, 'format=yuva444p', 'signalstats', 'metadata=print:file=-'].join(',');
  const { out } = await run(FFMPEG, ['-v', 'error', '-i', file, '-vf', vf, '-frames:v', '1', '-f', 'null', '-']);
  const get = (k) => { const m = out.match(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`)); return m ? +m[1] : null; };
  return { yavg: get('YAVG'), ymin: get('YMIN'), ymax: get('YMAX') };
}
async function probe(file) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
    'stream=width,height,r_frame_rate,nb_read_frames,codec_name,pix_fmt:format=duration', '-of', 'json', file]);
  const j = JSON.parse(out), s = j.streams[0];
  const [a, b] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: a / b, frames: +s.nb_read_frames, duration: +j.format.duration, codec: s.codec_name, pix_fmt: s.pix_fmt };
}
const notBlank = (st) => st.yavg > 20 && st.ymax - st.ymin > 40;   // not black, not a single flat colour
async function verifyClip(file, w, h, seconds) {
  const p = await probe(file), problems = [];
  if (p.width !== w || p.height !== h) problems.push(`size ${p.width}x${p.height}`);
  if (Math.abs(p.fps - FPS) > 0.01) problems.push(`fps ${p.fps}`);
  if (Math.abs(p.frames - Math.round(seconds * FPS)) > 1) problems.push(`frames ${p.frames}`);
  if (p.codec !== 'h264' || p.pix_fmt !== 'yuv420p') problems.push(`${p.codec}/${p.pix_fmt}`);
  const first = await pictureStats(file, { frame: 0 }), lastF = await pictureStats(file, { frame: p.frames - 1 });
  if (!notBlank(first)) problems.push('first frame blank'); if (!notBlank(lastF)) problems.push('last frame blank');
  return { ok: !problems.length, problems, ...p, firstYavg: first.yavg, lastYavg: lastF.yavg };
}
async function verifyPng(file, alpha) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'json', file]);
  const s = JSON.parse(out).streams[0], problems = [];
  if (s.width !== W || s.height !== H) problems.push(`size ${s.width}x${s.height}`);
  if (alpha && !/a/.test(s.pix_fmt.replace('gray', ''))) problems.push(`no alpha channel (${s.pix_fmt})`);
  if (alpha) {
    // the corner must be fully transparent and the centre must not be
    const { out: o } = await run(FFMPEG, ['-v', 'error', '-i', file, '-vf', 'alphaextract,crop=64:64:0:0,signalstats,metadata=print:file=-', '-f', 'null', '-']);
    const m = o.match(/YMAX=([\d.]+)/); if (!m || +m[1] > 0) problems.push('corner not transparent');
  } else {
    const st = await pictureStats(file); if (!notBlank(st)) problems.push('blank');
  }
  return { ok: !problems.length, problems, width: s.width, height: s.height, pix_fmt: s.pix_fmt };
}

/* ---------- rendering ---------- */
async function renderFrames(pages, id, count, dir, alpha) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let next = 0, done = 0; const t0 = Date.now();
  await Promise.all(pages.map(async (p) => {
    while (next < count) {
      const n = next++;
      await capture(p, id, n / FPS, path.join(dir, `${String(n).padStart(5, '0')}.png`), alpha);
      done++;
      if (done % 120 === 0) log(`  ${id}${alpha ? ' (alpha)' : ''}: ${done}/${count} frames, ${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
    }
  }));
}
async function encode(dir, file, w, h, crf, preset) {
  const vf = `scale=${w}:${h}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p`;
  await run(FFMPEG, ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.png'), '-vf', vf,
    '-c:v', 'libx264', '-crf', String(crf), '-preset', preset, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(FPS), '-movflags', '+faststart', file]);
}

async function renderClip(pages, id, shot) {
  const seconds = shot.length + 2 * shot.handle, count = Math.round(seconds * FPS);
  const dir = path.join(FRAMES, id), mp4 = path.join(OUT, `${id}.mp4`), proxy = path.join(OUT, `${id}_1080.mp4`);
  log(`${id}: ${count} frames (${seconds} s incl. ${shot.handle} s handles)`);
  await renderFrames(pages, id, count, dir, false);
  fs.copyFileSync(path.join(dir, '00000.png'), path.join(OUT, `${id}_first.png`));
  fs.copyFileSync(path.join(dir, `${String(count - 1).padStart(5, '0')}.png`), path.join(OUT, `${id}_last.png`));
  fs.copyFileSync(path.join(dir, `${String(Math.floor(count / 2)).padStart(5, '0')}.png`), path.join(FRAMES, `${id}_mid.png`));
  log(`  encoding ${id}`);
  await encode(dir, mp4, W, H, 14, 'slow');
  await encode(dir, proxy, 1920, 1080, 18, 'medium');
  const res = { kind: 'clip', file: path.basename(mp4), proxy: path.basename(proxy), ...(await verifyClip(mp4, W, H, seconds)) };
  const pr = await verifyClip(proxy, 1920, 1080, seconds);
  if (!pr.ok) { res.ok = false; res.problems.push(...pr.problems.map((x) => 'proxy: ' + x)); }
  for (const f of [`${id}_first.png`, `${id}_last.png`]) { const v = await verifyPng(path.join(OUT, f), false); if (!v.ok) { res.ok = false; res.problems.push(`${f}: ${v.problems}`); } }
  if (shot.alpha) {
    const adir = path.join(FRAMES, `${id}_alpha`), zip = path.join(OUT, `${id}_alpha_png.zip`);
    await renderFrames(pages, id, count, adir, true);
    for (const n of [0, count - 1]) { const v = await verifyPng(path.join(adir, `${String(n).padStart(5, '0')}.png`), true); if (!v.ok) { res.ok = false; res.problems.push(`alpha frame ${n}: ${v.problems}`); } }
    fs.rmSync(zip, { force: true });
    execFileSync('zip', ['-q', '-0', '-r', zip, '.'], { cwd: adir });   // PNGs are already compressed: store only
    res.alpha_zip = path.basename(zip);
    if (!KEEP) fs.rmSync(adir, { recursive: true, force: true });
  }
  if (!KEEP) fs.rmSync(dir, { recursive: true, force: true });
  return res;
}
async function renderStill(pages, id, shot) {
  const file = path.join(OUT, `${id}.png`);
  await capture(pages[0], id, 0, file, false);
  const res = { kind: 'still', file: path.basename(file), ...(await verifyPng(file, false)) };
  if (shot.alpha) {
    const af = path.join(OUT, `${id}_alpha.png`);
    await capture(pages[0], id, 0, af, true);
    const v = await verifyPng(af, true); res.alpha_file = path.basename(af);
    if (!v.ok) { res.ok = false; res.problems.push(...v.problems.map((x) => 'alpha: ' + x)); }
  }
  return res;
}

/* ---------- main ---------- */
const { server, url } = await serve(ROOT);
const browser = await chromium.launch(LAUNCH);
const failures = [];
try {
  for (const page of PAGES) {
    const [first] = await openPages(browser, url, page, 1);
    const shots = await first.evaluate(() => window.cinema.shots);
    const ids = Object.keys(shots).filter((id) => !wanted.length || wanted.includes(id));
    if (!ids.length) { await first.close(); continue; }
    const pages = [first, ...(await openPages(browser, url, page, Math.max(0, WORKERS - 1)))];
    for (const id of ids) {
      const shot = shots[id];
      const prev = verified[id];
      const files = prev ? [prev.file, prev.proxy, prev.alpha_zip, prev.alpha_file].filter(Boolean) : [];
      if (!FORCE && prev && prev.ok && files.every((f) => fs.existsSync(path.join(OUT, f)))) { log(`${id}: already rendered and verified, skipping (--force to redo)`); continue; }
      try {
        const res = shot.still ? await renderStill(pages, id, shot) : await renderClip(pages, id, shot);
        verified[id] = { ...res, id, page, length: shot.length, handle: shot.handle, alpha: shot.alpha, line: shot.line, rendered: new Date().toISOString() };
        saveVerified();
        log(`${id}: ${res.ok ? 'OK' : 'PROBLEMS ' + res.problems.join('; ')}`);
        if (!res.ok) failures.push(id);
      } catch (e) {
        log(`${id}: FAILED ${e.message}`); failures.push(id);
        verified[id] = { id, ok: false, problems: [e.message] }; saveVerified();
      }
    }
    await Promise.all(pages.map((p) => p.close()));
  }
} finally {
  await browser.close(); server.close();
}
log(failures.length ? `done, with problems in: ${failures.join(', ')}` : 'done, everything verified');
process.exitCode = failures.length ? 1 : 0;
