/* Small in-memory rate limiter (per client key): `limit` requests per `windowMs`. Fine for one server process. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return function allow(key: string): boolean {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}
