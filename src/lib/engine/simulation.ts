/**
 * Tick orchestrator — runs ECS systems in the correct order.
 *
 * The simulation engine runs once per week during the DUSK phase.
 * System execution order matters for emergent behavior.
 *
 * Tick order (subset implemented):
 *   1. WEATHER_APPLY
 *   2. SOIL_UPDATE
 *   3. COMPANION_EFFECTS
 *   4. GROWTH_TICK
 *   5. STRESS_ACCUMULATE
 *   6. DISEASE_CHECK
 *   7. TREATMENT_FEEDBACK
 *   8. PEST_CHECK
 *   9. HARVEST_CHECK
 *  10. SPREAD_CHECK
 *  11. FROST_CHECK
 */

import type { SimulationContext, WeekWeather, SpeciesLookup, PestEvent } from './ecs/components.js';
import type { GameWorld } from './ecs/world.js';
import type { SeededRng } from './rng.js';

import { weatherApplySystem } from './ecs/systems/weather.js';
import { soilUpdateSystem } from './ecs/systems/soil.js';
import { companionEffectsSystem } from './ecs/systems/companion.js';
import { growthTickSystem } from './ecs/systems/growth.js';
import { stressAccumulateSystem } from './ecs/systems/stress.js';
import { diseaseCheckSystem } from './ecs/systems/disease.js';
import { treatmentFeedbackSystem } from './ecs/systems/treatment.js';
import type { TreatmentFeedbackResult } from './ecs/systems/treatment.js';
import { pestCheckSystem } from './ecs/systems/pest.js';
import { harvestCheckSystem } from './ecs/systems/harvest.js';
import { spreadCheckSystem } from './ecs/systems/spread.js';
import { frostCheckSystem } from './ecs/systems/frost.js';
import type { FrostResult } from './ecs/systems/frost.js';

export interface TickResult {
  week: number;
  frost: FrostResult;
  treatmentFeedback: TreatmentFeedbackResult;
}

export interface SimulationConfig {
  world: GameWorld;
  rng: SeededRng;
  speciesLookup: SpeciesLookup;
  firstFrostWeekAvg: number;
  /** Pre-generated pest events for the season. */
  pestEvents?: PestEvent[];
}

/**
 * Execute one full simulation tick (one in-game week).
 */
export function runTick(
  config: SimulationConfig,
  weather: WeekWeather,
  currentWeek: number,
): TickResult {
  const ctx: SimulationContext = {
    world: config.world,
    weather,
    currentWeek,
    rng: config.rng,
    speciesLookup: config.speciesLookup,
    firstFrostWeekAvg: config.firstFrostWeekAvg,
    pestEvents: config.pestEvents,
  };

  // 1. Weather apply
  weatherApplySystem(ctx);

  // 2. Soil update
  soilUpdateSystem(ctx);

  // 3. Companion effects
  companionEffectsSystem(ctx);

  // 4. Growth tick
  growthTickSystem(ctx);

  // 5. Stress accumulation
  stressAccumulateSystem(ctx);

  // 6. Disease check
  diseaseCheckSystem(ctx);

  // 7. Treatment feedback
  const treatmentFeedback = treatmentFeedbackSystem(ctx);

  // 8. Pest check
  pestCheckSystem(ctx);

  // 9. Harvest check
  harvestCheckSystem(ctx);

  // 10. Spread check
  spreadCheckSystem(ctx);

  // 11. Frost check
  const frost = frostCheckSystem(ctx);

  return { week: currentWeek, frost, treatmentFeedback };
}
