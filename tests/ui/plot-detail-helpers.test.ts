import { describe, it, expect } from 'vitest';
import {
	SOIL_ROWS,
	normalizeForColor,
	barColor,
	barWidth,
	displayValue,
	titleCase,
	weeksRemaining,
} from '../../src/lib/ui/plot-detail-helpers.js';
import type { PendingAmendment } from '../../src/lib/engine/ecs/components.js';

// ── SOIL_ROWS configuration ────────────────────────────────────────

describe('SOIL_ROWS', () => {
	it('includes all expected soil properties', () => {
		const keys = SOIL_ROWS.map((r) => r.key);
		expect(keys).toEqual([
			'ph',
			'nitrogen',
			'phosphorus',
			'potassium',
			'organic_matter',
			'moisture',
			'compaction',
			'biology',
		]);
	});

	it('marks compaction as inverted', () => {
		const compaction = SOIL_ROWS.find((r) => r.key === 'compaction');
		expect(compaction?.inverted).toBe(true);
	});

	it('does not mark other rows as inverted', () => {
		const nonCompaction = SOIL_ROWS.filter((r) => r.key !== 'compaction');
		for (const row of nonCompaction) {
			expect(row.inverted).toBeFalsy();
		}
	});
});

// ── normalizeForColor ───────────────────────────────────────────────

describe('normalizeForColor', () => {
	describe('pH (distance from 6.5)', () => {
		it('returns 1.0 for neutral pH 6.5', () => {
			expect(normalizeForColor('ph', 6.5)).toBeCloseTo(1.0);
		});

		it('returns ~0.86 for slightly acidic pH 6.0', () => {
			// 1 - |6.0 - 6.5| / 3.5 = 1 - 0.5/3.5 ≈ 0.857
			expect(normalizeForColor('ph', 6.0)).toBeCloseTo(0.857, 2);
		});

		it('returns 0 for extreme pH 3.0', () => {
			expect(normalizeForColor('ph', 3.0)).toBe(0);
		});

		it('returns 0 for extreme pH 10.0', () => {
			expect(normalizeForColor('ph', 10.0)).toBe(0);
		});

		it('returns moderate value for pH 5.0', () => {
			// 1 - |5.0 - 6.5| / 3.5 = 1 - 1.5/3.5 ≈ 0.571
			const result = normalizeForColor('ph', 5.0);
			expect(result).toBeCloseTo(0.571, 2);
		});
	});

	describe('inverted values (compaction)', () => {
		it('returns 1.0 for compaction = 0 (no compaction)', () => {
			expect(normalizeForColor('compaction', 0, true)).toBe(1);
		});

		it('returns 0.0 for compaction = 1 (fully compacted)', () => {
			expect(normalizeForColor('compaction', 1, true)).toBe(0);
		});

		it('returns 0.8 for compaction = 0.2', () => {
			expect(normalizeForColor('compaction', 0.2, true)).toBeCloseTo(0.8);
		});
	});

	describe('standard 0–1 values', () => {
		it('returns the raw value for nitrogen', () => {
			expect(normalizeForColor('nitrogen', 0.7)).toBe(0.7);
		});

		it('clamps negative values to 0', () => {
			expect(normalizeForColor('moisture', -0.1)).toBe(0);
		});

		it('clamps values above 1 to 1', () => {
			expect(normalizeForColor('biology', 1.5)).toBe(1);
		});
	});
});

// ── barColor ────────────────────────────────────────────────────────

describe('barColor', () => {
	it('returns bar-good for values >= 0.6', () => {
		expect(barColor(0.6)).toBe('bar-good');
		expect(barColor(0.9)).toBe('bar-good');
		expect(barColor(1.0)).toBe('bar-good');
	});

	it('returns bar-moderate for values 0.3–0.6', () => {
		expect(barColor(0.3)).toBe('bar-moderate');
		expect(barColor(0.45)).toBe('bar-moderate');
		expect(barColor(0.59)).toBe('bar-moderate');
	});

	it('returns bar-poor for values < 0.3', () => {
		expect(barColor(0.0)).toBe('bar-poor');
		expect(barColor(0.15)).toBe('bar-poor');
		expect(barColor(0.29)).toBe('bar-poor');
	});
});

// ── barWidth ────────────────────────────────────────────────────────

describe('barWidth', () => {
	it('maps pH from 3–10 range to percentage', () => {
		expect(barWidth('ph', 3)).toBe(2); // minimum clamp
		expect(barWidth('ph', 6.5)).toBe(50);
		expect(barWidth('ph', 10)).toBe(100);
	});

	it('maps 0–1 values to percentage for nutrients', () => {
		expect(barWidth('nitrogen', 0)).toBe(2); // minimum clamp
		expect(barWidth('nitrogen', 0.5)).toBe(50);
		expect(barWidth('nitrogen', 1.0)).toBe(100);
	});

	it('clamps to minimum 2% width', () => {
		expect(barWidth('phosphorus', 0)).toBe(2);
		expect(barWidth('ph', 3)).toBe(2);
	});

	it('clamps to maximum 100%', () => {
		expect(barWidth('moisture', 1.5)).toBe(100);
	});
});

// ── displayValue ────────────────────────────────────────────────────

describe('displayValue', () => {
	it('formats pH with one decimal', () => {
		expect(displayValue('ph', 6.5)).toBe('6.5');
		expect(displayValue('ph', 7.0)).toBe('7.0');
		expect(displayValue('ph', 5.23)).toBe('5.2');
	});

	it('formats other values as integer percentages', () => {
		expect(displayValue('nitrogen', 0.5)).toBe('50');
		expect(displayValue('moisture', 0.75)).toBe('75');
		expect(displayValue('biology', 0.0)).toBe('0');
		expect(displayValue('compaction', 1.0)).toBe('100');
	});

	it('rounds to nearest integer for non-pH values', () => {
		expect(displayValue('potassium', 0.456)).toBe('46');
		expect(displayValue('organic_matter', 0.333)).toBe('33');
	});
});

// ── titleCase ───────────────────────────────────────────────────────

describe('titleCase', () => {
	it('converts snake_case to Title Case', () => {
		expect(titleCase('tomato_cherokee_purple')).toBe('Tomato Cherokee Purple');
	});

	it('handles single words', () => {
		expect(titleCase('basil')).toBe('Basil');
	});

	it('handles already capitalized input', () => {
		expect(titleCase('Tomato')).toBe('Tomato');
	});
});

// ── weeksRemaining ──────────────────────────────────────────────────

describe('weeksRemaining', () => {
	const makeAmendment = (
		applied_week: number,
		effect_delay_weeks: number,
	): PendingAmendment => ({
		type: 'compost',
		applied_week,
		effect_delay_weeks,
		effects: { nitrogen: 0.1 },
	});

	it('computes positive weeks remaining', () => {
		const amendment = makeAmendment(3, 4);
		// applied_week(3) + effect_delay_weeks(4) - currentWeek(5) = 2
		expect(weeksRemaining(amendment, 5)).toBe(2);
	});

	it('returns 0 when amendment is ready', () => {
		const amendment = makeAmendment(3, 4);
		// 3 + 4 - 7 = 0
		expect(weeksRemaining(amendment, 7)).toBe(0);
	});

	it('returns 0 when past the ready week (never negative)', () => {
		const amendment = makeAmendment(1, 2);
		// 1 + 2 - 10 = -7 → clamped to 0
		expect(weeksRemaining(amendment, 10)).toBe(0);
	});

	it('returns full delay when applied this week', () => {
		const amendment = makeAmendment(5, 3);
		// 5 + 3 - 5 = 3
		expect(weeksRemaining(amendment, 5)).toBe(3);
	});
});
