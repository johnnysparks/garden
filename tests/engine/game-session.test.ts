/**
 * Integration test for game-session.
 *
 * Creates a session, plants a tomato, advances 5 weeks, and verifies
 * growth has occurred. No UI dependencies.
 */

import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { createGameSession, type GameSession } from '../../src/lib/engine/game-session.js';
import { TOMATO, makeSpeciesLookup } from './fixtures.js';
import type { ClimateZone } from '../../src/lib/engine/weather-gen.js';

// ── Test zone (generous frost-free window so frost doesn't end the run) ──

const TEST_ZONE: ClimateZone = {
  id: 'test_zone',
  name: 'Test Zone',
  avg_temps_by_week: [
    18, 20, 22, 24, 25, 26, 27, 28, 28, 27,
    26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
    16, 15, 14, 13, 12, 11, 10, 9, 8, 7,
  ],
  temp_variance: 2.0,
  precip_pattern: 'even',
  frost_free_weeks: [0, 28],
  first_frost_week_avg: 28,
  humidity_baseline: 0.5,
  special_event_weights: {},
  pest_event_weights: {},
};

const speciesLookup = makeSpeciesLookup([TOMATO]);

function createTestSession(): GameSession {
  return createGameSession({
    seed: 42,
    zone: TEST_ZONE,
    speciesLookup,
    gridRows: 3,
    gridCols: 3,
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GameSession', () => {
  it('initializes with plots, weather, and event log', () => {
    const session = createTestSession();

    // Should have 9 plots (3×3)
    const soils = get(session.soilStates$);
    expect(soils).toHaveLength(9);

    // Weather pre-generated for 30 weeks
    expect(session.seasonWeather).toHaveLength(30);

    // Event log starts with RUN_START
    expect(session.eventLog.length).toBe(1);
    expect(session.eventLog.entries[0].event.type).toBe('RUN_START');
  });

  it('plants a tomato and advances 5 weeks with growth', () => {
    const session = createTestSession();

    // Plant a tomato at (0, 0)
    session.world.add({
      plotSlot: { row: 0, col: 0 },
      species: { speciesId: 'tomato_cherokee_purple' },
      growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
      health: { value: 1, stress: 0 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    });

    // Record in event log
    session.dispatch({
      type: 'PLANT',
      species_id: 'tomato_cherokee_purple',
      plot: [0, 0],
      week: 1,
    });

    // Advance 5 weeks
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = session.processWeek();
      results.push(result);

      // If frost ended the run, stop early
      if (result.advance.runEnded) break;
    }

    // Verify the tomato has grown (progress increased from 0)
    const plants = get(session.plants$);
    const tomato = plants.find(
      (p) => p.species.speciesId === 'tomato_cherokee_purple',
    );
    expect(tomato).toBeDefined();
    expect(tomato!.growth.progress).toBeGreaterThan(0);
  });

  it('returns tick results with growth data each week', () => {
    const session = createTestSession();

    // Plant a tomato
    session.world.add({
      plotSlot: { row: 1, col: 1 },
      species: { speciesId: 'tomato_cherokee_purple' },
      growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
      health: { value: 1, stress: 0 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    });

    const { tick } = session.processWeek();

    // The tick result should report the tomato grew
    expect(tick.week).toBe(1);
    expect(tick.grown.length).toBeGreaterThanOrEqual(1);

    const grownTomato = tick.grown.find(
      (g) => g.speciesId === 'tomato_cherokee_purple',
    );
    expect(grownTomato).toBeDefined();
    expect(grownTomato!.progress).toBeGreaterThan(0);
  });

  it('accumulates growth over multiple weeks', () => {
    const session = createTestSession();

    session.world.add({
      plotSlot: { row: 0, col: 0 },
      species: { speciesId: 'tomato_cherokee_purple' },
      growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
      health: { value: 1, stress: 0 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    });

    const progressByWeek: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = session.processWeek();
      if (result.advance.runEnded) break;

      const plants = get(session.plants$);
      const tomato = plants.find(
        (p) => p.species.speciesId === 'tomato_cherokee_purple',
      );
      progressByWeek.push(tomato!.growth.progress);
    }

    // Each week should have strictly more progress than the last
    for (let i = 1; i < progressByWeek.length; i++) {
      expect(progressByWeek[i]).toBeGreaterThan(progressByWeek[i - 1]);
    }
  });

  it('records events in the event log', () => {
    const session = createTestSession();

    session.world.add({
      plotSlot: { row: 0, col: 0 },
      species: { speciesId: 'tomato_cherokee_purple' },
      growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
      health: { value: 1, stress: 0 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    });

    session.processWeek();

    // Should have RUN_START + ADVANCE_WEEK (at minimum)
    const events = session.eventLog.toJSON();
    expect(events[0].type).toBe('RUN_START');

    const advanceEvents = events.filter((e) => e.type === 'ADVANCE_WEEK');
    expect(advanceEvents.length).toBe(1);
  });

  it('exposes current weather store that reflects the week', () => {
    const session = createTestSession();

    const weather1 = get(session.currentWeather$);
    expect(weather1.week).toBe(0); // starts at week index 0

    session.world.add({
      plotSlot: { row: 0, col: 0 },
      species: { speciesId: 'tomato_cherokee_purple' },
      growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
      health: { value: 1, stress: 0 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    });

    session.processWeek();

    const weather2 = get(session.currentWeather$);
    // After week 1, the weather index should be 0 (week 1 maps to index 0)
    expect(weather2).toBeDefined();
    expect(weather2.temp_high_c).toBeGreaterThan(0);
  });

  it('frost ends the run when it occurs', () => {
    // Use a zone with immediate frost potential
    const frostyZone: ClimateZone = {
      id: 'frost_zone',
      name: 'Frost Zone',
      avg_temps_by_week: Array(30).fill(5), // cold
      temp_variance: 1.0,
      precip_pattern: 'even',
      frost_free_weeks: [0, 0], // no frost-free window
      first_frost_week_avg: 0, // frost from week 0
      humidity_baseline: 0.5,
      special_event_weights: {},
      pest_event_weights: {},
    };

    const session = createGameSession({
      seed: 42,
      zone: frostyZone,
      speciesLookup,
      gridRows: 1,
      gridCols: 1,
    });

    session.world.add({
      plotSlot: { row: 0, col: 0 },
      species: { speciesId: 'tomato_cherokee_purple' },
      growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
      health: { value: 1, stress: 0 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    });

    // Try up to 30 weeks — with first_frost_week_avg=0, frost should happen
    let frostOccurred = false;
    for (let i = 0; i < 30; i++) {
      const result = session.processWeek();
      if (result.advance.runEnded) {
        frostOccurred = true;
        expect(result.advance.frost.killingFrost).toBe(true);

        // RUN_END event should be in the log
        const events = session.eventLog.toJSON();
        const endEvent = events.find((e) => e.type === 'RUN_END');
        expect(endEvent).toBeDefined();
        break;
      }
    }

    expect(frostOccurred).toBe(true);
  });
});
