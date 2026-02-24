/**
 * CLI game session — wraps the engine without Svelte-specific UI bindings.
 *
 * Creates and manages all engine subsystems (ECS world, weather, turn manager,
 * event log) and provides synchronous accessors suitable for CLI output.
 */

import { get } from 'svelte/store';
import { createWorld, getPlotAt, type GameWorld } from '../lib/engine/ecs/world.js';
import type {
  Entity,
  SoilState,
  WeekWeather,
  SpeciesLookup,
} from '../lib/engine/ecs/components.js';
import { createRng, type SeededRng } from '../lib/engine/rng.js';
import { generateSeasonWeather, type ClimateZone } from '../lib/engine/weather-gen.js';
import {
  createTurnManager,
  TurnPhase,
  type TurnManager,
} from '../lib/engine/turn-manager.js';
import { createEventLog, type EventLog } from '../lib/state/event-log.js';
import type { GameEvent } from '../lib/state/events.js';
import { runTick } from '../lib/engine/simulation.js';
import type { FrostResult } from '../lib/engine/ecs/systems/frost.js';
import type { With } from 'miniplex';

// ── Public types ─────────────────────────────────────────────────────

/** Summary of what happened during the DUSK simulation tick. */
export interface DuskTickResult {
  week: number;
  grown: Array<{
    speciesId: string;
    row: number;
    col: number;
    prevProgress: number;
    progress: number;
    stage: string;
  }>;
  stressed: Array<{
    speciesId: string;
    row: number;
    col: number;
    prevStress: number;
    stress: number;
  }>;
  diseaseOnsets: Array<{
    speciesId: string;
    row: number;
    col: number;
    conditionId: string;
  }>;
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

export interface CliSessionConfig {
  seed: number;
  zone: ClimateZone;
  speciesLookup: SpeciesLookup;
  gridRows?: number;
  gridCols?: number;
}

// ── Plant info for queries ───────────────────────────────────────────

export interface PlantInfo {
  speciesId: string;
  row: number;
  col: number;
  stage: string;
  progress: number;
  health: number;
  stress: number;
  dead: boolean;
  conditions: Array<{ conditionId: string; severity: number; stage: number }>;
  companionBuffs: Array<{ source: string }>;
  harvestReady: boolean;
}

// ── CLI Session ──────────────────────────────────────────────────────

export interface CliSession {
  readonly world: GameWorld;
  readonly turnManager: TurnManager;
  readonly eventLog: EventLog;
  readonly rng: SeededRng;
  readonly seasonWeather: readonly WeekWeather[];
  readonly speciesLookup: SpeciesLookup;
  readonly config: CliSessionConfig;

  /** Current turn phase. */
  getPhase(): TurnPhase;
  /** Current week number. */
  getWeek(): number;
  /** Current energy state. */
  getEnergy(): { current: number; max: number };
  /** Whether the player can act (ACT phase with energy > 0). */
  canAct(): boolean;
  /** Current week's weather. */
  getCurrentWeather(): WeekWeather;

  /** Dispatch a game event to the event log. */
  dispatch(event: GameEvent): void;

  /** Advance to the next phase. Returns phase-specific results. */
  advancePhase(): { phase: TurnPhase; dusk?: DuskTickResult; advance?: AdvanceResult };

  /** Spend energy on an action. Returns false if insufficient. */
  spendEnergy(cost: number): boolean;

  /** Skip remaining actions and end ACT phase. Returns DUSK tick result. */
  endActions(): DuskTickResult | undefined;

  /** Get all living plants. */
  getPlants(): PlantInfo[];

  /** Get soil state at a position. */
  getSoil(row: number, col: number): SoilState | undefined;

  /** Get a plant at a position. */
  getPlantAt(row: number, col: number): PlantInfo | undefined;

  /** Check if a plot is occupied by a plant. */
  isOccupied(row: number, col: number): boolean;

  /** Check if coordinates are within the grid. */
  inBounds(row: number, col: number): boolean;

  /** Serialize the event log to JSON. */
  toJSON(): GameEvent[];

  /** Whether the run has ended. */
  isRunEnded(): boolean;

  /** Grid dimensions. */
  readonly gridRows: number;
  readonly gridCols: number;
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

export function createCliSession(config: CliSessionConfig): CliSession {
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

  // ── State tracking ────────────────────────────────────────────────
  let lastDuskResult: DuskTickResult | null = null;
  let lastAdvanceResult: AdvanceResult | null = null;
  let duskFrostResult: FrostResult = { killingFrost: false, killed: [] };
  let runEnded = false;

  // ── DUSK handler ──────────────────────────────────────────────────

  function snapshotBeforeTick() {
    const plants = world.with('species', 'health', 'plotSlot');
    const stressBefore = new Map<string, number>();
    const progressBefore = new Map<string, number>();
    const conditionsBefore = new Map<string, Set<string>>();
    for (const p of plants) {
      const key = `${p.plotSlot.row},${p.plotSlot.col}`;
      stressBefore.set(key, p.health.stress);
      const growth = (p as Entity).growth;
      if (growth) {
        progressBefore.set(key, growth.progress);
      }
      const conds = (p as Entity).activeConditions;
      if (conds) {
        conditionsBefore.set(key, new Set(conds.conditions.map((c) => c.conditionId)));
      } else {
        conditionsBefore.set(key, new Set());
      }
    }
    return { stressBefore, progressBefore, conditionsBefore };
  }

  function handleDusk(): DuskTickResult {
    const currentWeek = get(turnManager.week);
    const weekIdx = Math.min(currentWeek - 1, seasonWeather.length - 1);
    const weather = seasonWeather[weekIdx];

    const { stressBefore, progressBefore, conditionsBefore } = snapshotBeforeTick();

    const tickResult = runTick(simConfig, weather, currentWeek);
    duskFrostResult = tickResult.frost;

    const grown: DuskTickResult['grown'] = [];
    const stressed: DuskTickResult['stressed'] = [];
    const diseaseOnsets: DuskTickResult['diseaseOnsets'] = [];
    const harvestReady: DuskTickResult['harvestReady'] = [];

    const plants = world.with('species', 'growth', 'health', 'plotSlot');
    for (const p of plants) {
      if ((p as Entity).dead) continue;
      const key = `${p.plotSlot.row},${p.plotSlot.col}`;

      if (p.growth.progress > 0) {
        grown.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
          prevProgress: progressBefore.get(key) ?? 0,
          progress: p.growth.progress,
          stage: p.growth.stage,
        });
      }

      const prevStress = stressBefore.get(key) ?? 0;
      if (p.health.stress > prevStress) {
        stressed.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
          prevStress,
          stress: p.health.stress,
        });
      }

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

      const harvest = entity.harvestState;
      if (harvest?.ripe) {
        harvestReady.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
        });
      }
    }

    const result: DuskTickResult = { week: currentWeek, grown, stressed, diseaseOnsets, harvestReady };
    lastDuskResult = result;
    return result;
  }

  // ── ADVANCE handler ───────────────────────────────────────────────

  function handleAdvance(): AdvanceResult {
    const currentWeek = get(turnManager.week);
    const frost = duskFrostResult;

    eventLog.append({ type: 'ADVANCE_WEEK' });

    const result: AdvanceResult = {
      weekAdvanced: currentWeek,
      frost,
      runEnded: frost.killingFrost,
    };

    if (frost.killingFrost) {
      eventLog.append({ type: 'RUN_END', reason: 'frost' });
      runEnded = true;
    }

    lastAdvanceResult = result;
    return result;
  }

  // ── Wire phase callbacks ──────────────────────────────────────────

  turnManager.onPhaseChange = (_from: TurnPhase, to: TurnPhase) => {
    if (to === TurnPhase.DUSK) {
      lastDuskResult = handleDusk();
    }
    if (to === TurnPhase.ADVANCE) {
      lastAdvanceResult = handleAdvance();
    }
  };

  // ── Plant entity → PlantInfo ──────────────────────────────────────

  function toPlantInfo(
    p: With<Entity, 'species' | 'growth' | 'health' | 'plotSlot'>,
  ): PlantInfo {
    const entity = p as Entity;
    return {
      speciesId: p.species.speciesId,
      row: p.plotSlot.row,
      col: p.plotSlot.col,
      stage: p.growth.stage,
      progress: p.growth.progress,
      health: p.health.value,
      stress: p.health.stress,
      dead: !!entity.dead,
      conditions: entity.activeConditions?.conditions.map((c) => ({
        conditionId: c.conditionId,
        severity: c.severity,
        stage: c.current_stage,
      })) ?? [],
      companionBuffs: entity.companionBuffs?.buffs.map((b) => ({
        source: b.source,
      })) ?? [],
      harvestReady: !!entity.harvestState?.ripe,
    };
  }

  // ── Public interface ──────────────────────────────────────────────

  return {
    world,
    turnManager,
    eventLog,
    rng,
    seasonWeather,
    speciesLookup,
    config,
    gridRows,
    gridCols,

    getPhase() {
      return get(turnManager.phase);
    },

    getWeek() {
      return get(turnManager.week);
    },

    getEnergy() {
      return get(turnManager.energy);
    },

    canAct() {
      return get(turnManager.canAct);
    },

    getCurrentWeather() {
      const week = get(turnManager.week);
      const idx = Math.min(week - 1, seasonWeather.length - 1);
      return seasonWeather[idx];
    },

    dispatch(event: GameEvent) {
      eventLog.append(event);
    },

    advancePhase() {
      const phaseBefore = get(turnManager.phase);

      if (phaseBefore === TurnPhase.PLAN) {
        // PLAN → ACT: set energy budget
        const week = get(turnManager.week);
        const idx = Math.min(week - 1, seasonWeather.length - 1);
        const weather = seasonWeather[idx];
        turnManager.beginWork(weather);
        return { phase: get(turnManager.phase) };
      }

      turnManager.advancePhase();
      const newPhase = get(turnManager.phase);

      return {
        phase: newPhase,
        dusk: phaseBefore === TurnPhase.ACT ? lastDuskResult ?? undefined : undefined,
        advance: phaseBefore === TurnPhase.DUSK ? lastAdvanceResult ?? undefined : undefined,
      };
    },

    spendEnergy(cost: number) {
      return turnManager.spendEnergy(cost);
    },

    endActions() {
      turnManager.endActions();
      // endActions triggers DUSK phase callback which sets lastDuskResult
      return lastDuskResult ?? undefined;
    },

    getPlants() {
      const plants = world.with('species', 'growth', 'health', 'plotSlot');
      return [...plants]
        .filter((p) => !(p as Entity).dead)
        .map(toPlantInfo);
    },

    getSoil(row: number, col: number) {
      return getPlotAt(world, row, col)?.soil;
    },

    getPlantAt(row: number, col: number) {
      const plants = world.with('species', 'growth', 'health', 'plotSlot');
      for (const p of plants) {
        if (p.plotSlot.row === row && p.plotSlot.col === col && !(p as Entity).dead) {
          return toPlantInfo(p);
        }
      }
      return undefined;
    },

    isOccupied(row: number, col: number) {
      const plants = world.with('species', 'plotSlot');
      for (const p of plants) {
        if (p.plotSlot.row === row && p.plotSlot.col === col && !(p as Entity).dead) {
          return true;
        }
      }
      return false;
    },

    inBounds(row: number, col: number) {
      return row >= 0 && row < gridRows && col >= 0 && col < gridCols;
    },

    toJSON() {
      return eventLog.toJSON();
    },

    isRunEnded() {
      return runEnded;
    },
  };
}
