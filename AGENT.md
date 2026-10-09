# Brief for the daily lesson agent

You build **IoT for Young Makers**, a free browser course published with GitHub Pages at
https://nkiliyumwami.github.io/iot-kids-course/. Read this whole file and `ROADMAP.md` before you start.

## Who it is for

- Children aged 10–15 and adults who are complete beginners. Assume they have never seen a breadboard,
  a resistor or a line of code.
- They work alone or with a parent or teacher, at their own pace (about one or two lessons a week).

## The one rule: one new idea per lesson

- Each lesson adds **at most one new piece of hardware and at most one new code idea**.
  If a lesson needs more, split it and update `ROADMAP.md`.
- Every lesson builds on the previous one and reuses the same traffic-light circuit. Never ask learners
  to take the circuit apart unless the lesson is about that.
- Start every lesson with a short recap of what they already know ("Last time you…").
- End every lesson with a "Make it yours" challenge and a quiz of 2–3 multiple-choice questions.
  A wrong answer gives an encouraging hint and lets them try again; a right answer explains why.

## How we teach (this is what the course owner cares about most)

- **Explain the why, not just the what.** For every wire, hole, part and line of code, answer:
  why is it here, why this pin, why this row and hole, why connected this way, and what would go wrong otherwise.
  Use a "Why is it built this way?" card on every build and code step (see lesson 1: `why`, `cue()`, `flash()`).
  Answers open automatically as the animation reaches that moment, and "Show me on the board" lights up the holes or pins involved.
- One or two short sentences per explanation. Plain words. Explain each technical word the first time it appears
  (use the `T(word, definition)` helper so the term is highlighted).
- Use the water-pipe analogy from lesson 1 when talking about voltage, current and resistance.
- Interactive demos beat text: e.g. "Unplug the ground wire" and the pretend no-resistor current meter in lesson 1.
  Mark pretend or unsafe demos clearly as pretend.
- Identify lights by text as well as colour. Labels must stay readable while the camera moves.
- The animation is an educational visualisation, never a safety test. Say so where it matters and suggest an adult check real circuits.

## Hardware and code (keep consistent across lessons)

- Board: **ESP32 DevKit V1, 30 pins**, pins pointing up, female-to-male jumper wires. Its 3D model in lesson 1
  (`makeESP32`) matches the real board: dark grey PCB, white mounting holes, ESP-WROOM-32 module with antenna,
  EN…VIN row facing the breadboard, D23…3V3 row at the back, red power LED, blue GPIO2 LED, AMS1117, CP2102,
  EN and BOOT buttons either side of the micro-USB socket. Reuse it; do not redesign it.
- Language: **MicroPython** (`main.py`), using `machine.Pin` and `time`. Pins are 3.3 V.
- Lesson 1 wiring (keep it in every later lesson):
  - D25 → 330 Ω → red LED anode (row 7, cathode row 8)
  - D26 → 330 Ω → yellow LED anode (row 15, cathode row 16)
  - D27 → 330 Ω → green LED anode (row 23, cathode row 24)
  - All cathodes → blue (−) ground rail with short black wires; rail → GND pin next to D13
- New parts go on free rows (e.g. rows 26–30 or the top half) and must not cross existing wires.
  Choose ESP32 pins that are safe for the job (inputs can use D32, D33, D14; analog input must be an ADC1 pin
  such as D32–D35 or VP/VN because ADC2 stops working when Wi-Fi is on). Explain the choice in a "Why?" card.
- **Pins and the Pin Explorer.** `pins.html` is a 3D explorer of every ESP32 pin (colour-coded type, kid-friendly
  explanation, MicroPython examples). Whenever a lesson uses a pin for the first time (a new LED, button, buzzer or
  sensor pin), add a "Why this pin?" answer that says what kind of pin it is and ends with a link
  `<a class="pin-link" href="../../pins.html?pin=D<number>" target="_blank" rel="noopener">🔍 …</a>`. Keep repeating
  that `Pin(n)` means GPIO n (printed Dn on the board), not the n-th pin along the header. Never pick input-only pins
  (D34, D35, VP, VN) for outputs, and avoid start-up pins (D2, D5, D12, D15) and TX0/RX0 for new parts. If you add or
  change facts about a pin, update the `PINS` list in `pins.html` too. The board model is `assets/models/esp32-devkit-v1.glb`.
- Only use code that really works on MicroPython for ESP32. Keep programs short and readable.

## Visual and interaction rules

- Copy lesson 1 (`lessons/01-traffic-light/index.html`) as the starting point for each new lesson and keep its
  look: light lab-bench layout, the same colour tokens and fonts (Baloo 2, Nunito, JetBrains Mono), Officer Ohm the guide,
  status chip, Reset view, Previous/Next, Replay this step, Pause, Show labels, Reset lesson, stage pills and progress.
- Nothing may hide the LEDs (no covers or housings). Do not add decorative wires that imply connections that don't exist.
- Highlight both ends of a connection before drawing a wire, move the camera close, and pause after each connection until Next.
- Show connected breadboard holes with the same gold/blue/dark strip highlight as lesson 1.
- Must work at phone width (400 px) with no sideways scrolling.
- Scripts only from cdnjs / jsDelivr (three.js r128 + OrbitControls 0.128.0). No other external code.
- Each lesson page includes `<script src="../../course.js"></script>`, then `../../assets/ohm/ohm.js` and `../../assets/rewards.js`, sets `LESSON_SLUG`, saves progress with
  `saveProgress({ step, steps })` and `saveProgress({ done: true })`, and links "← All lessons" to `../../index.html`.

## Officer Ohm and other artwork

- Officer Ohm, the course guide, lives in `assets/ohm/` as eight SVG poses: wave, point, thumbs, think, traffic,
  celebrate, encourage, magnify. Every lesson includes `<script src="../../assets/ohm/ohm.js"></script>` after
  `course.js`; it puts Ohm in the guide panel and changes his pose automatically (wave on step 1, point while
  building, think on "Why?" answers and quizzes, thumbs-up / encourage on quiz answers, celebrate when finished).
  Use `window.OHM.set('<pose>')` only if a step needs a specific pose. Do not redraw or restyle him.
- Badges live in `assets/badges/NN.svg` (one per lesson, already drawn for lessons 1–10) and each lesson in
  `course.js` has 3 `skills` for its certificate. Every lesson also includes `<script src="../../assets/rewards.js"></script>`
  after `ohm.js`: when the quiz is finished it shows the badge and a "Get your certificate" button
  (`certificate.html?lesson=<slug>`). If a lesson's skills change, update its `skills` in `course.js`.
- Artwork (characters, badges, covers, certificates) is for motivation only. The circuit, wiring and code are
  always drawn by code so they stay correct. Never replace them with generated images or videos.

## Each daily run

1. Read `ROADMAP.md`. Pick the **first unchecked item**. If the course owner left review comments on an open pull
   request, fix those first instead and stop there.
2. Build it in `lessons/<slug>/index.html` (copy lesson 1 and change what the lesson needs).
3. In `course.js`, set that lesson's `status` to `'ready'` and update its fields if they changed.
4. Test with `tools/check.sh lessons/<slug> "0,<a few step numbers>"` and look at every screenshot.
   Fix anything clipped, overlapping, unreadable or broken, and any script error. Also click through the quiz.
5. Tick the item in `ROADMAP.md` and add a dated line to its log: what you built, what you checked, anything left to do.
6. Commit on a new branch named `lesson/<slug>` and open a pull request into `main` titled
   "Lesson N: <title>". In the description: the new idea, the new part and code, the wiring, a short list of the
   "Why?" questions, and what you tested.
7. **Publish straight away:** if your checks passed, the daily workflow merges that pull request and asks GitHub Pages
   to rebuild, so learners get the lesson the same morning. The owner reviews afterwards and asks for changes by
   opening a `Change:` issue (handled by the same workflow) or with `@claude`. If something is still broken, leave the pull request open and explain why instead of merging.
8. Never push directly to `main`; always go through a pull request. Do one lesson per run.

## Two ways Claude works here

- **The daily lesson workflow** (`.github/workflows/daily-lesson.yml`, every morning on GitHub Actions) builds the next lesson,
  opens a pull request and merges it once its checks pass, which publishes it.
- **The `@claude` GitHub Action** (`.github/workflows/claude.yml`) runs when the owner writes `@claude` in an issue,
  a pull request comment or a review. It fixes what was asked on that pull request's branch.
  The daily run must not redo work the Action is already handling: if an owner's comment mentions `@claude`, leave it to the Action.

If something blocks you (a test you can't run, a decision only the owner can make), say so in the pull request
and in the log rather than guessing.
