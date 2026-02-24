/**
 * Tests for per-instance visual variation (individualize.ts).
 *
 * Verifies that individualize() produces deterministic, bounded
 * variation from species visual params.
 */

import { describe, it, expect } from 'vitest';
import { individualize } from '../../src/lib/render/individualize.js';
import type { PlantVisualParams } from '../../src/lib/data/types.js';
import { TOMATO, BASIL, ROSEMARY } from '../engine/fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract the visual params from a species fixture. */
function getVisual(species: typeof TOMATO): PlantVisualParams {
	return species.visual;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('individualize', () => {
	it('returns a new object, not a reference to the input', () => {
		const params = getVisual(TOMATO);
		const result = individualize(params, 42);
		expect(result).not.toBe(params);
		expect(result.stem).not.toBe(params.stem);
		expect(result.leaves).not.toBe(params.leaves);
		expect(result.animation).not.toBe(params.animation);
	});

	it('is deterministic — same seed produces same output', () => {
		const params = getVisual(TOMATO);
		const a = individualize(params, 123);
		const b = individualize(params, 123);
		expect(a).toEqual(b);
	});

	it('different seeds produce different outputs', () => {
		const params = getVisual(TOMATO);
		const a = individualize(params, 1);
		const b = individualize(params, 2);

		// At least one field should differ
		const stemDiff = a.stem.curve !== b.stem.curve;
		const heightDiff =
			a.stem.height[0] !== b.stem.height[0] ||
			a.stem.height[1] !== b.stem.height[1];
		const leafDiff =
			a.leaves.count[0] !== b.leaves.count[0] ||
			a.leaves.count[1] !== b.leaves.count[1];
		const swayDiff = a.animation.sway_frequency !== b.animation.sway_frequency;

		expect(stemDiff || heightDiff || leafDiff || swayDiff).toBe(true);
	});

	describe('stem variation bounds', () => {
		it('curve offset is within ±0.1', () => {
			const params = getVisual(TOMATO);
			// Try many seeds to confirm range
			for (let seed = 0; seed < 50; seed++) {
				const result = individualize(params, seed);
				const diff = Math.abs(result.stem.curve - params.stem.curve);
				expect(diff).toBeLessThanOrEqual(0.1 + 1e-10);
			}
		});

		it('height is scaled by ×0.9–1.1', () => {
			const params = getVisual(TOMATO);
			for (let seed = 0; seed < 50; seed++) {
				const result = individualize(params, seed);
				for (let i = 0; i < 2; i++) {
					const ratio = result.stem.height[i] / params.stem.height[i];
					expect(ratio).toBeGreaterThanOrEqual(0.9 - 1e-10);
					expect(ratio).toBeLessThan(1.1 + 1e-10);
				}
			}
		});
	});

	describe('leaf variation bounds', () => {
		it('count is scaled by ×0.85–1.15 and at least 1', () => {
			const params = getVisual(TOMATO);
			for (let seed = 0; seed < 50; seed++) {
				const result = individualize(params, seed);
				for (let i = 0; i < 2; i++) {
					expect(result.leaves.count[i]).toBeGreaterThanOrEqual(1);
					// The scaled value before rounding should be in range
					const ratio = result.leaves.count[i] / params.leaves.count[i];
					// Allow rounding margin
					expect(ratio).toBeGreaterThanOrEqual(0.8);
					expect(ratio).toBeLessThanOrEqual(1.25);
				}
			}
		});

		it('leaf count is always an integer', () => {
			const params = getVisual(TOMATO);
			for (let seed = 0; seed < 20; seed++) {
				const result = individualize(params, seed);
				expect(Number.isInteger(result.leaves.count[0])).toBe(true);
				expect(Number.isInteger(result.leaves.count[1])).toBe(true);
			}
		});
	});

	describe('animation variation bounds', () => {
		it('sway_frequency is scaled by ×0.8–1.2', () => {
			const params = getVisual(TOMATO);
			for (let seed = 0; seed < 50; seed++) {
				const result = individualize(params, seed);
				const ratio =
					result.animation.sway_frequency / params.animation.sway_frequency;
				expect(ratio).toBeGreaterThanOrEqual(0.8 - 1e-10);
				expect(ratio).toBeLessThan(1.2 + 1e-10);
			}
		});
	});

	describe('optional fields', () => {
		it('preserves flowers when present', () => {
			const params = getVisual(TOMATO);
			expect(params.flowers).not.toBeNull();
			const result = individualize(params, 42);
			expect(result.flowers).not.toBeNull();
			// Flowers are shallow-copied, not mutated
			expect(result.flowers).toEqual(params.flowers);
		});

		it('preserves null flowers', () => {
			const params: PlantVisualParams = {
				...getVisual(BASIL),
				flowers: null,
			};
			const result = individualize(params, 42);
			expect(result.flowers).toBeNull();
		});

		it('preserves fruit when present', () => {
			const params = getVisual(TOMATO);
			expect(params.fruit).not.toBeNull();
			const result = individualize(params, 42);
			expect(result.fruit).not.toBeNull();
			expect(result.fruit).toEqual(params.fruit);
		});

		it('preserves null fruit', () => {
			const params = getVisual(BASIL);
			expect(params.fruit).toBeNull();
			const result = individualize(params, 42);
			expect(result.fruit).toBeNull();
		});
	});

	describe('preserves non-varied fields', () => {
		it('stem color and branch properties are unchanged', () => {
			const params = getVisual(TOMATO);
			const result = individualize(params, 42);
			expect(result.stem.color).toBe(params.stem.color);
			expect(result.stem.thickness).toEqual(params.stem.thickness);
			expect(result.stem.branch_frequency).toBe(params.stem.branch_frequency);
			expect(result.stem.branch_angle).toBe(params.stem.branch_angle);
		});

		it('leaf shape, color, and distribution are unchanged', () => {
			const params = getVisual(TOMATO);
			const result = individualize(params, 42);
			expect(result.leaves.shape).toBe(params.leaves.shape);
			expect(result.leaves.color).toBe(params.leaves.color);
			expect(result.leaves.distribution).toBe(params.leaves.distribution);
			expect(result.leaves.size).toEqual(params.leaves.size);
			expect(result.leaves.droop).toEqual(params.leaves.droop);
			expect(result.leaves.opacity).toEqual(params.leaves.opacity);
		});

		it('non-varied animation fields are unchanged', () => {
			const params = getVisual(TOMATO);
			const result = individualize(params, 42);
			expect(result.animation.sway_amplitude).toBe(
				params.animation.sway_amplitude,
			);
			expect(result.animation.growth_spring_tension).toBe(
				params.animation.growth_spring_tension,
			);
			expect(result.animation.idle_breathing).toBe(
				params.animation.idle_breathing,
			);
		});
	});

	it('works with different species fixtures', () => {
		// Test with rosemary (needle leaves, shrub habit)
		const params = getVisual(ROSEMARY);
		const result = individualize(params, 99);

		// Should still produce valid output
		expect(result.stem.height[0]).toBeGreaterThan(0);
		expect(result.stem.height[1]).toBeGreaterThan(0);
		expect(result.leaves.count[0]).toBeGreaterThanOrEqual(1);
		expect(result.leaves.count[1]).toBeGreaterThanOrEqual(1);
		expect(result.animation.sway_frequency).toBeGreaterThan(0);
	});
});
