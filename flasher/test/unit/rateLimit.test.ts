import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../lib/rateLimit';

describe('createRateLimiter', () => {
  it('allows N requests per window per key', () => {
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    t = 1001;
    expect(allow('a')).toBe(true);
  });
});
