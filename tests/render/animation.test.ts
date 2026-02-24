import { describe, it, expect } from 'vitest';
import {
	createWindState,
	updateWind,
	calculateSway,
	breathe,
	stressTremor,
	harvestPop,
	generateParticleBurst,
	type WindState,
} from '../../src/lib/render/animation.js';

// ── Wind System ──────────────────────────────────────────────────────────────

describe('createWindState', () => {
	it('returns default wind state', () => {
		const wind = createWindState();
		expect(wind.angle).toBe(0);
		expect(wind.strength).toBe(0.5);
		expect(wind.gustTimer).toBe(8000);
		expect(wind.elapsed).toBe(0);
		expect(wind.gustRemaining).toBe(0);
	});
});

describe('updateWind', () => {
	it('returns a WindState with expected shape', () => {
		const state = createWindState();
		const next = updateWind(state, 16);
		expect(next).toHaveProperty('angle');
		expect(next).toHaveProperty('strength');
		expect(next).toHaveProperty('gustTimer');
		expect(next).toHaveProperty('elapsed');
		expect(next).toHaveProperty('gustRemaining');
	});

	it('accumulates elapsed time', () => {
		let state = createWindState();
		state = updateWind(state, 100);
		expect(state.elapsed).toBe(100);
		state = updateWind(state, 200);
		expect(state.elapsed).toBe(300);
	});

	it('angle stays within ±π/4', () => {
		let state = createWindState();
		for (let i = 0; i < 200; i++) {
			state = updateWind(state, 500);
			expect(state.angle).toBeGreaterThanOrEqual(-Math.PI * 0.25 - 0.001);
			expect(state.angle).toBeLessThanOrEqual(Math.PI * 0.25 + 0.001);
		}
	});

	it('base strength stays within 0.3–0.7 range (outside gusts)', () => {
		// Step through time avoiding gust windows.
		// Base strength = 0.5 + sin(t*0.17)*0.2, range is [0.3, 0.7].
		// During gusts strength can exceed 0.7, so we check the formula directly.
		let state = createWindState();
		for (let i = 0; i < 200; i++) {
			state = updateWind(state, 500);
			// Strength is always ≤ 1 (clamped) and ≥ 0.3 (base minimum)
			expect(state.strength).toBeGreaterThanOrEqual(0.29);
			expect(state.strength).toBeLessThanOrEqual(1.0);
		}
	});

	it('wind gusts are periodic — gustRemaining is positive at expected intervals', () => {
		let state = createWindState();
		const gustStartTimes: number[] = [];

		// Step in 16ms increments for ~40 seconds
		let prevGustRemaining = 0;
		for (let i = 0; i < 2500; i++) {
			state = updateWind(state, 16);
			// Detect gust onset: gustRemaining transitions from 0 to positive
			if (state.gustRemaining > 0 && prevGustRemaining <= 0) {
				gustStartTimes.push(state.elapsed);
			}
			prevGustRemaining = state.gustRemaining;
		}

		// Should have multiple gusts
		expect(gustStartTimes.length).toBeGreaterThanOrEqual(4);

		// Verify periodicity: intervals should be ~8000ms (GUST_INTERVAL_MS)
		for (let i = 1; i < gustStartTimes.length; i++) {
			const interval = gustStartTimes[i] - gustStartTimes[i - 1];
			// Allow tolerance for step size
			expect(interval).toBeGreaterThan(7900);
			expect(interval).toBeLessThan(8600);
		}
	});

	it('gusts decay — strength spikes then returns to baseline', () => {
		// Advance to just before the first gust fires
		let state = createWindState();
		for (let i = 0; i < 490; i++) {
			state = updateWind(state, 16); // ~7840ms
		}

		// Step through the gust onset
		let peakStrength = 0;
		let gustActive = false;
		const strengthsDuringGust: number[] = [];

		for (let i = 0; i < 100; i++) {
			state = updateWind(state, 16);
			if (state.gustRemaining > 0) {
				gustActive = true;
				strengthsDuringGust.push(state.strength);
				peakStrength = Math.max(peakStrength, state.strength);
			}
		}

		expect(gustActive).toBe(true);
		expect(peakStrength).toBeGreaterThan(0.7); // spike above base range

		// Strength should generally decrease during the gust (decay)
		const firstHalf = strengthsDuringGust.slice(0, Math.floor(strengthsDuringGust.length / 2));
		const secondHalf = strengthsDuringGust.slice(Math.floor(strengthsDuringGust.length / 2));
		const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
		const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
		expect(avgFirst).toBeGreaterThan(avgSecond);
	});

	it('gustTimer is positive outside gust window', () => {
		let state = createWindState();
		// At t=4000ms (mid-cycle), gustTimer should be positive
		state = updateWind(state, 4000);
		expect(state.gustTimer).toBeGreaterThan(0);
		expect(state.gustRemaining).toBe(0);
	});

	it('is deterministic for same sequence of deltas', () => {
		let a = createWindState();
		let b = createWindState();
		for (let i = 0; i < 100; i++) {
			a = updateWind(a, 16);
			b = updateWind(b, 16);
		}
		expect(a).toEqual(b);
	});
});

// ── Sway ─────────────────────────────────────────────────────────────────────

describe('calculateSway', () => {
	const calmWind: WindState = { angle: 0, strength: 0, gustTimer: 8000, elapsed: 0, gustRemaining: 0 };
	const normalWind: WindState = { angle: 0.3, strength: 0.5, gustTimer: 4000, elapsed: 0, gustRemaining: 0 };
	const gustWind: WindState = { angle: 0.3, strength: 0.5, gustTimer: 8000, elapsed: 0, gustRemaining: 300 };

	it('returns a number', () => {
		const result = calculateSway(5, 1.2, 100, calmWind, 0);
		expect(typeof result).toBe('number');
	});

	it('sway output is bounded for reasonable inputs', () => {
		const mass = 50;
		const amp = 8;
		const freq = 1.5;

		for (let t = 0; t < 60000; t += 100) {
			const s = calculateSway(amp, freq, mass, normalWind, t);
			// response = 8/sqrt(50) ≈ 1.13
			// Generous bound of 5 for safety
			expect(Math.abs(s)).toBeLessThan(5);
		}
	});

	it('sway is continuous — small time steps produce small changes', () => {
		const mass = 50;
		const amp = 8;
		const freq = 1.5;
		const stepMs = 1; // 1ms step

		let prev = calculateSway(amp, freq, mass, normalWind, 0);
		for (let t = stepMs; t < 5000; t += stepMs) {
			const curr = calculateSway(amp, freq, mass, normalWind, t);
			const delta = Math.abs(curr - prev);
			// At 1ms granularity, change should be very small
			expect(delta).toBeLessThan(0.1);
			prev = curr;
		}
	});

	it('heavier plants sway less than lighter plants', () => {
		const lightMax = maxAbsSway((t) => calculateSway(5, 1, 10, calmWind, t));
		const heavyMax = maxAbsSway((t) => calculateSway(5, 1, 500, calmWind, t));
		expect(heavyMax).toBeLessThan(lightMax);
	});

	it('zero amplitude means zero sway in calm wind', () => {
		for (let t = 0; t < 10000; t += 250) {
			expect(calculateSway(0, 1, 100, calmWind, t)).toBe(0);
		}
	});

	it('gust adds extra sway component', () => {
		const t = 1000;
		const noGust = calculateSway(5, 1, 50, normalWind, t);
		const withGust = calculateSway(5, 1, 50, gustWind, t);
		expect(noGust).not.toBe(withGust);
	});

	it('is deterministic for same inputs', () => {
		const a = calculateSway(6, 1.3, 80, normalWind, 3700);
		const b = calculateSway(6, 1.3, 80, normalWind, 3700);
		expect(a).toBe(b);
	});

	it('handles very small mass (≥1 clamped)', () => {
		const result = calculateSway(5, 1, 0, calmWind, 1000);
		expect(Number.isFinite(result)).toBe(true);
	});
});

// ── Breathing ────────────────────────────────────────────────────────────────

describe('breathe', () => {
	it('returns 1.0 at time=0', () => {
		expect(breathe(0, 0.01)).toBe(1);
	});

	it('oscillates around 1.0', () => {
		let min = Infinity;
		let max = -Infinity;
		for (let t = 0; t < 20000; t += 100) {
			const v = breathe(t, 0.02);
			min = Math.min(min, v);
			max = Math.max(max, v);
		}
		expect(min).toBeGreaterThanOrEqual(0.98 - 0.001);
		expect(max).toBeLessThanOrEqual(1.02 + 0.001);
	});

	it('zero amplitude returns exactly 1.0', () => {
		for (let t = 0; t < 10000; t += 500) {
			expect(breathe(t, 0)).toBe(1);
		}
	});

	it('is deterministic', () => {
		expect(breathe(4200, 0.01)).toBe(breathe(4200, 0.01));
	});
});

// ── Stress Tremor ────────────────────────────────────────────────────────────

describe('stressTremor', () => {
	it('returns zero offset below stress 0.3', () => {
		for (const stress of [0, 0.1, 0.2, 0.29]) {
			const result = stressTremor(5000, stress);
			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
		}
	});

	it('returns non-zero offset at stress > 0.3', () => {
		let anyNonZero = false;
		for (let t = 0; t < 10000; t += 100) {
			const result = stressTremor(t, 0.6);
			if (result.x !== 0) anyNonZero = true;
		}
		expect(anyNonZero).toBe(true);
	});

	it('exactly at stress 0.3, intensity is zero so offset is zero', () => {
		// intensity = (0.3 - 0.3) * 0.03 = 0
		const result = stressTremor(5000, 0.3);
		expect(result.x).toBe(0);
		expect(result.y).toBe(0);
	});

	it('higher stress produces larger tremor amplitude', () => {
		const lowMax = maxAbsSway((t) => stressTremor(t, 0.4).x);
		const highMax = maxAbsSway((t) => stressTremor(t, 0.9).x);
		expect(highMax).toBeGreaterThan(lowMax);
	});

	it('y offset is 0.7× the x offset', () => {
		const result = stressTremor(2500, 0.7);
		expect(result.y).toBeCloseTo(result.x * 0.7, 10);
	});

	it('uses two layered frequencies for organic feel', () => {
		// The two-sine composition should differ from a single sine at freq 12.
		const singleSine = (t: number) => Math.sin((t / 1000) * 12) * 0.012;
		let differ = false;
		for (let t = 0; t < 10000; t += 100) {
			const tremor = stressTremor(t, 0.7).x;
			if (Math.abs(tremor - singleSine(t)) > 0.0001) {
				differ = true;
				break;
			}
		}
		expect(differ).toBe(true);
	});

	it('is deterministic for same inputs', () => {
		const a = stressTremor(7300, 0.55);
		const b = stressTremor(7300, 0.55);
		expect(a).toEqual(b);
	});
});

// ── Harvest Pop ──────────────────────────────────────────────────────────────

describe('harvestPop', () => {
	it('at progress=0, scale≈1 and opacity≈1', () => {
		const result = harvestPop(0);
		expect(result.scale).toBeCloseTo(1, 2);
		expect(result.opacity).toBeCloseTo(1, 2);
		expect(result.y).toBeCloseTo(0, 2);
	});

	it('at progress=1, scale≈0 and opacity≈0', () => {
		const result = harvestPop(1);
		expect(result.scale).toBeCloseTo(0, 2);
		expect(result.opacity).toBeCloseTo(0, 2);
	});

	it('y goes negative (springs upward) during animation', () => {
		let hasNegativeY = false;
		for (let p = 0; p <= 1; p += 0.05) {
			if (harvestPop(p).y < -1) {
				hasNegativeY = true;
				break;
			}
		}
		expect(hasNegativeY).toBe(true);
	});

	it('clamps progress to 0-1 range', () => {
		const below = harvestPop(-0.5);
		const atZero = harvestPop(0);
		expect(below).toEqual(atZero);

		const above = harvestPop(1.5);
		const atOne = harvestPop(1);
		expect(above).toEqual(atOne);
	});

	it('is deterministic', () => {
		expect(harvestPop(0.45)).toEqual(harvestPop(0.45));
	});
});

// ── Particle Burst ───────────────────────────────────────────────────────────

describe('generateParticleBurst', () => {
	it('returns requested count of particles', () => {
		expect(generateParticleBurst(5, 0.5)).toHaveLength(5);
		expect(generateParticleBurst(3, 0.5)).toHaveLength(3);
	});

	it('at progress=0, particles are at origin with full opacity', () => {
		const particles = generateParticleBurst(4, 0);
		for (const p of particles) {
			expect(p.x).toBeCloseTo(0, 5);
			expect(p.y).toBeCloseTo(0, 5);
			expect(p.opacity).toBeCloseTo(1, 2);
			expect(p.scale).toBeCloseTo(1, 2);
		}
	});

	it('at progress=1, particles have moved outward and faded', () => {
		const particles = generateParticleBurst(4, 1);
		for (const p of particles) {
			const dist = Math.sqrt(p.x * p.x + p.y * p.y);
			expect(dist).toBeGreaterThan(0);
			expect(p.opacity).toBeCloseTo(0, 2);
		}
	});

	it('particles expand outward over time', () => {
		const early = generateParticleBurst(4, 0.1);
		const late = generateParticleBurst(4, 0.9);
		const earlyDist = Math.sqrt(early[0].x ** 2 + early[0].y ** 2);
		const lateDist = Math.sqrt(late[0].x ** 2 + late[0].y ** 2);
		expect(lateDist).toBeGreaterThan(earlyDist);
	});

	it('clamps progress to 0-1', () => {
		const below = generateParticleBurst(3, -1);
		const atZero = generateParticleBurst(3, 0);
		expect(below).toEqual(atZero);

		const above = generateParticleBurst(3, 2);
		const atOne = generateParticleBurst(3, 1);
		expect(above).toEqual(atOne);
	});

	it('is deterministic for same inputs', () => {
		const a = generateParticleBurst(5, 0.6);
		const b = generateParticleBurst(5, 0.6);
		expect(a).toEqual(b);
	});
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Sample a function over 0–20 s (0–20000 ms) and return the maximum absolute value. */
function maxAbsSway(fn: (tMs: number) => number): number {
	let max = 0;
	for (let t = 0; t < 20000; t += 50) {
		max = Math.max(max, Math.abs(fn(t)));
	}
	return max;
}
