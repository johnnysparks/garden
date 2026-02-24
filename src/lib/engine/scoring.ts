/**
 * End-of-run scoring engine.
 *
 * Calculates a per-run ScoreCard based on the game state at the end
 * of a run. Scores are computed across four categories — Harvest, Soil,
 * Survival, and Knowledge — then multiplied by a zone-based season modifier.
 *
 * Scoring spec: docs/05-META-PROGRESSION.md §Scoring
 */

import type { RunState } from '../state/event-log.js';
import type { GameWorld, SpeciesLookup, SoilState } from './ecs/components.js';

// ── Score types ──────────────────────────────────────────────────────

export interface HarvestScore {
  /** Number of distinct species successfully harvested. */
  speciesCount: number;
  /** Number of unique botanical families among harvested species. */
  familyCount: number;
  /** Number of completed planting sets (e.g. Three Sisters). */
  setCount: number;
  /** Total harvest points. */
  total: number;
}

export interface SoilScore {
  /** Average soil health delta across all plots (can be negative). */
  healthDelta: number;
  /** Number of plots left in better condition than start. */
  plotsImproved: number;
  /** Points from nitrogen-fixer rotation bonus. */
  nitrogenFixerBonus: number;
  /** Total soil points. */
  total: number;
}

export interface SurvivalScore {
  /** Number of plants that reached the harvest stage. */
  harvestReady: number;
  /** Number of plants that died mid-season. */
  deaths: number;
  /** Number of perennials successfully established. */
  perennialsEstablished: number;
  /** Total survival points. */
  total: number;
}

export interface KnowledgeScore {
  /** Number of diagnoses made this run. */
  diagnoses: number;
  /** Number of distinct species planted this run. */
  uniqueSpecies: number;
  /** Total knowledge points. */
  total: number;
}

export interface ScoreCard {
  harvest: HarvestScore;
  soil: SoilScore;
  survival: SurvivalScore;
  knowledge: KnowledgeScore;
  /** Sum of all category totals before zone modifier. */
  subtotal: number;
  /** Zone-based difficulty multiplier. */
  zoneModifier: number;
  /** Final score (subtotal × zoneModifier, rounded). */
  total: number;
}

// ── Point constants ──────────────────────────────────────────────────

const POINTS_PER_SPECIES_HARVESTED = 10;
const POINTS_PER_FAMILY = 5;
const POINTS_PER_SET = 20;

const SOIL_HEALTH_MULTIPLIER = 10;
const POINTS_PER_PLOT_IMPROVED = 5;
const POINTS_NITROGEN_FIXER = 10;

const POINTS_PER_HARVEST_READY = 5;
const POINTS_PER_DEATH = -2;
const POINTS_PER_PERENNIAL = 15;

const POINTS_PER_DIAGNOSIS = 10;
const POINTS_PER_NEW_SPECIES = 5;

// ── Data constants ───────────────────────────────────────────────────

/** Families that fix atmospheric nitrogen (legumes). */
const NITROGEN_FIXER_FAMILIES = new Set(['Fabaceae']);

/** Zone number → score multiplier. */
const ZONE_MODIFIERS: Record<number, number> = {
  5: 2.0,
  6: 1.5,
  7: 1.2,
  8: 1.0,
};

/** Known planting sets that award a bonus when all families are represented. */
const PLANTING_SETS: readonly { name: string; families: readonly string[] }[] = [
  { name: 'Three Sisters', families: ['Poaceae', 'Fabaceae', 'Cucurbitaceae'] },
];

// ── Input type ───────────────────────────────────────────────────────

export interface ScoringInput {
  /** Run state derived from event replay. */
  runState: RunState;
  /** ECS world at end of run. */
  world: GameWorld;
  /** Species data lookup. */
  speciesLookup: SpeciesLookup;
  /** Soil states captured at run start, keyed by "row,col". */
  initialSoilStates?: Map<string, SoilState>;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Composite soil health index (0–1 scale, higher is better).
 * Averages nutrient adequacy, organic matter, and biology,
 * with a compaction penalty.
 */
export function soilHealthIndex(soil: SoilState): number {
  const nutrients = (soil.nitrogen + soil.phosphorus + soil.potassium) / 3;
  const organic = soil.organic_matter;
  const biology = soil.biology;
  const compactionPenalty = soil.compaction * 0.3;
  return (nutrients + organic + biology) / 3 - compactionPenalty;
}

/** Extract zone number from a zone ID like "zone_8a" → 8. */
export function parseZoneNumber(zoneId: string): number | null {
  const match = zoneId.match(/zone_(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Get the season modifier for a zone. Defaults to 1.0 for unknown zones. */
export function getZoneModifier(zoneId: string): number {
  const num = parseZoneNumber(zoneId);
  if (num === null) return 1.0;
  return ZONE_MODIFIERS[num] ?? 1.0;
}

// ── Category scoring ─────────────────────────────────────────────────

function scoreHarvest(input: ScoringInput): HarvestScore {
  const { world, speciesLookup, runState } = input;

  // Find species that were actually harvested (remaining < yield_potential)
  const harvestedSpeciesIds = new Set<string>();

  for (const plant of world.with('species')) {
    const hs = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } })
      .harvestState;
    if (!hs) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    if (hs.remaining < species.harvest.yield_potential) {
      harvestedSpeciesIds.add(plant.species.speciesId);
    }
  }

  const speciesCount = harvestedSpeciesIds.size;

  // Unique botanical families among harvested species
  const families = new Set<string>();
  for (const sid of harvestedSpeciesIds) {
    const species = speciesLookup(sid);
    if (species) families.add(species.family);
  }
  const familyCount = families.size;

  // Check completed planting sets (based on all planted families, not just harvested)
  const allPlantedFamilies = new Set<string>();
  for (const entry of runState.plants) {
    const species = speciesLookup(entry.species_id);
    if (species) allPlantedFamilies.add(species.family);
  }

  let setCount = 0;
  for (const set of PLANTING_SETS) {
    if (set.families.every((f) => allPlantedFamilies.has(f))) {
      setCount++;
    }
  }

  const total =
    speciesCount * POINTS_PER_SPECIES_HARVESTED +
    familyCount * POINTS_PER_FAMILY +
    setCount * POINTS_PER_SET;

  return { speciesCount, familyCount, setCount, total };
}

function scoreSoil(input: ScoringInput): SoilScore {
  const { world, initialSoilStates, runState, speciesLookup } = input;

  let healthDelta = 0;
  let plotsImproved = 0;

  if (initialSoilStates && initialSoilStates.size > 0) {
    const plots = world.with('plotSlot', 'soil');
    let totalDelta = 0;
    let plotCount = 0;

    for (const plot of plots) {
      const key = `${plot.plotSlot.row},${plot.plotSlot.col}`;
      const initial = initialSoilStates.get(key);
      if (!initial) continue;

      const initialHealth = soilHealthIndex(initial);
      const finalHealth = soilHealthIndex(plot.soil);
      const delta = finalHealth - initialHealth;

      totalDelta += delta;
      plotCount++;

      if (delta > 0) plotsImproved++;
    }

    healthDelta = plotCount > 0 ? totalDelta / plotCount : 0;
  }

  // Nitrogen fixer bonus: awarded if any planted species is a legume
  let nitrogenFixerBonus = 0;
  for (const entry of runState.plants) {
    const species = speciesLookup(entry.species_id);
    if (species && NITROGEN_FIXER_FAMILIES.has(species.family)) {
      nitrogenFixerBonus = POINTS_NITROGEN_FIXER;
      break;
    }
  }

  const total =
    Math.round(healthDelta * SOIL_HEALTH_MULTIPLIER) +
    plotsImproved * POINTS_PER_PLOT_IMPROVED +
    nitrogenFixerBonus;

  return { healthDelta, plotsImproved, nitrogenFixerBonus, total };
}

function scoreSurvival(input: ScoringInput): SurvivalScore {
  const { world } = input;

  let harvestReady = 0;
  let deaths = 0;
  let perennialsEstablished = 0;

  for (const plant of world.with('species')) {
    const isDead = (plant as { dead?: boolean }).dead === true;
    const hasHarvestState = !!(plant as { harvestState?: unknown }).harvestState;
    const perennial = (
      plant as { perennial?: { years_established: number; dormant: boolean } }
    ).perennial;

    if (isDead) {
      deaths++;
    }

    if (hasHarvestState) {
      harvestReady++;
    }

    if (perennial && !isDead) {
      perennialsEstablished++;
    }
  }

  const total =
    harvestReady * POINTS_PER_HARVEST_READY +
    deaths * POINTS_PER_DEATH +
    perennialsEstablished * POINTS_PER_PERENNIAL;

  return { harvestReady, deaths, perennialsEstablished, total };
}

function scoreKnowledge(input: ScoringInput): KnowledgeScore {
  const { runState } = input;

  // Count all diagnoses made. When diagnosis verification is implemented,
  // this should distinguish correct (+10) from incorrect (+3 journal entry).
  const diagnoses = runState.diagnoses.length;

  // Count unique species planted this run. When meta-progression tracking
  // is in place, this should only count species grown for the first time.
  const uniqueSpecies = new Set(runState.plants.map((p) => p.species_id)).size;

  const total = diagnoses * POINTS_PER_DIAGNOSIS + uniqueSpecies * POINTS_PER_NEW_SPECIES;

  return { diagnoses, uniqueSpecies, total };
}

// ── Main scoring function ────────────────────────────────────────────

/** Calculate the end-of-run score from current game state. */
export function calculateScore(input: ScoringInput): ScoreCard {
  const harvest = scoreHarvest(input);
  const soil = scoreSoil(input);
  const survival = scoreSurvival(input);
  const knowledge = scoreKnowledge(input);

  const subtotal = harvest.total + soil.total + survival.total + knowledge.total;
  const zoneModifier = getZoneModifier(input.runState.zone);
  const total = Math.round(subtotal * zoneModifier);

  return { harvest, soil, survival, knowledge, subtotal, zoneModifier, total };
}
