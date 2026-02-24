<script lang="ts">
	import type { PlantVisualParams, GrowthStageId } from '$lib/data/types.js';
	import { generateStemBezier } from './shapes/stems.js';
	import { generateLeaf } from './shapes/leaves.js';
	import { generateFlower, type FlowerShape as RenderFlowerShape } from './shapes/flowers.js';
	import { generateFruit } from './shapes/fruit.js';
	import { individualize } from './individualize.js';
	import { desaturate, lerpColor } from './palette.js';

	interface Props {
		params: PlantVisualParams;
		growthProgress: number; // 0-1
		stress: number; // 0-1
		instanceSeed: number;
		stage: GrowthStageId;
	}

	let { params, growthProgress, stress, instanceSeed, stage }: Props = $props();

	// ── Helpers ───────────────────────────────────────────────────────

	function easeOutQuad(t: number): number {
		return t * (2 - t);
	}

	function lerp(range: [number, number], t: number): number {
		return range[0] + (range[1] - range[0]) * easeOutQuad(t);
	}

	/** Evaluate cubic bezier at parameter t. */
	function bezierPoint(
		x0: number, y0: number,
		cx1: number, cy1: number,
		cx2: number, cy2: number,
		x3: number, y3: number,
		t: number,
	): { x: number; y: number } {
		const mt = 1 - t;
		const mt2 = mt * mt;
		const mt3 = mt2 * mt;
		const t2 = t * t;
		const t3 = t2 * t;
		return {
			x: mt3 * x0 + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * x3,
			y: mt3 * y0 + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * y3,
		};
	}

	/** Tangent vector of cubic bezier at parameter t. */
	function bezierTangent(
		x0: number, y0: number,
		cx1: number, cy1: number,
		cx2: number, cy2: number,
		x3: number, y3: number,
		t: number,
	): { x: number; y: number } {
		const mt = 1 - t;
		return {
			x: 3 * mt * mt * (cx1 - x0) + 6 * mt * t * (cx2 - cx1) + 3 * t * t * (x3 - cx2),
			y: 3 * mt * mt * (cy1 - y0) + 6 * mt * t * (cy2 - cy1) + 3 * t * t * (y3 - cy2),
		};
	}

	function r(n: number): string {
		return (Math.round(n * 100) / 100).toString();
	}

	// ── Pipeline ─────────────────────────────────────────────────────

	// Step 1: Per-instance variation
	let indiv = $derived(individualize(params, instanceSeed));

	// Step 2: Growth interpolation — [min, max] ranges → scalar values
	let interp = $derived.by(() => {
		const t = growthProgress;
		return {
			stemHeight: lerp(indiv.stem.height, t),
			stemThickness: lerp(indiv.stem.thickness, t),
			stemColor: indiv.stem.color,
			stemCurve: indiv.stem.curve,
			stemBranchFreq: indiv.stem.branch_frequency,
			stemBranchAngle: indiv.stem.branch_angle,
			leafCount: Math.max(0, Math.round(lerp(indiv.leaves.count, t))),
			leafSize: lerp(indiv.leaves.size, t),
			leafColor: indiv.leaves.color,
			leafDroop: lerp(indiv.leaves.droop, t),
			leafOpacity: lerp(indiv.leaves.opacity, t),
			fruitSize: indiv.fruit ? lerp(indiv.fruit.size, t) : 0,
		};
	});

	// Step 3: Stress modifiers
	let final = $derived.by(() => {
		// Leaf droop increases with stress (up to +30 degrees)
		const leafDroop = interp.leafDroop + stress * 30;

		// Color desaturates with stress
		let leafColor = desaturate(interp.leafColor, stress * 0.5);

		// Hue shifts toward yellow/brown at higher stress
		if (stress > 0.3) {
			leafColor = lerpColor(leafColor, '#c9a94e', (stress - 0.3) * 0.6);
		}

		// Stem curve increases (wilting)
		const stemCurve = interp.stemCurve + stress * 0.3;

		// Stem desaturates slightly under stress
		let stemColor = interp.stemColor;
		if (stress > 0.2) {
			stemColor = desaturate(stemColor, stress * 0.3);
		}

		return { ...interp, leafDroop, leafColor, stemCurve, stemColor };
	});

	// ── SVG generation ───────────────────────────────────────────────

	// Stem path + branches
	let stemResult = $derived(
		generateStemBezier({
			height: final.stemHeight,
			thickness: final.stemThickness,
			curve: final.stemCurve,
			branch_frequency: final.stemBranchFreq,
			branch_angle: final.stemBranchAngle,
		}),
	);

	// Bezier control points (mirrors stems.ts logic, for sampling positions)
	let cp = $derived.by(() => {
		const h = final.stemHeight;
		const c = final.stemCurve;
		const lat = h * 0.3;
		return {
			x0: 0, y0: 0,
			cx1: lat * c, cy1: -h * 0.33,
			cx2: -lat * c * 0.5, cy2: -h * 0.66,
			x3: 0, y3: -h,
		};
	});

	/** Sample a point on the main stem bezier at parameter t. */
	function sampleStem(t: number): { x: number; y: number } {
		return bezierPoint(
			cp.x0, cp.y0, cp.cx1, cp.cy1, cp.cx2, cp.cy2, cp.x3, cp.y3, t,
		);
	}

	/** Tangent angle (degrees) on the main stem at parameter t. */
	function stemAngle(t: number): number {
		const tan = bezierTangent(
			cp.x0, cp.y0, cp.cx1, cp.cy1, cp.cx2, cp.cy2, cp.x3, cp.y3, t,
		);
		return Math.atan2(tan.y, tan.x) * (180 / Math.PI);
	}

	// ── Leaf placement ───────────────────────────────────────────────

	interface Placement {
		x: number;
		y: number;
		angle: number;
	}

	let leafPlacements = $derived.by((): Placement[] => {
		const count = final.leafCount;
		if (count === 0 || final.stemHeight <= 0) return [];

		const dist = indiv.leaves.distribution;
		const droop = final.leafDroop;
		const out: Placement[] = [];

		if (dist === 'basal') {
			for (let i = 0; i < count; i++) {
				const t = 0.05 + (0.15 * i) / Math.max(count - 1, 1);
				const pt = sampleStem(t);
				const ta = stemAngle(t);
				const side = i % 2 === 0 ? 1 : -1;
				out.push({ x: pt.x, y: pt.y, angle: ta + side * (90 - droop) });
			}
		} else if (dist === 'opposite') {
			const nodes = Math.ceil(count / 2);
			for (let i = 0; i < nodes; i++) {
				const t = 0.15 + (0.7 * (i + 0.5)) / nodes;
				const pt = sampleStem(t);
				const ta = stemAngle(t);
				out.push({ x: pt.x, y: pt.y, angle: ta + (90 - droop) });
				if (out.length < count) {
					out.push({ x: pt.x, y: pt.y, angle: ta - (90 - droop) });
				}
			}
		} else if (dist === 'whorled') {
			const perWhorl = 3;
			const whorls = Math.ceil(count / perWhorl);
			let placed = 0;
			for (let w = 0; w < whorls && placed < count; w++) {
				const t = 0.15 + (0.7 * (w + 0.5)) / whorls;
				const pt = sampleStem(t);
				const ta = stemAngle(t);
				const n = Math.min(perWhorl, count - placed);
				for (let j = 0; j < n; j++) {
					const offset = ((j / n) - 0.5) * 180;
					out.push({ x: pt.x, y: pt.y, angle: ta + offset });
					placed++;
				}
			}
		} else {
			// alternate (default)
			for (let i = 0; i < count; i++) {
				const t = 0.15 + (0.7 * (i + 0.5)) / count;
				const pt = sampleStem(t);
				const ta = stemAngle(t);
				const side = i % 2 === 0 ? 1 : -1;
				out.push({ x: pt.x, y: pt.y, angle: ta + side * (90 - droop) });
			}
		}
		return out;
	});

	let leafPath = $derived(generateLeaf(indiv.leaves.shape, final.leafSize));

	// ── Flowers ──────────────────────────────────────────────────────

	let showFlowers = $derived(
		indiv.flowers !== null &&
		indiv.flowers.shape !== 'none' &&
		(stage === 'flowering' || stage === 'fruiting'),
	);

	let flowerPath = $derived.by(() => {
		if (!indiv.flowers || indiv.flowers.shape === 'none') return '';
		return generateFlower({
			shape: indiv.flowers.shape as RenderFlowerShape,
			petal_count: indiv.flowers.petal_count,
			size: indiv.flowers.size,
			bloom_density: indiv.flowers.bloom_density,
		});
	});

	let flowerPositions = $derived.by((): Placement[] => {
		if (!showFlowers || !indiv.flowers) return [];
		const count = Math.max(1, Math.round(3 * indiv.flowers.bloom_density));
		const out: Placement[] = [];
		for (let i = 0; i < count; i++) {
			const t = 0.6 + (0.3 * (i + 0.5)) / count;
			const pt = sampleStem(t);
			out.push({ x: pt.x, y: pt.y, angle: 0 });
		}
		return out;
	});

	let flowerColor = $derived(indiv.flowers?.color ?? '#fdd835');

	// ── Fruit ────────────────────────────────────────────────────────

	let showFruit = $derived(
		indiv.fruit !== null && (stage === 'fruiting' || stage === 'senescence'),
	);

	let fruitColor = $derived.by(() => {
		if (!indiv.fruit) return '';
		// Interpolate unripe → ripe based on growth progress.
		// At progress 0.5 fruit is fully unripe; at 1.0 fully ripe.
		const ripeness = Math.max(0, Math.min(1, (growthProgress - 0.5) * 2));
		return lerpColor(indiv.fruit.color_unripe, indiv.fruit.color_ripe, ripeness);
	});

	let fruitResult = $derived.by(() => {
		if (!indiv.fruit) return null;
		return generateFruit({
			shape: indiv.fruit.shape,
			size: final.fruitSize,
			hang_angle: indiv.fruit.hang_angle,
			cluster_count: indiv.fruit.cluster_count,
		});
	});

	let fruitPositions = $derived.by((): Placement[] => {
		if (!showFruit || !indiv.fruit) return [];
		const count = Math.max(1, indiv.fruit.cluster_count);
		const out: Placement[] = [];
		for (let i = 0; i < count; i++) {
			const t = 0.5 + (0.35 * (i + 0.5)) / count;
			const pt = sampleStem(t);
			out.push({ x: pt.x, y: pt.y, angle: indiv.fruit.hang_angle });
		}
		return out;
	});
</script>

<g class="plant">
	<!-- Stem -->
	<path
		d={stemResult.main}
		stroke={final.stemColor}
		stroke-width={r(final.stemThickness)}
		fill="none"
		stroke-linecap="round"
	/>

	<!-- Branches -->
	{#each stemResult.branches as branch}
		<path
			d={branch}
			stroke={final.stemColor}
			stroke-width={r(final.stemThickness * 0.6)}
			fill="none"
			stroke-linecap="round"
		/>
	{/each}

	<!-- Leaves -->
	{#each leafPlacements as leaf}
		<path
			d={leafPath}
			fill={final.leafColor}
			opacity={r(final.leafOpacity)}
			transform="translate({r(leaf.x)}, {r(leaf.y)}) rotate({r(leaf.angle)})"
		/>
	{/each}

	<!-- Flowers (flowering + fruiting stages) -->
	{#if showFlowers}
		{#each flowerPositions as pos}
			<path
				d={flowerPath}
				fill={flowerColor}
				transform="translate({r(pos.x)}, {r(pos.y)})"
			/>
		{/each}
	{/if}

	<!-- Fruit (fruiting + senescence stages) -->
	{#if showFruit && fruitResult}
		{#each fruitPositions as pos}
			<g
				transform="translate({r(pos.x)}, {r(pos.y)}) rotate({r(pos.angle)})"
				fill={fruitColor}
			>
				{@html fruitResult.elements}
			</g>
		{/each}
	{/if}
</g>
