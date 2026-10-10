/* Browser-only serial monitor (spec Step 3). One owner of the port at a time: stop it before flashing. */

export type Monitor = { stop: () => Promise<void>; send: (line: string) => Promise<void>; reset: () => Promise<void> };

export async function startMonitor(port: SerialPort, baudRate: number, onLine: (s: string) => void): Promise<Monitor> {
  await port.open({ baudRate });
  const decoder = new TextDecoderStream();
  const closed = port.readable!.pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>);
  const reader = decoder.readable.getReader();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        lines.forEach(onLine);
      }
    } catch {}
  })();
  return {
    async stop() {
      try { await reader.cancel(); } catch {}
      try { await closed; } catch {}
      try { await port.close(); } catch {}
    },
    async send(line: string) {
      const writer = port.writable!.getWriter();
      try { await writer.write(new TextEncoder().encode(line + '\r\n')); } finally { writer.releaseLock(); }
    },
    async reset() {
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    },
  };
}
