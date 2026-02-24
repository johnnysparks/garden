import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { harvestCheckSystem } from '../../src/lib/engine/ecs/systems/harvest.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext } from '../../src/lib/engine/ecs/components.js';
import {
  TOMATO,
  FENNEL,
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

describe('harvestCheckSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('marks a plant harvestable when in the harvest window with sufficient health', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Tomato harvest_window: [12, 22]
    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));

    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState;
    expect(hs).toBeDefined();
    expect(hs!.ripe).toBe(true);
    expect(hs!.remaining).toBe(TOMATO.harvest.yield_potential);
    expect(hs!.quality).toBe(1.0);
  });

  it('does not mark a plant harvestable before the harvest window', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.5;
    plant.growth!.stage = 'vegetative';

    // Week 8 is before tomato harvest_window [12, 22]
    harvestCheckSystem(makeCtx(world, { currentWeek: 8 }));

    const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
    expect(hs).toBeUndefined();
  });

  it('does not mark a plant harvestable after the harvest window', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.9;
    plant.growth!.stage = 'senescence';

    // Week 25 is after tomato harvest_window [12, 22]
    harvestCheckSystem(makeCtx(world, { currentWeek: 25 }));

    const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
    expect(hs).toBeUndefined();
  });

  it('does not mark an unhealthy plant as harvestable', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';
    plant.health!.value = 0.1; // below threshold of 0.3

    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));

    const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
    expect(hs).toBeUndefined();
  });

  it('degrades quality each week a ripe plant goes unharvested', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // First tick — initializes harvest state
    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState!;
    expect(hs.quality).toBe(1.0);

    // Second tick — quality should degrade
    harvestCheckSystem(makeCtx(world, { currentWeek: 16 }));
    expect(hs.quality).toBe(0.85);

    // Third tick — degrades further
    harvestCheckSystem(makeCtx(world, { currentWeek: 17 }));
    expect(hs.quality).toBeCloseTo(0.7);
  });

  it('quality does not drop below the floor', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Initialize
    harvestCheckSystem(makeCtx(world, { currentWeek: 12 }));
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState!;

    // Run many weeks to push quality to the floor
    for (let week = 13; week <= 22; week++) {
      harvestCheckSystem(makeCtx(world, { currentWeek: week }));
    }

    expect(hs.quality).toBe(0.1);
  });

  it('skips dead plants', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';
    world.addComponent(plant, 'dead', true);

    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));

    const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
    expect(hs).toBeUndefined();
  });

  it('marks ripe=false when plant exits the harvest window', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Enter harvest window
    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState!;
    expect(hs.ripe).toBe(true);

    // Exit harvest window (week 23 > tomato window end of 22)
    harvestCheckSystem(makeCtx(world, { currentWeek: 23 }));
    expect(hs.ripe).toBe(false);
  });

  it('re-marks continuous harvest plants as ripe after being harvested', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Initialize harvest state
    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState!;
    expect(hs.ripe).toBe(true);

    // Simulate player harvesting: set ripe=false, decrement remaining
    hs.ripe = false;
    hs.remaining -= 1;
    hs.quality = 1.0; // reset quality on harvest

    // Next tick should mark it ripe again (continuous_harvest=true, remaining > 0)
    harvestCheckSystem(makeCtx(world, { currentWeek: 16 }));
    expect(hs.ripe).toBe(true);
  });

  it('does not re-mark continuous harvest plants when remaining is 0', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState!;

    // Exhaust all remaining harvests
    hs.ripe = false;
    hs.remaining = 0;

    harvestCheckSystem(makeCtx(world, { currentWeek: 16 }));
    expect(hs.ripe).toBe(false);
  });

  it('does not re-mark non-continuous harvest plants as ripe after being harvested', () => {
    setupSinglePlot(world, 0, 0);
    // Fennel has continuous_harvest: false
    const plant = plantSpecies(world, 'fennel', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Fennel harvest_window: [12, 20]
    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState!;
    expect(hs.ripe).toBe(true);

    // Simulate player harvesting
    hs.ripe = false;
    hs.remaining -= 1;

    // Next tick — non-continuous should stay not ripe
    harvestCheckSystem(makeCtx(world, { currentWeek: 16 }));
    expect(hs.ripe).toBe(false);
  });

  it('initializes remaining to species yield_potential', () => {
    setupSinglePlot(world, 0, 0);
    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    tomato.growth!.progress = 0.7;
    tomato.growth!.stage = 'fruiting';

    setupSinglePlot(world, 0, 1);
    const fennel = plantSpecies(world, 'fennel', 0, 1);
    fennel.growth!.progress = 0.7;
    fennel.growth!.stage = 'fruiting';

    harvestCheckSystem(makeCtx(world, { currentWeek: 15 }));

    const tomatoHs = (tomato as { harvestState?: { remaining: number } }).harvestState!;
    const fennelHs = (fennel as { harvestState?: { remaining: number } }).harvestState!;

    expect(tomatoHs.remaining).toBe(TOMATO.harvest.yield_potential); // 7
    expect(fennelHs.remaining).toBe(FENNEL.harvest.yield_potential); // 5
  });

  it('handles the exact harvest window boundaries', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Exact start of window (week 12)
    harvestCheckSystem(makeCtx(world, { currentWeek: 12 }));
    const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
    expect(hs).toBeDefined();
    expect(hs!.ripe).toBe(true);
  });

  it('does not mark immature plants as harvestable even in the harvest window', () => {
    for (const stage of ['seed', 'germination', 'seedling'] as const) {
      const w = createWorld();
      setupSinglePlot(w, 0, 0);
      const plant = plantSpecies(w, 'tomato_cherokee_purple', 0, 0);
      plant.growth!.stage = stage;
      plant.growth!.progress = 0.05;

      // Week 15 is in tomato harvest_window [12, 22]
      harvestCheckSystem(makeCtx(w, { currentWeek: 15 }));

      const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
      expect(hs, `${stage} plant should not be harvestable`).toBeUndefined();
    }
  });

  it('handles exact end of harvest window', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.7;
    plant.growth!.stage = 'fruiting';

    // Exact end of window (week 22)
    harvestCheckSystem(makeCtx(world, { currentWeek: 22 }));
    const hs = (plant as { harvestState?: { ripe: boolean } }).harvestState;
    expect(hs).toBeDefined();
    expect(hs!.ripe).toBe(true);
  });
});
