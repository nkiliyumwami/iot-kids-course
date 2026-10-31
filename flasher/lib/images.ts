/* Flash images returned by /api/compile: { address, name, data(base64) }. Shared by server and browser. */

export type ApiImage = { address: number; name: string; data: string };
export type FlashImage = { address: number; name: string; data: Uint8Array };

export const ESP_IMAGE_MAGIC = 0xe9;

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/* Decode, sort by address and sanity-check images before flashing. Throws a readable error. */
export function decodeImages(images: ApiImage[]): FlashImage[] {
  if (!Array.isArray(images) || images.length === 0) throw new Error('No firmware images to flash');
  const out = images
    .map((i) => ({ address: Number(i.address), name: String(i.name), data: base64ToBytes(i.data) }))
    .sort((a, b) => a.address - b.address);
  for (const img of out) {
    if (!Number.isInteger(img.address) || img.address < 0 || img.address > 0x1000000) throw new Error(`Bad flash address for ${img.name}`);
    if (img.data.length === 0) throw new Error(`${img.name} is empty`);
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1].address + out[i - 1].data.length > out[i].address) throw new Error(`${out[i - 1].name} overlaps ${out[i].name}`);
  }
  const app = out.find((i) => i.name === 'firmware.bin');
  if (app && app.data[0] !== ESP_IMAGE_MAGIC) throw new Error('firmware.bin is not an ESP32 image (missing 0xE9 header)');
  return out;
}
