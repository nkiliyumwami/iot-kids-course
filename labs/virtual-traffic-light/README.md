# Circuit Challenge Lab: Experiment & Fix It (the Traffic Light Virtual Lab)

A 3D practice lab where learners build, check and run the course's traffic-light circuit in the browser. It is an
**optional extra** listed on the lessons page right after Lesson 1. It does not replace Lesson 1 or the Circuit Labs,
no lesson waits for it, and it has no badge or certificate.

## Status

| Phase | What | State |
|---|---|---|
| 0 | Isolated tests and baseline | Done |
| 1 | The bench, tapping or picking anything to learn what it is, camera, layout, the 4 "Get ready" steps | Done, approved |
| 2 | Building all 13 parts, the electrical model (netlist), circuit checker, circuit doctor, safe plug-in, pin tester | Done, approved |
| 3 | MicroPython code panel and browser simulation, timing and patterns, experiment mode, fix-it workshop, quiz, summary | Done, approved |
| 4 | QA: workshop isolation, accessibility (axe), keyboard-only completion, touch gestures, performance, independent electrical verification, completion summary | Done, provisionally approved |
| 5 | Course integration: narration guard, optional entry on the lessons page, the course's read-aloud rules, course progress under its own id | Done, in owner review (not yet published) |

### How it fits into the course (phase 5)

- **Listing:** `course.js` has a separate `extras` list (not `lessons`), so lesson order, "Next" links, Start/Continue,
  badges and certificates never see the lab. `lessons.html` shows it as an "Optional challenge" card after Lesson 1.
  The home page and lessons page count only real lessons as "started".
- **Progress:** the lab keeps its own store (`iotkids.virtualLab.trafficLight.v1`) and also writes
  `{step, steps, done}` to the course store `iotkids.progress` under the id `circuit-challenge-lab` (never a lesson
  slug). Reset lab removes only that entry (`COURSE.forgetExtra`). Reopening offers "Carry on from step N", however
  many times the page is reloaded.
- **Voice:** 🔊 Listen and "Read every step to me" work like Pin Detective and Circuit Labs 1–2: the same
  title/text joining rule, the shared `kk-read-to-me` choice, and one voice at a time. There are no recordings
  for the lab yet, so the browser's voice reads it. Recording its lines needs the owner's approval.
- **Narration guard:** `npm run narration` checks that all 43 ElevenLabs recordings still play where they played
  before (`tests/narration-baseline.json`). Run it before merging any change to a narrated lesson.

All 24 steps are built. The program is a **browser simulation** of MicroPython that the page generates from settings; it is not a MicroPython interpreter and never runs typed code.

## Run it locally

```bash
# from the repository root
python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/labs/virtual-traffic-light/
```

It needs an internet connection for three.js r128 and the fonts (the same CDNs as every lesson).

## Tests

```bash
cd labs/virtual-traffic-light/tests
npm install            # once: pinned playwright 1.64.1, uses the cached Chromium; nothing global
npm run unit           # curriculum and progress rules, plain Node, no browser
npm run smoke          # phase 1 in headless Chromium (software WebGL, CPU only) at 1400, 768 and 400 px
npm run assembly       # phase 2: build the circuit by mouse, touch and keyboard, mistakes, checker, doctor, power
npm run program        # phase 3: code + simulation, experiment mode, fix-it, timing, quiz, saved progress
npm run phase4         # workshop isolation, multi-touch, axe audit on all 24 steps, LED visibility, recovery, keyboard-only completion
npm run perf           # load time, bytes, memory, frame rate (software WebGL), step-change time
npm run walkthrough    # a screenshot of every step at desktop and phone size, for review by eye
npm run narration      # the course's 43 recordings: unchanged files, same words, same fingerprints, MP3 plays, no browser speech
npm run integration    # published course vs this branch: links, order, badges, certificates, progress, voice, real-board panel
./check.sh labs/virtual-traffic-light "0,1,2,3"   # the course's own tools/check.sh, unchanged
```

Screenshots land in `tests/.out/` (git-ignored).

## Files

| File | Job |
|---|---|
| `labs/virtual-traffic-light/index.html` | The page: header, stage bar, 3D viewport, guide panel, no-3D fallback |
| `assets/virtual-lab/curriculum.js` | Teaching data: the canonical channels (D25/D26/D27, rows 7/15/23, 330 Ω), 8 stages, 24 steps, part descriptions. No 3D, testable in Node |
| `assets/virtual-lab/netlist.js` | The electrical model, pure and tested in Node: strips, gap, rails, pins, wires, LED polarity, resistors. Answers four separate questions: connected? matches the lesson? safe to power? which LEDs light for these pin levels? An educational model, not a circuit simulator |
| `assets/virtual-lab/code.js` | The MicroPython program, generated from settings (pattern + times, or up to 4 phases), in the course's style, plus one operation per line for the simulation. Refuses red and green together. A unit test runs the generated code in real Python with stand-in `machine`/`time` and checks it switches the pins exactly like the simulation |
| `assets/virtual-lab/simulator.js` | Runs those operations on a simulated clock fed with real elapsed time: run, pause, step, stop; which line, which pin HIGH/LOW. LEDs are never decided here: the netlist decides them from the pin levels and the real wiring |
| `assets/virtual-lab/runner.js` | The code panel and controls; turns one simulation state into LEDs, glowing current paths, pin labels, highlighted line, pin and light chips and the status card |
| `assets/virtual-lab/experiment.js` | Experiment mode: flip, move, remove and add parts on the learner's own build, judged by the same netlist; unsafe circuits are never powered; progressive hints, Show me the fix, Fix it for me |
| `assets/virtual-lab/progress.js` | Saves progress under `iotkids.virtualLab.trafficLight.v1` only; survives broken or blocked storage. A fix-it round's temporary circuit is saved separately (`workshop`), never over the learner's own build |
| `assets/virtual-lab/view.js` | The 3D bench, built on the shared `assets/circuit/kit3d.js` (unchanged): parts tray, labels, highlights, camera spots |
| `assets/virtual-lab/ui.js` | Guide panel helpers and the keyboard pickers |
| `assets/virtual-lab/main.js` | Starts the lab, runs the steps and buttons, exposes `window.__lesson` for tests |
| `assets/virtual-lab/lab.css` | Lab 1's design tokens plus this lab's pieces |

## Rolling back

Everything is additive. To remove the lab: delete `labs/virtual-traffic-light/` and `assets/virtual-lab/`, and revert the phase 5 changes to `course.js` (the `extras` list), `lessons.html` (the optional
card) and `index.html` (one line). A saved `circuit-challenge-lab` entry in a learner's progress is then simply ignored.

## Not yet verified

Every automated test runs in desktop Chromium (Playwright, software WebGL), with phones emulated by screen size and
touch. The following have **not** been tested and must be treated as unverified until someone does:

- a real Android phone, an iPhone or iPad (Safari), and Firefox on any device;
- a physical screen reader (TalkBack, VoiceOver, NVDA); the axe audit checks the markup only;
- a real graphics card (all performance figures so far use software rendering).

## Later: Omniverse

Not part of this lab. Every part already has a stable name (`controller`, `led-red`, `resistor`, …) and every
connection point a stable id (`near:D25`, hole `b7`, rail `BN`), which a future OpenUSD export could reuse as prim names
for a separately approved Omniverse experiment. The browser lab will always work without it.

## Testing on a real phone (nothing is exposed until the owner says so)

The automated tests use emulated touch in Chromium; they are **not** a real-device test. To try the lab on a real phone,
choose one of these. Neither creates a public link or an internet tunnel.

**A. Android phone over a USB cable (recommended: nothing on any network).**
1. On the phone: Settings → About → tap "Build number" 7 times → Developer options → turn on **USB debugging**.
2. On the laptop (one-time install, needs the owner's OK): `sudo apt install adb`.
3. Start the lab on this laptop only: `python3 -m http.server 8765 --bind 127.0.0.1`
4. Plug the phone in, accept the "Allow USB debugging?" prompt, then: `adb reverse tcp:8765 tcp:8765`
5. On the phone, open Chrome at `http://127.0.0.1:8765/labs/virtual-traffic-light/`. The phone reaches the laptop
   through the cable only. To see the phone's console on the laptop: Chrome → `chrome://inspect`.
6. When done: `adb reverse --remove-all`, unplug, stop the server (Ctrl+C).

**B. Any phone (iPhone too) on the same home Wi-Fi, for a few minutes (needs the owner's approval).**
This makes the lab reachable by every device on that Wi-Fi while it runs (it is a static page with no secrets, but
still: only on a trusted home network, never on public Wi-Fi).
1. Find the laptop's address: `ip -4 addr show scope global` (for example `192.168.1.20`).
2. Optional, safest: allow only the phone, e.g. `sudo ufw allow from <phone-ip> to any port 8766 proto tcp`.
3. Serve on that address only: `python3 -m http.server 8766 --bind <laptop-ip>`
4. On the phone: `http://<laptop-ip>:8766/labs/virtual-traffic-light/`
5. Stop the server (Ctrl+C) as soon as you are done, and remove the firewall rule if you added one.

What to try on the phone: pinch to zoom and two fingers to slide, tap holes and pins while building (do taps land on
the hole you meant?), the message card over the bench, the code panel, Run/Pause/Step, and rotating the phone.
