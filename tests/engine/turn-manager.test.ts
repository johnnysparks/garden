/**
 * Tests for the turn phase state machine.
 *
 * Covers: phase transitions, energy budget calculations, energy spending,
 * frost probability, and the onPhaseChange callback hook.
 */

import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  TurnPhase,
  createTurnManager,
  calculateEnergyBudget,
  getSeasonModifier,
  getWeatherModifier,
  checkFrost,
} from '../../src/lib/engine/turn-manager.js';
import { makeDefaultWeather } from './fixtures.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Advance through the full cycle: DAWN → PLAN → ACT → DUSK → ADVANCE */
function fullCycle(
  tm: ReturnType<typeof createTurnManager>,
  weather = makeDefaultWeather(),
): void {
  tm.advancePhase();    // DAWN → PLAN
  tm.beginWork(weather); // PLAN → ACT
  tm.endActions();       // ACT → DUSK
  tm.advancePhase();    // DUSK → ADVANCE
  tm.advancePhase();    // ADVANCE → DAWN (week++)
}

// ── Phase Transitions ───────────────────────────────────────────────

describe('phase transitions', () => {
  it('starts at DAWN, week 1', () => {
    const tm = createTurnManager();
    expect(get(tm.phase)).toBe(TurnPhase.DAWN);
    expect(get(tm.week)).toBe(1);
  });

  it('follows the fixed order DAWN → PLAN → ACT → DUSK → ADVANCE', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    expect(get(tm.phase)).toBe(TurnPhase.DAWN);

    tm.advancePhase();
    expect(get(tm.phase)).toBe(TurnPhase.PLAN);

    tm.beginWork(weather);
    expect(get(tm.phase)).toBe(TurnPhase.ACT);

    tm.endActions();
    expect(get(tm.phase)).toBe(TurnPhase.DUSK);

    tm.advancePhase();
    expect(get(tm.phase)).toBe(TurnPhase.ADVANCE);
  });

  it('wraps from ADVANCE to DAWN and increments week', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    expect(get(tm.week)).toBe(1);

    // Complete a full cycle
    fullCycle(tm, weather);

    expect(get(tm.phase)).toBe(TurnPhase.DAWN);
    expect(get(tm.week)).toBe(2);
  });

  it('increments week each time ADVANCE wraps to DAWN', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    for (let i = 0; i < 5; i++) {
      fullCycle(tm, weather);
    }

    expect(get(tm.week)).toBe(6); // started at 1, 5 cycles → week 6
  });

  it('advancePhase can be used for generic transitions (DAWN→PLAN, DUSK→ADVANCE)', () => {
    const tm = createTurnManager();

    tm.advancePhase(); // DAWN → PLAN
    expect(get(tm.phase)).toBe(TurnPhase.PLAN);
  });
});

// ── onPhaseChange callback ──────────────────────────────────────────

describe('onPhaseChange callback', () => {
  it('fires on every transition with (from, to)', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();
    const transitions: [TurnPhase, TurnPhase][] = [];

    tm.onPhaseChange = (from, to) => transitions.push([from, to]);

    tm.advancePhase();     // DAWN → PLAN
    tm.beginWork(weather); // PLAN → ACT
    tm.endActions();       // ACT → DUSK
    tm.advancePhase();     // DUSK → ADVANCE
    tm.advancePhase();     // ADVANCE → DAWN

    expect(transitions).toEqual([
      [TurnPhase.DAWN, TurnPhase.PLAN],
      [TurnPhase.PLAN, TurnPhase.ACT],
      [TurnPhase.ACT, TurnPhase.DUSK],
      [TurnPhase.DUSK, TurnPhase.ADVANCE],
      [TurnPhase.ADVANCE, TurnPhase.DAWN],
    ]);
  });

  it('does not fire when callback is null', () => {
    const tm = createTurnManager();
    const spy = vi.fn();

    tm.onPhaseChange = spy;
    tm.advancePhase();
    expect(spy).toHaveBeenCalledTimes(1);

    tm.onPhaseChange = null;
    tm.advancePhase(); // PLAN → ACT via advancePhase (no energy set)
    expect(spy).toHaveBeenCalledTimes(1); // no additional call
  });
});

// ── beginWork ───────────────────────────────────────────────────────

describe('beginWork', () => {
  it('transitions PLAN → ACT and sets energy budget', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather({ precipitation_mm: 10, special: null });

    tm.advancePhase(); // DAWN → PLAN
    tm.beginWork(weather);

    expect(get(tm.phase)).toBe(TurnPhase.ACT);
    const e = get(tm.energy);
    expect(e.current).toBeGreaterThan(0);
    expect(e.current).toBe(e.max);
  });

  it('throws if called outside PLAN phase', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    // Currently in DAWN
    expect(() => tm.beginWork(weather)).toThrow('requires PLAN phase');
  });
});

// ── endActions ──────────────────────────────────────────────────────

describe('endActions', () => {
  it('transitions ACT → DUSK', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    tm.advancePhase();     // → PLAN
    tm.beginWork(weather); // → ACT
    tm.endActions();       // → DUSK

    expect(get(tm.phase)).toBe(TurnPhase.DUSK);
  });

  it('throws if called outside ACT phase', () => {
    const tm = createTurnManager();
    expect(() => tm.endActions()).toThrow('requires ACT phase');
  });
});

// ── Energy spending ─────────────────────────────────────────────────

describe('spendEnergy', () => {
  it('decrements energy and returns true on success', () => {
    const tm = createTurnManager();
    // Spring week with perfect weather → budget = 4 + 1 + 1 = 6
    const weather = makeDefaultWeather({
      week: 3,
      precipitation_mm: 2,
      temp_high_c: 22,
      special: null,
    });

    tm.advancePhase();
    tm.beginWork(weather);

    const budget = get(tm.energy).max;
    expect(tm.spendEnergy(1)).toBe(true);
    expect(get(tm.energy).current).toBe(budget - 1);
  });

  it('returns false if cost exceeds available energy', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    tm.advancePhase();
    tm.beginWork(weather);

    const budget = get(tm.energy).max;
    expect(tm.spendEnergy(budget + 1)).toBe(false);
    // Energy should be unchanged
    expect(get(tm.energy).current).toBe(budget);
  });

  it('returns false if not in ACT phase', () => {
    const tm = createTurnManager();
    // In DAWN phase
    expect(tm.spendEnergy(1)).toBe(false);
  });

  it('auto-transitions to DUSK when energy reaches 0', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    tm.advancePhase();
    tm.beginWork(weather);

    const budget = get(tm.energy).max;
    // Spend all energy at once
    expect(tm.spendEnergy(budget)).toBe(true);

    expect(get(tm.energy).current).toBe(0);
    expect(get(tm.phase)).toBe(TurnPhase.DUSK);
  });

  it('auto-transitions fires onPhaseChange', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    tm.advancePhase();
    tm.beginWork(weather);

    const transitions: [TurnPhase, TurnPhase][] = [];
    tm.onPhaseChange = (from, to) => transitions.push([from, to]);

    const budget = get(tm.energy).max;
    tm.spendEnergy(budget);

    expect(transitions).toEqual([[TurnPhase.ACT, TurnPhase.DUSK]]);
  });
});

// ── canAct derived store ────────────────────────────────────────────

describe('canAct', () => {
  it('is true during ACT phase with energy > 0', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    expect(get(tm.canAct)).toBe(false); // DAWN

    tm.advancePhase(); // PLAN
    expect(get(tm.canAct)).toBe(false);

    tm.beginWork(weather); // ACT with energy
    expect(get(tm.canAct)).toBe(true);
  });

  it('becomes false when energy is exhausted', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    tm.advancePhase();
    tm.beginWork(weather);
    expect(get(tm.canAct)).toBe(true);

    const budget = get(tm.energy).max;
    tm.spendEnergy(budget); // exhausts energy, auto-transitions to DUSK

    expect(get(tm.canAct)).toBe(false);
  });

  it('is false in DUSK phase', () => {
    const tm = createTurnManager();
    const weather = makeDefaultWeather();

    tm.advancePhase();
    tm.beginWork(weather);
    tm.endActions(); // → DUSK

    expect(get(tm.canAct)).toBe(false);
  });
});

// ── Energy budget calculation ───────────────────────────────────────

describe('calculateEnergyBudget', () => {
  it('returns base 4 for a mid-season mild week', () => {
    const weather = makeDefaultWeather({ week: 15, precipitation_mm: 10, special: null });
    expect(calculateEnergyBudget(15, weather)).toBe(4);
  });

  it('returns 5 in spring (base 4 + season 1)', () => {
    const weather = makeDefaultWeather({ week: 3, precipitation_mm: 10, special: null });
    expect(calculateEnergyBudget(3, weather)).toBe(5);
  });

  it('returns 3 in late fall (base 4 + season -1)', () => {
    const weather = makeDefaultWeather({ week: 27, precipitation_mm: 10, special: null });
    expect(calculateEnergyBudget(27, weather)).toBe(3);
  });

  it('subtracts 1 for rain weeks (precipitation > 25 mm)', () => {
    const weather = makeDefaultWeather({ week: 15, precipitation_mm: 30, special: null });
    expect(calculateEnergyBudget(15, weather)).toBe(3); // 4 + 0 - 1
  });

  it('subtracts 1 for heavy_rain special event even with low precipitation', () => {
    const weather = makeDefaultWeather({
      week: 15,
      precipitation_mm: 5,
      special: { type: 'heavy_rain', flood_risk: 0.5 },
    });
    expect(calculateEnergyBudget(15, weather)).toBe(3); // 4 + 0 - 1
  });

  it('adds 1 for perfect weather (low precip, mild temps, no special)', () => {
    const weather = makeDefaultWeather({
      week: 15,
      precipitation_mm: 2,
      temp_high_c: 22,
      special: null,
    });
    expect(calculateEnergyBudget(15, weather)).toBe(5); // 4 + 0 + 1
  });

  it('stacks season and weather modifiers: spring + perfect = 6', () => {
    const weather = makeDefaultWeather({
      week: 3,
      precipitation_mm: 2,
      temp_high_c: 22,
      special: null,
    });
    expect(calculateEnergyBudget(3, weather)).toBe(6); // 4 + 1 + 1
  });

  it('stacks season and weather modifiers: late fall + rain = 2', () => {
    const weather = makeDefaultWeather({ week: 28, precipitation_mm: 40, special: null });
    expect(calculateEnergyBudget(28, weather)).toBe(2); // 4 - 1 - 1
  });

  it('never drops below 1', () => {
    // Contrived: even if modifiers add up to more than -3, floor is 1
    const weather = makeDefaultWeather({ week: 29, precipitation_mm: 50, special: null });
    expect(calculateEnergyBudget(29, weather)).toBeGreaterThanOrEqual(1);
  });
});

// ── Season modifier ─────────────────────────────────────────────────

describe('getSeasonModifier', () => {
  it('returns +1 for spring weeks (0–7)', () => {
    for (let w = 0; w <= 7; w++) {
      expect(getSeasonModifier(w)).toBe(1);
    }
  });

  it('returns 0 for summer / early fall (8–24)', () => {
    for (let w = 8; w <= 24; w++) {
      expect(getSeasonModifier(w)).toBe(0);
    }
  });

  it('returns -1 for late fall (25–29)', () => {
    for (let w = 25; w <= 29; w++) {
      expect(getSeasonModifier(w)).toBe(-1);
    }
  });
});

// ── Weather modifier ────────────────────────────────────────────────

describe('getWeatherModifier', () => {
  it('returns -1 for high precipitation', () => {
    const weather = makeDefaultWeather({ precipitation_mm: 30, special: null });
    expect(getWeatherModifier(weather)).toBe(-1);
  });

  it('returns -1 for heavy_rain event regardless of precipitation', () => {
    const weather = makeDefaultWeather({
      precipitation_mm: 5,
      special: { type: 'heavy_rain', flood_risk: 0.4 },
    });
    expect(getWeatherModifier(weather)).toBe(-1);
  });

  it('returns +1 for perfect conditions', () => {
    const weather = makeDefaultWeather({
      precipitation_mm: 2,
      temp_high_c: 24,
      special: null,
    });
    expect(getWeatherModifier(weather)).toBe(1);
  });

  it('returns 0 for mild/average conditions', () => {
    const weather = makeDefaultWeather({
      precipitation_mm: 15,
      temp_high_c: 24,
      special: null,
    });
    expect(getWeatherModifier(weather)).toBe(0);
  });

  it('returns 0 if temp is outside perfect range even with low precip', () => {
    const weather = makeDefaultWeather({
      precipitation_mm: 2,
      temp_high_c: 35, // too hot for "perfect"
      special: null,
    });
    expect(getWeatherModifier(weather)).toBe(0);
  });

  it('returns 0 if a special event is present (not heavy_rain) with otherwise perfect weather', () => {
    const weather = makeDefaultWeather({
      precipitation_mm: 2,
      temp_high_c: 22,
      special: { type: 'heatwave', duration_weeks: 2, temp_bonus: 5 },
    });
    expect(getWeatherModifier(weather)).toBe(0);
  });
});

// ── Frost check ─────────────────────────────────────────────────────

describe('checkFrost', () => {
  const firstFrostWeekAvg = 24;

  it('returns low probability well before the average frost week', () => {
    const result = checkFrost(10, firstFrostWeekAvg, 0.5);
    expect(result.probability).toBeLessThan(0.01);
    expect(result.frost).toBe(false);
  });

  it('returns ~0.5 probability at exactly the average frost week', () => {
    const result = checkFrost(24, firstFrostWeekAvg, 0.99);
    // sigmoid(0, 0.5) = 0.5
    expect(result.probability).toBeCloseTo(0.5, 1);
  });

  it('returns high probability well after the average frost week', () => {
    const result = checkFrost(30, firstFrostWeekAvg, 0.5);
    expect(result.probability).toBeGreaterThan(0.9);
  });

  it('probability increases monotonically with week number', () => {
    let prev = 0;
    for (let w = 15; w <= 30; w++) {
      const result = checkFrost(w, firstFrostWeekAvg, 1.0); // rng doesn't matter for probability
      expect(result.probability).toBeGreaterThanOrEqual(prev);
      prev = result.probability;
    }
  });

  it('frost occurs when rng roll is below probability', () => {
    // At week 28, probability is high. Use rngRoll = 0.01 to guarantee frost.
    const result = checkFrost(28, firstFrostWeekAvg, 0.01);
    expect(result.frost).toBe(true);
  });

  it('frost does not occur when rng roll is above probability', () => {
    // At week 10, probability is near 0. Even with rngRoll = 0.5, no frost.
    const result = checkFrost(10, firstFrostWeekAvg, 0.5);
    expect(result.frost).toBe(false);
  });

  it('early weeks have near-zero probability', () => {
    const result = checkFrost(0, firstFrostWeekAvg, 0.5);
    expect(result.probability).toBeLessThan(0.001);
  });
});
