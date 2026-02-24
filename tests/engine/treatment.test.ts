/**
 * Tests for the treatment feedback system (WS2.3).
 *
 * Covers:
 * - Treatment-to-condition mapping
 * - Evaluation logic (correct/wrong diagnosis × correct/wrong treatment)
 * - The treatment feedback ECS system (delayed outcome processing)
 * - Integration with game-session (interveneAction → tick → feedback)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type {
  SimulationContext,
  ActiveCondition,
  ActiveTreatment,
  Entity,
} from '../../src/lib/engine/ecs/components.js';
import {
  makeDefaultWeather,
  makeSpeciesLookup,
  setupSinglePlot,
  plantSpecies,
  TOMATO,
} from './fixtures.js';
import {
  isTreatmentEffective,
  evaluateTreatment,
  applyTreatmentOutcome,
  TREATMENT_DATABASE,
} from '../../src/lib/engine/treatment.js';
import { CONDITION_DATABASE } from '../../src/lib/engine/diagnosis.js';
import { treatmentFeedbackSystem } from '../../src/lib/engine/ecs/systems/treatment.js';
import { createGameSession, type GameSession } from '../../src/lib/engine/game-session.js';
import { TurnPhase } from '../../src/lib/engine/turn-manager.js';
import type { ClimateZone } from '../../src/lib/engine/weather-gen.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeCtx(world: GameWorld, overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    world,
    weather: makeDefaultWeather(),
    currentWeek: 10,
    rng: createRng(42),
    speciesLookup: makeSpeciesLookup(),
    firstFrostWeekAvg: 30,
    ...overrides,
  };
}

function makeTreatment(overrides: Partial<ActiveTreatment> = {}): ActiveTreatment {
  return {
    action: 'spray_fungicide',
    targetCondition: 'early_blight',
    applied_week: 8,
    feedback_week: 9,
    ...overrides,
  };
}

function makeCondition(overrides: Partial<ActiveCondition> = {}): ActiveCondition {
  return {
    conditionId: 'early_blight',
    onset_week: 5,
    current_stage: 0,
    severity: 0.2,
    ...overrides,
  };
}

// ── isTreatmentEffective ────────────────────────────────────────────

describe('isTreatmentEffective', () => {
  it('returns true for spray_fungicide against early_blight', () => {
    expect(isTreatmentEffective('spray_fungicide', 'early_blight')).toBe(true);
  });

  it('returns true for prune against early_blight', () => {
    expect(isTreatmentEffective('prune', 'early_blight')).toBe(true);
  });

  it('returns false for spray_neem against early_blight (wrong category)', () => {
    expect(isTreatmentEffective('spray_neem', 'early_blight')).toBe(false);
  });

  it('returns true for spray_neem against aphid_damage', () => {
    expect(isTreatmentEffective('spray_neem', 'aphid_damage')).toBe(true);
  });

  it('returns true for hand_pick against hornworm_damage', () => {
    expect(isTreatmentEffective('hand_pick', 'hornworm_damage')).toBe(true);
  });

  it('returns true for adjust_watering against overwatering', () => {
    expect(isTreatmentEffective('adjust_watering', 'overwatering')).toBe(true);
  });

  it('returns true for amend_soil against nitrogen_deficiency', () => {
    expect(isTreatmentEffective('amend_soil', 'nitrogen_deficiency')).toBe(true);
  });

  it('returns false for unknown treatment action', () => {
    expect(isTreatmentEffective('dance_around_plant', 'early_blight')).toBe(false);
  });

  it('returns false for pull_plant against any condition (special case)', () => {
    // pull_plant has empty effective_against — it's handled specially
    expect(isTreatmentEffective('pull_plant', 'early_blight')).toBe(false);
  });
});

// ── TREATMENT_DATABASE integrity ────────────────────────────────────

describe('TREATMENT_DATABASE', () => {
  it('contains all expected treatment actions', () => {
    const expectedActions = [
      'prune', 'spray_fungicide', 'spray_neem', 'hand_pick',
      'adjust_watering', 'amend_soil', 'pull_plant', 'monitor',
    ];
    for (const action of expectedActions) {
      expect(TREATMENT_DATABASE[action]).toBeDefined();
      expect(TREATMENT_DATABASE[action].id).toBe(action);
      expect(TREATMENT_DATABASE[action].name.length).toBeGreaterThan(0);
    }
  });

  it('every effective_against entry references a known condition', () => {
    for (const [_id, def] of Object.entries(TREATMENT_DATABASE)) {
      for (const conditionId of def.effective_against) {
        expect(CONDITION_DATABASE[conditionId]).toBeDefined();
      }
    }
  });
});

// ── evaluateTreatment ───────────────────────────────────────────────

describe('evaluateTreatment', () => {
  it('correct diagnosis + correct treatment with low severity → resolved', () => {
    const treatment = makeTreatment({
      action: 'spray_fungicide',
      targetCondition: 'early_blight',
    });
    const conditions = [makeCondition({ conditionId: 'early_blight', severity: 0.2 })];
    const outcome = evaluateTreatment(treatment, conditions);

    expect(outcome.diagnosisCorrect).toBe(true);
    expect(outcome.treatmentEffective).toBe(true);
    expect(outcome.result).toBe('resolved');
  });

  it('correct diagnosis + correct treatment with high severity → stabilized', () => {
    const treatment = makeTreatment({
      action: 'spray_fungicide',
      targetCondition: 'early_blight',
    });
    const conditions = [makeCondition({ conditionId: 'early_blight', severity: 0.6 })];
    const outcome = evaluateTreatment(treatment, conditions);

    expect(outcome.diagnosisCorrect).toBe(true);
    expect(outcome.treatmentEffective).toBe(true);
    expect(outcome.result).toBe('stabilized');
  });

  it('correct diagnosis + wrong treatment → ineffective', () => {
    const treatment = makeTreatment({
      action: 'spray_neem', // neem doesn't treat fungal early_blight
      targetCondition: 'early_blight',
    });
    const conditions = [makeCondition({ conditionId: 'early_blight', severity: 0.3 })];
    const outcome = evaluateTreatment(treatment, conditions);

    expect(outcome.diagnosisCorrect).toBe(true);
    expect(outcome.treatmentEffective).toBe(false);
    expect(outcome.result).toBe('ineffective');
  });

  it('wrong diagnosis + any treatment → worsened', () => {
    const treatment = makeTreatment({
      action: 'spray_fungicide',
      targetCondition: 'nitrogen_deficiency', // not actually present
    });
    const conditions = [makeCondition({ conditionId: 'early_blight', severity: 0.3 })];
    const outcome = evaluateTreatment(treatment, conditions);

    expect(outcome.diagnosisCorrect).toBe(false);
    expect(outcome.result).toBe('worsened');
  });

  it('wrong diagnosis with no conditions → worsened', () => {
    const treatment = makeTreatment({
      action: 'spray_fungicide',
      targetCondition: 'early_blight',
    });
    const outcome = evaluateTreatment(treatment, []);

    expect(outcome.diagnosisCorrect).toBe(false);
    expect(outcome.result).toBe('worsened');
  });
});

// ── applyTreatmentOutcome ───────────────────────────────────────────

describe('applyTreatmentOutcome', () => {
  it('resolved: removes the target condition from the list', () => {
    const conditions = [
      makeCondition({ conditionId: 'early_blight', severity: 0.2 }),
      makeCondition({ conditionId: 'blossom_end_rot', severity: 0.1 }),
    ];
    applyTreatmentOutcome(
      { action: 'spray_fungicide', targetCondition: 'early_blight', diagnosisCorrect: true, treatmentEffective: true, result: 'resolved' },
      conditions,
    );

    expect(conditions).toHaveLength(1);
    expect(conditions[0].conditionId).toBe('blossom_end_rot');
  });

  it('stabilized: reduces severity of the target condition', () => {
    const conditions = [
      makeCondition({ conditionId: 'early_blight', severity: 0.6 }),
    ];
    applyTreatmentOutcome(
      { action: 'spray_fungicide', targetCondition: 'early_blight', diagnosisCorrect: true, treatmentEffective: true, result: 'stabilized' },
      conditions,
    );

    expect(conditions[0].severity).toBeLessThan(0.6);
    expect(conditions[0].severity).toBeCloseTo(0.45, 2);
  });

  it('ineffective: no change to conditions', () => {
    const conditions = [
      makeCondition({ conditionId: 'early_blight', severity: 0.5 }),
    ];
    const severityBefore = conditions[0].severity;
    applyTreatmentOutcome(
      { action: 'spray_neem', targetCondition: 'early_blight', diagnosisCorrect: true, treatmentEffective: false, result: 'ineffective' },
      conditions,
    );

    expect(conditions[0].severity).toBe(severityBefore);
  });

  it('worsened: bumps severity on all conditions', () => {
    const conditions = [
      makeCondition({ conditionId: 'early_blight', severity: 0.3 }),
      makeCondition({ conditionId: 'blossom_end_rot', severity: 0.2 }),
    ];
    applyTreatmentOutcome(
      { action: 'spray_fungicide', targetCondition: 'nitrogen_deficiency', diagnosisCorrect: false, treatmentEffective: false, result: 'worsened' },
      conditions,
    );

    expect(conditions[0].severity).toBeCloseTo(0.4, 2);
    expect(conditions[1].severity).toBeCloseTo(0.3, 2);
  });

  it('worsened: severity does not exceed 1', () => {
    const conditions = [
      makeCondition({ conditionId: 'early_blight', severity: 0.95 }),
    ];
    applyTreatmentOutcome(
      { action: 'spray_fungicide', targetCondition: 'nitrogen_deficiency', diagnosisCorrect: false, treatmentEffective: false, result: 'worsened' },
      conditions,
    );

    expect(conditions[0].severity).toBeLessThanOrEqual(1);
  });

  it('stabilized: severity does not go below 0', () => {
    const conditions = [
      makeCondition({ conditionId: 'early_blight', severity: 0.05 }),
    ];
    applyTreatmentOutcome(
      { action: 'spray_fungicide', targetCondition: 'early_blight', diagnosisCorrect: true, treatmentEffective: true, result: 'stabilized' },
      conditions,
    );

    expect(conditions[0].severity).toBeGreaterThanOrEqual(0);
  });
});

// ── treatmentFeedbackSystem ─────────────────────────────────────────

describe('treatmentFeedbackSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('does nothing when no plants have treatments', () => {
    setupSinglePlot(world, 0, 0);
    plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const result = treatmentFeedbackSystem(makeCtx(world));
    expect(result.outcomes).toHaveLength(0);
  });

  it('does not process treatments before feedback_week', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.2 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({ feedback_week: 12 })],
    };

    // Current week 10 < feedback_week 12
    const result = treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));
    expect(result.outcomes).toHaveLength(0);
    // Treatment should still be pending
    expect((plant as Entity).activeTreatments!.treatments).toHaveLength(1);
  });

  it('processes treatments when feedback_week is reached', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.2 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({ feedback_week: 10 })],
    };

    const result = treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].outcome.result).toBe('resolved');
    // Treatment should be consumed
    expect((plant as Entity).activeTreatments!.treatments).toHaveLength(0);
  });

  it('correct treatment resolves low-severity condition (removes it)', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.15 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({
        action: 'spray_fungicide',
        targetCondition: 'early_blight',
        feedback_week: 10,
      })],
    };

    treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));

    // Condition should be removed
    expect(plant.activeConditions!.conditions).toHaveLength(0);
  });

  it('correct treatment stabilizes high-severity condition (reduces severity)', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.7 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({
        action: 'spray_fungicide',
        targetCondition: 'early_blight',
        feedback_week: 10,
      })],
    };

    treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));

    // Condition should still exist but with reduced severity
    expect(plant.activeConditions!.conditions).toHaveLength(1);
    expect(plant.activeConditions!.conditions[0].severity).toBeLessThan(0.7);
  });

  it('wrong treatment leaves condition unchanged', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.5 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({
        action: 'spray_neem', // wrong for fungal
        targetCondition: 'early_blight',
        feedback_week: 10,
      })],
    };

    treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));

    expect(plant.activeConditions!.conditions).toHaveLength(1);
    expect(plant.activeConditions!.conditions[0].severity).toBe(0.5);
  });

  it('wrong diagnosis worsens all conditions', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [
        makeCondition({ conditionId: 'early_blight', severity: 0.3 }),
        makeCondition({ conditionId: 'blossom_end_rot', severity: 0.2 }),
      ],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({
        action: 'amend_soil',
        targetCondition: 'nitrogen_deficiency', // not present
        feedback_week: 10,
      })],
    };

    treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));

    expect(plant.activeConditions!.conditions[0].severity).toBeCloseTo(0.4, 2);
    expect(plant.activeConditions!.conditions[1].severity).toBeCloseTo(0.3, 2);
  });

  it('pull_plant kills the plant entity', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight' })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({
        action: 'pull_plant',
        targetCondition: 'early_blight',
        feedback_week: 10,
      })],
    };

    const result = treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));

    expect((plant as { dead?: boolean }).dead).toBe(true);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].outcome.result).toBe('resolved');
  });

  it('skips dead plants', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    world.addComponent(plant, 'dead', true);
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({ feedback_week: 10 })],
    };

    const result = treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));
    expect(result.outcomes).toHaveLength(0);
  });

  it('processes multiple treatments on the same plant in one tick', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [
        makeCondition({ conditionId: 'early_blight', severity: 0.2 }),
        makeCondition({ conditionId: 'blossom_end_rot', severity: 0.2 }),
      ],
    };
    (plant as Entity).activeTreatments = {
      treatments: [
        makeTreatment({
          action: 'spray_fungicide',
          targetCondition: 'early_blight',
          feedback_week: 10,
        }),
        makeTreatment({
          action: 'adjust_watering',
          targetCondition: 'blossom_end_rot',
          feedback_week: 10,
        }),
      ],
    };

    const result = treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));
    expect(result.outcomes).toHaveLength(2);
    // Both should be resolved (low severity + correct treatment)
    expect(result.outcomes[0].outcome.result).toBe('resolved');
    expect(result.outcomes[1].outcome.result).toBe('resolved');
  });

  it('keeps pending treatments when feedback_week not yet reached', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.2 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [
        makeTreatment({ feedback_week: 10 }), // ready
        makeTreatment({ action: 'prune', targetCondition: 'early_blight', feedback_week: 12 }), // not ready
      ],
    };

    treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));

    // Only the future treatment remains
    expect((plant as Entity).activeTreatments!.treatments).toHaveLength(1);
    expect((plant as Entity).activeTreatments!.treatments[0].feedback_week).toBe(12);
  });

  it('reports outcomes with correct plant location', () => {
    setupSinglePlot(world, 1, 2);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 1, 2);
    plant.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.2 })],
    };
    (plant as Entity).activeTreatments = {
      treatments: [makeTreatment({ feedback_week: 10 })],
    };

    const result = treatmentFeedbackSystem(makeCtx(world, { currentWeek: 10 }));
    expect(result.outcomes[0].row).toBe(1);
    expect(result.outcomes[0].col).toBe(2);
    expect(result.outcomes[0].speciesId).toBe('tomato_cherokee_purple');
  });
});

// ── Integration: interveneAction → tick → feedback ──────────────────

describe('treatment feedback integration', () => {
  // These tests use the full game session to verify end-to-end behavior

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

  function createTestSession(): GameSession {
    return createGameSession({
      seed: 42,
      zone: TEST_ZONE,
      speciesLookup: makeSpeciesLookup(),
      gridRows: 3,
      gridCols: 3,
    });
  }

  function advanceToAct(session: GameSession): void {
    session.advancePhase(); // DAWN → PLAN
    session.advancePhase(); // PLAN → ACT
  }

  it('interveneAction records a treatment on the plant entity', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);

    // Manually add a condition so intervene makes sense
    const plants = session.world.with('species', 'plotSlot');
    let plant: Entity | undefined;
    for (const p of plants) {
      if (p.plotSlot.row === 0 && p.plotSlot.col === 0) {
        plant = p as Entity;
        break;
      }
    }
    expect(plant).toBeDefined();
    plant!.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.2 })],
    };

    const result = session.interveneAction('spray_fungicide', 0, 0, 'early_blight');
    expect(result.ok).toBe(true);

    // Check that treatment was recorded on the entity
    expect(plant!.activeTreatments).toBeDefined();
    expect(plant!.activeTreatments!.treatments).toHaveLength(1);
    expect(plant!.activeTreatments!.treatments[0].action).toBe('spray_fungicide');
    expect(plant!.activeTreatments!.treatments[0].targetCondition).toBe('early_blight');
  });

  it('INTERVENE event includes target_condition', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);
    session.interveneAction('prune', 0, 0, 'early_blight');

    const events = session.eventLog.toJSON();
    const interveneEvent = events.find((e) => e.type === 'INTERVENE');
    expect(interveneEvent).toBeDefined();
    expect(interveneEvent!.type === 'INTERVENE' && interveneEvent!.target_condition).toBe('early_blight');
  });

  it('treatment feedback appears in DuskTickResult after delay', () => {
    const session = createTestSession();
    advanceToAct(session);

    session.plantAction('tomato_cherokee_purple', 0, 0);

    // Manually add a condition
    const plants = session.world.with('species', 'plotSlot');
    let plant: Entity | undefined;
    for (const p of plants) {
      if (p.plotSlot.row === 0 && p.plotSlot.col === 0) {
        plant = p as Entity;
        break;
      }
    }
    plant!.activeConditions = {
      conditions: [makeCondition({ conditionId: 'early_blight', severity: 0.2 })],
    };

    session.interveneAction('spray_fungicide', 0, 0, 'early_blight');

    // End actions → triggers DUSK tick (but treatment has 1-week delay)
    const duskResult1 = session.endActions();
    // First tick: treatment not yet ready (feedback_week = current + 1)
    // Advance to next week to guarantee the feedback fires.
    while (session.getPhase() !== TurnPhase.ACT) {
      if (session.isRunEnded()) break;
      session.advancePhase();
    }

    // Now end actions for the second week — treatment feedback should fire
    const duskResult2 = session.endActions();

    // The treatment outcome should appear in one of the dusk results
    const hasFeedback = (duskResult1?.treatmentOutcomes?.length ?? 0) > 0
      || (duskResult2?.treatmentOutcomes?.length ?? 0) > 0;
    expect(hasFeedback).toBe(true);
  });
});
