/**
 * stress_accumulate system — tick order #5
 *
 * Stress accumulates when conditions are outside the plant's ideal ranges
 * and recovers slowly when all conditions are met.
 *
 * Stress affects growth rate, visual appearance, disease susceptibility,
 * and yield.
 */

import type { SimulationContext, ActiveCondition } from '../components.js';
import { getSoilAt } from '../world.js';
import type { NutrientLevel } from '../../../data/types.js';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

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

const STRESS_TO_HEALTH_FACTOR = 0.7;
const DISEASE_HEALTH_PER_STAGE = 0.1;

export function stressAccumulateSystem(ctx: SimulationContext): void {
  const { world, weather, speciesLookup } = ctx;
  const plants = world.with('species', 'health', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    const soil = getSoilAt(world, plant.plotSlot.row, plant.plotSlot.col);
    if (!soil) continue;

    let stressDelta = 0;
    let allConditionsMet = true;

    // ── pH stress ────────────────────────────────────────────────
    const [phMin, phMax] = species.needs.soil_ph;
    if (soil.ph < phMin) {
      stressDelta += 0.05 * (phMin - soil.ph);
      allConditionsMet = false;
    } else if (soil.ph > phMax) {
      stressDelta += 0.05 * (soil.ph - phMax);
      allConditionsMet = false;
    }

    // ── Moisture stress ──────────────────────────────────────────
    const idealMoisture = WATER_IDEAL[species.needs.water] ?? 0.5;
    const moistureDiff = soil.moisture - idealMoisture;
    if (moistureDiff > 0.25) {
      stressDelta += 0.08; // overwatered
      allConditionsMet = false;
    } else if (moistureDiff < -0.25) {
      stressDelta += 0.1; // underwatered
      allConditionsMet = false;
    }

    // ── Temperature stress ───────────────────────────────────────
    const soilTemp = soil.temperature_c;
    const idealTemp = species.needs.soil_temp_min_c + 10;
    const tempDist = Math.abs(soilTemp - idealTemp);
    if (tempDist > 10) {
      stressDelta += 0.05 * ((tempDist - 10) / 10);
      allConditionsMet = false;
    }

    // ── Nutrient deficiency stress ───────────────────────────────
    const nutrients: Array<{ soil: number; need: NutrientLevel }> = [
      { soil: soil.nitrogen, need: species.needs.nutrients.N },
      { soil: soil.phosphorus, need: species.needs.nutrients.P },
      { soil: soil.potassium, need: species.needs.nutrients.K },
    ];
    for (const { soil: level, need } of nutrients) {
      const ideal = NUTRIENT_IDEAL[need];
      if (level < ideal * 0.5) {
        stressDelta += 0.06;
        allConditionsMet = false;
      }
    }

    // ── Recovery ─────────────────────────────────────────────────
    if (allConditionsMet) {
      // Full recovery when all conditions are ideal. Rate is high enough
      // that a plant stressed early in the season (e.g. ~0.6 stress by week 8)
      // can meaningfully recover once summer conditions arrive.
      stressDelta -= 0.06;
    } else if (stressDelta < 0.04) {
      // Partial recovery when conditions are nearly ideal (only minor stressors
      // present). Prevents runaway stress accumulation from tiny deviations and
      // lets plants stabilize as conditions gradually improve.
      stressDelta -= 0.02;
    }

    plant.health.stress = clamp(plant.health.stress + stressDelta, 0, 1);

    // ── Update health from stress + disease ──────────────────────
    const conditions = (plant as { activeConditions?: { conditions: ActiveCondition[] } }).activeConditions;
    let diseasePenalty = 0;
    if (conditions) {
      for (const c of conditions.conditions) {
        diseasePenalty += c.current_stage * DISEASE_HEALTH_PER_STAGE;
      }
    }

    plant.health.value = clamp(
      1 - plant.health.stress * STRESS_TO_HEALTH_FACTOR - diseasePenalty,
      0,
      1,
    );
  }
}
