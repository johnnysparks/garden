/**
 * spread_check system — tick order #9
 *
 * Four spread mechanics:
 *
 * 1. **Disease spread** — Diseases marked `spreads: true` propagate to adjacent
 *    plants that share the same vulnerability. Probability scales with source
 *    severity and target susceptibility.
 *
 * 2. **Runner spreading** — Plants with `spreading.runner` (e.g., mint) attempt
 *    to claim adjacent empty plots by spawning new plant entities of the same
 *    species. New plants start at seedling stage.
 *
 * 3. **Self-seeding** — Plants with `spreading.self_seed` that are in the
 *    harvest or senescence stage are flagged with `selfSeeded` for
 *    meta-progression (volunteer plants next run).
 *
 * 4. **Weed pressure** — Empty plots (no plant, no weed) have a chance of
 *    spawning weeds that deplete soil nutrients and moisture. Probability
 *    scales with soil fertility and warmth. Existing weeds grow in severity.
 */

import type { SimulationContext, ActiveCondition, Entity, SoilState } from '../components.js';
import type { GrowthStageId } from '../../../data/types.js';
import type { With } from 'miniplex';

// ── Constants ───────────────────────────────────────────────────────

/** Base spread probability multiplier applied to severity x susceptibility. */
const SPREAD_FACTOR = 0.5;

/** Base probability per tick of a weed spawning in an empty plot. */
const WEED_BASE_RATE = 0.08;

/** How much soil fertility (avg N/P/K) amplifies weed spawn probability. */
const WEED_FERTILITY_WEIGHT = 0.6;

/** How much warmth (normalized soil temp) amplifies weed spawn probability. */
const WEED_WARMTH_WEIGHT = 0.4;

/** Per-tick severity growth for existing weeds. */
const WEED_GROWTH_RATE = 0.05;

/** Maximum weed severity. */
const WEED_MAX_SEVERITY = 1.0;

/** Per-tick nutrient drain per unit of weed severity. */
const WEED_NUTRIENT_DRAIN = 0.02;

/** Per-tick moisture drain per unit of weed severity. */
const WEED_MOISTURE_DRAIN = 0.015;

// ── Helpers ─────────────────────────────────────────────────────────

/** Ordered growth stages for min_stage comparisons. */
const STAGE_ORDER: readonly GrowthStageId[] = [
  'seed', 'germination', 'seedling', 'vegetative', 'flowering', 'fruiting', 'senescence',
] as const;

function isStageAtOrPast(current: string, minStage: GrowthStageId): boolean {
  const curIdx = STAGE_ORDER.indexOf(current as GrowthStageId);
  const minIdx = STAGE_ORDER.indexOf(minStage);
  return curIdx >= minIdx;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
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
): With<Entity, 'plotSlot' | 'species'>[] {
  const plants = ctx.world.with('species', 'plotSlot');
  const result: With<Entity, 'plotSlot' | 'species'>[] = [];
  for (const plant of plants) {
    const dr = Math.abs(plant.plotSlot.row - row);
    const dc = Math.abs(plant.plotSlot.col - col);
    if (dr <= radius && dc <= radius && !(dr === 0 && dc === 0)) {
      result.push(plant);
    }
  }
  return result;
}

/**
 * Check whether a plot position has a plant entity (any species) occupying it.
 */
function hasPlantAt(ctx: SimulationContext, row: number, col: number): boolean {
  const plants = ctx.world.with('species', 'plotSlot');
  for (const plant of plants) {
    if (plant.plotSlot.row === row && plant.plotSlot.col === col) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a plot position has a weed entity occupying it.
 */
function hasWeedAt(ctx: SimulationContext, row: number, col: number): boolean {
  const weeds = ctx.world.with('weed', 'plotSlot');
  for (const weed of weeds) {
    if (weed.plotSlot.row === row && weed.plotSlot.col === col) {
      return true;
    }
  }
  return false;
}

/**
 * Find empty plot entities within Chebyshev distance `radius` of (row, col).
 * A plot is empty if it has no plant and no weed at its position.
 */
function getEmptyPlotsInRadius(
  ctx: SimulationContext,
  row: number,
  col: number,
  radius: number,
): Array<{ row: number; col: number }> {
  const plots = ctx.world.with('plotSlot', 'soil');
  const empty: Array<{ row: number; col: number }> = [];
  for (const plot of plots) {
    const pr = plot.plotSlot.row;
    const pc = plot.plotSlot.col;
    const dr = Math.abs(pr - row);
    const dc = Math.abs(pc - col);
    if (dr <= radius && dc <= radius && !(dr === 0 && dc === 0)) {
      if (!hasPlantAt(ctx, pr, pc) && !hasWeedAt(ctx, pr, pc)) {
        empty.push({ row: pr, col: pc });
      }
    }
  }
  return empty;
}

// ── Disease Spread ──────────────────────────────────────────────────

function diseaseSpread(ctx: SimulationContext): void {
  const { world, currentWeek, rng, speciesLookup } = ctx;
  const plants = world.with('species', 'plotSlot');

  const newInfections: Array<{
    plant: With<Entity, 'plotSlot' | 'species'>;
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
      const vuln = sourceSpecies.vulnerabilities.find(
        (v) => v.condition_id === condition.conditionId,
      );
      if (!vuln || !vuln.symptoms.spreads || vuln.symptoms.spread_radius === 0) continue;

      const radius = vuln.symptoms.spread_radius;
      const neighbors = getPlantsInRadius(ctx, source.plotSlot.row, source.plotSlot.col, radius);

      for (const target of neighbors) {
        if ((target as { dead?: boolean }).dead) continue;

        const targetConditions = (target as { activeConditions?: { conditions: ActiveCondition[] } })
          .activeConditions;
        if (targetConditions?.conditions.some((c) => c.conditionId === condition.conditionId)) {
          continue;
        }

        const targetSpecies = speciesLookup(target.species.speciesId);
        if (!targetSpecies) continue;

        const targetVuln = targetSpecies.vulnerabilities.find(
          (v) => v.condition_id === condition.conditionId,
        );
        if (!targetVuln) continue;

        const targetGrowth = (target as { growth?: { stage: string } }).growth;
        if (
          targetVuln.min_stage &&
          targetGrowth &&
          !isStageAtOrPast(targetGrowth.stage, targetVuln.min_stage)
        ) {
          continue;
        }

        if (targetGrowth && (targetGrowth.stage === 'seed' || targetGrowth.stage === 'germination')) {
          continue;
        }

        const spreadProbability = condition.severity * targetVuln.susceptibility * SPREAD_FACTOR;
        if (rng.next() < spreadProbability) {
          newInfections.push({ plant: target, conditionId: condition.conditionId });
        }
      }
    }
  }

  for (const { plant, conditionId } of newInfections) {
    const targetConditions = (plant as { activeConditions?: { conditions: ActiveCondition[] } })
      .activeConditions;

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

// ── Runner Spreading ────────────────────────────────────────────────

function runnerSpread(ctx: SimulationContext): void {
  const { world, rng, speciesLookup } = ctx;
  const plants = world.with('species', 'plotSlot');

  // Collect new plants to spawn after iteration
  const newPlants: Array<{ speciesId: string; row: number; col: number }> = [];

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species?.spreading?.runner) continue;

    const runner = species.spreading.runner;

    // Check growth stage
    const growth = (plant as { growth?: { stage: string } }).growth;
    if (!growth || !isStageAtOrPast(growth.stage, runner.min_stage)) continue;

    // Roll against spread rate
    if (rng.next() >= runner.rate) continue;

    // Find empty adjacent plots within runner radius
    const emptyPlots = getEmptyPlotsInRadius(
      ctx,
      plant.plotSlot.row,
      plant.plotSlot.col,
      runner.radius,
    );

    if (emptyPlots.length === 0) continue;

    // Pick a random empty plot
    const target = rng.pick(emptyPlots);
    newPlants.push({ speciesId: plant.species.speciesId, row: target.row, col: target.col });
  }

  // Spawn runner offspring
  for (const { speciesId, row, col } of newPlants) {
    world.add({
      plotSlot: { row, col },
      species: { speciesId },
      growth: { progress: 0.15, stage: 'seedling', rate_modifier: 1 },
      health: { value: 0.8, stress: 0.1 },
      activeConditions: { conditions: [] },
      companionBuffs: { buffs: [] },
    } satisfies Entity);
  }
}

// ── Self-Seeding ────────────────────────────────────────────────────

function selfSeedCheck(ctx: SimulationContext): void {
  const { world, rng, speciesLookup } = ctx;
  const plants = world.with('species', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;
    if ((plant as { selfSeeded?: boolean }).selfSeeded) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species?.spreading?.self_seed) continue;

    const growth = (plant as { growth?: { stage: string } }).growth;
    if (!growth) continue;

    // Self-seeding only happens during harvest window or senescence
    if (growth.stage !== 'fruiting' && growth.stage !== 'senescence') continue;

    if (rng.next() < species.spreading.self_seed.rate) {
      world.addComponent(plant, 'selfSeeded', true);
    }
  }
}

// ── Weed Pressure ───────────────────────────────────────────────────

function weedPressure(ctx: SimulationContext): void {
  const { world, rng, weather } = ctx;
  const plots = world.with('plotSlot', 'soil');

  // Grow existing weeds and drain resources
  const weeds = world.with('weed', 'plotSlot');
  for (const weedEntity of weeds) {
    // Increase weed severity over time
    weedEntity.weed.severity = clamp(
      weedEntity.weed.severity + WEED_GROWTH_RATE,
      0,
      WEED_MAX_SEVERITY,
    );

    // Drain soil resources at the weed's plot
    const soil = getSoilAtPosition(ctx, weedEntity.plotSlot.row, weedEntity.plotSlot.col);
    if (soil) {
      const drain = weedEntity.weed.severity;
      soil.nitrogen = clamp(soil.nitrogen - WEED_NUTRIENT_DRAIN * drain, 0, 1);
      soil.phosphorus = clamp(soil.phosphorus - WEED_NUTRIENT_DRAIN * drain, 0, 1);
      soil.potassium = clamp(soil.potassium - WEED_NUTRIENT_DRAIN * drain, 0, 1);
      soil.moisture = clamp(soil.moisture - WEED_MOISTURE_DRAIN * drain, 0, 1);
    }
  }

  // Spawn new weeds on empty plots
  for (const plot of plots) {
    const row = plot.plotSlot.row;
    const col = plot.plotSlot.col;

    // Skip if plot already has a plant or weed
    if (hasPlantAt(ctx, row, col)) continue;
    if (hasWeedAt(ctx, row, col)) continue;

    // Weed probability scales with soil fertility and warmth
    const soil = plot.soil;
    const fertility = (soil.nitrogen + soil.phosphorus + soil.potassium) / 3;
    const warmth = clamp(soil.temperature_c / 30, 0, 1);

    const weedProbability =
      WEED_BASE_RATE *
      (1 + fertility * WEED_FERTILITY_WEIGHT) *
      (1 + warmth * WEED_WARMTH_WEIGHT);

    if (rng.next() < weedProbability) {
      world.add({
        plotSlot: { row, col },
        weed: { severity: 0.1 },
      } satisfies Entity);
    }
  }
}

/**
 * Get the soil state at a given position by finding the plot entity there.
 */
function getSoilAtPosition(
  ctx: SimulationContext,
  row: number,
  col: number,
): SoilState | undefined {
  const plots = ctx.world.with('plotSlot', 'soil');
  for (const plot of plots) {
    if (plot.plotSlot.row === row && plot.plotSlot.col === col) {
      return plot.soil;
    }
  }
  return undefined;
}

// ── Main System ─────────────────────────────────────────────────────

export function spreadCheckSystem(ctx: SimulationContext): void {
  // 1. Disease spread between plants
  diseaseSpread(ctx);

  // 2. Runner plants spread to empty plots
  runnerSpread(ctx);

  // 3. Self-seeding flags for meta-progression
  selfSeedCheck(ctx);

  // 4. Weed pressure on empty plots
  weedPressure(ctx);
}
