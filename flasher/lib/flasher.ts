/* Browser-only: connect to an ESP32 over Web Serial and flash it with esptool-js.
   Follows the spec's reference implementation; adapted to esptool-js 0.7, which takes Uint8Array data. */
import type { FlashImage } from './images';

const FILTERS = [
  { usbVendorId: 0x10c4 }, // CP210x (Silicon Labs)
  { usbVendorId: 0x1a86 }, // CH340/CH9102 (WCH)
  { usbVendorId: 0x303a }, // Espressif native USB (S2/S3/C3)
  { usbVendorId: 0x0403 }, // FTDI
];

/* Call directly from onClick: no await may come before requestPort, or Chrome drops the user gesture.
   `all` lists every serial port: some Windows drivers don't report USB IDs, so the board only shows up then. */
export function pickPort(all = false): Promise<SerialPort> {
  return navigator.serial.requestPort(all ? {} : { filters: FILTERS });
}

export function portLabel(port: SerialPort): string {
  const { usbVendorId: v, usbProductId: p } = port.getInfo();
  const names: Record<number, string> = { 0x10c4: 'CP210x', 0x1a86: 'CH340', 0x303a: 'ESP32 USB', 0x0403: 'FTDI' };
  if (v == null) return 'Serial port';
  return `${names[v] || 'USB serial'} (${v.toString(16).padStart(4, '0')}:${(p ?? 0).toString(16).padStart(4, '0')})`;
}

export async function releasePort(port: SerialPort) {
  // Must be fully released before esptool opens it, and after it closes it.
  try { if (port.readable && !port.readable.locked) await port.readable.getReader().cancel(); } catch {}
  try { if (port.writable && !port.writable.locked) await port.writable.getWriter().close(); } catch {}
  try { await port.close(); } catch {}
  await new Promise((r) => setTimeout(r, 350));
}

export type Progress = (pct: number, msg: string) => void;

export async function flash(port: SerialPort, images: FlashImage[], onProgress: Progress) {
  const { ESPLoader, Transport } = await import('esptool-js');
  await releasePort(port);

  const transport = new Transport(port, /* tracing */ false);
  const loader = new ESPLoader({
    transport,
    baudrate: 115200, // connect speed — do not raise this
    romBaudrate: 115200,
    terminal: { clean() {}, writeLine(l: string) { onProgress(-1, l); }, write(s: string) { onProgress(-1, s); } },
  });

  try {
    onProgress(0, 'Connecting (hold BOOT if this hangs)…');
    const chip = await loader.main(); // sync + stub upload + chip detect
    onProgress(5, `Detected ${chip}`);

    await loader.writeFlash({
      fileArray: images.map((i) => ({ address: i.address, data: i.data })),
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (idx, written, total) => {
        const base = (idx / images.length) * 90 + 5;
        onProgress(base + (written / total) * (90 / images.length), `Writing image ${idx + 1}/${images.length}`);
      },
    });

    onProgress(98, 'Resetting board…');
    await loader.after('hard_reset');
  } finally {
    try { await transport.disconnect(); } catch {}
  }
  onProgress(100, 'Done');
}

const LOST = /failed to set control signals|device has been lost|device not configured|disconnected/i;
export const CONNECT_FAILED = /failed to connect|timeout|timed out|no serial data|invalid head|wrong boot mode/i;
export const BOOT_HELP = "Hold the BOOT button on the board, click Flash again, release BOOT when 'Detected' appears.";

/* Up to 3 attempts. A lost/reset port is released and retried; if it vanished (native-USB chips re-enumerate),
   pick it again from getPorts(). Returns the port that was finally used. */
export async function flashWithRetry(port: SerialPort, images: FlashImage[], onProgress: Progress, attempts = 3): Promise<SerialPort> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      await flash(port, images, onProgress);
      return port;
    } catch (e) {
      last = e;
      const msg = (e as Error)?.message || String(e);
      onProgress(-1, `Attempt ${i} failed: ${msg}`);
      if (i === attempts) break;
      await releasePort(port);
      await new Promise((r) => setTimeout(r, 500));
      if (LOST.test(msg)) {
        const ports = await navigator.serial.getPorts();
        if (!ports.includes(port)) {
          if (ports.length === 1) { port = ports[0]; onProgress(-1, 'The board reconnected; using it again.'); }
          else throw Object.assign(new Error('The board disconnected. Unplug it, plug it back in and click Connect again.'), { code: 'lost' });
        }
        continue;
      }
      if (CONNECT_FAILED.test(msg)) continue;
      throw e;
    }
  }
  const msg = (last as Error)?.message || String(last);
  if (CONNECT_FAILED.test(msg)) throw Object.assign(new Error(`${msg}\n${BOOT_HELP}`), { code: 'connect', hint: BOOT_HELP });
  throw last;
}
