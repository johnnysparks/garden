import { describe, it, expect } from 'vitest';
import {
  generateSeasonWeather,
  frostProbability,
  ClimateZoneSchema,
  type ClimateZone,
  type WeekWeather,
} from '../../src/lib/engine/weather-gen.js';
import zone8aData from '../../src/lib/data/zones/zone_8a.json';

// ---------------------------------------------------------------------------
// Load and validate the starter zone
// ---------------------------------------------------------------------------

const zone8a: ClimateZone = ClimateZoneSchema.parse(zone8aData);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateWithSeed(seed: number): WeekWeather[] {
  return generateSeasonWeather(zone8a, seed);
}

// ---------------------------------------------------------------------------
// Zone schema validation
// ---------------------------------------------------------------------------

describe('ClimateZoneSchema', () => {
  it('validates zone_8a.json successfully', () => {
    const result = ClimateZoneSchema.safeParse(zone8aData);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rejects zone with wrong number of weeks', () => {
    const bad = { ...zone8aData, avg_temps_by_week: [10, 11, 12] };
    expect(ClimateZoneSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects zone with invalid precip pattern', () => {
    const bad = { ...zone8aData, precip_pattern: 'monsoon' };
    expect(ClimateZoneSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative temp variance', () => {
    const bad = { ...zone8aData, temp_variance: -1 };
    expect(ClimateZoneSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects humidity outside [0,1]', () => {
    const bad = { ...zone8aData, humidity_baseline: 1.5 };
    expect(ClimateZoneSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deterministic output
// ---------------------------------------------------------------------------

describe('deterministic weather generation', () => {
  it('produces identical output for the same seed', () => {
    const a = generateWithSeed(12345);
    const b = generateWithSeed(12345);
    expect(a).toEqual(b);
  });

  it('produces identical output across multiple calls', () => {
    const results = Array.from({ length: 5 }, () => generateWithSeed(99999));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  it('produces different output for different seeds', () => {
    const a = generateWithSeed(1);
    const b = generateWithSeed(2);
    // At least some weeks should differ
    const diffs = a.filter((w, i) => w.temp_high_c !== b[i].temp_high_c);
    expect(diffs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Season structure
// ---------------------------------------------------------------------------

describe('season structure', () => {
  const season = generateWithSeed(42);

  it('generates exactly 30 weeks', () => {
    expect(season).toHaveLength(30);
  });

  it('weeks are numbered 0-29', () => {
    season.forEach((w, i) => {
      expect(w.week).toBe(i);
    });
  });

  it('temp_high_c is always >= temp_low_c', () => {
    season.forEach((w) => {
      expect(w.temp_high_c).toBeGreaterThanOrEqual(w.temp_low_c);
    });
  });

  it('precipitation is non-negative', () => {
    season.forEach((w) => {
      expect(w.precipitation_mm).toBeGreaterThanOrEqual(0);
    });
  });

  it('humidity is in [0, 1]', () => {
    season.forEach((w) => {
      expect(w.humidity).toBeGreaterThanOrEqual(0);
      expect(w.humidity).toBeLessThanOrEqual(1);
    });
  });

  it('wind is a valid level', () => {
    const valid = ['calm', 'light', 'moderate', 'strong'];
    season.forEach((w) => {
      expect(valid).toContain(w.wind);
    });
  });

  it('frost is a boolean', () => {
    season.forEach((w) => {
      expect(typeof w.frost).toBe('boolean');
    });
  });

  it('special is null or a valid event object', () => {
    const validTypes = ['heatwave', 'drought', 'heavy_rain', 'hail', 'early_frost', 'indian_summer'];
    season.forEach((w) => {
      if (w.special !== null) {
        expect(validTypes).toContain(w.special.type);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Temperature curves follow zone profile within variance
// ---------------------------------------------------------------------------

describe('temperature curves follow zone profile', () => {
  // Run many seeds and check that average temps track the zone curve
  const NUM_RUNS = 50;
  const seeds = Array.from({ length: NUM_RUNS }, (_, i) => i * 137 + 1);

  it('average highs per week are within 2x variance of zone profile', () => {
    // Collect all runs
    const runs = seeds.map((s) => generateWithSeed(s));
    const maxDeviation = zone8a.temp_variance * 2;

    for (let w = 0; w < 30; w++) {
      const avgHigh = runs.reduce((sum, r) => sum + r[w].temp_high_c, 0) / NUM_RUNS;
      const expected = zone8a.avg_temps_by_week[w];
      // Heatwave / indian_summer can push averages up, so allow generous tolerance
      expect(Math.abs(avgHigh - expected)).toBeLessThan(maxDeviation + 2);
    }
  });

  it('individual week temps stay within reasonable bounds of zone curve', () => {
    // For any single run, temps should not deviate wildly (4x variance = ~4σ)
    const season = generateWithSeed(42);
    const maxBound = zone8a.temp_variance * 4 + 10; // generous for events

    season.forEach((w, i) => {
      const expected = zone8a.avg_temps_by_week[i];
      expect(Math.abs(w.temp_high_c - expected)).toBeLessThan(maxBound);
    });
  });

  it('mid-season temps are higher than early/late season', () => {
    // Average across many runs to smooth out noise
    const runs = seeds.map((s) => generateWithSeed(s));

    const avgTemp = (weekIdx: number) =>
      runs.reduce((sum, r) => sum + r[weekIdx].temp_high_c, 0) / NUM_RUNS;

    const earlyAvg = (avgTemp(0) + avgTemp(1) + avgTemp(2)) / 3;
    const midAvg = (avgTemp(13) + avgTemp(14) + avgTemp(15)) / 3;
    const lateAvg = (avgTemp(27) + avgTemp(28) + avgTemp(29)) / 3;

    expect(midAvg).toBeGreaterThan(earlyAvg);
    expect(midAvg).toBeGreaterThan(lateAvg);
  });
});

// ---------------------------------------------------------------------------
// Frost probability — sigmoid curve
// ---------------------------------------------------------------------------

describe('frostProbability', () => {
  it('returns 0.5 exactly at firstFrostWeekAvg', () => {
    expect(frostProbability(25, 25)).toBeCloseTo(0.5, 5);
  });

  it('returns values near 0 well before first frost', () => {
    // 10 weeks before first frost
    expect(frostProbability(15, 25)).toBeLessThan(0.01);
  });

  it('returns values near 1 well after first frost', () => {
    // 10 weeks after first frost
    expect(frostProbability(35, 25)).toBeGreaterThan(0.99);
  });

  it('increases monotonically', () => {
    for (let w = 0; w < 29; w++) {
      expect(frostProbability(w + 1, 25)).toBeGreaterThanOrEqual(frostProbability(w, 25));
    }
  });

  it('steepness parameter controls ramp speed', () => {
    // Steeper sigmoid = faster transition from 0 to 1
    const gentle = frostProbability(23, 25, 0.3);
    const steep = frostProbability(23, 25, 1.0);
    // Both below 0.5, but steep should be closer to 0
    expect(steep).toBeLessThan(gentle);
  });

  it('default steepness is 0.5 (per spec)', () => {
    const withDefault = frostProbability(20, 25);
    const withExplicit = frostProbability(20, 25, 0.5);
    expect(withDefault).toBe(withExplicit);
  });
});

describe('frost in generated weather', () => {
  it('no frost during frost-free window (excluding early_frost events)', () => {
    // Test across many seeds
    for (let seed = 0; seed < 100; seed++) {
      const season = generateWithSeed(seed);
      for (let w = zone8a.frost_free_weeks[0]; w <= zone8a.frost_free_weeks[1]; w++) {
        if (season[w].special?.type === 'early_frost') continue;
        expect(season[w].frost).toBe(false);
      }
    }
  });

  it('frost probability increases in late season across many runs', () => {
    const NUM_RUNS = 500;
    const frostCounts = new Array(30).fill(0);

    for (let seed = 0; seed < NUM_RUNS; seed++) {
      const season = generateWithSeed(seed);
      season.forEach((w, i) => {
        if (w.frost) frostCounts[i]++;
      });
    }

    // Convert to rates
    const frostRates = frostCounts.map((c) => c / NUM_RUNS);

    // Frost rate at week 28 should be higher than at week 25
    expect(frostRates[28]).toBeGreaterThan(frostRates[25]);

    // Frost rate mid-season (week 15) should be near 0
    expect(frostRates[15]).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// Special events
// ---------------------------------------------------------------------------

describe('special events', () => {
  it('heatwave events have positive temp_bonus and duration', () => {
    for (let seed = 0; seed < 200; seed++) {
      const season = generateWithSeed(seed);
      season.forEach((w) => {
        if (w.special?.type === 'heatwave') {
          expect(w.special.temp_bonus).toBeGreaterThan(0);
          expect(w.special.duration_weeks).toBeGreaterThanOrEqual(1);
        }
      });
    }
  });

  it('drought events have positive moisture_penalty and duration', () => {
    for (let seed = 0; seed < 200; seed++) {
      const season = generateWithSeed(seed);
      season.forEach((w) => {
        if (w.special?.type === 'drought') {
          expect(w.special.moisture_penalty).toBeGreaterThan(0);
          expect(w.special.duration_weeks).toBeGreaterThanOrEqual(1);
        }
      });
    }
  });

  it('hail events have damage_severity in valid range', () => {
    for (let seed = 0; seed < 200; seed++) {
      const season = generateWithSeed(seed);
      season.forEach((w) => {
        if (w.special?.type === 'hail') {
          expect(w.special.damage_severity).toBeGreaterThan(0);
          expect(w.special.damage_severity).toBeLessThanOrEqual(1);
        }
      });
    }
  });

  it('at least some seeds produce special events', () => {
    let foundEvent = false;
    for (let seed = 0; seed < 100; seed++) {
      const season = generateWithSeed(seed);
      if (season.some((w) => w.special !== null)) {
        foundEvent = true;
        break;
      }
    }
    expect(foundEvent).toBe(true);
  });

  it('early_frost events only appear after week 16', () => {
    for (let seed = 0; seed < 300; seed++) {
      const season = generateWithSeed(seed);
      season.forEach((w) => {
        if (w.special?.type === 'early_frost') {
          expect(w.week).toBeGreaterThanOrEqual(16);
        }
      });
    }
  });
});
