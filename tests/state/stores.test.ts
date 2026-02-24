/**
 * Tests for Svelte stores (state/stores.ts).
 *
 * Covers dispatch, replayAndSync, setEventLog, resetState,
 * and derived store projections (currentWeek, isRunActive, plants,
 * harvests, diagnoses, harvestedSpecies).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	gameState,
	dispatch,
	replayAndSync,
	getEventLog,
	setEventLog,
	resetState,
	currentWeek,
	isRunActive,
	plants,
	harvests,
	diagnoses,
	runSeed,
	runZone,
	harvestedSpecies,
} from '../../src/lib/state/stores.js';
import type { GameEvent } from '../../src/lib/state/events.js';

// ── Helpers ──────────────────────────────────────────────────────────

beforeEach(() => {
	resetState();
});

// ── dispatch ─────────────────────────────────────────────────────────

describe('dispatch', () => {
	it('appends events to the log and updates gameState', () => {
		dispatch({ type: 'RUN_START', seed: 42, zone: 'zone_8a' });

		const state = get(gameState);
		expect(state.started).toBe(true);
		expect(state.seed).toBe(42);
		expect(state.zone).toBe('zone_8a');
	});

	it('returns the updated RunState', () => {
		const state = dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
		expect(state.started).toBe(true);
		expect(state.seed).toBe(1);
	});

	it('handles a sequence of events', () => {
		dispatch({ type: 'RUN_START', seed: 10, zone: 'zone_8a' });
		dispatch({ type: 'ADVANCE_WEEK' });
		dispatch({
			type: 'PLANT',
			species_id: 'tomato_cherokee_purple',
			plot: [0, 0],
			week: 1,
		});

		const state = get(gameState);
		expect(state.currentWeek).toBe(1);
		expect(state.plants).toHaveLength(1);
	});
});

// ── getEventLog ──────────────────────────────────────────────────────

describe('getEventLog', () => {
	it('returns the current event log instance', () => {
		dispatch({ type: 'RUN_START', seed: 42, zone: 'z' });
		const log = getEventLog();
		expect(log.length).toBe(1);
		expect(log.entries[0].event.type).toBe('RUN_START');
	});
});

// ── setEventLog ──────────────────────────────────────────────────────

describe('setEventLog', () => {
	it('replaces the event log and syncs stores', () => {
		dispatch({ type: 'RUN_START', seed: 1, zone: 'a' });
		dispatch({ type: 'ADVANCE_WEEK' });

		// Replace with a different log
		const newEvents: GameEvent[] = [
			{ type: 'RUN_START', seed: 99, zone: 'b' },
			{ type: 'ADVANCE_WEEK' },
			{ type: 'ADVANCE_WEEK' },
			{ type: 'ADVANCE_WEEK' },
		];
		setEventLog(newEvents);

		const state = get(gameState);
		expect(state.seed).toBe(99);
		expect(state.zone).toBe('b');
		expect(state.currentWeek).toBe(3);
	});

	it('returns the new state', () => {
		const state = setEventLog([
			{ type: 'RUN_START', seed: 55, zone: 'test' },
		]);
		expect(state.seed).toBe(55);
		expect(state.started).toBe(true);
	});
});

// ── resetState ───────────────────────────────────────────────────────

describe('resetState', () => {
	it('resets to empty state', () => {
		dispatch({ type: 'RUN_START', seed: 42, zone: 'z' });
		dispatch({ type: 'ADVANCE_WEEK' });
		dispatch({
			type: 'PLANT',
			species_id: 'tomato',
			plot: [0, 0],
			week: 1,
		});

		resetState();

		const state = get(gameState);
		expect(state.started).toBe(false);
		expect(state.currentWeek).toBe(0);
		expect(state.plants).toHaveLength(0);
		expect(state.seed).toBe(0);
	});
});

// ── replayAndSync ────────────────────────────────────────────────────

describe('replayAndSync', () => {
	it('replays the full log and syncs the store', () => {
		dispatch({ type: 'RUN_START', seed: 42, zone: 'z' });
		dispatch({ type: 'ADVANCE_WEEK' });
		dispatch({ type: 'ADVANCE_WEEK' });

		const state = replayAndSync();
		expect(state.currentWeek).toBe(2);
		expect(get(gameState)).toEqual(state);
	});
});

// ── Derived stores ───────────────────────────────────────────────────

describe('derived stores', () => {
	describe('currentWeek', () => {
		it('starts at 0', () => {
			expect(get(currentWeek)).toBe(0);
		});

		it('reflects week advances', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({ type: 'ADVANCE_WEEK' });
			dispatch({ type: 'ADVANCE_WEEK' });
			expect(get(currentWeek)).toBe(2);
		});
	});

	describe('isRunActive', () => {
		it('is false before run starts', () => {
			expect(get(isRunActive)).toBe(false);
		});

		it('is true during an active run', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			expect(get(isRunActive)).toBe(true);
		});

		it('is false after run ends', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({ type: 'RUN_END', reason: 'frost' });
			expect(get(isRunActive)).toBe(false);
		});
	});

	describe('plants', () => {
		it('starts empty', () => {
			expect(get(plants)).toHaveLength(0);
		});

		it('reflects planted species', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({
				type: 'PLANT',
				species_id: 'tomato_cherokee_purple',
				plot: [0, 0],
				week: 1,
			});
			dispatch({
				type: 'PLANT',
				species_id: 'basil_genovese',
				plot: [1, 0],
				week: 1,
			});

			const p = get(plants);
			expect(p).toHaveLength(2);
			expect(p[0].species_id).toBe('tomato_cherokee_purple');
			expect(p[1].species_id).toBe('basil_genovese');
		});
	});

	describe('harvests', () => {
		it('tracks harvest events', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({
				type: 'HARVEST',
				plant_id: 'tomato@0,0',
				week: 14,
			});

			const h = get(harvests);
			expect(h).toHaveLength(1);
			expect(h[0].plant_id).toBe('tomato@0,0');
			expect(h[0].week).toBe(14);
		});
	});

	describe('diagnoses', () => {
		it('tracks diagnosis events', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({
				type: 'DIAGNOSE',
				plant_id: 'tomato@0,0',
				hypothesis: 'early_blight',
				week: 5,
			});

			const d = get(diagnoses);
			expect(d).toHaveLength(1);
			expect(d[0].hypothesis).toBe('early_blight');
		});
	});

	describe('runSeed / runZone', () => {
		it('reflects the run config', () => {
			dispatch({ type: 'RUN_START', seed: 123, zone: 'zone_7b' });
			expect(get(runSeed)).toBe(123);
			expect(get(runZone)).toBe('zone_7b');
		});
	});

	describe('harvestedSpecies', () => {
		it('starts as empty set', () => {
			expect(get(harvestedSpecies).size).toBe(0);
		});

		it('tracks unique species harvested via plant_id matching', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({
				type: 'PLANT',
				species_id: 'tomato_cherokee_purple',
				plot: [0, 0],
				week: 1,
			});
			dispatch({
				type: 'PLANT',
				species_id: 'basil_genovese',
				plot: [1, 0],
				week: 1,
			});
			// Harvest the tomato
			dispatch({
				type: 'HARVEST',
				plant_id: 'tomato_cherokee_purple@0,0',
				week: 14,
			});

			const hs = get(harvestedSpecies);
			expect(hs.has('tomato_cherokee_purple')).toBe(true);
			expect(hs.has('basil_genovese')).toBe(false);
		});

		it('deduplicates multiple harvests of the same species', () => {
			dispatch({ type: 'RUN_START', seed: 1, zone: 'z' });
			dispatch({
				type: 'PLANT',
				species_id: 'tomato_cherokee_purple',
				plot: [0, 0],
				week: 1,
			});
			dispatch({
				type: 'HARVEST',
				plant_id: 'tomato_cherokee_purple@0,0',
				week: 14,
			});
			dispatch({
				type: 'HARVEST',
				plant_id: 'tomato_cherokee_purple@0,0',
				week: 16,
			});

			const hs = get(harvestedSpecies);
			expect(hs.size).toBe(1);
		});
	});
});
