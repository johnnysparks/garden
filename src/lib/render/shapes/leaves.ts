/**
 * Leaf shape SVG path generators.
 *
 * Each function takes a `size` parameter (in SVG units) and returns
 * an SVG path `d` attribute string.  Paths are drawn with the leaf
 * base at (0,0) and the tip extending upward (negative Y).
 *
 * All 8 LeafShape types from the plant schema are covered:
 *   simple_oval, simple_pointed, lobed, pinnate_compound,
 *   palmate, linear, heart, needle
 */

export type LeafShape =
	| 'simple_oval'
	| 'simple_pointed'
	| 'lobed'
	| 'pinnate_compound'
	| 'palmate'
	| 'linear'
	| 'heart'
	| 'needle';

/** Map of shape name → generator function. */
export const LEAF_SHAPES: Record<LeafShape, (size: number) => string> = {
	simple_oval,
	simple_pointed,
	lobed,
	pinnate_compound,
	palmate,
	linear,
	heart,
	needle,
};

/**
 * Generate a leaf path for the given shape and size.
 */
export function generateLeaf(shape: LeafShape, size: number): string {
	return LEAF_SHAPES[shape](size);
}

// ---- individual shapes ----

/** Elliptical leaf with a slight point (basil, spinach). */
function simple_oval(size: number): string {
	const w = size * 0.4;
	return (
		`M0,0 ` +
		`C${r(w)},${r(-size * 0.3)} ${r(w)},${r(-size * 0.7)} 0,${r(-size)} ` +
		`C${r(-w)},${r(-size * 0.7)} ${r(-w)},${r(-size * 0.3)} 0,0`
	);
}

/** Wider base tapering to a sharper point (pepper). */
function simple_pointed(size: number): string {
	const w = size * 0.35;
	return (
		`M0,0 ` +
		`C${r(w)},${r(-size * 0.2)} ${r(w * 0.8)},${r(-size * 0.5)} 0,${r(-size)} ` +
		`C${r(-w * 0.8)},${r(-size * 0.5)} ${r(-w)},${r(-size * 0.2)} 0,0`
	);
}

/**
 * Irregular edge with rounded lobes (tomato single leaf).
 * Creates 3 lobes on each side for a wavy silhouette.
 */
function lobed(size: number): string {
	const w = size * 0.45;
	const lobeDepth = size * 0.08;
	const segs: string[] = [`M0,0`];

	// Right side going up with lobes
	segs.push(`C${r(w)},${r(-size * 0.1)} ${r(w + lobeDepth)},${r(-size * 0.15)} ${r(w)},${r(-size * 0.25)}`);
	segs.push(
		`C${r(w - lobeDepth)},${r(-size * 0.32)} ${r(w + lobeDepth)},${r(-size * 0.4)} ${r(w * 0.8)},${r(-size * 0.55)}`,
	);
	segs.push(
		`C${r(w * 0.6)},${r(-size * 0.65)} ${r(w * 0.4)},${r(-size * 0.8)} 0,${r(-size)}`,
	);

	// Left side coming back down with lobes
	segs.push(
		`C${r(-w * 0.4)},${r(-size * 0.8)} ${r(-w * 0.6)},${r(-size * 0.65)} ${r(-w * 0.8)},${r(-size * 0.55)}`,
	);
	segs.push(
		`C${r(-w - lobeDepth)},${r(-size * 0.4)} ${r(-w + lobeDepth)},${r(-size * 0.32)} ${r(-w)},${r(-size * 0.25)}`,
	);
	segs.push(
		`C${r(-w - lobeDepth)},${r(-size * 0.15)} ${r(-w)},${r(-size * 0.1)} 0,0`,
	);

	return segs.join(' ');
}

/**
 * Central rachis with paired leaflets (tomato compound, carrot).
 * Returns a composite path: central rachis line + paired leaflet ovals.
 */
function pinnate_compound(size: number): string {
	const rachisPath = `M0,0 L0,${r(-size)}`;
	const leafletCount = 4; // pairs
	const leafletSize = size * 0.22;
	const leafletWidth = leafletSize * 0.45;
	const parts: string[] = [rachisPath];

	for (let i = 0; i < leafletCount; i++) {
		const t = 0.2 + (0.6 * (i + 0.5)) / leafletCount;
		const cy = -size * t;

		// Right leaflet
		parts.push(
			`M0,${r(cy)} ` +
				`C${r(leafletWidth)},${r(cy - leafletSize * 0.3)} ` +
				`${r(leafletWidth)},${r(cy - leafletSize * 0.7)} ` +
				`0,${r(cy - leafletSize)}`,
		);

		// Left leaflet
		parts.push(
			`M0,${r(cy)} ` +
				`C${r(-leafletWidth)},${r(cy - leafletSize * 0.3)} ` +
				`${r(-leafletWidth)},${r(cy - leafletSize * 0.7)} ` +
				`0,${r(cy - leafletSize)}`,
		);
	}

	// Terminal leaflet
	const tipY = -size * 0.85;
	parts.push(
		`M0,${r(tipY)} ` +
			`C${r(leafletWidth)},${r(tipY - leafletSize * 0.3)} ` +
			`${r(leafletWidth)},${r(tipY - leafletSize * 0.7)} ` +
			`0,${r(tipY - leafletSize)}`,
	);

	return parts.join(' ');
}

/**
 * Star-like lobes from a central point (squash, maple).
 * 5 lobes radiating outward.
 */
function palmate(size: number): string {
	const lobeCount = 5;
	const lobeLen = size * 0.8;
	const lobeWidth = size * 0.18;
	const segs: string[] = [];

	// Spread across ~180° arc (upward-facing fan)
	const startAngle = -Math.PI * 0.85; // slightly past left
	const endAngle = -Math.PI * 0.15; // slightly past right

	for (let i = 0; i < lobeCount; i++) {
		const frac = i / (lobeCount - 1);
		const angle = startAngle + (endAngle - startAngle) * frac;

		// Scale: middle lobe longest
		const lenScale = 1 - 0.25 * Math.abs(frac - 0.5) * 2;
		const len = lobeLen * lenScale;

		const tipX = Math.cos(angle) * len;
		const tipY = Math.sin(angle) * len;

		// Perpendicular for width
		const perpX = -Math.sin(angle) * lobeWidth;
		const perpY = Math.cos(angle) * lobeWidth;

		const cpDist = len * 0.5;
		const cpX = Math.cos(angle) * cpDist;
		const cpY = Math.sin(angle) * cpDist;

		// Each lobe: base → tip (right side) → tip → base (left side)
		segs.push(
			`M0,0 ` +
				`Q${r(cpX + perpX)},${r(cpY + perpY)} ${r(tipX)},${r(tipY)} ` +
				`Q${r(cpX - perpX)},${r(cpY - perpY)} 0,0`,
		);
	}

	return segs.join(' ');
}

/** Thin blade (grass, chive). */
function linear(size: number): string {
	const w = size * 0.05;
	return `M0,0 L${r(w)},${r(-size)} L${r(-w)},${r(-size)} Z`;
}

/**
 * Two lobes meeting at a point (bean, sweet potato).
 * Heart shape opening upward with the point at the tip.
 */
function heart(size: number): string {
	const w = size * 0.45;
	const notch = size * 0.15;
	return (
		`M0,0 ` +
		// Right lobe
		`C${r(w * 0.6)},${r(-size * 0.1)} ${r(w)},${r(-size * 0.35)} ${r(w)},${r(-size * 0.5)} ` +
		// Curve to top-right notch
		`C${r(w)},${r(-size * 0.7)} ${r(w * 0.4)},${r(-size * 0.9)} 0,${r(-size + notch)} ` +
		// Left lobe mirror
		`C${r(-w * 0.4)},${r(-size * 0.9)} ${r(-w)},${r(-size * 0.7)} ${r(-w)},${r(-size * 0.5)} ` +
		`C${r(-w)},${r(-size * 0.35)} ${r(-w * 0.6)},${r(-size * 0.1)} 0,0`
	);
}

/** Very thin, rigid needle (rosemary, lavender). */
function needle(size: number): string {
	const w = size * 0.025;
	return (
		`M0,0 ` +
		`L${r(w)},${r(-size * 0.15)} ` +
		`L${r(w)},${r(-size * 0.85)} ` +
		`L0,${r(-size)} ` +
		`L${r(-w)},${r(-size * 0.85)} ` +
		`L${r(-w)},${r(-size * 0.15)} ` +
		`Z`
	);
}

// ---- helpers ----

function r(n: number): string {
	return (Math.round(n * 100) / 100).toString();
}
