/**
 * Seeded PRNG using the mulberry32 algorithm.
 *
 * All game randomness flows through this so that runs are fully
 * reproducible given the same seed.
 */

export interface SeededRng {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number;
  /** Returns a float in [min, max). */
  nextFloat(min: number, max: number): number;
  /** Returns a normally-distributed value (Box-Muller). */
  nextGaussian(mean: number, stddev: number): number;
  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted random selection. Returns the index of the chosen item. */
  weightedIndex(weights: number[]): number;
}

/**
 * Create a new seeded RNG from a 32-bit integer seed.
 *
 * Uses mulberry32 — fast, simple, good statistical properties for game use.
 */
export function createRng(seed: number): SeededRng {
  let state = seed | 0;

  function mulberry32(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next: mulberry32,

    nextInt(min: number, max: number): number {
      return Math.floor(mulberry32() * (max - min + 1)) + min;
    },

    nextFloat(min: number, max: number): number {
      return mulberry32() * (max - min) + min;
    },

    nextGaussian(mean: number, stddev: number): number {
      // Box-Muller transform
      const u1 = mulberry32();
      const u2 = mulberry32();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stddev;
    },

    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(mulberry32() * arr.length)];
    },

    weightedIndex(weights: number[]): number {
      const total = weights.reduce((sum, w) => sum + w, 0);
      let r = mulberry32() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

/** Hash a string into a 32-bit integer seed. */
export function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}
