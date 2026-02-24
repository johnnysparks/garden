import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { weatherApplySystem } from '../../src/lib/engine/ecs/systems/weather.js';
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

describe('weatherApplySystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  // ── No-op when no special event ──────────────────────────────────

  it('does nothing when there is no special weather event', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({ special: null }),
    });

    weatherApplySystem(ctx);

    expect(plant.health!.value).toBe(1);
  });

  // ── Hail tests ───────────────────────────────────────────────────

  it('hail reduces plant health based on damage_severity', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'hail', damage_severity: 0.8 },
      }),
    });

    weatherApplySystem(ctx);

    // damage = 0.8 * 0.3 * 1.0 = 0.24
    expect(plant.health!.value).toBeCloseTo(0.76, 2);
  });

  it('hail deals more damage to seedlings', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'seedling';

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'hail', damage_severity: 0.8 },
      }),
    });

    weatherApplySystem(ctx);

    // damage = 0.8 * 0.3 * 1.5 = 0.36
    expect(plant.health!.value).toBeCloseTo(0.64, 2);
  });

  it('hail deals minimal damage to seeds (underground)', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    // Default stage is 'seed'

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'hail', damage_severity: 0.8 },
      }),
    });

    weatherApplySystem(ctx);

    // damage = 0.8 * 0.3 * 0.2 = 0.048
    expect(plant.health!.value).toBeCloseTo(0.952, 2);
  });

  it('hail does not reduce health below 0', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';
    plant.health!.value = 0.1;

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'hail', damage_severity: 1.0 },
      }),
    });

    weatherApplySystem(ctx);

    expect(plant.health!.value).toBeGreaterThanOrEqual(0);
  });

  it('hail skips dead plants', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';
    world.addComponent(plant, 'dead', true);

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'hail', damage_severity: 1.0 },
      }),
    });

    weatherApplySystem(ctx);

    // Health should remain untouched
    expect(plant.health!.value).toBe(1);
  });

  // ── Heavy rain tests ─────────────────────────────────────────────

  it('heavy rain increases soil compaction', () => {
    setupSinglePlot(world, 0, 0, { compaction: 0.2 });

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'heavy_rain', flood_risk: 0.7 },
      }),
    });

    weatherApplySystem(ctx);

    const plot = world.with('plotSlot', 'soil').first;
    // compaction = 0.2 + 0.7 * 0.1 = 0.27
    expect(plot!.soil.compaction).toBeCloseTo(0.27, 2);
  });

  it('heavy rain compaction is clamped to 1', () => {
    setupSinglePlot(world, 0, 0, { compaction: 0.98 });

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'heavy_rain', flood_risk: 1.0 },
      }),
    });

    weatherApplySystem(ctx);

    const plot = world.with('plotSlot', 'soil').first;
    expect(plot!.soil.compaction).toBeLessThanOrEqual(1);
  });

  // ── Other events are no-ops for this system ──────────────────────

  it('drought event does not affect plants directly (handled by soil system)', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world, {
      weather: makeDefaultWeather({
        special: { type: 'drought', duration_weeks: 3, moisture_penalty: 0.2 },
      }),
    });

    weatherApplySystem(ctx);

    expect(plant.health!.value).toBe(1);
  });
});
