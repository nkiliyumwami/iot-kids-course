# Plan: Lesson 0 video assets

1. **Isolate.** Work in a separate git worktree on branch `video-assets/lesson-00`, cut from `origin/main`. The main checkout
   (with uncommitted Parking Gate work) is never touched. Nothing is pushed or merged.
2. **Reuse the lesson's board, change nothing in the course.** `render.html` loads the same three.js r128, `assets/esp32/board.js`
   and `assets/models/esp32-devkit-v1.glb`, and builds the board with the lesson's own `ESP32.createViewer`. It captures the viewer's
   `requestAnimationFrame` callback and renderer, so every frame is drawn at an exact time. No lesson file is edited, so there's no
   `?cinema=1` flag to add.
3. **Cinema API** (`cinema.js`): `window.cinema = { shots, seek(id, t), play(id, onFrame), ready }`. Each shot is a pure function
   of time: camera, board spin/tilt, pad colours (the lesson's group colours), the lesson's yellow glow, LED levels, labels
   (printed / GPIO), rings, label pops, and 2D badges. Frames can be drawn in any order, so they render in parallel.
4. **Code clips** (`code.html`): the lesson's "Your first program" box (`.lab` + dark `<pre>`), with the same fonts and colours,
   animated the same way.
5. **Capture** (`render.mjs`): Playwright with a 1920×1080 viewport at device scale 2 gives 3840×2160 PNG per frame, on the GPU
   (ANGLE/Vulkan). ffmpeg (static build from npm) encodes 4K CRF 14 slow and 1080 proxy files. It saves first/last stills,
   zips alpha PNG sequences, and verifies each output (ffprobe, black-frame and alpha checks). It's idempotent through `out/verify.json`.
6. **Review by eye.** Look at sample frames of every shot before the full render, then at the contact sheet and full-size frames.
7. **Finish** (`finish.mjs`): `CONTACT_SHEET.png` and `MANIFEST.json`. `check-lesson.mjs` re-runs the real lesson to confirm
   step 1 still works. Write REPORT.md and commit.
