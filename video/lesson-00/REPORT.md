# Lesson 0 video assets: report

Everything in the shot list was rendered and verified. Nothing was skipped.

**Where:** git worktree `~/iot-kids-course-video`, branch `video-assets/lesson-00` (from `origin/main`). Not pushed, not merged.
The files are in `video/lesson-00/out/` (339 MB). Your main checkout (`feature/parking-gate`, with its uncommitted work) was not touched.

## What was built
| File | What it does |
|---|---|
| `render.html` + `cinema.js` | Renders the lesson's own board (`board.js` `createViewer`, same GLB, lights, pad colours, LED looks, `.pl` labels) frame by frame. `window.cinema = { shots, seek(id, t), play(id, onFrame) }` |
| `code.html` | The code-animation clips, styled as the lesson's "Your first program" box |
| `render.mjs` | Renders everything: Playwright, GPU, 1920×1080 @2× = 3840×2160, frame N at N/60 s → ffmpeg. Idempotent. |
| `finish.mjs` | `out/CONTACT_SHEET.png` + `out/MANIFEST.json` |
| `check-lesson.mjs` | Opens the real lesson (no cinema), checks the board and step 1, and does the spin |
| `PLAN.md`, `DECISIONS.md` | The plan and every judgement call made overnight (read DECISIONS.md) |

## Outputs (all verified)
- **12 clips** S01–S12, **3 code clips** C01–C03. Each has a 4K MP4 (H.264 High, yuv420p, BT.709, CRF 14 slow, 60 fps), a
  `_1080.mp4` proxy, and `_first.png` / `_last.png` 4K stills. Every clip includes 1 s handles at each end, so a
  "t = 2 s" event happens 3 s into the file.
- **S01 alpha**: `S01_hero_orbit_alpha_png.zip`, 720 transparent 4K PNGs (`00000.png`…, 60 fps).
- **Stills** ST01–ST08 at 4K, plus `ST01_board_top_alpha.png` and `ST02_board_angled_alpha.png`.

Verification, all passing (results in `out/verify.json`, summarised in `MANIFEST.json`):
- ffprobe resolution, fps, frame count, codec and pixel format;
- every frame of every clip and every alpha PNG checked for blank frames;
- every 3D frame checked in the page that the board was actually drawn (GL read-back);
- alpha corners fully transparent;
- the contact sheet and full-size 4K frames reviewed by eye (S01, S05, S07 warning, S11 pulse, ST01, ST02 alpha on a checkerboard).

The lesson check passed: `lessons/00-meet-esp32` loads with no errors, the board renders, Step 1 shows "Spin the board",
and dragging completes it (`out/LESSON_CHECK_step1*.png`). No file outside `video/lesson-00/` was changed.

## How to re-render
```
cd video/lesson-00 && npm install          # Playwright 1.64.1 (uses the preinstalled Chromium), ffmpeg-static, three r128
node video/lesson-00/render.mjs            # everything; skips shots already rendered and verified
node video/lesson-00/render.mjs S05_usb_power_on --force   # one shot
node video/lesson-00/finish.mjs            # contact sheet + manifest
node video/lesson-00/check-lesson.mjs      # confirm the lesson is unchanged
```
A full render takes about 35 minutes on the RTX 4050. To change a shot, edit its `frame(u)` function in `cinema.js`
(u = narration seconds). You can preview it by opening `render.html` through any local server and calling `cinema.seek('S07_gnd_then_power', 9.2)`.

## What went wrong overnight (fixed)
1. **The board went missing in later shots.** With 5 parallel pages the GPU ran out of memory and the WebGL canvas went
   blank, but the HTML labels still drew, so my first "not blank" checks passed. I spotted it on the contact sheet. Fixed with
   2 pages, a GL read-back check in every frame, and retries. All 3D shots were rendered again.
2. **The ST01/ST02 alpha stills were white** (same cause). Re-rendered, verified, and checked on a checkerboard.
3. **The C03 first frames were empty** (`Pin(25)` faded in). It's now on screen from the first frame.
4. **The LED glow had a hard straight cut** where the sprite met the board. Drawn without depth testing in cinema,
   then all powered shots were re-rendered.

## Please review in the morning
- **S02 speed:** a full 360° spin plus a 150° flip and back in 8 s is faster than the "90° per 4 s" guideline, because the shot list asks for both.
  If it feels rushed, give it more time (edit `S02_spin_flip` and re-render one shot).
- **Power LED:** on in the hero shots and all labelled shots; off in S02–S04 (before "plug in the USB"). Easy to flip per shot.
- **S10:** includes D5 and D2 as orange, because `board.js` marks them special (the brief's list didn't name them).
- **Label motion:** labels are HTML, placed at sub-pixel positions. Watch S06 and S11 at full size for any 1-pixel shimmer in slow moves.
- **Background:** `#F6F8FA` as specified. The lesson's own viewport is `#F3F7FA`, which is near-identical.
- **Media isn't in git:** MP4/PNG/ZIP files are gitignored (~339 MB, mostly the alpha zip). Copy `out/` to the editing machine.
