import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { soilUpdateSystem } from '../../src/lib/engine/ecs/systems/soil.js';
import { SeededRNG } from '../../src/lib/engine/rng.js';
import type { SimulationContext } from '../../src/lib/engine/ecs/components.js';
import {
  makeDefaultSoil,
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
    rng: new SeededRNG(42),
    speciesLookup: makeSpeciesLookup(),
    firstFrostWeekAvg: 30,
    ...overrides,
  };
}

describe('soilUpdateSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('adjusts moisture from precipitation', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.3 });
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ precipitation_mm: 50 }),
    });

    const plot = world.with('soil').entities[0];
    const before = plot.soil.moisture;

    soilUpdateSystem(ctx);

    // Precipitation adds moisture (50/100 = 0.5 contrib, minus evaporation)
    expect(plot.soil.moisture).toBeGreaterThan(before);
  });

  it('evaporation increases with temperature', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.8 });
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ precipitation_mm: 0, temp_high_c: 40, temp_low_c: 30 }),
    });

    soilUpdateSystem(ctx);

    const plot = world.with('soil').entities[0];
    expect(plot.soil.moisture).toBeLessThan(0.8);
  });

  it('applies mature amendments', () => {
    setupSinglePlot(world, 0, 0, { ph: 5.5 });
    const plotEntity = world.with('plotSlot', 'soil').entities[0];
    // Add an amendment that matures at week 10
    world.addComponent(plotEntity, 'amendments', {
      pending: [
        {
          type: 'lime',
          applied_week: 5,
          effect_delay_weeks: 5, // matures at week 10
          effects: { ph: 0.5 },
        },
      ],
    });

    const ctx = makeCtx(world, { currentWeek: 10 });
    soilUpdateSystem(ctx);

    expect(plotEntity.soil.ph).toBeGreaterThan(5.5);
  });

  it('does not apply amendments before their delay expires', () => {
    setupSinglePlot(world, 0, 0, { ph: 5.5 });
    const plotEntity = world.with('plotSlot', 'soil').entities[0];
    world.addComponent(plotEntity, 'amendments', {
      pending: [
        {
          type: 'lime',
          applied_week: 8,
          effect_delay_weeks: 5, // matures at week 13
          effects: { ph: 0.5 },
        },
      ],
    });

    const ctx = makeCtx(world, { currentWeek: 10 });
    const phBefore = plotEntity.soil.ph;
    soilUpdateSystem(ctx);

    // pH should not have the amendment's +0.5 applied (only soil temp and minor changes)
    expect(plotEntity.soil.ph).toBeLessThan(phBefore + 0.5);
  });

  it('depletes nutrients when plants are present', () => {
    setupSinglePlot(world, 0, 0, { nitrogen: 0.8, phosphorus: 0.8, potassium: 0.8 });
    plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world);
    const plot = world.with('soil').entities[0];

    soilUpdateSystem(ctx);

    expect(plot.soil.nitrogen).toBeLessThan(0.8);
    expect(plot.soil.phosphorus).toBeLessThan(0.8);
    expect(plot.soil.potassium).toBeLessThan(0.8);
  });

  it('organic matter decays slowly each tick', () => {
    setupSinglePlot(world, 0, 0, { organic_matter: 0.5 });
    const ctx = makeCtx(world);
    const plot = world.with('soil').entities[0];

    soilUpdateSystem(ctx);

    expect(plot.soil.organic_matter).toBeLessThan(0.5);
    expect(plot.soil.organic_matter).toBeGreaterThan(0.4); // slow decay
  });

  it('biology recovers when organic matter is high', () => {
    setupSinglePlot(world, 0, 0, { organic_matter: 0.6, biology: 0.3 });
    const ctx = makeCtx(world);
    const plot = world.with('soil').entities[0];

    soilUpdateSystem(ctx);

    expect(plot.soil.biology).toBeGreaterThan(0.3);
  });

  it('biology declines when organic matter is low', () => {
    setupSinglePlot(world, 0, 0, { organic_matter: 0.1, biology: 0.5 });
    const ctx = makeCtx(world);
    const plot = world.with('soil').entities[0];

    soilUpdateSystem(ctx);

    expect(plot.soil.biology).toBeLessThan(0.5);
  });

  it('drought event reduces moisture further', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.6 });
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        precipitation_mm: 0,
        special: { type: 'drought', duration_weeks: 2, moisture_penalty: 0.3 },
      }),
    });
    const plot = world.with('soil').entities[0];

    soilUpdateSystem(ctx);

    // 0.6 - evaporation - 0.3 drought penalty should be noticeably lower
    expect(plot.soil.moisture).toBeLessThan(0.35);
  });

  it('clamps all soil values to valid ranges', () => {
    setupSinglePlot(world, 0, 0, { moisture: 0.01, nitrogen: 0.01 });
    // Plant on it to deplete further
    const p = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    p.growth!.progress = 0.9; // large plant depletes more

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ precipitation_mm: 0 }),
    });
    const plot = world.with('soil').entities[0];

    soilUpdateSystem(ctx);

    expect(plot.soil.moisture).toBeGreaterThanOrEqual(0);
    expect(plot.soil.nitrogen).toBeGreaterThanOrEqual(0);
  });
});
