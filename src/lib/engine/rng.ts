/**
 * Seeded PRNG using the xoshiro128** algorithm.
 *
 * All game randomness flows through this so that runs are fully
 * reproducible given the same seed.  Uses splitmix32 for state
 * initialization from a single 32-bit integer.
 */

// ── Core xoshiro128** ────────────────────────────────────────────────

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function xoshiro128ss(s: Uint32Array): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;

  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);

  return result / 0x100000000;
}

// ── Public interface ─────────────────────────────────────────────────

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
  /** Returns a copy of internal state for snapshotting. */
  saveState(): Uint32Array;
  /** Restores internal state from a previous snapshot. */
  restoreState(state: Uint32Array): void;
}

/**
 * Create a new seeded RNG from a 32-bit integer seed.
 *
 * Uses xoshiro128** — fast, excellent statistical properties, 128-bit state.
 */
export function createRng(seed: number): SeededRng {
  const s = new Uint32Array(4);
  const sm = splitmix32(seed);
  for (let i = 0; i < 4; i++) {
    s[i] = sm();
  }

  function next(): number {
    return xoshiro128ss(s);
  }

  return {
    next,

    nextInt(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },

    nextFloat(min: number, max: number): number {
      return next() * (max - min) + min;
    },

    nextGaussian(mean: number, stddev: number): number {
      const u1 = next();
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stddev;
    },

    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },

    weightedIndex(weights: number[]): number {
      const total = weights.reduce((sum, w) => sum + w, 0);
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },

    saveState(): Uint32Array {
      return new Uint32Array(s);
    },

    restoreState(state: Uint32Array): void {
      s.set(state);
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
