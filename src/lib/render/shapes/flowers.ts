/**
 * Flower shape SVG path generators.
 *
 * Each generator returns an SVG path `d` attribute string representing
 * the flower centered at (0,0).
 *
 * Shapes: simple, composite, spike, umbel
 */

export type FlowerShape = 'simple' | 'composite' | 'spike' | 'umbel';

export interface FlowerParams {
	shape: FlowerShape;
	petal_count: number;
	size: number;
	bloom_density: number; // 0-1, affects fullness of composite/umbel
}

/** Map of shape name → generator function. */
export const FLOWER_SHAPES: Record<FlowerShape, (params: FlowerParams) => string> = {
	simple: generateSimple,
	composite: generateComposite,
	spike: generateSpike,
	umbel: generateUmbel,
};

/**
 * Generate a flower path for the given params.
 */
export function generateFlower(params: FlowerParams): string {
	return FLOWER_SHAPES[params.shape](params);
}

// ---- individual shapes ----

/**
 * Simple flower: petals radiating evenly from center (tomato, pepper).
 * Each petal is an elongated ellipse pointing outward.
 */
function generateSimple(params: FlowerParams): string {
	const { petal_count, size } = params;
	const petalLen = size;
	const petalWidth = size * 0.35;
	const parts: string[] = [];

	for (let i = 0; i < petal_count; i++) {
		const angle = (2 * Math.PI * i) / petal_count - Math.PI / 2;
		const tipX = Math.cos(angle) * petalLen;
		const tipY = Math.sin(angle) * petalLen;

		// Perpendicular direction for petal width
		const perpX = -Math.sin(angle) * petalWidth;
		const perpY = Math.cos(angle) * petalWidth;

		const cpDist = petalLen * 0.55;
		const cpX = Math.cos(angle) * cpDist;
		const cpY = Math.sin(angle) * cpDist;

		parts.push(
			`M0,0 ` +
				`Q${r(cpX + perpX)},${r(cpY + perpY)} ${r(tipX)},${r(tipY)} ` +
				`Q${r(cpX - perpX)},${r(cpY - perpY)} 0,0`,
		);
	}

	// Center disc
	const cr = size * 0.2;
	parts.push(
		`M${r(-cr)},0 ` +
			`A${r(cr)},${r(cr)} 0 1,0 ${r(cr)},0 ` +
			`A${r(cr)},${r(cr)} 0 1,0 ${r(-cr)},0`,
	);

	return parts.join(' ');
}

/**
 * Composite/daisy-like: outer ring of ray petals + dense disc center
 * (sunflower, marigold).
 */
function generateComposite(params: FlowerParams): string {
	const { petal_count, size, bloom_density } = params;
	const parts: string[] = [];

	// Outer ray petals — slightly narrower and more numerous
	const rayCount = Math.max(petal_count, 8);
	const petalLen = size;
	const petalWidth = size * 0.2;

	for (let i = 0; i < rayCount; i++) {
		const angle = (2 * Math.PI * i) / rayCount - Math.PI / 2;
		const tipX = Math.cos(angle) * petalLen;
		const tipY = Math.sin(angle) * petalLen;

		const perpX = -Math.sin(angle) * petalWidth;
		const perpY = Math.cos(angle) * petalWidth;

		const cpDist = petalLen * 0.5;
		const cpX = Math.cos(angle) * cpDist;
		const cpY = Math.sin(angle) * cpDist;

		parts.push(
			`M0,0 ` +
				`Q${r(cpX + perpX)},${r(cpY + perpY)} ${r(tipX)},${r(tipY)} ` +
				`Q${r(cpX - perpX)},${r(cpY - perpY)} 0,0`,
		);
	}

	// Disc center — radius grows with bloom_density
	const discRadius = size * (0.3 + bloom_density * 0.15);
	parts.push(
		`M${r(-discRadius)},0 ` +
			`A${r(discRadius)},${r(discRadius)} 0 1,0 ${r(discRadius)},0 ` +
			`A${r(discRadius)},${r(discRadius)} 0 1,0 ${r(-discRadius)},0`,
	);

	return parts.join(' ');
}

/**
 * Spike inflorescence: vertical column of small flowers (lavender, salvia).
 * Rendered as a series of small petal pairs along a vertical axis.
 */
function generateSpike(params: FlowerParams): string {
	const { size, bloom_density } = params;
	const parts: string[] = [];
	const spikeHeight = size * 2;
	const floretCount = Math.max(3, Math.round(5 + bloom_density * 8));
	const floretSize = size * 0.3;

	for (let i = 0; i < floretCount; i++) {
		const t = (i + 0.5) / floretCount;
		const cy = -spikeHeight * t;
		const fw = floretSize * (0.7 + 0.3 * (1 - Math.abs(t - 0.5) * 2));

		// Small petal pair at this height
		parts.push(
			`M0,${r(cy)} ` +
				`Q${r(fw)},${r(cy - fw * 0.5)} ${r(fw * 0.8)},${r(cy)} ` +
				`Q${r(fw)},${r(cy + fw * 0.5)} 0,${r(cy)}`,
		);
		parts.push(
			`M0,${r(cy)} ` +
				`Q${r(-fw)},${r(cy - fw * 0.5)} ${r(-fw * 0.8)},${r(cy)} ` +
				`Q${r(-fw)},${r(cy + fw * 0.5)} 0,${r(cy)}`,
		);
	}

	// Central spike axis
	parts.push(`M0,0 L0,${r(-spikeHeight)}`);

	return parts.join(' ');
}

/**
 * Umbel: flat or domed cluster of small flowers on stalks radiating
 * from a single point (dill, carrot flower, queen anne's lace).
 */
function generateUmbel(params: FlowerParams): string {
	const { size, bloom_density } = params;
	const parts: string[] = [];
	const rayCount = Math.max(5, Math.round(8 + bloom_density * 10));
	const stalkLen = size * 0.8;
	const floretRadius = size * 0.12;

	for (let i = 0; i < rayCount; i++) {
		const angle = (2 * Math.PI * i) / rayCount - Math.PI / 2;
		// Slight dome: tips at slightly different heights
		const domeOffset = Math.cos(angle + Math.PI / 2) * size * 0.1;
		const tipX = Math.cos(angle) * stalkLen;
		const tipY = Math.sin(angle) * stalkLen + domeOffset;

		// Stalk line
		parts.push(`M0,0 L${r(tipX)},${r(tipY)}`);

		// Tiny floret circle at tip
		parts.push(
			`M${r(tipX - floretRadius)},${r(tipY)} ` +
				`A${r(floretRadius)},${r(floretRadius)} 0 1,0 ${r(tipX + floretRadius)},${r(tipY)} ` +
				`A${r(floretRadius)},${r(floretRadius)} 0 1,0 ${r(tipX - floretRadius)},${r(tipY)}`,
		);
	}

	return parts.join(' ');
}

// ---- helpers ----

function r(n: number): string {
	return (Math.round(n * 100) / 100).toString();
}
