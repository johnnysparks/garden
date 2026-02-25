/**
 * Time-of-day lighting and shadow calculations — pure functions, no DOM.
 *
 * During the ACT phase each action spent advances dayProgress from 0 (dawn)
 * to 1 (dusk). This module derives sky color shifts, shadow geometry, and
 * plant lighting from that single progress value combined with the seasonal
 * warmth (0-1) from the palette.
 *
 * The result is immediate full-screen color warming/cooling that gives the
 * player visceral feedback on how much of the day remains.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** Complete lighting state for a single frame. */
export interface DaylightState {
	/** 0 = dawn, 0.5 = noon, 1 = dusk. Derived from energy spent. */
	dayProgress: number;
	/** Sun angle in degrees. 0° = east horizon, 90° = zenith, 180° = west. */
	sunAngle: number;
	/** Overall warmth 0-1 combining season + time of day. */
	warmth: number;
	/** Shadow direction in degrees (rotation for shadow ellipse). */
	shadowDirection: number;
	/** Shadow length multiplier (long at dawn/dusk, short at noon). */
	shadowLength: number;
	/** Shadow opacity (faint at dawn/dusk, solid at noon). */
	shadowOpacity: number;
	/** Brightness multiplier for the scene (slightly dimmer at edges of day). */
	brightness: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum brightness at dawn/dusk edges (fraction of full). */
const MIN_BRIGHTNESS = 0.85;

/** Maximum shadow opacity at solar noon. */
const MAX_SHADOW_OPACITY = 0.25;

/** Minimum shadow opacity at dawn/dusk. */
const MIN_SHADOW_OPACITY = 0.08;

/** Shadow length at horizon (long, stretched). */
const SHADOW_LENGTH_HORIZON = 2.0;

/** Shadow length at noon (short, compact). */
const SHADOW_LENGTH_NOON = 0.5;

// ── Core calculations ───────────────────────────────────────────────────────

/**
 * Compute full daylight state from progress through the day and season warmth.
 *
 * @param dayProgress  0 (dawn) → 1 (dusk), derived from actions spent / max
 * @param seasonWarmth 0-1 from the seasonal palette (summer = 0.8, frost = 0)
 */
export function calculateDaylight(
	dayProgress: number,
	seasonWarmth: number,
): DaylightState {
	const p = Math.max(0, Math.min(1, dayProgress));

	// Sun arc: 0° (east) at dawn, 180° (west) at dusk, 90° (zenith) at noon
	const sunAngle = p * 180;

	// Elevation above horizon (0 at edges, 1 at noon)
	const elevation = Math.sin(p * Math.PI);

	// Warmth peaks at midday and blends with seasonal warmth
	// Time-of-day contribution: bell curve peaking at noon
	const timeWarmth = elevation * 0.4; // up to +0.4 at noon
	const warmth = Math.min(1, seasonWarmth * 0.6 + timeWarmth);

	// Shadow direction: points away from sun
	// At dawn (p=0) sun is east → shadow points west (270°, from east)
	// At noon (p=0.5) sun overhead → shadow straight down (180°)
	// At dusk (p=1) sun is west → shadow points east (90°)
	// Linear interpolation from 270° through 180° to 90°
	const shadowDirection = 270 - p * 180;

	// Shadow length: long at edges, short at noon
	const shadowLength =
		SHADOW_LENGTH_HORIZON +
		(SHADOW_LENGTH_NOON - SHADOW_LENGTH_HORIZON) * elevation;

	// Shadow opacity: faint at edges, stronger at noon
	const shadowOpacity =
		MIN_SHADOW_OPACITY +
		(MAX_SHADOW_OPACITY - MIN_SHADOW_OPACITY) * elevation;

	// Brightness: slightly dimmer at dawn/dusk
	const brightness = MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * elevation;

	return {
		dayProgress: p,
		sunAngle,
		warmth,
		shadowDirection,
		shadowLength,
		shadowOpacity,
		brightness,
	};
}

// ── Sky color ───────────────────────────────────────────────────────────────

/** Tint colors for dawn, noon, and dusk overlays. */
const DAWN_TINT = { r: 255, g: 183, b: 77 }; // warm orange
const NOON_TINT = { r: 255, g: 253, b: 231 }; // bright warm white
const DUSK_TINT = { r: 255, g: 138, b: 101 }; // deeper coral-orange

/**
 * Compute a CSS color for the sky background based on daylight state.
 *
 * Blends the seasonal sky color with time-of-day tints:
 * - Dawn: warm orange wash
 * - Noon: bright, slightly warm
 * - Dusk: deeper coral-orange
 *
 * @param daylight Current daylight state
 * @param baseSky  Hex color from seasonal palette (e.g. '#fffde7')
 */
export function skyColor(daylight: DaylightState, baseSky: string): string {
	const p = daylight.dayProgress;

	// Pick the time tint by blending dawn → noon → dusk
	let tint: { r: number; g: number; b: number };
	if (p < 0.5) {
		// Dawn → Noon
		const t = p * 2; // 0-1 over first half
		tint = lerpRgb(DAWN_TINT, NOON_TINT, t);
	} else {
		// Noon → Dusk
		const t = (p - 0.5) * 2; // 0-1 over second half
		tint = lerpRgb(NOON_TINT, DUSK_TINT, t);
	}

	// Blend strength: strongest at edges of day, subtlest at noon
	const elevation = Math.sin(p * Math.PI);
	const blendStrength = 0.15 + (1 - elevation) * 0.15; // 0.15–0.30

	// Parse base sky and blend
	const base = parseHex(baseSky);
	const blended = lerpRgb(base, tint, blendStrength);
	return toHex(blended);
}

// ── Garden atmosphere filter ────────────────────────────────────────────────

/**
 * Compute a CSS filter string for the garden content area.
 *
 * Applies subtle brightness and warmth shifts that make the entire
 * screen visibly warmer at noon and cooler at dawn/dusk.
 *
 * @param daylight Current daylight state
 */
export function atmosphereFilter(daylight: DaylightState): string {
	const parts: string[] = [];

	// Brightness: slightly dimmer at edges
	if (daylight.brightness < 0.99) {
		parts.push(`brightness(${daylight.brightness.toFixed(3)})`);
	}

	// Warmth via sepia + saturate: noon is warm, dawn/dusk cooler
	// Subtle effect — sepia at most 8% with compensating saturation
	const sepiaAmount = daylight.warmth * 0.08;
	if (sepiaAmount > 0.005) {
		parts.push(`sepia(${sepiaAmount.toFixed(3)})`);
		parts.push(`saturate(${(1 + sepiaAmount * 0.5).toFixed(3)})`);
	}

	return parts.length > 0 ? parts.join(' ') : 'none';
}

// ── Plant shadow geometry ───────────────────────────────────────────────────

/** Shadow ellipse transform values for a single plant. */
export interface PlantShadow {
	/** Horizontal offset of shadow center from plant base (SVG units). */
	offsetX: number;
	/** Vertical squash of the shadow ellipse (0.1 = very flat). */
	scaleY: number;
	/** Opacity of the shadow fill. */
	opacity: number;
}

/**
 * Compute shadow geometry for a plant based on daylight state.
 *
 * Shadow slides east→west as the sun crosses, lengthens at edges of day.
 * Kept simple: an offset ellipse below the plant base.
 *
 * @param daylight   Current daylight state
 * @param plantScale Scale factor of the plant in SVG units
 */
export function plantShadow(
	daylight: DaylightState,
	plantScale: number,
): PlantShadow {
	const p = daylight.dayProgress;

	// Horizontal offset: sun from east (p=0) pushes shadow west (negative x),
	// sun from west (p=1) pushes shadow east (positive x).
	// At noon (p=0.5) shadow is centered below.
	const maxOffset = 8 * plantScale;
	const offsetX = (p - 0.5) * 2 * maxOffset;

	// Vertical squash: flatter at noon (sun overhead), taller at edges
	const elevation = Math.sin(p * Math.PI);
	const scaleY = 0.15 + (1 - elevation) * 0.2; // 0.15 at noon, 0.35 at edges

	return {
		offsetX,
		scaleY,
		opacity: daylight.shadowOpacity,
	};
}

// ── Heliotropism ────────────────────────────────────────────────────────────

/**
 * Calculate plant lean toward the sun (heliotropism).
 *
 * Returns a rotation in degrees that tilts the plant toward the current
 * sun position. Positive = lean right (toward west/afternoon sun),
 * negative = lean left (toward east/morning sun).
 *
 * @param daylight  Current daylight state
 * @param amplitude Species-specific lean amplitude (degrees, e.g. 3-8)
 */
export function heliotropism(
	daylight: DaylightState,
	amplitude: number,
): number {
	const p = daylight.dayProgress;
	// At dawn (p=0): lean left toward east sun (-amplitude)
	// At noon (p=0.5): upright (0)
	// At dusk (p=1): lean right toward west sun (+amplitude)
	return (p - 0.5) * 2 * amplitude;
}

// ── Color utilities (internal) ──────────────────────────────────────────────

interface RGB {
	r: number;
	g: number;
	b: number;
}

function parseHex(hex: string): RGB {
	const h = hex.replace('#', '');
	return {
		r: parseInt(h.substring(0, 2), 16),
		g: parseInt(h.substring(2, 4), 16),
		b: parseInt(h.substring(4, 6), 16),
	};
}

function toHex(rgb: RGB): string {
	const r = Math.round(Math.max(0, Math.min(255, rgb.r)));
	const g = Math.round(Math.max(0, Math.min(255, rgb.g)));
	const b = Math.round(Math.max(0, Math.min(255, rgb.b)));
	return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
	return {
		r: a.r + (b.r - a.r) * t,
		g: a.g + (b.g - a.g) * t,
		b: a.b + (b.b - a.b) * t,
	};
}
