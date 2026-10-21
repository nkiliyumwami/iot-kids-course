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
| `package.mjs` | `out/EDIT_READY/` (numbered bins for a video editor, hard links to `out/`) + `out/SHOT_LIST.csv` |
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
node video/lesson-00/package.mjs           # out/EDIT_READY/ for the editor + SHOT_LIST.csv
node video/lesson-00/check-lesson.mjs      # confirm the lesson is unchanged
```
A full render takes about 35 minutes on the RTX 4050. To change a shot, edit its `frame(u)` function in `cinema.js`
(u = narration seconds). You can preview it by opening `render.html` through any local server and calling `cinema.seek('S07_gnd_then_power', 9.2)`.

## S02 revision (2026-10-21, after review)
The review approved everything except S02's speed, which was too fast for ages 10–15. Only S02 was re-rendered
(`render.mjs S02_spin_flip --force`), along with its proxy and first/last stills. The contact sheet, manifest and this report were then rebuilt.

| | Before | After |
|---|---|---|
| Usable animation | 8 s | 14 s |
| File (with 1 s handles each end) | 10 s, 600 frames | 16 s, 960 frames |
| Spin | 360° in 4.2 s, quintic ease, peak ≈ 430°/s, flat on screen (no sides visible) | 360° in 6 s, sine ease, peak ≈ 94°/s; camera leans in to 26° and back so the edges and headers show |
| Underside | 150° roll in 1.6 s, back almost at once | 150° roll in 2.5 s, held 1.3 s, back in 2.5 s |
| Front | barely held | held 1.2 s at the start; ends on exactly the starting pose |

Timeline (usable time, add 1 s for file time): 0–1.2 front · 1.2–7.2 spin · 7.2–7.6 settle · 7.6–10.1 roll over ·
10.1–11.4 underside · 11.4–13.9 roll back · 13.9–14 front.

Verification of the new S02:
- **Format:** 3840×2160, 60 fps, 960 frames, H.264 High 4:2:0, BT.709, CRF 14 slow, the same encoder settings as before.
  Proxy: 1920×1080, 960 frames, CRF 18.
- **Board present and frames not blank:** the GL read-back check found the board drawn in all 960 frames, and the blank-frame check passed on both files.
- **Smooth motion:** per-frame motion (MSE between neighbouring frames) rises and falls smoothly through each move, with no spikes. The holds are still
  (MSE ≈ 0), and no frame moves more than 1.5× its neighbour.
- **Proxy:** matches the master (PSNR 53 dB average, 49 dB minimum, against the master scaled to 1080p).
- **Start and end:** the first and last stills are identical to each other and to the old S02 first frame, so the start pose is unchanged.
- **Reviewed by eye:** frames at 2 fps across the clip, plus full-resolution 4K frames of the edge view (spin) and the underside.
  There are no missing parts, geometry glitches or lighting changes.
- **Not done:** I couldn't play the clip at real-time speed from this machine. Please watch `S02_spin_flip_1080.mp4` once at normal speed before signing off.
- **Other files unchanged:** SHA-256 of every other MP4, PNG and ZIP matches the pre-revision checksums (S01, S06 and S11 included),
  and their `verify.json` entries are unchanged.

## For the editor
`node video/lesson-00/package.mjs` builds `out/EDIT_READY/`:
- `01_board_shots_4K` (12), `02_code_animations_4K` (3), `03_stills_4K` (8)
- `04_proxies_1080p` (15, same names + `_1080`)
- `05_transparent` (the S01 PNG sequence, its zip, and the ST01/ST02 transparent stills)
- `06_first_last_frames_4K`
- `SHOT_LIST.csv` (ID, files, usable in/out timecodes, narration line, purpose, verification)
- `MANIFEST.json`, `CONTACT_SHEET.png`, `README.txt`, and a copy of this report as render instructions

The files are hard links, so the folder costs no extra disk space. Copy or zip it to move it. No narration or music has been added.

## What went wrong overnight (fixed)
1. **The board went missing in later shots.** With 5 parallel pages the GPU ran out of memory and the WebGL canvas went
   blank, but the HTML labels still drew, so my first "not blank" checks passed. I spotted it on the contact sheet. Fixed with
   2 pages, a GL read-back check in every frame, and retries. All 3D shots were rendered again.
2. **The ST01/ST02 alpha stills were white** (same cause). Re-rendered, verified, and checked on a checkerboard.
3. **The C03 first frames were empty** (`Pin(25)` faded in). It's now on screen from the first frame.
4. **The LED glow had a hard straight cut** where the sprite met the board. Drawn without depth testing in cinema,
   then all powered shots were re-rendered.

## Please review in the morning
- **S02 speed (done, 2026-10-21):** re-timed from 8 s to 14 s of usable animation after review. See "S02 revision" below.
- **Power LED:** on in the hero shots and all labelled shots; off in S02–S04 (before "plug in the USB"). Easy to flip per shot.
- **S10:** includes D5 and D2 as orange, because `board.js` marks them special (the brief's list didn't name them).
- **Label motion:** labels are HTML, placed at sub-pixel positions. Watch S06 and S11 at full size for any 1-pixel shimmer in slow moves.
- **Background:** `#F6F8FA` as specified. The lesson's own viewport is `#F3F7FA`, which is near-identical.
- **Media isn't in git:** MP4/PNG/ZIP files are gitignored (~339 MB, mostly the alpha zip). Copy `out/` to the editing machine.
