/**
 * Game session — wires the simulation engine to the turn manager's phase cycle.
 *
 * `createGameSession()` initializes all engine subsystems (ECS world, weather,
 * turn manager, event log, soil) and hooks the DUSK and ADVANCE phases so that
 * the simulation tick and frost check run automatically.
 *
 * Provides both Svelte-readable stores for reactive UI binding and synchronous
 * accessors for non-reactive consumers (CLI, tests, headless agents).
 */

import { writable, derived, get, type Readable } from 'svelte/store';
import { createWorld, getPlotAt, type GameWorld } from './ecs/world.js';
import type {
  Entity,
  SoilState,
  WeekWeather,
  SpeciesLookup,
  PestEvent,
} from './ecs/components.js';
import { createRng, type SeededRng } from './rng.js';
import { generateSeasonWeather, type ClimateZone } from './weather-gen.js';
import { generateSeasonPests } from './pest-gen.js';
import {
  createTurnManager,
  calculateEnergyBudget,
  TurnPhase,
  type TurnManager,
  type EnergyState,
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
    prevProgress: number;
    progress: number;
    stage: string;
  }>;
  /** Plants whose stress increased this tick. */
  stressed: Array<{
    speciesId: string;
    row: number;
    col: number;
    prevStress: number;
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
  /** Active companion/antagonist effects applied this tick. */
  companionEffects: Array<{
    speciesId: string;
    row: number;
    col: number;
    buffs: Array<{
      source: string;
      effects: Array<{ type: string; modifier: number }>;
    }>;
  }>;
}

/** Result of the ADVANCE phase frost check. */
export interface AdvanceResult {
  weekAdvanced: number;
  frost: FrostResult;
  runEnded: boolean;
}

/** Snapshot of a plant entity for query results. */
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
  companionBuffs: Array<{ source: string; effects: Array<{ type: string; modifier: number }> }>;
  harvestReady: boolean;
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
  // ── Core subsystems ────────────────────────────────────────────────
  readonly world: GameWorld;
  readonly turnManager: TurnManager;
  readonly eventLog: EventLog;
  readonly rng: SeededRng;
  readonly seasonWeather: readonly WeekWeather[];
  /** Pre-generated pest events for the season, sorted by arrival_week. */
  readonly seasonPests: readonly PestEvent[];
  readonly speciesLookup: SpeciesLookup;
  readonly config: GameSessionConfig;
  readonly gridRows: number;
  readonly gridCols: number;

  // ── Reactive stores (for UI binding) ───────────────────────────────
  readonly plants$: Readable<With<Entity, 'species' | 'growth' | 'health' | 'plotSlot'>[]>;
  readonly soilStates$: Readable<With<Entity, 'plotSlot' | 'soil'>[]>;
  readonly currentWeather$: Readable<WeekWeather>;
  readonly tickResult$: Readable<DuskTickResult | null>;
  readonly advanceResult$: Readable<AdvanceResult | null>;

  // ── Synchronous accessors ──────────────────────────────────────────

  /** Current turn phase. */
  getPhase(): TurnPhase;
  /** Current week number. */
  getWeek(): number;
  /** Current energy state. */
  getEnergy(): EnergyState;
  /** Whether the player can act (ACT phase with energy > 0). */
  canAct(): boolean;
  /** Current week's weather. */
  getCurrentWeather(): WeekWeather;
  /** Whether the run has ended. */
  isRunEnded(): boolean;

  // ── Actions ────────────────────────────────────────────────────────

  /** Dispatch a game event to the event log. */
  dispatch(event: GameEvent): void;

  /**
   * Advance to the next phase. Returns phase-specific results.
   * Handles PLAN→ACT energy budget setup automatically.
   */
  advancePhase(): { phase: TurnPhase; dusk?: DuskTickResult; advance?: AdvanceResult };

  /** Spend energy on an action. Returns false if insufficient. */
  spendEnergy(cost: number): boolean;

  /** Skip remaining actions and end ACT phase. Returns DUSK tick result. */
  endActions(): DuskTickResult | undefined;

  /**
   * Add a plant entity to the ECS world. Handles creating all required
   * components (species, growth, health, activeConditions, companionBuffs,
   * harvestState). Optionally accepts visual params for rendering.
   */
  addPlant(
    speciesId: string,
    row: number,
    col: number,
    opts?: { instanceSeed?: number },
  ): Entity;

  /**
   * Run a full week cycle: DAWN → PLAN → beginWork → endActions → (DUSK)
   *                         → (ADVANCE) → next DAWN.
   */
  processWeek(): { tick: DuskTickResult; advance: AdvanceResult };

  // ── Queries ────────────────────────────────────────────────────────

  /** Get all living plants as PlantInfo snapshots. */
  getPlants(): PlantInfo[];
  /** Get soil state at a position. */
  getSoil(row: number, col: number): SoilState | undefined;
  /** Get a plant at a position. */
  getPlantAt(row: number, col: number): PlantInfo | undefined;
  /** Check if a plot is occupied by a living plant. */
  isOccupied(row: number, col: number): boolean;
  /** Check if coordinates are within the grid. */
  inBounds(row: number, col: number): boolean;

  // ── Serialization ──────────────────────────────────────────────────

  /** Serialize the event log to JSON. */
  toJSON(): GameEvent[];

  /**
   * Consume the last dusk tick result (if any). Used to display results
   * from auto-transitions when energy runs out during an action.
   */
  consumeLastDuskResult(): DuskTickResult | undefined;

  /**
   * Bump the reactive store version counter. Call after directly mutating
   * the ECS world (e.g. adding entities) so that derived stores update.
   */
  notifyWorldChanged(): void;
}

// ── Default soil factory ─────────────────────────────────────────────

export function defaultSoil(): SoilState {
  return {
    ph: 6.5,
    nitrogen: 0.5,
    phosphorus: 0.5,
    potassium: 0.5,
    organic_matter: 0.4,
    moisture: 0.5,
    // TODO: BUG — Initial soil temp of 20°C is unrealistic for early spring.
    // In zone_8a week 1, air temp is ~8°C high / -5°C low, but soil starts at 20°C.
    // The soil system then rapidly cools it to ~7°C, causing warm-season crops
    // (tomato, basil) to stall for many weeks. Should initialize based on zone's
    // early-season air temperature, e.g. avgTemp of week 1 weather.
    temperature_c: 20,
    compaction: 0.2,
    biology: 0.5,
  };
}

// ── Plant entity → PlantInfo conversion ──────────────────────────────

export function toPlantInfo(
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
      effects: b.effects.map((e) => ({ type: e.type, modifier: e.modifier })),
    })) ?? [],
    harvestReady: !!entity.harvestState?.ripe,
  };
}

// ── Session factory ──────────────────────────────────────────────────

/**
 * Create a new game session.
 *
 * Initializes ECS world with plot grid, pre-generates weather, wires
 * the turn manager's DUSK and ADVANCE phases to the simulation engine.
 *
 * Provides both reactive stores (for Svelte UI) and synchronous methods
 * (for CLI, tests, headless agents).
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
  const seasonPests = generateSeasonPests(zone, seed);
  const turnManager = createTurnManager();
  const eventLog = createEventLog();

  // ── Initialize event log with RUN_START ───────────────────────────
  eventLog.append({ type: 'RUN_START', seed, zone: zone.id });

  // ── Set initial energy budget so it's visible from Week 1 DAWN ────
  const week1Budget = calculateEnergyBudget(1, seasonWeather[0]);
  turnManager.energy.set({ current: week1Budget, max: week1Budget });

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
    pestEvents: seasonPests,
  };

  // ── Reactive stores ───────────────────────────────────────────────
  const tickResultStore = writable<DuskTickResult | null>(null);
  const advanceResultStore = writable<AdvanceResult | null>(null);
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

  // ── State tracking ─────────────────────────────────────────────────
  let lastDuskResult: DuskTickResult | null = null;
  let lastAdvanceResult: AdvanceResult | null = null;
  let duskFrostResult: FrostResult = { killingFrost: false, killed: [] };
  let runEnded = false;

  // ── DUSK phase handler ────────────────────────────────────────────

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
    weatherIndex.set(weekIdx);

    // Snapshot pre-tick state for diff
    const { stressBefore, progressBefore, conditionsBefore } = snapshotBeforeTick();

    // Run the full simulation tick (soil → companion → growth → stress → disease → frost)
    const tickResult = runTick(simConfig, weather, currentWeek);
    // Capture frost result for the ADVANCE phase
    duskFrostResult = tickResult.frost;

    // Build the DUSK result by diffing pre/post state
    const grown: DuskTickResult['grown'] = [];
    const stressed: DuskTickResult['stressed'] = [];
    const diseaseOnsets: DuskTickResult['diseaseOnsets'] = [];
    const harvestReady: DuskTickResult['harvestReady'] = [];
    const companionEffects: DuskTickResult['companionEffects'] = [];

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
          prevProgress: progressBefore.get(key) ?? 0,
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
          prevStress,
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

      // Companion effects
      const companionBuffs = entity.companionBuffs?.buffs;
      if (companionBuffs && companionBuffs.length > 0) {
        companionEffects.push({
          speciesId: p.species.speciesId,
          row: p.plotSlot.row,
          col: p.plotSlot.col,
          buffs: companionBuffs.map((b) => ({
            source: b.source,
            effects: b.effects.map((e) => ({ type: e.type, modifier: e.modifier })),
          })),
        });
      }
    }

    const duskResult: DuskTickResult = {
      week: currentWeek,
      grown,
      stressed,
      diseaseOnsets,
      harvestReady,
      companionEffects,
    };

    tickResultStore.set(duskResult);
    worldVersion.update((v) => v + 1);

    return duskResult;
  }

  // ── ADVANCE phase handler ─────────────────────────────────────────

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
      runEnded = true;
    }

    lastAdvanceResult = result;
    advanceResultStore.set(result);
    worldVersion.update((v) => v + 1);
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
    // Core subsystems
    world,
    turnManager,
    eventLog,
    rng,
    seasonWeather,
    seasonPests,
    speciesLookup,
    config,
    gridRows,
    gridCols,

    // Reactive stores
    plants$,
    soilStates$,
    currentWeather$,
    tickResult$: { subscribe: tickResultStore.subscribe },
    advanceResult$: { subscribe: advanceResultStore.subscribe },

    // Synchronous accessors
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

    isRunEnded() {
      return runEnded;
    },

    // Actions
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
      return lastDuskResult ?? undefined;
    },

    addPlant(
      speciesId: string,
      row: number,
      col: number,
      opts?: { instanceSeed?: number },
    ): Entity {
      const species = speciesLookup(speciesId);
      const entity: Partial<Entity> = {
        plotSlot: { row, col },
        species: { speciesId },
        growth: { progress: 0, stage: 'seed', rate_modifier: 1.0 },
        health: { value: 1.0, stress: 0 },
        activeConditions: { conditions: [] },
        companionBuffs: { buffs: [] },
      };
      if (species) {
        entity.harvestState = {
          ripe: false,
          remaining: species.harvest.yield_potential,
          quality: 1.0,
        };
        if (opts?.instanceSeed !== undefined) {
          entity.visual = { params: species.visual, instanceSeed: opts.instanceSeed };
        }
      }
      const added = world.add(entity as Entity);
      worldVersion.update((v) => v + 1);
      return added;
    },

    processWeek,

    // Queries
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

    // Serialization
    toJSON() {
      return eventLog.toJSON();
    },

    consumeLastDuskResult() {
      const result = lastDuskResult;
      lastDuskResult = null;
      return result ?? undefined;
    },

    notifyWorldChanged() {
      worldVersion.update((v) => v + 1);
    },
  };
}
