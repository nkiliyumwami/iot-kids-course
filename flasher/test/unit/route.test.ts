import { describe, it, expect, vi, beforeEach } from 'vitest';

const compile = vi.fn();
vi.mock('../../lib/compile', () => ({ compile: (...a: unknown[]) => compile(...a) }));
import { POST } from '../../app/api/compile/route';
import { BLINK } from '../sketches';

const post = (body: unknown, ip = '1.2.3.4') => POST(new Request('http://localhost/api/compile', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body),
}));

describe('POST /api/compile (compile mocked)', () => {
  beforeEach(() => compile.mockReset());
  it('returns 200 with images when the compile succeeds', async () => {
    compile.mockResolvedValue({ ok: true, log: 'SUCCESS', images: [{ address: 0x10000, name: 'firmware.bin', data: '6Q==' }] });
    const r = await post({ files: { 'src/main.cpp': BLINK } }, '10.0.0.1');
    expect(r.status).toBe(200);
    expect((await r.json()).images).toHaveLength(1);
  });
  it('returns 422 with the compiler log when the compile fails', async () => {
    compile.mockResolvedValue({ ok: false, log: "error: expected ';'" });
    const r = await post({ files: { 'src/main.cpp': BLINK } }, '10.0.0.2');
    expect(r.status).toBe(422);
    expect((await r.json()).log).toContain("expected ';'");
  });
  it('returns 400 for invalid JSON or requests', async () => {
    expect((await post('{nope', '10.0.0.3')).status).toBe(400);
    expect((await post({ files: { '../x.cpp': 'x' } }, '10.0.0.3')).status).toBe(400);
    expect(compile).not.toHaveBeenCalled();
  });
  it('rate-limits a client', async () => {
    compile.mockResolvedValue({ ok: false, log: 'x' });
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await post({ files: { 'src/main.cpp': BLINK } }, '10.0.0.9')).status);
    expect(codes.slice(0, 10).every((c) => c === 422)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
