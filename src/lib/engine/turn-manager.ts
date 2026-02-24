/**
 * Turn phase state machine — manages the weekly DAWN→PLAN→ACT→DUSK→ADVANCE cycle.
 *
 * Pure logic layer with no UI dependencies. Uses Svelte stores for reactivity
 * so that UI layers can subscribe to phase/week/energy changes.
 *
 * Energy budget: base 4, modified by season (spring +1, late fall −1)
 * and weather (rain −1, perfect +1).
 *
 * @see 01-ACTIONS-AND-TURN.md for the full spec
 */

import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import { frostProbability } from './weather-gen.js';
import type { WeekWeather } from './ecs/components.js';

// ── Turn Phase ──────────────────────────────────────────────────────

export enum TurnPhase {
  DAWN = 'DAWN',
  PLAN = 'PLAN',
  ACT = 'ACT',
  DUSK = 'DUSK',
  ADVANCE = 'ADVANCE',
}

/** Fixed phase order for the weekly cycle. */
const PHASE_ORDER: readonly TurnPhase[] = [
  TurnPhase.DAWN,
  TurnPhase.PLAN,
  TurnPhase.ACT,
  TurnPhase.DUSK,
  TurnPhase.ADVANCE,
];

// ── Energy ──────────────────────────────────────────────────────────

export interface EnergyState {
  current: number;
  max: number;
}

// ── Season / Weather helpers ────────────────────────────────────────

/**
 * Season modifier for energy budget.
 *
 * 30-week season (0-indexed):
 *   - Spring (weeks 0–7): +1 (long days)
 *   - Summer / early fall (weeks 8–24): +0
 *   - Late fall (weeks 25–29): −1 (short days)
 */
export function getSeasonModifier(week: number): number {
  if (week <= 7) return 1;
  if (week >= 25) return -1;
  return 0;
}

/**
 * Weather modifier for energy budget.
 *
 *   - Rain week (precipitation > 25 mm or heavy_rain event): −1
 *   - Perfect week (precip < 5 mm, highs 18–28 °C, no special event): +1
 *   - Mild (everything else): +0
 */
export function getWeatherModifier(weather: WeekWeather): number {
  if (
    weather.precipitation_mm > 25 ||
    weather.special?.type === 'heavy_rain'
  ) {
    return -1;
  }
  if (
    weather.precipitation_mm < 5 &&
    weather.temp_high_c >= 18 &&
    weather.temp_high_c <= 28 &&
    weather.special === null
  ) {
    return 1;
  }
  return 0;
}

/**
 * Calculate the total energy budget for a given week and weather.
 * Always at least 1 so the player can always take one action.
 */
export function calculateEnergyBudget(week: number, weather: WeekWeather): number {
  const base = 4;
  return Math.max(1, base + getSeasonModifier(week) + getWeatherModifier(weather));
}

// ── Frost check ─────────────────────────────────────────────────────

export interface FrostCheckResult {
  frost: boolean;
  probability: number;
}

/**
 * Frost probability check for the ADVANCE phase.
 *
 * Uses the sigmoid curve from `weather-gen.frostProbability()`:
 *   P(frost) = 1 / (1 + e^(−0.5 × (week − firstFrostWeekAvg)))
 *
 * @param week              Current week number
 * @param firstFrostWeekAvg Average first-frost week for the climate zone
 * @param rngRoll           A random value in [0, 1) from the seeded PRNG
 */
export function checkFrost(
  week: number,
  firstFrostWeekAvg: number,
  rngRoll: number,
): FrostCheckResult {
  const probability = frostProbability(week, firstFrostWeekAvg);
  return {
    frost: rngRoll < probability,
    probability,
  };
}

// ── Turn Manager ────────────────────────────────────────────────────

/** Callback fired on every phase transition. */
export type PhaseChangeCallback = (from: TurnPhase, to: TurnPhase) => void;

export interface TurnManager {
  /** Current phase (subscribe-only). */
  phase: Readable<TurnPhase>;
  /** Current week number (subscribe-only). */
  week: Readable<number>;
  /** Energy state (readable + writable). */
  energy: Writable<EnergyState>;
  /** True when phase is ACT and energy > 0. */
  canAct: Readable<boolean>;

  /**
   * Transition PLAN → ACT and set the energy budget for this week.
   * Throws if not currently in PLAN phase.
   */
  beginWork(weather: WeekWeather): void;

  /**
   * Spend energy on an action. Returns false (without decrementing) if
   * insufficient energy or not in ACT phase. Automatically transitions
   * to DUSK when energy reaches 0.
   */
  spendEnergy(cost: number): boolean;

  /**
   * Explicitly end the ACT phase and transition to DUSK.
   * Throws if not currently in ACT phase.
   */
  endActions(): void;

  /**
   * Generic next-phase transition following the fixed order.
   * When called from ADVANCE, increments the week counter and wraps to DAWN.
   */
  advancePhase(): void;

  /** Optional callback hook fired on every phase transition. */
  onPhaseChange: PhaseChangeCallback | null;
}

/**
 * Create a new turn manager starting at week 1, DAWN phase.
 */
export function createTurnManager(): TurnManager {
  const phase = writable<TurnPhase>(TurnPhase.DAWN);
  const week = writable<number>(1);
  const energy = writable<EnergyState>({ current: 0, max: 0 });

  const canAct: Readable<boolean> = derived(
    [phase, energy],
    ([$phase, $energy]) => $phase === TurnPhase.ACT && $energy.current > 0,
  );

  let _onPhaseChange: PhaseChangeCallback | null = null;

  /** Internal transition — sets the phase store and fires the callback. */
  function transition(to: TurnPhase): void {
    const from = get(phase);
    phase.set(to);
    _onPhaseChange?.(from, to);
  }

  function advancePhase(): void {
    const current = get(phase);
    const idx = PHASE_ORDER.indexOf(current);

    if (current === TurnPhase.ADVANCE) {
      // Leaving ADVANCE: increment week, wrap to DAWN
      // TODO: BUG — Energy is not reset when entering a new week's DAWN phase.
      // Energy is only set during the PLAN→ACT transition via beginWork().
      // This means `status` at DAWN shows the stale energy value from the
      // previous week (e.g., 0/5 or 2/5 after spending). The display is
      // misleading — players see "Energy: 0/5" at DAWN even though it will
      // be recalculated at ACT. Should either reset energy here or show
      // a placeholder like "—" for energy during DAWN/PLAN phases.
      week.update((w) => w + 1);
      transition(TurnPhase.DAWN);
    } else {
      transition(PHASE_ORDER[idx + 1]);
    }
  }

  function beginWork(weather: WeekWeather): void {
    const currentPhase = get(phase);
    if (currentPhase !== TurnPhase.PLAN) {
      throw new Error(
        `beginWork() requires PLAN phase, currently in ${currentPhase}`,
      );
    }
    const currentWeek = get(week);
    const budget = calculateEnergyBudget(currentWeek, weather);
    energy.set({ current: budget, max: budget });
    transition(TurnPhase.ACT);
  }

  function spendEnergy(cost: number): boolean {
    const currentPhase = get(phase);
    if (currentPhase !== TurnPhase.ACT) return false;

    const e = get(energy);
    if (e.current < cost) return false;

    const remaining = e.current - cost;
    energy.set({ ...e, current: remaining });

    // Auto-transition to DUSK when energy is exhausted
    if (remaining <= 0) {
      transition(TurnPhase.DUSK);
    }

    return true;
  }

  function endActions(): void {
    const currentPhase = get(phase);
    if (currentPhase !== TurnPhase.ACT) {
      throw new Error(
        `endActions() requires ACT phase, currently in ${currentPhase}`,
      );
    }
    transition(TurnPhase.DUSK);
  }

  return {
    phase: { subscribe: phase.subscribe },
    week: { subscribe: week.subscribe },
    energy,
    canAct,
    beginWork,
    spendEnergy,
    endActions,
    advancePhase,
    get onPhaseChange() {
      return _onPhaseChange;
    },
    set onPhaseChange(cb: PhaseChangeCallback | null) {
      _onPhaseChange = cb;
    },
  };
}
