/**
 * Tests for CLI command parser and dispatcher.
 *
 * Tests the text-parsing layer (arg parsing, command dispatch, error formatting)
 * and integration with session action methods. Game logic validation is tested
 * in game-actions.test.ts; these tests focus on the CLI-specific behavior.
 */

import { describe, it, expect } from 'vitest';
import { executeCommand, parseRowCol, formatAutoAdvance } from '../../src/cli/commands.js';
import {
  createGameSession,
  type GameSession,
} from '../../src/lib/engine/game-session.js';
import { TurnPhase } from '../../src/lib/engine/turn-manager.js';
import { TOMATO, BASIL, makeSpeciesLookup } from '../engine/fixtures.js';
import type { ClimateZone } from '../../src/lib/engine/weather-gen.js';

// ── Shared setup ─────────────────────────────────────────────────────

const TEST_ZONE: ClimateZone = {
  id: 'test_zone',
  name: 'Test Zone',
  avg_temps_by_week: Array.from({ length: 30 }, () => 22),
  temp_variance: 2.0,
  precip_pattern: 'even',
  frost_free_weeks: [0, 28],
  first_frost_week_avg: 28,
  humidity_baseline: 0.5,
  special_event_weights: {},
  pest_event_weights: {},
};

const speciesLookup = makeSpeciesLookup([TOMATO, BASIL]);

function createTestSession(): GameSession {
  return createGameSession({
    seed: 42,
    zone: TEST_ZONE,
    speciesLookup,
    gridRows: 3,
    gridCols: 3,
  });
}

/** Advance session from DAWN to ACT phase. */
function advanceToAct(session: GameSession): void {
  session.advancePhase(); // DAWN → PLAN
  session.advancePhase(); // PLAN → ACT
}

// ── parseRowCol ──────────────────────────────────────────────────────

describe('parseRowCol', () => {
  it('parses valid row and col', () => {
    const result = parseRowCol(['1', '2']);
    expect(result).toEqual({ row: 1, col: 2 });
  });

  it('parses zero coordinates', () => {
    const result = parseRowCol(['0', '0']);
    expect(result).toEqual({ row: 0, col: 0 });
  });

  it('returns error for missing arguments', () => {
    expect(typeof parseRowCol([])).toBe('string');
    expect(typeof parseRowCol(['1'])).toBe('string');
  });

  it('returns error for non-numeric arguments', () => {
    const result = parseRowCol(['a', 'b']);
    expect(typeof result).toBe('string');
    expect(result).toContain('must be numbers');
  });

  it('ignores extra arguments', () => {
    const result = parseRowCol(['1', '2', '3']);
    expect(result).toEqual({ row: 1, col: 2 });
  });
});

// ── Empty / comment input ────────────────────────────────────────────

describe('empty and comment input', () => {
  it('returns empty output for empty string', () => {
    const session = createTestSession();
    expect(executeCommand(session, '').output).toBe('');
  });

  it('returns empty output for whitespace-only input', () => {
    const session = createTestSession();
    expect(executeCommand(session, '   ').output).toBe('');
  });

  it('returns empty output for comment lines', () => {
    const session = createTestSession();
    expect(executeCommand(session, '# this is a comment').output).toBe('');
  });
});

// ── Unknown command ──────────────────────────────────────────────────

describe('unknown command', () => {
  it('returns error for unknown commands', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'foobar');
    expect(result.output).toContain('Unknown command');
    expect(result.output).toContain('foobar');
  });
});

// ── Query commands ───────────────────────────────────────────────────

describe('query commands', () => {
  it('status returns non-empty output', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'status');
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.output).toContain('Week');
  });

  it('grid returns non-empty output', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'grid');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('weather returns non-empty output', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'weather');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('plants returns output', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'plants');
    expect(result.output).toBeDefined();
  });

  it('help returns non-empty output', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'help');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('score returns a formatted score card', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'score');
    expect(result.output).toContain('FINAL SCORE');
    expect(result.output).toContain('TOTAL SCORE');
  });

  it('commands are case-insensitive', () => {
    const session = createTestSession();
    const lower = executeCommand(session, 'status');
    const upper = executeCommand(session, 'STATUS');
    expect(lower.output).toBe(upper.output);
  });
});

// ── inspect command ──────────────────────────────────────────────────

describe('inspect command', () => {
  it('returns plot info for valid coordinates', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'inspect 0 0');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('returns error for missing coordinates', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'inspect');
    expect(result.output).toContain('Error');
  });

  it('returns error for out-of-bounds coordinates', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'inspect 10 10');
    expect(result.output).toContain('out of bounds');
  });
});

// ── soil command ─────────────────────────────────────────────────────

describe('soil command', () => {
  it('returns soil info for valid coordinates', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'soil 0 0');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('returns error for missing coordinates', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'soil');
    expect(result.output).toContain('Error');
  });

  it('returns error for out-of-bounds coordinates', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'soil 5 5');
    expect(result.output).toContain('out of bounds');
  });
});

// ── species command ──────────────────────────────────────────────────

describe('species command', () => {
  it('returns species detail for a known species', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'species tomato_cherokee_purple');
    expect(result.output).toContain('Cherokee Purple');
  });

  it('returns error for unknown species', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'species nonexistent');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Unknown species');
  });
});

// ── log command ──────────────────────────────────────────────────────

describe('log command', () => {
  it('returns event history', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'log');
    expect(result.output).toBeDefined();
  });

  it('accepts an optional count argument', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'log 5');
    expect(result.output).toBeDefined();
  });
});

// ── advance command ──────────────────────────────────────────────────

describe('advance command', () => {
  it('advances to the next interactive phase', () => {
    const session = createTestSession();
    expect(session.getPhase()).toBe(TurnPhase.DAWN);

    const result = executeCommand(session, 'advance');
    // DAWN → PLAN
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('returns error when run has ended', () => {
    const session = createTestSession();
    // Simulate end by running until frost
    while (!session.isRunEnded()) {
      session.processWeek();
    }

    const result = executeCommand(session, 'advance');
    expect(result.output).toContain('Run has ended');
  });
});

// ── week command ─────────────────────────────────────────────────────

describe('week command', () => {
  it('from ACT phase, advances to ACT of next week', () => {
    const session = createTestSession();
    advanceToAct(session);
    const startWeek = session.getWeek();

    executeCommand(session, 'week');

    expect(session.getWeek()).toBeGreaterThan(startWeek);
    expect(session.getPhase()).toBe(TurnPhase.ACT);
  });

  it('from DAWN phase, advances to ACT of the same week (not the next week)', () => {
    // BUG: The week command was checking `getWeek() > startWeek && phase === ACT`,
    // which caused it to skip Week 1 ACT entirely when starting from DAWN.
    // Players who used `week` immediately after starting the game lost their first week.
    const session = createTestSession();
    expect(session.getPhase()).toBe(TurnPhase.DAWN);
    const startWeek = session.getWeek(); // 1

    executeCommand(session, 'week');

    // Should land on ACT of Week 1, not skip to Week 2
    expect(session.getPhase()).toBe(TurnPhase.ACT);
    expect(session.getWeek()).toBe(startWeek); // still Week 1
  });

  it('from PLAN phase, advances to ACT of the same week', () => {
    const session = createTestSession();
    session.advancePhase(); // DAWN → PLAN
    expect(session.getPhase()).toBe(TurnPhase.PLAN);
    const startWeek = session.getWeek();

    executeCommand(session, 'week');

    expect(session.getPhase()).toBe(TurnPhase.ACT);
    expect(session.getWeek()).toBe(startWeek);
  });

  it('returns error when run has ended', () => {
    const session = createTestSession();
    while (!session.isRunEnded()) {
      session.processWeek();
    }

    const result = executeCommand(session, 'week');
    expect(result.output).toContain('Run has ended');
  });
});

// ── plant command ────────────────────────────────────────────────────

describe('plant command', () => {
  it('plants a species at the specified plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'plant tomato_cherokee_purple 0 0');
    expect(result.output).toContain('Planted');
    expect(result.output).toContain('Cherokee Purple');
    expect(result.output).toContain('[0, 0]');
    expect(result.output).toContain('Energy');
  });

  it('returns error for missing arguments', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'plant tomato_cherokee_purple');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Usage');
  });

  it('returns error for invalid coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'plant tomato_cherokee_purple abc def');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('must be numbers');
  });

  it('returns error when not in ACT phase', () => {
    const session = createTestSession();
    // Still in DAWN

    const result = executeCommand(session, 'plant tomato_cherokee_purple 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Not in ACT phase');
  });

  it('returns error for unknown species', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'plant alien_plant 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Unknown species');
  });

  it('returns error when plot is occupied', () => {
    const session = createTestSession();
    advanceToAct(session);

    executeCommand(session, 'plant tomato_cherokee_purple 0 0');
    const result = executeCommand(session, 'plant basil_genovese 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('already occupied');
  });

  it('returns error for out-of-bounds coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'plant tomato_cherokee_purple 5 5');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('out of bounds');
  });
});

// ── diagnose command ─────────────────────────────────────────────────

describe('diagnose command', () => {
  it('diagnoses a plant at the specified plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    executeCommand(session, 'plant tomato_cherokee_purple 0 0');
    const result = executeCommand(session, 'diagnose 0 0');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('returns error for missing coordinates', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'diagnose');
    expect(result.output).toContain('Error');
  });

  it('returns error when no plant is at the plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'diagnose 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('No plant');
  });

  it('returns error when not in ACT phase', () => {
    const session = createTestSession();

    const result = executeCommand(session, 'diagnose 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Not in ACT phase');
  });
});

// ── intervene command ────────────────────────────────────────────────

describe('intervene command', () => {
  it('intervenes on a plant', () => {
    const session = createTestSession();
    advanceToAct(session);

    executeCommand(session, 'plant tomato_cherokee_purple 1 1');
    const result = executeCommand(session, 'intervene prune 1 1');
    expect(result.output).toContain('Intervened');
    expect(result.output).toContain('prune');
    expect(result.output).toContain('Energy');
  });

  it('returns error for missing arguments', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'intervene prune');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Usage');
  });

  it('returns error when no plant is at the plot', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'intervene prune 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('No plant');
  });

  it('returns error when not in ACT phase', () => {
    const session = createTestSession();

    const result = executeCommand(session, 'intervene prune 0 0');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Not in ACT phase');
  });
});

// ── scout command ────────────────────────────────────────────────────

describe('scout command', () => {
  it('scouts weather target', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'scout weather');
    // Should return weather forecast output
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('scouts non-weather target', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'scout pests');
    expect(result.output).toContain('Scouted');
    expect(result.output).toContain('pests');
    expect(result.output).toContain('Energy');
  });

  it('returns error for missing target', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = executeCommand(session, 'scout');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Usage');
  });

  it('returns error when not in ACT phase', () => {
    const session = createTestSession();

    const result = executeCommand(session, 'scout weather');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Not in ACT phase');
  });
});

// ── wait command ─────────────────────────────────────────────────────

describe('wait command', () => {
  it('ends actions and advances to next week', () => {
    const session = createTestSession();
    advanceToAct(session);

    const weekBefore = session.getWeek();
    const result = executeCommand(session, 'wait');
    expect(result.output).toContain('Ended actions early');
    expect(session.getWeek()).toBe(weekBefore + 1);
  });

  it('returns error when not in ACT phase', () => {
    const session = createTestSession();

    const result = executeCommand(session, 'wait');
    expect(result.output).toContain('Error');
    expect(result.output).toContain('Not in ACT phase');
  });
});

// ── quit command ─────────────────────────────────────────────────────

describe('quit command', () => {
  it('returns quit flag', () => {
    const session = createTestSession();
    const result = executeCommand(session, 'quit');
    expect(result.quit).toBe(true);
    expect(result.output).toContain('Goodbye');
  });
});

// ── formatAutoAdvance ────────────────────────────────────────────────

describe('formatAutoAdvance', () => {
  it('returns empty string when still in ACT phase', () => {
    const session = createTestSession();
    advanceToAct(session);

    const result = formatAutoAdvance(session);
    expect(result).toBe('');
  });

  it('formats dusk and advance results when in DUSK phase', () => {
    const session = createTestSession();
    advanceToAct(session);

    // Spend all energy to trigger auto-transition to DUSK
    while (session.getEnergy().current > 0) {
      session.spendEnergy(1);
    }
    // Now session should be in DUSK phase

    if (session.getPhase() === TurnPhase.DUSK) {
      const result = formatAutoAdvance(session);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ── Integration: energy depletion triggers auto-advance ──────────────

describe('auto-advance on energy depletion', () => {
  it('plant command includes auto-advance output when energy hits 0', () => {
    const session = createTestSession();
    advanceToAct(session);

    // Spend energy down to 1
    while (session.getEnergy().current > 1) {
      session.spendEnergy(1);
    }

    // This plant should spend the last energy and trigger auto-advance
    const result = executeCommand(session, 'plant tomato_cherokee_purple 0 0');
    expect(result.output).toContain('Planted');
    // After auto-advance, should include status for next week
    if (session.getPhase() !== TurnPhase.ACT) {
      expect(result.output).toContain('Week');
    }
  });
});
