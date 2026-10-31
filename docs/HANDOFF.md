# IoT for Young Makers (KundaKode): project handoff for an AI with agents

Written 2026-10-31 at `main` = `9b4fbbf`. This file covers what has been built, where things stand today, what is
still missing, and a suggested way to split the remaining work across agents. If anything here disagrees with the
repository, the repository is right, so check before you act.

---

## 1. What the project is

- **Product:** a free, browser-only, interactive 3D course that teaches complete beginners (ages 10–15, plus adults)
  to build and code IoT projects with an **ESP32 DevKit V1 (30 pins)** and **MicroPython**.
- **Brand:** "IoT for Young Makers by KundaKode". Its audience is mainly Rwanda: the project scenes show everyday
  Rwandan life, and there is a WhatsApp call to action.
- **Repo:** https://github.com/nkiliyumwami/iot-kids-course. Local checkout: `/home/labadmin/iot-kids-course`.
- **Live site:** https://nkiliyumwami.github.io/iot-kids-course/ (GitHub Pages, deployed from `main`, root folder).
- **Owner:** the repo owner, `nkiliyumwami` on GitHub. They judge work mostly by **how it looks**: placeholder or
  low-poly visuals cost their confidence, so say up front when something is a placeholder, and use real assets
  where that's cheap. They prefer plain language.
- **Stack:**
  - Static HTML and JS with no build step.
  - three.js **r128** from cdnjs/jsDelivr, with OrbitControls, GLTFLoader, DRACOLoader and RoomEnvironment.
  - Google Fonts: Baloo 2, Nunito and JetBrains Mono.
  - Web Serial for the real board.
  - 3D models are built headlessly with **Blender 5.0.1** (`bpy`) scripts in `tools/blender/` and exported as
    Draco-compressed GLB.
  - Progress is saved only in the learner's browser (`localStorage`, key `iotkids.progress`).

### Required reading, in this order
1. `CLAUDE.md`: the short rules for Claude in this repo.
2. `AGENT.md`: **the teaching and design contract.** It covers one new idea per lesson, a "Why?" for every wire,
   hole and line of code, the pin rules, the safety list, the visual rules and how the real-board panel is wired up.
3. `ROADMAP.md`: the planned items (all ticked now) and a dated **Log** of every change, which is the full history.
4. `README.md`, `course.js` (the list of lessons, modules and extras), `tools/blender/README.md`, and
   `labs/virtual-traffic-light/README.md`.

---

## 2. History: how we got here (Oct 8–31, 2026, about 93 PRs)

| Dates | What was built |
|---|---|
| Oct 8–9 | Repo, home page, lesson 1, `AGENT.md` and `ROADMAP.md`. A **daily lesson GitHub Actions workflow** where Claude builds the next roadmap item every morning, tests it, opens a PR and merges it. Lesson 2. Officer Ohm (the illustrated guide). Badges and printable certificates. The 3D **ESP32 Pin Explorer** (`pins.html`). **Lesson 0 "Pin Detective"**. |
| Oct 10 | Rebrand to KundaKode (`assets/brand.js`). **"Run on my ESP32"**: Web Serial plus the MicroPython raw REPL (`assets/board-link.js`, `run-panel.js`, `board-drawer.js`). **"Prepare my board"**, which installs MicroPython with esptool-js (`prepare-board.js`; the firmware is in `firmware/micropython/`, refreshed by a workflow). Fixes for Windows COM ports. Lessons 1, 3 and 4. The shared **model road** with cars and pedestrians (`assets/road/`). The 3D story on the landing page. `index.html` became the landing page, and the course hub moved to `lessons.html`. |
| Oct 11 | Project cards with real 3D (8 Rwandan everyday projects, `assets/projects/`). `story.html`, which can be embedded in the Lovable KundaKode site through an iframe. Lesson 5. **Voice:** Officer Ohm narration with ElevenLabs ("Naledi", 43 MP3s in `assets/voice/en/`, browser speech as a fallback). **Circuit Lab 1 and 2** (`assets/circuit/kit3d.js`, a shared 3D breadboard kit). |
| Oct 12 | The story opens with a flight through a future Rwandan town (`assets/story/future-world.js`), with Blender hero models: drone, pupils, smart home, bananas. Lesson 6. **The owner tested lessons 1–3 on a real ESP32 and they worked.** |
| Oct 13–16 | Lessons 7–10: night mode, Wi-Fi, a web status page, phone control. Character bake-off PRs (#61 and #62, still open). |
| Oct 17 | A **Circuit Challenge Lab "Experiment & Fix It"** (`labs/virtual-traffic-light/`, PR #68), built from the two untracked `KUNDAKODE_*.md` brief and spec files: an optional extra after lesson 1 with its own Playwright test suite. On the same day the separate Omniverse/NVIDIA PoC was **stopped**, so don't propose Omniverse or GPU streaming again. |
| Oct 17–19 | All 10 lessons were done, so the daily runs moved to improvements ("Check these, in order" troubleshooting cards for lessons 6–10). The sensor-module framework was set up: `course.js` `modules`, `lessons/_module-template/`, and the rules in `AGENT.md`. Module ideas come from the Eazytronic library of kids' builds. |
| Oct 18–27 | **Nine sensor modules** were built (they unlock after lesson 7, in any order): `m-servo`, `m-parking-gate`, `m-thirsty-plant`, `m-rain-roof`, `m-door`, `m-joystick`, `m-too-hot`, `m-touch-fence`, `m-radar`. |
| Oct 20–21 | Assets for the Lesson 0 promo or teaching video (`video/lesson-00/`): 12 4K clips, 3 code clips and stills, plus an editor-ready package. |
| Oct 28 | The landing-page project cards now link to their modules and back again, and the kit panel was updated. |
| Oct 31 | **The 3D in all seven "Pick a sensor" modules was upgraded with Blender scenes** (PRs #86–#92, one porch/kitchen/garden/yard/desk scene per module, plus shared `tools/blender/parts.py`). **A Breadboard step and a 🧩 Breadboard tab were added to all nine modules** (PR #93: `assets/breadboard-view.js` plus `tools/blender/proto.py`). Everything is merged and live. |

---

## 3. Current state (what is live and working)

- **Lessons:** 0, Circuit Lab 1, Circuit Lab 2, then 1–10. Every roadmap item is ticked.
- **Modules:** nine, all `ready`. Each one has:
  - a story card, a parts list, a 3D story scene and a wiring tab;
  - a **Breadboard tab and step**;
  - an editable code panel, "Why?" taps, three challenges and a "Swap the part" box;
  - the real-board panel.
- **Extras:** the Circuit Challenge Lab. It is listed on `lessons.html`, but its README says phase 5 is still waiting
  for the owner's review.
- **Shared systems, with the files that own them:**

| System | File(s) |
|---|---|
| Course data, progress, unlocking | `course.js` |
| ESP32 pin facts, "maker words", board viewer | `assets/esp32/board.js`, `assets/models/esp32-devkit-v1.glb` |
| Real board (Web Serial, REPL, installer) | `assets/board-link.js`, `run-panel.js`, `board-drawer.js`, `prepare-board.js`, `firmware/micropython/` |
| 3D breadboard kit (labs) | `assets/circuit/kit3d.js` |
| Breadboard view (modules) | `assets/breadboard-view.js`, which exposes `Breadboard.plan/steps/build` from a per-module `proto` spec |
| Model road and pedestrians | `assets/road/model-road.js`, `pedestrians.js` |
| Landing story | `assets/story/story-scene.js`, `future-world.js`, `CREDITS.md` |
| Voice | `assets/voice/voice.js`, `assets/voice/en/*.mp3`, `tools/voice/collect.mjs` |
| Blender model scripts | `tools/blender/*.py` (`lib.py` holds the helpers; you rebuild a model by running its script, never by hand-editing the GLB) |
| Module GLBs | `assets/models/modules/*.glb` |
| Automation | `.github/workflows/daily-lesson.yml` (runs daily at 10:54 UTC, and also on issues titled `Build the next lesson…` / `Change:…`), `claude.yml` (`@claude` mentions), `micropython-firmware.yml` |

### Breadboard geometry used by the modules (in mm, Blender coordinates)
- The proto-board is 82.5 × 53.3 × 8.5. Column c sits at x = (c − 15.5) × 2.54.
- Rows a–e run from y = 13.97 down to 3.81, and rows f–j from −3.81 down to −13.97. The power rails are at
  |y| = 18.8 (−) and 21.34 (+).
- Two boards are used: the back one at z = −26.67 (in three.js) and the front one at z = +26.67. The ESP32 straddles
  both: its 3V3 header goes in front row a, its VIN header in back row j, the USB end is over column 1, and pin k
  sits in column 17 − k.
- Blender (x, y, z) maps to three.js (x, z, −y), and the GLB root is scaled 0.001.

---

## 4. What is missing or open (the backlog)

### A. Needs real hardware (a human has to do it)
1. Real-board tests of **lessons 4–10**, **Circuit Labs 1–2**, all **nine modules** and especially the **new
   breadboard layouts**: check the hole positions, check that the ESP32 straddling two half boards really fits, and
   check the 5 V servo supply. Issue #60 has a ready-made test-session checklist for lessons 4–6 and labs 1–2.
2. Test the Web Serial run panel and "Prepare my board" on a range of computers (Windows/Mac/Chromebook) and boards
   (CH340/CP2102, USB-C variants).
3. A real-phone check of the pages, including lessons 9–10 on a phone on the same Wi-Fi.

### B. Known content and accessibility defects (from issue #60, not yet fixed)
1. **Lesson 6** says `ADC.ATTN_11DB` reads 0–3.3 V. MicroPython documents roughly 150 mV–2.45 V (classic ESP32), so
   the text needs correcting (`lessons/06-measuring-light/index.html` around lines 1734, 1851, 1987 and 2180; check
   the current line numbers).
2. **Circuit Lab 1** still scales in and pulses some things when reduced motion is on.
3. **The 3D labs and modules can't be completed with a keyboard or a screen reader**, because the tap targets are only
   on the canvas. They need keyboard and ARIA equivalents.

### C. Course content gaps
1. "Check these, in order" troubleshooting cards for **lessons 1–5** (lessons 6–10 already have them).
2. **Landing-story chapters for lessons 5–10.** The story only covers 0–4.
3. **Narration** for lessons 1–10, the nine modules and the Circuit Challenge Lab. Only the story, Lesson 0 and the
   labs are recorded. ElevenLabs costs money, so **ask the owner first**.
4. A Breadboard view for the **traffic-light lessons** if the owner wants one (they use `kit3d.js`, not
   `breadboard-view.js`).
5. A possible new module or "Swap the part" ideas: water level, PIR, RCWL-0516, potentiometer, tilt switch. These stay
   swap boxes (see `AGENT.md`).
6. Translations (Kinyarwanda/French) have never been requested, so this is only an idea. Ask before starting.

### D. Waiting on owner decisions (open PRs; don't merge them without the owner's yes)
- **#18:** KundaKode web flasher v1, a Next.js compile service. It needs a server, which doesn't fit the course's
  "no server" rule.
- **#29:** real-size Blender car models for the model road.
- **#61 and #62:** a character critique pilot, plus the "Option A" skinned-kid bake-off (stacked on #61).
- The Circuit Challenge Lab phase 5 review, and recording its narration.
- The untracked `KUNDAKODE_CLAUDE_CODE_IMPLEMENTATION_BRIEF.md` and `KUNDAKODE_VIRTUAL_TRAFFIC_LIGHT_MVP_SPEC.md` in
  the repo root are the owner's: **leave them untracked and untouched.**

### E. Media
- The Lesson 0 video: the clips are rendered and verified (`video/lesson-00/REPORT.md`, `out/EDIT_READY/`), but the
  **final edit with voice-over and music is not done.**

### F. Tooling and tech debt
1. `tools/check.sh` fails on the owner's laptop, because copying the repo (`cp -r .`) hits a `.git` permission error.
   Fix it by excluding `.git` (for example with `rsync --exclude .git`). CI works.
2. There is no single test runner across all pages. The Playwright scripts used for the module audits lived in a
   scratchpad, so bring them into the repo (`tools/`) as a reusable smoke test: every page at 1400 and 400 px, no
   console errors, no sideways scroll, every tab of every module, plus the module behaviour checks.
3. Cache busting is done by hand (version query tags on scripts). Consider one shared version constant.
4. Remote feature branches pile up after merges. They are safe to delete, **except `pr-screenshots`, which must never
   be merged or deleted**: PR images link to it.
5. three.js r128 is old, but upgrading means touching every page, so it's a large, owner-approved project only.

---

## 5. Rules every agent must follow

- **Teaching:** follow `AGENT.md` exactly. One new idea per lesson. Give a "Why?" for every wire, hole and line.
  Use real terms, explained in plain words first. Programs must be real, runnable MicroPython, exactly as shown.
- **Safety:** no mains, relays, flame or gas sensors, or lasers. Pumps are always pretend. The servo runs on a
  regulated 5 V supply with a shared GND (VIN is only for a quick test). Never use 3V3 or a GPIO pin for servo power.
- **Pins:** follow the table in `AGENT.md`. Use ADC1 only for analog. Never use input-only pins for outputs. Avoid
  the start-up pins.
- **Visual:** must work at 400 px with no sideways scroll. Labels must stay readable. Nothing may hide the LEDs. Use
  real-looking assets: build them in Blender scripts, not as code primitives, wherever that's practical.
- **Git:**
  - Work on a feature branch and open a PR. **Never push to `main`.** The owner merges, or tells you to merge.
  - End commits with a `Co-Authored-By:` trailer and end PR bodies with the Claude Code line.
  - Commit only the files you changed. Never stash, reset or force-push someone else's work.
- **ROADMAP:** add one dated **Log** line per change. The lines only ever get appended, so when two branches both
  append, the merge conflict is resolved by **keeping both lines**.
- **Shared files:** `tools/blender/parts.py`, `assets/breadboard-view.js`, `course.js`, `assets/esp32/board.js` and
  `assets/brand.js` are used by many pages. Only one agent at a time may change each of them, and that agent must
  re-test every page that uses the file.
- **Daily workflow:** a scheduled Claude run still merges one improvement each morning. Before you merge, check for
  its PR or commit so you don't collide with it, or ask the owner to pause the workflow during large parallel work.
- **Honesty:** mark each check as PASS, FAIL or NOT RUN, with the evidence. Never claim a real-board result that you
  didn't get from a person.
- **Spending:** no paid APIs (ElevenLabs, cloud GPUs) and no new services without the owner's yes.

---

## 6. Suggested agents

The work divides cleanly by the files it touches. Run in parallel only those agents whose files don't overlap. Give
each one its own git worktree and branch.

| Agent | Mission | Owns or edits | Inputs → outputs | Tools | Can run in parallel? |
|---|---|---|---|---|---|
| **0. Orchestrator / release manager** | Picks backlog items, assigns them, merges approved PRs in order (merging `main` into each branch first, keeping both ROADMAP lines), watches the Pages deploy | `ROADMAP.md` merges only | Backlog → PR queue, release notes | `gh`, git | Always on |
| **1. Lesson and module author** | Builds or improves lesson pages: troubleshooting cards for lessons 1–5, the lesson 6 ADC text fix, new swap boxes, new modules from `_module-template` | `lessons/<one slug>/` | A backlog item → a PR plus screenshots | Editor, Playwright | Yes, one agent per lesson folder |
| **2. Pedagogy reviewer** (read-only) | Reviews every content PR against `AGENT.md`: one idea, a "Why?" everywhere, age-appropriate words, correct MicroPython, the safety list | Nothing (comments only) | PR → review | Read, `gh pr review` | Yes |
| **3. Electronics / wiring verifier** (read-only) | Checks pins, power, resistor values, breadboard hole maps (`MODULE.proto` specs) and code against ESP32/MicroPython documentation, then produces the **real-board test sheet** for the human | Writes only test checklists (`docs/tests/`) | Module → hole-by-hole checklist, findings | Read, web docs | Yes |
| **4. 3D asset builder** | Improves or creates Blender-scripted models (cars #29, the characters #61/#62 if approved, story chapters for 5–10), shrinks GLBs, keeps triangle budgets | `tools/blender/<own script>.py`, its GLB | Brief → GLB plus renders | Blender CLI / Blender MCP | Yes, one per script. **`parts.py` and `proto.py` are serial only** |
| **5. Scene / three.js integrator** | Puts new GLBs into pages, the story chapters (`assets/story/`), and the breadboard view for the traffic-light lessons | `assets/story/`, `assets/breadboard-view.js` (serial) | GLB → working scene | Editor, Playwright | Only one at a time on a given shared file |
| **6. QA / visual regression** | Brings in and runs the all-pages smoke test (1400 and 400 px, errors, overflow, every tab), fixes `tools/check.sh`, posts contact sheets on PRs (images go on the `pr-screenshots` branch) | `tools/` test scripts | Branch → PASS/FAIL report plus screenshots | Playwright, Chromium | Yes |
| **7. Accessibility** | Keyboard and ARIA alternatives for canvas tap targets (start in `kit3d.js`), reduced motion (Lab 1), contrast, axe runs | `assets/circuit/kit3d.js`, per-page fixes | Audit → fixes | axe-core, Playwright | Serial on `kit3d.js` |
| **8. Real-board connectivity** | Hardens Web Serial and the installer, browser and OS compatibility notes, error messages | `assets/board-link.js`, `prepare-board.js`, `run-panel.js` | Bug reports → fixes. Can't test hardware itself, so writes a test plan for the human | Editor, simulated-port tests | Yes, the only one on these files |
| **9. Voice and media** (needs the owner's spending yes) | Narration scripts for lessons 1–10, the modules and the lab; generates the MP3s (`tools/voice/`); runs `npm run narration` in the lab; does the Lesson 0 video edit | `assets/voice/`, `video/` | Text → MP3 / MP4 | ElevenLabs (paid), ffmpeg | Yes |
| **10. Docs keeper** | Keeps `README.md`, `AGENT.md`, `tools/blender/README.md` and this handoff up to date after each merge | Docs only | Merged PRs → updated docs | Editor | After merges |

### A suggested first wave (no file overlaps)
1. **QA agent:** fix `tools/check.sh` and add `tools/smoke-all.mjs`. Every other agent depends on this.
2. **Author agent:** the lesson 6 ADC text fix, then troubleshooting cards for lessons 1–5 (one PR each).
3. **Wiring verifier:** a printable real-board test sheet for all nine modules' breadboard layouts. Then hand it to
   the owner (the human does the testing).
4. **Accessibility agent:** reduced motion in Lab 1, then a keyboard path through `kit3d.js`.
5. **Orchestrator:** ask the owner to decide on PRs #18, #29, #61, #62 and the lab phase 5 review.

### Human in the loop (only the owner can do these)
- Real-board and real-phone tests, along with the purchase of any parts.
- Approving any spending (ElevenLabs, servers).
- Picking the winners of the visual bake-offs.
- Final approval before merging.

---

## 7. How to run and check locally

```bash
cd ~/iot-kids-course
python3 -m http.server 8765 --bind 127.0.0.1     # open http://127.0.0.1:8765/
tools/check.sh lessons/m-door "0"               # screenshots + script errors (fails locally on .git copy; see 4F)
cd labs/virtual-traffic-light/tests && npm run unit && npm run smoke   # the lab's own suite (also: assembly, program, walkthrough, perf, phase4, narration, integration)
blender -b --factory-startup -P tools/blender/proto.py -- tools/blender/out/   # rebuild a model, then copy the GLB to assets/models/modules/
```

The minimum bar for "done" on any page is all of these:
- no console errors at 1400 px and at 400 px;
- `document.documentElement.scrollWidth <= innerWidth` at 400 px;
- every tab and step can be opened;
- screenshots looked at by eye;
- a ROADMAP Log line added.
