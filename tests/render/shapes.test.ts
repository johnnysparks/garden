import { describe, it, expect } from 'vitest';
import { generateStemBezier, type StemParams } from '../../src/lib/render/shapes/stems.js';
import {
	generateLeaf,
	LEAF_SHAPES,
	type LeafShape,
} from '../../src/lib/render/shapes/leaves.js';
import {
	generateFlower,
	type FlowerParams,
	type FlowerShape,
} from '../../src/lib/render/shapes/flowers.js';
import {
	generateFruit,
	type FruitParams,
	type FruitShape,
} from '../../src/lib/render/shapes/fruit.js';

// ---- SVG path validation helpers ----

/**
 * Checks that a string looks like a valid SVG path `d` attribute.
 * Verifies it starts with M and only contains valid SVG path commands.
 */
function isValidSvgPath(d: string): boolean {
	if (!d || typeof d !== 'string') return false;
	const trimmed = d.trim();
	if (!trimmed.startsWith('M')) return false;

	// SVG path commands: M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, Z, z
	// After removing those command letters, we should only have numbers,
	// commas, dots, minus signs, spaces and exponent notation.
	const withoutCommands = trimmed.replace(/[MmLlHhVvCcSsQqTtAaZz]/g, ' ');
	const cleaned = withoutCommands.replace(/[\s,]+/g, ' ').trim();
	if (cleaned.length === 0) return true; // e.g. just "M0,0 Z" after removing letters
	// Every remaining token should be a valid number
	const tokens = cleaned.split(' ');
	return tokens.every((tok) => tok === '' || !isNaN(Number(tok)));
}

/**
 * Checks that a string contains valid SVG elements (circle, ellipse, path, g).
 */
function isValidSvgElements(s: string): boolean {
	if (!s || typeof s !== 'string') return false;
	const trimmed = s.trim();
	return (
		trimmed.startsWith('<circle') ||
		trimmed.startsWith('<ellipse') ||
		trimmed.startsWith('<path') ||
		trimmed.startsWith('<g>')
	);
}

// ---- Stems ----

describe('generateStemBezier', () => {
	const defaultParams: StemParams = {
		height: 50,
		thickness: 2,
		curve: 0.35,
		branch_frequency: 0.4,
		branch_angle: 45,
	};

	it('returns a valid main stem SVG path', () => {
		const result = generateStemBezier(defaultParams);
		expect(isValidSvgPath(result.main)).toBe(true);
	});

	it('main path starts at origin and ends at negative Y', () => {
		const result = generateStemBezier(defaultParams);
		expect(result.main).toMatch(/^M0,0/);
		expect(result.main).toContain('-50');
	});

	it('generates branch paths when branch_frequency > 0', () => {
		const result = generateStemBezier(defaultParams);
		expect(result.branches.length).toBeGreaterThan(0);
		result.branches.forEach((b) => {
			expect(isValidSvgPath(b)).toBe(true);
		});
	});

	it('generates no branches when branch_frequency is 0', () => {
		const result = generateStemBezier({ ...defaultParams, branch_frequency: 0 });
		expect(result.branches).toHaveLength(0);
	});

	it('produces a straight stem when curve is 0', () => {
		const result = generateStemBezier({ ...defaultParams, curve: 0 });
		// With curve=0, control points have 0 lateral offset
		// Path should be M0,0 C0,... 0,... 0,-50
		expect(result.main).toMatch(/^M0,0 C0,/);
	});

	it('output changes with different height', () => {
		const short = generateStemBezier({ ...defaultParams, height: 20 });
		const tall = generateStemBezier({ ...defaultParams, height: 80 });
		expect(short.main).not.toBe(tall.main);
	});

	it('output changes with different curve', () => {
		const straight = generateStemBezier({ ...defaultParams, curve: 0 });
		const curved = generateStemBezier({ ...defaultParams, curve: 1 });
		expect(straight.main).not.toBe(curved.main);
	});

	it('more branches with higher frequency', () => {
		const low = generateStemBezier({ ...defaultParams, branch_frequency: 0.1 });
		const high = generateStemBezier({ ...defaultParams, branch_frequency: 1.0 });
		expect(high.branches.length).toBeGreaterThanOrEqual(low.branches.length);
	});

	it('handles zero height gracefully', () => {
		const result = generateStemBezier({ ...defaultParams, height: 0 });
		expect(isValidSvgPath(result.main)).toBe(true);
	});
});

// ---- Leaves ----

describe('leaf shapes', () => {
	const ALL_SHAPES: LeafShape[] = [
		'simple_oval',
		'simple_pointed',
		'lobed',
		'pinnate_compound',
		'palmate',
		'linear',
		'heart',
		'needle',
	];

	it('LEAF_SHAPES contains all 8 shapes', () => {
		expect(Object.keys(LEAF_SHAPES)).toHaveLength(8);
		ALL_SHAPES.forEach((shape) => {
			expect(LEAF_SHAPES).toHaveProperty(shape);
		});
	});

	describe.each(ALL_SHAPES)('%s', (shape) => {
		it('returns a valid SVG path', () => {
			const path = generateLeaf(shape, 10);
			expect(isValidSvgPath(path)).toBe(true);
		});

		it('output changes with different sizes', () => {
			const small = generateLeaf(shape, 5);
			const large = generateLeaf(shape, 20);
			expect(small).not.toBe(large);
		});

		it('returns non-empty string', () => {
			const path = generateLeaf(shape, 10);
			expect(path.length).toBeGreaterThan(0);
		});

		it('path contains at least one M command', () => {
			const path = generateLeaf(shape, 10);
			expect(path).toMatch(/M/);
		});
	});

	it('different shapes produce different paths for same size', () => {
		const paths = ALL_SHAPES.map((s) => generateLeaf(s, 10));
		const unique = new Set(paths);
		expect(unique.size).toBe(ALL_SHAPES.length);
	});

	it('linear produces a triangle', () => {
		const path = generateLeaf('linear', 10);
		expect(path).toContain('Z');
	});

	it('needle produces a closed path', () => {
		const path = generateLeaf('needle', 10);
		expect(path).toContain('Z');
	});

	it('pinnate_compound contains multiple M commands (compound leaf)', () => {
		const path = generateLeaf('pinnate_compound', 10);
		const mCount = (path.match(/M/g) || []).length;
		expect(mCount).toBeGreaterThan(1);
	});

	it('palmate contains multiple M commands (multiple lobes)', () => {
		const path = generateLeaf('palmate', 10);
		const mCount = (path.match(/M/g) || []).length;
		expect(mCount).toBeGreaterThan(1);
	});
});

// ---- Flowers ----

describe('flower shapes', () => {
	const ALL_FLOWER_SHAPES: FlowerShape[] = ['simple', 'composite', 'spike', 'umbel'];

	const defaultParams: FlowerParams = {
		shape: 'simple',
		petal_count: 5,
		size: 4,
		bloom_density: 0.5,
	};

	describe.each(ALL_FLOWER_SHAPES)('%s', (shape) => {
		const params: FlowerParams = { ...defaultParams, shape };

		it('returns a valid SVG path', () => {
			const path = generateFlower(params);
			expect(isValidSvgPath(path)).toBe(true);
		});

		it('returns non-empty string', () => {
			const path = generateFlower(params);
			expect(path.length).toBeGreaterThan(0);
		});

		it('output changes with different size', () => {
			const small = generateFlower({ ...params, size: 2 });
			const large = generateFlower({ ...params, size: 10 });
			expect(small).not.toBe(large);
		});
	});

	it('different shapes produce different paths', () => {
		const paths = ALL_FLOWER_SHAPES.map((shape) =>
			generateFlower({ ...defaultParams, shape }),
		);
		const unique = new Set(paths);
		expect(unique.size).toBe(ALL_FLOWER_SHAPES.length);
	});

	it('simple flower has expected petal count (M commands for petals + center)', () => {
		const path = generateFlower({ ...defaultParams, shape: 'simple', petal_count: 5 });
		const mCount = (path.match(/M/g) || []).length;
		// 5 petals + 1 center disc = 6
		expect(mCount).toBe(6);
	});

	it('bloom_density affects composite output', () => {
		const sparse = generateFlower({ ...defaultParams, shape: 'composite', bloom_density: 0.1 });
		const dense = generateFlower({ ...defaultParams, shape: 'composite', bloom_density: 1.0 });
		expect(sparse).not.toBe(dense);
	});

	it('bloom_density affects spike floret count', () => {
		const sparse = generateFlower({ ...defaultParams, shape: 'spike', bloom_density: 0.0 });
		const dense = generateFlower({ ...defaultParams, shape: 'spike', bloom_density: 1.0 });
		// More M commands means more florets
		const sparseMs = (sparse.match(/M/g) || []).length;
		const denseMs = (dense.match(/M/g) || []).length;
		expect(denseMs).toBeGreaterThan(sparseMs);
	});

	it('bloom_density affects umbel ray count', () => {
		const sparse = generateFlower({ ...defaultParams, shape: 'umbel', bloom_density: 0.0 });
		const dense = generateFlower({ ...defaultParams, shape: 'umbel', bloom_density: 1.0 });
		const sparseMs = (sparse.match(/M/g) || []).length;
		const denseMs = (dense.match(/M/g) || []).length;
		expect(denseMs).toBeGreaterThan(sparseMs);
	});
});

// ---- Fruit ----

describe('fruit shapes', () => {
	const ALL_FRUIT_SHAPES: FruitShape[] = [
		'sphere',
		'oblate',
		'elongated',
		'pod',
		'berry_cluster',
	];

	const defaultParams: FruitParams = {
		shape: 'sphere',
		size: 4,
		hang_angle: 30,
		cluster_count: 5,
	};

	describe.each(ALL_FRUIT_SHAPES)('%s', (shape) => {
		const params: FruitParams = { ...defaultParams, shape };

		it('returns valid SVG elements', () => {
			const result = generateFruit(params);
			expect(isValidSvgElements(result.elements)).toBe(true);
		});

		it('returns non-empty elements', () => {
			const result = generateFruit(params);
			expect(result.elements.length).toBeGreaterThan(0);
		});

		it('output changes with different size', () => {
			const small = generateFruit({ ...params, size: 2 });
			const large = generateFruit({ ...params, size: 10 });
			expect(small.elements).not.toBe(large.elements);
		});
	});

	it('different shapes produce different elements', () => {
		const results = ALL_FRUIT_SHAPES.map((shape) =>
			generateFruit({ ...defaultParams, shape }).elements,
		);
		const unique = new Set(results);
		expect(unique.size).toBe(ALL_FRUIT_SHAPES.length);
	});

	it('sphere returns a circle element', () => {
		const result = generateFruit({ ...defaultParams, shape: 'sphere' });
		expect(result.elements).toContain('<circle');
	});

	it('oblate returns an ellipse element', () => {
		const result = generateFruit({ ...defaultParams, shape: 'oblate' });
		expect(result.elements).toContain('<ellipse');
	});

	it('elongated returns a path element', () => {
		const result = generateFruit({ ...defaultParams, shape: 'elongated' });
		expect(result.elements).toContain('<path');
	});

	it('pod returns a path element', () => {
		const result = generateFruit({ ...defaultParams, shape: 'pod' });
		expect(result.elements).toContain('<path');
	});

	it('berry_cluster returns a group of circles', () => {
		const result = generateFruit({ ...defaultParams, shape: 'berry_cluster', cluster_count: 5 });
		expect(result.elements).toContain('<g>');
		const circleCount = (result.elements.match(/<circle/g) || []).length;
		expect(circleCount).toBe(5);
	});

	it('berry_cluster count varies with cluster_count param', () => {
		const small = generateFruit({ ...defaultParams, shape: 'berry_cluster', cluster_count: 3 });
		const large = generateFruit({ ...defaultParams, shape: 'berry_cluster', cluster_count: 8 });
		const smallCount = (small.elements.match(/<circle/g) || []).length;
		const largeCount = (large.elements.match(/<circle/g) || []).length;
		expect(smallCount).toBe(3);
		expect(largeCount).toBe(8);
	});

	it('sphere radius scales with size', () => {
		const small = generateFruit({ ...defaultParams, shape: 'sphere', size: 2 });
		const large = generateFruit({ ...defaultParams, shape: 'sphere', size: 10 });
		// Extract r values
		const rSmall = small.elements.match(/r="([^"]+)"/)?.[1];
		const rLarge = large.elements.match(/r="([^"]+)"/)?.[1];
		expect(Number(rLarge)).toBeGreaterThan(Number(rSmall));
	});
});
