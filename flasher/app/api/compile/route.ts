/* POST /api/compile: compile an ESP32 Arduino sketch with PlatformIO (Docker) and return the flash images. */
import { validateRequest, MAX_SOURCE_BYTES } from '../../../lib/validate';
import { compile } from '../../../lib/compile';
import { createRateLimiter } from '../../../lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 200;

const allow = createRateLimiter(Number(process.env.COMPILE_RATE_LIMIT || 10), 60_000);
let running = 0;
const MAX_PARALLEL = Number(process.env.COMPILE_MAX_PARALLEL || 2);

export async function POST(req: Request): Promise<Response> {
  const key = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (!allow(key)) return Response.json({ ok: false, log: 'Too many compiles. Wait a minute and try again.' }, { status: 429 });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_SOURCE_BYTES * 2) return Response.json({ ok: false, log: 'Request is too large.' }, { status: 413 });

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ ok: false, log: 'Body must be JSON.' }, { status: 400 }); }
  const v = validateRequest(body);
  if (!v.ok) return Response.json({ ok: false, log: v.error }, { status: 400 });

  if (running >= MAX_PARALLEL) return Response.json({ ok: false, log: 'The compiler is busy. Try again in a moment.' }, { status: 503 });
  running++;
  try {
    const r = await compile(v.value);
    return Response.json(r, { status: r.ok ? 200 : 422 });
  } catch (e) {
    return Response.json({ ok: false, log: 'Compile service error: ' + (e as Error).message }, { status: 500 });
  } finally {
    running--;
  }
}
