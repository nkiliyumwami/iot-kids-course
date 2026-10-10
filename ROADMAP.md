# Roadmap

One new idea per lesson. Each daily run takes the first unchecked item. See `AGENT.md` for the rules.

## Start here

- [x] **0. Pin Detective: Meet Your ESP32** (`00-meet-esp32`): no hardware yet. Missions on the 3D board teach its
  parts, the pin groups (power, ground, GPIO, special) and the Pin(25) = D25 trick, with tappable "maker words".

## Part 1: Build the thing

- [x] **1. My First Traffic Light** (`01-traffic-light`): outputs. ESP32 switches D25/D26/D27 to light three LEDs
  through 330 Ω resistors. `Pin(…, Pin.OUT)`, `value()`, `while True:`, `time.sleep()`.
- [x] **2. Make It Yours: Light Patterns** (`02-patterns`): no new hardware. Variables for the times, a
  `set_lights(r, y, g)` function so each phase is one line, and `print()` to see what the program is doing
  (show the Thonny console). Challenge: design your own pattern.
- [x] **3. The Pedestrian Button** (`03-pedestrian-button`): a push button on a safe input pin.
  `Pin.IN` with `Pin.PULL_UP` (why a pin "floats" without it, why pressed reads 0), and `if`. First version: while
  the button is held, the light shows red.
- [x] **4. A Fair Crossing** (`04-fair-crossing`): no new hardware. Remember a press in a variable, finish the
  green safely, then give pedestrians their turn. Why buttons "bounce" and a simple fix.
- [ ] **5. Beep Beep: Crossing Sound** (`05-crossing-sound`): a buzzer that beeps while pedestrians may cross.
  `PWM`: sound is switching on and off very fast; frequency changes the pitch.
- [ ] **6. Measuring Light** (`06-measuring-light`): an LDR with a 10 kΩ resistor as a voltage divider on an ADC1 pin.
  Analog vs digital, readings from 0 to 4095, printing the numbers while covering the sensor.
- [ ] **7. Night Mode** (`07-night-mode`): no new hardware. A threshold turns on flashing yellow when it's dark.

## Part 2: Connect it

- [ ] **8. Hello, Wi-Fi** (`08-hello-wifi`): what a network and an IP address are; `network.WLAN` to connect and print the IP.
  Keep Wi-Fi passwords out of shared code (a separate `secrets.py`).
- [ ] **9. Your Traffic Light's Web Page** (`09-status-page`): a tiny web server on the ESP32 that shows the current light
  on a phone on the same Wi-Fi. Read-only.
- [ ] **10. Control It From Your Phone** (`10-phone-control`): buttons on the web page send commands; the safety rules
  (never red and green together, pedestrians get their full time) still win.

## After lesson 10

When every lesson above is ticked, use each run to improve one existing lesson: clearer "Why?" answers,
an extra interactive demo, or fixes from the course owner's comments. Add any new lesson ideas here first as unchecked items.

## Log

- 2026-10-09: Course set up. Lesson 1 moved from the original prototype, with a course home page, progress saving and this roadmap.
- 2026-10-09: Built lesson 2 (`02-patterns`). No new hardware: named variables (`RED_S`…), a `set_lights(r, y, g)` function and `print()` with a simulated Thonny Shell. Pattern presets (classic, warning flasher, light chase) with sliders are the "make it yours" challenge. Checked with `tools/check.sh` (desktop and 400 px, no script errors, no sideways scroll), clicked through presets and the quiz. Left to do: nothing known; the Shell is a simulation, not real Thonny output.
- 2026-10-09: Added lesson 0 (`00-meet-esp32`, Pin Detective) as the first lesson: 12 hands-on missions on the 3D board, maker words with a word book, a pin hunt and a quiz with its own badge. Rebuilt the Pin Explorer with a simple Explorer view (4 groups, plain words first, code tucked away) and a Pro view (7 groups, code open). Pin facts and words now live in `assets/esp32/board.js`.
- 2026-10-10: Course rebranded as "IoT for Young Makers by KundaKode" (`assets/brand.js`). Added "Run on my ESP32" (beta, `run.html`): Web Serial + MicroPython raw REPL in `assets/board-link.js`, a panel with Connect / Run / Stop / Board messages in `assets/run-panel.js`, friendly error explanations with the original message, and lights switched off after Stop. Tested against a simulated board; still needs a test on a real ESP32. Next: Save to board (main.py) and a Run panel in lessons 1 and 2, then a Prepare-my-board wizard.
- 2026-10-10: "Run on my ESP32" now connects like esptool/Schematik: no USB filter (the board shows as e.g. "USB-SERIAL CH340 (COM5)"), a clean EN reset on connect, and a diagnosis when MicroPython doesn't answer (another program such as Arduino/Schematik, download mode, or silence) with a connection log. Added the "Prepare my board" wizard (`assets/prepare-board.js`): Espressif's esptool-js (vendored in `assets/vendor/`) erases the board and installs the official MicroPython ESP32_GENERIC firmware, which `.github/workflows/micropython-firmware.yml` downloads into `firmware/micropython/`. Tested with a simulated board and a stand-in flasher; needs a real-board test.
- 2026-10-10: Every lesson (0–2) has "🔌 Try it on my real board": the lesson's own program preloaded, Connect / Run / Stop / Board messages, and Prepare my board. The installer now follows the flasher spec (esptool-js 0.7.0, connect at 115200, port fully released, 3 attempts, BOOT-button help). No server or installs needed: MicroPython runs the code on the board. Needs a real-board test.
- 2026-10-10: Lesson 1 has a model road behind the board: two lanes of cars and a small traffic light on each corner that copies the LEDs. Red: cars wait at the stop line. Yellow: a car that can stop safely stops; a car too close to stop carries on (we never teach "speed up"). Green: cars cross. It follows the green-time slider, Pause, step-through and the broken-loop demo. "Show the road" toggle, a "🚗 On the model road" card in stage A, reduced motion keeps the cars still. Checked with `tools/check.sh` (desktop and 400 px, no errors) and a 5-minute simulated run (no car runs a red light, no hard braking, cars keep their gap).
- 2026-10-10: Built lesson 3 (`03-pedestrian-button`). New part: a push button across the breadboard gap (rows 2 and 4) on D32, with a black wire to the ground rail. New code: `Pin(32, Pin.IN, Pin.PULL_UP)` and `if button.value() == 0: … else: …` (pressed → red, otherwise green). Teaches why a pin "floats" (pretend pull-up on/off demo with a flickering reading), why pressed reads 0, and why no resistor is needed. A "Hold to press the button" control drives the lights, the pin reading, the code highlight and the model road (a sudden red works like yellow: a car too close to stop carries on, which sets up lesson 4). "Make it yours" lets learners pick the pressed and not-pressed lights (choosing green for pressed shows a safety warning). Added the word "Floating pin" to the word book and a pull-up note to D32 in the Pin Explorer. Checked with `tools/check.sh` (desktop and 400 px, no script errors, no sideways scroll), held the button in the code step, toggled the pull-up demo and clicked through the quiz. Left to do: the real-board run (needs a push button wired to D32); the button wiring was not tested on hardware.
- 2026-10-10: Built lesson 4 (`04-fair-crossing`). No new hardware. New code idea: a flag variable `waiting = False` / `waiting = True` that remembers a press, a counting inner loop (`while count < 80`, 80 × 0.05 s) that listens during the whole green, then `if waiting:` gives yellow, red and clears the flag. Demos: a pretend forgetful program that loses a quick tap, a live "sticky note" showing `waiting`, and a slowed-down bounce demo (3 presses counted vs one flag). "Make it yours": sliders for green and walking times with the code updating. Added the words Variable, Flag and Bounce to the word book. The model road gets yellow before red. Checked with `tools/check.sh` (desktop and 400 px, no script errors, no sideways scroll), simulated the cycle (tap → green → yellow → red → green; forgetful mode loses the tap), ran the bounce demo and the quiz. Left to do: real-board run not tested; presses during red are not seen (noted in a Why answer, a good later challenge).
- 2026-10-10: The model road is now one shared file, `assets/road/model-road.js`, used by lessons 1, 3 and 4, and looks more realistic: textured asphalt with tyre tracks, paving and kerb stones, street lamps and trees, traffic lights with rounded housings, hoods and a pedestrian push button, and three car styles (sedan, hatchback, SUV) with wheel arches, glass, spoked wheels, lights, mirrors, plates, soft shadows and brake lights. Everything is still drawn by code. Checked with `tools/check.sh` on lessons 1, 3 and 4 (no errors) and a 5-minute simulated run (no red-light runners, no hard braking, safe gaps).
- 2026-10-10: People on the model road (`assets/road/pedestrians.js`), matching each lesson's code. Lesson 1: people cross the zebra only while cars wait at red. Lesson 3: the walker by the pole presses the crossing button when the learner does, and the pedestrian light shows the green walking figure while cars have red; a car too close to stop carries on and the walker waits for it. Lesson 4: a tap lights WAIT on the pole, the walker waits through yellow and crosses on red. People look both ways and cars always give way to anyone on the crossing. Checked with `tools/check.sh` on lessons 1, 3 and 4 and a 5-minute simulated run per lesson (no car near anyone crossing, every crossing started when allowed).
- 2026-10-10: The course home page opens with a 3D story of lessons 0–4 (`assets/story/story-scene.js`): the ESP32 blinks, the traffic light is wired and the cars obey, a light pattern, the button and a walker crossing, then the fair crossing with WAIT, and a "Your turn!" card. Captions per chapter, lesson buttons to jump, Pause. The 3D loads only when the story scrolls into view and stops when it is off screen; a still picture (`assets/story/poster.jpg`) shows while it loads, if 3D is not available, and reduced motion keeps the scene still. Checked at desktop and 400 px (no errors, no sideways scroll).
- 2026-10-10: Split the home page. `index.html` is now the landing page for parents and kids: the 3D story, "Real problems your child can solve" (project ideas such as a self-watering plant, energy-saving lights, door alarm, water-leak warning), "Real skills for the future", one ESP32 starter kit with a checklist of what it should include, and a note for parents and teachers. The course hub (Start here, Part 1, Part 2, badges, certificate, Pin Explorer, Run on my ESP32) moved to `lessons.html`, and every "← All lessons" link now points there.
- 2026-10-10: Each "Real problems your child can solve" card on the landing page has a small 3D loop (`assets/projects/projects-3d.js`): the plant that waters itself, lights that follow a person, a door alarm with a phone alert, a leak sensor, a classroom air light that asks for an open window, and a parking helper. One shared renderer draws all six, only while they are on screen, at about 30 frames a second; three.js loads only when the cards come near; reduced motion shows still pictures and the emoji icons stay if 3D is not available.
