/**
 * GameEvent union type for event sourcing.
 *
 * All state changes originate from events. The current state is derived
 * by replaying the full event log from the beginning.
 *
 * Every event carries a `week` (except RUN_START which establishes it
 * and ADVANCE_WEEK which increments it).
 */

// ── Player action events ────────────────────────────────────────────

export interface PlantEvent {
  type: 'PLANT';
  species_id: string;
  plot: [number, number];
  week: number;
}

export interface AmendEvent {
  type: 'AMEND';
  amendment: string;
  plot: [number, number];
  week: number;
}

export interface DiagnoseEvent {
  type: 'DIAGNOSE';
  plant_id: string;
  hypothesis: string;
  week: number;
}

export interface InterveneEvent {
  type: 'INTERVENE';
  plant_id: string;
  action: string;
  /** Condition the player believes they are treating. */
  target_condition: string;
  week: number;
}

export interface ScoutEvent {
  type: 'SCOUT';
  target: string;
  week: number;
}

export interface HarvestEvent {
  type: 'HARVEST';
  plant_id: string;
  week: number;
}

// ── Lifecycle events ────────────────────────────────────────────────

export interface AdvanceWeekEvent {
  type: 'ADVANCE_WEEK';
}

export interface RunStartEvent {
  type: 'RUN_START';
  seed: number;
  zone: string;
}

export interface RunEndEvent {
  type: 'RUN_END';
  reason: 'frost' | 'abandon' | 'catastrophe';
}

// ── Union type ──────────────────────────────────────────────────────

export type GameEvent =
  | PlantEvent
  | AmendEvent
  | DiagnoseEvent
  | InterveneEvent
  | ScoutEvent
  | HarvestEvent
  | AdvanceWeekEvent
  | RunStartEvent
  | RunEndEvent;

// ── Stamped event (with monotonic index for ordering) ───────────────

export interface StampedEvent {
  index: number;
  timestamp: number;
  event: GameEvent;
}
