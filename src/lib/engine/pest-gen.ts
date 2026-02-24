/**
 * Season pest event pre-generation.
 *
 * Pre-generates all pest events for a 30-week season from a ClimateZone
 * profile and a numeric seed. Uses seeded PRNG so runs are deterministic
 * and replayable. Analogous to weather-gen.ts.
 *
 * Pest events are zone-level occurrences that affect susceptible plant
 * families for a window of weeks. Each event has an arrival week, severity,
 * duration, and a set of species that counter it.
 *
 * The pestCheckSystem (tick slot #7) filters the pre-generated list by
 * currentWeek and applies damage to susceptible plants.
 */

import { createRng } from './rng.js';
import type { ClimateZone } from './weather-gen.js';
import type { PestEvent } from './ecs/components.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Template for a pest type in the built-in catalog.
 *
 * Defines the fixed characteristics of a pest — which families it targets,
 * the window of the season when it can arrive, its severity and duration
 * ranges, and what counters it. Zone JSON files reference pest IDs via
 * `pest_event_weights` to control per-zone arrival probability.
 */
export interface PestDefinition {
  pest_id: string;
  /** Plant families susceptible to this pest (matches PlantSpecies.family). */
  target_families: string[];
  /** Earliest week (0-indexed) in the season this pest can first arrive. */
  earliest_week: number;
  /** Severity drawn uniformly from [min, max]. */
  severity_range: [number, number];
  /** Duration in weeks drawn uniformly from [min, max] (inclusive). */
  duration_range: [number, number];
  /**
   * Weeks that must elapse after one infestation ends before the same pest
   * can arrive again. Prevents back-to-back infestations.
   */
  min_gap_weeks: number;
  /** Species IDs whose presence in the garden reduces this pest's severity. */
  countered_by: string[];
  /** Visual overlay identifier passed to the renderer via PestInfestationEntry. */
  visual: string;
}

// ---------------------------------------------------------------------------
// Pest catalog — built-in templates for common garden pests
// ---------------------------------------------------------------------------

/**
 * Built-in pest catalog.
 *
 * Zones reference pest IDs in `pest_event_weights`; this catalog supplies
 * the corresponding templates. Only pests listed here can appear in-game;
 * unknown IDs in zone JSON are silently ignored.
 */
export const PEST_CATALOG: readonly PestDefinition[] = [
  {
    pest_id: 'aphids',
    target_families: ['Solanaceae', 'Brassicaceae', 'Lamiaceae'],
    earliest_week: 5,
    severity_range: [0.2, 0.7],
    duration_range: [2, 5],
    min_gap_weeks: 3,
    countered_by: ['marigold'],
    visual: 'small_insects_on_leaves',
  },
  {
    pest_id: 'whitefly',
    target_families: ['Solanaceae', 'Cucurbitaceae'],
    earliest_week: 8,
    severity_range: [0.2, 0.6],
    duration_range: [2, 4],
    min_gap_weeks: 3,
    countered_by: ['basil_genovese'],
    visual: 'tiny_white_insects',
  },
  {
    pest_id: 'thrips',
    target_families: ['Solanaceae', 'Liliaceae', 'Rosaceae'],
    earliest_week: 6,
    severity_range: [0.15, 0.5],
    duration_range: [2, 4],
    min_gap_weeks: 3,
    countered_by: [],
    visual: 'stippled_leaves',
  },
  {
    pest_id: 'tomato_hornworm',
    target_families: ['Solanaceae'],
    earliest_week: 10,
    severity_range: [0.3, 0.8],
    duration_range: [2, 3],
    min_gap_weeks: 4,
    countered_by: ['dill'],
    visual: 'large_caterpillar',
  },
  {
    pest_id: 'cabbage_moth',
    target_families: ['Brassicaceae'],
    earliest_week: 4,
    severity_range: [0.2, 0.65],
    duration_range: [2, 5],
    min_gap_weeks: 3,
    countered_by: ['dill', 'rosemary'],
    visual: 'leaf_holes_caterpillar',
  },
  {
    pest_id: 'spider_mite',
    target_families: ['Solanaceae', 'Cucurbitaceae', 'Rosaceae'],
    earliest_week: 12,
    severity_range: [0.2, 0.7],
    duration_range: [2, 4],
    min_gap_weeks: 3,
    countered_by: ['basil_genovese'],
    visual: 'stippled_leaves_webbing',
  },
];

/** Indexed lookup map: pest_id → PestDefinition. */
const CATALOG_MAP = new Map<string, PestDefinition>(
  PEST_CATALOG.map((p) => [p.pest_id, p]),
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEASON_WEEKS = 30;

/**
 * XOR mask applied to the game seed before constructing the pest RNG.
 *
 * Ensures pest and weather generation use independent PRNG streams even
 * when both are seeded from the same game seed. The mask is a fractional
 * approximation of the golden ratio (Knuth's multiplicative hash constant).
 */
const PEST_SEED_MASK = 0x9e3779b9;

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

/**
 * Generate all pest events for a season from a climate zone profile and a
 * numeric game seed. Output is deterministic for a given (zone, seed) pair.
 *
 * Uses `zone.pest_event_weights` — a map of `pest_id → probability-per-week`
 * (analogous to `zone.special_event_weights` for weather). If a zone does not
 * define a weight for a pest, that pest cannot appear that season.
 *
 * The returned events are sorted by `arrival_week`. The `pestCheckSystem`
 * filters them each tick using `currentWeek >= arrival_week &&
 * currentWeek < arrival_week + duration_weeks`.
 */
export function generateSeasonPests(zone: ClimateZone, seed: number): PestEvent[] {
  const pestWeights = zone.pest_event_weights ?? {};
  const pestIds = Object.keys(pestWeights);
  if (pestIds.length === 0) return [];

  // Derive an independent seed so pest and weather streams don't correlate
  const pestSeed = (seed ^ PEST_SEED_MASK) >>> 0;
  const rng = createRng(pestSeed);

  const events: PestEvent[] = [];

  for (const pestId of pestIds) {
    const weight = pestWeights[pestId];
    if (weight <= 0) continue;

    const definition = CATALOG_MAP.get(pestId);
    if (!definition) continue; // unknown pest ID in zone JSON — skip

    // nextEarliestWeek tracks when this pest type can next arrive
    let nextEarliestWeek = definition.earliest_week;

    for (let w = 0; w < SEASON_WEEKS; w++) {
      if (w < nextEarliestWeek) continue;

      // Roll against per-week arrival probability
      if (rng.next() >= weight) continue;

      // Pest arrives this week — roll severity and duration
      const [sevMin, sevMax] = definition.severity_range;
      const [durMin, durMax] = definition.duration_range;
      const severity = Math.round(rng.nextFloat(sevMin, sevMax) * 100) / 100;
      const duration_weeks = rng.nextInt(durMin, durMax);

      events.push({
        pest_id: definition.pest_id,
        target_families: definition.target_families,
        arrival_week: w,
        severity,
        duration_weeks,
        countered_by: definition.countered_by,
        visual: definition.visual,
      });

      // Enforce minimum gap: this pest cannot arrive again until the
      // current infestation ends plus the required cooldown period
      nextEarliestWeek = w + duration_weeks + definition.min_gap_weeks;
    }
  }

  // Sort by arrival_week for deterministic, chronological ordering
  events.sort((a, b) => a.arrival_week - b.arrival_week);

  return events;
}
