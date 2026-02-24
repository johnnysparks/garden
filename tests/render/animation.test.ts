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
		expect(wind.gust_timer).toBe(0);
	});
});

describe('updateWind', () => {
	it('returns a WindState with expected shape', () => {
		const state = createWindState();
		const next = updateWind(state, 0.016, 0);
		expect(next).toHaveProperty('angle');
		expect(next).toHaveProperty('strength');
		expect(next).toHaveProperty('gust_timer');
	});

	it('angle stays within ±π/4', () => {
		const state = createWindState();
		for (let t = 0; t < 100; t += 0.5) {
			const next = updateWind(state, 0.5, t);
			expect(next.angle).toBeGreaterThanOrEqual(-Math.PI * 0.25 - 0.001);
			expect(next.angle).toBeLessThanOrEqual(Math.PI * 0.25 + 0.001);
		}
	});

	it('strength stays within 0.3–0.7 range', () => {
		const state = createWindState();
		for (let t = 0; t < 100; t += 0.5) {
			const next = updateWind(state, 0.5, t);
			expect(next.strength).toBeGreaterThanOrEqual(0.29);
			expect(next.strength).toBeLessThanOrEqual(0.71);
		}
	});

	it('wind gusts are periodic — gust_timer is positive at expected intervals', () => {
		const state = createWindState();
		// Sample times within the first gust window (0 to 1.5s of each 8s cycle)
		const gustTimes: number[] = [];
		const noGustTimes: number[] = [];

		for (let t = 0; t < 40; t += 0.1) {
			const next = updateWind(state, 0.1, t);
			if (next.gust_timer > 0) {
				gustTimes.push(t);
			} else {
				noGustTimes.push(t);
			}
		}

		// Should have gusts at regular intervals
		expect(gustTimes.length).toBeGreaterThan(0);
		expect(noGustTimes.length).toBeGreaterThan(0);

		// Verify periodicity: gusts should occur near t=0, t=8, t=16, t=24, t=32
		for (const cycle of [0, 8, 16, 24, 32]) {
			const gustInCycle = gustTimes.some((t) => t >= cycle && t < cycle + 1.5);
			expect(gustInCycle).toBe(true);
		}
	});

	it('gust_timer is zero outside gust window', () => {
		const state = createWindState();
		// At t=4 (mid-cycle, well past gust window), gust_timer should be 0
		const next = updateWind(state, 0.016, 4);
		expect(next.gust_timer).toBe(0);
	});

	it('is deterministic for same totalTime', () => {
		const state = createWindState();
		const a = updateWind(state, 0.016, 5.5);
		const b = updateWind(state, 0.016, 5.5);
		expect(a).toEqual(b);
	});
});

// ── Sway ─────────────────────────────────────────────────────────────────────

describe('calculateSway', () => {
	const calmWind: WindState = { angle: 0, strength: 0, gust_timer: 0 };
	const normalWind: WindState = { angle: 0.3, strength: 0.5, gust_timer: 0 };
	const gustWind: WindState = { angle: 0.3, strength: 0.5, gust_timer: 1 };

	it('returns a number', () => {
		const result = calculateSway(100, 5, 1.2, calmWind, 0);
		expect(typeof result).toBe('number');
	});

	it('sway output is bounded for reasonable inputs', () => {
		// Test many time values; sway should never exceed a reasonable bound
		const mass = 50;
		const amp = 8;
		const freq = 1.5;

		for (let t = 0; t < 60; t += 0.1) {
			const s = calculateSway(mass, amp, freq, normalWind, t);
			// Theoretical max: response * (1 + wind*2) + gust(0.1)
			// response = 8/sqrt(50) ≈ 1.13
			// max ≈ 1.13 + 0.5*sin(0.3)*1.13*2 + 0 ≈ 1.13 + 0.33 ≈ 1.46
			// Use generous bound of 5 for safety
			expect(Math.abs(s)).toBeLessThan(5);
		}
	});

	it('heavier plants sway less than lighter plants', () => {
		const lightMax = maxAbs((t) => calculateSway(10, 5, 1, calmWind, t));
		const heavyMax = maxAbs((t) => calculateSway(500, 5, 1, calmWind, t));
		expect(heavyMax).toBeLessThan(lightMax);
	});

	it('zero amplitude means zero sway in calm wind', () => {
		for (let t = 0; t < 10; t += 0.25) {
			expect(calculateSway(100, 0, 1, calmWind, t)).toBe(0);
		}
	});

	it('gust adds extra sway component', () => {
		const t = 1; // non-zero time
		const noGust = calculateSway(50, 5, 1, normalWind, t);
		const withGust = calculateSway(50, 5, 1, gustWind, t);
		expect(noGust).not.toBe(withGust);
	});

	it('is deterministic for same inputs', () => {
		const a = calculateSway(80, 6, 1.3, normalWind, 3.7);
		const b = calculateSway(80, 6, 1.3, normalWind, 3.7);
		expect(a).toBe(b);
	});

	it('handles very small mass (≥1 clamped)', () => {
		// Should not throw or return Infinity
		const result = calculateSway(0, 5, 1, calmWind, 1);
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
		for (let t = 0; t < 20; t += 0.1) {
			const v = breathe(t, 0.02);
			min = Math.min(min, v);
			max = Math.max(max, v);
		}
		expect(min).toBeGreaterThanOrEqual(0.98 - 0.001);
		expect(max).toBeLessThanOrEqual(1.02 + 0.001);
	});

	it('zero amplitude returns exactly 1.0', () => {
		for (let t = 0; t < 10; t += 0.5) {
			expect(breathe(t, 0)).toBe(1);
		}
	});

	it('is deterministic', () => {
		expect(breathe(4.2, 0.01)).toBe(breathe(4.2, 0.01));
	});
});

// ── Stress Tremor ────────────────────────────────────────────────────────────

describe('stressTremor', () => {
	it('returns zero offset below stress 0.3', () => {
		for (const stress of [0, 0.1, 0.2, 0.29]) {
			const result = stressTremor(5, stress);
			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
		}
	});

	it('returns non-zero offset at stress > 0.3', () => {
		// At some time values the sine waves will be non-zero
		let anyNonZero = false;
		for (let t = 0; t < 10; t += 0.1) {
			const result = stressTremor(t, 0.6);
			if (result.x !== 0) anyNonZero = true;
		}
		expect(anyNonZero).toBe(true);
	});

	it('exactly at stress 0.3, intensity is zero so offset is zero', () => {
		// intensity = (0.3 - 0.3) * 0.03 = 0
		const result = stressTremor(5, 0.3);
		expect(result.x).toBe(0);
		expect(result.y).toBe(0);
	});

	it('higher stress produces larger tremor amplitude', () => {
		const lowMax = maxAbs((t) => stressTremor(t, 0.4).x);
		const highMax = maxAbs((t) => stressTremor(t, 0.9).x);
		expect(highMax).toBeGreaterThan(lowMax);
	});

	it('y offset is 0.7× the x offset', () => {
		const result = stressTremor(2.5, 0.7);
		expect(result.y).toBeCloseTo(result.x * 0.7, 10);
	});

	it('uses two layered frequencies for organic feel', () => {
		// At two carefully chosen times, the two-sine composition
		// should differ from a single-sine at freq 12.
		const singleSine = (t: number) => Math.sin(t * 12) * 0.012;
		let differ = false;
		for (let t = 0; t < 10; t += 0.1) {
			const tremor = stressTremor(t, 0.7).x;
			if (Math.abs(tremor - singleSine(t)) > 0.0001) {
				differ = true;
				break;
			}
		}
		expect(differ).toBe(true);
	});

	it('is deterministic for same inputs', () => {
		const a = stressTremor(7.3, 0.55);
		const b = stressTremor(7.3, 0.55);
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

/** Sample a function over 0–20s and return the maximum absolute value. */
function maxAbs(fn: (t: number) => number): number {
	let max = 0;
	for (let t = 0; t < 20; t += 0.05) {
		max = Math.max(max, Math.abs(fn(t)));
	}
	return max;
}
