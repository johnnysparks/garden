/**
 * Tests for the event sourcing state layer.
 *
 * Covers:
 * - Event replay produces identical state
 * - All event types are correctly reduced
 * - Event log append / replay / clear lifecycle
 * - Serialization round-trip (toJSON → createEventLog)
 */

import { describe, it, expect } from 'vitest';
import type { GameEvent } from '../../src/lib/state/events.js';
import {
  createEventLog,
  applyEvent,
  createEmptyRunState,
  type RunState,
} from '../../src/lib/state/event-log.js';

// ── Fixtures ────────────────────────────────────────────────────────

const RUN_START: GameEvent = { type: 'RUN_START', seed: 42, zone: 'zone_8a' };
const ADVANCE: GameEvent = { type: 'ADVANCE_WEEK' };
const PLANT_TOMATO: GameEvent = {
  type: 'PLANT',
  species_id: 'tomato_cherokee_purple',
  plot: [1, 2],
  week: 1,
};
const PLANT_BASIL: GameEvent = {
  type: 'PLANT',
  species_id: 'basil_genovese',
  plot: [0, 0],
  week: 2,
};
const AMEND: GameEvent = {
  type: 'AMEND',
  amendment: 'compost',
  plot: [1, 2],
  week: 1,
};
const DIAGNOSE: GameEvent = {
  type: 'DIAGNOSE',
  plant_id: 'tomato_cherokee_purple@1,2',
  hypothesis: 'early_blight',
  week: 3,
};
const INTERVENE: GameEvent = {
  type: 'INTERVENE',
  plant_id: 'tomato_cherokee_purple@1,2',
  action: 'prune',
  target_condition: 'early_blight',
  week: 3,
};
const SCOUT: GameEvent = {
  type: 'SCOUT',
  target: 'weather',
  week: 2,
};
const HARVEST: GameEvent = {
  type: 'HARVEST',
  plant_id: 'tomato_cherokee_purple@1,2',
  week: 14,
};
const RUN_END: GameEvent = { type: 'RUN_END', reason: 'frost' };

function fullRunEvents(): GameEvent[] {
  return [
    RUN_START,
    ADVANCE,
    PLANT_TOMATO,
    ADVANCE,
    PLANT_BASIL,
    SCOUT,
    AMEND,
    ADVANCE,
    DIAGNOSE,
    INTERVENE,
    ADVANCE,
    HARVEST,
    RUN_END,
  ];
}

// ── applyEvent reducer tests ────────────────────────────────────────

describe('applyEvent', () => {
  it('handles RUN_START', () => {
    const state = applyEvent(createEmptyRunState(), RUN_START);
    expect(state.seed).toBe(42);
    expect(state.zone).toBe('zone_8a');
    expect(state.started).toBe(true);
    expect(state.ended).toBe(false);
  });

  it('handles RUN_END', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, RUN_END);
    expect(state.ended).toBe(true);
    expect(state.endReason).toBe('frost');
  });

  it('handles ADVANCE_WEEK', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, ADVANCE);
    expect(state.currentWeek).toBe(1);
    state = applyEvent(state, ADVANCE);
    expect(state.currentWeek).toBe(2);
  });

  it('handles PLANT', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, PLANT_TOMATO);
    expect(state.plants).toHaveLength(1);
    expect(state.plants[0].species_id).toBe('tomato_cherokee_purple');
    expect(state.plants[0].plot).toEqual([1, 2]);
  });

  it('handles AMEND', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, AMEND);
    expect(state.amendments).toHaveLength(1);
    expect(state.amendments[0].amendment).toBe('compost');
  });

  it('handles DIAGNOSE', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, DIAGNOSE);
    expect(state.diagnoses).toHaveLength(1);
    expect(state.diagnoses[0].hypothesis).toBe('early_blight');
  });

  it('handles INTERVENE', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, INTERVENE);
    expect(state.interventions).toHaveLength(1);
    expect(state.interventions[0].action).toBe('prune');
  });

  it('handles SCOUT', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, SCOUT);
    expect(state.scouts).toHaveLength(1);
    expect(state.scouts[0].target).toBe('weather');
  });

  it('handles HARVEST', () => {
    let state = applyEvent(createEmptyRunState(), RUN_START);
    state = applyEvent(state, HARVEST);
    expect(state.harvests).toHaveLength(1);
    expect(state.harvests[0].plant_id).toBe('tomato_cherokee_purple@1,2');
  });
});

// ── EventLog tests ──────────────────────────────────────────────────

describe('createEventLog', () => {
  it('starts empty', () => {
    const log = createEventLog();
    expect(log.length).toBe(0);
    expect(log.state.started).toBe(false);
    expect(log.state.currentWeek).toBe(0);
    expect(log.entries).toHaveLength(0);
  });

  it('can be initialized with events', () => {
    const log = createEventLog([RUN_START, ADVANCE, PLANT_TOMATO]);
    expect(log.length).toBe(3);
    expect(log.state.seed).toBe(42);
    expect(log.state.currentWeek).toBe(1);
    expect(log.state.plants).toHaveLength(1);
  });

  it('appends events and updates state', () => {
    const log = createEventLog();

    log.append(RUN_START);
    expect(log.length).toBe(1);
    expect(log.state.started).toBe(true);

    log.append(ADVANCE);
    expect(log.state.currentWeek).toBe(1);

    log.append(PLANT_TOMATO);
    expect(log.state.plants).toHaveLength(1);
  });

  it('stamped entries have monotonic indices', () => {
    const log = createEventLog();
    log.append(RUN_START);
    log.append(ADVANCE);
    log.append(PLANT_TOMATO);

    expect(log.entries[0].index).toBe(0);
    expect(log.entries[1].index).toBe(1);
    expect(log.entries[2].index).toBe(2);
  });

  it('stamped entries have timestamps', () => {
    const log = createEventLog();
    const before = Date.now();
    log.append(RUN_START);
    const after = Date.now();

    expect(log.entries[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(log.entries[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('clears the log', () => {
    const log = createEventLog([RUN_START, ADVANCE]);
    log.clear();

    expect(log.length).toBe(0);
    expect(log.state.started).toBe(false);
    expect(log.state.currentWeek).toBe(0);
  });
});

// ── Replay tests ────────────────────────────────────────────────────

describe('event replay produces identical state', () => {
  it('replay matches sequential append for a full run', () => {
    const events = fullRunEvents();

    // Method 1: sequential append
    const log1 = createEventLog();
    for (const e of events) {
      log1.append(e);
    }
    const stateFromAppend = log1.state;

    // Method 2: replay from log
    const stateFromReplay = log1.replay();

    // Both should be structurally identical
    expect(stateFromReplay).toEqual(stateFromAppend);
  });

  it('replay matches initialization from events array', () => {
    const events = fullRunEvents();

    // Method 1: initialize from array
    const log1 = createEventLog(events);

    // Method 2: append one by one then replay
    const log2 = createEventLog();
    for (const e of events) {
      log2.append(e);
    }
    const replayed = log2.replay();

    expect(log1.state).toEqual(replayed);
  });

  it('replay is idempotent', () => {
    const events = fullRunEvents();
    const log = createEventLog(events);

    const replay1 = log.replay();
    const replay2 = log.replay();
    const replay3 = log.replay();

    expect(replay1).toEqual(replay2);
    expect(replay2).toEqual(replay3);
  });

  it('full run state is correct after replay', () => {
    const events = fullRunEvents();
    const log = createEventLog(events);
    const state = log.replay();

    expect(state.seed).toBe(42);
    expect(state.zone).toBe('zone_8a');
    expect(state.started).toBe(true);
    expect(state.ended).toBe(true);
    expect(state.endReason).toBe('frost');
    expect(state.currentWeek).toBe(4); // 4 ADVANCE_WEEK events
    expect(state.plants).toHaveLength(2);
    expect(state.amendments).toHaveLength(1);
    expect(state.diagnoses).toHaveLength(1);
    expect(state.interventions).toHaveLength(1);
    expect(state.scouts).toHaveLength(1);
    expect(state.harvests).toHaveLength(1);
  });
});

// ── Serialization round-trip ────────────────────────────────────────

describe('toJSON / createEventLog round-trip', () => {
  it('round-trips a full run', () => {
    const events = fullRunEvents();
    const log1 = createEventLog(events);
    const stateBeforeSerialization = log1.state;

    // Serialize
    const json = log1.toJSON();

    // Deserialize
    const log2 = createEventLog(json);

    expect(log2.state).toEqual(stateBeforeSerialization);
    expect(log2.length).toBe(log1.length);
  });

  it('round-trips via JSON.stringify/parse', () => {
    const events = fullRunEvents();
    const log1 = createEventLog(events);

    // Full JSON round-trip
    const serialized = JSON.stringify(log1.toJSON());
    const deserialized: GameEvent[] = JSON.parse(serialized);
    const log2 = createEventLog(deserialized);

    expect(log2.state).toEqual(log1.state);
  });

  it('toJSON returns raw events without stamps', () => {
    const log = createEventLog([RUN_START, ADVANCE]);
    const json = log.toJSON();

    expect(json).toEqual([RUN_START, ADVANCE]);
    // Verify no extra properties leaked
    for (const event of json) {
      expect(event).not.toHaveProperty('index');
      expect(event).not.toHaveProperty('timestamp');
    }
  });
});

// ── RUN_START resets state ───────────────────────────────────────────

describe('RUN_START resets state', () => {
  it('starting a new run clears previous state', () => {
    const log = createEventLog();

    // First run
    log.append({ type: 'RUN_START', seed: 1, zone: 'zone_8a' });
    log.append({ type: 'ADVANCE_WEEK' });
    log.append({ type: 'PLANT', species_id: 'tomato', plot: [0, 0], week: 1 });
    expect(log.state.plants).toHaveLength(1);
    expect(log.state.currentWeek).toBe(1);

    // Second run (within same log — RUN_START resets)
    log.append({ type: 'RUN_START', seed: 99, zone: 'zone_7b' });
    expect(log.state.seed).toBe(99);
    expect(log.state.zone).toBe('zone_7b');
    expect(log.state.plants).toHaveLength(0);
    expect(log.state.currentWeek).toBe(0);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  it('multiple plants on different plots', () => {
    const log = createEventLog([
      RUN_START,
      { type: 'PLANT', species_id: 'tomato', plot: [0, 0], week: 1 },
      { type: 'PLANT', species_id: 'basil', plot: [0, 1], week: 1 },
      { type: 'PLANT', species_id: 'rosemary', plot: [1, 0], week: 1 },
    ]);

    expect(log.state.plants).toHaveLength(3);
    expect(log.state.plants.map((p) => p.species_id)).toEqual([
      'tomato',
      'basil',
      'rosemary',
    ]);
  });

  it('many advance weeks', () => {
    const events: GameEvent[] = [RUN_START];
    for (let i = 0; i < 30; i++) {
      events.push({ type: 'ADVANCE_WEEK' });
    }
    const log = createEventLog(events);
    expect(log.state.currentWeek).toBe(30);
  });

  it('empty log replays to empty state', () => {
    const log = createEventLog();
    const state = log.replay();
    expect(state).toEqual(createEmptyRunState());
  });
});
