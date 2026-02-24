/**
 * Svelte stores for reactive game state.
 *
 * All stores are derived from the event log. The `gameState` store is the
 * canonical run state; everything else is a projection of it. Dispatching
 * an event appends to the log and reactively updates all stores.
 */

import { writable, derived, type Readable } from 'svelte/store';
import type { GameEvent } from './events.js';
import {
  createEventLog,
  type EventLog,
  type RunState,
  type PlantedEntry,
  type HarvestEntry,
  type DiagnosisEntry,
} from './event-log.js';

// ── Core event log (module-level singleton) ─────────────────────────

let eventLog: EventLog = createEventLog();

/** Writable that holds the current RunState (updated on every dispatch). */
export const gameState = writable<RunState>(eventLog.state);

// ── Dispatch ────────────────────────────────────────────────────────

/**
 * Dispatch a game event: appends to the log and updates the store.
 */
export function dispatch(event: GameEvent): RunState {
  const next = eventLog.append(event);
  gameState.set(next);
  return next;
}

/**
 * Replay the full event log from scratch and sync the store.
 * Useful after undo or when restoring from save.
 */
export function replayAndSync(): RunState {
  const state = eventLog.replay();
  gameState.set(state);
  return state;
}

// ── Log access ──────────────────────────────────────────────────────

/** Get the current event log instance (for save/load). */
export function getEventLog(): EventLog {
  return eventLog;
}

/**
 * Replace the event log (e.g. after loading a save) and sync stores.
 */
export function setEventLog(events: GameEvent[]): RunState {
  eventLog = createEventLog(events);
  const state = eventLog.state;
  gameState.set(state);
  return state;
}

/**
 * Reset everything to a fresh state.
 */
export function resetState(): void {
  eventLog = createEventLog();
  gameState.set(eventLog.state);
}

// ── Derived stores (projections of RunState) ────────────────────────

export const currentWeek: Readable<number> = derived(gameState, ($s) => $s.currentWeek);

export const isRunActive: Readable<boolean> = derived(
  gameState,
  ($s) => $s.started && !$s.ended,
);

export const plants: Readable<PlantedEntry[]> = derived(gameState, ($s) => $s.plants);

export const harvests: Readable<HarvestEntry[]> = derived(gameState, ($s) => $s.harvests);

export const diagnoses: Readable<DiagnosisEntry[]> = derived(
  gameState,
  ($s) => $s.diagnoses,
);

export const runSeed: Readable<number> = derived(gameState, ($s) => $s.seed);

export const runZone: Readable<string> = derived(gameState, ($s) => $s.zone);

/** Unique species harvested this run. */
export const harvestedSpecies: Readable<Set<string>> = derived(gameState, ($s) => {
  const speciesIds = new Set<string>();
  for (const h of $s.harvests) {
    const plant = $s.plants.find(
      (p) =>
        // Match harvest to plant by checking if the plant_id corresponds
        // to a planted species (plant_id is species_id@row,col)
        h.plant_id === `${p.species_id}@${p.plot[0]},${p.plot[1]}`,
    );
    if (plant) {
      speciesIds.add(plant.species_id);
    }
  }
  return speciesIds;
});
