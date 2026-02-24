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

// ── Pest events (zone-level, pre-generated at season start) ─────────

export interface PestEvent {
  pest_id: string;
  target_families: string[];
  arrival_week: number;
  severity: number;
  duration_weeks: number;
  countered_by: string[];
  visual: string;
}

export interface PestInfestationEntry {
  pest_id: string;
  severity: number;
  visual: string;
}

// ── Plant condition / buff tracking ──────────────────────────────────

export interface ActiveCondition {
  conditionId: string;
  onset_week: number;
  current_stage: number;
  severity: number;
}

// ── Treatment tracking ──────────────────────────────────────────────

/** A treatment applied via the INTERVENE action, pending feedback. */
export interface ActiveTreatment {
  /** The treatment action applied (e.g., 'prune', 'spray_fungicide'). */
  action: string;
  /** The condition the player believes they are treating. */
  targetCondition: string;
  /** Week the treatment was applied. */
  applied_week: number;
  /** Week when the outcome becomes visible (applied + 1–2). */
  feedback_week: number;
}

/** Result of evaluating a treatment, produced by the feedback system. */
export interface TreatmentOutcome {
  action: string;
  targetCondition: string;
  /** Whether the diagnosed condition was actually present. */
  diagnosisCorrect: boolean;
  /** Whether the treatment action was appropriate for the condition. */
  treatmentEffective: boolean;
  /** Overall result category. */
  result: 'resolved' | 'stabilized' | 'ineffective' | 'worsened';
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

  // Pending treatments awaiting feedback
  activeTreatments?: { treatments: ActiveTreatment[] };

  // Companion buffs (rebuilt each tick)
  companionBuffs?: { buffs: CompanionBuff[] };

  // Active pest infestations
  pestInfestation?: { infestations: PestInfestationEntry[] };

  // Visual
  visual?: { params: PlantVisualParams; instanceSeed: number };

  // Perennial
  perennial?: { years_established: number; dormant: boolean };

  // Sun exposure (on plot entities)
  sunExposure?: { level: SunLevel };

  // Weed marker — spawned by spread system, competes for resources
  weed?: { severity: number };

  // Self-seeded marker — flagged by spread system for meta-progression
  selfSeeded?: boolean;

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
  /** All pest events for the season. The pest system filters by currentWeek. */
  pestEvents?: PestEvent[];
}
