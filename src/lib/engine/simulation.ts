/**
 * Tick orchestrator — runs ECS systems in the correct order.
 *
 * The simulation engine runs once per week during the DUSK phase.
 * System execution order matters for emergent behavior.
 *
 * Tick order (subset implemented):
 *   2. SOIL_UPDATE
 *   3. COMPANION_EFFECTS
 *   4. GROWTH_TICK
 *   5. STRESS_ACCUMULATE
 *   6. DISEASE_CHECK
 *   7. PEST_CHECK
 *  10. FROST_CHECK
 */

import type { SimulationContext, WeekWeather, SpeciesLookup, PestEvent } from './ecs/components.js';
import type { GameWorld } from './ecs/world.js';
import type { SeededRng } from './rng.js';

import { soilUpdateSystem } from './ecs/systems/soil.js';
import { companionEffectsSystem } from './ecs/systems/companion.js';
import { growthTickSystem } from './ecs/systems/growth.js';
import { stressAccumulateSystem } from './ecs/systems/stress.js';
import { diseaseCheckSystem } from './ecs/systems/disease.js';
import { pestCheckSystem } from './ecs/systems/pest.js';
import { frostCheckSystem } from './ecs/systems/frost.js';
import type { FrostResult } from './ecs/systems/frost.js';

export interface TickResult {
  week: number;
  frost: FrostResult;
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

  // 7. Pest check
  pestCheckSystem(ctx);

  // 10. Frost check
  const frost = frostCheckSystem(ctx);

  return { week: currentWeek, frost };
}
