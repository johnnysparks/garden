import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../src/lib/engine/rng.js';

describe('SeededRNG (xoshiro128**)', () => {
  it('produces deterministic output for the same seed', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    const valuesA = Array.from({ length: 20 }, () => a.next());
    const valuesB = Array.from({ length: 20 }, () => b.next());
    expect(valuesA).toEqual(valuesB);
  });

  it('produces different output for different seeds', () => {
    const a = new SeededRNG(1);
    const b = new SeededRNG(2);
    const va = a.next();
    const vb = b.next();
    expect(va).not.toEqual(vb);
  });

  it('returns values in [0, 1)', () => {
    const rng = new SeededRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() returns values within [min, max)', () => {
    const rng = new SeededRNG(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });

  it('int() returns integers within [min, max] inclusive', () => {
    const rng = new SeededRNG(77);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    // Should cover all values 1–6 in 500 rolls
    expect(seen.size).toBe(6);
  });

  it('saveState/restoreState creates a replayable checkpoint', () => {
    const rng = new SeededRNG(42);
    // Advance a few steps
    rng.next();
    rng.next();
    rng.next();

    const snapshot = rng.saveState();
    const nextFive = Array.from({ length: 5 }, () => rng.next());

    // Restore and verify same sequence
    rng.restoreState(snapshot);
    const replayed = Array.from({ length: 5 }, () => rng.next());
    expect(replayed).toEqual(nextFive);
  });

  it('has reasonable distribution (chi-squared rough check)', () => {
    const rng = new SeededRNG(314159);
    const buckets = 10;
    const counts = new Array(buckets).fill(0);
    const n = 10000;

    for (let i = 0; i < n; i++) {
      const bucket = Math.floor(rng.next() * buckets);
      counts[bucket]++;
    }

    const expected = n / buckets;
    for (const count of counts) {
      // Each bucket should have roughly expected ± 20%
      expect(count).toBeGreaterThan(expected * 0.7);
      expect(count).toBeLessThan(expected * 1.3);
    }
  });
});
