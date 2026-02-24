import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { growthTickSystem, gaussianFit, totalExpectedWeeks, determineStage } from '../../src/lib/engine/ecs/systems/growth.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext } from '../../src/lib/engine/ecs/components.js';
import {
  TOMATO,
  BASIL,
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

describe('growth helpers', () => {
  describe('gaussianFit', () => {
    it('returns 1.0 when value equals ideal', () => {
      expect(gaussianFit(25, 25, 8)).toBeCloseTo(1.0);
    });

    it('returns less than 1 when value deviates from ideal', () => {
      expect(gaussianFit(15, 25, 8)).toBeLessThan(1);
      expect(gaussianFit(15, 25, 8)).toBeGreaterThan(0);
    });

    it('returns near-zero for extreme deviations', () => {
      expect(gaussianFit(0, 25, 3)).toBeLessThan(0.01);
    });

    it('wider tolerance gives higher values for same deviation', () => {
      const narrow = gaussianFit(20, 25, 3);
      const wide = gaussianFit(20, 25, 10);
      expect(wide).toBeGreaterThan(narrow);
    });
  });

  describe('totalExpectedWeeks', () => {
    it('computes correct total for tomato', () => {
      const total = totalExpectedWeeks(TOMATO);
      // seed(1.5) + germ(1) + seedling(2.5) + veg(5) + flower(2.5) + fruit(5) + sen(3) = 20.5
      expect(total).toBeCloseTo(20.5);
    });

    it('computes correct total for basil', () => {
      const total = totalExpectedWeeks(BASIL);
      // seed(1) + germ(1) + seedling(1.5) + veg(4) + flower(2.5) + fruit(1.5) + sen(1.5) = 13
      expect(total).toBeCloseTo(13);
    });
  });

  describe('determineStage', () => {
    it('returns seed at progress 0', () => {
      expect(determineStage(TOMATO, 0)).toBe('seed');
    });

    it('returns senescence at progress 1', () => {
      expect(determineStage(TOMATO, 1)).toBe('senescence');
    });

    it('returns vegetative at midpoint progress', () => {
      // seed(1.5/20.5=0.073) + germ(1/20.5=0.122) + seedling(2.5/20.5=0.244) + veg ends at (1.5+1+2.5+5)/20.5=0.488
      // At progress 0.35, should be in vegetative
      expect(determineStage(TOMATO, 0.35)).toBe('vegetative');
    });
  });
});

describe('growthTickSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('advances growth progress each tick', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    growthTickSystem(makeCtx(world));

    expect(plant.growth!.progress).toBeGreaterThan(0);
  });

  it('growth is faster in ideal conditions', () => {
    // Ideal conditions
    setupSinglePlot(world, 0, 0, {
      moisture: 0.5,
      nitrogen: 0.8,
      phosphorus: 0.8,
      potassium: 0.8,
      temperature_c: 25,
    });
    const idealPlant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Poor conditions
    setupSinglePlot(world, 1, 0, {
      moisture: 0.1,
      nitrogen: 0.1,
      phosphorus: 0.1,
      potassium: 0.1,
      temperature_c: 5,
    });
    const poorPlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    expect(idealPlant.growth!.progress).toBeGreaterThan(poorPlant.growth!.progress);
  });

  it('Liebig law: low nitrogen limits growth even with good P/K', () => {
    // Good P/K but very low N
    setupSinglePlot(world, 0, 0, {
      nitrogen: 0.05,
      phosphorus: 0.9,
      potassium: 0.9,
      moisture: 0.5,
    });
    const lowN = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Balanced nutrients
    setupSinglePlot(world, 1, 0, {
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
      moisture: 0.5,
    });
    const balanced = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    // Low N plant grows much slower despite excellent P/K
    expect(lowN.growth!.progress).toBeLessThan(balanced.growth!.progress);
  });

  it('stressed plants grow slower', () => {
    setupSinglePlot(world, 0, 0);
    const healthy = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    setupSinglePlot(world, 1, 0);
    const stressed = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);
    stressed.health!.stress = 0.8;

    growthTickSystem(makeCtx(world));

    expect(healthy.growth!.progress).toBeGreaterThan(stressed.growth!.progress);
  });

  it('growth is clamped to [0, 1]', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.99;

    // Run many ticks
    for (let i = 0; i < 50; i++) {
      growthTickSystem(makeCtx(world));
    }

    expect(plant.growth!.progress).toBeLessThanOrEqual(1);
  });

  it('updates growth stage as progress advances', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.progress = 0.4;

    growthTickSystem(makeCtx(world));

    // At ~0.4 progress, tomato should be in vegetative stage
    expect(plant.growth!.stage).toBe('vegetative');
  });

  it('dead plants do not grow', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    world.addComponent(plant, 'dead', true);

    growthTickSystem(makeCtx(world));

    expect(plant.growth!.progress).toBe(0);
  });

  it('companion growth_rate buff increases growth', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Manually set a companion buff
    plant.companionBuffs = {
      buffs: [
        {
          source: 'carrot_nantes',
          effects: [{ type: 'growth_rate', modifier: 0.1, radius: 1 }],
        },
      ],
    };

    setupSinglePlot(world, 1, 0);
    const noBuffPlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    expect(plant.growth!.progress).toBeGreaterThan(noBuffPlant.growth!.progress);
  });

  it('allelopathy debuff reduces growth', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    plant.companionBuffs = {
      buffs: [
        {
          source: 'fennel',
          effects: [{ type: 'allelopathy', modifier: -0.4, radius: 2 }],
        },
      ],
    };

    setupSinglePlot(world, 1, 0);
    const noDebuff = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    expect(plant.growth!.progress).toBeLessThan(noDebuff.growth!.progress);
  });
});

// ── Sun-matching tests ────────────────────────────────────────────────────────

describe('growthTickSystem – sun matching', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('full-sun plant grows faster in full sun than partial sun', () => {
    setupSinglePlot(world, 0, 0); // full sun (default from setupSinglePlot)
    const fullSunPlant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Partial sun plot with identical soil
    world.add({
      plotSlot: { row: 1, col: 0 },
      soil: { ph: 6.5, nitrogen: 0.6, phosphorus: 0.6, potassium: 0.6, organic_matter: 0.5, moisture: 0.5, temperature_c: 22, compaction: 0.2, biology: 0.5 },
      sunExposure: { level: 'partial' },
    });
    const partialPlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    expect(fullSunPlant.growth!.progress).toBeGreaterThan(partialPlant.growth!.progress);
  });

  it('full-sun plant grows slowest in shade', () => {
    setupSinglePlot(world, 0, 0); // full sun
    const fullSunPlant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    world.add({
      plotSlot: { row: 1, col: 0 },
      soil: { ph: 6.5, nitrogen: 0.6, phosphorus: 0.6, potassium: 0.6, organic_matter: 0.5, moisture: 0.5, temperature_c: 22, compaction: 0.2, biology: 0.5 },
      sunExposure: { level: 'shade' },
    });
    const shadePlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    // Shade receives 0.35 modifier vs 1.0 for full sun — significant difference
    expect(fullSunPlant.growth!.progress).toBeGreaterThan(shadePlant.growth!.progress);
  });

  it('sun mismatch gradient: full > partial > shade for full-sun plant', () => {
    setupSinglePlot(world, 0, 0); // full
    const fullSunPlant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    world.add({
      plotSlot: { row: 1, col: 0 },
      soil: { ph: 6.5, nitrogen: 0.6, phosphorus: 0.6, potassium: 0.6, organic_matter: 0.5, moisture: 0.5, temperature_c: 22, compaction: 0.2, biology: 0.5 },
      sunExposure: { level: 'partial' },
    });
    const partialPlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    world.add({
      plotSlot: { row: 2, col: 0 },
      soil: { ph: 6.5, nitrogen: 0.6, phosphorus: 0.6, potassium: 0.6, organic_matter: 0.5, moisture: 0.5, temperature_c: 22, compaction: 0.2, biology: 0.5 },
      sunExposure: { level: 'shade' },
    });
    const shadePlant = plantSpecies(world, 'tomato_cherokee_purple', 2, 0);

    growthTickSystem(makeCtx(world));

    expect(fullSunPlant.growth!.progress).toBeGreaterThan(partialPlant.growth!.progress);
    expect(partialPlant.growth!.progress).toBeGreaterThan(shadePlant.growth!.progress);
  });

  it('rate_modifier is higher for matching sun level', () => {
    setupSinglePlot(world, 0, 0); // full sun
    const fullSunPlant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    world.add({
      plotSlot: { row: 1, col: 0 },
      soil: { ph: 6.5, nitrogen: 0.6, phosphorus: 0.6, potassium: 0.6, organic_matter: 0.5, moisture: 0.5, temperature_c: 22, compaction: 0.2, biology: 0.5 },
      sunExposure: { level: 'shade' },
    });
    const shadePlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);

    growthTickSystem(makeCtx(world));

    expect(fullSunPlant.growth!.rate_modifier).toBeGreaterThan(shadePlant.growth!.rate_modifier);
  });
});

// ── Temperature tolerance regression ─────────────────────────────────────────

describe('growthTickSystem – temperature tolerance', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('warm-season crop accumulates meaningful progress over 8 ticks in cool early-spring soil', () => {
    // Regression test: with tolerance=8, tomato at 8°C soil yielded tempMod≈0.10,
    // making growth near-zero (~5% after 8 ticks). Widening tolerance to 12 gives
    // tempMod≈0.37, yielding meaningful growth (~18% after 8 ticks).
    // Soil at 8°C with ideal nutrients and moisture, full sun, no stress.
    setupSinglePlot(world, 0, 0, {
      temperature_c: 8,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
      moisture: 0.5,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Run 8 ticks (8 simulated weeks)
    for (let i = 0; i < 8; i++) {
      growthTickSystem(makeCtx(world));
    }

    // Expect at least 12% growth over 8 weeks — not effectively stalled.
    // (With the old tolerance=8 this was ~5%, with tolerance=12 it is ~18%.)
    expect(plant.growth!.progress).toBeGreaterThan(0.12);
  });

  it('basil at its minimum soil temp still makes some progress per tick', () => {
    // Basil soil_temp_min_c = 18°C; ideal = 28°C.
    // At exactly the minimum, growth should not be stalled.
    setupSinglePlot(world, 0, 0, {
      temperature_c: 18,
      nitrogen: 0.6,
      phosphorus: 0.6,
      potassium: 0.6,
      moisture: 0.5,
    });
    const plant = plantSpecies(world, 'basil_genovese', 0, 0);

    growthTickSystem(makeCtx(world));

    // At 18°C (soil_temp_min_c), growth should give at least 2% per tick.
    expect(plant.growth!.progress).toBeGreaterThan(0.02);
  });
});
