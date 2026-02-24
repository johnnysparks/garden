import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { stressAccumulateSystem } from '../../src/lib/engine/ecs/systems/stress.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext } from '../../src/lib/engine/ecs/components.js';
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

describe('stressAccumulateSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('no stress accumulates in ideal conditions', () => {
    // Tomato needs: pH 6.0–6.8, water moderate (0.5), soil_temp_min 15
    setupSinglePlot(world, 0, 0, {
      ph: 6.4,
      moisture: 0.5,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Ideal temperature (25°C avg, tomato ideal = 15+10 = 25)
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 28, temp_low_c: 22 }),
    });

    stressAccumulateSystem(ctx);

    // Should recover (stress decreases by 0.03)
    expect(plant.health!.stress).toBe(0); // was 0, can't go below 0
  });

  it('accumulates stress when pH is out of range', () => {
    setupSinglePlot(world, 0, 0, { ph: 4.5 }); // far below 6.0 min
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('accumulates stress when underwatered', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.1 }); // way below ideal 0.5
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('accumulates stress when overwatered', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.9 }); // way above ideal 0.5
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('accumulates stress from extreme temperature', () => {
    // Very cold soil (0°C, ideal = 25°C, diff = 25 > 10)
    setupSinglePlot(world, 0, 0, { temperature_c: 0 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('accumulates stress from nutrient deficiency', () => {
    setupSinglePlot(world, 0, 0, {
      nitrogen: 0.05,
      phosphorus: 0.05,
      potassium: 0.05,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    // Should accumulate 0.06 × 3 = 0.18 from nutrient deficiency
    expect(plant.health!.stress).toBeGreaterThanOrEqual(0.15);
  });

  it('stress recovers when all conditions are met', () => {
    setupSinglePlot(world, 0, 0, {
      ph: 6.4,
      moisture: 0.5,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.5; // pre-existing stress

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 28, temp_low_c: 22 }),
    });

    stressAccumulateSystem(ctx);

    expect(plant.health!.stress).toBeLessThan(0.5);
  });

  it('stress is clamped to [0, 1]', () => {
    setupSinglePlot(world, 0, 0, {
      ph: 4.0,
      moisture: 0.05,
      nitrogen: 0.01,
      phosphorus: 0.01,
      potassium: 0.01,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.95;

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 2, temp_low_c: -2 }),
    });

    // Multiple ticks to push stress high
    for (let i = 0; i < 10; i++) {
      stressAccumulateSystem(ctx);
    }

    expect(plant.health!.stress).toBeLessThanOrEqual(1);
    expect(plant.health!.stress).toBeGreaterThanOrEqual(0);
  });

  it('health is derived from stress and disease', () => {
    setupSinglePlot(world, 0, 0, { ph: 4.0, moisture: 0.05 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    // Health should decrease as stress increases
    expect(plant.health!.value).toBeLessThan(1);
    expect(plant.health!.value).toBeGreaterThanOrEqual(0);
  });

  it('active diseases reduce health further', () => {
    setupSinglePlot(world, 0, 0, { ph: 6.4, moisture: 0.5 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.2;
    plant.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 5, current_stage: 2, severity: 0.5 },
      ],
    };

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 28, temp_low_c: 22 }),
    });

    stressAccumulateSystem(ctx);

    // Health should be reduced by both stress and disease
    expect(plant.health!.value).toBeLessThan(0.8);
  });

  it('dead plants are skipped', () => {
    setupSinglePlot(world, 0, 0, { ph: 4.0 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    world.addComponent(plant, 'dead', true);
    const stressBefore = plant.health!.stress;

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBe(stressBefore);
  });
});
