/**
 * Pure helper functions for the PlotDetailPanel component.
 *
 * Extracted for testability — these handle soil value normalization,
 * bar coloring, and display formatting.
 */

import type { SoilState, PendingAmendment } from '$lib/engine/ecs/components.js';

// ── Soil row configuration ──────────────────────────────────────────

export interface SoilRow {
	label: string;
	key: keyof SoilState;
	inverted?: boolean;
}

export const SOIL_ROWS: SoilRow[] = [
	{ label: 'pH', key: 'ph' },
	{ label: 'Nitrogen', key: 'nitrogen' },
	{ label: 'Phosphorus', key: 'phosphorus' },
	{ label: 'Potassium', key: 'potassium' },
	{ label: 'Organic Matter', key: 'organic_matter' },
	{ label: 'Moisture', key: 'moisture' },
	{ label: 'Compaction', key: 'compaction', inverted: true },
	{ label: 'Biology', key: 'biology' },
];

// ── Normalization + coloring ────────────────────────────────────────

/**
 * Compute a 0–1 "goodness" score for color thresholds.
 * pH uses distance from neutral (6.5); compaction is inverted
 * (lower is better); all others map directly from 0–1 soil scale.
 */
export function normalizeForColor(
	key: keyof SoilState,
	value: number,
	inverted?: boolean,
): number {
	if (key === 'ph') {
		return Math.max(0, 1 - Math.abs(value - 6.5) / 3.5);
	}
	if (inverted) {
		return Math.max(0, Math.min(1, 1 - value));
	}
	return Math.max(0, Math.min(1, value));
}

/** Bar color class: green >=0.6, yellow 0.3–0.6, red <0.3. */
export function barColor(normalized: number): string {
	if (normalized >= 0.6) return 'bar-good';
	if (normalized >= 0.3) return 'bar-moderate';
	return 'bar-poor';
}

/** Bar width as a percentage. pH maps 3–10; others are already 0–1. */
export function barWidth(key: keyof SoilState, value: number): number {
	if (key === 'ph') {
		return Math.max(2, Math.min(100, ((value - 3) / 7) * 100));
	}
	return Math.max(2, Math.min(100, value * 100));
}

/** Format a soil value for display. pH shows 1 decimal; others as integer percentage. */
export function displayValue(key: keyof SoilState, value: number): string {
	if (key === 'ph') return value.toFixed(1);
	return Math.round(value * 100).toString();
}

// ── General formatting ──────────────────────────────────────────────

/** Convert a snake_case identifier to Title Case. */
export function titleCase(s: string): string {
	return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compute weeks remaining until an amendment takes effect. */
export function weeksRemaining(amendment: PendingAmendment, currentWeek: number): number {
	return Math.max(0, amendment.applied_week + amendment.effect_delay_weeks - currentWeek);
}
