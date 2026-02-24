/**
 * Tests for the season palette and color utility functions.
 *
 * Validates lerpColor, desaturate, deriveColor, and the palette
 * data structure itself.
 */

import { describe, it, expect } from 'vitest';
import {
	SEASON_PALETTES,
	lerpColor,
	desaturate,
	deriveColor,
	type SeasonId,
	type SeasonPalette,
} from '../../src/lib/render/palette.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse a hex color to [r, g, b]. */
function parseHex(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.substring(0, 2), 16),
		parseInt(h.substring(2, 4), 16),
		parseInt(h.substring(4, 6), 16),
	];
}

/** Check a string is a valid 7-char hex color. */
function isValidHex(s: string): boolean {
	return /^#[0-9a-f]{6}$/i.test(s);
}

// ── SEASON_PALETTES data ─────────────────────────────────────────────

describe('SEASON_PALETTES', () => {
	const expectedSeasons: SeasonId[] = [
		'early_spring',
		'late_spring',
		'summer',
		'late_summer',
		'early_fall',
		'late_fall',
		'frost',
	];

	it('defines all 7 seasons', () => {
		for (const season of expectedSeasons) {
			expect(SEASON_PALETTES[season]).toBeDefined();
		}
	});

	it('each palette has valid hex colors', () => {
		for (const season of expectedSeasons) {
			const p = SEASON_PALETTES[season];
			expect(isValidHex(p.sky)).toBe(true);
			expect(isValidHex(p.soil)).toBe(true);
			expect(isValidHex(p.foliage_base)).toBe(true);
			expect(isValidHex(p.accent)).toBe(true);
			expect(isValidHex(p.ui_bg)).toBe(true);
		}
	});

	it('warmth values are between 0 and 1', () => {
		for (const season of expectedSeasons) {
			const p = SEASON_PALETTES[season];
			expect(p.warmth).toBeGreaterThanOrEqual(0);
			expect(p.warmth).toBeLessThanOrEqual(1);
		}
	});

	it('warmth peaks in summer and is 0 in frost', () => {
		expect(SEASON_PALETTES.summer.warmth).toBe(0.8);
		expect(SEASON_PALETTES.frost.warmth).toBe(0.0);
	});

	it('warmth follows a seasonal arc', () => {
		// spring increases, summer peaks, fall decreases
		expect(SEASON_PALETTES.late_spring.warmth).toBeGreaterThan(
			SEASON_PALETTES.early_spring.warmth,
		);
		expect(SEASON_PALETTES.summer.warmth).toBeGreaterThan(
			SEASON_PALETTES.late_spring.warmth,
		);
		expect(SEASON_PALETTES.late_fall.warmth).toBeLessThan(
			SEASON_PALETTES.early_fall.warmth,
		);
	});
});

// ── lerpColor ────────────────────────────────────────────────────────

describe('lerpColor', () => {
	it('returns colorA at t=0', () => {
		const result = lerpColor('#ff0000', '#0000ff', 0);
		expect(result).toBe('#ff0000');
	});

	it('returns colorB at t=1', () => {
		const result = lerpColor('#ff0000', '#0000ff', 1);
		expect(result).toBe('#0000ff');
	});

	it('produces a midpoint at t=0.5', () => {
		const result = lerpColor('#000000', '#ffffff', 0.5);
		const [r, g, b] = parseHex(result);
		// Midpoint of 0 and 255 rounds to 128
		expect(r).toBeCloseTo(128, -1);
		expect(g).toBeCloseTo(128, -1);
		expect(b).toBeCloseTo(128, -1);
	});

	it('interpolates each channel independently', () => {
		const result = lerpColor('#ff0000', '#00ff00', 0.5);
		const [r, g, b] = parseHex(result);
		expect(r).toBeCloseTo(128, -1);
		expect(g).toBeCloseTo(128, -1);
		expect(b).toBe(0);
	});

	it('returns valid hex strings', () => {
		for (let t = 0; t <= 1; t += 0.1) {
			const result = lerpColor('#123456', '#abcdef', t);
			expect(isValidHex(result)).toBe(true);
		}
	});
});

// ── desaturate ───────────────────────────────────────────────────────

describe('desaturate', () => {
	it('returns the same color at amount=0', () => {
		const result = desaturate('#ff0000', 0);
		expect(result).toBe('#ff0000');
	});

	it('returns a greyscale color at amount=1', () => {
		const result = desaturate('#ff0000', 1);
		const [r, g, b] = parseHex(result);
		// Full desaturation means r ≈ g ≈ b (grey)
		expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
		expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
	});

	it('partially desaturates', () => {
		const full = '#ff0000';
		const halfDesat = desaturate(full, 0.5);
		const [, gHalf] = parseHex(halfDesat);
		const [, gNone] = parseHex(full);
		const [, gFull] = parseHex(desaturate(full, 1));

		// Green channel should be between none and full desaturation
		expect(gHalf).toBeGreaterThan(gNone);
		expect(gHalf).toBeLessThan(gFull);
	});

	it('already-grey colors are unaffected', () => {
		const grey = '#808080';
		const result = desaturate(grey, 0.5);
		expect(result).toBe(grey);
	});

	it('clamps amount above 1', () => {
		// amount > 1 should be clamped to 1
		const result = desaturate('#ff0000', 2);
		const [r, g, b] = parseHex(result);
		expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
		expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
	});
});

// ── deriveColor ──────────────────────────────────────────────────────

describe('deriveColor', () => {
	const summerPalette = SEASON_PALETTES.summer;
	const frostPalette = SEASON_PALETTES.frost;

	it('returns a valid hex color', () => {
		const result = deriveColor('#43a047', summerPalette, 1);
		expect(isValidHex(result)).toBe(true);
	});

	it('blends species color with seasonal foliage_base', () => {
		// At health=1, the result should be 70% species + 30% seasonal
		const speciesColor = '#ff0000'; // pure red
		const result = deriveColor(speciesColor, summerPalette, 1);
		const [r] = parseHex(result);
		const [sr] = parseHex(speciesColor);
		const [fr] = parseHex(summerPalette.foliage_base);

		// Result red channel should be between species and foliage_base
		const expectedR = Math.round(sr * 0.7 + fr * 0.3);
		expect(r).toBeCloseTo(expectedR, -1);
	});

	it('desaturates more at lower health', () => {
		const color = '#43a047';
		const healthy = deriveColor(color, summerPalette, 1.0);
		const sick = deriveColor(color, summerPalette, 0.5);

		// The sick plant should be more desaturated (closer to grey)
		const [rH, gH] = parseHex(healthy);
		const [rS, gS] = parseHex(sick);
		// Green-dominant color: desaturation means red increases relative to green
		const diffH = Math.abs(gH - rH);
		const diffS = Math.abs(gS - rS);
		expect(diffS).toBeLessThanOrEqual(diffH);
	});

	it('shifts toward yellow/brown when health < 0.5', () => {
		const color = '#43a047';
		const result = deriveColor(color, summerPalette, 0.1);
		const [r, g, b] = parseHex(result);

		// Yellow/brown shift: red > blue, green > blue
		expect(r).toBeGreaterThan(b);
		expect(g).toBeGreaterThan(b);
	});

	it('no yellow shift at health >= 0.5', () => {
		const color = '#0000ff'; // pure blue
		const at05 = deriveColor(color, summerPalette, 0.5);
		const at1 = deriveColor(color, summerPalette, 1.0);

		// At 0.5 and above, no yellow/brown shift is applied, so blue channel
		// stays relatively high compared to at health 0.1
		const [, , b05] = parseHex(at05);
		const [, , b01] = parseHex(deriveColor(color, summerPalette, 0.1));
		expect(b05).toBeGreaterThan(b01);
	});

	it('frost palette desaturates the output compared to summer', () => {
		const color = '#43a047';
		const summer = deriveColor(color, summerPalette, 1.0);
		const frost = deriveColor(color, frostPalette, 1.0);

		// Both should be valid
		expect(isValidHex(summer)).toBe(true);
		expect(isValidHex(frost)).toBe(true);

		// The frost result should look different (blue-grey vs green)
		expect(frost).not.toBe(summer);
	});

	it('dead plant (health=0) is heavily yellow/brown shifted', () => {
		const color = '#43a047';
		const dead = deriveColor(color, summerPalette, 0);
		const [r, g, b] = parseHex(dead);

		// Should be heavily toward #c9a94e (the brown target)
		// Brown/yellow: r high, g moderate, b low
		expect(r).toBeGreaterThan(b);
	});
});
