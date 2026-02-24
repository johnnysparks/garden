/**
 * growth_tick system — tick order #4
 *
 * Advances each plant's growth progress based on conditions.
 * Uses Liebig's law of the minimum for nutrient adequacy.
 *
 * growth_delta = base_rate × temp_mod × water_mod × nutrient_mod
 *              × light_mod × companion_mod × stress_penalty
 */

import type { SimulationContext, CompanionBuff } from '../components.js';
import { getSoilAt } from '../world.js';
import type {
  GrowthRate,
  GrowthStageId,
  NutrientLevel,
  PlantSpecies,
  SunLevel,
} from '../../../data/types.js';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ── Lookup tables ────────────────────────────────────────────────────

const GROWTH_RATE_VALUE: Record<GrowthRate, number> = {
  slow: 0.7,
  moderate: 1.0,
  fast: 1.3,
  aggressive: 1.6,
};

const NUTRIENT_IDEAL: Record<NutrientLevel, number> = {
  low: 0.25,
  moderate: 0.5,
  high: 0.75,
};

const WATER_IDEAL: Record<string, number> = {
  low: 0.3,
  moderate: 0.5,
  high: 0.7,
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Gaussian response curve: peaks at `ideal`, falls off with distance.
 * tolerance controls width — smaller = stricter requirements.
 */
export function gaussianFit(
  value: number,
  ideal: number,
  tolerance: number,
): number {
  const diff = value - ideal;
  return Math.exp(-(diff * diff) / (2 * tolerance * tolerance));
}

/**
 * How well the plot's sun exposure matches the species' needs.
 */
function sunMatch(need: SunLevel, plotSun: SunLevel): number {
  const levels: SunLevel[] = ['shade', 'partial', 'full'];
  const needIdx = levels.indexOf(need);
  const plotIdx = levels.indexOf(plotSun);
  const diff = Math.abs(needIdx - plotIdx);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.65;
  return 0.35;
}

/**
 * Nutrient adequacy for a single nutrient.
 * Returns 0–1 where 1 = fully adequate.
 */
function nutrientAdequacy(soilLevel: number, need: NutrientLevel): number {
  const ideal = NUTRIENT_IDEAL[need];
  if (soilLevel >= ideal) return 1.0;
  return clamp(soilLevel / ideal, 0, 1);
}

/**
 * Total expected weeks across all growth stages (average of each range).
 * Used by determineStage to distribute progress proportionally across stages.
 */
export function totalExpectedWeeks(species: PlantSpecies): number {
  return species.growth.stages.reduce(
    (sum, s) => sum + (s.duration_weeks[0] + s.duration_weeks[1]) / 2,
    0,
  );
}

/**
 * Average weeks to maturity from the species days_to_maturity range.
 * This represents the expected weeks to reach harvest under good conditions.
 */
export function maturityWeeks(species: PlantSpecies): number {
  const [lo, hi] = species.growth.days_to_maturity;
  return (lo + hi) / 2;
}

/**
 * Determine the current growth stage based on overall progress (0–1).
 * Stages are distributed proportionally by their duration.
 */
export function determineStage(
  species: PlantSpecies,
  progress: number,
): GrowthStageId {
  const total = totalExpectedWeeks(species);
  let accumulated = 0;
  for (const stage of species.growth.stages) {
    const avg = (stage.duration_weeks[0] + stage.duration_weeks[1]) / 2;
    accumulated += avg / total;
    if (progress <= accumulated) return stage.id;
  }
  return species.growth.stages[species.growth.stages.length - 1].id;
}

// ── System ───────────────────────────────────────────────────────────

export function growthTickSystem(ctx: SimulationContext): void {
  const { world, weather, speciesLookup } = ctx;
  const plants = world.with('species', 'growth', 'health', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    const soil = getSoilAt(world, plant.plotSlot.row, plant.plotSlot.col);
    if (!soil) continue;

    // ── base_rate ────────────────────────────────────────────────
    const weeks = maturityWeeks(species);
    const baseRate = GROWTH_RATE_VALUE[species.growth.growth_rate] / weeks;

    // ── temp_modifier (gaussian around ideal growing temp) ───────
    const soilTemp = soil.temperature_c;
    const idealTemp = species.needs.soil_temp_min_c + 10;
    const tempMod = gaussianFit(soilTemp, idealTemp, 8);

    // ── water_modifier ──────────────────────────────────────────
    const idealMoisture = WATER_IDEAL[species.needs.water] ?? 0.5;
    const waterMod = gaussianFit(soil.moisture, idealMoisture, 0.25);

    // ── nutrient_modifier (Liebig's law — minimum rules) ────────
    const nAdequacy = nutrientAdequacy(soil.nitrogen, species.needs.nutrients.N);
    const pAdequacy = nutrientAdequacy(soil.phosphorus, species.needs.nutrients.P);
    const kAdequacy = nutrientAdequacy(soil.potassium, species.needs.nutrients.K);
    const nutrientMod = Math.min(nAdequacy, pAdequacy, kAdequacy);

    // ── light_modifier ──────────────────────────────────────────
    const plotEntity = world.with('plotSlot', 'sunExposure');
    let lightMod = 0.8; // default if no sunExposure data
    for (const pe of plotEntity) {
      if (
        pe.plotSlot.row === plant.plotSlot.row &&
        pe.plotSlot.col === plant.plotSlot.col
      ) {
        lightMod = sunMatch(species.needs.sun, pe.sunExposure.level);
        break;
      }
    }

    // ── companion_modifier ──────────────────────────────────────
    let companionMod = 1.0;
    const buffs = (plant as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs;
    if (buffs) {
      for (const buff of buffs.buffs) {
        for (const eff of buff.effects) {
          if (eff.type === 'growth_rate') {
            companionMod += eff.modifier;
          }
          if (eff.type === 'allelopathy') {
            companionMod += eff.modifier; // negative
          }
        }
      }
    }
    companionMod = Math.max(0.1, companionMod);

    // ── stress_penalty ──────────────────────────────────────────
    const stressPenalty = 1 - plant.health.stress * 0.5;

    // ── combined growth delta ───────────────────────────────────
    const growthDelta =
      baseRate *
      tempMod *
      waterMod *
      nutrientMod *
      lightMod *
      companionMod *
      stressPenalty;

    plant.growth.progress = clamp(plant.growth.progress + growthDelta, 0, 1);
    plant.growth.stage = determineStage(species, plant.growth.progress);
    plant.growth.rate_modifier =
      tempMod * waterMod * nutrientMod * lightMod * companionMod * stressPenalty;
  }
}
