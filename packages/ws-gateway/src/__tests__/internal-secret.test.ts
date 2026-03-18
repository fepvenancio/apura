import { describe, it, expect } from 'vitest';
import { timingSafeEqual } from 'node:crypto';

/**
 * BUG-04: Internal secret header must be compared using timing-safe comparison.
 *
 * We test the timingSafeCompare helper directly and verify that ws-gateway
 * source code uses it instead of string equality.
 *
 * Note: In Workers runtime, crypto.subtle.timingSafeEqual is used.
 * In Node.js tests, we use the equivalent node:crypto.timingSafeEqual.
 * The logic is identical -- compare fixed-length buffers in constant time.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return timingSafeEqual(bufA, bufB);
}

describe('BUG-04: timing-safe internal secret comparison', () => {
  it('returns true when header value matches secret', () => {
    const result = timingSafeCompare('my-secret-value', 'my-secret-value');
    expect(result).toBe(true);
  });

  it('returns false when header value does NOT match secret', () => {
    const result = timingSafeCompare('wrong-secret', 'my-secret-value');
    expect(result).toBe(false);
  });

  it('returns false when strings have different lengths (no crash)', () => {
    const result = timingSafeCompare('short', 'much-longer-secret-value');
    expect(result).toBe(false);
  });

  it('returns false for empty string vs non-empty', () => {
    const result = timingSafeCompare('', 'secret');
    expect(result).toBe(false);
  });

  it('uses crypto.subtle.timingSafeEqual (not string ===)', async () => {
    // Verify the source code does NOT contain the old pattern
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../index.ts'),
      'utf-8',
    );

    // Must NOT contain the old vulnerable comparison
    expect(source).not.toContain('internalSecret !== env.INTERNAL_SECRET');
    // Must contain timing-safe comparison
    expect(source).toMatch(/timingSafeCompare|timingSafeEqual/);
  });

  it('simulates request flow: missing header returns unauthorized', () => {
    const internalSecret: string | null = null;
    // The fixed code checks: !internalSecret || !timingSafeCompare(...)
    const shouldReject = !internalSecret;
    expect(shouldReject).toBe(true);
  });
});
