import { describe, it, expect } from 'vitest';
import {
  generateHypotheses,
  computeTagSimilarity,
  CONDITION_DATABASE,
  SIMILAR_CONDITIONS,
  type DiagnosisHypothesis,
} from '../../src/lib/engine/diagnosis.js';
import { TOMATO, BASIL, makeSpeciesLookup } from './fixtures.js';
import { createWorld } from '../../src/lib/engine/ecs/world.js';
import { createRng } from '../../src/lib/engine/rng.js';
import type { Entity, ActiveCondition } from '../../src/lib/engine/ecs/components.js';
import type { PlantSpecies } from '../../src/lib/data/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a tomato entity with the given active conditions. */
function makeTomatoEntity(conditions: ActiveCondition[]): Entity {
  return {
    species: { speciesId: 'tomato_cherokee_purple' },
    growth: { progress: 0.5, stage: 'vegetative', rate_modifier: 1 },
    health: { value: 0.8, stress: 0.4 },
    activeConditions: { conditions },
    plotSlot: { row: 0, col: 0 },
  };
}

/** Create a basil entity with the given active conditions. */
function makeBasilEntity(conditions: ActiveCondition[]): Entity {
  return {
    species: { speciesId: 'basil_genovese' },
    growth: { progress: 0.5, stage: 'vegetative', rate_modifier: 1 },
    health: { value: 0.7, stress: 0.5 },
    activeConditions: { conditions },
    plotSlot: { row: 0, col: 1 },
  };
}

/**
 * TOMATO_FULL is a version of the TOMATO fixture with both vulnerabilities
 * (early_blight + blossom_end_rot) matching the real species JSON.
 */
const TOMATO_FULL: PlantSpecies = {
  ...TOMATO,
  vulnerabilities: [
    {
      condition_id: 'early_blight',
      susceptibility: 0.6,
      triggers: [
        { type: 'humidity_high', threshold: 0.7 },
        { type: 'crowding', threshold: 0.8 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'lower_leaf_spots', description: 'Dark concentric rings appearing on lowest leaves.', reversible: true },
          { week: 2, visual_overlay: 'spreading_spots_yellowing', description: 'Spots spread upward. Affected leaves yellow and drop.', reversible: true },
          { week: 4, visual_overlay: 'stem_lesions', description: 'Dark lesions on stems. Fruit may show leathery dark patches.', reversible: false },
        ],
        weeks_to_death: 8,
        spreads: true,
        spread_radius: 1,
      },
    },
    {
      condition_id: 'blossom_end_rot',
      susceptibility: 0.4,
      triggers: [
        { type: 'nutrient_deficiency', threshold: 0.5 },
        { type: 'overwater', threshold: 0.7 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'fruit_base_discolor', description: 'Small water-soaked spot at blossom end of green fruit.', reversible: true },
          { week: 1, visual_overlay: 'fruit_base_rot', description: 'Spot enlarges to dark, leathery, sunken area.', reversible: false },
        ],
        weeks_to_death: null,
        spreads: false,
        spread_radius: 0,
      },
    },
  ],
};

/**
 * BASIL_FULL mirrors the real basil species JSON with downy_mildew
 * and fusarium_wilt vulnerabilities.
 */
const BASIL_FULL: PlantSpecies = {
  ...BASIL,
  vulnerabilities: [
    {
      condition_id: 'downy_mildew',
      susceptibility: 0.7,
      triggers: [
        { type: 'humidity_high', threshold: 0.8 },
        { type: 'temp_low', threshold: 0.4 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'interveinal_yellowing', description: 'Yellowing between leaf veins on upper surface.', reversible: true },
          { week: 1, visual_overlay: 'leaf_browning', description: 'Yellow patches turn brown and necrotic.', reversible: false },
          { week: 3, visual_overlay: 'stem_blackening', description: 'Stems darken. Plant collapses.', reversible: false },
        ],
        weeks_to_death: 5,
        spreads: true,
        spread_radius: 2,
      },
    },
    {
      condition_id: 'fusarium_wilt',
      susceptibility: 0.3,
      triggers: [
        { type: 'temp_high', threshold: 0.7 },
        { type: 'overwater', threshold: 0.6 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'asymmetric_wilt', description: 'One side of the plant wilts while the other looks fine.', reversible: false },
          { week: 2, visual_overlay: 'total_wilt', description: 'Entire plant wilts despite adequate water.', reversible: false },
        ],
        weeks_to_death: 4,
        spreads: false,
        spread_radius: 0,
      },
    },
  ],
};

// ── computeTagSimilarity ─────────────────────────────────────────────

describe('computeTagSimilarity', () => {
  it('returns 0 for empty arrays', () => {
    expect(computeTagSimilarity([], [])).toBe(0);
    expect(computeTagSimilarity(['a'], [])).toBe(0);
    expect(computeTagSimilarity([], ['b'])).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(computeTagSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns correct Jaccard for partial overlap', () => {
    // intersection = {b} = 1, union = {a, b, c} = 3 → 1/3
    const result = computeTagSimilarity(['a', 'b'], ['b', 'c']);
    expect(result).toBeCloseTo(1 / 3, 5);
  });

  it('returns 0 for disjoint sets', () => {
    expect(computeTagSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('handles duplicate tags within a single array', () => {
    // Deduplication is implicit via Set — duplicates don't inflate scores
    const result = computeTagSimilarity(['a', 'a', 'b'], ['a', 'c']);
    // setA = {a, b}, setB = {a, c}, intersection = 1, union = 3
    expect(result).toBeCloseTo(1 / 3, 5);
  });
});

// ── generateHypotheses ───────────────────────────────────────────────

describe('generateHypotheses', () => {
  const rng = createRng(42);

  // ── Empty / no conditions ──────────────────────────────────────

  it('returns empty result for a plant with no active conditions', () => {
    const plant = makeTomatoEntity([]);
    const result = generateHypotheses(plant, TOMATO_FULL, rng);

    expect(result.plantSpeciesId).toBe('tomato_cherokee_purple');
    expect(result.observations).toHaveLength(0);
    expect(result.hypotheses).toHaveLength(0);
  });

  it('returns empty result when activeConditions component is missing', () => {
    const plant: Entity = {
      species: { speciesId: 'tomato_cherokee_purple' },
      plotSlot: { row: 0, col: 0 },
    };
    const result = generateHypotheses(plant, TOMATO_FULL, rng);
    expect(result.hypotheses).toHaveLength(0);
  });

  // ── Single active condition: early blight on tomato ────────────

  describe('tomato with early blight (stage 0)', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 10, current_stage: 0, severity: 0.1 },
    ]);

    it('includes the true condition in hypotheses', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      const earlyBlight = result.hypotheses.find(
        (h) => h.conditionId === 'early_blight',
      );
      expect(earlyBlight).toBeDefined();
      expect(earlyBlight!.fromSpeciesVuln).toBe(true);
    });

    it('provides observations from the active condition stage', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0]).toContain('concentric rings');
    });

    it('generates at least 2 hypotheses (true + red herring)', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      expect(result.hypotheses.length).toBeGreaterThanOrEqual(2);
    });

    it('caps hypotheses at 5', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      expect(result.hypotheses.length).toBeLessThanOrEqual(5);
    });

    it('includes red herrings from SIMILAR_CONDITIONS', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      const externalHypotheses = result.hypotheses.filter(
        (h) => !h.fromSpeciesVuln,
      );
      expect(externalHypotheses.length).toBeGreaterThanOrEqual(1);
      // Red herrings for early_blight should come from: late_blight, septoria_leaf_spot
      const redHerringIds = externalHypotheses.map((h) => h.conditionId);
      const expectedSimilar = SIMILAR_CONDITIONS['early_blight'];
      for (const id of redHerringIds) {
        expect(expectedSimilar).toContain(id);
      }
    });

    it('sorts hypotheses by confidence descending', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      for (let i = 1; i < result.hypotheses.length; i++) {
        expect(result.hypotheses[i - 1].confidence).toBeGreaterThanOrEqual(
          result.hypotheses[i].confidence,
        );
      }
    });

    it('gives early-stage true condition moderate confidence (< 0.7)', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      const earlyBlight = result.hypotheses.find(
        (h) => h.conditionId === 'early_blight',
      )!;
      // Stage 0, low severity → confidence should be moderate
      expect(earlyBlight.confidence).toBeGreaterThan(0.3);
      expect(earlyBlight.confidence).toBeLessThan(0.7);
    });
  });

  // ── Advanced stage: higher confidence ──────────────────────────

  describe('tomato with early blight (advanced stage)', () => {
    it('gives higher confidence at later symptom stages', () => {
      const earlyPlant = makeTomatoEntity([
        { conditionId: 'early_blight', onset_week: 6, current_stage: 0, severity: 0.1 },
      ]);
      const latePlant = makeTomatoEntity([
        { conditionId: 'early_blight', onset_week: 6, current_stage: 2, severity: 0.5 },
      ]);

      const earlyResult = generateHypotheses(earlyPlant, TOMATO_FULL, createRng(42));
      const lateResult = generateHypotheses(latePlant, TOMATO_FULL, createRng(42));

      const earlyConf = earlyResult.hypotheses.find(
        (h) => h.conditionId === 'early_blight',
      )!.confidence;
      const lateConf = lateResult.hypotheses.find(
        (h) => h.conditionId === 'early_blight',
      )!.confidence;

      expect(lateConf).toBeGreaterThan(earlyConf);
    });

    it('provides the advanced stage symptom description', () => {
      const plant = makeTomatoEntity([
        { conditionId: 'early_blight', onset_week: 6, current_stage: 2, severity: 0.5 },
      ]);
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      expect(result.observations[0]).toContain('lesions on stems');
    });
  });

  // ── Multiple active conditions ─────────────────────────────────

  describe('tomato with two active conditions', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 8, current_stage: 1, severity: 0.2 },
      { conditionId: 'blossom_end_rot', onset_week: 10, current_stage: 0, severity: 0.1 },
    ]);

    it('produces observations for both conditions', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      expect(result.observations).toHaveLength(2);
    });

    it('includes both true conditions in hypotheses', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      const ids = result.hypotheses.map((h) => h.conditionId);
      expect(ids).toContain('early_blight');
      expect(ids).toContain('blossom_end_rot');
    });

    it('still adds red herrings alongside true conditions', () => {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
      expect(result.hypotheses.length).toBeGreaterThan(2);
    });
  });

  // ── Basil: downy mildew ────────────────────────────────────────

  describe('basil with downy mildew', () => {
    const plant = makeBasilEntity([
      { conditionId: 'downy_mildew', onset_week: 12, current_stage: 0, severity: 0.15 },
    ]);

    it('includes downy_mildew as the true condition', () => {
      const result = generateHypotheses(plant, BASIL_FULL, createRng(99));
      const dm = result.hypotheses.find(
        (h) => h.conditionId === 'downy_mildew',
      );
      expect(dm).toBeDefined();
      expect(dm!.fromSpeciesVuln).toBe(true);
    });

    it('may include powdery_mildew or iron_chlorosis as red herrings', () => {
      const result = generateHypotheses(plant, BASIL_FULL, createRng(99));
      const externalIds = result.hypotheses
        .filter((h) => !h.fromSpeciesVuln)
        .map((h) => h.conditionId);
      // downy_mildew similar conditions: powdery_mildew, iron_chlorosis
      const validRedHerrings = ['powdery_mildew', 'iron_chlorosis'];
      for (const id of externalIds) {
        expect(validRedHerrings).toContain(id);
      }
    });
  });

  // ── Basil: fusarium wilt ───────────────────────────────────────

  describe('basil with fusarium wilt', () => {
    const plant = makeBasilEntity([
      { conditionId: 'fusarium_wilt', onset_week: 14, current_stage: 0, severity: 0.1 },
    ]);

    it('includes fusarium_wilt and possible red herrings', () => {
      const result = generateHypotheses(plant, BASIL_FULL, createRng(7));
      const fw = result.hypotheses.find(
        (h) => h.conditionId === 'fusarium_wilt',
      );
      expect(fw).toBeDefined();
      expect(result.hypotheses.length).toBeGreaterThanOrEqual(2);
    });

    it('red herrings for fusarium come from transplant_shock or overwatering', () => {
      const result = generateHypotheses(plant, BASIL_FULL, createRng(7));
      const externalIds = result.hypotheses
        .filter((h) => !h.fromSpeciesVuln)
        .map((h) => h.conditionId);
      const validRedHerrings = ['transplant_shock', 'overwatering'];
      for (const id of externalIds) {
        expect(validRedHerrings).toContain(id);
      }
    });
  });

  // ── Red herring constraints ────────────────────────────────────

  it('never duplicates a condition across hypotheses', () => {
    // Use a plant with an active condition whose species also has it as a vuln
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 8, current_stage: 0, severity: 0.1 },
    ]);

    for (let seed = 0; seed < 20; seed++) {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(seed));
      const ids = result.hypotheses.map((h) => h.conditionId);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });

  it('red herring confidence is always ≤ 0.55', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 8, current_stage: 1, severity: 0.3 },
    ]);

    for (let seed = 0; seed < 20; seed++) {
      const result = generateHypotheses(plant, TOMATO_FULL, createRng(seed));
      for (const h of result.hypotheses) {
        if (!h.fromSpeciesVuln) {
          expect(h.confidence).toBeLessThanOrEqual(0.55);
        }
      }
    }
  });

  // ── Hypothesis metadata ────────────────────────────────────────

  it('populates conditionName and description from CONDITION_DATABASE', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 8, current_stage: 0, severity: 0.1 },
    ]);
    const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
    const eb = result.hypotheses.find((h) => h.conditionId === 'early_blight')!;
    expect(eb.conditionName).toBe('Early Blight');
    expect(eb.description).toContain('target-shaped spots');
  });

  it('provides symptomDescription for red herrings from keyVisual', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 8, current_stage: 0, severity: 0.1 },
    ]);
    const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
    for (const h of result.hypotheses) {
      expect(h.symptomDescription.length).toBeGreaterThan(0);
    }
  });

  // ── Confidence ranges ──────────────────────────────────────────

  it('all confidences are in [0, 1]', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 6, current_stage: 2, severity: 1.0 },
    ]);
    const result = generateHypotheses(plant, TOMATO_FULL, createRng(42));
    for (const h of result.hypotheses) {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });

  // ── Determinism ────────────────────────────────────────────────

  it('produces identical results for the same seed', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'early_blight', onset_week: 8, current_stage: 1, severity: 0.2 },
    ]);
    const r1 = generateHypotheses(plant, TOMATO_FULL, createRng(123));
    const r2 = generateHypotheses(plant, TOMATO_FULL, createRng(123));

    expect(r1.hypotheses.length).toBe(r2.hypotheses.length);
    for (let i = 0; i < r1.hypotheses.length; i++) {
      expect(r1.hypotheses[i].conditionId).toBe(r2.hypotheses[i].conditionId);
      expect(r1.hypotheses[i].confidence).toBe(r2.hypotheses[i].confidence);
    }
  });
});

// ── Pest conditions in diagnosis ──────────────────────────────────────

/**
 * TOMATO_WITH_PESTS adds aphid_damage and hornworm_damage vulnerabilities
 * for testing pest condition diagnosis alongside disease vulnerabilities.
 */
const TOMATO_WITH_PESTS: PlantSpecies = {
  ...TOMATO,
  vulnerabilities: [
    ...TOMATO_FULL.vulnerabilities,
    {
      condition_id: 'aphid_damage',
      susceptibility: 0.5,
      triggers: [
        { type: 'pest_vector', threshold: 0.3 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'small_insects_on_leaves', description: 'Small green insects clustering on stem tips and leaf undersides.', reversible: true },
          { week: 2, visual_overlay: 'small_insects_on_leaves', description: 'Leaves curling, sticky honeydew visible. Sooty mold forming.', reversible: true },
        ],
        weeks_to_death: null,
        spreads: true,
        spread_radius: 2,
      },
    },
    {
      condition_id: 'hornworm_damage',
      susceptibility: 0.4,
      triggers: [
        { type: 'pest_vector', threshold: 0.4 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'large_caterpillar', description: 'Large green caterpillar on upper leaves. Dark droppings on lower leaves.', reversible: true },
          { week: 1, visual_overlay: 'large_caterpillar', description: 'Severe defoliation of upper canopy. Stems stripped bare.', reversible: false },
        ],
        weeks_to_death: null,
        spreads: false,
        spread_radius: 0,
      },
    },
  ],
};

describe('pest conditions in diagnosis', () => {
  it('CONDITION_DATABASE contains all 4 pest conditions', () => {
    const pestIds = ['aphid_damage', 'whitefly_damage', 'hornworm_damage', 'spider_mite_damage'];
    for (const id of pestIds) {
      expect(CONDITION_DATABASE[id]).toBeDefined();
      expect(CONDITION_DATABASE[id].category).toBe('pest');
    }
  });

  it('pest conditions have distinct symptom tags', () => {
    const aphid = CONDITION_DATABASE['aphid_damage'];
    const spider = CONDITION_DATABASE['spider_mite_damage'];
    // Aphids and spider mites have different key symptoms
    expect(aphid.symptomTags).toContain('sticky_residue');
    expect(spider.symptomTags).toContain('webbing');
    expect(spider.symptomTags).not.toContain('sticky_residue');
  });

  it('SIMILAR_CONDITIONS has entries for all 4 pest conditions', () => {
    const pestIds = ['aphid_damage', 'whitefly_damage', 'hornworm_damage', 'spider_mite_damage'];
    for (const id of pestIds) {
      expect(SIMILAR_CONDITIONS[id]).toBeDefined();
      expect(SIMILAR_CONDITIONS[id].length).toBeGreaterThan(0);
    }
  });

  describe('tomato with active aphid damage', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'aphid_damage', onset_week: 8, current_stage: 0, severity: 0.2 },
    ]);

    it('includes aphid_damage as a hypothesis', () => {
      const result = generateHypotheses(plant, TOMATO_WITH_PESTS, createRng(42));
      const aphid = result.hypotheses.find((h) => h.conditionId === 'aphid_damage');
      expect(aphid).toBeDefined();
      expect(aphid!.fromSpeciesVuln).toBe(true);
    });

    it('provides pest-specific observations', () => {
      const result = generateHypotheses(plant, TOMATO_WITH_PESTS, createRng(42));
      expect(result.observations.length).toBeGreaterThanOrEqual(1);
      expect(result.observations[0]).toContain('insects');
    });

    it('generates red herrings from SIMILAR_CONDITIONS for aphids', () => {
      const result = generateHypotheses(plant, TOMATO_WITH_PESTS, createRng(42));
      const externalIds = result.hypotheses
        .filter((h) => !h.fromSpeciesVuln)
        .map((h) => h.conditionId);
      // aphid_damage similar: whitefly_damage, nitrogen_deficiency
      const validRedHerrings = SIMILAR_CONDITIONS['aphid_damage'];
      for (const id of externalIds) {
        expect(validRedHerrings).toContain(id);
      }
    });
  });

  describe('tomato with active hornworm damage', () => {
    const plant = makeTomatoEntity([
      { conditionId: 'hornworm_damage', onset_week: 12, current_stage: 1, severity: 0.5 },
    ]);

    it('includes hornworm_damage with higher confidence at advanced stage', () => {
      const result = generateHypotheses(plant, TOMATO_WITH_PESTS, createRng(42));
      const hw = result.hypotheses.find((h) => h.conditionId === 'hornworm_damage');
      expect(hw).toBeDefined();
      // Stage 1 of 2 (index 1 of 0,1) = max stage → high confidence
      expect(hw!.confidence).toBeGreaterThan(0.6);
    });

    it('observation describes defoliation', () => {
      const result = generateHypotheses(plant, TOMATO_WITH_PESTS, createRng(42));
      expect(result.observations[0]).toContain('defoliation');
    });
  });
});

// ── CONDITION_DATABASE integrity ─────────────────────────────────────

describe('CONDITION_DATABASE', () => {
  it('every condition has non-empty required fields', () => {
    for (const [id, info] of Object.entries(CONDITION_DATABASE)) {
      expect(info.id).toBe(id);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.category).toMatch(/^(fungal|nutrient|pest|abiotic)$/);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.symptomTags.length).toBeGreaterThan(0);
      expect(info.keyVisual.length).toBeGreaterThan(0);
    }
  });

  it('contains exactly 4 pest conditions', () => {
    const pestConditions = Object.values(CONDITION_DATABASE).filter(
      (c) => c.category === 'pest',
    );
    expect(pestConditions).toHaveLength(4);
    const ids = pestConditions.map((c) => c.id).sort();
    expect(ids).toEqual(['aphid_damage', 'hornworm_damage', 'spider_mite_damage', 'whitefly_damage']);
  });
});

// ── SIMILAR_CONDITIONS integrity ─────────────────────────────────────

describe('SIMILAR_CONDITIONS', () => {
  it('every key references a condition in CONDITION_DATABASE', () => {
    for (const key of Object.keys(SIMILAR_CONDITIONS)) {
      expect(CONDITION_DATABASE[key]).toBeDefined();
    }
  });

  it('every value references conditions in CONDITION_DATABASE', () => {
    for (const [key, similars] of Object.entries(SIMILAR_CONDITIONS)) {
      for (const id of similars) {
        expect(CONDITION_DATABASE[id]).toBeDefined();
      }
    }
  });

  it('no condition lists itself as similar', () => {
    for (const [key, similars] of Object.entries(SIMILAR_CONDITIONS)) {
      expect(similars).not.toContain(key);
    }
  });
});
