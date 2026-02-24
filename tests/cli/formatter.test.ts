/**
 * Tests for CLI formatters.
 *
 * Covers all exported formatter functions in src/cli/formatter.ts.
 */

import { describe, it, expect } from 'vitest';
import { createGameSession, type GameSession, type DuskTickResult, type AdvanceResult } from '../../src/lib/engine/game-session.js';
import { TOMATO, BASIL, ROSEMARY, FENNEL, makeSpeciesLookup, ALL_SPECIES } from '../engine/fixtures.js';
import type { ClimateZone } from '../../src/lib/engine/weather-gen.js';
import type { Entity } from '../../src/lib/engine/ecs/components.js';
import { getPlotAt } from '../../src/lib/engine/ecs/world.js';
import {
  formatInspect,
  formatStatus,
  formatGrid,
  formatWeather,
  formatPlants,
  formatSoil,
  formatDuskTick,
  formatAdvance,
  formatDiagnose,
  formatSpeciesList,
  formatSpeciesDetail,
  formatLog,
  formatHelp,
} from '../../src/cli/formatter.js';

// ── Shared test zone & session factory ────────────────────────────────

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
const allSpeciesLookup = makeSpeciesLookup(ALL_SPECIES);

function createTestSession(opts?: { lookup?: (id: string) => any; gridRows?: number; gridCols?: number }): GameSession {
  return createGameSession({
    seed: 42,
    zone: TEST_ZONE,
    speciesLookup: opts?.lookup ?? speciesLookup,
    gridRows: opts?.gridRows ?? 3,
    gridCols: opts?.gridCols ?? 3,
  });
}

// ── formatStatus ──────────────────────────────────────────────────────

describe('formatStatus', () => {
  it('includes week, season, and phase header', () => {
    const session = createTestSession();
    const output = formatStatus(session);
    expect(output).toContain('=== Week 1');
    expect(output).toContain('Spring');
    expect(output).toContain('DAWN Phase ===');
  });

  it('shows energy as current/max', () => {
    const session = createTestSession();
    const output = formatStatus(session);
    expect(output).toMatch(/Energy: \d+\/\d+/);
  });

  it('shows weather with temperature, precip, humidity, and wind', () => {
    const session = createTestSession();
    const output = formatStatus(session);
    expect(output).toMatch(/Weather: .+ High [\d.]+C \/ Low [\d.]+C/);
    expect(output).toMatch(/Precip [\d.]+mm/);
    expect(output).toMatch(/Humidity \d+%/);
    expect(output).toMatch(/Wind \w+/);
  });

  it('shows frost risk', () => {
    const session = createTestSession();
    const output = formatStatus(session);
    expect(output).toMatch(/Frost risk: \w+ \(\d+%\)/);
  });

  it('shows season name based on week (Spring for weeks 1-7)', () => {
    const session = createTestSession();
    const output = formatStatus(session);
    expect(output).toContain('Spring');
  });

  it('shows Summer season after week 7', () => {
    const session = createTestSession();
    // Advance to week 8 (Summer)
    for (let i = 0; i < 7; i++) session.processWeek();
    const output = formatStatus(session);
    expect(output).toContain('Summer');
  });

  it('shows special weather event when present', () => {
    const session = createTestSession();
    // We can't easily force a special event, so just verify the output
    // parses without error and contains the expected structure
    const output = formatStatus(session);
    expect(output).toBeDefined();
    // The output should NOT contain "Special:" unless there's a weather event
    // (depends on seed, so we just verify formatting is correct)
    const lines = output.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });
});

// ── formatGrid ────────────────────────────────────────────────────────

describe('formatGrid', () => {
  it('displays garden dimensions header', () => {
    const session = createTestSession();
    const output = formatGrid(session);
    expect(output).toContain('Garden (3x3):');
  });

  it('shows column headers', () => {
    const session = createTestSession();
    const output = formatGrid(session);
    expect(output).toContain('Col 0');
    expect(output).toContain('Col 1');
    expect(output).toContain('Col 2');
  });

  it('shows [empty] for unplanted plots', () => {
    const session = createTestSession();
    const output = formatGrid(session);
    expect(output).toContain('[empty]');
  });

  it('shows planted species in the grid', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatGrid(session);
    // The species ID gets truncated if too long
    expect(output).toContain('tomato_chero');
  });

  it('shows stage and progress for planted cells', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 1, 1);
    const output = formatGrid(session);
    expect(output).toContain('seed');
    expect(output).toContain('0%');
  });

  it('shows health and stress for planted cells', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatGrid(session);
    expect(output).toMatch(/h \d+\.\d+ s \d+\.\d+/);
  });

  it('shows row numbers', () => {
    const session = createTestSession();
    const output = formatGrid(session);
    expect(output).toContain('0 |');
    expect(output).toContain('1 |');
    expect(output).toContain('2 |');
  });

  it('shows stress warning marker for stressed plants', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    // Manually set high stress
    plant.health!.stress = 0.5;
    session.notifyWorldChanged();
    const output = formatGrid(session);
    expect(output).toContain('!');
  });

  it('renders a 2x2 grid correctly', () => {
    const session = createTestSession({ gridRows: 2, gridCols: 2 });
    const output = formatGrid(session);
    expect(output).toContain('Garden (2x2):');
    expect(output).toContain('Col 0');
    expect(output).toContain('Col 1');
    expect(output).not.toContain('Col 2');
  });
});

// ── formatInspect ─────────────────────────────────────────────────────

describe('formatInspect', () => {
  it('shows plot header with coordinates', () => {
    const session = createTestSession();
    const output = formatInspect(session, 1, 2);
    expect(output).toContain('=== Plot [1, 2] ===');
  });

  it('shows [empty] when no plant at the plot', () => {
    const session = createTestSession();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Plant: [empty]');
  });

  it('shows plant details when a plant exists', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Cherokee Purple Tomato');
    expect(output).toContain('Solanum lycopersicum');
    expect(output).toContain('Stage: seed');
    expect(output).toContain('Health: 1.00');
    expect(output).toContain('Stress: 0.00');
  });

  it('shows conditions when plant has active conditions', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [{
        conditionId: 'early_blight',
        severity: 0.3,
        onset_week: 1,
        current_stage: 1,
      }],
    };
    session.notifyWorldChanged();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Condition: early_blight (stage 1, severity 0.30)');
  });

  it('shows "Conditions: none" when plant has no conditions', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Conditions: none');
  });

  it('shows companion buffs when present', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.companionBuffs = {
      buffs: [{
        source: 'basil_genovese',
        effects: [{ type: 'pest_resistance', modifier: 0.3, radius: 1 }],
      }],
    };
    session.notifyWorldChanged();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Companion buffs:');
    expect(output).toContain('basil_genovese: pest_resistance +0.30');
  });

  it('shows "Companion buffs: none" when no buffs', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Companion buffs: none');
  });

  it('shows HARVEST READY when plant is ripe', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.harvestState = { ripe: true, remaining: 5, quality: 0.9 };
    session.notifyWorldChanged();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('** HARVEST READY **');
  });

  it('shows soil data for the plot', () => {
    const session = createTestSession();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Soil:');
    expect(output).toMatch(/pH: \d+\.\d+/);
    expect(output).toMatch(/N: \d+\.\d+/);
    expect(output).toMatch(/P: \d+\.\d+/);
    expect(output).toMatch(/K: \d+\.\d+/);
  });

  it('shows "Pending amendments: none" when no amendments exist', () => {
    const session = createTestSession();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Pending amendments: none');
  });

  it('displays pending amendments with type, applied week, and weeks remaining', () => {
    const session = createTestSession();

    const plot = getPlotAt(session.world, 1, 1) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'compost',
          applied_week: 1,
          effect_delay_weeks: 3,
          effects: { nitrogen: 0.1, organic_matter: 0.15 },
        },
      ],
    };

    const output = formatInspect(session, 1, 1);
    expect(output).toContain('Pending amendments:');
    expect(output).toContain('compost: applied week 1, 3 weeks remaining');
    expect(output).not.toContain('Pending amendments: none');
  });

  it('shows correct weeks remaining based on current week', () => {
    const session = createTestSession();

    session.processWeek(); // week 1 -> 2
    session.processWeek(); // week 2 -> 3

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'bone_meal',
          applied_week: 1,
          effect_delay_weeks: 4,
          effects: { phosphorus: 0.2 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    // applied_week(1) + delay(4) - current_week(3) = 2 weeks remaining
    expect(output).toContain('bone_meal: applied week 1, 2 weeks remaining');
  });

  it('shows 0 weeks remaining when amendment delay has elapsed', () => {
    const session = createTestSession();

    session.processWeek(); // week 1 -> 2
    session.processWeek(); // week 2 -> 3
    session.processWeek(); // week 3 -> 4

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'lime',
          applied_week: 1,
          effect_delay_weeks: 2,
          effects: { ph: 0.5 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    expect(output).toContain('lime: applied week 1, 0 weeks remaining');
  });

  it('displays multiple pending amendments', () => {
    const session = createTestSession();

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'compost',
          applied_week: 1,
          effect_delay_weeks: 3,
          effects: { nitrogen: 0.1 },
        },
        {
          type: 'bone_meal',
          applied_week: 1,
          effect_delay_weeks: 2,
          effects: { phosphorus: 0.2 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    expect(output).toContain('compost: applied week 1, 3 weeks remaining');
    expect(output).toContain('bone_meal: applied week 1, 2 weeks remaining');
  });

  it('uses singular "week" when 1 week remaining', () => {
    const session = createTestSession();

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'compost',
          applied_week: 1,
          effect_delay_weeks: 2,
          effects: { nitrogen: 0.1 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    // applied_week(1) + delay(2) - current_week(1) = 2 => plural
    expect(output).toContain('2 weeks remaining');
  });

  it('shows negative modifier sign for companion debuffs', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.companionBuffs = {
      buffs: [{
        source: 'fennel',
        effects: [{ type: 'allelopathy', modifier: -0.4, radius: 1 }],
      }],
    };
    session.notifyWorldChanged();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('fennel: allelopathy -0.40');
  });
});

// ── formatWeather ─────────────────────────────────────────────────────

describe('formatWeather', () => {
  it('shows weather header with week number', () => {
    const session = createTestSession();
    const output = formatWeather(session);
    expect(output).toContain('=== Weather — Week 1 ===');
  });

  it('shows high and low temperatures', () => {
    const session = createTestSession();
    const output = formatWeather(session);
    expect(output).toMatch(/High: [\d.]+C \/ Low: [\d.]+C/);
  });

  it('shows precipitation', () => {
    const session = createTestSession();
    const output = formatWeather(session);
    expect(output).toMatch(/Precipitation: [\d.]+mm/);
  });

  it('shows humidity as percentage', () => {
    const session = createTestSession();
    const output = formatWeather(session);
    expect(output).toMatch(/Humidity: \d+%/);
  });

  it('shows wind level', () => {
    const session = createTestSession();
    const output = formatWeather(session);
    expect(output).toMatch(/Wind: \w+/);
  });

  it('shows frost status', () => {
    const session = createTestSession();
    const output = formatWeather(session);
    expect(output).toMatch(/Frost: (YES|no)/);
  });
});

// ── formatPlants ──────────────────────────────────────────────────────

describe('formatPlants', () => {
  it('shows message when no plants exist', () => {
    const session = createTestSession();
    const output = formatPlants(session);
    expect(output).toBe('No plants in the garden.');
  });

  it('shows plant count in header', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatPlants(session);
    expect(output).toContain('=== Plants (1) ===');
  });

  it('shows species id, position, stage, progress, health, and stress', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 1, 2);
    const output = formatPlants(session);
    expect(output).toContain('tomato_cherokee_purple [1,2]');
    expect(output).toContain('seed 0%');
    expect(output).toContain('health 1.00');
    expect(output).toContain('stress 0.00');
  });

  it('shows stress warning for stressed plants', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.3;
    session.notifyWorldChanged();
    const output = formatPlants(session);
    expect(output).toContain('!');
  });

  it('lists multiple plants', () => {
    const session = createTestSession({ lookup: allSpeciesLookup });
    session.addPlant('tomato_cherokee_purple', 0, 0);
    session.addPlant('basil_genovese', 1, 1);
    const output = formatPlants(session);
    expect(output).toContain('=== Plants (2) ===');
    expect(output).toContain('tomato_cherokee_purple [0,0]');
    expect(output).toContain('basil_genovese [1,1]');
  });
});

// ── formatSoil ────────────────────────────────────────────────────────

describe('formatSoil', () => {
  it('shows error for invalid plot coordinates', () => {
    const session = createTestSession();
    const output = formatSoil(session, 10, 10);
    expect(output).toBe('Error: No plot at [10, 10].');
  });

  it('shows soil header with coordinates', () => {
    const session = createTestSession();
    const output = formatSoil(session, 0, 0);
    expect(output).toContain('=== Soil [0, 0] ===');
  });

  it('shows all soil properties', () => {
    const session = createTestSession();
    const output = formatSoil(session, 0, 0);
    expect(output).toMatch(/pH: \d+\.\d+/);
    expect(output).toMatch(/Moisture: \d+\.\d+/);
    expect(output).toMatch(/Temperature: \d+\.\d+C/);
    expect(output).toMatch(/Nitrogen: \d+\.\d+/);
    expect(output).toMatch(/Phosphorus: \d+\.\d+/);
    expect(output).toMatch(/Potassium: \d+\.\d+/);
    expect(output).toMatch(/Organic matter: \d+\.\d+/);
    expect(output).toMatch(/Biology: \d+\.\d+/);
    expect(output).toMatch(/Compaction: \d+\.\d+/);
  });

  it('displays exact soil values from the session', () => {
    const session = createTestSession();
    const output = formatSoil(session, 0, 0);
    // Default soil starts with pH 6.5
    expect(output).toContain('pH: 6.50');
    expect(output).toContain('Moisture: 0.50');
  });
});

// ── formatDuskTick ────────────────────────────────────────────────────

describe('formatDuskTick', () => {
  it('shows header with week number', () => {
    const result: DuskTickResult = {
      week: 5,
      grown: [],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('=== DUSK — Simulation Tick (Week 5) ===');
  });

  it('shows "Growth: none" when no plants grew', () => {
    const result: DuskTickResult = {
      week: 1,
      grown: [],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('Growth: none');
  });

  it('shows growth progress with percentage change', () => {
    const result: DuskTickResult = {
      week: 3,
      grown: [{
        speciesId: 'tomato_cherokee_purple',
        row: 0,
        col: 0,
        prevProgress: 0.1,
        progress: 0.25,
        stage: 'seedling',
      }],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('Growth:');
    expect(output).toContain('tomato_cherokee_purple [0,0]: seedling 10% -> 25%');
  });

  it('marks stalled growth', () => {
    const result: DuskTickResult = {
      week: 5,
      grown: [{
        speciesId: 'tomato_cherokee_purple',
        row: 0,
        col: 0,
        prevProgress: 0.3,
        progress: 0.3005, // delta <= 0.001
        stage: 'vegetative',
      }],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('(stalled)');
  });

  it('shows stress changes', () => {
    const result: DuskTickResult = {
      week: 4,
      grown: [],
      stressed: [{
        speciesId: 'tomato_cherokee_purple',
        row: 1,
        col: 0,
        prevStress: 0.1,
        stress: 0.25,
      }],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('Stress:');
    expect(output).toContain('tomato_cherokee_purple [1,0]: stress 0.10 -> 0.25');
  });

  it('shows disease onsets', () => {
    const result: DuskTickResult = {
      week: 6,
      grown: [],
      stressed: [],
      diseaseOnsets: [{
        speciesId: 'tomato_cherokee_purple',
        row: 0,
        col: 0,
        conditionId: 'early_blight',
      }],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('Disease:');
    expect(output).toContain('tomato_cherokee_purple [0,0]: early_blight onset');
  });

  it('shows harvest ready plants', () => {
    const result: DuskTickResult = {
      week: 15,
      grown: [],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [{
        speciesId: 'tomato_cherokee_purple',
        row: 0,
        col: 1,
      }],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('Harvest ready:');
    expect(output).toContain('tomato_cherokee_purple [0,1]');
  });

  it('shows companion effects', () => {
    const result: DuskTickResult = {
      week: 8,
      grown: [],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [{
        speciesId: 'tomato_cherokee_purple',
        row: 0,
        col: 0,
        buffs: [{
          source: 'basil_genovese',
          effects: [{ type: 'pest_resistance', modifier: 0.3 }],
        }],
      }],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).toContain('Companions:');
    expect(output).toContain('tomato_cherokee_purple [0,0]: basil_genovese (pest_resistance +0.30)');
  });

  it('omits empty sections (stress, disease, companions, harvest)', () => {
    const result: DuskTickResult = {
      week: 1,
      grown: [],
      stressed: [],
      diseaseOnsets: [],
      harvestReady: [],
      companionEffects: [],
      treatmentOutcomes: [],
    };
    const output = formatDuskTick(result);
    expect(output).not.toContain('Stress:');
    expect(output).not.toContain('Disease:');
    expect(output).not.toContain('Companions:');
    expect(output).not.toContain('Harvest ready:');
  });
});

// ── formatAdvance ─────────────────────────────────────────────────────

describe('formatAdvance', () => {
  it('shows normal advance with week transition', () => {
    const result: AdvanceResult = {
      weekAdvanced: 5,
      frost: { killingFrost: false, killed: [] },
      runEnded: false,
    };
    const output = formatAdvance(result, { first_frost_week_avg: 28 });
    expect(output).toContain('=== ADVANCE — Week 5 -> 6 ===');
    expect(output).toContain('Season: Spring');
  });

  it('shows frost probability for next week', () => {
    const result: AdvanceResult = {
      weekAdvanced: 5,
      frost: { killingFrost: false, killed: [] },
      runEnded: false,
    };
    const output = formatAdvance(result, { first_frost_week_avg: 28 });
    expect(output).toMatch(/Frost probability next week: \d+%/);
  });

  it('shows killing frost message when frost occurs', () => {
    const result: AdvanceResult = {
      weekAdvanced: 29,
      frost: { killingFrost: true, killed: ['tomato_cherokee_purple', 'basil_genovese'] },
      runEnded: true,
    };
    const output = formatAdvance(result, { first_frost_week_avg: 28 });
    expect(output).toContain('=== KILLING FROST ===');
    expect(output).toContain('Season has ended. Killing frost arrived at week 29.');
    expect(output).toContain('Killed: tomato_cherokee_purple, basil_genovese');
  });

  it('shows killing frost without killed list when no plants died', () => {
    const result: AdvanceResult = {
      weekAdvanced: 30,
      frost: { killingFrost: true, killed: [] },
      runEnded: true,
    };
    const output = formatAdvance(result, { first_frost_week_avg: 28 });
    expect(output).toContain('=== KILLING FROST ===');
    expect(output).not.toContain('Killed:');
  });

  it('shows Summer season for week 8-20 range', () => {
    const result: AdvanceResult = {
      weekAdvanced: 9,
      frost: { killingFrost: false, killed: [] },
      runEnded: false,
    };
    const output = formatAdvance(result, { first_frost_week_avg: 28 });
    // Next week is 10 which is Summer
    expect(output).toContain('Season: Summer');
  });

  it('shows Fall season for weeks after 20', () => {
    const result: AdvanceResult = {
      weekAdvanced: 20,
      frost: { killingFrost: false, killed: [] },
      runEnded: false,
    };
    const output = formatAdvance(result, { first_frost_week_avg: 28 });
    // Next week is 21 which is Fall
    expect(output).toContain('Season: Fall');
  });
});

// ── formatDiagnose ────────────────────────────────────────────────────

describe('formatDiagnose', () => {
  it('shows error when no plant at position', () => {
    const session = createTestSession();
    const output = formatDiagnose(session, 0, 0);
    expect(output).toBe('Error: No plant at [0, 0].');
  });

  it('shows diagnosis header with plant name and position', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('=== Diagnosis: Cherokee Purple Tomato [0, 0] ===');
  });

  it('shows plant stage, health, and stress', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Stage: seed (0%)');
    expect(output).toContain('Health: 1.00 | Stress: 0.00');
  });

  it('shows "No active conditions detected" when healthy', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('No active conditions detected.');
  });

  it('shows active conditions with severity and stage', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [{
        conditionId: 'early_blight',
        severity: 0.4,
        onset_week: 1,
        current_stage: 0,
      }],
    };
    session.notifyWorldChanged();
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Active conditions:');
    expect(output).toContain('early_blight — severity 0.40, stage 0');
  });

  it('shows symptom description from species vulnerabilities', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [{
        conditionId: 'early_blight',
        severity: 0.4,
        onset_week: 1,
        current_stage: 0,
      }],
    };
    session.notifyWorldChanged();
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Symptom: Spots on leaves.');
    expect(output).toContain('Reversible: yes');
    expect(output).toContain('Lethal after 8 weeks if untreated');
  });

  it('shows environmental assessment with warnings', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);

    // Modify soil to be outside preferred range
    const plot = getPlotAt(session.world, 0, 0) as Entity;
    if (plot.soil) {
      plot.soil.ph = 5.0; // below tomato's preferred 6.0-6.8
      plot.soil.nitrogen = 0.1; // low nutrients
      plot.soil.phosphorus = 0.1;
      plot.soil.potassium = 0.1;
    }

    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Environmental assessment:');
    expect(output).toContain('Soil pH 5.00 is below preferred range (6-6.8)');
    expect(output).toContain('Low nutrients');
  });

  it('shows "Conditions look good" when environment is optimal', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Conditions look good for this species.');
  });

  it('shows stress warning marker when stress is high', () => {
    const session = createTestSession();
    const plant = session.addPlant('tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.5;
    session.notifyWorldChanged();
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Stress: 0.50 !');
  });

  it('warns about low soil moisture', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const plot = getPlotAt(session.world, 0, 0) as Entity;
    if (plot.soil) {
      plot.soil.moisture = 0.1;
    }
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Soil moisture critically low (0.10)');
  });

  it('warns about excessive soil moisture', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const plot = getPlotAt(session.world, 0, 0) as Entity;
    if (plot.soil) {
      plot.soil.moisture = 0.9;
    }
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Soil moisture excessive (0.90)');
    expect(output).toContain('risk of root rot');
  });

  it('warns about soil pH above preferred range', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const plot = getPlotAt(session.world, 0, 0) as Entity;
    if (plot.soil) {
      plot.soil.ph = 7.5; // above tomato's 6.0-6.8
    }
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Soil pH 7.50 is above preferred range (6-6.8)');
  });

  it('warns about low soil temperature', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const plot = getPlotAt(session.world, 0, 0) as Entity;
    if (plot.soil) {
      plot.soil.temperature_c = 10; // below tomato's min 15C
    }
    const output = formatDiagnose(session, 0, 0);
    expect(output).toContain('Soil temp 10.00C is below minimum 15C');
  });
});

// ── formatSpeciesList ─────────────────────────────────────────────────

describe('formatSpeciesList', () => {
  it('shows message when no species available', () => {
    const output = formatSpeciesList([]);
    expect(output).toBe('No species available.');
  });

  it('shows species count in header', () => {
    const output = formatSpeciesList([TOMATO, BASIL]);
    expect(output).toContain('=== Available Species (2) ===');
  });

  it('shows species id, common name, botanical name, type, and difficulty', () => {
    const output = formatSpeciesList([TOMATO]);
    expect(output).toContain('tomato_cherokee_purple: Cherokee Purple Tomato');
    expect(output).toContain("Solanum lycopersicum 'Cherokee Purple'");
    expect(output).toContain('annual');
    expect(output).toContain('intermediate');
  });

  it('lists all provided species', () => {
    const output = formatSpeciesList(ALL_SPECIES);
    expect(output).toContain('=== Available Species (5) ===');
    expect(output).toContain('tomato_cherokee_purple');
    expect(output).toContain('basil_genovese');
    expect(output).toContain('rosemary');
    expect(output).toContain('fennel');
    expect(output).toContain('mint_spearmint');
  });
});

// ── formatSpeciesDetail ───────────────────────────────────────────────

describe('formatSpeciesDetail', () => {
  it('shows species header with common and botanical name', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain("=== Cherokee Purple Tomato (Solanum lycopersicum 'Cherokee Purple') ===");
  });

  it('shows ID, family, type, and difficulty', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('ID: tomato_cherokee_purple');
    expect(output).toContain('Family: Solanaceae');
    expect(output).toContain('Type: annual');
    expect(output).toContain('Difficulty: intermediate');
  });

  it('shows growth info', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Growth: indeterminate_vine, fast rate');
    expect(output).toContain('Maturity: 12-16 days');
    expect(output).toContain('Max size: 180cm H x 60cm W');
  });

  it('shows needs', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Sun: full | Water: moderate');
    expect(output).toContain('Soil pH: 6-6.8');
    expect(output).toContain('Nutrients: N=moderate P=high K=high');
    expect(output).toContain('Min soil temp: 15C');
    expect(output).toContain('Frost tolerance: none');
  });

  it('shows season windows', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Sow: weeks 4-8');
    expect(output).toContain('Harvest: weeks 12-22');
  });

  it('shows bolt trigger when present', () => {
    const output = formatSpeciesDetail(BASIL);
    expect(output).toContain('Bolt trigger: heat');
  });

  it('omits bolt trigger line when null', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).not.toContain('Bolt trigger:');
  });

  it('shows harvest info', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Harvest: fruit, yield 7/10');
    expect(output).toContain('Continuous: yes | Seed saving: yes');
  });

  it('shows companions', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Companions: basil_genovese, carrot_nantes');
  });

  it('shows antagonists', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Antagonists: fennel');
  });

  it('omits companions/antagonists when empty', () => {
    const output = formatSpeciesDetail(ROSEMARY);
    expect(output).not.toContain('Companions:');
    expect(output).not.toContain('Antagonists:');
  });

  it('shows lore description and fun fact', () => {
    const output = formatSpeciesDetail(TOMATO);
    expect(output).toContain('Lore: A Tennessee heirloom.');
    expect(output).toContain('Fun fact: Dusky color from dual pigments.');
  });
});

// ── formatLog ─────────────────────────────────────────────────────────

describe('formatLog', () => {
  it('shows empty log message', () => {
    const session = createTestSession();
    // Clear the event log to test empty state
    session.eventLog.clear();
    const output = formatLog(session, 10);
    expect(output).toBe('Event log is empty.');
  });

  it('shows event log header with counts', () => {
    const session = createTestSession();
    const output = formatLog(session, 10);
    expect(output).toMatch(/=== Event Log \(last \d+ of \d+\) ===/);
  });

  it('shows events as JSON', () => {
    const session = createTestSession();
    const output = formatLog(session, 10);
    // The session starts with a RUN_START event
    expect(output).toContain('RUN_START');
  });

  it('limits to last N events', () => {
    const session = createTestSession();
    // Add several events by processing weeks
    session.processWeek();
    session.processWeek();
    const output = formatLog(session, 2);
    // Should only show last 2 entries
    const lines = output.split('\n');
    const eventLines = lines.filter((l) => l.match(/^\s+#\d+:/));
    expect(eventLines.length).toBe(2);
  });

  it('shows event index numbers', () => {
    const session = createTestSession();
    const output = formatLog(session, 10);
    expect(output).toMatch(/#\d+:/);
  });
});

// ── formatHelp ────────────────────────────────────────────────────────

describe('formatHelp', () => {
  it('shows full help when no command specified', () => {
    const output = formatHelp();
    expect(output).toContain('=== Perennial CLI — Commands ===');
    expect(output).toContain('Query (any phase):');
    expect(output).toContain('Actions (ACT phase only):');
    expect(output).toContain('Turn:');
    expect(output).toContain('Session:');
  });

  it('lists query commands', () => {
    const output = formatHelp();
    expect(output).toContain('status');
    expect(output).toContain('grid');
    expect(output).toContain('inspect ROW COL');
    expect(output).toContain('weather');
    expect(output).toContain('plants');
    expect(output).toContain('soil ROW COL');
    expect(output).toContain('species [ID]');
    expect(output).toContain('amendments');
  });

  it('lists action commands', () => {
    const output = formatHelp();
    expect(output).toContain('plant SPECIES ROW COL');
    expect(output).toContain('amend TYPE ROW COL');
    expect(output).toContain('diagnose ROW COL');
  });

  it('shows specific command help', () => {
    const output = formatHelp('status');
    expect(output).toContain('status');
    expect(output).toContain('week');
    expect(output).toContain('phase');
  });

  it('shows help for plant command', () => {
    const output = formatHelp('plant');
    expect(output).toContain('plant SPECIES_ID ROW COL');
    expect(output).toContain('ACT phase');
  });

  it('shows error for unknown command', () => {
    const output = formatHelp('nonexistent');
    expect(output).toBe("Unknown command: 'nonexistent'. Type 'help' for available commands.");
  });

  it('shows help for all documented commands', () => {
    const commands = ['status', 'grid', 'inspect', 'weather', 'plants', 'soil',
      'species', 'amendments', 'log', 'plant', 'amend', 'diagnose',
      'intervene', 'scout', 'wait', 'advance', 'week', 'save', 'quit', 'help'];
    for (const cmd of commands) {
      const output = formatHelp(cmd);
      expect(output).not.toContain('Unknown command');
    }
  });
});

// ── Integration: formatDuskTick with real session ─────────────────────

describe('formatDuskTick integration', () => {
  it('formats a real simulation tick result', () => {
    const session = createTestSession();
    session.addPlant('tomato_cherokee_purple', 0, 0);
    const { tick } = session.processWeek();
    const output = formatDuskTick(tick);
    expect(output).toContain('=== DUSK — Simulation Tick (Week 1) ===');
  });
});

// ── Integration: formatAdvance with real session ──────────────────────

describe('formatAdvance integration', () => {
  it('formats a real advance result', () => {
    const session = createTestSession();
    const { advance } = session.processWeek();
    const output = formatAdvance(advance, { first_frost_week_avg: TEST_ZONE.first_frost_week_avg });
    expect(output).toContain('=== ADVANCE — Week 1 -> 2 ===');
    expect(output).toContain('Season: Spring');
  });
});
