/**
 * Tests for CLI formatter — pending amendments display in inspect output.
 */

import { describe, it, expect } from 'vitest';
import { createGameSession, type GameSession } from '../../src/lib/engine/game-session.js';
import { TOMATO, makeSpeciesLookup } from '../engine/fixtures.js';
import type { ClimateZone } from '../../src/lib/engine/weather-gen.js';
import type { Entity } from '../../src/lib/engine/ecs/components.js';
import { getPlotAt } from '../../src/lib/engine/ecs/world.js';
import { formatInspect } from '../../src/cli/formatter.js';

const TEST_ZONE: ClimateZone = {
  id: 'test_zone',
  name: 'Test Zone',
  avg_temps_by_week: [
    18, 20, 22, 24, 25, 26, 27, 28, 28, 27,
    26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
    16, 15, 14, 13, 12, 11, 10, 9, 8, 7,
  ],
  temp_variance: 2.0,
  precip_pattern: 'even',
  frost_free_weeks: [0, 28],
  first_frost_week_avg: 28,
  humidity_baseline: 0.5,
  special_event_weights: {},
  pest_event_weights: {},
};

const speciesLookup = makeSpeciesLookup([TOMATO]);

function createTestSession(): GameSession {
  return createGameSession({
    seed: 42,
    zone: TEST_ZONE,
    speciesLookup,
    gridRows: 3,
    gridCols: 3,
  });
}

describe('formatInspect', () => {
  it('shows "Pending amendments: none" when no amendments exist', () => {
    const session = createTestSession();
    const output = formatInspect(session, 0, 0);
    expect(output).toContain('Pending amendments: none');
  });

  it('displays pending amendments with type, applied week, and weeks remaining', () => {
    const session = createTestSession();

    // Manually add a pending amendment to the plot entity
    const plot = getPlotAt(session.world, 1, 1) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'compost',
          applied_week: 1,
          effect_delay_weeks: 3,
          effects: { nitrogen: 0.1, organic_matter: 0.15 },
        },
      ],
    };

    const output = formatInspect(session, 1, 1);
    expect(output).toContain('Pending amendments:');
    expect(output).toContain('compost: applied week 1, 3 weeks remaining');
    expect(output).not.toContain('Pending amendments: none');
  });

  it('shows correct weeks remaining based on current week', () => {
    const session = createTestSession();

    // Advance to week 3 so we can test the remaining calculation
    session.processWeek(); // week 1 -> 2
    session.processWeek(); // week 2 -> 3

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'bone_meal',
          applied_week: 1,
          effect_delay_weeks: 4,
          effects: { phosphorus: 0.2 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    // applied_week(1) + delay(4) - current_week(3) = 2 weeks remaining
    expect(output).toContain('bone_meal: applied week 1, 2 weeks remaining');
  });

  it('shows 0 weeks remaining when amendment delay has elapsed', () => {
    const session = createTestSession();

    // Advance past the amendment's effect time
    session.processWeek(); // week 1 -> 2
    session.processWeek(); // week 2 -> 3
    session.processWeek(); // week 3 -> 4

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'lime',
          applied_week: 1,
          effect_delay_weeks: 2,
          effects: { ph: 0.5 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    expect(output).toContain('lime: applied week 1, 0 weeks remaining');
  });

  it('displays multiple pending amendments', () => {
    const session = createTestSession();

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'compost',
          applied_week: 1,
          effect_delay_weeks: 3,
          effects: { nitrogen: 0.1 },
        },
        {
          type: 'bone_meal',
          applied_week: 1,
          effect_delay_weeks: 2,
          effects: { phosphorus: 0.2 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    expect(output).toContain('compost: applied week 1, 3 weeks remaining');
    expect(output).toContain('bone_meal: applied week 1, 2 weeks remaining');
  });

  it('uses singular "week" when 1 week remaining', () => {
    const session = createTestSession();

    const plot = getPlotAt(session.world, 0, 0) as Entity;
    plot.amendments = {
      pending: [
        {
          type: 'compost',
          applied_week: 1,
          effect_delay_weeks: 2,
          effects: { nitrogen: 0.1 },
        },
      ],
    };

    const output = formatInspect(session, 0, 0);
    // applied_week(1) + delay(2) - current_week(1) = 2 => plural
    // But wait, week 1 is current, so 1 + 2 - 1 = 2
    expect(output).toContain('2 weeks remaining');
  });
});
