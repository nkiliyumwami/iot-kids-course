# Vendored libraries

- `esptool-js-0.5.4.js`: the browser bundle of [esptool-js](https://github.com/espressif/esptool-js) 0.5.4 by Espressif
  (Apache-2.0, includes pako, MIT and Zlib), copied unchanged from the npm package. It installs MicroPython on the
  learner's ESP32 in `assets/prepare-board.js`. Kept here so the installer works even if a CDN is unavailable.
