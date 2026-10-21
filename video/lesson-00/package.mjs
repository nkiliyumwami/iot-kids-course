// After finish.mjs: lays the finished media out for a video editor (DaVinci Resolve, Premiere Pro, Final Cut…) in
// out/EDIT_READY/, sorted into numbered bins, with a shot list (SHOT_LIST.csv) the editor can read or import as notes.
//   node video/lesson-00/package.mjs
// Files are hard links to out/, so nothing is copied twice and no media file is changed. Copying the folder to another
// machine (or zipping it) gives ordinary files. Run it again after any re-render: it rebuilds the folder from out/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out'), PKG = path.join(OUT, 'EDIT_READY');
const FPS = 60;
const verified = JSON.parse(fs.readFileSync(path.join(OUT, 'verify.json'), 'utf8'));

// what each shot is for (from the shot list); the narration line comes from cinema.js / code.html via verify.json
const PURPOSE = {
  S01_hero_orbit: 'Hero ¾ view, slow 30° orbit with a gentle push-in; board powered, no labels. Opening title / intro.',
  S02_spin_flip: 'Top view; slow full spin with the camera leaning in to show the edges, a slow roll to the underside, a hold, and back. Unpowered.',
  S03_brain_pushin: 'Push in from the whole board to the metal module (the "brain"); soft glow on the module from 2 s.',
  S04_antenna: 'Close-up drift along the zig-zag Wi-Fi antenna; it pulses twice.',
  S05_usb_power_on: 'The USB socket; the red power LED wakes up at 2 s.',
  S06_pin_headers: 'Pan down the left header, across, and up the right; pin labels pop in as the camera reaches them.',
  S07_gnd_then_power: 'GND pins turn dark grey at 1 s, 3V3 and VIN turn red at 5 s, short-circuit warning at 8 s.',
  S08_d2_led: 'D2 and the blue LED: D2 lights at 1 s, LED ON at 3 s, OFF at 5 s, ON at 6.5 s.',
  S09_d25_trick: 'Count down the left header 1…8 and stop on D25; labels flip to GPIO numbers at 5 s and back at 7 s.',
  S10_special_pins: 'Every special-job pin turns orange together.',
  S11_pin_hunt: 'Pin hunt: D27, a GND, D26, 3V3, D32, D2 light up 1.8 s apart.',
  S12_hero_slow: 'The S01 view the other way, slower, settling into a clean hold for the end card.',
  C01_two_lines: 'Code card: types "from machine import Pin" and "led = Pin(2, Pin.OUT)".',
  C02_led_on_off: 'Code card: led.value(1) edited to led.value(0), with a drawn blue LED following it.',
  C03_pin25: 'Code card: Pin(25) and its answer, the board label D25 / GPIO25.',
  ST01_board_top: 'Still: straight-on board, all pin labels and group colours.',
  ST02_board_angled: 'Still: hero angle.',
  ST03_module_closeup: 'Still: metal module close-up (unpowered).',
  ST04_pinout_left: 'Still: left header pinout, its labels only, 20% larger.',
  ST05_pinout_right: 'Still: right header pinout, its labels only, 20% larger.',
  ST06_gnd_power_highlight: 'Still: GND and power pins highlighted.',
  ST07_d2_highlight: 'Still: D2 highlighted, blue LED on.',
  ST08_d25_highlight: 'Still: D25 highlighted.',
};
const BINS = { board: '01_board_shots_4K', code: '02_code_animations_4K', stills: '03_stills_4K', proxies: '04_proxies_1080p',
  alpha: '05_transparent', frames: '06_first_last_frames_4K', docs: '' };

const tc = (s) => { const f = Math.round(s * FPS); const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (3600 * FPS)))}:${p(Math.floor(f / (60 * FPS)) % 60)}:${p(Math.floor(f / FPS) % 60)}:${p(f % FPS)}`; };
const csv = (cells) => cells.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',');

fs.rmSync(PKG, { recursive: true, force: true });
for (const b of Object.values(BINS)) fs.mkdirSync(path.join(PKG, b), { recursive: true });
let linked = 0;
function put(file, bin) {
  const src = path.join(OUT, file), dst = path.join(PKG, BINS[bin], path.basename(file));
  if (!fs.existsSync(src)) throw new Error(`missing ${file}: render it first`);
  try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
  linked++;
}

const rows = [['shot_id', 'type', 'file_4k', 'proxy_1080p', 'transparent', 'file_duration_s', 'handles_s', 'usable_in_tc', 'usable_out_tc',
  'usable_duration_s', 'fps', 'narration_line', 'purpose', 'verification']];
const ids = Object.keys(verified).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
function rank(id) { return /^S\d/.test(id) ? 0 : id.startsWith('C') ? 1 : 2; }
for (const id of ids) {
  const v = verified[id], status = v.ok ? 'verified' : 'PROBLEMS: ' + (v.problems || []).join('; ');
  if (v.kind === 'clip') {
    const bin = id.startsWith('C') ? 'code' : 'board';
    put(v.file, bin); put(v.proxy, 'proxies'); put(`${id}_first.png`, 'frames'); put(`${id}_last.png`, 'frames');
    let alpha = '';
    if (v.alpha_zip) {
      put(v.alpha_zip, 'alpha');
      // the PNG sequence itself, ready to import as an image sequence (taken from out/ if it was unzipped there)
      const seq = path.join(PKG, BINS.alpha, `${id}_alpha_png`), have = path.join(OUT, `${id}_alpha_png`);
      fs.mkdirSync(seq);
      if (fs.existsSync(have) && fs.readdirSync(have).length === Math.round(v.duration * FPS)) {
        for (const f of fs.readdirSync(have)) { try { fs.linkSync(path.join(have, f), path.join(seq, f)); } catch { fs.copyFileSync(path.join(have, f), path.join(seq, f)); } }
      } else execFileSync('unzip', ['-q', path.join(OUT, v.alpha_zip), '-d', seq]);
      alpha = `${BINS.alpha}/${id}_alpha_png/ (PNG sequence 00000.png…, ${FPS} fps) and ${v.alpha_zip}`;
    }
    rows.push([id, id.startsWith('C') ? 'code animation' : 'board shot', `${BINS[bin]}/${v.file}`, `${BINS.proxies}/${v.proxy}`, alpha,
      v.duration, v.handle, tc(v.handle), tc(v.handle + v.length), v.length, FPS, v.line, PURPOSE[id] || '', status]);
  } else if (v.kind === 'still') {
    put(v.file, 'stills');
    if (v.alpha_file) put(v.alpha_file, 'alpha');
    rows.push([id, 'still', `${BINS.stills}/${v.file}`, '', v.alpha_file ? `${BINS.alpha}/${v.alpha_file}` : '', '', '', '', '', '', '',
      v.line, PURPOSE[id] || '', status]);
  }
}
const shotList = rows.map(csv).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'SHOT_LIST.csv'), shotList);
fs.writeFileSync(path.join(PKG, 'SHOT_LIST.csv'), shotList);
for (const f of ['MANIFEST.json', 'CONTACT_SHEET.png']) put(f, 'docs');
fs.copyFileSync(path.join(HERE, 'REPORT.md'), path.join(PKG, 'RENDER_INSTRUCTIONS_AND_REPORT.md'));

const count = (bin) => fs.readdirSync(path.join(PKG, BINS[bin])).length;
fs.writeFileSync(path.join(PKG, 'README.txt'), `KundaKode Lesson 0 — Pin Detective: Meet Your ESP32 · video assets for editing
Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from video/lesson-00/out/ (node video/lesson-00/package.mjs).

Bins (import each folder as a bin):
  ${BINS.board}/         ${count('board')} board shots, 3840×2160, 60 fps, H.264 High 4:2:0, BT.709
  ${BINS.code}/   ${count('code')} code animations, same format
  ${BINS.stills}/            ${count('stills')} stills, 3840×2160 PNG
  ${BINS.proxies}/        1920×1080 proxies with the same names + _1080 (same frames, same length).
                              In Resolve: link as proxy media. In Premiere: Proxy > Attach Proxies.
  ${BINS.alpha}/           transparent assets: S01 as a PNG sequence (import as an image sequence at 60 fps) and as a
                              zip of the same frames, plus ST01/ST02 transparent stills
  ${BINS.frames}/ first and last frame of every clip, 4K PNG (for thumbnails and freeze frames)

Timing: every clip has 1 s of handle before and after the usable part. SHOT_LIST.csv gives each clip's usable
in/out timecode (always 00:00:01:00 to 1 s before the end), its intended narration line and what it shows.
Times quoted in the shot list ("at 2 s") are measured from the usable in point.

Set the timeline to 3840×2160 (or 1920×1080), 60 fps, Rec.709. Background colour of non-transparent shots: #F6F8FA.
No narration or music has been added. MANIFEST.json lists every file with its verification result; CONTACT_SHEET.png
shows the first, middle and last frame of every clip.
`);
console.log(`EDIT_READY: ${linked} files in ${Object.values(BINS).filter(Boolean).length} bins; SHOT_LIST.csv: ${rows.length - 1} rows`);
