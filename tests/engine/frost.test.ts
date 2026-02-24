import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { frostCheckSystem } from '../../src/lib/engine/ecs/systems/frost.js';
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

describe('frostCheckSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('does not trigger frost well before first_frost_week_avg', () => {
    setupSinglePlot(world, 0, 0);
    plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world, {
      currentWeek: 10,
      firstFrostWeekAvg: 30,
    });

    const result = frostCheckSystem(ctx);
    expect(result.killingFrost).toBe(false);
    expect(result.killed.length).toBe(0);
  });

  it('has increasing frost probability near first_frost_week_avg', () => {
    let frostCount = 0;
    const trials = 200;

    for (let seed = 0; seed < trials; seed++) {
      const w = createWorld();
      setupSinglePlot(w, 0, 0);
      plantSpecies(w, 'tomato_cherokee_purple', 0, 0);

      const result = frostCheckSystem(
        makeCtx(w, {
          currentWeek: 30, // exactly at avg
          firstFrostWeekAvg: 30,
          rng: createRng(seed),
        }),
      );

      if (result.killingFrost) frostCount++;
    }

    // At exactly the avg week, sigmoid(0, 0.5) = 0.5, so ~50% of trials
    expect(frostCount).toBeGreaterThan(trials * 0.3);
    expect(frostCount).toBeLessThan(trials * 0.7);
  });

  it('kills frost-intolerant plants (none tolerance)', () => {
    setupSinglePlot(world, 0, 0);
    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    // Tomato has frost_tolerance: "none"

    // Use a seed and week that guarantees frost
    // Well past frost avg
    const ctx = makeCtx(world, {
      currentWeek: 40,
      firstFrostWeekAvg: 30,
    });

    // Try seeds until frost happens
    let result;
    for (let i = 0; i < 100; i++) {
      // Reset dead status for retry
      if ((tomato as { dead?: boolean }).dead) {
        world.removeComponent(tomato, 'dead');
      }
      result = frostCheckSystem({ ...ctx, rng: createRng(i) });
      if (result.killingFrost) break;
    }

    expect(result!.killingFrost).toBe(true);
    expect((tomato as { dead?: boolean }).dead).toBe(true);
    expect(result!.killed).toContain('tomato_cherokee_purple');
  });

  it('hard frost tolerance survives killing frost', () => {
    setupSinglePlot(world, 0, 0);
    const rosemary = plantSpecies(world, 'rosemary', 0, 0);
    // Rosemary has frost_tolerance: "hard"

    // Force frost
    let result;
    for (let i = 0; i < 100; i++) {
      result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
        }),
      );
      if (result.killingFrost) break;
    }

    expect(result!.killingFrost).toBe(true);
    expect((rosemary as { dead?: boolean }).dead).toBeFalsy();
    expect(result!.killed).not.toContain('rosemary');
  });

  it('perennial plants enter dormancy instead of dying', () => {
    setupSinglePlot(world, 0, 0);
    const rosemary = plantSpecies(world, 'rosemary', 0, 0);
    // Make it a light-tolerance plant to test dormancy logic
    // Actually rosemary is hard tolerance so it won't die.
    // Let's test with a perennial that could be affected.
    // We need a perennial with lower tolerance; let's use rosemary but
    // override its type for this test by using a custom lookup.
    const customLookup = (id: string) => {
      if (id === 'rosemary') {
        return {
          ...makeSpeciesLookup()('rosemary')!,
          needs: {
            ...makeSpeciesLookup()('rosemary')!.needs,
            frost_tolerance: 'light' as const,
          },
        };
      }
      return makeSpeciesLookup()(id);
    };

    world.addComponent(rosemary, 'perennial', {
      years_established: 2,
      dormant: false,
    });

    // Force a severe frost
    let result;
    for (let i = 0; i < 200; i++) {
      // Reset state
      const pComp = (rosemary as { perennial?: { years_established: number; dormant: boolean } }).perennial;
      if (pComp) pComp.dormant = false;
      if ((rosemary as { dead?: boolean }).dead) {
        world.removeComponent(rosemary, 'dead');
      }

      result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
          speciesLookup: customLookup,
        }),
      );
      if (result.killingFrost) break;
    }

    expect(result!.killingFrost).toBe(true);
    // Should NOT be dead (perennial enters dormancy)
    expect((rosemary as { dead?: boolean }).dead).toBeFalsy();
    // Should be dormant
    const perennial = (rosemary as { perennial?: { dormant: boolean } }).perennial;
    expect(perennial!.dormant).toBe(true);
  });

  it('probability is very high well past first frost week', () => {
    let frostCount = 0;
    const trials = 100;

    for (let seed = 0; seed < trials; seed++) {
      const w = createWorld();
      setupSinglePlot(w, 0, 0);
      plantSpecies(w, 'tomato_cherokee_purple', 0, 0);

      const result = frostCheckSystem(
        makeCtx(w, {
          currentWeek: 40, // 10 weeks past avg
          firstFrostWeekAvg: 30,
          rng: createRng(seed),
        }),
      );

      if (result.killingFrost) frostCount++;
    }

    // sigmoid(10, 0.5) ≈ 0.993, so nearly all should frost
    expect(frostCount).toBeGreaterThan(trials * 0.9);
  });

  it('dead plants are not killed again', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    world.addComponent(plant, 'dead', true);

    let result;
    for (let i = 0; i < 100; i++) {
      result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
        }),
      );
      if (result.killingFrost) break;
    }

    // Already-dead plant should not be in the killed list
    expect(result!.killed).not.toContain('tomato_cherokee_purple');
  });
});

// ── Frost tolerance tier tests ────────────────────────────────────────────────

describe('frostCheckSystem – tolerance tiers', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('light tolerance plant is killed by any occurring frost (severity always >= 0.5)', () => {
    // Fennel has frost_tolerance: "light" — killed when frostSeverity > 0.5
    // frostSeverity = 0.5 + rng.next() * 0.5, so minimum is 0.5 (exclusive from multiplication)
    // In practice severity will sometimes equal exactly 0.5; light tolerance threshold is > 0.5
    // so the test looks for death across many seeds
    setupSinglePlot(world, 0, 0);
    const fennel = plantSpecies(world, 'fennel', 0, 0);

    let killed = false;
    for (let i = 0; i < 200; i++) {
      if ((fennel as { dead?: boolean }).dead) {
        world.removeComponent(fennel, 'dead');
      }
      const result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
        }),
      );
      if (result.killingFrost && (fennel as { dead?: boolean }).dead) {
        killed = true;
        break;
      }
    }

    expect(killed).toBe(true);
  });

  it('moderate tolerance plant sometimes survives frost (severity <= 0.8)', () => {
    // Create a plant with moderate frost tolerance
    const customLookup = (id: string) => {
      const species = makeSpeciesLookup()(id);
      if (!species || id !== 'tomato_cherokee_purple') return species;
      return { ...species, needs: { ...species.needs, frost_tolerance: 'moderate' as const } };
    };

    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Find a seed where frost occurs but plant survives (mild frost)
    let survived = false;
    for (let i = 0; i < 200; i++) {
      if ((plant as { dead?: boolean }).dead) {
        world.removeComponent(plant, 'dead');
      }
      const result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
          speciesLookup: customLookup,
        }),
      );
      if (result.killingFrost && !(plant as { dead?: boolean }).dead) {
        survived = true;
        break;
      }
    }

    expect(survived).toBe(true);
  });

  it('moderate tolerance plant is eventually killed by severe frosts (severity > 0.8)', () => {
    const customLookup = (id: string) => {
      const species = makeSpeciesLookup()(id);
      if (!species || id !== 'tomato_cherokee_purple') return species;
      return { ...species, needs: { ...species.needs, frost_tolerance: 'moderate' as const } };
    };

    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    let killed = false;
    for (let i = 0; i < 500; i++) {
      if ((plant as { dead?: boolean }).dead) {
        world.removeComponent(plant, 'dead');
      }
      const result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
          speciesLookup: customLookup,
        }),
      );
      if (result.killingFrost && (plant as { dead?: boolean }).dead) {
        killed = true;
        break;
      }
    }

    expect(killed).toBe(true);
  });

  it('mixed garden: frost-intolerant plants die while hard-tolerance plants survive', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0); // frost_tolerance: none
    const rosemary = plantSpecies(world, 'rosemary', 0, 1);             // frost_tolerance: hard

    let result;
    for (let i = 0; i < 100; i++) {
      if ((tomato as { dead?: boolean }).dead) world.removeComponent(tomato, 'dead');
      result = frostCheckSystem(
        makeCtx(world, {
          currentWeek: 40,
          firstFrostWeekAvg: 30,
          rng: createRng(i),
        }),
      );
      if (result.killingFrost) break;
    }

    expect(result!.killingFrost).toBe(true);
    expect((tomato as { dead?: boolean }).dead).toBe(true);
    expect((rosemary as { dead?: boolean }).dead).toBeFalsy();
    expect(result!.killed).toContain('tomato_cherokee_purple');
    expect(result!.killed).not.toContain('rosemary');
  });

  it('killed list contains all none-tolerance plants killed in one frost event', () => {
    // Three frost-intolerant plants
    for (let i = 0; i < 3; i++) {
      setupSinglePlot(world, 0, i);
      plantSpecies(world, 'tomato_cherokee_purple', 0, i);
    }

    let result;
    for (let seed = 0; seed < 100; seed++) {
      for (const e of world.with('species').entities) {
        if ((e as { dead?: boolean }).dead) world.removeComponent(e, 'dead');
      }
      result = frostCheckSystem(
        makeCtx(world, { currentWeek: 40, firstFrostWeekAvg: 30, rng: createRng(seed) }),
      );
      if (result.killingFrost) break;
    }

    expect(result!.killed.filter((id) => id === 'tomato_cherokee_purple').length).toBe(3);
  });
});
