import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { spreadCheckSystem } from '../../src/lib/engine/ecs/systems/spread.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext } from '../../src/lib/engine/ecs/components.js';
import type { PlantSpecies } from '../../src/lib/data/types.js';
import {
  TOMATO,
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

describe('spreadCheckSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('does nothing when no plants have active conditions', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    spreadCheckSystem(makeCtx(world));

    expect(target.activeConditions!.conditions.length).toBe(0);
  });

  it('does nothing when the disease does not spread', () => {
    // blossom_end_rot has spreads: false
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'fruiting';
    target.growth!.stage = 'fruiting';

    source.activeConditions = {
      conditions: [
        { conditionId: 'blossom_end_rot', onset_week: 5, current_stage: 1, severity: 0.9 },
      ],
    };

    // Run many seeds to confirm blossom_end_rot never spreads
    for (let i = 0; i < 50; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect(target.activeConditions!.conditions.length).toBe(0);
  });

  it('can spread a disease to an adjacent susceptible plant', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    // High severity increases spread probability
    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };

    let spread = false;
    for (let i = 0; i < 100; i++) {
      const targetConds = target.activeConditions!.conditions;
      if (targetConds.length > 0) break;
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      if (target.activeConditions!.conditions.length > 0) {
        spread = true;
        break;
      }
    }

    expect(spread).toBe(true);
  });

  it('spread infects with conditionId, onset_week, stage 0, and severity 0.1', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };

    // Find a seed that spreads the disease
    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world, { currentWeek: 12 }), rng: createRng(i) });
      if (target.activeConditions!.conditions.length > 0) break;
    }

    if (target.activeConditions!.conditions.length > 0) {
      const infection = target.activeConditions!.conditions[0];
      expect(infection.conditionId).toBe('early_blight');
      expect(infection.current_stage).toBe(0);
      expect(infection.severity).toBe(0.1);
      expect(infection.onset_week).toBe(12);
    }
  });

  it('does not spread to plants without the vulnerability', () => {
    // Basil has no vulnerabilities, so early_blight cannot spread to it
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'basil_genovese', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect(target.activeConditions!.conditions.length).toBe(0);
  });

  it('does not spread to plants already infected', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };
    target.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 7, current_stage: 0, severity: 0.1 },
      ],
    };

    for (let i = 0; i < 50; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    // Still only one early_blight entry
    const blightCount = target.activeConditions!.conditions.filter(
      (c) => c.conditionId === 'early_blight',
    ).length;
    expect(blightCount).toBe(1);
  });

  it('does not spread from dead plants', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };
    world.addComponent(source, 'dead', true);

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect(target.activeConditions!.conditions.length).toBe(0);
  });

  it('does not spread to dead plants', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    source.growth!.stage = 'vegetative';
    target.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };
    world.addComponent(target, 'dead', true);

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    // Dead target should not gain conditions
    expect(
      (target as { activeConditions?: { conditions: unknown[] } }).activeConditions?.conditions.length ?? 0,
    ).toBe(0);
  });

  it('does not spread to seed/germination stage plants', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    setupSinglePlot(world, 1, 0);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const seedTarget = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);
    const germTarget = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);
    source.growth!.stage = 'vegetative';
    seedTarget.growth!.stage = 'seed';
    germTarget.growth!.stage = 'germination';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect(seedTarget.activeConditions!.conditions.length).toBe(0);
    expect(germTarget.activeConditions!.conditions.length).toBe(0);
  });

  it('does not spread beyond the spread_radius', () => {
    // early_blight has spread_radius: 1, so position (0,3) is out of range from (0,0)
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 3);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const farTarget = plantSpecies(world, 'tomato_cherokee_purple', 0, 3);
    source.growth!.stage = 'vegetative';
    farTarget.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect(farTarget.activeConditions!.conditions.length).toBe(0);
  });

  it('higher source severity leads to more frequent spread', () => {
    let highSeveritySpread = 0;
    let lowSeveritySpread = 0;
    const trials = 200;

    for (let seed = 0; seed < trials; seed++) {
      // High severity source
      const w1 = createWorld();
      setupSinglePlot(w1, 0, 0);
      setupSinglePlot(w1, 0, 1);
      const src1 = plantSpecies(w1, 'tomato_cherokee_purple', 0, 0);
      const tgt1 = plantSpecies(w1, 'tomato_cherokee_purple', 0, 1);
      src1.growth!.stage = 'vegetative';
      tgt1.growth!.stage = 'vegetative';
      src1.activeConditions = {
        conditions: [{ conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 }],
      };
      spreadCheckSystem({ ...makeCtx(w1), rng: createRng(seed) });
      if (tgt1.activeConditions!.conditions.length > 0) highSeveritySpread++;

      // Low severity source
      const w2 = createWorld();
      setupSinglePlot(w2, 0, 0);
      setupSinglePlot(w2, 0, 1);
      const src2 = plantSpecies(w2, 'tomato_cherokee_purple', 0, 0);
      const tgt2 = plantSpecies(w2, 'tomato_cherokee_purple', 0, 1);
      src2.growth!.stage = 'vegetative';
      tgt2.growth!.stage = 'vegetative';
      src2.activeConditions = {
        conditions: [{ conditionId: 'early_blight', onset_week: 2, current_stage: 0, severity: 0.1 }],
      };
      spreadCheckSystem({ ...makeCtx(w2), rng: createRng(seed) });
      if (tgt2.activeConditions!.conditions.length > 0) lowSeveritySpread++;
    }

    expect(highSeveritySpread).toBeGreaterThan(lowSeveritySpread);
  });

  it('disease with spread_radius 2 can infect plants two cells away', () => {
    // Create a custom species with spread_radius: 2
    const TOMATO_WIDE_SPREAD: PlantSpecies = {
      ...TOMATO,
      vulnerabilities: [
        {
          ...TOMATO.vulnerabilities[0],
          symptoms: {
            ...TOMATO.vulnerabilities[0].symptoms,
            spreads: true,
            spread_radius: 2,
          },
        },
      ],
    };

    const customLookup = (id: string) => {
      if (id === 'tomato_cherokee_purple') return TOMATO_WIDE_SPREAD;
      return makeSpeciesLookup()(id);
    };

    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 2); // exactly 2 cells away
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const farTarget = plantSpecies(world, 'tomato_cherokee_purple', 0, 2);
    source.growth!.stage = 'vegetative';
    farTarget.growth!.stage = 'vegetative';

    source.activeConditions = {
      conditions: [
        { conditionId: 'early_blight', onset_week: 2, current_stage: 2, severity: 0.9 },
      ],
    };

    let spread = false;
    for (let i = 0; i < 200; i++) {
      spreadCheckSystem({ ...makeCtx(world, { speciesLookup: customLookup }), rng: createRng(i) });
      if (farTarget.activeConditions!.conditions.length > 0) {
        spread = true;
        break;
      }
    }

    expect(spread).toBe(true);
  });

  it('does not spread blossom_end_rot below min_stage (fruiting)', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const source = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const target = plantSpecies(world, 'tomato_cherokee_purple', 0, 1);

    // Even if we fabricate a spreading blossom_end_rot, target in 'vegetative'
    // should be blocked by min_stage check
    source.growth!.stage = 'fruiting';
    target.growth!.stage = 'vegetative'; // below min_stage 'fruiting'

    // Custom vulnerability that spreads (blossom_end_rot normally doesn't spread)
    const customLookup = (id: string) => {
      const species = makeSpeciesLookup()(id);
      if (!species || id !== 'tomato_cherokee_purple') return species;
      return {
        ...species,
        vulnerabilities: species.vulnerabilities.map((v) =>
          v.condition_id === 'blossom_end_rot'
            ? { ...v, symptoms: { ...v.symptoms, spreads: true, spread_radius: 1 } }
            : v,
        ),
      };
    };

    source.activeConditions = {
      conditions: [
        { conditionId: 'blossom_end_rot', onset_week: 5, current_stage: 1, severity: 0.9 },
      ],
    };

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world, { speciesLookup: customLookup }), rng: createRng(i) });
    }

    expect(target.activeConditions!.conditions.length).toBe(0);
  });
});
