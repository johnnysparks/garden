/**
 * Tests for GameSession action methods (plantAction, amendAction, etc.)
 *
 * These test the core game logic extracted from the CLI command layer:
 * phase/energy/bounds validation, event dispatch, and ECS mutations.
 */

import { describe, it, expect } from 'vitest';
import {
  createGameSession,
  type GameSession,
} from '../../src/lib/engine/game-session.js';
import { TurnPhase } from '../../src/lib/engine/turn-manager.js';
import { TOMATO, BASIL, makeSpeciesLookup } from './fixtures.js';
import type { ClimateZone } from '../../src/lib/engine/weather-gen.js';
import type { SoilAmendment } from '../../src/lib/data/types.js';
import type { Entity } from '../../src/lib/engine/ecs/components.js';
import { getPlotAt } from '../../src/lib/engine/ecs/world.js';

// ── Shared setup ─────────────────────────────────────────────────────

const TEST_ZONE: ClimateZone = {
  id: 'test_zone',
  name: 'Test Zone',
  avg_temps_by_week: Array.from({ length: 30 }, () => 22),
  temp_variance: 2.0,
  precip_pattern: 'even',
  frost_free_weeks: [0, 28],
  first_frost_week_avg: 28,
  humidity_baseline: 0.5,
  special_event_weights: {},
  pest_event_weights: {},
};

const speciesLookup = makeSpeciesLookup([TOMATO, BASIL]);

const COMPOST: SoilAmendment = {
  id: 'compost',
  name: 'Compost',
  effects: { organic_matter: 0.15, nitrogen: 0.05 },
  delay_weeks: 2,
};

function createTestSession(opts?: { gridRows?: number; gridCols?: number }): GameSession {
  return createGameSession({
    seed: 42,
    zone: TEST_ZONE,
    speciesLookup,
    gridRows: opts?.gridRows ?? 3,
    gridCols: opts?.gridCols ?? 3,
  });
}

/** Advance session from DAWN to ACT phase. */
function advanceToAct(session: GameSession): void {
  // DAWN → PLAN
  session.advancePhase();
  // PLAN → ACT (sets energy budget)
  session.advancePhase();
  expect(session.getPhase()).toBe(TurnPhase.ACT);
}

// ── plantAction ──────────────────────────────────────────────────────

describe('plantAction', () => {
  it('plants a species and returns the entity', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.plantAction('tomato_cherokee_purple', 0, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entity.species?.speciesId).toBe('tomato_cherokee_purple');
    expect(result.entity.plotSlot).toEqual({ row: 0, col: 0 });
    expect(result.entity.growth?.progress).toBe(0);
    expect(result.entity.growth?.stage).toBe('seed');
  });

  it('dispatches a PLANT event to the event log', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('basil_genovese', 1, 1);
    const events = session.eventLog.toJSON();
    const plantEvent = events.find((e) => e.type === 'PLANT');
    expect(plantEvent).toBeDefined();
    expect(plantEvent).toMatchObject({
      type: 'PLANT',
      species_id: 'basil_genovese',
      plot: [1, 1],
    });
  });

  it('spends 1 energy', () => {
    const session = createTestSession();
    advanceToAct(session);
    const before = session.getEnergy().current;

    session.plantAction('tomato_cherokee_purple', 0, 0);

    expect(session.getEnergy().current).toBe(before - 1);
  });

  it('fails when not in ACT phase', () => {
    const session = createTestSession();
    // Still in DAWN phase
    const result = session.plantAction('tomato_cherokee_purple', 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not in ACT phase');
  });

  it('fails for unknown species', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.plantAction('nonexistent_plant', 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unknown species');
  });

  it('fails for out-of-bounds coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.plantAction('tomato_cherokee_purple', 5, 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('out of bounds');
  });

  it('fails for negative coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.plantAction('tomato_cherokee_purple', -1, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('out of bounds');
  });

  it('fails when plot is already occupied', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);
    const result = session.plantAction('basil_genovese', 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('already occupied');
  });

  it('fails when energy is depleted (auto-transitions to DUSK)', () => {
    const session = createTestSession();
    advanceToAct(session);

    // Drain all energy — spendEnergy auto-transitions to DUSK when energy hits 0
    const energy = session.getEnergy();
    for (let i = 0; i < energy.current; i++) {
      session.spendEnergy(1);
    }

    // Session is now in DUSK, so action fails with phase error
    const result = session.plantAction('tomato_cherokee_purple', 1, 1);
    expect(result.ok).toBe(false);
  });

  it('creates harvestState component from species data', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.plantAction('tomato_cherokee_purple', 0, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entity.harvestState).toEqual({
      ripe: false,
      remaining: TOMATO.harvest.yield_potential,
      quality: 1.0,
    });
  });
});

// ── amendAction ──────────────────────────────────────────────────────

describe('amendAction', () => {
  it('adds a pending amendment to the plot entity', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.amendAction(0, 0, COMPOST);
    expect(result.ok).toBe(true);

    const pending = session.getPendingAmendments(0, 0);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('compost');
    expect(pending[0].effect_delay_weeks).toBe(2);
    expect(pending[0].effects).toEqual({ organic_matter: 0.15, nitrogen: 0.05 });
  });

  it('dispatches an AMEND event', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.amendAction(1, 1, COMPOST);

    const events = session.eventLog.toJSON();
    const amendEvent = events.find((e) => e.type === 'AMEND');
    expect(amendEvent).toBeDefined();
    expect(amendEvent).toMatchObject({
      type: 'AMEND',
      amendment: 'compost',
      plot: [1, 1],
    });
  });

  it('spends 1 energy', () => {
    const session = createTestSession();
    advanceToAct(session);
    const before = session.getEnergy().current;

    session.amendAction(0, 0, COMPOST);

    expect(session.getEnergy().current).toBe(before - 1);
  });

  it('fails when not in ACT phase', () => {
    const session = createTestSession();

    const result = session.amendAction(0, 0, COMPOST);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not in ACT phase');
  });

  it('fails for out-of-bounds coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.amendAction(10, 10, COMPOST);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('out of bounds');
  });

  it('fails when energy is depleted (auto-transitions to DUSK)', () => {
    const session = createTestSession();
    advanceToAct(session);

    const energy = session.getEnergy();
    for (let i = 0; i < energy.current; i++) {
      session.spendEnergy(1);
    }

    const result = session.amendAction(0, 0, COMPOST);
    expect(result.ok).toBe(false);
  });

  it('amendment effects are applied by soilUpdateSystem after delay', () => {
    const session = createTestSession();
    advanceToAct(session);

    const soilBefore = session.getSoil(0, 0)!;
    const nitrogenBefore = soilBefore.nitrogen;

    session.amendAction(0, 0, COMPOST);

    // Run weeks until delay expires (compost has 2-week delay)
    session.endActions(); // finish ACT → DUSK → run tick
    // Advance through remaining phases to next week
    while (session.getPhase() !== TurnPhase.ACT) {
      if (session.isRunEnded()) break;
      session.advancePhase();
    }
    // Week 2: amendment still pending
    session.endActions();
    while (session.getPhase() !== TurnPhase.ACT) {
      if (session.isRunEnded()) break;
      session.advancePhase();
    }
    // Week 3: amendment should have been applied (applied_week=1 + delay=2 = week 3)
    session.endActions();

    const soilAfter = session.getSoil(0, 0)!;
    // Nitrogen should have increased from the compost
    expect(soilAfter.nitrogen).toBeGreaterThan(nitrogenBefore);
  });

  it('allows multiple amendments on the same plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    const lime: SoilAmendment = {
      id: 'lime',
      name: 'Lime',
      effects: { ph: 0.5 },
      delay_weeks: 3,
    };

    session.amendAction(0, 0, COMPOST);
    session.amendAction(0, 0, lime);

    const pending = session.getPendingAmendments(0, 0);
    expect(pending).toHaveLength(2);
    expect(pending.map((p) => p.type)).toEqual(['compost', 'lime']);
  });
});

// ── addAmendment (low-level method) ──────────────────────────────────

describe('addAmendment', () => {
  it('adds a pending amendment directly without validation', () => {
    const session = createTestSession();

    session.addAmendment(0, 0, COMPOST);

    const pending = session.getPendingAmendments(0, 0);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('compost');
  });

  it('initializes amendments component if absent', () => {
    const session = createTestSession();
    const plot = getPlotAt(session.world, 0, 0) as Entity;
    expect(plot.amendments).toBeUndefined();

    session.addAmendment(0, 0, COMPOST);

    expect(plot.amendments).toBeDefined();
    expect(plot.amendments!.pending).toHaveLength(1);
  });
});

// ── diagnoseAction ───────────────────────────────────────────────────

describe('diagnoseAction', () => {
  it('diagnoses a plant and returns its info', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);
    const result = session.diagnoseAction(0, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plant.speciesId).toBe('tomato_cherokee_purple');
  });

  it('dispatches a DIAGNOSE event', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 1, 1);
    session.diagnoseAction(1, 1);

    const events = session.eventLog.toJSON();
    const diagnoseEvent = events.find((e) => e.type === 'DIAGNOSE');
    expect(diagnoseEvent).toBeDefined();
    expect(diagnoseEvent).toMatchObject({
      type: 'DIAGNOSE',
      plant_id: '1,1',
      hypothesis: 'visual_inspection',
    });
  });

  it('spends 1 energy', () => {
    const session = createTestSession();
    advanceToAct(session);
    session.plantAction('tomato_cherokee_purple', 0, 0);

    const before = session.getEnergy().current;
    session.diagnoseAction(0, 0);
    expect(session.getEnergy().current).toBe(before - 1);
  });

  it('fails when not in ACT phase', () => {
    const session = createTestSession();

    const result = session.diagnoseAction(0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not in ACT phase');
  });

  it('fails for out-of-bounds coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.diagnoseAction(10, 10);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('out of bounds');
  });

  it('fails when no plant is at the plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.diagnoseAction(0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('No plant');
  });

  it('fails when energy is depleted (auto-transitions to DUSK)', () => {
    const session = createTestSession();
    advanceToAct(session);
    session.plantAction('tomato_cherokee_purple', 0, 0);

    // Drain remaining energy — auto-transitions to DUSK
    while (session.getEnergy().current > 0) {
      session.spendEnergy(1);
    }

    const result = session.diagnoseAction(0, 0);
    expect(result.ok).toBe(false);
  });
});

// ── interveneAction ──────────────────────────────────────────────────

describe('interveneAction', () => {
  it('intervenes on a plant and returns its info', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('basil_genovese', 1, 1);
    const result = session.interveneAction('prune', 1, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plant.speciesId).toBe('basil_genovese');
  });

  it('dispatches an INTERVENE event with the action', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);
    session.interveneAction('remove_affected_leaves', 0, 0);

    const events = session.eventLog.toJSON();
    const interveneEvent = events.find((e) => e.type === 'INTERVENE');
    expect(interveneEvent).toBeDefined();
    expect(interveneEvent).toMatchObject({
      type: 'INTERVENE',
      plant_id: '0,0',
      action: 'remove_affected_leaves',
    });
  });

  it('spends 1 energy', () => {
    const session = createTestSession();
    advanceToAct(session);
    session.plantAction('tomato_cherokee_purple', 0, 0);

    const before = session.getEnergy().current;
    session.interveneAction('prune', 0, 0);
    expect(session.getEnergy().current).toBe(before - 1);
  });

  it('fails when no plant is at the plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.interveneAction('prune', 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('No plant');
  });

  it('fails when not in ACT phase', () => {
    const session = createTestSession();

    const result = session.interveneAction('prune', 0, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not in ACT phase');
  });
});

// ── interveneAction — pull ─────────────────────────────────────────────

describe('interveneAction — pull', () => {
  it('pull does not mark the entity dead in the engine (UI responsibility)', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);
    const result = session.interveneAction('pull', 0, 0);
    expect(result.ok).toBe(true);

    // Engine only records the event; entity should still be alive
    const plant = session.getPlantAt(0, 0);
    expect(plant).toBeDefined();
    expect(plant!.dead).toBe(false);
  });

  it('pulled entity disappears after UI marks it dead', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('basil_genovese', 1, 1);
    session.interveneAction('pull', 1, 1);

    // Simulate what the UI does: find entity and mark dead
    const plants = session.world.with('plotSlot', 'species');
    for (const p of plants) {
      if (p.plotSlot.row === 1 && p.plotSlot.col === 1 && !(p as Entity).dead) {
        (p as Entity).dead = true;
        break;
      }
    }

    // getPlantAt skips dead entities, so should return undefined
    expect(session.getPlantAt(1, 1)).toBeUndefined();
  });
});

// ── interveneAction — harvest event ──────────────────────────────────

describe('interveneAction — harvest event', () => {
  it('UI can dispatch a HARVEST event after harvest intervene', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);
    const result = session.interveneAction('harvest', 0, 0);
    expect(result.ok).toBe(true);

    // Simulate what the UI does: dispatch a HARVEST event
    session.dispatch({
      type: 'HARVEST',
      plant_id: '0,0',
      week: session.getWeek(),
    });

    const events = session.eventLog.toJSON();
    const harvestEvent = events.find((e) => e.type === 'HARVEST');
    expect(harvestEvent).toBeDefined();
    expect(harvestEvent).toMatchObject({
      type: 'HARVEST',
      plant_id: '0,0',
    });
  });
});

// ── scoutAction ──────────────────────────────────────────────────────

describe('scoutAction', () => {
  it('scouts a target successfully', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = session.scoutAction('weather');
    expect(result.ok).toBe(true);
  });

  it('dispatches a SCOUT event', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.scoutAction('pests');

    const events = session.eventLog.toJSON();
    const scoutEvent = events.find((e) => e.type === 'SCOUT');
    expect(scoutEvent).toBeDefined();
    expect(scoutEvent).toMatchObject({
      type: 'SCOUT',
      target: 'pests',
    });
  });

  it('spends 1 energy', () => {
    const session = createTestSession();
    advanceToAct(session);

    const before = session.getEnergy().current;
    session.scoutAction('soil');
    expect(session.getEnergy().current).toBe(before - 1);
  });

  it('fails when not in ACT phase', () => {
    const session = createTestSession();

    const result = session.scoutAction('weather');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Not in ACT phase');
  });

  it('fails when energy is depleted (auto-transitions to DUSK)', () => {
    const session = createTestSession();
    advanceToAct(session);

    while (session.getEnergy().current > 0) {
      session.spendEnergy(1);
    }

    const result = session.scoutAction('weather');
    expect(result.ok).toBe(false);
  });
});

// ── Soil initialization ───────────────────────────────────────────────

describe('initial soil temperature', () => {
  it('initializes soil temperature from zone week 1 average, not a hardcoded 20°C', () => {
    // Regression test: soil was always initialized at 20°C regardless of zone climate.
    // Fix: soil temperature should derive from zone.avg_temps_by_week[0].
    const coldSpringZone: ClimateZone = {
      ...TEST_ZONE,
      id: 'cold_spring_zone',
      avg_temps_by_week: [5, ...Array.from({ length: 29 }, () => 20)],
    };
    const session = createGameSession({
      seed: 42,
      zone: coldSpringZone,
      speciesLookup,
    });

    const soil = session.getSoil(0, 0)!;
    // Should be near the zone's week 1 temperature (5°C), not the old hardcoded 20°C.
    expect(soil.temperature_c).toBeCloseTo(5, 0);
  });

  it('initializes soil temperature matching a warm-zone week 1 average', () => {
    const warmZone: ClimateZone = {
      ...TEST_ZONE,
      id: 'warm_zone',
      avg_temps_by_week: [25, ...Array.from({ length: 29 }, () => 28)],
    };
    const session = createGameSession({
      seed: 42,
      zone: warmZone,
      speciesLookup,
    });

    const soil = session.getSoil(0, 0)!;
    expect(soil.temperature_c).toBeCloseTo(25, 0);
  });
});
