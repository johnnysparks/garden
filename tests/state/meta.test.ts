/**
 * Tests for meta-progression stores.
 *
 * Covers: seed bank updates from run events, journal entries,
 * zone unlocks, lifetime stats accumulation, processRunEnd integration.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import type { GameEvent } from '../../src/lib/state/events.js';
import { createEventLog, type RunState } from '../../src/lib/state/event-log.js';
import {
  PerennialDB,
  setDB,
  closeDB,
  createDefaultStats,
} from '../../src/lib/state/save-load.js';
import {
  seedBank,
  journal,
  unlockedZones,
  unlockedTools,
  lifetimeStats,
  runHistory,
  loadMetaProgression,
  addToSeedBank,
  addCultivar,
  addJournalEntry,
  unlockZone,
  unlockTool,
  processRunEnd,
} from '../../src/lib/state/meta.js';

// ── Setup / Teardown ────────────────────────────────────────────────

let testDb: PerennialDB;
let dbCounter = 0;

beforeEach(() => {
  testDb = new PerennialDB(`TestMetaDB_${++dbCounter}`);
  setDB(testDb);

  // Reset stores to defaults
  seedBank.set([]);
  journal.set([]);
  unlockedZones.set([]);
  unlockedTools.set([]);
  lifetimeStats.set(createDefaultStats());
  runHistory.set([]);
});

afterEach(async () => {
  await closeDB();
  await testDb.delete();
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 42,
    zone: 'zone_8a',
    currentWeek: 20,
    started: true,
    ended: true,
    endReason: 'frost',
    plants: [
      { species_id: 'tomato_cherokee_purple', plot: [1, 2], week: 1 },
      { species_id: 'basil_genovese', plot: [0, 0], week: 2 },
    ],
    amendments: [{ amendment: 'compost', plot: [1, 2], week: 1 }],
    diagnoses: [
      {
        plant_id: 'tomato_cherokee_purple@1,2',
        hypothesis: 'early_blight',
        week: 5,
      },
    ],
    interventions: [
      { plant_id: 'tomato_cherokee_purple@1,2', action: 'prune', target_condition: 'early_blight', week: 5 },
    ],
    harvests: [{ plant_id: 'tomato_cherokee_purple@1,2', week: 14 }],
    scouts: [{ target: 'weather', week: 3 }],
    ...overrides,
  };
}

// ── Seed bank tests ─────────────────────────────────────────────────

describe('seed bank', () => {
  it('adds a new species to the seed bank', async () => {
    await addToSeedBank('tomato_cherokee_purple', 14);

    const bank = get(seedBank);
    expect(bank).toHaveLength(1);
    expect(bank[0].speciesId).toBe('tomato_cherokee_purple');
    expect(bank[0].discovered_week).toBe(14);
    expect(bank[0].cultivars).toEqual([]);
  });

  it('does not duplicate species', async () => {
    await addToSeedBank('tomato_cherokee_purple', 14);
    await addToSeedBank('tomato_cherokee_purple', 20);

    const bank = get(seedBank);
    expect(bank).toHaveLength(1);
    // Keeps original discovery week
    expect(bank[0].discovered_week).toBe(14);
  });

  it('adds cultivars to existing species', async () => {
    await addToSeedBank('tomato_cherokee_purple', 14);
    await addCultivar('tomato_cherokee_purple', 'San Marzano');

    const bank = get(seedBank);
    expect(bank[0].cultivars).toEqual(['San Marzano']);
  });

  it('does not duplicate cultivars', async () => {
    await addToSeedBank('tomato_cherokee_purple', 14);
    await addCultivar('tomato_cherokee_purple', 'San Marzano');
    await addCultivar('tomato_cherokee_purple', 'San Marzano');

    const bank = get(seedBank);
    expect(bank[0].cultivars).toEqual(['San Marzano']);
  });

  it('persists to DB', async () => {
    await addToSeedBank('basil_genovese', 10);

    const dbEntry = await testDb.seedBank.get('basil_genovese');
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.speciesId).toBe('basil_genovese');
  });
});

// ── Journal tests ───────────────────────────────────────────────────

describe('journal', () => {
  it('adds journal entries', async () => {
    await addJournalEntry({
      entryId: 'entry_1',
      type: 'species_page',
      content: 'Tomato: grows best in full sun',
      run: 1,
      week: 10,
    });

    const entries = get(journal);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('Tomato: grows best in full sun');
  });

  it('persists to DB', async () => {
    await addJournalEntry({
      entryId: 'entry_2',
      type: 'diagnosis_log',
      content: 'Diagnosed early blight on tomato',
      run: 1,
      week: 5,
    });

    const dbEntry = await testDb.journal.get('entry_2');
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.type).toBe('diagnosis_log');
  });
});

// ── Zone unlock tests ───────────────────────────────────────────────

describe('zone unlocks', () => {
  it('unlocks a new zone', async () => {
    await unlockZone('zone_8a', 150);

    const zones = get(unlockedZones);
    expect(zones).toHaveLength(1);
    expect(zones[0].zoneId).toBe('zone_8a');
    expect(zones[0].best_score).toBe(150);
    expect(zones[0].runs_completed).toBe(1);
  });

  it('increments run count on repeated unlocks', async () => {
    await unlockZone('zone_8a', 150);
    await unlockZone('zone_8a', 120);

    const zones = get(unlockedZones);
    expect(zones).toHaveLength(1);
    expect(zones[0].runs_completed).toBe(2);
  });

  it('tracks best score across runs', async () => {
    await unlockZone('zone_8a', 100);
    await unlockZone('zone_8a', 200);
    await unlockZone('zone_8a', 150);

    const zones = get(unlockedZones);
    expect(zones[0].best_score).toBe(200);
  });

  it('tracks multiple zones independently', async () => {
    await unlockZone('zone_8a', 100);
    await unlockZone('zone_7b', 200);

    const zones = get(unlockedZones);
    expect(zones).toHaveLength(2);
  });
});

// ── Tool unlock tests ───────────────────────────────────────────────

describe('tool unlocks', () => {
  it('unlocks a tool', async () => {
    await unlockTool('soil_test_kit');

    const tools = get(unlockedTools);
    expect(tools).toHaveLength(1);
    expect(tools[0].toolId).toBe('soil_test_kit');
    expect(tools[0].unlock_date).toBeTruthy();
  });

  it('does not duplicate tool unlocks', async () => {
    await unlockTool('soil_test_kit');
    await unlockTool('soil_test_kit');

    const tools = get(unlockedTools);
    expect(tools).toHaveLength(1);
  });
});

// ── processRunEnd integration ───────────────────────────────────────

describe('processRunEnd', () => {
  it('updates lifetime stats from run', async () => {
    const runState = makeRunState();
    await processRunEnd(runState, 150);

    const stats = get(lifetimeStats);
    expect(stats.total_runs).toBe(1);
    expect(stats.total_plants_planted).toBe(2);
    expect(stats.total_harvests).toBe(1);
    expect(stats.total_conditions_diagnosed).toBe(1);
    expect(stats.total_species_grown).toBe(2);
  });

  it('adds harvested species to seed bank', async () => {
    const runState = makeRunState();
    await processRunEnd(runState, 100);

    const bank = get(seedBank);
    const speciesIds = bank.map((s) => s.speciesId);
    expect(speciesIds).toContain('tomato_cherokee_purple');
  });

  it('updates zone progress', async () => {
    const runState = makeRunState();
    await processRunEnd(runState, 200);

    const zones = get(unlockedZones);
    expect(zones).toHaveLength(1);
    expect(zones[0].zoneId).toBe('zone_8a');
    expect(zones[0].best_score).toBe(200);
  });

  it('adds season summary to journal', async () => {
    const runState = makeRunState();
    await processRunEnd(runState, 100);

    const entries = get(journal);
    const summaries = entries.filter((e) => e.type === 'season_summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].content).toContain('zone_8a');
    expect(summaries[0].content).toContain('20 weeks');
  });

  it('records run in history', async () => {
    const runState = makeRunState();
    await processRunEnd(runState, 175);

    const history = get(runHistory);
    expect(history).toHaveLength(1);
    expect(history[0].zone).toBe('zone_8a');
    expect(history[0].score).toBe(175);
    expect(history[0].seed).toBe(42);
    expect(history[0].weeks_survived).toBe(20);
    expect(history[0].end_reason).toBe('frost');
  });

  it('accumulates stats across multiple runs', async () => {
    const run1 = makeRunState({ seed: 1 });
    const run2 = makeRunState({
      seed: 2,
      plants: [{ species_id: 'rosemary', plot: [0, 0], week: 1 }],
      harvests: [],
      diagnoses: [],
    });

    await processRunEnd(run1, 100);
    await processRunEnd(run2, 200);

    const stats = get(lifetimeStats);
    expect(stats.total_runs).toBe(2);
    expect(stats.total_plants_planted).toBe(3); // 2 + 1
    expect(stats.total_harvests).toBe(1); // 1 + 0
    expect(stats.total_conditions_diagnosed).toBe(1); // 1 + 0
    expect(stats.best_scores_by_zone['zone_8a']).toBe(200);
  });

  it('best score only increases', async () => {
    const run1 = makeRunState({ seed: 1 });
    const run2 = makeRunState({ seed: 2 });

    await processRunEnd(run1, 300);
    await processRunEnd(run2, 100);

    const stats = get(lifetimeStats);
    expect(stats.best_scores_by_zone['zone_8a']).toBe(300);
  });
});

// ── loadMetaProgression ─────────────────────────────────────────────

describe('loadMetaProgression', () => {
  it('loads empty state from fresh DB', async () => {
    await loadMetaProgression();

    expect(get(seedBank)).toEqual([]);
    expect(get(journal)).toEqual([]);
    expect(get(unlockedZones)).toEqual([]);
    expect(get(unlockedTools)).toEqual([]);
    expect(get(lifetimeStats)).toEqual(createDefaultStats());
    expect(get(runHistory)).toEqual([]);
  });

  it('loads previously saved meta-progression', async () => {
    // Seed the DB
    await testDb.seedBank.put({
      speciesId: 'tomato_cherokee_purple',
      cultivars: ['San Marzano'],
      discovered_week: 14,
    });
    await testDb.unlockedZones.put({
      zoneId: 'zone_8a',
      best_score: 250,
      runs_completed: 5,
    });

    // Reset stores
    seedBank.set([]);
    unlockedZones.set([]);

    // Load from DB
    await loadMetaProgression();

    const bank = get(seedBank);
    expect(bank).toHaveLength(1);
    expect(bank[0].speciesId).toBe('tomato_cherokee_purple');

    const zones = get(unlockedZones);
    expect(zones).toHaveLength(1);
    expect(zones[0].best_score).toBe(250);
  });
});

// ── Event-driven meta-progression ───────────────────────────────────

describe('meta-progression updates from run events', () => {
  it('full run flow updates all meta-progression stores', async () => {
    // Simulate a complete run via events
    const events: GameEvent[] = [
      { type: 'RUN_START', seed: 42, zone: 'zone_8a' },
      { type: 'ADVANCE_WEEK' },
      { type: 'PLANT', species_id: 'tomato_cherokee_purple', plot: [1, 2], week: 1 },
      { type: 'PLANT', species_id: 'basil_genovese', plot: [0, 0], week: 1 },
      { type: 'ADVANCE_WEEK' },
      { type: 'AMEND', amendment: 'compost', plot: [1, 2], week: 2 },
      { type: 'ADVANCE_WEEK' },
      { type: 'DIAGNOSE', plant_id: 'tomato_cherokee_purple@1,2', hypothesis: 'early_blight', week: 3 },
      // Several more weeks...
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'ADVANCE_WEEK' },
      { type: 'HARVEST', plant_id: 'tomato_cherokee_purple@1,2', week: 14 },
      { type: 'RUN_END', reason: 'frost' },
    ];

    const log = createEventLog(events);
    const runState = log.state;

    // Process the run end
    await processRunEnd(runState, 175);

    // Verify seed bank updated
    const bank = get(seedBank);
    expect(bank.some((s) => s.speciesId === 'tomato_cherokee_purple')).toBe(true);

    // Verify zone progress
    const zones = get(unlockedZones);
    expect(zones[0].zoneId).toBe('zone_8a');

    // Verify journal entry
    const entries = get(journal);
    expect(entries.some((e) => e.type === 'season_summary')).toBe(true);

    // Verify lifetime stats
    const stats = get(lifetimeStats);
    expect(stats.total_runs).toBe(1);
    expect(stats.total_plants_planted).toBe(2);
    expect(stats.total_harvests).toBe(1);

    // Verify run history
    const history = get(runHistory);
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(175);
  });
});
