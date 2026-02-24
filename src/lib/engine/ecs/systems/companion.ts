/**
 * companion_effects system — tick order #3
 *
 * For each plant, scan 8-cell neighborhood for companions and antagonists.
 * Matching interactions are written into the plant's companionBuffs component.
 * Effects stack with diminishing returns — each duplicate effect type from
 * the same source species is halved (first=100%, second=50%, third=25%…).
 */

import type { SimulationContext, CompanionBuff } from '../components.js';
import { getAdjacentPlants } from '../world.js';
import type { InteractionEffect } from '../../../data/types.js';

export function companionEffectsSystem(ctx: SimulationContext): void {
  const { world, speciesLookup } = ctx;
  const plants = world.with('species', 'plotSlot');

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const species = speciesLookup(plant.species.speciesId);
    if (!species) continue;

    const neighbors = getAdjacentPlants(
      world,
      plant.plotSlot.row,
      plant.plotSlot.col,
    );

    const buffs: CompanionBuff[] = [];

    // Track how many times each (source_species, effect_type) pair fires
    // so we can apply diminishing returns.
    const effectCounts = new Map<string, number>();

    for (const neighbor of neighbors) {
      if ((neighbor as { dead?: boolean }).dead) continue;

      const neighborSpeciesId = neighbor.species.speciesId;

      // Check companions
      for (const entry of species.companions) {
        if (entry.species_id === neighborSpeciesId) {
          const attenuated = attenuateEffects(
            entry.effects,
            neighborSpeciesId,
            effectCounts,
          );
          if (attenuated.length > 0) {
            buffs.push({ source: neighborSpeciesId, effects: attenuated });
          }
        }
      }

      // Check antagonists
      for (const entry of species.antagonists) {
        if (entry.species_id === neighborSpeciesId) {
          const attenuated = attenuateEffects(
            entry.effects,
            neighborSpeciesId,
            effectCounts,
          );
          if (attenuated.length > 0) {
            buffs.push({ source: neighborSpeciesId, effects: attenuated });
          }
        }
      }
    }

    // Write buffs (create component if it doesn't exist)
    if ((plant as { companionBuffs?: { buffs: CompanionBuff[] } }).companionBuffs) {
      (plant as { companionBuffs: { buffs: CompanionBuff[] } }).companionBuffs.buffs = buffs;
    } else {
      world.addComponent(plant, 'companionBuffs', { buffs });
    }
  }
}

/**
 * Apply diminishing returns: for each (source_species, effect_type) pair
 * the multiplier is 0.5^(count) where count is the number of times
 * this combination has already been applied this tick.
 */
function attenuateEffects(
  effects: InteractionEffect[],
  sourceSpecies: string,
  counts: Map<string, number>,
): InteractionEffect[] {
  return effects.map((e) => {
    const key = `${sourceSpecies}:${e.type}`;
    const prev = counts.get(key) ?? 0;
    counts.set(key, prev + 1);
    const multiplier = Math.pow(0.5, prev);
    return { ...e, modifier: e.modifier * multiplier };
  });
}
