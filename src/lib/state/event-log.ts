/**
 * Append-only event log with replay capability.
 *
 * The event log is the single source of truth for a run. Game state is
 * derived by replaying the log through a reducer. This gives us free
 * undo (pop + replay), deterministic save/load (serialize the log),
 * and full action history for debugging.
 */

import type { GameEvent, StampedEvent } from './events.js';

// ── Run state (produced by replaying events) ────────────────────────

export interface PlantedEntry {
  species_id: string;
  plot: [number, number];
  week: number;
}

export interface AmendmentEntry {
  amendment: string;
  plot: [number, number];
  week: number;
}

export interface DiagnosisEntry {
  plant_id: string;
  hypothesis: string;
  week: number;
}

export interface InterventionEntry {
  plant_id: string;
  action: string;
  week: number;
}

export interface HarvestEntry {
  plant_id: string;
  week: number;
}

export interface ScoutEntry {
  target: string;
  week: number;
}

export interface RunState {
  seed: number;
  zone: string;
  currentWeek: number;
  started: boolean;
  ended: boolean;
  endReason: 'frost' | 'abandon' | 'catastrophe' | null;
  plants: PlantedEntry[];
  amendments: AmendmentEntry[];
  diagnoses: DiagnosisEntry[];
  interventions: InterventionEntry[];
  harvests: HarvestEntry[];
  scouts: ScoutEntry[];
}

export function createEmptyRunState(): RunState {
  return {
    seed: 0,
    zone: '',
    currentWeek: 0,
    started: false,
    ended: false,
    endReason: null,
    plants: [],
    amendments: [],
    diagnoses: [],
    interventions: [],
    harvests: [],
    scouts: [],
  };
}

// ── Reducer ─────────────────────────────────────────────────────────

export function applyEvent(state: RunState, event: GameEvent): RunState {
  switch (event.type) {
    case 'RUN_START':
      return {
        ...createEmptyRunState(),
        seed: event.seed,
        zone: event.zone,
        started: true,
      };

    case 'RUN_END':
      return { ...state, ended: true, endReason: event.reason };

    case 'ADVANCE_WEEK':
      return { ...state, currentWeek: state.currentWeek + 1 };

    case 'PLANT':
      return {
        ...state,
        plants: [
          ...state.plants,
          { species_id: event.species_id, plot: event.plot, week: event.week },
        ],
      };

    case 'AMEND':
      return {
        ...state,
        amendments: [
          ...state.amendments,
          { amendment: event.amendment, plot: event.plot, week: event.week },
        ],
      };

    case 'DIAGNOSE':
      return {
        ...state,
        diagnoses: [
          ...state.diagnoses,
          { plant_id: event.plant_id, hypothesis: event.hypothesis, week: event.week },
        ],
      };

    case 'INTERVENE':
      return {
        ...state,
        interventions: [
          ...state.interventions,
          { plant_id: event.plant_id, action: event.action, week: event.week },
        ],
      };

    case 'HARVEST':
      return {
        ...state,
        harvests: [...state.harvests, { plant_id: event.plant_id, week: event.week }],
      };

    case 'SCOUT':
      return {
        ...state,
        scouts: [...state.scouts, { target: event.target, week: event.week }],
      };
  }
}

// ── Event log ───────────────────────────────────────────────────────

export interface EventLog {
  /** All stamped events in order. */
  readonly entries: readonly StampedEvent[];

  /** Current run state derived from the log. */
  readonly state: RunState;

  /** Append a new event and return the updated state. */
  append(event: GameEvent): RunState;

  /** Replay all events from scratch and return the resulting state. */
  replay(): RunState;

  /** Clear the log completely. */
  clear(): void;

  /** Return a serializable snapshot of the raw events. */
  toJSON(): GameEvent[];

  /** Number of events in the log. */
  readonly length: number;
}

export function createEventLog(events: GameEvent[] = []): EventLog {
  const entries: StampedEvent[] = [];
  let state: RunState = createEmptyRunState();

  // Replay any initial events
  for (const event of events) {
    const stamped: StampedEvent = {
      index: entries.length,
      timestamp: Date.now(),
      event,
    };
    entries.push(stamped);
    state = applyEvent(state, event);
  }

  return {
    get entries() {
      return entries;
    },

    get state() {
      return state;
    },

    get length() {
      return entries.length;
    },

    append(event: GameEvent): RunState {
      const stamped: StampedEvent = {
        index: entries.length,
        timestamp: Date.now(),
        event,
      };
      entries.push(stamped);
      state = applyEvent(state, event);
      return state;
    },

    replay(): RunState {
      let replayed = createEmptyRunState();
      for (const entry of entries) {
        replayed = applyEvent(replayed, entry.event);
      }
      state = replayed;
      return replayed;
    },

    clear(): void {
      entries.length = 0;
      state = createEmptyRunState();
    },

    toJSON(): GameEvent[] {
      return entries.map((e) => e.event);
    },
  };
}
