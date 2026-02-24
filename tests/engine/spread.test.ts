import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { spreadCheckSystem } from '../../src/lib/engine/ecs/systems/spread.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext, Entity } from '../../src/lib/engine/ecs/components.js';
import type { PlantSpecies } from '../../src/lib/data/types.js';
import {
  TOMATO,
  MINT,
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

// ── Disease Spread ──────────────────────────────────────────────────

describe('spreadCheckSystem — disease spread', () => {
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
    setupSinglePlot(world, 0, 2);
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

    source.growth!.stage = 'fruiting';
    target.growth!.stage = 'vegetative';

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

// ── Runner Spreading ────────────────────────────────────────────────

describe('spreadCheckSystem — runner spreading', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('does nothing when species has no spreading behavior', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    for (let i = 0; i < 50; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    // No new plants should appear at (0,1)
    const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
    );
    expect(plantsAt01.length).toBe(0);
  });

  it('mint can spread to adjacent empty plot via runners', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'vegetative';

    let spread = false;
    for (let i = 0; i < 200; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
        (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
      );
      if (plantsAt01.length > 0) {
        spread = true;
        break;
      }
    }

    expect(spread).toBe(true);
  });

  it('runner offspring starts at seedling stage with reduced health', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'vegetative';

    for (let i = 0; i < 200; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
        (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
      );
      if (plantsAt01.length > 0) break;
    }

    const offspring = world.with('species', 'plotSlot', 'growth', 'health').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
    );

    expect(offspring.length).toBe(1);
    expect(offspring[0].species.speciesId).toBe('mint_spearmint');
    expect(offspring[0].growth.stage).toBe('seedling');
    expect(offspring[0].growth.progress).toBe(0.15);
    expect(offspring[0].health.value).toBe(0.8);
  });

  it('does not spread to occupied plots', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    const blocker = plantSpecies(world, 'basil_genovese', 0, 1);
    mint.growth!.stage = 'vegetative';
    blocker.growth!.stage = 'vegetative';

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    // Only the original basil should be at (0,1)
    const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
    );
    expect(plantsAt01.length).toBe(1);
    expect(plantsAt01[0].species.speciesId).toBe('basil_genovese');
  });

  it('does not spread when below min_stage', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'seedling'; // below 'vegetative' min_stage

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
    );
    expect(plantsAt01.length).toBe(0);
  });

  it('does not spread from dead plants', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'vegetative';
    world.addComponent(mint, 'dead', true);

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
    );
    expect(plantsAt01.length).toBe(0);
  });

  it('does not spread when no empty plots are available', () => {
    // Create a 1x1 grid with no adjacent plots
    setupSinglePlot(world, 5, 5);
    const mint = plantSpecies(world, 'mint_spearmint', 5, 5);
    mint.growth!.stage = 'vegetative';

    const plantCountBefore = world.with('species', 'plotSlot').entities.length;

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const plantCountAfter = world.with('species', 'plotSlot').entities.length;
    expect(plantCountAfter).toBe(plantCountBefore);
  });

  it('does not spread to plots occupied by weeds', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'vegetative';

    // Place a weed at (0,1)
    world.add({ plotSlot: { row: 0, col: 1 }, weed: { severity: 0.3 } });

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const plantsAt01 = world.with('species', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 1,
    );
    expect(plantsAt01.length).toBe(0);
  });

  it('runner radius limits spread distance', () => {
    // MINT has runner radius 1, so it should not reach (0, 2) directly
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 2); // 2 cells away, beyond radius 1
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'vegetative';

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const plantsAt02 = world.with('species', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 2,
    );
    expect(plantsAt02.length).toBe(0);
  });
});

// ── Self-Seeding ────────────────────────────────────────────────────

describe('spreadCheckSystem — self-seeding', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('flags self-seeding plants in fruiting stage', () => {
    setupSinglePlot(world, 0, 0);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'fruiting';

    let flagged = false;
    for (let i = 0; i < 200; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      if ((mint as Entity).selfSeeded) {
        flagged = true;
        break;
      }
    }

    expect(flagged).toBe(true);
  });

  it('flags self-seeding plants in senescence stage', () => {
    setupSinglePlot(world, 0, 0);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'senescence';

    let flagged = false;
    for (let i = 0; i < 200; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      if ((mint as Entity).selfSeeded) {
        flagged = true;
        break;
      }
    }

    expect(flagged).toBe(true);
  });

  it('does not flag self-seeding in vegetative stage', () => {
    setupSinglePlot(world, 0, 0);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'vegetative';

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect((mint as Entity).selfSeeded).toBeFalsy();
  });

  it('does not flag species without self_seed behavior', () => {
    setupSinglePlot(world, 0, 0);
    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    tomato.growth!.stage = 'fruiting';

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect((tomato as Entity).selfSeeded).toBeFalsy();
  });

  it('does not flag dead plants', () => {
    setupSinglePlot(world, 0, 0);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'senescence';
    world.addComponent(mint, 'dead', true);

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    expect((mint as Entity).selfSeeded).toBeFalsy();
  });

  it('does not double-flag already flagged plants', () => {
    setupSinglePlot(world, 0, 0);
    const mint = plantSpecies(world, 'mint_spearmint', 0, 0);
    mint.growth!.stage = 'fruiting';
    world.addComponent(mint, 'selfSeeded', true);

    // Running the system shouldn't cause errors or change state
    spreadCheckSystem(makeCtx(world));
    expect((mint as Entity).selfSeeded).toBe(true);
  });
});

// ── Weed Pressure ───────────────────────────────────────────────────

describe('spreadCheckSystem — weed pressure', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('can spawn weeds on empty plots', () => {
    // Create several empty plots to increase chance of weed spawn
    for (let i = 0; i < 5; i++) {
      setupSinglePlot(world, 0, i);
    }

    let weedSpawned = false;
    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      const weeds = world.with('weed', 'plotSlot').entities;
      if (weeds.length > 0) {
        weedSpawned = true;
        break;
      }
    }

    expect(weedSpawned).toBe(true);
  });

  it('does not spawn weeds on plots with plants', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plant.growth!.stage = 'vegetative';

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const weedsAt00 = world.with('weed', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 0,
    );
    expect(weedsAt00.length).toBe(0);
  });

  it('does not spawn multiple weeds on the same plot', () => {
    setupSinglePlot(world, 0, 0);

    // Place a weed already
    world.add({ plotSlot: { row: 0, col: 0 }, weed: { severity: 0.1 } });

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
    }

    const weedsAt00 = world.with('weed', 'plotSlot').entities.filter(
      (e) => e.plotSlot.row === 0 && e.plotSlot.col === 0,
    );
    expect(weedsAt00.length).toBe(1);
  });

  it('weed severity grows over time', () => {
    setupSinglePlot(world, 0, 0);
    const weed = world.add({ plotSlot: { row: 0, col: 0 }, weed: { severity: 0.1 } });

    spreadCheckSystem(makeCtx(world));

    expect(weed.weed!.severity).toBeGreaterThan(0.1);
  });

  it('weed severity caps at 1.0', () => {
    setupSinglePlot(world, 0, 0);
    const weed = world.add({ plotSlot: { row: 0, col: 0 }, weed: { severity: 0.98 } });

    spreadCheckSystem(makeCtx(world));

    expect(weed.weed!.severity).toBeLessThanOrEqual(1.0);
  });

  it('weeds drain soil nutrients', () => {
    setupSinglePlot(world, 0, 0);
    const plot = world.with('plotSlot', 'soil').entities[0];
    const initialNitrogen = plot.soil.nitrogen;
    const initialMoisture = plot.soil.moisture;

    world.add({ plotSlot: { row: 0, col: 0 }, weed: { severity: 0.5 } });

    spreadCheckSystem(makeCtx(world));

    expect(plot.soil.nitrogen).toBeLessThan(initialNitrogen);
    expect(plot.soil.moisture).toBeLessThan(initialMoisture);
  });

  it('weed spawn probability is higher in fertile soil', () => {
    let fertileWeeds = 0;
    let poorWeeds = 0;
    const trials = 300;

    for (let seed = 0; seed < trials; seed++) {
      // Fertile soil
      const w1 = createWorld();
      setupSinglePlot(w1, 0, 0, { nitrogen: 0.9, phosphorus: 0.9, potassium: 0.9 });
      spreadCheckSystem({ ...makeCtx(w1), rng: createRng(seed) });
      if (w1.with('weed', 'plotSlot').entities.length > 0) fertileWeeds++;

      // Poor soil
      const w2 = createWorld();
      setupSinglePlot(w2, 0, 0, { nitrogen: 0.1, phosphorus: 0.1, potassium: 0.1 });
      spreadCheckSystem({ ...makeCtx(w2), rng: createRng(seed) });
      if (w2.with('weed', 'plotSlot').entities.length > 0) poorWeeds++;
    }

    expect(fertileWeeds).toBeGreaterThan(poorWeeds);
  });

  it('weed spawn is a new entity with plotSlot and weed component', () => {
    setupSinglePlot(world, 0, 0);

    for (let i = 0; i < 100; i++) {
      spreadCheckSystem({ ...makeCtx(world), rng: createRng(i) });
      const weeds = world.with('weed', 'plotSlot').entities;
      if (weeds.length > 0) break;
    }

    const weeds = world.with('weed', 'plotSlot').entities;
    if (weeds.length > 0) {
      expect(weeds[0].plotSlot.row).toBe(0);
      expect(weeds[0].plotSlot.col).toBe(0);
      expect(weeds[0].weed.severity).toBe(0.1);
    }
  });
});
