/**
 * Season palette definitions and plant color derivation.
 *
 * The entire visual space shifts through seasonal phases. Background, soil,
 * foliage base colors all derive from the current season. Individual plant
 * colors are offsets from the seasonal foliage_base, modified by health.
 */

// ── Season palette types ─────────────────────────────────────────────

export interface SeasonPalette {
	sky: string;
	soil: string;
	foliage_base: string;
	accent: string;
	ui_bg: string;
	warmth: number; // 0-1
}

export type SeasonId =
	| 'early_spring'
	| 'late_spring'
	| 'summer'
	| 'late_summer'
	| 'early_fall'
	| 'late_fall'
	| 'frost';

// ── Palette definitions from spec ────────────────────────────────────

export const SEASON_PALETTES: Record<SeasonId, SeasonPalette> = {
	early_spring: {
		sky: '#e8f5e9',
		soil: '#5d4037',
		foliage_base: '#81c784',
		accent: '#fff176',
		ui_bg: '#f1f8e9',
		warmth: 0.3,
	},
	late_spring: {
		sky: '#f1f8e9',
		soil: '#5d4037',
		foliage_base: '#66bb6a',
		accent: '#e91e63',
		ui_bg: '#f1f8e9',
		warmth: 0.5,
	},
	summer: {
		sky: '#fffde7',
		soil: '#6d4c41',
		foliage_base: '#43a047',
		accent: '#f44336',
		ui_bg: '#fffde7',
		warmth: 0.8,
	},
	late_summer: {
		sky: '#fff8e1',
		soil: '#6d4c41',
		foliage_base: '#689f38',
		accent: '#ff9800',
		ui_bg: '#fff8e1',
		warmth: 0.7,
	},
	early_fall: {
		sky: '#fff3e0',
		soil: '#5d4037',
		foliage_base: '#8d6e63',
		accent: '#ff6d00',
		ui_bg: '#fff3e0',
		warmth: 0.5,
	},
	late_fall: {
		sky: '#efebe9',
		soil: '#4e342e',
		foliage_base: '#a1887f',
		accent: '#795548',
		ui_bg: '#efebe9',
		warmth: 0.2,
	},
	frost: {
		sky: '#eceff1',
		soil: '#455a64',
		foliage_base: '#78909c',
		accent: '#b0bec5',
		ui_bg: '#eceff1',
		warmth: 0.0,
	},
};

// ── Color utilities ──────────────────────────────────────────────────

/** Parse a hex color string into [r, g, b] (0-255). */
function parseHex(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.substring(0, 2), 16),
		parseInt(h.substring(2, 4), 16),
		parseInt(h.substring(4, 6), 16),
	];
}

/** Convert [r, g, b] (0-255) to a hex color string. */
function toHex(rgb: [number, number, number]): string {
	const r = Math.round(Math.max(0, Math.min(255, rgb[0])));
	const g = Math.round(Math.max(0, Math.min(255, rgb[1])));
	const b = Math.round(Math.max(0, Math.min(255, rgb[2])));
	return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Convert RGB (0-255) to HSL. Returns [h (0-360), s (0-1), l (0-1)]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s, l];
}

/** Convert HSL to RGB (0-255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	h = ((h % 360) + 360) % 360;
	if (s === 0) {
		const v = Math.round(l * 255);
		return [v, v, v];
	}
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hNorm = h / 360;
	return [
		Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
		Math.round(hue2rgb(p, q, hNorm) * 255),
		Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
	];
}

/** Linearly interpolate between two hex colors. t=0 → colorA, t=1 → colorB. */
export function lerpColor(colorA: string, colorB: string, t: number): string {
	const a = parseHex(colorA);
	const b = parseHex(colorB);
	return toHex([
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	]);
}

/** Desaturate a hex color by `amount` (0 = no change, 1 = fully grey). */
export function desaturate(color: string, amount: number): string {
	const [r, g, b] = parseHex(color);
	const [h, s, l] = rgbToHsl(r, g, b);
	const newS = s * (1 - Math.max(0, Math.min(1, amount)));
	const rgb = hslToRgb(h, newS, l);
	return toHex(rgb);
}

// ── Plant color derivation ───────────────────────────────────────────

/**
 * Derive a plant's rendered color from its species color, the current
 * season palette, and the plant's health (0-1, where 1 = fully healthy).
 *
 * 1. Blend species-specific hue with seasonal foliage_base (30% seasonal influence)
 * 2. Desaturate based on health loss
 * 3. Shift toward yellow/brown when health drops below 0.5
 */
export function deriveColor(
	speciesColor: string,
	seasonPalette: SeasonPalette,
	health: number,
): string {
	// Blend species color with seasonal base
	const seasonal = lerpColor(speciesColor, seasonPalette.foliage_base, 0.3);

	// Desaturate based on health loss
	const healthAdjusted = desaturate(seasonal, (1 - health) * 0.6);

	// Shift toward yellow/brown when severely unhealthy
	if (health < 0.5) {
		return lerpColor(healthAdjusted, '#c9a94e', (0.5 - health) * 0.8);
	}

	return healthAdjusted;
}
