/**
 * pest_check system — tick order #7
 *
 * Pests are zone-level events, not per-plant. Each PestEvent targets
 * specific plant families and runs for a window of weeks. During that
 * window, susceptible plants take health/stress damage scaled by severity.
 *
 * Severity is reduced by:
 *   - Companion pest_resistance buffs (from the companion system at #3)
 *   - The presence of a countering species in the garden
 *
 * The system writes a pestInfestation component onto affected plants
 * so the renderer can show visual overlays.
 */

import type {
  SimulationContext,
  PestEvent,
  PestInfestationEntry,
} from '../components.js';

/** Base health damage per tick at full severity. */
const BASE_DAMAGE = 0.08;
/** Base stress added per tick at full severity. */
const BASE_STRESS = 0.1;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Sum pest_resistance modifiers from companion buffs on a plant.
 * Returns a value in [0, 1] representing total resistance.
 */
function getPestResistance(plant: { companionBuffs?: { buffs: { effects: { type: string; modifier: number }[] }[] } }): number {
  if (!plant.companionBuffs) return 0;
  let total = 0;
  for (const buff of plant.companionBuffs.buffs) {
    for (const effect of buff.effects) {
      if (effect.type === 'pest_resistance') {
        total += effect.modifier;
      }
    }
  }
  return clamp(total, 0, 1);
}

/**
 * Check if any species in the garden counters the pest.
 * Returns true if at least one living counter-species is present.
 */
function hasCounterSpecies(
  ctx: SimulationContext,
  pest: PestEvent,
): boolean {
  if (pest.countered_by.length === 0) return false;
  const plants = ctx.world.with('species');
  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;
    if (pest.countered_by.includes(plant.species.speciesId)) {
      return true;
    }
  }
  return false;
}

/** Severity reduction when a counter-species is present in the garden. */
const COUNTER_SPECIES_REDUCTION = 0.5;

export function pestCheckSystem(ctx: SimulationContext): void {
  const { world, currentWeek, speciesLookup, pestEvents } = ctx;
  if (!pestEvents || pestEvents.length === 0) return;

  // Find pest events active this week
  const activeEvents = pestEvents.filter(
    (e) => currentWeek >= e.arrival_week && currentWeek < e.arrival_week + e.duration_weeks,
  );

  const plants = world.with('species', 'health', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    const infestations: PestInfestationEntry[] = [];

    for (const pest of activeEvents) {
      // Check if this plant's family is targeted
      if (!pest.target_families.includes(species.family)) continue;

      // Start with the event's base severity
      let effectiveSeverity = pest.severity;

      // Reduce by companion pest_resistance buffs
      const resistance = getPestResistance(plant as typeof plant & { companionBuffs?: { buffs: { effects: { type: string; modifier: number }[] }[] } });
      effectiveSeverity *= (1 - resistance);

      // Reduce if a counter-species is present in the garden
      if (hasCounterSpecies(ctx, pest)) {
        effectiveSeverity *= (1 - COUNTER_SPECIES_REDUCTION);
      }

      if (effectiveSeverity <= 0) continue;

      // Apply damage: reduce health, increase stress
      plant.health.value = clamp(
        plant.health.value - BASE_DAMAGE * effectiveSeverity,
        0,
        1,
      );
      plant.health.stress = clamp(
        plant.health.stress + BASE_STRESS * effectiveSeverity,
        0,
        1,
      );

      infestations.push({
        pest_id: pest.pest_id,
        severity: effectiveSeverity,
        visual: pest.visual,
      });
    }

    // Update or add pestInfestation component
    if (infestations.length > 0) {
      const existing = (plant as typeof plant & { pestInfestation?: { infestations: PestInfestationEntry[] } }).pestInfestation;
      if (existing) {
        existing.infestations = infestations;
      } else {
        world.addComponent(plant, 'pestInfestation', { infestations });
      }
    } else {
      // Clear infestations if no active pests affect this plant
      const existing = (plant as typeof plant & { pestInfestation?: { infestations: PestInfestationEntry[] } }).pestInfestation;
      if (existing) {
        existing.infestations = [];
      }
    }
  }
}
