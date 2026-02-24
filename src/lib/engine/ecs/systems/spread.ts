/**
 * spread_check system — tick order #9
 *
 * Diseases marked with `spreads: true` can propagate to adjacent plants
 * within the vulnerability's `spread_radius`. Each week, for each infected
 * plant, we look for susceptible neighbors and roll against:
 *
 *   spread_probability = source.severity × target.susceptibility × SPREAD_FACTOR
 *
 * Spread only occurs between plants that share the same vulnerability
 * (i.e., target species must define the same condition_id). This models
 * real horticultural behavior: early blight spreads between solanaceous
 * plants, not across unrelated families.
 */

import type { SimulationContext, ActiveCondition } from '../components.js';
import type { GrowthStageId } from '../../../data/types.js';

/** Base spread probability multiplier applied to severity × susceptibility. */
const SPREAD_FACTOR = 0.5;

/** Ordered growth stages for min_stage comparisons. */
const STAGE_ORDER: readonly GrowthStageId[] = [
  'seed', 'germination', 'seedling', 'vegetative', 'flowering', 'fruiting', 'senescence',
] as const;

function isStageAtOrPast(current: string, minStage: GrowthStageId): boolean {
  const curIdx = STAGE_ORDER.indexOf(current as GrowthStageId);
  const minIdx = STAGE_ORDER.indexOf(minStage);
  return curIdx >= minIdx;
}

/**
 * Find all plant entities within Chebyshev distance `radius` of (row, col),
 * excluding the plant at (row, col) itself.
 */
function getPlantsInRadius(
  ctx: SimulationContext,
  row: number,
  col: number,
  radius: number,
): ReturnType<SimulationContext['world']['with']> extends Iterable<infer T> ? T[] : never[] {
  const plants = ctx.world.with('species', 'plotSlot');
  const result: typeof plants.entities = [];
  for (const plant of plants) {
    const dr = Math.abs(plant.plotSlot.row - row);
    const dc = Math.abs(plant.plotSlot.col - col);
    if (dr <= radius && dc <= radius && !(dr === 0 && dc === 0)) {
      result.push(plant);
    }
  }
  return result as ReturnType<typeof getPlantsInRadius>;
}

export function spreadCheckSystem(ctx: SimulationContext): void {
  const { world, currentWeek, rng, speciesLookup } = ctx;
  const plants = world.with('species', 'plotSlot');

  // Collect spread events to apply after iterating (avoid mutating during iteration)
  const newInfections: Array<{
    plant: (typeof plants.entities)[number];
    conditionId: string;
  }> = [];

  for (const source of plants) {
    if ((source as { dead?: boolean }).dead) continue;

    const sourceConditions = (source as { activeConditions?: { conditions: ActiveCondition[] } })
      .activeConditions;
    if (!sourceConditions || sourceConditions.conditions.length === 0) continue;

    const sourceSpecies = speciesLookup(source.species.speciesId);
    if (!sourceSpecies) continue;

    for (const condition of sourceConditions.conditions) {
      // Look up the vulnerability to get spread parameters
      const vuln = sourceSpecies.vulnerabilities.find(
        (v) => v.condition_id === condition.conditionId,
      );
      if (!vuln || !vuln.symptoms.spreads || vuln.symptoms.spread_radius === 0) continue;

      const radius = vuln.symptoms.spread_radius;

      // Find neighboring plants within spread_radius
      const neighbors = getPlantsInRadius(ctx, source.plotSlot.row, source.plotSlot.col, radius);

      for (const target of neighbors) {
        if ((target as { dead?: boolean }).dead) continue;

        // Skip if target is already infected with this condition
        const targetConditions = (target as { activeConditions?: { conditions: ActiveCondition[] } })
          .activeConditions;
        if (targetConditions?.conditions.some((c) => c.conditionId === condition.conditionId)) {
          continue;
        }

        // Target must be susceptible (define the same vulnerability)
        const targetSpecies = speciesLookup(target.species.speciesId);
        if (!targetSpecies) continue;

        const targetVuln = targetSpecies.vulnerabilities.find(
          (v) => v.condition_id === condition.conditionId,
        );
        if (!targetVuln) continue;

        // Skip if target hasn't reached min_stage for this disease
        const targetGrowth = (target as { growth?: { stage: string } }).growth;
        if (
          targetVuln.min_stage &&
          targetGrowth &&
          !isStageAtOrPast(targetGrowth.stage, targetVuln.min_stage)
        ) {
          continue;
        }

        // Skip seeds/germinating plants
        if (targetGrowth && (targetGrowth.stage === 'seed' || targetGrowth.stage === 'germination')) {
          continue;
        }

        // Spread probability scales with source severity and target susceptibility
        const spreadProbability = condition.severity * targetVuln.susceptibility * SPREAD_FACTOR;

        if (rng.next() < spreadProbability) {
          newInfections.push({ plant: target, conditionId: condition.conditionId });
        }
      }
    }
  }

  // Apply collected infections
  for (const { plant, conditionId } of newInfections) {
    const targetConditions = (plant as { activeConditions?: { conditions: ActiveCondition[] } })
      .activeConditions;

    // Double-check: another spread might have already infected this plant this tick
    if (targetConditions?.conditions.some((c) => c.conditionId === conditionId)) continue;

    if (targetConditions) {
      targetConditions.conditions.push({
        conditionId,
        onset_week: currentWeek,
        current_stage: 0,
        severity: 0.1,
      });
    } else {
      world.addComponent(plant, 'activeConditions', {
        conditions: [
          {
            conditionId,
            onset_week: currentWeek,
            current_stage: 0,
            severity: 0.1,
          },
        ],
      });
    }
  }
}
