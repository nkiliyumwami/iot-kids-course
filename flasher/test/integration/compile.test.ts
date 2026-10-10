/* Real compiles with PlatformIO in Docker. Needs the image: `npm run compiler:build`. Runs in CI. */
import { describe, it, expect } from 'vitest';
import { POST } from '../../app/api/compile/route';
import { BLINK, BROKEN } from '../sketches';

const post = async (body: unknown) => {
  const r = await POST(new Request('http://localhost/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, json: await r.json() };
};

describe('POST /api/compile with PlatformIO', () => {
  it('compiles blink into 4 images at the classic ESP32 offsets', async () => {
    const { status, json } = await post({ board: 'esp32dev', files: { 'src/main.cpp': BLINK } });
    if (status !== 200) console.log(json.log);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    const byName = Object.fromEntries(json.images.map((i: { name: string }) => [i.name, i]));
    expect(json.images.map((i: { address: number }) => i.address)).toEqual([0x1000, 0x8000, 0xe000, 0x10000]);
    expect(Object.keys(byName).sort()).toEqual(['boot_app0.bin', 'bootloader.bin', 'firmware.bin', 'partitions.bin']);
    const fw = Buffer.from(byName['firmware.bin'].data, 'base64');
    expect(fw[0]).toBe(0xe9);
    expect(fw.length).toBeGreaterThan(100_000);
    expect(Buffer.from(byName['bootloader.bin'].data, 'base64')[0]).toBe(0xe9);
  }, 240_000);

  it('returns 422 with compiler errors for a broken sketch', async () => {
    const { status, json } = await post({ files: { 'src/main.cpp': BROKEN } });
    expect(status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.log).toMatch(/error/i);
  }, 240_000);

  it('downloads registry libraries from libDeps', async () => {
    const src = `#include <Arduino.h>\n#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel px(1, 5, NEO_GRB + NEO_KHZ800);\nvoid setup(){ px.begin(); }\nvoid loop(){ px.setPixelColor(0, 255, 0, 0); px.show(); delay(500); }\n`;
    const { status, json } = await post({ files: { 'src/main.cpp': src }, libDeps: ['adafruit/Adafruit NeoPixel@^1.12'] });
    if (status !== 200) console.log(json.log);
    expect(status).toBe(200);
  }, 240_000);
});
