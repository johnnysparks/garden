/**
 * Fruit shape SVG generators.
 *
 * Each generator returns SVG element string(s) — either a <path> `d`
 * attribute or a complete SVG element string (e.g. for circles/ellipses
 * and grouped elements).
 *
 * Shapes: sphere, oblate, elongated, pod, berry_cluster
 */

export type FruitShape = 'sphere' | 'oblate' | 'elongated' | 'pod' | 'berry_cluster';

export interface FruitParams {
	shape: FruitShape;
	size: number;
	hang_angle: number; // degrees, how much the fruit droops
	cluster_count: number; // for berry_cluster
}

export interface FruitResult {
	/** SVG elements string (may contain multiple elements wrapped in a <g>). */
	elements: string;
}

/** Map of shape name → generator function. */
export const FRUIT_SHAPES: Record<FruitShape, (params: FruitParams) => FruitResult> = {
	sphere: generateSphere,
	oblate: generateOblate,
	elongated: generateElongated,
	pod: generatePod,
	berry_cluster: generateBerryCluster,
};

/**
 * Generate fruit SVG elements for the given params.
 */
export function generateFruit(params: FruitParams): FruitResult {
	return FRUIT_SHAPES[params.shape](params);
}

// ---- individual shapes ----

/** Round fruit (cherry tomato, blueberry). */
function generateSphere(params: FruitParams): FruitResult {
	const { size } = params;
	const radius = size / 2;
	return {
		elements: `<circle cx="0" cy="0" r="${r(radius)}" />`,
	};
}

/**
 * Flattened sphere — wider than tall (beefsteak tomato, pumpkin).
 * Rendered as an ellipse with rx > ry.
 */
function generateOblate(params: FruitParams): FruitResult {
	const { size } = params;
	const rx = size * 0.55;
	const ry = size * 0.4;
	return {
		elements: `<ellipse cx="0" cy="0" rx="${r(rx)}" ry="${r(ry)}" />`,
	};
}

/**
 * Longer than wide (pepper, zucchini, cucumber).
 * Rendered as a path with rounded ends.
 */
function generateElongated(params: FruitParams): FruitResult {
	const { size } = params;
	const halfLen = size * 0.7;
	const width = size * 0.25;

	// Capsule-like shape standing vertical
	const path =
		`M${r(-width)},${r(-halfLen + width)} ` +
		`A${r(width)},${r(width)} 0 0,1 ${r(width)},${r(-halfLen + width)} ` +
		`L${r(width)},${r(halfLen - width)} ` +
		`A${r(width)},${r(width)} 0 0,1 ${r(-width)},${r(halfLen - width)} ` +
		`Z`;

	return {
		elements: `<path d="${path}" />`,
	};
}

/**
 * Pod shape (green bean, pea, okra).
 * Curved elongated form with tapered ends.
 */
function generatePod(params: FruitParams): FruitResult {
	const { size } = params;
	const halfLen = size * 0.8;
	const width = size * 0.15;
	const curvature = size * 0.1;

	const path =
		`M0,${r(-halfLen)} ` +
		`C${r(width + curvature)},${r(-halfLen * 0.6)} ` +
		`${r(width + curvature)},${r(halfLen * 0.6)} ` +
		`0,${r(halfLen)} ` +
		`C${r(-width)},${r(halfLen * 0.6)} ` +
		`${r(-width)},${r(-halfLen * 0.6)} ` +
		`0,${r(-halfLen)}`;

	return {
		elements: `<path d="${path}" />`,
	};
}

/**
 * Cluster of small spheres (grape, currant, berry cluster).
 * Arranged in a roughly triangular bunch.
 */
function generateBerryCluster(params: FruitParams): FruitResult {
	const { size, cluster_count } = params;
	const count = Math.max(3, cluster_count);
	const berryRadius = size * 0.18;
	const spread = size * 0.35;

	const berries: string[] = [];

	// Arrange in rows: 1, 2, 3, ... to form a triangular cluster
	let placed = 0;
	let row = 0;
	while (placed < count) {
		const inRow = Math.min(row + 1, count - placed);
		const rowY = row * berryRadius * 1.7;
		const rowWidth = (inRow - 1) * berryRadius * 1.8;

		for (let j = 0; j < inRow; j++) {
			const cx = -rowWidth / 2 + j * berryRadius * 1.8;
			const cy = -spread + rowY;
			berries.push(`<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(berryRadius)}" />`);
			placed++;
		}
		row++;
	}

	return {
		elements: `<g>${berries.join('')}</g>`,
	};
}

// ---- helpers ----

function r(n: number): string {
	return (Math.round(n * 100) / 100).toString();
}
