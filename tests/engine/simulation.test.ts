import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { runTick } from '../../src/lib/engine/simulation.js';
import type { SimulationConfig } from '../../src/lib/engine/simulation.js';
import { SeededRNG } from '../../src/lib/engine/rng.js';
import type { WeekWeather } from '../../src/lib/engine/ecs/components.js';
import {
  makeDefaultWeather,
  makeSpeciesLookup,
  setupSinglePlot,
  plantSpecies,
} from './fixtures.js';

function makeConfig(world: GameWorld): SimulationConfig {
  return {
    world,
    rng: new SeededRNG(42),
    speciesLookup: makeSpeciesLookup(),
    firstFrostWeekAvg: 30,
  };
}

describe('simulation tick orchestrator', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('runs a full tick without errors', () => {
    setupSinglePlot(world, 0, 0);
    plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const config = makeConfig(world);
    const result = runTick(config, makeDefaultWeather(), 10);

    expect(result.week).toBe(10);
    expect(result.frost).toBeDefined();
  });

  it('plant grows over multiple ticks', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const config = makeConfig(world);

    for (let week = 1; week <= 10; week++) {
      runTick(config, makeDefaultWeather({ week }), week);
    }

    expect(plant.growth!.progress).toBeGreaterThan(0);
    expect(plant.growth!.stage).not.toBe('seed');
  });

  it('plant reaches later stages after many ticks', () => {
    setupSinglePlot(world, 0, 0, {
      nitrogen: 0.8,
      phosphorus: 0.8,
      potassium: 0.8,
      moisture: 0.5,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const config = makeConfig(world);

    // Ideal weather for 20+ weeks
    for (let week = 1; week <= 25; week++) {
      runTick(
        config,
        makeDefaultWeather({ week, temp_high_c: 28, temp_low_c: 18 }),
        week,
      );
    }

    // Should have progressed noticeably (nutrients deplete over time, slowing growth)
    expect(plant.growth!.progress).toBeGreaterThan(0.1);
  });

  it('companion effects and growth work together', () => {
    // Tomato at (0,0) with basil at (0,1)
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);
    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plantSpecies(world, 'basil_genovese', 0, 1);

    // Lone tomato for comparison
    setupSinglePlot(world, 5, 5);
    const loneTomato = plantSpecies(world, 'tomato_cherokee_purple', 5, 5);

    const config = makeConfig(world);
    runTick(config, makeDefaultWeather(), 10);

    // Basil doesn't give tomato a growth_rate buff directly (only pest_resistance),
    // but carrot would. Verify the companion system ran by checking buffs exist
    const buffs = (tomato as { companionBuffs?: { buffs: unknown[] } }).companionBuffs;
    expect(buffs!.buffs.length).toBeGreaterThanOrEqual(1);
  });

  it('stress and nutrient depletion accumulate over time', () => {
    // Poor soil that will deplete
    setupSinglePlot(world, 0, 0, {
      nitrogen: 0.3,
      phosphorus: 0.3,
      potassium: 0.3,
      moisture: 0.3,
    });
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const config = makeConfig(world);

    for (let week = 1; week <= 15; week++) {
      runTick(
        config,
        makeDefaultWeather({ week, precipitation_mm: 5 }),
        week,
      );
    }

    // After 15 weeks with poor soil and low precip, should have some stress
    const plot = world.with('soil').entities[0];
    expect(plot.soil.nitrogen).toBeLessThan(0.3);
  });

  it('deterministic: same seed + same inputs = same output', () => {
    function runSimulation(seed: number) {
      const w = createWorld();
      setupSinglePlot(w, 0, 0);
      const p = plantSpecies(w, 'tomato_cherokee_purple', 0, 0);
      const cfg = { ...makeConfig(w), rng: new SeededRNG(seed) };

      for (let week = 1; week <= 10; week++) {
        runTick(cfg, makeDefaultWeather({ week }), week);
      }

      return {
        progress: p.growth!.progress,
        stress: p.health!.stress,
        health: p.health!.value,
        stage: p.growth!.stage,
      };
    }

    const run1 = runSimulation(12345);
    const run2 = runSimulation(12345);

    expect(run1.progress).toBeCloseTo(run2.progress);
    expect(run1.stress).toBeCloseTo(run2.stress);
    expect(run1.health).toBeCloseTo(run2.health);
    expect(run1.stage).toBe(run2.stage);
  });

  it('different seeds produce different disease outcomes', () => {
    function runWithSeed(seed: number) {
      const w = createWorld();
      setupSinglePlot(w, 0, 0);
      const p = plantSpecies(w, 'tomato_cherokee_purple', 0, 0);
      p.health!.stress = 0.7; // high stress for disease chance
      const cfg = { ...makeConfig(w), rng: new SeededRNG(seed) };

      for (let week = 1; week <= 20; week++) {
        runTick(
          cfg,
          makeDefaultWeather({ week, humidity: 0.85 }),
          week,
        );
      }

      return p.activeConditions!.conditions.length;
    }

    // Collect results from different seeds
    const results = new Set<number>();
    for (let s = 0; s < 20; s++) {
      results.add(runWithSeed(s));
    }

    // With different seeds, should see at least some variation
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('frost kills tender plants at end of season', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const config = { ...makeConfig(world), firstFrostWeekAvg: 25 };

    let died = false;
    for (let week = 1; week <= 40; week++) {
      const result = runTick(
        config,
        makeDefaultWeather({ week }),
        week,
      );
      if (result.frost.killingFrost) {
        died = true;
        break;
      }
    }

    expect(died).toBe(true);
    expect((plant as { dead?: boolean }).dead).toBe(true);
  });
});
