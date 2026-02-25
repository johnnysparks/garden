/**
 * Tests for Dexie persistence layer.
 *
 * Uses fake-indexeddb to run Dexie in Node without a browser.
 * Covers: save/load round-trip, lifetime stats, DB schema.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GameEvent } from '../../src/lib/state/events.js';
import { createEventLog } from '../../src/lib/state/event-log.js';
import {
  PerennialDB,
  setDB,
  closeDB,
  saveCurrentRun,
  loadCurrentRun,
  deleteCurrentRun,
  getLifetimeStats,
  updateLifetimeStats,
  createDefaultStats,
} from '../../src/lib/state/save-load.js';

// ── Helpers ─────────────────────────────────────────────────────────

let testDb: PerennialDB;
let dbCounter = 0;

beforeEach(() => {
  // Each test gets a fresh DB with a unique name
  testDb = new PerennialDB(`TestDB_${++dbCounter}`);
  setDB(testDb);
});

afterEach(async () => {
  await closeDB();
  await testDb.delete();
});

// ── Fixtures ────────────────────────────────────────────────────────

function sampleEvents(): GameEvent[] {
  return [
    { type: 'RUN_START', seed: 42, zone: 'zone_8a' },
    { type: 'ADVANCE_WEEK' },
    { type: 'PLANT', species_id: 'tomato_cherokee_purple', plot: [1, 2], week: 1 },
    { type: 'ADVANCE_WEEK' },
    { type: 'AMEND', amendment: 'compost', plot: [1, 2], week: 2 },
    { type: 'SCOUT', target: 'weather', week: 2 },
    { type: 'ADVANCE_WEEK' },
    { type: 'DIAGNOSE', plant_id: 'tomato@1,2', hypothesis: 'early_blight', week: 3 },
    { type: 'HARVEST', plant_id: 'tomato@1,2', week: 3 },
    { type: 'RUN_END', reason: 'frost' },
  ];
}

// ── Save / Load round-trip ──────────────────────────────────────────

describe('save/load round-trip', () => {
  it('saves and loads a current run', async () => {
    const events = sampleEvents();
    await saveCurrentRun(events, 42, 'zone_8a');

    const loaded = await loadCurrentRun();
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe('current');
    expect(loaded!.seed).toBe(42);
    expect(loaded!.zone).toBe('zone_8a');
    expect(loaded!.eventLog).toEqual(events);
  });

  it('reconstructs identical state from loaded events', async () => {
    const events = sampleEvents();

    // Build state from events
    const originalLog = createEventLog(events);
    const originalState = originalLog.state;

    // Save to DB
    await saveCurrentRun(events, 42, 'zone_8a');

    // Load from DB
    const loaded = await loadCurrentRun();
    expect(loaded).toBeDefined();

    // Reconstruct state from loaded events
    const restoredLog = createEventLog(loaded!.eventLog);
    const restoredState = restoredLog.state;

    expect(restoredState).toEqual(originalState);
  });

  it('overwrites on second save', async () => {
    const events1 = [
      { type: 'RUN_START', seed: 1, zone: 'zone_8a' } as GameEvent,
    ];
    const events2 = [
      { type: 'RUN_START', seed: 2, zone: 'zone_7b' } as GameEvent,
    ];

    await saveCurrentRun(events1, 1, 'zone_8a');
    await saveCurrentRun(events2, 2, 'zone_7b');

    const loaded = await loadCurrentRun();
    expect(loaded!.seed).toBe(2);
    expect(loaded!.zone).toBe('zone_7b');
    expect(loaded!.eventLog).toEqual(events2);
  });

  it('returns undefined when no save exists', async () => {
    const loaded = await loadCurrentRun();
    expect(loaded).toBeUndefined();
  });

  it('deletes a saved run', async () => {
    await saveCurrentRun(sampleEvents(), 42, 'zone_8a');
    await deleteCurrentRun();

    const loaded = await loadCurrentRun();
    expect(loaded).toBeUndefined();
  });

  it('round-trips events with all event types', async () => {
    const events: GameEvent[] = [
      { type: 'RUN_START', seed: 123, zone: 'zone_6a' },
      { type: 'ADVANCE_WEEK' },
      { type: 'PLANT', species_id: 'basil_genovese', plot: [0, 0], week: 1 },
      { type: 'AMEND', amendment: 'lime', plot: [0, 0], week: 1 },
      { type: 'SCOUT', target: 'pests', week: 1 },
      { type: 'DIAGNOSE', plant_id: 'basil@0,0', hypothesis: 'powdery_mildew', week: 1 },
      { type: 'INTERVENE', plant_id: 'basil@0,0', action: 'treat', target_condition: 'powdery_mildew', week: 1 },
      { type: 'HARVEST', plant_id: 'basil@0,0', week: 1 },
      { type: 'ADVANCE_WEEK' },
      { type: 'RUN_END', reason: 'abandon' },
    ];

    await saveCurrentRun(events, 123, 'zone_6a');
    const loaded = await loadCurrentRun();

    expect(loaded!.eventLog).toEqual(events);

    // Verify state reconstruction
    const originalState = createEventLog(events).state;
    const restoredState = createEventLog(loaded!.eventLog).state;
    expect(restoredState).toEqual(originalState);
  });
});

// ── Lifetime stats ──────────────────────────────────────────────────

describe('lifetime stats', () => {
  it('returns default stats when none exist', async () => {
    const stats = await getLifetimeStats();
    expect(stats).toEqual(createDefaultStats());
  });

  it('updates stats', async () => {
    await updateLifetimeStats((s) => ({
      ...s,
      total_runs: 5,
      total_harvests: 20,
    }));

    const stats = await getLifetimeStats();
    expect(stats.total_runs).toBe(5);
    expect(stats.total_harvests).toBe(20);
  });

  it('preserves fields not updated', async () => {
    await updateLifetimeStats((s) => ({
      ...s,
      total_runs: 1,
    }));
    await updateLifetimeStats((s) => ({
      ...s,
      total_harvests: 10,
    }));

    const stats = await getLifetimeStats();
    expect(stats.total_runs).toBe(1);
    expect(stats.total_harvests).toBe(10);
  });

  it('tracks best scores by zone', async () => {
    await updateLifetimeStats((s) => ({
      ...s,
      best_scores_by_zone: { zone_8a: 150 },
    }));

    const stats = await getLifetimeStats();
    expect(stats.best_scores_by_zone).toEqual({ zone_8a: 150 });
  });
});

// ── DB schema tables ────────────────────────────────────────────────

describe('DB schema', () => {
  it('has all required tables', () => {
    const tableNames = testDb.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      'currentRun',
      'journal',
      'lifetimeStats',
      'perennials',
      'runHistory',
      'seedBank',
      'unlockedTools',
      'unlockedZones',
    ]);
  });

  it('seed bank CRUD works', async () => {
    await testDb.seedBank.put({
      speciesId: 'tomato_cherokee_purple',
      cultivars: ['Cherokee Purple'],
      discovered_week: 14,
    });

    const entry = await testDb.seedBank.get('tomato_cherokee_purple');
    expect(entry).toBeDefined();
    expect(entry!.cultivars).toEqual(['Cherokee Purple']);
  });

  it('journal CRUD works', async () => {
    await testDb.journal.put({
      entryId: 'entry_1',
      type: 'species_page',
      content: 'Tomato notes',
      run: 1,
      week: 10,
    });

    const entry = await testDb.journal.get('entry_1');
    expect(entry).toBeDefined();
    expect(entry!.content).toBe('Tomato notes');
  });

  it('run history auto-increments', async () => {
    const id1 = await testDb.runHistory.add({
      zone: 'zone_8a',
      score: 100,
      seed: 1,
      weeks_survived: 20,
      end_reason: 'frost',
      species_planted: ['tomato'],
      species_harvested: ['tomato'],
      timestamp: Date.now(),
    });

    const id2 = await testDb.runHistory.add({
      zone: 'zone_7b',
      score: 150,
      seed: 2,
      weeks_survived: 25,
      end_reason: 'abandon',
      species_planted: ['basil'],
      species_harvested: [],
      timestamp: Date.now(),
    });

    expect(id2).toBeGreaterThan(id1 as number);

    const all = await testDb.runHistory.toArray();
    expect(all).toHaveLength(2);
  });

  it('unlocked zones CRUD works', async () => {
    await testDb.unlockedZones.put({
      zoneId: 'zone_8a',
      best_score: 200,
      runs_completed: 3,
    });

    const zone = await testDb.unlockedZones.get('zone_8a');
    expect(zone!.best_score).toBe(200);
    expect(zone!.runs_completed).toBe(3);
  });

  it('unlocked tools CRUD works', async () => {
    await testDb.unlockedTools.put({
      toolId: 'soil_test_kit',
      unlock_date: '2025-06-15T00:00:00Z',
    });

    const tool = await testDb.unlockedTools.get('soil_test_kit');
    expect(tool!.toolId).toBe('soil_test_kit');
  });
});
