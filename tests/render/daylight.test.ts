import { describe, it, expect } from 'vitest';
import {
	calculateDaylight,
	skyColor,
	atmosphereFilter,
	plantShadow,
	heliotropism,
	type DaylightState,
} from '../../src/lib/render/daylight.js';

// ── calculateDaylight ─────────────────────────────────────────────────────

describe('calculateDaylight', () => {
	it('returns expected shape', () => {
		const state = calculateDaylight(0.5, 0.8);
		expect(state).toHaveProperty('dayProgress');
		expect(state).toHaveProperty('sunAngle');
		expect(state).toHaveProperty('warmth');
		expect(state).toHaveProperty('shadowDirection');
		expect(state).toHaveProperty('shadowLength');
		expect(state).toHaveProperty('shadowOpacity');
		expect(state).toHaveProperty('brightness');
	});

	it('clamps dayProgress to [0, 1]', () => {
		expect(calculateDaylight(-0.5, 0.5).dayProgress).toBe(0);
		expect(calculateDaylight(1.5, 0.5).dayProgress).toBe(1);
	});

	it('at dawn (p=0): sun at east horizon, low brightness', () => {
		const state = calculateDaylight(0, 0.5);
		expect(state.sunAngle).toBe(0);
		expect(state.brightness).toBeCloseTo(0.85, 2);
	});

	it('at noon (p=0.5): sun at zenith, max brightness', () => {
		const state = calculateDaylight(0.5, 0.5);
		expect(state.sunAngle).toBe(90);
		expect(state.brightness).toBeCloseTo(1.0, 2);
	});

	it('at dusk (p=1): sun at west horizon, low brightness', () => {
		const state = calculateDaylight(1, 0.5);
		expect(state.sunAngle).toBe(180);
		expect(state.brightness).toBeCloseTo(0.85, 1);
	});

	it('shadow is longest at dawn/dusk, shortest at noon', () => {
		const dawn = calculateDaylight(0, 0.5);
		const noon = calculateDaylight(0.5, 0.5);
		const dusk = calculateDaylight(1, 0.5);
		expect(dawn.shadowLength).toBeGreaterThan(noon.shadowLength);
		expect(dusk.shadowLength).toBeGreaterThan(noon.shadowLength);
	});

	it('shadow opacity peaks at noon', () => {
		const dawn = calculateDaylight(0, 0.5);
		const noon = calculateDaylight(0.5, 0.5);
		expect(noon.shadowOpacity).toBeGreaterThan(dawn.shadowOpacity);
	});

	it('warmth incorporates season warmth', () => {
		const cold = calculateDaylight(0.5, 0.0);
		const warm = calculateDaylight(0.5, 0.8);
		expect(warm.warmth).toBeGreaterThan(cold.warmth);
	});

	it('warmth peaks near noon (elevation-dependent)', () => {
		const dawn = calculateDaylight(0.1, 0.5);
		const noon = calculateDaylight(0.5, 0.5);
		const dusk = calculateDaylight(0.9, 0.5);
		expect(noon.warmth).toBeGreaterThan(dawn.warmth);
		expect(noon.warmth).toBeGreaterThan(dusk.warmth);
	});

	it('shadow direction sweeps from 270° (dawn) through 180° (noon) to 90° (dusk)', () => {
		const dawn = calculateDaylight(0, 0.5);
		const noon = calculateDaylight(0.5, 0.5);
		const dusk = calculateDaylight(1, 0.5);
		expect(dawn.shadowDirection).toBeCloseTo(270, 1);
		expect(noon.shadowDirection).toBeCloseTo(180, 1);
		expect(dusk.shadowDirection).toBeCloseTo(90, 1);
	});
});

// ── skyColor ──────────────────────────────────────────────────────────────

describe('skyColor', () => {
	it('returns a valid hex color', () => {
		const daylight = calculateDaylight(0.5, 0.5);
		const color = skyColor(daylight, '#fffde7');
		expect(color).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('shifts color at dawn vs noon vs dusk', () => {
		const dawn = skyColor(calculateDaylight(0, 0.5), '#fffde7');
		const noon = skyColor(calculateDaylight(0.5, 0.5), '#fffde7');
		const dusk = skyColor(calculateDaylight(1, 0.5), '#fffde7');
		// They should all be different (dawn warm, noon bright, dusk coral)
		expect(dawn).not.toBe(noon);
		expect(noon).not.toBe(dusk);
	});

	it('handles different base sky colors', () => {
		const daylight = calculateDaylight(0.5, 0.5);
		const summer = skyColor(daylight, '#fffde7');
		const frost = skyColor(daylight, '#eceff1');
		expect(summer).not.toBe(frost);
	});
});

// ── atmosphereFilter ──────────────────────────────────────────────────────

describe('atmosphereFilter', () => {
	it('returns "none" or a valid CSS filter string', () => {
		const daylight = calculateDaylight(0.5, 0.0);
		const filter = atmosphereFilter(daylight);
		// With 0 warmth at noon, there may be a small sepia, or "none"
		expect(typeof filter).toBe('string');
	});

	it('includes brightness when not at noon', () => {
		const dawn = calculateDaylight(0, 0.5);
		const filter = atmosphereFilter(dawn);
		expect(filter).toContain('brightness');
	});

	it('includes sepia when warmth is nonzero', () => {
		const noon = calculateDaylight(0.5, 0.8);
		const filter = atmosphereFilter(noon);
		expect(filter).toContain('sepia');
	});
});

// ── plantShadow ───────────────────────────────────────────────────────────

describe('plantShadow', () => {
	it('returns expected shape', () => {
		const daylight = calculateDaylight(0.5, 0.5);
		const shadow = plantShadow(daylight, 1);
		expect(shadow).toHaveProperty('offsetX');
		expect(shadow).toHaveProperty('scaleY');
		expect(shadow).toHaveProperty('opacity');
	});

	it('shadow is centered at noon', () => {
		const daylight = calculateDaylight(0.5, 0.5);
		const shadow = plantShadow(daylight, 1);
		expect(shadow.offsetX).toBeCloseTo(0, 1);
	});

	it('shadow offset is negative (west) at dawn, positive (east) at dusk', () => {
		const dawn = plantShadow(calculateDaylight(0, 0.5), 1);
		const dusk = plantShadow(calculateDaylight(1, 0.5), 1);
		expect(dawn.offsetX).toBeLessThan(0);
		expect(dusk.offsetX).toBeGreaterThan(0);
	});

	it('shadow scaleY is flattest at noon', () => {
		const dawn = plantShadow(calculateDaylight(0, 0.5), 1);
		const noon = plantShadow(calculateDaylight(0.5, 0.5), 1);
		expect(noon.scaleY).toBeLessThan(dawn.scaleY);
	});

	it('scales with plantScale', () => {
		const daylight = calculateDaylight(0.3, 0.5);
		const small = plantShadow(daylight, 0.5);
		const large = plantShadow(daylight, 2.0);
		expect(Math.abs(large.offsetX)).toBeGreaterThan(Math.abs(small.offsetX));
	});
});

// ── heliotropism ──────────────────────────────────────────────────────────

describe('heliotropism', () => {
	it('leans left at dawn', () => {
		const daylight = calculateDaylight(0, 0.5);
		const lean = heliotropism(daylight, 5);
		expect(lean).toBeLessThan(0);
		expect(lean).toBeCloseTo(-5, 1);
	});

	it('upright at noon', () => {
		const daylight = calculateDaylight(0.5, 0.5);
		const lean = heliotropism(daylight, 5);
		expect(lean).toBeCloseTo(0, 1);
	});

	it('leans right at dusk', () => {
		const daylight = calculateDaylight(1, 0.5);
		const lean = heliotropism(daylight, 5);
		expect(lean).toBeGreaterThan(0);
		expect(lean).toBeCloseTo(5, 1);
	});

	it('amplitude scales the lean', () => {
		const daylight = calculateDaylight(0, 0.5);
		const small = heliotropism(daylight, 3);
		const large = heliotropism(daylight, 8);
		expect(Math.abs(large)).toBeGreaterThan(Math.abs(small));
	});

	it('returns zero with zero amplitude', () => {
		const daylight = calculateDaylight(0.3, 0.5);
		expect(heliotropism(daylight, 0)).toBeCloseTo(0, 10);
	});
});
