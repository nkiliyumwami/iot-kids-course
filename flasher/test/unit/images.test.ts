import { describe, it, expect } from 'vitest';
import { decodeImages, base64ToBytes } from '../../lib/images';

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('decodeImages', () => {
  it('decodes base64 and sorts by address', () => {
    const imgs = decodeImages([
      { address: 0x10000, name: 'firmware.bin', data: b64([0xe9, 1, 2]) },
      { address: 0x1000, name: 'bootloader.bin', data: b64([0xe9, 9]) },
      { address: 0x8000, name: 'partitions.bin', data: b64([0xaa, 0x50]) },
      { address: 0xe000, name: 'boot_app0.bin', data: b64([0xff]) },
    ]);
    expect(imgs.map((i) => i.address)).toEqual([0x1000, 0x8000, 0xe000, 0x10000]);
    expect(Array.from(imgs[3].data)).toEqual([0xe9, 1, 2]);
  });
  it('rejects a firmware without the ESP image magic byte', () => {
    expect(() => decodeImages([{ address: 0x10000, name: 'firmware.bin', data: b64([0, 1]) }])).toThrow(/0xE9/);
  });
  it('rejects overlapping images and empty lists', () => {
    expect(() => decodeImages([
      { address: 0x1000, name: 'a.bin', data: b64(new Array(0x8000).fill(1)) },
      { address: 0x8000, name: 'b.bin', data: b64([1]) },
    ])).toThrow(/overlaps/);
    expect(() => decodeImages([])).toThrow();
  });
  it('base64ToBytes round-trips', () => {
    expect(Array.from(base64ToBytes(b64([0, 127, 128, 255])))).toEqual([0, 127, 128, 255]);
  });
});
