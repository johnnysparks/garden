/**
 * harvest_check system — tick order #8
 *
 * Marks plants as harvestable when they enter their species' harvest window
 * and meet minimum health requirements. For plants already flagged as ripe,
 * quality degrades each week they go unharvested.
 *
 * Continuous harvest plants (e.g. tomatoes, basil) remain harvestable until
 * their remaining yield is exhausted or the window closes.
 */

import type { SimulationContext } from '../components.js';

// ── Constants ────────────────────────────────────────────────────────

/** Minimum health (0-1) required for a plant to be flagged harvestable. */
const HARVEST_HEALTH_MINIMUM = 0.3;

/** Quality lost per week when a ripe plant goes unharvested. */
const QUALITY_DECAY_PER_WEEK = 0.15;

/** Minimum quality floor — produce never drops below this. */
const QUALITY_FLOOR = 0.1;

/** Growth stages too early for any harvest — plant has no usable produce yet. */
const PRE_HARVEST_STAGES = new Set(['seed', 'germination', 'seedling']);

// ── System ───────────────────────────────────────────────────────────

export function harvestCheckSystem(ctx: SimulationContext): void {
  const { world, currentWeek, speciesLookup } = ctx;

  const plants = world.with('species', 'growth', 'health', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    const [windowStart, windowEnd] = species.season.harvest_window;
    const inWindow = currentWeek >= windowStart && currentWeek <= windowEnd;
    const healthyEnough = plant.health.value >= HARVEST_HEALTH_MINIMUM;
    const matureEnough = !PRE_HARVEST_STAGES.has(plant.growth.stage);

    const existing = (plant as { harvestState?: { ripe: boolean; remaining: number; quality: number } }).harvestState;

    if (inWindow && healthyEnough && matureEnough) {
      if (!existing) {
        // First time entering the harvest window — initialize harvest state
        world.addComponent(plant, 'harvestState', {
          ripe: true,
          remaining: species.harvest.yield_potential,
          quality: 1.0,
        });
      } else if (existing.ripe) {
        // Already ripe and still not harvested — degrade quality
        existing.quality = Math.max(QUALITY_FLOOR, existing.quality - QUALITY_DECAY_PER_WEEK);
      } else if (species.harvest.continuous_harvest && existing.remaining > 0) {
        // Continuous harvest plant that was harvested — mark ripe again
        existing.ripe = true;
      }
    } else if (existing) {
      // Outside the harvest window — no longer harvestable
      existing.ripe = false;
    }
  }
}
