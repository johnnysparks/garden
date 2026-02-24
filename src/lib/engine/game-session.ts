/**
 * Game session — wires the simulation engine to the turn manager's phase cycle.
 *
 * `createGameSession()` initializes all engine subsystems (ECS world, weather,
 * turn manager, event log, soil) and hooks the DUSK and ADVANCE phases so that
 * the simulation tick and frost check run automatically.
 *
 * Exposes Svelte-readable stores for UI binding: plants, soilStates,
 * currentWeather, and the latest tickResult.
 */

import { writable, derived, get, type Readable } from 'svelte/store';
import { createWorld, type GameWorld } from './ecs/world.js';
import type {
  Entity,
  SoilState,
  WeekWeather,
  SpeciesLookup,
} from './ecs/components.js';
import { createRng, type SeededRng } from './rng.js';
import { generateSeasonWeather, type ClimateZone } from './weather-gen.js';
import {
  createTurnManager,
  TurnPhase,
  type TurnManager,
} from './turn-manager.js';
import { createEventLog, type EventLog } from '../state/event-log.js';
import type { GameEvent } from '../state/events.js';
import { runTick, type TickResult } from './simulation.js';
import type { FrostResult } from './ecs/systems/frost.js';
import type { With } from 'miniplex';

// ── Public types ─────────────────────────────────────────────────────

/** Summary of what happened during the DUSK simulation tick. */
export interface DuskTickResult {
  week: number;
  /** Per-plant growth snapshots after the tick. */
  grown: Array<{
    speciesId: string;
    row: number;
    col: number;
    progress: number;
    stage: string;
  }>;
  /** Plants whose stress increased this tick. */
  stressed: Array<{
    speciesId: string;
    row: number;
    col: number;
    stress: number;
  }>;
  /** New disease onsets this tick. */
  diseaseOnsets: Array<{
    speciesId: string;
    row: number;
    col: number;
    conditionId: string;
  }>;
  /** Plants that are ripe for harvest. */
  harvestReady: Array<{
    speciesId: string;
    row: number;
    col: number;
  }>;
}

/** Result of the ADVANCE phase frost check. */
export interface AdvanceResult {
  weekAdvanced: number;
  frost: FrostResult;
  runEnded: boolean;
}

export interface GameSessionConfig {
  seed: number;
  zone: ClimateZone;
  /** Species lookup function. */
  speciesLookup: SpeciesLookup;
  /** Grid dimensions for initial plot layout (default 3×3). */
  gridRows?: number;
  gridCols?: number;
}

export interface GameSession {
  // Core subsystems
  readonly world: GameWorld;
  readonly turnManager: TurnManager;
  readonly eventLog: EventLog;
  readonly rng: SeededRng;
  readonly seasonWeather: readonly WeekWeather[];

  // Stores for UI binding
  readonly plants$: Readable<With<Entity, 'species' | 'growth' | 'health' | 'plotSlot'>[]>;
  readonly soilStates$: Readable<With<Entity, 'plotSlot' | 'soil'>[]>;
  readonly currentWeather$: Readable<WeekWeather>;
  readonly tickResult$: Readable<DuskTickResult | null>;

  /** Dispatch a game event to the event log. */
  dispatch(event: GameEvent): void;

  /**
   * Run a full week cycle: DAWN → PLAN → beginWork → endActions → (DUSK auto-simulates)
   *                         → (ADVANCE auto-checks frost) → next DAWN.
   *
   * Returns the DUSK tick result and ADVANCE frost result.
   * If frost kills the run, the session ends.
   */
  processWeek(): { tick: DuskTickResult; advance: AdvanceResult };
}

// ── Default soil factory ─────────────────────────────────────────────

function defaultSoil(): SoilState {
  return {
    ph: 6.5,
    nitrogen: 0.5,
    phosphorus: 0.5,
    potassium: 0.5,
    organic_matter: 0.4,
    moisture: 0.5,
    temperature_c: 20,
    compaction: 0.2,
    biology: 0.5,
  };
}

// ── Session factory ──────────────────────────────────────────────────

/**
 * Create a new game session.
 *
 * Initializes ECS world with plot grid, pre-generates weather, wires
 * the turn manager's DUSK and ADVANCE phases to the simulation engine.
 */
export function createGameSession(config: GameSessionConfig): GameSession {
  const {
    seed,
    zone,
    speciesLookup,
    gridRows = 3,
    gridCols = 3,
  } = config;

  // ── Core subsystems ───────────────────────────────────────────────
  const world = createWorld();
  const rng = createRng(seed);
  const seasonWeather = generateSeasonWeather(zone, seed);
  const turnManager = createTurnManager();
  const eventLog = createEventLog();

  // ── Initialize event log with RUN_START ───────────────────────────
  eventLog.append({ type: 'RUN_START', seed, zone: zone.id });

  // ── Create plot grid with starting soil ───────────────────────────
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      world.add({
        plotSlot: { row: r, col: c },
        soil: defaultSoil(),
        sunExposure: { level: 'full' },
      });
    }
  }

  // ── Simulation config ─────────────────────────────────────────────
  const simConfig = {
    world,
    rng,
    speciesLookup,
    firstFrostWeekAvg: zone.first_frost_week_avg,
  };

  // ── Reactive stores ───────────────────────────────────────────────
  const tickResultStore = writable<DuskTickResult | null>(null);
  const weatherIndex = writable<number>(0);

  const currentWeather$: Readable<WeekWeather> = derived(
    weatherIndex,
    ($idx) => seasonWeather[Math.min($idx, seasonWeather.length - 1)],
  );

  // Plant query — re-derive from a version counter so the store updates
  const worldVersion = writable(0);
  const plants$ = derived(worldVersion, () => {
    return [...world.with('species', 'growth', 'health', 'plotSlot')];
  });

  const soilStates$ = derived(worldVersion, () => {
    return [...world.with('plotSlot', 'soil')];
  });

  // ── DUSK phase handler ────────────────────────────────────────────

  function snapshotBeforeTick() {
    const plants = world.with('species', 'health', 'plotSlot');
    const stressBefore = new Map<string, number>();
    const conditionsBefore = new Map<string, Set<string>>();
    for (const p of plants) {
      const key = `${p.plotSlot.row},${p.plotSlot.col}`;
      stressBefore.set(key, p.health.stress);
      const conds = (p as Entity).activeConditions;
      if (conds) {
        conditionsBefore.set(key, new Set(conds.conditions.map((c) => c.conditionId)));
      } else {
        conditionsBefore.set(key, new Set());
      }
    }
    return { stressBefore, conditionsBefore };
  }

  function handleDusk(): DuskTickResult {
    const currentWeek = get(turnManager.week);
    const weekIdx = Math.min(currentWeek - 1, seasonWeather.length - 1);
    const weather = seasonWeather[weekIdx];
    weatherIndex.set(weekIdx);

    // Snapshot pre-tick state for diff
    const { stressBefore, conditionsBefore } = snapshotBeforeTick();

    // Run the full simulation tick (soil → companion → growth → stress → disease → frost)
    const tickResult = runTick(simConfig, weather, currentWeek);
    // Capture frost result for the ADVANCE phase
    duskFrostResult = tickResult.frost;

    // Build the DUSK result by diffing pre/post state
    const grown: DuskTickResult['grown'] = [];
    const stressed: DuskTickResult['stressed'] = [];
    const diseaseOnsets: DuskTickResult['diseaseOnsets'] = [];
    const harvestReady: DuskTickResult['harvestReady'] = [];

    const plants = world.with('species', 'growth', 'health', 'plotSlot');
    for (const p of plants) {
      if ((p as Entity).dead) continue;
      const key = `${p.plotSlot.row},${p.plotSlot.col}`;

      // Growth
      if (p.growth.progress > 0) {
        grown.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
          progress: p.growth.progress,
          stage: p.growth.stage,
        });
      }

      // Stress increase
      const prevStress = stressBefore.get(key) ?? 0;
      if (p.health.stress > prevStress) {
        stressed.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
          stress: p.health.stress,
        });
      }

      // New disease onsets
      const entity = p as Entity;
      if (entity.activeConditions) {
        const prevConds = conditionsBefore.get(key) ?? new Set();
        for (const cond of entity.activeConditions.conditions) {
          if (!prevConds.has(cond.conditionId)) {
            diseaseOnsets.push({
              speciesId: p.species.speciesId,
              row: p.plotSlot.row,
              col: p.plotSlot.col,
              conditionId: cond.conditionId,
            });
          }
        }
      }

      // Harvest readiness
      const harvest = (p as Entity).harvestState;
      if (harvest?.ripe) {
        harvestReady.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
        });
      }
    }

    const duskResult: DuskTickResult = {
      week: currentWeek,
      grown,
      stressed,
      diseaseOnsets,
      harvestReady,
    };

    tickResultStore.set(duskResult);
    worldVersion.update((v) => v + 1);

    return duskResult;
  }

  // ── ADVANCE phase handler ─────────────────────────────────────────

  let lastAdvanceResult: AdvanceResult | null = null;
  /** Frost result captured from the DUSK tick (used by ADVANCE). */
  let duskFrostResult: FrostResult = { killingFrost: false, killed: [] };

  function handleAdvance(): AdvanceResult {
    const currentWeek = get(turnManager.week);

    // Use the frost result from the DUSK tick (already ran this week)
    const frost = duskFrostResult;

    // Record ADVANCE_WEEK event
    eventLog.append({ type: 'ADVANCE_WEEK' });

    const result: AdvanceResult = {
      weekAdvanced: currentWeek,
      frost,
      runEnded: frost.killingFrost,
    };

    if (frost.killingFrost) {
      eventLog.append({ type: 'RUN_END', reason: 'frost' });
    }

    lastAdvanceResult = result;
    worldVersion.update((v) => v + 1);
    return result;
  }

  // ── Wire phase callbacks ──────────────────────────────────────────

  let lastDuskResult: DuskTickResult | null = null;

  turnManager.onPhaseChange = (_from: TurnPhase, to: TurnPhase) => {
    if (to === TurnPhase.DUSK) {
      lastDuskResult = handleDusk();
    }
    if (to === TurnPhase.ADVANCE) {
      lastAdvanceResult = handleAdvance();
    }
  };

  // ── processWeek convenience ───────────────────────────────────────

  function processWeek(): { tick: DuskTickResult; advance: AdvanceResult } {
    const currentWeek = get(turnManager.week);
    const weekIdx = Math.min(currentWeek - 1, seasonWeather.length - 1);
    const weather = seasonWeather[weekIdx];

    // DAWN → PLAN
    turnManager.advancePhase();
    // PLAN → ACT (sets energy budget)
    turnManager.beginWork(weather);
    // ACT → DUSK (triggers handleDusk via onPhaseChange)
    turnManager.endActions();
    // DUSK → ADVANCE (triggers handleAdvance via onPhaseChange)
    turnManager.advancePhase();
    // ADVANCE → next DAWN (increments week)
    turnManager.advancePhase();

    return {
      tick: lastDuskResult!,
      advance: lastAdvanceResult!,
    };
  }

  // ── Public interface ──────────────────────────────────────────────

  return {
    world,
    turnManager,
    eventLog,
    rng,
    seasonWeather,

    plants$,
    soilStates$,
    currentWeather$,
    tickResult$: { subscribe: tickResultStore.subscribe },

    dispatch(event: GameEvent) {
      eventLog.append(event);
    },

    processWeek,
  };
}
