# IoT for Young Makers, by KundaKode

A free, interactive 3D course that teaches complete beginners aged 10–15 to build and code IoT projects
with an **ESP32 DevKit** and **MicroPython**, one new idea per lesson.

**Open the course:** https://nkiliyumwami.github.io/iot-kids-course/

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | Course home page: lesson path, progress, kit list |
| `course.js` | The list of lessons (title, status, new idea), shared by every page |
| `lessons/NN-slug/index.html` | One self-contained lesson per folder |
| `AGENT.md` | The brief the daily lesson agent follows |
| `ROADMAP.md` | Planned lessons and a log of each run |
| `tools/check.sh` | Screenshots a lesson in headless Chromium and reports script errors |

No build step. Pages use three.js r128 and Google Fonts from public CDNs, so they need an internet connection.
Progress is stored only in the learner's browser.

## How new lessons arrive

The **Daily lesson** GitHub Actions workflow (`.github/workflows/daily-lesson.yml`) runs Claude every morning at about 6:54 am New York time. You can also start it by hand from the Actions tab (**Daily lesson → Run workflow**). It builds the next lesson in `ROADMAP.md`, tests it, opens a
pull request and merges it straight away, so the lesson goes live the same morning. Review it afterwards.

**To change a published lesson,** open an issue whose title starts with `Change:`, for example
"Change: make the Lesson 2 Why? answers shorter". The workflow makes the change, tests it and publishes it.

## Asking for changes

Write `@claude` followed by what you want in a pull request comment, a review or a new issue
(for example: "@claude make the button lesson's Why? answers shorter"). The Claude GitHub Action makes the change on that branch.

## Publishing (one-time setup)

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)**.
