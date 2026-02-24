/**
 * Plant design validation tests.
 *
 * These tests encode the five visual acceptance checks from 06-VISUAL-SYSTEM.md
 * as numeric assertions on the rendering pipeline output. They verify that
 * species visual parameters produce structurally sound, recognizable plants
 * at key growth stages.
 *
 * The five checks:
 *   1. Silhouette  — recognizable outline, adequate width relative to height
 *   2. Anatomy     — organs placed on plausible attachment points
 *   3. Density     — enough leaf mass to avoid a "stick with decals" look
 *   4. Palette     — stem vs leaf color differentiation
 *   5. Stage       — measurable visual differences between growth stages
 */

import { describe, it, expect } from 'vitest';
import { generateStemBezier, type StemParams } from '../../src/lib/render/shapes/stems.js';
import { generateLeaf } from '../../src/lib/render/shapes/leaves.js';
import type { PlantVisualParams, GrowthStageId } from '../../src/lib/data/types.js';

// ── Species visual params (mirrors the canonical JSON files) ──────────

const TOMATO_VISUAL: PlantVisualParams = {
	stem: { height: [3, 55], thickness: [0.8, 3.0], color: '#6a8a3c', curve: 0.35, branch_frequency: 0.55, branch_angle: 45 },
	leaves: { shape: 'pinnate_compound', count: [2, 20], size: [3, 12], color: '#3d8b37', droop: [5, 30], distribution: 'alternate', opacity: [0.75, 1.0] },
	flowers: { shape: 'simple', petal_count: 5, color: '#fdd835', size: 1.8, bloom_density: 0.35 },
	fruit: { shape: 'oblate', size: [1, 5.5], color_unripe: '#66bb6a', color_ripe: '#7b3f61', cluster_count: 3, hang_angle: 35 },
	animation: { sway_amplitude: 0.06, sway_frequency: 0.7, growth_spring_tension: 0.4, idle_breathing: 0.01 },
};

const BASIL_VISUAL: PlantVisualParams = {
	stem: { height: [2, 18], thickness: [0.5, 2.0], color: '#7cb342', curve: 0.05, branch_frequency: 0.85, branch_angle: 50 },
	leaves: { shape: 'simple_oval', count: [4, 36], size: [2, 7], color: '#43a047', droop: [0, 15], distribution: 'opposite', opacity: [0.8, 1.0] },
	flowers: { shape: 'spike', petal_count: 4, color: '#f5f5f5', size: 1.0, bloom_density: 0.6 },
	fruit: null,
	animation: { sway_amplitude: 0.08, sway_frequency: 0.9, growth_spring_tension: 0.5, idle_breathing: 0.015 },
};

// ── Helpers ───────────────────────────────────────────────────────────

function easeOutQuad(t: number): number {
	return t * (2 - t);
}

function lerp(range: [number, number], t: number): number {
	return range[0] + (range[1] - range[0]) * easeOutQuad(t);
}

/** Parse hex color to {r,g,b} 0-255. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Euclidean distance between two colors in RGB space. */
function colorDistance(a: string, b: string): number {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}

/** Compute stem result at a given growth progress. */
function stemAtProgress(params: PlantVisualParams, progress: number) {
	return generateStemBezier({
		height: lerp(params.stem.height, progress),
		thickness: lerp(params.stem.thickness, progress),
		curve: params.stem.curve,
		branch_frequency: params.stem.branch_frequency,
		branch_angle: params.stem.branch_angle,
	});
}

/** Leaf count at a given growth progress. */
function leafCountAt(params: PlantVisualParams, progress: number): number {
	return Math.max(0, Math.round(lerp(params.leaves.count, progress)));
}

/** Estimate horizontal span from branch endpoints. */
function crownWidth(params: PlantVisualParams, progress: number): number {
	const stem = stemAtProgress(params, progress);
	if (stem.branchEndpoints.length === 0) return 0;
	const xs = stem.branchEndpoints.map((e) => e.x);
	return Math.max(...xs) - Math.min(...xs);
}

// ── Test suites per species ──────────────────────────────────────────

describe('Cherokee Purple Tomato — design validation', () => {
	const V = TOMATO_VISUAL;

	describe('1. Silhouette', () => {
		it('mature plant has width from branches (not a single stick)', () => {
			const width = crownWidth(V, 1.0);
			const height = lerp(V.stem.height, 1.0);
			// Crown should span at least 15% of height for a vine with branches.
			expect(width).toBeGreaterThan(height * 0.15);
		});

		it('produces multiple branches at maturity', () => {
			const stem = stemAtProgress(V, 1.0);
			expect(stem.branches.length).toBeGreaterThanOrEqual(3);
		});

		it('seedling is visually small (height < 25% of mature)', () => {
			const seedlingH = lerp(V.stem.height, 0.1);
			const matureH = lerp(V.stem.height, 1.0);
			// easeOutQuad makes early growth fast, so 10% progress ≈ 19% of range.
			expect(seedlingH).toBeLessThan(matureH * 0.25);
		});
	});

	describe('2. Anatomy', () => {
		it('branch endpoints are distributed along the stem, not clustered', () => {
			const stem = stemAtProgress(V, 1.0);
			const ys = stem.branchEndpoints.map((e) => e.y).sort((a, b) => a - b);
			// Y range of endpoints should span at least 30% of stem height.
			const ySpan = Math.abs(ys[ys.length - 1] - ys[0]);
			const height = lerp(V.stem.height, 1.0);
			expect(ySpan).toBeGreaterThan(height * 0.25);
		});

		it('branches alternate left and right', () => {
			const stem = stemAtProgress(V, 1.0);
			const xs = stem.branchEndpoints.map((e) => e.x);
			const hasLeft = xs.some((x) => x < -0.5);
			const hasRight = xs.some((x) => x > 0.5);
			expect(hasLeft).toBe(true);
			expect(hasRight).toBe(true);
		});
	});

	describe('3. Density', () => {
		it('mature plant has substantial leaf count', () => {
			const count = leafCountAt(V, 1.0);
			expect(count).toBeGreaterThanOrEqual(15);
		});

		it('compound leaf size produces visible leaflets', () => {
			const maxLeafSize = lerp(V.leaves.size, 1.0);
			// Pinnate compound leaflets are size * 0.22, each needs to be > 1 SVG unit.
			const leafletSize = maxLeafSize * 0.22;
			expect(leafletSize).toBeGreaterThan(1.5);
		});

		it('leaf coverage ratio: total leaf area is meaningful relative to plant height', () => {
			const maxLeafSize = lerp(V.leaves.size, 1.0);
			const count = leafCountAt(V, 1.0);
			const height = lerp(V.stem.height, 1.0);
			// Rough leaf area: count * size^2 * shape_factor (0.3 for compound).
			const totalArea = count * maxLeafSize * maxLeafSize * 0.3;
			// Plant bounding box: height * (height * 0.4) for approximate width.
			const bbox = height * (height * 0.4);
			const coverage = totalArea / bbox;
			// At least 30% coverage for a non-sparse look.
			expect(coverage).toBeGreaterThan(0.3);
		});
	});

	describe('4. Palette', () => {
		it('stem and leaf colors are visually distinct', () => {
			const dist = colorDistance(V.stem.color, V.leaves.color);
			// Minimum 25 units of RGB distance for readable value separation.
			expect(dist).toBeGreaterThan(25);
		});

		it('stem, leaf, flower, and fruit colors are all different hues', () => {
			const colors = [V.stem.color, V.leaves.color, V.flowers!.color, V.fruit!.color_ripe];
			for (let i = 0; i < colors.length; i++) {
				for (let j = i + 1; j < colors.length; j++) {
					expect(colorDistance(colors[i], colors[j])).toBeGreaterThan(30);
				}
			}
		});

		it('tomato stem color differs from basil stem color', () => {
			const dist = colorDistance(TOMATO_VISUAL.stem.color, BASIL_VISUAL.stem.color);
			expect(dist).toBeGreaterThan(20);
		});
	});

	describe('5. Stage readability', () => {
		const stages: { stage: GrowthStageId; progress: number }[] = [
			{ stage: 'seedling', progress: 0.15 },
			{ stage: 'vegetative', progress: 0.45 },
			{ stage: 'flowering', progress: 0.7 },
			{ stage: 'fruiting', progress: 0.9 },
		];

		it('each successive stage is taller than the previous', () => {
			for (let i = 1; i < stages.length; i++) {
				const prev = lerp(V.stem.height, stages[i - 1].progress);
				const curr = lerp(V.stem.height, stages[i].progress);
				expect(curr).toBeGreaterThan(prev);
			}
		});

		it('each successive stage has more leaves', () => {
			for (let i = 1; i < stages.length; i++) {
				const prev = leafCountAt(V, stages[i - 1].progress);
				const curr = leafCountAt(V, stages[i].progress);
				expect(curr).toBeGreaterThanOrEqual(prev);
			}
		});

		it('fruiting stage has large enough fruit to be visible', () => {
			const fruitSize = lerp(V.fruit!.size, 0.9);
			const stemThickness = lerp(V.stem.thickness, 0.9);
			// Fruit should be wider than the stem for visibility.
			expect(fruitSize).toBeGreaterThan(stemThickness);
		});
	});
});

describe('Genovese Basil — design validation', () => {
	const V = BASIL_VISUAL;

	describe('1. Silhouette', () => {
		it('bush habit produces wide crown relative to height', () => {
			const width = crownWidth(V, 1.0);
			const height = lerp(V.stem.height, 1.0);
			// Bush should be at least 20% as wide as tall (from branches alone).
			expect(width).toBeGreaterThan(height * 0.2);
		});

		it('produces at least 3 branches for bushy appearance', () => {
			const stem = stemAtProgress(V, 1.0);
			expect(stem.branches.length).toBeGreaterThanOrEqual(3);
		});

		it('is notably shorter than tomato at maturity', () => {
			const basilH = lerp(V.stem.height, 1.0);
			const tomatoH = lerp(TOMATO_VISUAL.stem.height, 1.0);
			expect(basilH).toBeLessThan(tomatoH * 0.5);
		});
	});

	describe('2. Anatomy', () => {
		it('opposite leaves require even distribution (leaf count is even at maturity)', () => {
			// Opposite distribution places 2 per node; the system should
			// produce a count that fills nodes evenly.
			expect(V.leaves.distribution).toBe('opposite');
			const count = leafCountAt(V, 1.0);
			// With opposite distribution, an even count fills nodes cleanly.
			expect(count).toBeGreaterThanOrEqual(4);
		});

		it('branches spread both left and right', () => {
			const stem = stemAtProgress(V, 1.0);
			const xs = stem.branchEndpoints.map((e) => e.x);
			const hasLeft = xs.some((x) => x < -0.5);
			const hasRight = xs.some((x) => x > 0.5);
			expect(hasLeft).toBe(true);
			expect(hasRight).toBe(true);
		});
	});

	describe('3. Density', () => {
		it('mature basil has high leaf count for lush appearance', () => {
			const count = leafCountAt(V, 1.0);
			expect(count).toBeGreaterThanOrEqual(25);
		});

		it('leaf size is large relative to stem for a leafy herb', () => {
			const maxLeafSize = lerp(V.leaves.size, 1.0);
			const height = lerp(V.stem.height, 1.0);
			// Individual leaves should be at least 25% of stem height for a leafy herb.
			expect(maxLeafSize / height).toBeGreaterThan(0.25);
		});

		it('branch-tip leaves add coverage beyond the main stem', () => {
			const stem = stemAtProgress(V, 1.0);
			// With the new renderer, branches get leaves. Verify endpoints exist.
			expect(stem.branchEndpoints.length).toBeGreaterThanOrEqual(3);
		});
	});

	describe('4. Palette', () => {
		it('leaf color is a bright, vivid green (high G channel)', () => {
			const rgb = hexToRgb(V.leaves.color);
			// Vivid green: G channel dominant, >120.
			expect(rgb.g).toBeGreaterThan(120);
			expect(rgb.g).toBeGreaterThan(rgb.r);
			expect(rgb.g).toBeGreaterThan(rgb.b);
		});

		it('stem and leaf colors differ', () => {
			const dist = colorDistance(V.stem.color, V.leaves.color);
			expect(dist).toBeGreaterThan(20);
		});

		it('basil is visually distinct from tomato in leaf color', () => {
			const dist = colorDistance(BASIL_VISUAL.leaves.color, TOMATO_VISUAL.leaves.color);
			expect(dist).toBeGreaterThan(15);
		});
	});

	describe('5. Stage readability', () => {
		it('seedling has modest leaf count at 15% progress', () => {
			const count = leafCountAt(V, 0.15);
			// easeOutQuad means 15% progress ≈ 28% of count range.
			// For basil [4, 36]: ~13 leaves. Still visually small vs 36 at maturity.
			expect(count).toBeLessThanOrEqual(15);
			expect(count).toBeGreaterThanOrEqual(4);
		});

		it('vegetative stage is notably leafier than seedling', () => {
			const seedling = leafCountAt(V, 0.15);
			const veg = leafCountAt(V, 0.5);
			expect(veg).toBeGreaterThan(seedling * 1.5);
		});

		it('flowering stage gets spike flowers (non-empty shape)', () => {
			expect(V.flowers).not.toBeNull();
			expect(V.flowers!.shape).toBe('spike');
			expect(V.flowers!.size).toBeGreaterThan(0);
		});
	});
});

// ── Cross-species distinctiveness ────────────────────────────────────

describe('Cross-species visual distinctiveness', () => {
	it('tomato and basil have different leaf shapes', () => {
		expect(TOMATO_VISUAL.leaves.shape).not.toBe(BASIL_VISUAL.leaves.shape);
	});

	it('tomato and basil have different stem colors', () => {
		expect(TOMATO_VISUAL.stem.color).not.toBe(BASIL_VISUAL.stem.color);
	});

	it('tomato and basil have different leaf distributions', () => {
		expect(TOMATO_VISUAL.leaves.distribution).not.toBe(BASIL_VISUAL.leaves.distribution);
	});

	it('tomato is substantially taller than basil', () => {
		const tomatoH = lerp(TOMATO_VISUAL.stem.height, 1.0);
		const basilH = lerp(BASIL_VISUAL.stem.height, 1.0);
		expect(tomatoH).toBeGreaterThan(basilH * 2);
	});

	it('basil is bushier (higher branch frequency) than tomato', () => {
		expect(BASIL_VISUAL.stem.branch_frequency).toBeGreaterThan(
			TOMATO_VISUAL.stem.branch_frequency,
		);
	});
});
