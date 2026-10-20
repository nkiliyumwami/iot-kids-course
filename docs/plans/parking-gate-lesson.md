# KundaKode: The Parking Gate — implementation brief

**Module:** `m-parking-gate` | **Branch:** `feature/parking-gate` | **Status:** implementation brief, NOT completed/published

## Educational purpose

This is the next project after **Servo Says Hello**, which is already live. Our hybrid learning approach is guided foundations, then component skills, then increasingly independent real-world builds. Every mission should follow **Predict → Try → Observe → Explain → Apply** where appropriate; short visual interactions take priority over text.

**Opening challenge:** "Can you make a gate open by itself when a car arrives?" A miniature parking entrance in a Rwandan school or community setting. A car approaches; the learner's ultrasonic sensor measures distance; the ESP32 decides; the familiar SG90 raises the barrier. Make it clear this is a **tabletop educational model**, not a safety-certified parking gate.

**What the child will demonstrate:**
1. Identify the two ultrasonic transducers, TRIG and ECHO and explain "send sound, time echo".
2. Predict what happens to echo time and measured distance when a car moves closer.
3. Safely connect a suitable ultrasonic module and the already-learned servo to an ESP32.
4. Read a distance, compare it with a threshold and command the gate using genuine MicroPython.
5. Diagnose at least one unfamiliar fault and independently tune the threshold or movement sequence.

Do not award a badge for clicking Next. Final evidence combines a new measurement prediction, actual wiring, editable code, a fault fix, an independent mini-design task and a five-question check. Record hints without penalizing learners; do not equate "no hints" with formal mastery.

## Source code and existing assets

Read `AGENT.md`, `ROADMAP.md`, `course.js`, `lessons/_module-template/index.html`, `lessons/m-servo/index.html`, and relevant 3D/wiring helpers first.

- **Reuse** `assets/models/modules/parking-gate.glb` (already exists) and the working gate scene from `lessons/_module-template/index.html`. Preserve car approach, visible sonar range, rising/lowering barrier, animated surroundings, orbit/zoom and mobile performance.
- Reuse the course's `assets/models/esp32-devkit-v1.glb`, `assets/ohm/`, `assets/voice/`, `assets/run-panel.js` and `assets/board-link.js` / `assets/board-drawer.js` integration.
- Follow `lessons/m-servo/index.html` for the proven six-mission interaction, prediction checks, progressive hints, learning evidence, accessible controls, achievement summary and teacher notes.
- Create `lessons/m-parking-gate/index.html` (or a small local JS/CSS split if justified). Set `m-parking-gate` to `ready` in `course.js` **only after implementation and testing**; preserve `needs: '07-night-mode'` and `uses: ['m-servo']` prerequisites.
- Preserve all existing traffic-light lessons, module badges, certificates, other modules and progress entries. Keep the two local `KUNDAKODE_*.md` untracked files untouched.

## Six mission sequence

### 1. A Car at the Gate — discover
Start in the large 3D parking scene. A car approaches and the gate does NOT know it is there yet. Officer Ohm asks "How could the gate notice a car without someone pressing a button?" Tap the ultrasonic sensor and its two circular transducers; animate an outgoing "ping" and incoming echo (visualization, not audible ultrasound). Connect this to the familiar servo from the preceding module. Predict which part senses and which part moves.

### 2. How Far Away? — investigate
Offer a draggable car-distance slider, ideally overlaid on the actual gate scene. Show outgoing and returning pulse, elapsed time in microseconds and approximate centimetres (distance about pulse duration / 58 for air near room temperature). Ask learner to predict the effect of moving the car nearer/farther before they experiment. Explain round-trip timing, why we divide by two and that readings are approximate. Provide a timeout/invalid-reading example: "no echo" is not "zero centimetres". Focus on one new concept: reading ultrasonic distance. Equation details may be optional under Curious?.

### 3. Connect the Sensor — build
Interactive wiring workbench, not just static diagrams. Use the existing model and real clickable endpoints, with meaningful feedback for each wrong connection. Required:
- Genuine **3.3 V-compatible HC-SR04P variant**, with specifications verified for the actual chosen module; VCC → 3V3 and GND → board GND; TRIG → GPIO19; ECHO → GPIO21.
- SG90 signal → GPIO18, regulated external ~5 V power for servo, and servo supply negative joined to ESP32 ground.
- Never connect a 5 V ECHO directly to ESP32 GPIO; for a **standard 5 V HC-SR04** explain its ECHO needs level shifting, e.g. 1kΩ top / 2kΩ bottom voltage divider, with supply and module-specific verification.
- Never power servo from GPIO or ESP32 3V3, and do not present VIN as universally suitable.
- Power last. Correct wiring check must validate actual endpoints and grounds. Clearly distinguish visualization from electrically verified hardware.

### 4. Let the ESP32 Decide — code
Build and run a real, readable, ESP32 MicroPython program incrementally. Reuse `turn()` from Servo Says Hello. Add a short TRIG pulse, `machine.time_pulse_us` with bounded timeout, convert valid pulse durations to centimetres, compare to NEAR, then move a small tabletop gate arm with `if`/`else`. Use valid PWM duty_u16 and microsecond-to-duty conversion for the selected MicroPython version. Handle invalid measurements (`-1/-2` or exceptions as appropriate) without treating them as close cars or falsely safe/clear. A hardware sensor alone cannot know when someone is under a real barrier: avoid promising the simple prototype is suitable for vehicle/pedestrian protection. For tabletop simulation, use a sufficiently conservative hold before lowering and explain the limitation. The exact code shown in the editor must be the code sent through existing real-board workflow. If the lesson uses a simplified simulator, explicitly say it is a simulator, not arbitrary MicroPython execution.

### 5. Fix the Gate — debug
Create at least three inspectable, repairable faults with unique symptoms and progressively specific hints:
- ECHO miswired / wrong GPIO;
- missing common ground;
- 5 V ECHO connected directly to the ESP32 (safety hazard, must prevent unsafe "run");
- optionally a threshold that causes premature trigger or repeated opening.
At least one unfamiliar transfer diagnosis should require selecting a cause and performing the fix. Do not immediately display the answer.

### 6. Make It Yours — invent
Child independently sets NEAR distance, chooses open angle and hold time, watches the simulated car, and generates/edits the corresponding MicroPython. New challenge: "An approaching car should open the gate, but a passerby far away should not." Use two scenarios (near car and far object). Optional follow-up: those same parts can be repurposed for a **smart-bin lid**. Make the learning outcome visible through checked behaviors, not simply slider movement.

## User experience and accessibility

- Keep the animated GLB scene front-and-center; only short text panels visible at one time.
- Matching KundaKode colors, Baloo/Nunito fonts, Officer Ohm, 3D workbench, progress, rewind/replay/reset, show-labels and narration preference.
- Every term is explained briefly (ultrasonic, echo, threshold). Technical details optional after successful first interaction.
- Keyboard operable controls and mobile at 400 px (no horizontal scrolling). Labels legible as camera orbits; do not identify components by color alone.
- Save progress using the existing module model. Completion only after required interactions and final check.
- Preserve module unlock dependencies so learners must finish Servo Says Hello before Parking Gate.

## Testing and acceptance

Use a new local branch derived from published `main`; do not modify `main` or push/merge without permission. Verify local branch, working tree and remote alignment before edits; preserve untracked local briefs.

Required actual browser verification (not promises): GLB loads, orbit/zoom, car approach/echo simulation, servo gate animation, sensor-distance relation, wiring correctness and rejection of wrong endpoints, invalid pulse behavior, editable MicroPython and real-board panel, progression/quiz/badge, progress reload, mobile 400 px, related course hub, existing `m-servo` and module template. Test at least a simulated near car and far object, and one sensor timeout. Run existing appropriate regressions. State separately what was **not** tested on a physical ESP32/servo/sensor. Capture meaningful screenshots, with filenames and local URL.

**Deliver:** complete module, test log, screenshot set, updated ROADMAP and course metadata, honest limitations, local commit and GitHub-review-ready summary. Do not push, open PR, merge or publish until the owner has reviewed the local lesson.
