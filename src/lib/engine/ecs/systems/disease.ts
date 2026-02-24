/**
 * disease_check system — tick order #6
 *
 * Each week, for each plant, roll against disease susceptibility.
 * onset_probability = susceptibility × trigger_score × (1 + stress)
 *
 * Active diseases progress through symptom stages. Diseases that
 * spread can boost onset probability for adjacent same-family plants.
 */

import type { SimulationContext, ActiveCondition } from '../components.js';
import { getSoilAt } from '../world.js';
import type { ConditionTrigger, PlantSpecies, Vulnerability } from '../../../data/types.js';
import type { SoilState, WeekWeather } from '../components.js';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Evaluate whether a condition trigger is met by the current environment.
 * Returns the trigger's threshold weight if met, 0 otherwise.
 */
function evaluateTrigger(
  trigger: ConditionTrigger,
  soil: SoilState,
  weather: WeekWeather,
): number {
  switch (trigger.type) {
    case 'humidity_high':
      return weather.humidity >= trigger.threshold ? trigger.threshold : 0;
    case 'humidity_low':
      return weather.humidity <= trigger.threshold ? trigger.threshold : 0;
    case 'temp_high': {
      const avg = (weather.temp_high_c + weather.temp_low_c) / 2;
      return avg >= trigger.threshold ? trigger.threshold : 0;
    }
    case 'temp_low': {
      const avg = (weather.temp_high_c + weather.temp_low_c) / 2;
      return avg <= trigger.threshold ? trigger.threshold : 0;
    }
    case 'overwater':
      return soil.moisture >= trigger.threshold ? trigger.threshold : 0;
    case 'underwater':
      return soil.moisture <= trigger.threshold ? trigger.threshold : 0;
    case 'ph_high':
      return soil.ph >= trigger.threshold ? trigger.threshold : 0;
    case 'ph_low':
      return soil.ph <= trigger.threshold ? trigger.threshold : 0;
    case 'nutrient_deficiency': {
      const minNutrient = Math.min(soil.nitrogen, soil.phosphorus, soil.potassium);
      return minNutrient <= trigger.threshold ? trigger.threshold : 0;
    }
    case 'nutrient_excess': {
      const maxNutrient = Math.max(soil.nitrogen, soil.phosphorus, soil.potassium);
      return maxNutrient >= trigger.threshold ? trigger.threshold : 0;
    }
    case 'crowding':
      return 0; // requires spatial query — not evaluated here
    case 'pest_vector':
      return 0; // requires pest system — not evaluated here
  }
}

export function diseaseCheckSystem(ctx: SimulationContext): void {
  const { world, weather, currentWeek, rng, speciesLookup } = ctx;
  const plants = world.with('species', 'health', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    // Seeds and germinating plants are pre-emergence — skip disease checks
    const growth = (plant as { growth?: { stage: string } }).growth;
    if (growth && (growth.stage === 'seed' || growth.stage === 'germination')) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    const soil = getSoilAt(world, plant.plotSlot.row, plant.plotSlot.col);
    if (!soil) continue;

    // Ensure activeConditions component exists
    const plantEntity = plant as typeof plant & {
      activeConditions?: { conditions: ActiveCondition[] };
    };
    if (!plantEntity.activeConditions) {
      world.addComponent(plant, 'activeConditions', { conditions: [] });
    }
    const conditions = (plant as typeof plant & { activeConditions: { conditions: ActiveCondition[] } }).activeConditions;

    // ── Progress existing diseases ───────────────────────────────
    for (const condition of conditions.conditions) {
      const vuln = species.vulnerabilities.find(
        (v) => v.condition_id === condition.conditionId,
      );
      if (!vuln) continue;

      const weeksSinceOnset = currentWeek - condition.onset_week;
      // Advance to next symptom stage if ready
      for (let i = vuln.symptoms.stages.length - 1; i >= 0; i--) {
        if (weeksSinceOnset >= vuln.symptoms.stages[i].week) {
          condition.current_stage = i;
          break;
        }
      }

      // Severity increases over time
      condition.severity = clamp(
        condition.severity + 0.05,
        0,
        1,
      );

      // Check for death from disease
      if (
        vuln.symptoms.weeks_to_death !== null &&
        weeksSinceOnset >= vuln.symptoms.weeks_to_death
      ) {
        world.addComponent(plant, 'dead', true);
      }
    }

    // ── Check for new disease onset ──────────────────────────────
    for (const vuln of species.vulnerabilities) {
      // Skip if already has this condition
      if (conditions.conditions.some((c) => c.conditionId === vuln.condition_id)) {
        continue;
      }

      const triggerScore = vuln.triggers.reduce(
        (sum, t) => sum + evaluateTrigger(t, soil, weather),
        0,
      );

      if (triggerScore <= 0) continue;

      const onsetProbability =
        vuln.susceptibility * triggerScore * (1 + plant.health.stress);

      if (rng.next() < onsetProbability) {
        conditions.conditions.push({
          conditionId: vuln.condition_id,
          onset_week: currentWeek,
          current_stage: 0,
          severity: 0.1,
        });
      }
    }
  }
}
