import { describe, it, expect } from 'vitest';
import {
  generateSeasonPests,
  PEST_CATALOG,
  type PestDefinition,
} from '../../src/lib/engine/pest-gen.js';
import {
  ClimateZoneSchema,
  generateSeasonWeather,
  type ClimateZone,
} from '../../src/lib/engine/weather-gen.js';
import zone8aData from '../../src/lib/data/zones/zone_8a.json';

// ---------------------------------------------------------------------------
// Test zone fixtures
// ---------------------------------------------------------------------------

const zone8a: ClimateZone = ClimateZoneSchema.parse(zone8aData);

/** Minimal zone with no pest pressure — generates no events. */
const ZONE_NO_PESTS: ClimateZone = {
  ...zone8a,
  pest_event_weights: {},
};

/** Zone with only aphids at high probability, for reliable test output. */
const ZONE_APHIDS_ONLY: ClimateZone = {
  ...zone8a,
  pest_event_weights: { aphids: 1.0 }, // arrive every eligible week
};

/** Zone referencing a pest ID that is not in the catalog. */
const ZONE_UNKNOWN_PEST: ClimateZone = {
  ...zone8a,
  pest_event_weights: { unicorn_beetle: 0.5 },
};

function generate(zone: ClimateZone, seed = 42) {
  return generateSeasonPests(zone, seed);
}

// ---------------------------------------------------------------------------
// Pest catalog integrity
// ---------------------------------------------------------------------------

describe('PEST_CATALOG', () => {
  it('contains at least one pest definition', () => {
    expect(PEST_CATALOG.length).toBeGreaterThan(0);
  });

  it('all pest IDs are unique', () => {
    const ids = PEST_CATALOG.map((p) => p.pest_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all pest definitions have non-empty target_families', () => {
    for (const def of PEST_CATALOG) {
      expect(def.target_families.length).toBeGreaterThan(0);
    }
  });

  it('severity_range is ordered [min, max] with min >= 0 and max <= 1', () => {
    for (const def of PEST_CATALOG) {
      const [lo, hi] = def.severity_range;
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(lo).toBeLessThanOrEqual(hi);
    }
  });

  it('duration_range is ordered [min, max] with positive values', () => {
    for (const def of PEST_CATALOG) {
      const [lo, hi] = def.duration_range;
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });

  it('earliest_week is in [0, 29]', () => {
    for (const def of PEST_CATALOG) {
      expect(def.earliest_week).toBeGreaterThanOrEqual(0);
      expect(def.earliest_week).toBeLessThan(30);
    }
  });

  it('min_gap_weeks is positive', () => {
    for (const def of PEST_CATALOG) {
      expect(def.min_gap_weeks).toBeGreaterThan(0);
    }
  });

  it('all pest visual strings are non-empty', () => {
    for (const def of PEST_CATALOG) {
      expect(def.visual.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Zone schema — pest_event_weights
// ---------------------------------------------------------------------------

describe('ClimateZoneSchema pest_event_weights', () => {
  it('validates zone_8a.json with pest_event_weights', () => {
    const result = ClimateZoneSchema.safeParse(zone8aData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pest_event_weights).toBeDefined();
      expect(typeof result.data.pest_event_weights).toBe('object');
    }
  });

  it('defaults pest_event_weights to {} when absent from JSON', () => {
    const { pest_event_weights: _omitted, ...withoutPests } = zone8aData as {
      pest_event_weights?: Record<string, number>;
      [key: string]: unknown;
    };
    const result = ClimateZoneSchema.safeParse(withoutPests);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pest_event_weights).toEqual({});
    }
  });

  it('rejects negative pest weights', () => {
    const bad = { ...zone8aData, pest_event_weights: { aphids: -0.1 } };
    expect(ClimateZoneSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deterministic output
// ---------------------------------------------------------------------------

describe('deterministic pest generation', () => {
  it('produces identical output for the same seed', () => {
    const a = generate(zone8a, 12345);
    const b = generate(zone8a, 12345);
    expect(a).toEqual(b);
  });

  it('produces identical output across multiple calls with the same seed', () => {
    const results = Array.from({ length: 5 }, () => generate(zone8a, 99999));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  it('produces different events for different seeds (statistical)', () => {
    // With zone8a's probabilities, different seeds should yield different schedules
    let foundDifference = false;
    for (let s = 0; s < 20; s++) {
      const a = generate(zone8a, s);
      const b = generate(zone8a, s + 1000);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        foundDifference = true;
        break;
      }
    }
    expect(foundDifference).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('returns empty array when zone has no pest_event_weights', () => {
    expect(generate(ZONE_NO_PESTS)).toEqual([]);
  });

  it('returns empty array when all pest weights are zero', () => {
    const zone: ClimateZone = { ...zone8a, pest_event_weights: { aphids: 0 } };
    expect(generate(zone)).toEqual([]);
  });

  it('silently ignores unknown pest IDs in zone JSON', () => {
    // Should return [] rather than throw
    const events = generate(ZONE_UNKNOWN_PEST);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Event structure
// ---------------------------------------------------------------------------

describe('event structure', () => {
  it('each event has all required PestEvent fields', () => {
    const events = generate(zone8a, 42);
    // zone8a has pest weights — at least some events should appear across seeds
    // Run a few seeds to ensure we get events
    let found = false;
    for (let s = 0; s < 50; s++) {
      const evts = generate(zone8a, s);
      if (evts.length > 0) {
        found = true;
        for (const e of evts) {
          expect(typeof e.pest_id).toBe('string');
          expect(Array.isArray(e.target_families)).toBe(true);
          expect(typeof e.arrival_week).toBe('number');
          expect(typeof e.severity).toBe('number');
          expect(typeof e.duration_weeks).toBe('number');
          expect(Array.isArray(e.countered_by)).toBe(true);
          expect(typeof e.visual).toBe('string');
        }
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('severity is in [0, 1]', () => {
    for (let s = 0; s < 100; s++) {
      for (const e of generate(zone8a, s)) {
        expect(e.severity).toBeGreaterThanOrEqual(0);
        expect(e.severity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('duration_weeks is at least 1', () => {
    for (let s = 0; s < 100; s++) {
      for (const e of generate(zone8a, s)) {
        expect(e.duration_weeks).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('arrival_week is in [0, 29]', () => {
    for (let s = 0; s < 100; s++) {
      for (const e of generate(zone8a, s)) {
        expect(e.arrival_week).toBeGreaterThanOrEqual(0);
        expect(e.arrival_week).toBeLessThan(30);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Timing constraints
// ---------------------------------------------------------------------------

describe('timing constraints', () => {
  it('pest events never arrive before their earliest_week', () => {
    // With weight=1.0 aphids have earliest_week=5, so no events before week 5
    const events = generate(ZONE_APHIDS_ONLY, 42);
    const aphidDef = PEST_CATALOG.find((p) => p.pest_id === 'aphids')!;
    for (const e of events) {
      expect(e.arrival_week).toBeGreaterThanOrEqual(aphidDef.earliest_week);
    }
  });

  it('output is sorted by arrival_week (ascending)', () => {
    for (let s = 0; s < 50; s++) {
      const events = generate(zone8a, s);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].arrival_week).toBeGreaterThanOrEqual(events[i - 1].arrival_week);
      }
    }
  });

  it('same pest type never overlaps itself (gap enforced)', () => {
    // With weight=1.0, aphids arrive every eligible week — but gap enforcement
    // should prevent the same pest from being active twice simultaneously
    const events = generate(ZONE_APHIDS_ONLY, 42);
    const aphidEvents = events.filter((e) => e.pest_id === 'aphids');
    const aphidDef = PEST_CATALOG.find((p) => p.pest_id === 'aphids')!;

    for (let i = 1; i < aphidEvents.length; i++) {
      const prev = aphidEvents[i - 1];
      const curr = aphidEvents[i];
      // Current arrival must be after previous event ends plus min_gap
      const earliestNext = prev.arrival_week + prev.duration_weeks + aphidDef.min_gap_weeks;
      expect(curr.arrival_week).toBeGreaterThanOrEqual(earliestNext);
    }
  });
});

// ---------------------------------------------------------------------------
// Zone8a integration
// ---------------------------------------------------------------------------

describe('zone_8a pest generation', () => {
  it('generates at least one pest event over many seeds', () => {
    let found = false;
    for (let s = 0; s < 100; s++) {
      if (generate(zone8a, s).length > 0) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('only produces pests from the zone pest_event_weights keys', () => {
    const allowedIds = new Set(Object.keys(zone8a.pest_event_weights ?? {}));
    for (let s = 0; s < 50; s++) {
      for (const e of generate(zone8a, s)) {
        expect(allowedIds.has(e.pest_id)).toBe(true);
      }
    }
  });

  it('target_families match catalog definitions for each pest', () => {
    const defMap = new Map(PEST_CATALOG.map((p) => [p.pest_id, p]));
    for (let s = 0; s < 50; s++) {
      for (const e of generate(zone8a, s)) {
        const def = defMap.get(e.pest_id);
        expect(def).toBeDefined();
        expect(e.target_families).toEqual(def!.target_families);
      }
    }
  });

  it('different game seeds produce statistically different pest schedules', () => {
    const seedA = generate(zone8a, 1);
    const seedB = generate(zone8a, 9999);
    // Both might be empty (low probability), but if both have events they should differ
    if (seedA.length > 0 && seedB.length > 0) {
      expect(JSON.stringify(seedA)).not.toEqual(JSON.stringify(seedB));
    }
  });
});

// ---------------------------------------------------------------------------
// Independence from weather RNG
// ---------------------------------------------------------------------------

describe('pest RNG independence from weather', () => {
  it('pest output is identical whether or not weather was generated first', () => {
    // generateSeasonPests creates its own RNG from seed ^ PEST_SEED_MASK,
    // so calling generateSeasonWeather first must not affect pest output.
    const pestsOnly = generateSeasonPests(zone8a, 777);

    // Consume the weather RNG stream for the same seed
    generateSeasonWeather(zone8a, 777);
    // Pest output must be identical — pest uses an independent seed
    const pestsAfterWeather = generateSeasonPests(zone8a, 777);

    expect(pestsOnly).toEqual(pestsAfterWeather);
  });
});
