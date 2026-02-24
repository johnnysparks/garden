import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { soilUpdateSystem } from '../../src/lib/engine/ecs/systems/soil.js';
import { createRng } from '../../src/lib/engine/rng.js';
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
    rng: createRng(42),
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

  it('larger/more mature plant depletes nutrients faster', () => {
    setupSinglePlot(world, 0, 0, { nitrogen: 0.8 });
    const smallPlant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    smallPlant.growth!.progress = 0.1; // small plant

    setupSinglePlot(world, 1, 0, { nitrogen: 0.8 });
    const largePlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);
    largePlant.growth!.progress = 0.9; // large plant = more uptake

    soilUpdateSystem(makeCtx(world));

    const smallPlot = world.with('plotSlot', 'soil').entities.find(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 0,
    )!;
    const largePlot = world.with('plotSlot', 'soil').entities.find(
      (e) => e.plotSlot.row === 1 && e.plotSlot.col === 0,
    )!;

    // Large plant uptakeFactor = 0.01 + 0.9 * 0.02 = 0.028 vs small = 0.01 + 0.1 * 0.02 = 0.012
    expect(largePlot.soil.nitrogen).toBeLessThan(smallPlot.soil.nitrogen);
  });

  it('soil temperature moves toward air temperature each tick', () => {
    setupSinglePlot(world, 0, 0, { temperature_c: 10, organic_matter: 0.3 });
    const plot = world.with('plotSlot', 'soil').entities[0];
    const beforeTemp = plot.soil.temperature_c;

    // Hot weather — soil should warm up
    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 40, temp_low_c: 30 }), // avg 35°C
    });

    soilUpdateSystem(ctx);

    expect(plot.soil.temperature_c).toBeGreaterThan(beforeTemp);
  });

  it('high organic matter insulates soil temperature (slower change)', () => {
    // Low organic matter = less insulation = larger temperature change
    setupSinglePlot(world, 0, 0, { temperature_c: 10, organic_matter: 0.05 });
    const lowOmPlot = world.with('plotSlot', 'soil').entities.find(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 0,
    )!;

    // High organic matter = more insulation = smaller temperature change
    setupSinglePlot(world, 1, 0, { temperature_c: 10, organic_matter: 0.95 });
    const highOmPlot = world.with('plotSlot', 'soil').entities.find(
      (e) => e.plotSlot.row === 1 && e.plotSlot.col === 0,
    )!;

    const hotWeather = makeCtx(world, {
      weather: makeDefaultWeather({ temp_high_c: 40, temp_low_c: 30 }),
    });

    soilUpdateSystem(hotWeather);

    // Low organic matter soil should change temperature more dramatically
    const lowOmChange = Math.abs(lowOmPlot.soil.temperature_c - 10);
    const highOmChange = Math.abs(highOmPlot.soil.temperature_c - 10);
    expect(lowOmChange).toBeGreaterThan(highOmChange);
  });

  it('removed amendments are no longer applied on subsequent ticks', () => {
    setupSinglePlot(world, 0, 0, { ph: 5.5 });
    const plotEntity = world.with('plotSlot', 'soil').entities[0];
    world.addComponent(plotEntity, 'amendments', {
      pending: [
        {
          type: 'lime',
          applied_week: 5,
          effect_delay_weeks: 5, // matures at week 10
          effects: { ph: 0.3 },
        },
      ],
    });

    // First tick applies the amendment and removes it from pending
    soilUpdateSystem(makeCtx(world, { currentWeek: 10 }));
    const phAfterFirst = plotEntity.soil.ph;

    // Second tick — amendment already removed, pH should not change further from it
    soilUpdateSystem(makeCtx(world, { currentWeek: 11 }));
    const phAfterSecond = plotEntity.soil.ph;

    // pH may shift slightly from evaporation/temperature, but amendment effect is one-shot
    expect(plotEntity.amendments!.pending.length).toBe(0);
    // The pH difference between ticks 10 and 11 should be small (no amendment re-applied)
    expect(Math.abs(phAfterSecond - phAfterFirst)).toBeLessThan(0.3);
  });

  it('multiple plants on the same plot deplete nutrients more than one plant', () => {
    // Plot with two plants
    setupSinglePlot(world, 0, 0, { nitrogen: 0.8 });
    const p1 = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const p2 = plantSpecies(world, 'basil_genovese', 0, 0);
    p1.growth!.progress = 0.5;
    p2.growth!.progress = 0.5;

    // Plot with one plant
    setupSinglePlot(world, 1, 0, { nitrogen: 0.8 });
    const p3 = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);
    p3.growth!.progress = 0.5;

    soilUpdateSystem(makeCtx(world));

    const twoPlantsPlot = world.with('plotSlot', 'soil').entities.find(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 0,
    )!;
    const onePlantPlot = world.with('plotSlot', 'soil').entities.find(
      (e) => e.plotSlot.row === 1 && e.plotSlot.col === 0,
    )!;

    expect(twoPlantsPlot.soil.nitrogen).toBeLessThan(onePlantPlot.soil.nitrogen);
  });
});
