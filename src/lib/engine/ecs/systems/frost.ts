/**
 * frost_check system — tick order #10 (last of the requested set)
 *
 * After the first_frost_week_avg, each week has an increasing probability
 * of killing frost (sigmoid curve). Plants are killed or survive based on
 * their frost tolerance.
 */

import type { SimulationContext } from '../components.js';

function sigmoid(x: number, steepness: number): number {
  return 1 / (1 + Math.exp(-steepness * x));
}

export interface FrostResult {
  killingFrost: boolean;
  killed: string[]; // species ids of killed plants
}

export function frostCheckSystem(ctx: SimulationContext): FrostResult {
  const { world, currentWeek, rng, firstFrostWeekAvg } = ctx;
  const result: FrostResult = { killingFrost: false, killed: [] };

  // Only check after the average first frost week approaches
  if (currentWeek < firstFrostWeekAvg - 4) return result;

  const frostProbability = sigmoid(
    currentWeek - firstFrostWeekAvg,
    0.5,
  );

  if (rng.next() >= frostProbability) return result;

  // Killing frost occurs
  result.killingFrost = true;
  const frostSeverity = 0.5 + rng.next() * 0.5; // 0.5–1.0

  const plants = world.with('species', 'health', 'plotSlot');
  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const speciesId = plant.species.speciesId;
    // We need to look up frost tolerance; pass it through ctx
    const species = ctx.speciesLookup(speciesId);
    if (!species) continue;

    const tolerance = species.needs.frost_tolerance;
    let killed = false;

    if (tolerance === 'none') {
      killed = true;
    } else if (tolerance === 'light' && frostSeverity > 0.5) {
      killed = true;
    } else if (tolerance === 'moderate' && frostSeverity > 0.8) {
      killed = true;
    }
    // 'hard' tolerance survives all frosts

    if (killed) {
      world.addComponent(plant, 'dead', true);
      result.killed.push(speciesId);

      // Perennials enter dormancy instead of dying
      const perennial = (plant as { perennial?: { years_established: number; dormant: boolean } }).perennial;
      if (perennial && species.type === 'perennial') {
        world.removeComponent(plant, 'dead');
        perennial.dormant = true;
      }
    }
  }

  return result;
}
