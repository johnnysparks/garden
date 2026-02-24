import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import type { GameWorld } from '../../src/lib/engine/ecs/world.js';
import { pestCheckSystem } from '../../src/lib/engine/ecs/systems/pest.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { SimulationContext, PestEvent, PestInfestationEntry } from '../../src/lib/engine/ecs/components.js';
import {
  makeDefaultWeather,
  makeSpeciesLookup,
  setupSinglePlot,
  plantSpecies,
} from './fixtures.js';

/** A basic aphid pest event targeting Solanaceae. */
function makeAphidEvent(overrides: Partial<PestEvent> = {}): PestEvent {
  return {
    pest_id: 'aphids',
    target_families: ['Solanaceae'],
    arrival_week: 8,
    severity: 0.7,
    duration_weeks: 4,
    countered_by: ['marigold'],
    visual: 'small_insects_on_leaves',
    ...overrides,
  };
}

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

describe('pestCheckSystem', () => {
  let world: GameWorld;

  beforeEach(() => {
    world = createWorld();
  });

  it('does nothing when no pest events are provided', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const initialHealth = plant.health!.value;

    pestCheckSystem(makeCtx(world));

    expect(plant.health!.value).toBe(initialHealth);
  });

  it('does nothing when pest events are empty', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const initialHealth = plant.health!.value;

    pestCheckSystem(makeCtx(world, { pestEvents: [] }));

    expect(plant.health!.value).toBe(initialHealth);
  });

  it('damages susceptible plants during active pest weeks', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const initialHealth = plant.health!.value;

    // Aphids arrive week 8, duration 4 → active weeks 8-11, current week 10
    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);

    expect(plant.health!.value).toBeLessThan(initialHealth);
    expect(plant.health!.stress).toBeGreaterThan(0);
  });

  it('does not affect plants outside the target family', () => {
    setupSinglePlot(world, 0, 0);
    // Basil is Lamiaceae, not Solanaceae
    const plant = plantSpecies(world, 'basil_genovese', 0, 0);
    const initialHealth = plant.health!.value;

    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);

    expect(plant.health!.value).toBe(initialHealth);
    expect(plant.health!.stress).toBe(0);
  });

  it('does not affect plants outside the active pest window', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const initialHealth = plant.health!.value;

    // Aphids arrive week 8, duration 4 → ends at week 12, current week 13
    const ctx = makeCtx(world, {
      currentWeek: 13,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);

    expect(plant.health!.value).toBe(initialHealth);
  });

  it('does not affect plants before the arrival week', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    const initialHealth = plant.health!.value;

    const ctx = makeCtx(world, {
      currentWeek: 5,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);

    expect(plant.health!.value).toBe(initialHealth);
  });

  it('writes pestInfestation component with correct data', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);

    const infestation = (plant as { pestInfestation?: { infestations: PestInfestationEntry[] } }).pestInfestation;
    expect(infestation).toBeDefined();
    expect(infestation!.infestations.length).toBe(1);
    expect(infestation!.infestations[0].pest_id).toBe('aphids');
    expect(infestation!.infestations[0].visual).toBe('small_insects_on_leaves');
    expect(infestation!.infestations[0].severity).toBeGreaterThan(0);
  });

  it('reduces severity when companion pest_resistance buffs are present', () => {
    setupSinglePlot(world, 0, 0);

    // Plant with no companion buffs
    const unprotected = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // Plant with pest_resistance buff (from basil companion)
    setupSinglePlot(world, 1, 0);
    const protectedPlant = plantSpecies(world, 'tomato_cherokee_purple', 1, 0);
    protectedPlant.companionBuffs!.buffs = [
      {
        source: 'basil_genovese',
        effects: [{ type: 'pest_resistance' as const, modifier: 0.3, radius: 1 }],
      },
    ];

    const pestEvent = makeAphidEvent();
    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [pestEvent],
    });

    pestCheckSystem(ctx);

    // Protected plant should take less damage
    expect(protectedPlant.health!.value).toBeGreaterThan(unprotected.health!.value);
  });

  it('reduces severity when a counter-species is present in the garden', () => {
    // Garden with marigold (counters aphids)
    const w1 = createWorld();
    setupSinglePlot(w1, 0, 0);
    const protectedPlant = plantSpecies(w1, 'tomato_cherokee_purple', 0, 0);
    setupSinglePlot(w1, 1, 0);
    // Add a "marigold" plant — we just need a living entity with species.speciesId = 'marigold'
    w1.add({
      plotSlot: { row: 1, col: 0 },
      species: { speciesId: 'marigold' },
      health: { value: 1, stress: 0 },
    });

    // Garden without marigold
    const w2 = createWorld();
    setupSinglePlot(w2, 0, 0);
    const unprotectedPlant = plantSpecies(w2, 'tomato_cherokee_purple', 0, 0);

    const pestEvent = makeAphidEvent({ countered_by: ['marigold'] });

    pestCheckSystem(makeCtx(w1, { currentWeek: 10, pestEvents: [pestEvent] }));
    pestCheckSystem(makeCtx(w2, { currentWeek: 10, pestEvents: [pestEvent] }));

    // Tomato with marigold nearby should take less damage
    expect(protectedPlant.health!.value).toBeGreaterThan(unprotectedPlant.health!.value);
  });

  it('skips dead plants', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);
    world.addComponent(plant, 'dead', true);
    const initialHealth = plant.health!.value;

    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);

    expect(plant.health!.value).toBe(initialHealth);
  });

  it('clears infestations when pest event window ends', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    // First tick: pest is active
    const ctx1 = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [makeAphidEvent()],
    });
    pestCheckSystem(ctx1);

    const infestation = (plant as { pestInfestation?: { infestations: PestInfestationEntry[] } }).pestInfestation;
    expect(infestation!.infestations.length).toBe(1);

    // Second tick: pest window has ended (week 13, after 8+4=12)
    const ctx2 = makeCtx(world, {
      currentWeek: 13,
      pestEvents: [makeAphidEvent()],
    });
    pestCheckSystem(ctx2);

    expect(infestation!.infestations.length).toBe(0);
  });

  it('handles multiple simultaneous pest events', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const aphids = makeAphidEvent();
    const hornworms: PestEvent = {
      pest_id: 'tomato_hornworm',
      target_families: ['Solanaceae'],
      arrival_week: 9,
      severity: 0.5,
      duration_weeks: 3,
      countered_by: [],
      visual: 'large_caterpillar',
    };

    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [aphids, hornworms],
    });

    pestCheckSystem(ctx);

    const infestation = (plant as { pestInfestation?: { infestations: PestInfestationEntry[] } }).pestInfestation;
    expect(infestation).toBeDefined();
    expect(infestation!.infestations.length).toBe(2);
    expect(infestation!.infestations.map((i) => i.pest_id).sort()).toEqual(['aphids', 'tomato_hornworm']);
  });

  it('cumulative damage from multiple ticks reduces health further', () => {
    setupSinglePlot(world, 0, 0);
    const plant = plantSpecies(world, 'tomato_cherokee_purple', 0, 0);

    const ctx = makeCtx(world, {
      currentWeek: 10,
      pestEvents: [makeAphidEvent()],
    });

    pestCheckSystem(ctx);
    const healthAfterOne = plant.health!.value;

    pestCheckSystem({ ...ctx, currentWeek: 11 });
    const healthAfterTwo = plant.health!.value;

    expect(healthAfterTwo).toBeLessThan(healthAfterOne);
  });
});
