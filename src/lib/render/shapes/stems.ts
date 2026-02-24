/**
 * Stem bezier path generators.
 *
 * All coordinates assume origin at the base of the plant (0,0),
 * with Y increasing upward (the caller flips the SVG coordinate
 * system via a transform).  The returned paths therefore use
 * negative Y values for upward growth.
 */

export interface StemParams {
	height: number;
	thickness: number;
	curve: number; // 0 = straight, 1 = very curved
	branch_frequency: number; // 0-1
	branch_angle: number; // degrees from stem
}

export interface StemResult {
	/** The main stem as an SVG <path> `d` attribute. */
	main: string;
	/** Branch paths, each an SVG <path> `d` attribute. */
	branches: string[];
}

/**
 * Generate a main stem cubic-bezier path and any branch paths.
 *
 * The main stem is a single cubic bezier from (0,0) going upward.
 * `curve` controls how far the control points deviate horizontally,
 * producing a gentle S-curve at low values and a dramatic lean at
 * high values.
 *
 * Branches are distributed evenly along the stem based on
 * `branch_frequency` and emerge at `branch_angle` degrees.
 */
export function generateStemBezier(params: StemParams): StemResult {
	const { height, thickness, curve, branch_frequency, branch_angle } = params;

	// --- main stem ---
	// Control point lateral offset driven by curve (0 → 0, 1 → ±height*0.3)
	const lateralMax = height * 0.3;
	const cp1x = lateralMax * curve;
	const cp1y = -height * 0.33;
	const cp2x = -lateralMax * curve * 0.5;
	const cp2y = -height * 0.66;
	const endY = -height;

	const main = `M0,0 C${r(cp1x)},${r(cp1y)} ${r(cp2x)},${r(cp2y)} 0,${r(endY)}`;

	// --- branches ---
	const branches: string[] = [];

	if (branch_frequency > 0 && height > 0) {
		// Number of branches scales with height and frequency
		const count = Math.max(1, Math.round(branch_frequency * (height / 10)));

		for (let i = 0; i < count; i++) {
			// Parameter t along the stem (avoid very bottom and very top)
			const t = 0.2 + (0.6 * (i + 0.5)) / count;

			// Point on the cubic bezier at parameter t
			const pt = bezierPoint(0, 0, cp1x, cp1y, cp2x, cp2y, 0, endY, t);

			// Tangent at t — used to orient the branch
			const tan = bezierTangent(0, 0, cp1x, cp1y, cp2x, cp2y, 0, endY, t);
			const tangentAngle = Math.atan2(tan.y, tan.x);

			// Alternate branches left/right
			const side = i % 2 === 0 ? 1 : -1;
			const branchAngleRad = (branch_angle * Math.PI) / 180;
			const angle = tangentAngle + side * (Math.PI / 2 - branchAngleRad);

			// Branch length proportional to stem height and thickness
			const branchLen = height * 0.2 * (1 - Math.abs(t - 0.5)); // longer near middle

			const bx = pt.x + Math.cos(angle) * branchLen;
			const by = pt.y + Math.sin(angle) * branchLen;

			// Slight curve on the branch
			const bcx = pt.x + Math.cos(angle) * branchLen * 0.6;
			const bcy = pt.y + Math.sin(angle) * branchLen * 0.6 - branchLen * 0.1;

			branches.push(`M${r(pt.x)},${r(pt.y)} Q${r(bcx)},${r(bcy)} ${r(bx)},${r(by)}`);
		}
	}

	return { main, branches };
}

// ---- helpers ----

/** Round a number to 2 decimal places for compact SVG output. */
function r(n: number): string {
	return (Math.round(n * 100) / 100).toString();
}

/** Evaluate a cubic bezier at parameter t (0-1). */
function bezierPoint(
	x0: number,
	y0: number,
	cx1: number,
	cy1: number,
	cx2: number,
	cy2: number,
	x3: number,
	y3: number,
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

/** Tangent vector of a cubic bezier at parameter t. */
function bezierTangent(
	x0: number,
	y0: number,
	cx1: number,
	cy1: number,
	cx2: number,
	cy2: number,
	x3: number,
	y3: number,
	t: number,
): { x: number; y: number } {
	const mt = 1 - t;
	return {
		x: 3 * mt * mt * (cx1 - x0) + 6 * mt * t * (cx2 - cx1) + 3 * t * t * (x3 - cx2),
		y: 3 * mt * mt * (cy1 - y0) + 6 * mt * t * (cy2 - cy1) + 3 * t * t * (y3 - cy2),
	};
}
