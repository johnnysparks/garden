/**
 * Placeholder HUD stores for the garden heads-up display.
 *
 * Reactive state objects for season tracking, energy budget, and weather.
 * Currently populated with test data; will be wired to real game state later.
 */

import type { WeekWeather } from '../engine/weather-gen.js';
import type { SeasonId } from '../render/palette.js';

// ── Turn phase state ────────────────────────────────────────────────

/** Weekly cycle phases. */
export type TurnPhase = 'DAWN' | 'PLAN' | 'ACT' | 'DUSK' | 'ADVANCE';

export const turn = $state({
	phase: 'ACT' as TurnPhase,
});

// ── Season state ────────────────────────────────────────────────────

export const season = $state({
	week: 14,
	totalWeeks: 30,
	frostStartWeek: 24,
});

// ── Energy state ────────────────────────────────────────────────────

export const energy = $state({
	current: 4,
	max: 5,
});

// ── Weather state ───────────────────────────────────────────────────

export const weather: {
	current: WeekWeather;
	next: WeekWeather | null;
	scouted: boolean;
} = $state({
	current: {
		week: 14,
		temp_high_c: 28,
		temp_low_c: 16,
		precipitation_mm: 2.4,
		humidity: 0.55,
		wind: 'light',
		frost: false,
		special: null,
	},
	next: null,
	scouted: false,
});

// ── Frost state ─────────────────────────────────────────────────────

export const frost = $state({
	active: false,
	killedPlants: [] as string[], // species IDs of killed plants
});

// ── Helpers ─────────────────────────────────────────────────────────

/** Map a week number (0-29) to a season identifier. */
export function weekToSeasonId(week: number): SeasonId {
	if (week < 5) return 'early_spring';
	if (week < 10) return 'late_spring';
	if (week < 15) return 'summer';
	if (week < 20) return 'late_summer';
	if (week < 25) return 'early_fall';
	if (week < 28) return 'late_fall';
	return 'frost';
}

const SEASON_LABELS: Record<SeasonId, string> = {
	early_spring: 'Early Spring',
	late_spring: 'Late Spring',
	summer: 'Summer',
	late_summer: 'Late Summer',
	early_fall: 'Early Fall',
	late_fall: 'Late Fall',
	frost: 'Frost',
};

/** Human-friendly season name from a SeasonId. */
export function seasonLabel(id: SeasonId): string {
	return SEASON_LABELS[id];
}

/** Pick a weather icon string for a given week's weather. */
export function weatherIcon(w: WeekWeather): string {
	if (w.frost) return '\u2744\uFE0F';
	if (w.special?.type === 'heatwave') return '\uD83D\uDD25';
	if (w.special?.type === 'heavy_rain') return '\u26C8\uFE0F';
	if (w.special?.type === 'hail') return '\uD83C\uDF28\uFE0F';
	if (w.special?.type === 'drought') return '\u2600\uFE0F';
	if (w.precipitation_mm > 15) return '\uD83C\uDF27\uFE0F';
	if (w.precipitation_mm > 5) return '\uD83C\uDF26\uFE0F';
	return '\u2600\uFE0F';
}

/** Short weather description from a WeekWeather. */
export function weatherDescription(w: WeekWeather): string {
	if (w.frost) return 'Frost';
	if (w.special?.type === 'heatwave') return 'Heatwave';
	if (w.special?.type === 'heavy_rain') return 'Heavy Rain';
	if (w.special?.type === 'hail') return 'Hail';
	if (w.special?.type === 'drought') return 'Drought';
	if (w.precipitation_mm > 15) return 'Rainy';
	if (w.precipitation_mm > 5) return 'Showers';
	if (w.precipitation_mm > 1) return 'Partly Cloudy';
	return 'Sunny';
}
