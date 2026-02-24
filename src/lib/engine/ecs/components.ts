/**
 * ECS component definitions for the simulation engine.
 *
 * Every game object is an entity in the miniplex World with optional
 * component bags attached.  Plant entities carry species/growth/health;
 * plot entities carry soil state.
 */

import type {
  GrowthStageId,
  InteractionEffect,
  PlantVisualParams,
  SunLevel,
  PlantSpecies,
} from '../../data/types.js';

// ── Weather (passed into systems, not an ECS component) ──────────────

export interface WeekWeather {
  week: number;
  temp_high_c: number;
  temp_low_c: number;
  precipitation_mm: number;
  humidity: number;
  wind: 'calm' | 'light' | 'moderate' | 'strong';
  frost: boolean;
  special: WeatherEvent | null;
}

export type WeatherEvent =
  | { type: 'heatwave'; duration_weeks: number; temp_bonus: number }
  | { type: 'drought'; duration_weeks: number; moisture_penalty: number }
  | { type: 'heavy_rain'; flood_risk: number }
  | { type: 'hail'; damage_severity: number }
  | { type: 'early_frost'; temp: number }
  | { type: 'indian_summer'; duration_weeks: number };

// ── Soil (attached to plot entities) ─────────────────────────────────

export interface SoilState {
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  organic_matter: number;
  moisture: number;
  temperature_c: number;
  compaction: number;
  biology: number;
}

export interface PendingAmendment {
  type: string;
  applied_week: number;
  effect_delay_weeks: number;
  effects: Partial<SoilState>;
}

// ── Plant condition / buff tracking ──────────────────────────────────

export interface ActiveCondition {
  conditionId: string;
  onset_week: number;
  current_stage: number;
  severity: number;
}

export interface CompanionBuff {
  source: string;
  effects: InteractionEffect[];
}

// ── Entity type (union of all possible components) ───────────────────

export interface Entity {
  // Spatial
  plotSlot?: { row: number; col: number };

  // Botanical (plant entities)
  species?: { speciesId: string };
  growth?: {
    progress: number;
    stage: GrowthStageId;
    rate_modifier: number;
  };
  health?: {
    value: number;
    stress: number;
  };
  harvestState?: {
    ripe: boolean;
    remaining: number;
    quality: number;
  };

  // Soil (plot entities)
  soil?: SoilState;
  amendments?: { pending: PendingAmendment[] };

  // Conditions
  activeConditions?: { conditions: ActiveCondition[] };

  // Companion buffs (rebuilt each tick)
  companionBuffs?: { buffs: CompanionBuff[] };

  // Visual
  visual?: { params: PlantVisualParams; instanceSeed: number };

  // Perennial
  perennial?: { years_established: number; dormant: boolean };

  // Sun exposure (on plot entities)
  sunExposure?: { level: SunLevel };

  // Dead marker
  dead?: boolean;
}

// ── Simulation context passed to every system ────────────────────────

import type { SeededRng } from '../rng.js';
import type { World } from 'miniplex';

export type GameWorld = World<Entity>;
export type SpeciesLookup = (id: string) => PlantSpecies | undefined;

export interface SimulationContext {
  world: GameWorld;
  weather: WeekWeather;
  currentWeek: number;
  rng: SeededRng;
  speciesLookup: SpeciesLookup;
  firstFrostWeekAvg: number;
}
