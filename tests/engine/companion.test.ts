import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { companionEffectsSystem } from '../../src/lib/engine/ecs/systems/companion.js';
import { SeededRNG } from '../../src/lib/engine/rng.js';
import type { SimulationContext, CompanionBuff } from '../../src/lib/engine/ecs/components.js';
import {
  makeDefaultWeather,
  makeSpeciesLookup,
  setupSinglePlot,
  plantSpecies,
} from './fixtures.js';

function makeCtx(world: GameWorld): SimulationContext {
  return {
    world,
    weather: makeDefaultWeather(),
    currentWeek: 10,
    rng: new SeededRNG(42),
    speciesLookup: makeSpeciesLookup(),
    firstFrostWeekAvg: 30,
  };
}

describe('companionEffectsSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('applies companion buff when basil is adjacent to tomato', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);

    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plantSpecies(world, 'basil_genovese', 0, 1);

    companionEffectsSystem(makeCtx(world));

    const buffs = (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs;
    expect(buffs).toBeDefined();
    expect(buffs!.buffs.length).toBeGreaterThan(0);
    expect(buffs!.buffs[0].source).toBe('basil_genovese');
    expect(buffs!.buffs[0].effects[0].type).toBe('pest_resistance');
    expect(buffs!.buffs[0].effects[0].modifier).toBeCloseTo(0.3);
  });

  it('applies antagonist debuff when fennel is adjacent to tomato', () => {
    setupSinglePlot(world, 1, 1);
    setupSinglePlot(world, 1, 2);

    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 1, 1);
    plantSpecies(world, 'fennel', 1, 2);

    companionEffectsSystem(makeCtx(world));

    const buffs = (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs;
    expect(buffs).toBeDefined();
    const allelopathy = buffs!.buffs.find(b =>
      b.effects.some(e => e.type === 'allelopathy'),
    );
    expect(allelopathy).toBeDefined();
    expect(allelopathy!.effects[0].modifier).toBeLessThan(0);
  });

  it('does not apply effects for non-adjacent plants', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 5, 5); // far away

    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plantSpecies(world, 'basil_genovese', 5, 5);

    companionEffectsSystem(makeCtx(world));

    const buffs = (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs;
    expect(buffs!.buffs.length).toBe(0);
  });

  it('applies diminishing returns for duplicate companions', () => {
    setupSinglePlot(world, 1, 1);
    setupSinglePlot(world, 0, 1);
    setupSinglePlot(world, 2, 1);

    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 1, 1);
    plantSpecies(world, 'basil_genovese', 0, 1);
    plantSpecies(world, 'basil_genovese', 2, 1);

    companionEffectsSystem(makeCtx(world));

    const buffs = (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs!.buffs;
    expect(buffs.length).toBe(2);

    // First basil gets full modifier, second gets halved
    const modifiers = buffs.map(b => b.effects[0].modifier);
    expect(modifiers[0]).toBeCloseTo(0.3); // full
    expect(modifiers[1]).toBeCloseTo(0.15); // halved
  });

  it('handles diagonal adjacency', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 1, 1);

    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    plantSpecies(world, 'basil_genovese', 1, 1); // diagonal

    companionEffectsSystem(makeCtx(world));

    const buffs = (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs;
    expect(buffs!.buffs.length).toBeGreaterThan(0);
  });

  it('clears previous buffs each tick', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);

    const tomato = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const basil = plantSpecies(world, 'basil_genovese', 0, 1);

    // First tick: basil adjacent
    companionEffectsSystem(makeCtx(world));
    expect(
      (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs!.buffs.length,
    ).toBe(1);

    // Remove basil (simulate death/removal)
    world.addComponent(basil, 'dead', true);
    companionEffectsSystem(makeCtx(world));

    // Dead neighbors should not produce buffs
    expect(
      (tomato as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs!.buffs.length,
    ).toBe(0);
  });

  it('basil also gets buffs from tomato (bidirectional)', () => {
    setupSinglePlot(world, 0, 0);
    setupSinglePlot(world, 0, 1);

    plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const basil = plantSpecies(world, 'basil_genovese', 0, 1);

    companionEffectsSystem(makeCtx(world));

    // Basil has tomato as a companion with growth_rate +0.15
    const buffs = (basil as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs;
    expect(buffs!.buffs.length).toBe(1);
    expect(buffs!.buffs[0].source).toBe('tomato_cherokee_purple');
    expect(buffs!.buffs[0].effects[0].type).toBe('growth_rate');
  });
});
