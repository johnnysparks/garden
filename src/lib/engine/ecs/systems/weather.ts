/**
 * weather_apply system — tick order #1
 *
 * Applies the current week's weather to the garden. Pre-generated
 * WeekWeather provides base conditions (temperature, precipitation,
 * humidity); this system handles special-event side-effects that go
 * beyond normal soil chemistry (handled by soil_update in tick #2).
 *
 * Special event effects:
 *   - hail: direct health damage to living plants
 *   - heavy_rain: increases soil compaction from flooding
 */

import type { SimulationContext } from '../components.js';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function weatherApplySystem(ctx: SimulationContext): void {
  const { world, weather } = ctx;

  if (!weather.special) return;

  const event = weather.special;

  // ── Hail: direct damage to living plants ────────────────────────
  if (event.type === 'hail') {
    const plants = world.with('health', 'growth');
    for (const plant of plants) {
      if ((plant as { dead?: boolean }).dead) continue;

      // Damage scales with severity; seedlings take more damage
      const stageFactor = plant.growth.stage === 'seedling' ? 1.5
        : plant.growth.stage === 'seed' ? 0.2 // seeds are protected underground
        : plant.growth.stage === 'germination' ? 0.5
        : 1.0;

      const damage = event.damage_severity * 0.3 * stageFactor;
      plant.health.value = clamp(plant.health.value - damage, 0, 1);
    }
  }

  // ── Heavy rain: compaction from flooding ────────────────────────
  if (event.type === 'heavy_rain') {
    const plots = world.with('plotSlot', 'soil');
    for (const plot of plots) {
      // flood_risk (0-1) drives compaction increase
      const compactionIncrease = event.flood_risk * 0.1;
      plot.soil.compaction = clamp(
        plot.soil.compaction + compactionIncrease,
        0,
        1,
      );
    }
  }
}
