# Decisions (made unattended)

- **Where the work lives.** The main checkout was on `feature/parking-gate` with uncommitted edits (including `assets/esp32/board.js`).
  To keep those out of this branch and leave that checkout untouched, I made a git worktree at `../iot-kids-course-video`, on
  `video-assets/lesson-00`, cut from `origin/main`. The lesson 0 page and board model are identical on `origin/main` and on
  that branch's HEAD. The only uncommitted `board.js` change adds three glossary words, which doesn't affect the board.
- **A separate page, not `?cinema=1`.** `video/lesson-00/render.html` reuses `board.js` and `createViewer` unchanged. It doesn't
  edit the lesson or `board.js`, so the live lesson can't change and there's no merge conflict with the Parking Gate work.
  It wraps `THREE.WebGLRenderer` (adding `alpha` and `preserveDrawingBuffer`) and keeps the viewer's rAF callback, so frame N is
  drawn at exactly N/60 s. OrbitControls' `update()` is disabled in cinema so the shot list owns the camera.
- **Capture method.** I tested Option A (1920×1080 viewport, deviceScaleFactor 2) against Option B (a 3840×2160 canvas directly, CSS ×1).
  The WebGL output is the same pixel grid either way. A is better because the HTML pin labels (the lesson's own `.pl` buttons) are
  laid out in the lesson's CSS pixel sizes and Chrome rasterises the text at 2× for free. B would mean doubling every CSS size by hand.
  On top of A, the board is **supersampled**: renderer pixel ratio 4, so the canvas is 7680×4320, and the screenshot's exact 2:1
  downscale is a 2×2 box filter on top of the 4× MSAA. Side-by-side crops on S01 showed smoother slanted edges (module lid,
  board outline) than the plain 4K canvas, at almost the same speed on the GPU (~100–150 ms/frame), so I kept it. Switch it off
  with `window.CINEMA_SS = 1`.
- **GPU.** Headless Chromium uses the RTX 4050 through `--use-angle=vulkan`. Set `SOFTWARE_GL=1` to use SwiftShader instead
  (same pictures, slower).
- **ffmpeg.** No sudo, so no apt. I used `ffmpeg-static` and `ffprobe-static` from npm (libx264 included) as devDependencies
  of `video/lesson-00/package.json`. Override with the `FFMPEG` / `FFPROBE` environment variables.
- **Colour.** The encode is BT.709 limited range, tagged, with lanczos + accurate rounding for RGB→YUV. The background is flat `#F6F8FA`,
  as the brief asks. The lesson's own viewport is `#F3F7FA`, which is near-identical.
- **Lesson fidelity.** Pads use the lesson's colours: neutral `#6B7883` until a group is "discovered", then the group colour
  from `ESP32.GROUPS`. As in the lesson, they look light grey on screen because three r128 treats the hex as linear. Selected pins use
  the lesson's yellow emissive glow and `.pl.sel` outline. Label text matches the lesson: `D25` / `GPIO25`.
  Each shot shows the colour state a learner sees at that point in the mission. S06 has all pins neutral. S07 reveals GND, then
  power. S08 has GND+power. S09 adds GPIO green. S10 adds special orange. S11 and the pinout stills show all four groups.
- **Additions for the camera (not in the lesson):**
  - a very soft contact shadow under the board, hidden in alpha renders and faded while the board flips;
  - a wider "bloom" halo on the LEDs in close-ups, plus smooth 4–7-frame LED ramps instead of a hard one-frame switch;
  - flat 3D rings for pin pulses. The lesson's `.pl.good` CSS pulse runs in real time, so it can't be captured frame-exactly.
    The ring uses the lesson's success green (pin hunt, D25), yellow (D2), or the group colour (GND, power, special).
  - pin labels scale with the on-screen pin pitch, in the lesson's own proportion (~0.36 × pitch), so they stay attached
    to the board in push-ins and are readable at 4K (≈30–40 px tall in full-board shots).
- **Power LED.** The lesson starts unplugged. S02–S04 (spin, brain, antenna) are unplugged to match the story before
  "plug in the USB" in S05. The hero shots S01/S12, all labelled shots and the stills (except ST03) show the board powered,
  because a lit board reads better as a hero shot and it matches the lesson after mission 3.
- **S02 speed.** The brief's guideline (≤ ~90° orbit per 4 s) conflicts with "a full 360° spin, then a tilt to the underside
  and back, in 8 s". The shot list wins: the spin is eased over 4.2 s (quintic), and the board tilts 150° over 1.6 s and back.
  I rotate the board, not the camera, so the lights stay fixed and the underside is lit. All other shots keep to the guideline.
  The fastest is S01 at 30°/10 s.
- **S07 warning.** I drew the "⚠" as an SVG warning triangle. No colour-emoji font is installed, and an emoji could render
  differently on another machine. It flashes twice on a red badge, with a red capsule around the 3V3–GND pair drawn *under* the labels.
- **S09 label toggle.** Printed → GPIO numbers at t = 5 s, back at t = 7 s. Each flip is a 0.32 s card-flip (scaleY through 0).
- **S10 special pins.** I used whatever `board.js` marks as special (`groupOf(p) === 'special'`): EN, VP, VN, D34, D35, D12, TX0, RX0,
  D5, D2, D15. This includes D5 and D2, which the brief's list didn't name.
- **Handles.** Each clip has 1 s before and after the narration length. Narration-time events (for example "t = 2 s") are measured
  from the end of the leading handle, so in the file they happen at t + 1 s. During handles the motion holds (eased to rest)
  or drifts slowly.
- **ST04 / ST05.** In 16:9 a vertical board can't be cropped to a single header, so each pinout still shows only its own side's
  labels, 20% larger.
- **Code card.** Matches the lesson's `.lab` box: blue border `#3aa0ff`, `#EEF6FF` fill, Nunito title, dark `#13202A` `<pre>` in
  JetBrains Mono `#E3ECF1`, scaled ~3.4×. I dropped the 💻 from the title because there's no colour-emoji font. The typing speed is
  ~12 chars/s with seeded jitter, so the timing is repeatable. C02 edits `led.value(1)` into `led.value(0)` by backspacing two
  characters and retyping. The LED is a drawn 5 mm blue LED. C03 shows the answer as the board's own pin label style (green `.pl`
  with the yellow selected outline).
- **Git.** The rendered media (MP4, PNG, ZIP) is gitignored. It's ~1 GB and would bloat history. It sits in `out/` on disk.
  The code, docs, `MANIFEST.json`, `verify.json` and `CONTACT_SHEET.png` are committed.
- **GPU memory and the "board missing" failure.** The first full render used 5 parallel pages. Partway through S08, the GPU
  process ran out of memory (5 × ~1.2 GB supersampled buffers on a 6 GB RTX 4050) and the WebGL canvas went blank. The HTML pin
  labels kept drawing, so the automatic "not blank" check passed. I only caught it by looking at the contact sheet. Fixes:
  2 pages for the 3D board (code clips still use 4); `cinema.seek()` reads back a row and a column of the GL buffer and throws if
  the board isn't there (or if the context is lost); `render.mjs` reloads the page and retries the frame (3 tries), and every
  frame of every clip, and every alpha PNG, is now checked for blanks. All 3D shots were rendered again from scratch.
- **LED glow clipping.** The lesson's LED glow sprite is depth-tested, so it cuts into the board and the module lid with a hard
  straight edge (barely visible at lesson size, obvious at 4K and in the S05 close-up). In cinema the LED glow and halo sprites
  are drawn without depth testing, so they're round and soft. Every powered shot looks down on the LEDs, so nothing should
  hide them. The lesson itself is unchanged.
