/**
 * soil_update system — tick order #2
 *
 * Each plot has independent soil state. Each tick:
 * - Pending amendments that have reached their delay → apply effects
 * - Moisture adjusts based on precipitation, evaporation (temp-driven), mulch
 * - Nutrients deplete based on plant uptake
 * - Biology recovers slowly if organic matter adequate
 * - Organic matter decays slowly
 */

import type { SimulationContext } from '../components.js';
import { getPlotAt } from '../world.js';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function soilUpdateSystem(ctx: SimulationContext): void {
  const { world, weather, currentWeek } = ctx;
  const plots = world.with('plotSlot', 'soil');

  for (const plot of plots) {
    const soil = plot.soil;

    // ── Apply mature amendments ──────────────────────────────────
    const amendments = (plot as { amendments?: { pending: { applied_week: number; effect_delay_weeks: number; effects: Partial<typeof soil> }[] } }).amendments;
    if (amendments) {
      const remaining = [];
      for (const a of amendments.pending) {
        if (currentWeek >= a.applied_week + a.effect_delay_weeks) {
          // Apply deltas
          for (const [key, delta] of Object.entries(a.effects)) {
            const k = key as keyof typeof soil;
            if (typeof soil[k] === 'number' && typeof delta === 'number') {
              (soil as unknown as Record<string, number>)[k] = clamp(
                (soil[k] as number) + delta,
                0,
                k === 'ph' ? 14 : 1,
              );
            }
          }
        } else {
          remaining.push(a);
        }
      }
      amendments.pending = remaining;
    }

    // ── Moisture: precipitation adds, evaporation removes ────────
    const precipContrib = weather.precipitation_mm / 100; // rough normalization
    const avgTemp = (weather.temp_high_c + weather.temp_low_c) / 2;
    const evaporation = 0.02 + avgTemp * 0.001; // higher temp = more evap
    soil.moisture = clamp(soil.moisture + precipContrib - evaporation, 0, 1);

    // Drought event penalty
    if (weather.special?.type === 'drought') {
      soil.moisture = clamp(soil.moisture - weather.special.moisture_penalty, 0, 1);
    }

    // ── Soil temperature tracks air temp, modulated by mulch ─────
    // Organic matter acts as insulation — soil temp lags air temp
    const insulationFactor = 0.3 + soil.organic_matter * 0.4; // 0.3–0.7
    soil.temperature_c =
      soil.temperature_c * insulationFactor +
      avgTemp * (1 - insulationFactor);

    // ── Nutrient depletion from plants on this plot ──────────────
    const plantsHere = world.with('species', 'growth', 'plotSlot');
    for (const plant of plantsHere) {
      if (
        plant.plotSlot.row === plot.plotSlot.row &&
        plant.plotSlot.col === plot.plotSlot.col
      ) {
        // Bigger plants consume more; progress is a proxy for size
        const uptakeFactor = 0.01 + plant.growth.progress * 0.02;
        soil.nitrogen = clamp(soil.nitrogen - uptakeFactor, 0, 1);
        soil.phosphorus = clamp(soil.phosphorus - uptakeFactor * 0.7, 0, 1);
        soil.potassium = clamp(soil.potassium - uptakeFactor * 0.7, 0, 1);
      }
    }

    // ── Biology: recovers if organic matter > 0.3, else decays ───
    if (soil.organic_matter > 0.3) {
      soil.biology = clamp(soil.biology + 0.01, 0, 1);
    } else {
      soil.biology = clamp(soil.biology - 0.005, 0, 1);
    }

    // ── Organic matter decays slowly ─────────────────────────────
    soil.organic_matter = clamp(soil.organic_matter - 0.005, 0, 1);
  }
}
