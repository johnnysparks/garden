/**
 * Tests for src/cli/data-loader.ts
 *
 * Exercises the Node.js fs-based loaders for species, zones, and amendments.
 * These tests hit the real JSON files on disk — no mocking — which validates
 * both the loader logic and that all shipped data files pass Zod validation.
 */

import { describe, it, expect } from 'vitest';
import {
  getSpeciesLookup,
  getAllSpecies,
  getAllSpeciesIds,
  getAllAmendments,
  getAmendment,
  getZone,
  getAllZoneIds,
  type AmendmentDef,
} from '../../src/cli/data-loader.js';

// ── Species ──────────────────────────────────────────────────────────────────

describe('getSpeciesLookup', () => {
  it('returns a function', () => {
    const lookup = getSpeciesLookup();
    expect(typeof lookup).toBe('function');
  });

  it('returns a species object for a known id', () => {
    const lookup = getSpeciesLookup();
    const tomato = lookup('tomato_cherokee_purple');
    expect(tomato).toBeDefined();
    expect(tomato?.id).toBe('tomato_cherokee_purple');
  });

  it('returns undefined for an unknown id', () => {
    const lookup = getSpeciesLookup();
    expect(lookup('does_not_exist')).toBeUndefined();
  });

  it('is idempotent — calling twice returns the same result', () => {
    const a = getSpeciesLookup();
    const b = getSpeciesLookup();
    expect(a('basil_genovese')).toEqual(b('basil_genovese'));
  });
});

describe('getAllSpecies', () => {
  it('returns an array', () => {
    const species = getAllSpecies();
    expect(Array.isArray(species)).toBe(true);
  });

  it('contains at least the known shipped species', () => {
    const ids = getAllSpecies().map((s) => s.id);
    expect(ids).toContain('tomato_cherokee_purple');
    expect(ids).toContain('basil_genovese');
  });

  it('every species has required fields', () => {
    for (const s of getAllSpecies()) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.common_name).toBe('string');
      expect(s.growth).toBeDefined();
      expect(s.needs).toBeDefined();
      expect(s.visual).toBeDefined();
      expect(s.lore).toBeDefined();
    }
  });

  it('each species id uses snake_case', () => {
    for (const s of getAllSpecies()) {
      expect(s.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('every species has at least one growth stage', () => {
    for (const s of getAllSpecies()) {
      expect(s.growth.stages.length).toBeGreaterThan(0);
    }
  });
});

describe('getAllSpeciesIds', () => {
  it('returns an array of strings', () => {
    const ids = getAllSpeciesIds();
    expect(Array.isArray(ids)).toBe(true);
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });

  it('includes known species ids', () => {
    const ids = getAllSpeciesIds();
    expect(ids).toContain('tomato_cherokee_purple');
    expect(ids).toContain('basil_genovese');
  });

  it('is consistent with getAllSpecies', () => {
    const idsFromIds = new Set(getAllSpeciesIds());
    const idsFromSpecies = new Set(getAllSpecies().map((s) => s.id));
    expect(idsFromIds).toEqual(idsFromSpecies);
  });

  it('each id resolves via getSpeciesLookup', () => {
    const lookup = getSpeciesLookup();
    for (const id of getAllSpeciesIds()) {
      expect(lookup(id)).toBeDefined();
    }
  });
});

// ── Amendments ───────────────────────────────────────────────────────────────

describe('getAllAmendments', () => {
  it('returns an array', () => {
    expect(Array.isArray(getAllAmendments())).toBe(true);
  });

  it('contains the known shipped amendments', () => {
    const ids = getAllAmendments().map((a) => a.id);
    expect(ids).toContain('compost');
    expect(ids).toContain('lime');
    expect(ids).toContain('fertilizer');
  });

  it('every amendment has required fields with correct types', () => {
    for (const a of getAllAmendments()) {
      expect(typeof a.id).toBe('string');
      expect(a.id.length).toBeGreaterThan(0);
      expect(typeof a.name).toBe('string');
      expect(typeof a.effects).toBe('object');
      expect(a.effects).not.toBeNull();
      expect(typeof a.delay_weeks).toBe('number');
      expect(a.delay_weeks).toBeGreaterThanOrEqual(0);
    }
  });

  it('amendment effects are numeric values', () => {
    for (const a of getAllAmendments()) {
      for (const value of Object.values(a.effects)) {
        expect(typeof value).toBe('number');
      }
    }
  });

  it('is idempotent — multiple calls return equivalent data', () => {
    const first = getAllAmendments();
    const second = getAllAmendments();
    expect(first).toEqual(second);
  });
});

describe('getAmendment', () => {
  it('returns the amendment for a known id', () => {
    const compost = getAmendment('compost');
    expect(compost).toBeDefined();
    expect(compost?.id).toBe('compost');
    expect(compost?.name).toBe('Compost');
  });

  it('returns undefined for an unknown id', () => {
    expect(getAmendment('moon_dust')).toBeUndefined();
  });

  it('compost has expected effect keys', () => {
    const compost = getAmendment('compost') as AmendmentDef;
    expect(compost.effects).toHaveProperty('organic_matter');
    expect(compost.effects).toHaveProperty('nitrogen');
  });

  it('lime has a positive ph effect', () => {
    const lime = getAmendment('lime') as AmendmentDef;
    expect(lime.effects['ph']).toBeGreaterThan(0);
  });

  it('sulfur has a negative ph effect', () => {
    const sulfur = getAmendment('sulfur') as AmendmentDef;
    expect(sulfur.effects['ph']).toBeLessThan(0);
  });

  it('result is consistent with getAllAmendments', () => {
    for (const a of getAllAmendments()) {
      expect(getAmendment(a.id)).toEqual(a);
    }
  });
});

// ── Zones ────────────────────────────────────────────────────────────────────

describe('getZone', () => {
  it('returns a ClimateZone for a known id', () => {
    const zone = getZone('zone_8a');
    expect(zone).toBeDefined();
    expect(zone?.id).toBe('zone_8a');
  });

  it('returns undefined for an unknown id', () => {
    expect(getZone('zone_99z')).toBeUndefined();
  });

  it('the zone has all required ClimateZone fields', () => {
    const zone = getZone('zone_8a')!;
    expect(typeof zone.id).toBe('string');
    expect(typeof zone.name).toBe('string');
    expect(Array.isArray(zone.avg_temps_by_week)).toBe(true);
    expect(zone.avg_temps_by_week).toHaveLength(30);
    expect(typeof zone.temp_variance).toBe('number');
    expect(typeof zone.precip_pattern).toBe('string');
    expect(Array.isArray(zone.frost_free_weeks)).toBe(true);
    expect(typeof zone.first_frost_week_avg).toBe('number');
    expect(typeof zone.humidity_baseline).toBe('number');
    expect(typeof zone.special_event_weights).toBe('object');
    expect(typeof zone.pest_event_weights).toBe('object');
  });

  it('zone_8a has valid precip_pattern', () => {
    const zone = getZone('zone_8a')!;
    const valid = ['winter_wet', 'summer_wet', 'even', 'arid'];
    expect(valid).toContain(zone.precip_pattern);
  });

  it('zone_8a humidity_baseline is in [0, 1]', () => {
    const zone = getZone('zone_8a')!;
    expect(zone.humidity_baseline).toBeGreaterThanOrEqual(0);
    expect(zone.humidity_baseline).toBeLessThanOrEqual(1);
  });

  it('is idempotent — calling twice returns equal objects', () => {
    expect(getZone('zone_8a')).toEqual(getZone('zone_8a'));
  });
});

describe('getAllZoneIds', () => {
  it('returns an array of strings', () => {
    const ids = getAllZoneIds();
    expect(Array.isArray(ids)).toBe(true);
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });

  it('includes zone_8a', () => {
    expect(getAllZoneIds()).toContain('zone_8a');
  });

  it('each id resolves via getZone', () => {
    for (const id of getAllZoneIds()) {
      expect(getZone(id)).toBeDefined();
    }
  });

  it('is consistent with getZone — no dangling ids', () => {
    for (const id of getAllZoneIds()) {
      const zone = getZone(id);
      expect(zone?.id).toBe(id);
    }
  });
});
