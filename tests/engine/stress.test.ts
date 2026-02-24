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

  it('stress recovery rate is sufficient to recover from seasonal stress within a season', () => {
    // Simulates zucchini stressed to 0.69 by week 8 due to cold soil,
    // then conditions improve. Recovery should be meaningful (~0.06/week).
    setupSinglePlot(world, 0, 0, {
      ph: 6.5,
      moisture: 0.5,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.69; // high stress from early-season cold

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 28, temp_low_c: 22 }),
    });

    stressAccumulateSystem(ctx);

    // Should recover by at least 0.05 per tick (enough to matter within a season)
    expect(plant.health!.stress).toBeLessThanOrEqual(0.64);
  });

  it('stress stabilizes when conditions are nearly ideal (partial recovery)', () => {
    // pH very slightly outside range (6.0 min, soil is 5.95): stressDelta = 0.05 * 0.05 = 0.0025
    // This tiny stressor should still allow partial recovery (-0.02), so net delta is negative.
    setupSinglePlot(world, 0, 0, {
      ph: 5.95, // just 0.05 below tomato's 6.0 minimum
      moisture: 0.5,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.health!.stress = 0.3;

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 28, temp_low_c: 22 }),
    });

    stressAccumulateSystem(ctx);

    // Near-ideal conditions should allow partial recovery, not further accumulation
    expect(plant.health!.stress).toBeLessThan(0.3);
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

  it('accumulates stress when pH is above the maximum', () => {
    // Tomato max pH is 6.8; soil pH of 8.0 is well above
    setupSinglePlot(world, 0, 0, { ph: 8.0 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    // stressDelta from pH = 0.05 * (8.0 - 6.8) = 0.06
    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('pH stress is proportional to how far outside the range', () => {
    // Slightly above max pH
    setupSinglePlot(world, 0, 0, { ph: 7.0 }); // 0.2 above tomato max 6.8
    const slightlyHigh = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Well above max pH
    setupSinglePlot(world, 1, 0, { ph: 8.5 }); // 1.7 above tomato max 6.8
    const veryHigh = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(veryHigh.health!.stress).toBeGreaterThan(slightlyHigh.health!.stress);
  });

  it('accumulates stress from very high temperature (too hot)', () => {
    // Tomato ideal soil temp = 15 + 10 = 25°C; very hot = 45°C (diff=20 > 10)
    setupSinglePlot(world, 0, 0, { temperature_c: 45 });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('temperature stress is proportional to deviation above ideal', () => {
    setupSinglePlot(world, 0, 0, { temperature_c: 36 }); // 11°C above ideal 25
    const slightlyHot = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    setupSinglePlot(world, 1, 0, { temperature_c: 50 }); // 25°C above ideal
    const veryHot = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(veryHot.health!.stress).toBeGreaterThan(slightlyHot.health!.stress);
  });

  it('no temperature stress within 10°C of ideal', () => {
    // Tomato ideal = 25°C; 30°C is 5°C away (within the 10°C tolerance band)
    setupSinglePlot(world, 0, 0, {
      ph: 6.4,
      moisture: 0.5,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
      temperature_c: 30, // 5°C above ideal 25, within tolerance
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 30, temp_low_c: 20 }),
    });

    stressAccumulateSystem(ctx);

    // All conditions met + temp within tolerance = recovery (-0.06), so stress stays at 0
    expect(plant.health!.stress).toBe(0);
  });

  it('low water-need plant (rosemary) stresses when overwatered', () => {
    // Rosemary needs water: 'low' (ideal 0.3); moisture 0.8 is overwatered
    setupSinglePlot(world, 0, 0, { moisture: 0.8 }); // 0.5 above ideal 0.3 = diff 0.5 > 0.25
    const plant = plantSpecies(world, 'rosemary', 0, 0);

    stressAccumulateSystem(makeCtx(world));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('high water-need plant stresses when underwatered', () => {
    // Custom species with water: 'high' (ideal 0.7); moisture 0.2 is dry
    const customSpecies = {
      ...makeSpeciesLookup()('tomato_cherokee_purple')!,
      needs: {
        ...makeSpeciesLookup()('tomato_cherokee_purple')!.needs,
        water: 'high' as const,
      },
    };
    const customLookup = (id: string) =>
      id === 'tomato_cherokee_purple' ? customSpecies : makeSpeciesLookup()(id);

    setupSinglePlot(world, 0, 0, { moisture: 0.2 }); // diff = 0.2 - 0.7 = -0.5, below -0.25
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    stressAccumulateSystem(makeCtx(world, { speciesLookup: customLookup }));

    expect(plant.health!.stress).toBeGreaterThan(0);
  });
});
