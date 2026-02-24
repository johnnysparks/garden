import { describe, it, expect } from 'vitest';
import { createRng, hashSeed } from '../../src/lib/engine/rng.js';

describe('createRng', () => {
  it('produces deterministic output for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces different output for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    // At least one of the first 10 values should differ
    const diffs = Array.from({ length: 10 }, () => a.next() !== b.next());
    expect(diffs.some(Boolean)).toBe(true);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt() returns integers within range', () => {
    const rng = createRng(999);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(5, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('nextFloat() returns values within range', () => {
    const rng = createRng(777);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextFloat(2.5, 7.5);
      expect(v).toBeGreaterThanOrEqual(2.5);
      expect(v).toBeLessThan(7.5);
    }
  });

  it('nextGaussian() produces roughly normal distribution', () => {
    const rng = createRng(555);
    const mean = 10;
    const stddev = 2;
    const values = Array.from({ length: 10000 }, () => rng.nextGaussian(mean, stddev));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    // Mean should be close to target (within 0.2 for 10k samples)
    expect(avg).toBeGreaterThan(mean - 0.2);
    expect(avg).toBeLessThan(mean + 0.2);
  });

  it('pick() returns elements from the array', () => {
    const rng = createRng(111);
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('weightedIndex() respects weights', () => {
    const rng = createRng(333);
    // Heavily weight the first item
    const weights = [100, 1, 1];
    const counts = [0, 0, 0];
    for (let i = 0; i < 1000; i++) {
      counts[rng.weightedIndex(weights)]++;
    }
    // First item should dominate
    expect(counts[0]).toBeGreaterThan(900);
  });
});

describe('hashSeed', () => {
  it('returns a number', () => {
    expect(typeof hashSeed('test')).toBe('number');
  });

  it('is deterministic', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
  });

  it('differs for different strings', () => {
    expect(hashSeed('aaa')).not.toBe(hashSeed('bbb'));
  });
});
