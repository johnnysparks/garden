import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  soilHealthIndex,
  parseZoneNumber,
  getZoneModifier,
  type ScoringInput,
} from '../../src/lib/engine/scoring.js';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import { createEmptyRunState, type RunState } from '../../src/lib/state/event-log.js';
import type { SoilState } from '../../src/lib/engine/ecs/components.js';
import {
  TOMATO,
  BASIL,
  ROSEMARY,
  FENNEL,
  makeSpeciesLookup,
  makeDefaultSoil,
  setupSinglePlot,
  plantSpecies,
} from './fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return { ...createEmptyRunState(), started: true, zone: 'zone_8a', ...overrides };
}

function makeScoringInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    runState: makeRunState(),
    world: createWorld(),
    speciesLookup: makeSpeciesLookup(),
    ...overrides,
  };
}

// ── soilHealthIndex ──────────────────────────────────────────────────

describe('soilHealthIndex', () => {
  it('returns a value in 0–1 range for default soil', () => {
    const soil = makeDefaultSoil();
    const index = soilHealthIndex(soil);
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThanOrEqual(1);
  });

  it('returns higher value for better soil', () => {
    const poor: SoilState = {
      ph: 6.5,
      nitrogen: 0.2,
      phosphorus: 0.2,
      potassium: 0.2,
      organic_matter: 0.1,
      moisture: 0.5,
      temperature_c: 20,
      compaction: 0.8,
      biology: 0.1,
    };
    const rich: SoilState = {
      ph: 6.5,
      nitrogen: 0.9,
      phosphorus: 0.9,
      potassium: 0.9,
      organic_matter: 0.9,
      moisture: 0.5,
      temperature_c: 20,
      compaction: 0.1,
      biology: 0.9,
    };
    expect(soilHealthIndex(rich)).toBeGreaterThan(soilHealthIndex(poor));
  });

  it('penalizes high compaction', () => {
    const base = makeDefaultSoil();
    const compacted = { ...base, compaction: 0.9 };
    expect(soilHealthIndex(compacted)).toBeLessThan(soilHealthIndex(base));
  });
});

// ── parseZoneNumber ──────────────────────────────────────────────────

describe('parseZoneNumber', () => {
  it('extracts zone number from standard zone IDs', () => {
    expect(parseZoneNumber('zone_8a')).toBe(8);
    expect(parseZoneNumber('zone_7b')).toBe(7);
    expect(parseZoneNumber('zone_5a')).toBe(5);
    expect(parseZoneNumber('zone_10a')).toBe(10);
  });

  it('returns null for non-matching strings', () => {
    expect(parseZoneNumber('')).toBeNull();
    expect(parseZoneNumber('tropical')).toBeNull();
  });
});

// ── getZoneModifier ──────────────────────────────────────────────────

describe('getZoneModifier', () => {
  it('returns correct modifiers for known zones', () => {
    expect(getZoneModifier('zone_8a')).toBe(1.0);
    expect(getZoneModifier('zone_7b')).toBe(1.2);
    expect(getZoneModifier('zone_6a')).toBe(1.5);
    expect(getZoneModifier('zone_5a')).toBe(2.0);
  });

  it('defaults to 1.0 for unknown zones', () => {
    expect(getZoneModifier('zone_4a')).toBe(1.0);
    expect(getZoneModifier('zone_9a')).toBe(1.0);
    expect(getZoneModifier('unknown')).toBe(1.0);
  });
});

// ── calculateScore — empty run ───────────────────────────────────────

describe('calculateScore', () => {
  it('returns all zeros for an empty run', () => {
    const score = calculateScore(makeScoringInput());

    expect(score.harvest.speciesCount).toBe(0);
    expect(score.harvest.familyCount).toBe(0);
    expect(score.harvest.setCount).toBe(0);
    expect(score.harvest.total).toBe(0);

    expect(score.soil.healthDelta).toBe(0);
    expect(score.soil.plotsImproved).toBe(0);
    expect(score.soil.nitrogenFixerBonus).toBe(0);
    expect(score.soil.total).toBe(0);

    expect(score.survival.harvestReady).toBe(0);
    expect(score.survival.deaths).toBe(0);
    expect(score.survival.perennialsEstablished).toBe(0);
    expect(score.survival.total).toBe(0);

    expect(score.knowledge.diagnoses).toBe(0);
    expect(score.knowledge.uniqueSpecies).toBe(0);
    expect(score.knowledge.total).toBe(0);

    expect(score.subtotal).toBe(0);
    expect(score.zoneModifier).toBe(1.0);
    expect(score.total).toBe(0);
  });

  // ── Harvest scoring ──────────────────────────────────────────────

  describe('harvest scoring', () => {
    it('counts distinct harvested species', () => {
      const world = createWorld();
      // Tomato: harvested (remaining < yield_potential)
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        growth: { progress: 0.8, stage: 'fruiting', rate_modifier: 1 },
        health: { value: 0.8, stress: 0.1 },
        harvestState: { ripe: false, remaining: 5, quality: 0.8 },
      });
      // Basil: harvested
      world.add({
        species: { speciesId: 'basil_genovese' },
        growth: { progress: 0.7, stage: 'vegetative', rate_modifier: 1 },
        health: { value: 0.9, stress: 0 },
        harvestState: { ripe: true, remaining: 4, quality: 1.0 },
      });

      const input = makeScoringInput({
        world,
        runState: makeRunState({
          plants: [
            { species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 },
            { species_id: 'basil_genovese', plot: [0, 1], week: 5 },
          ],
        }),
      });

      const score = calculateScore(input);
      // 2 species × 10 = 20, 2 families (Solanaceae, Lamiaceae) × 5 = 10
      expect(score.harvest.speciesCount).toBe(2);
      expect(score.harvest.familyCount).toBe(2);
      expect(score.harvest.total).toBe(30);
    });

    it('does not count unharvested plants', () => {
      const world = createWorld();
      // Tomato with full remaining — not yet harvested
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        growth: { progress: 0.8, stage: 'fruiting', rate_modifier: 1 },
        health: { value: 0.8, stress: 0.1 },
        harvestState: { ripe: true, remaining: 7, quality: 1.0 }, // full yield_potential
      });

      const input = makeScoringInput({
        world,
        runState: makeRunState({
          plants: [{ species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 }],
        }),
      });

      const score = calculateScore(input);
      expect(score.harvest.speciesCount).toBe(0);
      expect(score.harvest.total).toBe(0);
    });

    it('does not double-count same species from multiple plants', () => {
      const world = createWorld();
      // Two tomato plants, both harvested
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        harvestState: { ripe: false, remaining: 3, quality: 0.7 },
      });
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        harvestState: { ripe: false, remaining: 5, quality: 0.6 },
      });

      const input = makeScoringInput({
        world,
        runState: makeRunState({
          plants: [
            { species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 },
            { species_id: 'tomato_cherokee_purple', plot: [1, 0], week: 5 },
          ],
        }),
      });

      const score = calculateScore(input);
      expect(score.harvest.speciesCount).toBe(1);
      expect(score.harvest.familyCount).toBe(1);
    });

    it('awards set bonus when all families are planted', () => {
      const world = createWorld();
      const lookup = makeSpeciesLookup([
        TOMATO,
        { ...BASIL, id: 'corn', family: 'Poaceae' } as typeof BASIL,
        { ...FENNEL, id: 'bean', family: 'Fabaceae' } as typeof FENNEL,
        { ...FENNEL, id: 'squash', family: 'Cucurbitaceae' } as typeof FENNEL,
      ]);

      const input = makeScoringInput({
        world,
        speciesLookup: lookup,
        runState: makeRunState({
          plants: [
            { species_id: 'corn', plot: [0, 0], week: 4 },
            { species_id: 'bean', plot: [0, 1], week: 4 },
            { species_id: 'squash', plot: [0, 2], week: 4 },
          ],
        }),
      });

      const score = calculateScore(input);
      expect(score.harvest.setCount).toBe(1);
      // setCount × 20 = 20 (no harvested species, so only set bonus)
      expect(score.harvest.total).toBe(20);
    });
  });

  // ── Soil scoring ─────────────────────────────────────────────────

  describe('soil scoring', () => {
    it('calculates positive soil health delta', () => {
      const world = createWorld();
      // Plot with improved soil
      world.add({
        plotSlot: { row: 0, col: 0 },
        soil: {
          ...makeDefaultSoil(),
          nitrogen: 0.8,
          phosphorus: 0.8,
          potassium: 0.8,
          organic_matter: 0.7,
          biology: 0.7,
          compaction: 0.1,
        },
      });

      const initialSoilStates = new Map<string, SoilState>();
      initialSoilStates.set('0,0', makeDefaultSoil());

      const input = makeScoringInput({
        world,
        initialSoilStates,
      });

      const score = calculateScore(input);
      expect(score.soil.healthDelta).toBeGreaterThan(0);
      expect(score.soil.plotsImproved).toBe(1);
      expect(score.soil.total).toBeGreaterThan(0);
    });

    it('penalizes degraded soil', () => {
      const world = createWorld();
      world.add({
        plotSlot: { row: 0, col: 0 },
        soil: {
          ...makeDefaultSoil(),
          nitrogen: 0.2,
          phosphorus: 0.2,
          potassium: 0.2,
          organic_matter: 0.2,
          biology: 0.2,
          compaction: 0.7,
        },
      });

      const initialSoilStates = new Map<string, SoilState>();
      initialSoilStates.set('0,0', makeDefaultSoil());

      const input = makeScoringInput({
        world,
        initialSoilStates,
      });

      const score = calculateScore(input);
      expect(score.soil.healthDelta).toBeLessThan(0);
      expect(score.soil.plotsImproved).toBe(0);
    });

    it('skips soil scoring when no initial states provided', () => {
      const world = createWorld();
      world.add({ plotSlot: { row: 0, col: 0 }, soil: makeDefaultSoil() });

      const input = makeScoringInput({ world });

      const score = calculateScore(input);
      expect(score.soil.healthDelta).toBe(0);
      expect(score.soil.plotsImproved).toBe(0);
    });

    it('awards nitrogen fixer bonus for legumes', () => {
      const world = createWorld();
      const lookup = makeSpeciesLookup([
        { ...BASIL, id: 'green_bean', family: 'Fabaceae' } as typeof BASIL,
      ]);

      const input = makeScoringInput({
        world,
        speciesLookup: lookup,
        runState: makeRunState({
          plants: [{ species_id: 'green_bean', plot: [0, 0], week: 4 }],
        }),
      });

      const score = calculateScore(input);
      expect(score.soil.nitrogenFixerBonus).toBe(10);
    });

    it('does not award nitrogen fixer bonus for non-legumes', () => {
      const input = makeScoringInput({
        runState: makeRunState({
          plants: [{ species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 }],
        }),
      });

      const score = calculateScore(input);
      expect(score.soil.nitrogenFixerBonus).toBe(0);
    });
  });

  // ── Survival scoring ─────────────────────────────────────────────

  describe('survival scoring', () => {
    it('counts plants that reached harvest stage', () => {
      const world = createWorld();
      // Plant with harvestState = reached harvest
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        harvestState: { ripe: true, remaining: 7, quality: 1.0 },
      });
      // Plant without harvestState = did not reach harvest
      world.add({
        species: { speciesId: 'basil_genovese' },
        growth: { progress: 0.3, stage: 'vegetative', rate_modifier: 1 },
        health: { value: 0.8, stress: 0.1 },
      });

      const input = makeScoringInput({ world });

      const score = calculateScore(input);
      expect(score.survival.harvestReady).toBe(1);
    });

    it('counts dead plants as deaths', () => {
      const world = createWorld();
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        dead: true,
      });
      world.add({
        species: { speciesId: 'basil_genovese' },
        dead: true,
      });
      world.add({
        species: { speciesId: 'fennel' },
        health: { value: 0.5, stress: 0.2 },
      });

      const input = makeScoringInput({ world });

      const score = calculateScore(input);
      expect(score.survival.deaths).toBe(2);
      // 0 harvest ready × 5 + 2 deaths × -2 + 0 perennials = -4
      expect(score.survival.total).toBe(-4);
    });

    it('counts living perennials as established', () => {
      const world = createWorld();
      // Living perennial
      world.add({
        species: { speciesId: 'rosemary' },
        perennial: { years_established: 1, dormant: false },
      });
      // Dormant perennial (not dead, counts as established)
      world.add({
        species: { speciesId: 'rosemary' },
        perennial: { years_established: 2, dormant: true },
      });

      const input = makeScoringInput({ world });

      const score = calculateScore(input);
      expect(score.survival.perennialsEstablished).toBe(2);
      expect(score.survival.total).toBe(30); // 2 × 15
    });

    it('does not count dead perennials', () => {
      const world = createWorld();
      world.add({
        species: { speciesId: 'rosemary' },
        perennial: { years_established: 1, dormant: false },
        dead: true,
      });

      const input = makeScoringInput({ world });

      const score = calculateScore(input);
      expect(score.survival.perennialsEstablished).toBe(0);
      expect(score.survival.deaths).toBe(1);
    });
  });

  // ── Knowledge scoring ────────────────────────────────────────────

  describe('knowledge scoring', () => {
    it('counts diagnoses from run state', () => {
      const input = makeScoringInput({
        runState: makeRunState({
          diagnoses: [
            { plant_id: 'p1', hypothesis: 'early_blight', week: 8 },
            { plant_id: 'p2', hypothesis: 'nitrogen_deficiency', week: 10 },
          ],
        }),
      });

      const score = calculateScore(input);
      expect(score.knowledge.diagnoses).toBe(2);
      // 2 × 10 = 20
      expect(score.knowledge.total).toBeGreaterThanOrEqual(20);
    });

    it('counts unique species planted', () => {
      const input = makeScoringInput({
        runState: makeRunState({
          plants: [
            { species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 },
            { species_id: 'tomato_cherokee_purple', plot: [1, 0], week: 5 },
            { species_id: 'basil_genovese', plot: [0, 1], week: 5 },
            { species_id: 'rosemary', plot: [0, 2], week: 3 },
          ],
        }),
      });

      const score = calculateScore(input);
      expect(score.knowledge.uniqueSpecies).toBe(3);
      // 3 × 5 = 15
      expect(score.knowledge.total).toBe(15);
    });
  });

  // ── Zone modifier ────────────────────────────────────────────────

  describe('zone modifier', () => {
    it('applies zone 8 modifier (1.0)', () => {
      const input = makeScoringInput({
        runState: makeRunState({ zone: 'zone_8a' }),
      });
      const score = calculateScore(input);
      expect(score.zoneModifier).toBe(1.0);
    });

    it('applies zone 5 modifier (2.0) to subtotal', () => {
      const world = createWorld();
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        harvestState: { ripe: false, remaining: 3, quality: 0.8 },
      });

      const input = makeScoringInput({
        world,
        runState: makeRunState({
          zone: 'zone_5a',
          plants: [{ species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 }],
        }),
      });

      const score = calculateScore(input);
      expect(score.zoneModifier).toBe(2.0);
      expect(score.total).toBe(Math.round(score.subtotal * 2.0));
    });
  });

  // ── Integration ──────────────────────────────────────────────────

  describe('integration', () => {
    it('calculates a full score for a realistic run', () => {
      const world = createWorld();

      // Set up plots with soil
      setupSinglePlot(world, 0, 0);
      setupSinglePlot(world, 0, 1);
      setupSinglePlot(world, 1, 0);

      // Tomato: harvested, alive
      world.add({
        species: { speciesId: 'tomato_cherokee_purple' },
        plotSlot: { row: 0, col: 0 },
        growth: { progress: 0.9, stage: 'fruiting', rate_modifier: 1 },
        health: { value: 0.7, stress: 0.2 },
        harvestState: { ripe: false, remaining: 4, quality: 0.6 },
      });

      // Basil: harvested, alive
      world.add({
        species: { speciesId: 'basil_genovese' },
        plotSlot: { row: 0, col: 1 },
        growth: { progress: 0.8, stage: 'flowering', rate_modifier: 1 },
        health: { value: 0.9, stress: 0 },
        harvestState: { ripe: true, remaining: 3, quality: 0.9 },
      });

      // Fennel: died before harvest
      world.add({
        species: { speciesId: 'fennel' },
        plotSlot: { row: 1, col: 0 },
        growth: { progress: 0.4, stage: 'vegetative', rate_modifier: 1 },
        health: { value: 0, stress: 1 },
        dead: true,
      });

      const initialSoilStates = new Map<string, SoilState>();
      initialSoilStates.set('0,0', makeDefaultSoil());
      initialSoilStates.set('0,1', makeDefaultSoil());
      initialSoilStates.set('1,0', makeDefaultSoil());

      const input: ScoringInput = {
        runState: makeRunState({
          zone: 'zone_8a',
          plants: [
            { species_id: 'tomato_cherokee_purple', plot: [0, 0], week: 4 },
            { species_id: 'basil_genovese', plot: [0, 1], week: 5 },
            { species_id: 'fennel', plot: [1, 0], week: 4 },
          ],
          harvests: [
            { plant_id: 'p0', week: 14 },
            { plant_id: 'p1', week: 15 },
          ],
          diagnoses: [{ plant_id: 'p2', hypothesis: 'root_rot', week: 10 }],
        }),
        world,
        speciesLookup: makeSpeciesLookup(),
        initialSoilStates,
      };

      const score = calculateScore(input);

      // Harvest: 2 species (tomato, basil) × 10 = 20
      //   + 2 families (Solanaceae, Lamiaceae) × 5 = 10 → 30
      expect(score.harvest.speciesCount).toBe(2);
      expect(score.harvest.familyCount).toBe(2);
      expect(score.harvest.total).toBe(30);

      // Survival: 2 harvest-ready × 5 = 10, 1 death × -2 = -2 → 8
      expect(score.survival.harvestReady).toBe(2);
      expect(score.survival.deaths).toBe(1);
      expect(score.survival.total).toBe(8);

      // Knowledge: 1 diagnosis × 10 = 10, 3 species × 5 = 15 → 25
      expect(score.knowledge.diagnoses).toBe(1);
      expect(score.knowledge.uniqueSpecies).toBe(3);
      expect(score.knowledge.total).toBe(25);

      // Soil: default soil unchanged → delta = 0, no improvement
      expect(score.soil.plotsImproved).toBe(0);

      // Zone 8a modifier = 1.0
      expect(score.zoneModifier).toBe(1.0);

      // Total = subtotal × 1.0
      expect(score.total).toBe(score.subtotal);
      expect(score.total).toBeGreaterThan(0);
    });
  });
});
