import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { diseaseCheckSystem } from '../../src/lib/engine/ecs/systems/disease.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext, ActiveCondition } from '../../src/lib/engine/ecs/components.js';
import {
  makeDefaultWeather,
  makeSpeciesLookup,
  setupSinglePlot,
  plantSpecies,
} from './fixtures.js';

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

describe('diseaseCheckSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('does not start disease when triggers are not met', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Low humidity = early_blight trigger not met (needs >= 0.7)
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.3 }),
    });

    diseaseCheckSystem(ctx);

    const conditions = plant.activeConditions!.conditions;
    expect(conditions.length).toBe(0);
  });

  it('can onset disease when triggers are met and RNG allows', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.5; // high stress increases probability

    // High humidity triggers early_blight
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.9 }),
    });

    // Run many ticks with fresh RNG each time to find one that triggers
    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      const rng = createRng(i);
      diseaseCheckSystem({ ...ctx, rng });
      if (plant.activeConditions!.conditions.length > 0) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('progresses existing disease symptom stages', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Pre-existing disease from week 5
    plant.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 5, current_stage: 0, severity: 0.1 },
      ],
    };

    // At week 8 (3 weeks after onset), should progress to stage 1 (week >= 2)
    const ctx = makeCtx(world, { currentWeek: 8 });
    diseaseCheckSystem(ctx);

    expect(plant.activeConditions!.conditions[0].current_stage).toBeGreaterThanOrEqual(1);
    expect(plant.activeConditions!.conditions[0].severity).toBeGreaterThan(0.1);
  });

  it('kills plant when disease reaches weeks_to_death', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Disease started 8 weeks ago (early_blight weeks_to_death = 8)
    plant.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.8 },
      ],
    };

    const ctx = makeCtx(world, { currentWeek: 10 }); // 10 - 2 = 8 weeks
    diseaseCheckSystem(ctx);

    expect((plant as { dead?: boolean }).dead).toBe(true);
  });

  it('does not duplicate existing conditions', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.9;

    plant.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 5, current_stage: 0, severity: 0.1 },
      ],
    };

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.95 }),
    });

    // Run multiple times
    for (let i = 0; i < 20; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    // Should still only have one early_blight entry
    const blightCount = plant.activeConditions!.conditions.filter(
      (c) => c.conditionId === 'early_blight',
    ).length;
    expect(blightCount).toBe(1);
  });

  it('high stress increases disease onset probability', () => {
    // onset_probability = susceptibility × trigger_score × (1 + stress)
    // With stress=0.9: prob = 0.6 × 0.7 × 1.9 = 0.798
    // With stress=0:   prob = 0.6 × 0.7 × 1.0 = 0.42

    let stressedOnsets = 0;
    let calmOnsets = 0;
    const trials = 200;

    for (let seed = 0; seed < trials; seed++) {
      // Stressed plant
      const w1 = createWorld();
      setupSinglePlot(w1, 0, 0);
      const p1 = plantSpecies(w1, 'tomato_cherokee_purple', 0, 0);
      p1.health!.stress = 0.9;
      diseaseCheckSystem({
        ...makeCtx(w1, { weather: makeDefaultWeather({ humidity: 0.9 }) }),
        rng: createRng(seed),
      });
      if (p1.activeConditions!.conditions.length > 0) stressedOnsets++;

      // Calm plant
      const w2 = createWorld();
      setupSinglePlot(w2, 0, 0);
      const p2 = plantSpecies(w2, 'tomato_cherokee_purple', 0, 0);
      p2.health!.stress = 0;
      diseaseCheckSystem({
        ...makeCtx(w2, { weather: makeDefaultWeather({ humidity: 0.9 }) }),
        rng: createRng(seed),
      });
      if (p2.activeConditions!.conditions.length > 0) calmOnsets++;
    }

    // Stressed plants should get disease more often
    expect(stressedOnsets).toBeGreaterThan(calmOnsets);
  });

  it('species with no vulnerabilities are unaffected', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'rosemary', 0, 0); // rosemary has no vulns

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.95 }),
    });

    for (let i = 0; i < 50; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    expect(plant.activeConditions!.conditions.length).toBe(0);
  });

  it('dead plants are skipped', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    world.addComponent(plant, 'dead', true);

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.95 }),
    });

    for (let i = 0; i < 50; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    expect(plant.activeConditions!.conditions.length).toBe(0);
  });
});
