/**
 * Season weather generation.
 *
 * Pre-generates all 30 weeks of weather from a ClimateZone profile and a
 * numeric seed. Uses the seeded PRNG so runs are deterministic / replayable.
 */

import { z } from 'zod';
import { createRng, type SeededRng } from './rng.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindLevel = 'calm' | 'light' | 'moderate' | 'strong';

export type WeatherEventType =
  | 'heatwave'
  | 'drought'
  | 'heavy_rain'
  | 'hail'
  | 'early_frost'
  | 'indian_summer';

export type WeatherEvent =
  | { type: 'heatwave'; duration_weeks: number; temp_bonus: number }
  | { type: 'drought'; duration_weeks: number; moisture_penalty: number }
  | { type: 'heavy_rain'; flood_risk: number }
  | { type: 'hail'; damage_severity: number }
  | { type: 'early_frost'; temp: number }
  | { type: 'indian_summer'; duration_weeks: number };

export interface WeekWeather {
  week: number;
  temp_high_c: number;
  temp_low_c: number;
  precipitation_mm: number;
  humidity: number; // 0-1
  wind: WindLevel;
  frost: boolean; // killing frost
  special: WeatherEvent | null;
}

export type PrecipPattern = 'winter_wet' | 'summer_wet' | 'even' | 'arid';

export interface ClimateZone {
  id: string; // "zone_8a"
  name: string; // "USDA Zone 8a — Pacific Northwest"
  avg_temps_by_week: number[]; // 30-week temperature curve (highs)
  temp_variance: number; // how much temps can deviate (°C)
  precip_pattern: PrecipPattern;
  frost_free_weeks: [number, number]; // range of frost-free window
  first_frost_week_avg: number;
  humidity_baseline: number; // 0-1
  special_event_weights: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Zod schema — validates zone JSON files at load/build time
// ---------------------------------------------------------------------------

export const ClimateZoneSchema = z.object({
  id: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case identifier'),
  name: z.string().min(1),
  avg_temps_by_week: z.array(z.number()).length(30),
  temp_variance: z.number().positive(),
  precip_pattern: z.enum(['winter_wet', 'summer_wet', 'even', 'arid']),
  frost_free_weeks: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  first_frost_week_avg: z.number().int().nonnegative(),
  humidity_baseline: z.number().min(0).max(1),
  special_event_weights: z.record(z.string(), z.number().nonnegative()),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEASON_WEEKS = 30;
const WIND_LEVELS: readonly WindLevel[] = ['calm', 'light', 'moderate', 'strong'];
const WIND_WEIGHTS = [0.25, 0.4, 0.25, 0.1]; // calm-biased distribution

// ---------------------------------------------------------------------------
// Frost probability — sigmoid curve
// ---------------------------------------------------------------------------

/**
 * Compute the probability of a killing frost for a given week.
 *
 * Uses a sigmoid (logistic) function centered on `firstFrostWeekAvg`.
 * Before the frost-free window ends, probability is 0.
 *
 *   P(frost) = 1 / (1 + e^(-steepness * (week - center)))
 *
 * @param week            Current week number (0-indexed)
 * @param firstFrostAvg   Average week of first killing frost
 * @param steepness       How sharply probability ramps (default 0.5 per spec)
 */
export function frostProbability(
  week: number,
  firstFrostAvg: number,
  steepness = 0.5,
): number {
  return 1 / (1 + Math.exp(-steepness * (week - firstFrostAvg)));
}

// ---------------------------------------------------------------------------
// Precipitation helpers
// ---------------------------------------------------------------------------

/**
 * Return a weekly precipitation multiplier [0..~2] based on the zone's
 * precipitation pattern and the week number within the 30-week season.
 *
 * Week 0 = early spring, week 29 = late autumn.
 */
function precipMultiplier(pattern: PrecipPattern, week: number): number {
  const t = week / (SEASON_WEEKS - 1); // 0..1
  switch (pattern) {
    case 'winter_wet':
      // High at start and end of season, low in mid-summer
      // U-shaped curve: cos(pi*t) maps 0→1, 0.5→-1, 1→1 → shift+scale
      return 0.5 + 0.5 * Math.cos(Math.PI * (t - 0.5) * 2);
    case 'summer_wet':
      // Inverse — peak mid-season
      return 0.5 + 0.5 * Math.cos(Math.PI * t * 2 - Math.PI);
    case 'even':
      return 1.0;
    case 'arid':
      return 0.3;
  }
}

/** Base weekly precipitation (mm) before pattern multiplier. */
const BASE_PRECIP_MM = 20;

// ---------------------------------------------------------------------------
// Special event generation
// ---------------------------------------------------------------------------

interface ActiveSpecialEvent {
  event: WeatherEvent;
  remaining_weeks: number;
}

function tryGenerateSpecialEvent(
  rng: SeededRng,
  week: number,
  zone: ClimateZone,
  activeEvent: ActiveSpecialEvent | null,
): WeatherEvent | null {
  // Don't stack events — if one is active, skip
  if (activeEvent && activeEvent.remaining_weeks > 0) return null;

  const types = Object.keys(zone.special_event_weights);
  if (types.length === 0) return null;

  // Each event type gets an independent roll against its weight per week
  for (const eventType of types) {
    const weight = zone.special_event_weights[eventType];
    if (weight <= 0) continue;

    // Weight is probability-per-week (e.g. 0.04 = 4% chance each week)
    if (rng.next() >= weight) continue;

    switch (eventType) {
      case 'heatwave':
        return {
          type: 'heatwave',
          duration_weeks: rng.nextInt(1, 3),
          temp_bonus: rng.nextFloat(3, 8),
        };
      case 'drought':
        return {
          type: 'drought',
          duration_weeks: rng.nextInt(2, 4),
          moisture_penalty: rng.nextFloat(0.3, 0.7),
        };
      case 'heavy_rain':
        return {
          type: 'heavy_rain',
          flood_risk: rng.nextFloat(0.2, 0.8),
        };
      case 'hail':
        return {
          type: 'hail',
          damage_severity: rng.nextFloat(0.1, 0.6),
        };
      case 'early_frost': {
        // Only possible in the later part of the season
        if (week < zone.frost_free_weeks[0] + 10) continue;
        return {
          type: 'early_frost',
          temp: rng.nextFloat(-5, -1),
        };
      }
      case 'indian_summer': {
        // Only after mid-season
        if (week < 15) continue;
        return {
          type: 'indian_summer',
          duration_weeks: rng.nextInt(1, 3),
        };
      }
    }
  }

  return null;
}

function getEventDuration(event: WeatherEvent): number {
  switch (event.type) {
    case 'heatwave':
      return event.duration_weeks;
    case 'drought':
      return event.duration_weeks;
    case 'indian_summer':
      return event.duration_weeks;
    default:
      return 1; // single-week events
  }
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

/**
 * Generate a full season (30 weeks) of weather from a climate zone profile
 * and a numeric seed. Output is deterministic for a given (zone, seed) pair.
 */
export function generateSeasonWeather(zone: ClimateZone, seed: number): WeekWeather[] {
  const rng = createRng(seed);
  const weeks: WeekWeather[] = [];

  let activeEvent: ActiveSpecialEvent | null = null;

  for (let w = 0; w < SEASON_WEEKS; w++) {
    // --- Temperature ---
    const baseHigh = zone.avg_temps_by_week[w];
    let highDeviation = rng.nextGaussian(0, zone.temp_variance);

    // Apply active heatwave / indian_summer bonus
    if (activeEvent) {
      if (activeEvent.event.type === 'heatwave') {
        highDeviation += activeEvent.event.temp_bonus;
      }
      if (activeEvent.event.type === 'indian_summer') {
        highDeviation += 4; // moderate warmth boost
      }
    }

    const tempHigh = Math.round((baseHigh + highDeviation) * 10) / 10;
    // Diurnal range: lows are typically 8-14°C below highs
    const diurnalRange = rng.nextFloat(8, 14);
    const tempLow = Math.round((tempHigh - diurnalRange) * 10) / 10;

    // --- Precipitation ---
    const pMultiplier = precipMultiplier(zone.precip_pattern, w);
    let basePrecip = BASE_PRECIP_MM * pMultiplier;

    // Active drought suppresses precipitation
    if (activeEvent?.event.type === 'drought') {
      basePrecip *= 1 - activeEvent.event.moisture_penalty;
    }
    // Heavy rain boosts it
    if (activeEvent?.event.type === 'heavy_rain') {
      basePrecip *= 2 + activeEvent.event.flood_risk;
    }

    // Add randomness: exponential-ish distribution so most weeks are moderate
    const precipRoll = rng.next();
    const precipitation = Math.round(basePrecip * precipRoll * 2 * 10) / 10;

    // --- Humidity ---
    const humidityBase = zone.humidity_baseline;
    const humidityShift = rng.nextGaussian(0, 0.08);
    const precipHumidity = precipitation > 15 ? 0.1 : 0;
    const humidity =
      Math.round(Math.max(0, Math.min(1, humidityBase + humidityShift + precipHumidity)) * 100) /
      100;

    // --- Wind ---
    const windIdx = rng.weightedIndex([...WIND_WEIGHTS]);
    const wind = WIND_LEVELS[windIdx];

    // --- Special events ---
    const newEvent = tryGenerateSpecialEvent(rng, w, zone, activeEvent);
    if (newEvent) {
      activeEvent = {
        event: newEvent,
        remaining_weeks: getEventDuration(newEvent),
      };
    }

    const special = activeEvent ? activeEvent.event : null;

    // --- Frost ---
    const frostProb = frostProbability(w, zone.first_frost_week_avg);
    let frost = rng.next() < frostProb;

    // Early frost special event forces frost
    if (activeEvent?.event.type === 'early_frost') {
      frost = true;
    }

    // No frost during frost-free window (unless early_frost event overrides)
    if (
      w >= zone.frost_free_weeks[0] &&
      w <= zone.frost_free_weeks[1] &&
      activeEvent?.event.type !== 'early_frost'
    ) {
      frost = false;
    }

    weeks.push({
      week: w,
      temp_high_c: tempHigh,
      temp_low_c: tempLow,
      precipitation_mm: Math.max(0, precipitation),
      humidity,
      wind,
      frost,
      special,
    });

    // Decrement active event
    if (activeEvent) {
      activeEvent.remaining_weeks--;
      if (activeEvent.remaining_weeks <= 0) {
        activeEvent = null;
      }
    }
  }

  return weeks;
}
