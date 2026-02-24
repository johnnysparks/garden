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
    plant.growth!.stage = 'vegetative';

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
    plant.growth!.stage = 'vegetative';
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
    plant.growth!.stage = 'vegetative';

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
    plant.growth!.stage = 'vegetative';

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
    plant.growth!.stage = 'vegetative';
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
      p1.growth!.stage = 'vegetative';
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
      p2.growth!.stage = 'vegetative';
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

  it('seeds and germinating plants are immune to disease', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    // plant starts at 'seed' stage by default

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.95 }),
    });

    for (let i = 0; i < 50; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    expect(plant.activeConditions!.conditions.length).toBe(0);
  });

  it('species with no vulnerabilities are unaffected', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'rosemary', 0, 0); // rosemary has no vulns
    plant.growth!.stage = 'vegetative';

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.95 }),
    });

    for (let i = 0; i < 50; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    expect(plant.activeConditions!.conditions.length).toBe(0);
  });

  it('does not onset disease before min_stage is reached', () => {
    setupSinglePlot(world, 0, 0, { nitrogen: 0.2, phosphorus: 0.2, potassium: 0.2, moisture: 0.8 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'seedling'; // blossom_end_rot requires min_stage 'fruiting'
    plant.health!.stress = 0.9;

    const ctx = makeCtx(world);

    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    // blossom_end_rot should not appear on a seedling
    const berConditions = plant.activeConditions!.conditions.filter(
      (c) => c.conditionId === 'blossom_end_rot',
    );
    expect(berConditions.length).toBe(0);
  });

  it('can onset disease once min_stage is reached', () => {
    setupSinglePlot(world, 0, 0, { nitrogen: 0.2, phosphorus: 0.2, potassium: 0.2, moisture: 0.8 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'fruiting'; // meets min_stage for blossom_end_rot
    plant.health!.stress = 0.5;

    const ctx = makeCtx(world);

    let berStarted = false;
    for (let i = 0; i < 100; i++) {
      const rng = createRng(i);
      diseaseCheckSystem({ ...ctx, rng });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'blossom_end_rot')) {
        berStarted = true;
        break;
      }
    }

    expect(berStarted).toBe(true);
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

  it('disease severity increases each tick (capped at 1)', () => {
    // Use blossom_end_rot which has weeks_to_death: null (plant does not die from it),
    // so severity can accumulate freely across many ticks.
    setupSinglePlot(world, 0, 0, { nitrogen: 0.2, phosphorus: 0.2, potassium: 0.2 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'fruiting';
    plant.activeConditions = {
      conditions: [
        { conditionId: 'blossom_end_rot', onset_week: 1, current_stage: 0, severity: 0.1 },
      ],
    };

    // 20 ticks × 0.05 = +1.0, so severity should be clamped to 1.0
    for (let week = 2; week <= 22; week++) {
      diseaseCheckSystem(makeCtx(world, { currentWeek: week }));
    }

    const condition = plant.activeConditions!.conditions[0];
    expect(condition.severity).toBeLessThanOrEqual(1);
    expect(condition.severity).toBeGreaterThan(0.7); // grew significantly across 20 ticks
  });
});

// ── Additional trigger type coverage ─────────────────────────────────────────

describe('diseaseCheckSystem – additional trigger types', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('overwater trigger causes disease onset at high moisture', () => {
    // blossom_end_rot has an overwater trigger (threshold: 0.7)
    setupSinglePlot(world, 0, 0, { moisture: 0.95, nitrogen: 0.2, phosphorus: 0.2, potassium: 0.2 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'fruiting';
    plant.health!.stress = 0.5;

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'blossom_end_rot')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('nutrient_deficiency trigger causes disease onset when nutrients are low', () => {
    // blossom_end_rot also has a nutrient_deficiency trigger (threshold: 0.5)
    setupSinglePlot(world, 0, 0, { nitrogen: 0.1, phosphorus: 0.1, potassium: 0.1, moisture: 0.5 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'fruiting';
    plant.health!.stress = 0.5;

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'blossom_end_rot')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('temp_high trigger fires on warm weeks', () => {
    // Custom vulnerability using temp_high trigger
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'heat_stress_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'temp_high' as const, threshold: 25 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'wilting', description: 'Wilting.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    // avg temp = (36 + 26) / 2 = 31 >= 25 threshold
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 36, temp_low_c: 26 }),
      speciesLookup: customLookup,
    });

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'heat_stress_disease')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('temp_high trigger does not fire on cool weeks', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'heat_stress_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'temp_high' as const, threshold: 30 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'wilting', description: 'Wilting.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    // avg temp = (20 + 10) / 2 = 15 < 30 threshold
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 20, temp_low_c: 10 }),
      speciesLookup: customLookup,
    });

    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
    }

    expect(plant.activeConditions!.conditions.length).toBe(0);
  });

  it('temp_low trigger fires when temperatures drop', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'cold_snap_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'temp_low' as const, threshold: 10 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'chilling', description: 'Chilling injury.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    // avg temp = (8 + 2) / 2 = 5 <= 10 threshold
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 8, temp_low_c: 2 }),
      speciesLookup: customLookup,
    });

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'cold_snap_disease')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('humidity_low trigger fires when air is dry', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'dry_air_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'humidity_low' as const, threshold: 0.3 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'dry_tips', description: 'Dry leaf tips.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    // humidity 0.2 <= 0.3 threshold
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.2 }),
      speciesLookup: customLookup,
    });

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'dry_air_disease')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('ph_high trigger fires when soil pH is alkaline', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'alkalinity_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'ph_high' as const, threshold: 7.0 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'chlorosis', description: 'Iron chlorosis.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0, { ph: 7.5 }); // pH 7.5 >= 7.0 threshold
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...makeCtx(world, { speciesLookup: customLookup }), rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'alkalinity_disease')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('ph_low trigger fires when soil is acidic', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'acidity_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'ph_low' as const, threshold: 5.5 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'stunting', description: 'Stunted growth.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0, { ph: 4.5 }); // pH 4.5 <= 5.5 threshold
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...makeCtx(world, { speciesLookup: customLookup }), rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'acidity_disease')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('nutrient_excess trigger fires when any nutrient is very high', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'nutrient_burn',
          susceptibility: 0.9,
          triggers: [{ type: 'nutrient_excess' as const, threshold: 0.9 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'leaf_burn', description: 'Leaf burn.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0, { nitrogen: 0.95, phosphorus: 0.5, potassium: 0.5 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...makeCtx(world, { speciesLookup: customLookup }), rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'nutrient_burn')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('underwater trigger fires when soil moisture is very low', () => {
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      vulnerabilities: [
        {
          condition_id: 'drought_stress_disease',
          susceptibility: 0.9,
          triggers: [{ type: 'underwater' as const, threshold: 0.2 }],
          symptoms: {
            stages: [{ week: 0, visual_overlay: 'wilting', description: 'Severe wilt.', reversible: true }],
            weeks_to_death: null,
            spreads: false,
            spread_radius: 0,
          },
        },
      ],
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0, { moisture: 0.1 }); // moisture 0.1 <= 0.2 threshold
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    let diseaseStarted = false;
    for (let i = 0; i < 100; i++) {
      diseaseCheckSystem({ ...makeCtx(world, { speciesLookup: customLookup }), rng: createRng(i) });
      if (plant.activeConditions!.conditions.some((c) => c.conditionId === 'drought_stress_disease')) {
        diseaseStarted = true;
        break;
      }
    }

    expect(diseaseStarted).toBe(true);
  });

  it('multiple diseases can coexist on the same plant', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.8, nitrogen: 0.2, phosphorus: 0.2, potassium: 0.2 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'fruiting';
    plant.health!.stress = 0.7;

    // Pre-seed with early_blight, and let blossom_end_rot potentially develop
    plant.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 3, current_stage: 0, severity: 0.1 },
      ],
    };

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ humidity: 0.9 }),
    });

    let bothPresent = false;
    for (let i = 0; i < 200; i++) {
      diseaseCheckSystem({ ...ctx, rng: createRng(i) });
      if (
        plant.activeConditions!.conditions.some((c) => c.conditionId === 'early_blight') &&
        plant.activeConditions!.conditions.some((c) => c.conditionId === 'blossom_end_rot')
      ) {
        bothPresent = true;
        break;
      }
    }

    expect(bothPresent).toBe(true);
  });
});
