# KundaKode Flasher (v1)

Write Arduino C++ for an ESP32 in the browser, **compile it on the server** (PlatformIO in Docker),
then **flash it from Chrome** (Web Serial + [esptool-js](https://github.com/espressif/esptool-js)) and watch the
Serial Monitor. Target for v1: classic ESP32 boards (ESP32-WROOM / DevKit V1 / DevKitC) with a CP2102 or CH340
USB-to-serial chip. ESP32-S3/C3 (native USB) come in v2.

```
Browser (Chrome/Edge)                         Server (Next.js route handler)
 Editor ── Compile ── POST /api/compile ────▶  PlatformIO in Docker → bootloader, partitions,
                                     ◀──────── boot_app0, firmware (base64 + flash offsets)
 Connect: navigator.serial (Chrome picker)
 Flash:   esptool-js, in the browser           The board is plugged into YOUR computer.
 Monitor: Web Serial reader                    The server never touches it.
```

## Requirements

- **Chrome or Edge** on a computer (Windows, macOS, Linux, ChromeOS). Firefox and Safari have no Web Serial.
- The page must be served from **`https://`** or **`http://localhost`** (Web Serial needs a secure context).
- **Docker** on the machine that runs the server, and Node.js 20+.
- A USB **data** cable (some cables only charge).

## Run it locally

```bash
cd flasher
npm install
npm run compiler:build      # builds the kundakode-pio image (first time: a few minutes)
npm run dev                 # http://localhost:3000
```

Then in Chrome: **Compile** → **Connect** (pick the board) → **Flash** → **Monitor**.

## USB drivers

Most computers already have them. If the board doesn't appear in the Connect picker:

- **CP210x** (Silicon Labs): https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- **CH340 / CH9102** (WCH): https://www.wch-ic.com/downloads/CH341SER_EXE.html (Windows) ·
  https://www.wch-ic.com/downloads/CH341SER_MAC_ZIP.html (macOS)
- Linux: add yourself to the `dialout` group (`sudo usermod -aG dialout $USER`, then log out and in).
- Some Windows drivers don't report USB details to Chrome, so the board is hidden by the USB filter.
  Use **Connect ▾ → Show all serial ports** and pick its COM port.

## "Failed to connect": the BOOT button

Many CH340 boards can't enter flashing mode automatically. **Hold the BOOT button on the board, click Flash
again, and release BOOT when "Detected ESP32…" appears.** Also check that the Serial Monitor (or Thonny, Arduino
IDE, another tab) isn't using the port: only one program can own it at a time.

## API

`POST /api/compile` with `{ "board": "esp32dev", "files": { "src/main.cpp": "..." }, "libDeps": ["owner/Name@^1.0"] }`
→ `200 { ok, log, images: [{ address, name, data(base64) }] }` or `422 { ok: false, log }` with compiler errors.
Sources are capped at 2 MB, only `src/*.cpp|.h|.c|.hpp|.ino` files are accepted, libraries must come from the
PlatformIO registry, and the server writes `platformio.ini` itself (from a user-supplied one it keeps only
`lib_deps` and `monitor_speed`). Each compile runs in a fresh temp dir inside a resource-limited container with a
180 s timeout and no network unless libraries must be downloaded. Rate limit: 10 compiles per minute per client.
Settings: `COMPILE_IMAGE`, `COMPILE_TIMEOUT_MS`, `COMPILE_RATE_LIMIT`, `COMPILE_MAX_PARALLEL`.

## Tests

- `npm test`: unit tests (request checks, ini handling, image decoding, rate limit, API route, UI state).
- `npm run test:compile`: real compiles in Docker (needs the image). Both run in CI
  (`.github/workflows/flasher-compile.yml`), plus a curl check of a blink sketch.
- **Nothing touches Web Serial in automated tests.** Connect / flash / monitor are verified by hand on a real
  board (see the checklist in the pull request).
