/**
 * Diagnosis engine — hypothesis generation and matching.
 *
 * Given a plant with active conditions and visible symptoms, generates
 * 3–5 ranked hypotheses for what might be wrong.  The true condition(s)
 * appear alongside plausible wrong answers drawn from similar conditions,
 * creating genuine diagnostic ambiguity — especially at early symptom stages.
 *
 * See docs/04-DIAGNOSES.md §Hypothesis generation for design intent.
 */

import type { PlantSpecies, Vulnerability } from '../data/types.js';
import type { ActiveCondition, Entity } from './ecs/components.js';
import type { SeededRng } from './rng.js';

// ── Public types ─────────────────────────────────────────────────────

export interface DiagnosisHypothesis {
  conditionId: string;
  conditionName: string;
  description: string;
  /** 0–1 confidence that this condition matches the visible symptoms. */
  confidence: number;
  /** Observation note describing what this condition looks like. */
  symptomDescription: string;
  /** True if sourced from the species' own vulnerability list. */
  fromSpeciesVuln: boolean;
}

export interface DiagnosisResult {
  plantSpeciesId: string;
  /** Visible symptom descriptions derived from active conditions. */
  observations: string[];
  /** Ranked hypotheses, best match first. */
  hypotheses: DiagnosisHypothesis[];
}

// ── Condition metadata database ──────────────────────────────────────

export interface ConditionInfo {
  id: string;
  name: string;
  category: 'fungal' | 'nutrient' | 'pest' | 'abiotic';
  description: string;
  /** Semantic tags used for cross-condition similarity matching. */
  symptomTags: string[];
  /** One-line key visual for display on hypothesis cards. */
  keyVisual: string;
}

/**
 * Master database of known conditions.  Keyed by condition_id.
 * Sourced from the condition tables in docs/04-DIAGNOSES.md.
 */
export const CONDITION_DATABASE: Record<string, ConditionInfo> = {
  // ── Fungal ───────────────────────────────────────────────────────
  early_blight: {
    id: 'early_blight',
    name: 'Early Blight',
    category: 'fungal',
    description: 'Fungal infection causing target-shaped spots on leaves, progressing upward.',
    symptomTags: ['leaf_spots', 'concentric_rings', 'yellowing', 'stem_lesions'],
    keyVisual: 'Dark concentric ring patterns on lower leaves',
  },
  late_blight: {
    id: 'late_blight',
    name: 'Late Blight',
    category: 'fungal',
    description: 'Aggressive water mold causing water-soaked patches and white mold on stems and fruit.',
    symptomTags: ['leaf_spots', 'water_soaked', 'white_mold', 'stem_lesions'],
    keyVisual: 'Water-soaked patches with white mold on undersides',
  },
  powdery_mildew: {
    id: 'powdery_mildew',
    name: 'Powdery Mildew',
    category: 'fungal',
    description: 'White powdery coating on leaf surfaces, spreading in warm dry conditions.',
    symptomTags: ['white_coating', 'leaf_surface', 'powder'],
    keyVisual: 'White powdery coating on upper leaf surfaces',
  },
  downy_mildew: {
    id: 'downy_mildew',
    name: 'Downy Mildew',
    category: 'fungal',
    description: 'Yellowing patches on upper leaf surfaces with gray fuzzy growth underneath.',
    symptomTags: ['yellowing', 'interveinal', 'fuzzy_growth', 'leaf_browning'],
    keyVisual: 'Yellow patches above, gray fuzz below leaves',
  },
  botrytis: {
    id: 'botrytis',
    name: 'Botrytis (Gray Mold)',
    category: 'fungal',
    description: 'Gray fuzzy mold on fruit and flowers, thriving in cool damp conditions.',
    symptomTags: ['fuzzy_growth', 'fruit_rot', 'flower_damage'],
    keyVisual: 'Gray fuzzy mold on fruit or flowers',
  },
  fusarium_wilt: {
    id: 'fusarium_wilt',
    name: 'Fusarium Wilt',
    category: 'fungal',
    description: 'Soil-borne fungus blocking vascular system, causing asymmetric wilting.',
    symptomTags: ['wilting', 'asymmetric', 'yellowing', 'vascular'],
    keyVisual: 'One-sided wilting, brown streaks in stem when cut',
  },
  septoria_leaf_spot: {
    id: 'septoria_leaf_spot',
    name: 'Septoria Leaf Spot',
    category: 'fungal',
    description: 'Small dark spots with light centers on lower leaves, spreading upward.',
    symptomTags: ['leaf_spots', 'small_spots', 'yellowing'],
    keyVisual: 'Small circular spots with dark borders and tan centers',
  },

  // ── Nutrient deficiency ──────────────────────────────────────────
  nitrogen_deficiency: {
    id: 'nitrogen_deficiency',
    name: 'Nitrogen Deficiency',
    category: 'nutrient',
    description: 'Overall yellowing starting from oldest leaves. Growth slows significantly.',
    symptomTags: ['yellowing', 'uniform', 'lower_leaves', 'stunting'],
    keyVisual: 'Uniform yellowing of older/lower leaves',
  },
  iron_chlorosis: {
    id: 'iron_chlorosis',
    name: 'Iron Chlorosis',
    category: 'nutrient',
    description: 'Interveinal yellowing on new leaves while veins stay green. Often caused by high pH.',
    symptomTags: ['yellowing', 'interveinal', 'new_leaves', 'chlorosis'],
    keyVisual: 'Yellowing between veins on newest leaves, veins remain green',
  },
  manganese_deficiency: {
    id: 'manganese_deficiency',
    name: 'Manganese Deficiency',
    category: 'nutrient',
    description: 'Interveinal yellowing on new leaves, nearly identical to iron chlorosis.',
    symptomTags: ['yellowing', 'interveinal', 'new_leaves', 'chlorosis'],
    keyVisual: 'Interveinal yellowing on new leaves — check soil pH to differentiate from iron',
  },
  phosphorus_deficiency: {
    id: 'phosphorus_deficiency',
    name: 'Phosphorus Deficiency',
    category: 'nutrient',
    description: 'Purple or reddish tint on leaves, especially undersides. Stunted growth.',
    symptomTags: ['purple_tint', 'stunting', 'discoloration'],
    keyVisual: 'Purple/reddish tint on leaves',
  },
  potassium_deficiency: {
    id: 'potassium_deficiency',
    name: 'Potassium Deficiency',
    category: 'nutrient',
    description: 'Brown scorching on leaf margins working inward. Weak stems.',
    symptomTags: ['leaf_edges', 'browning', 'scorch'],
    keyVisual: 'Brown leaf edges (marginal scorch)',
  },
  blossom_end_rot: {
    id: 'blossom_end_rot',
    name: 'Blossom End Rot',
    category: 'nutrient',
    description: 'Dark sunken area at fruit base from calcium uptake issues, often from inconsistent watering.',
    symptomTags: ['fruit_rot', 'discoloration', 'sunken'],
    keyVisual: 'Dark leathery patch at blossom end of fruit',
  },
  calcium_deficiency: {
    id: 'calcium_deficiency',
    name: 'Calcium Deficiency',
    category: 'nutrient',
    description: 'Distorted new growth, blossom end rot on fruit. Often a watering issue, not soil calcium.',
    symptomTags: ['fruit_rot', 'new_growth', 'distortion'],
    keyVisual: 'Blossom end rot on fruit, curled new leaves',
  },

  // ── Abiotic ──────────────────────────────────────────────────────
  sunscald: {
    id: 'sunscald',
    name: 'Sunscald',
    category: 'abiotic',
    description: 'White or tan papery patches on fruit from sudden sun exposure.',
    symptomTags: ['fruit_damage', 'bleaching', 'papery'],
    keyVisual: 'White/tan papery patches on sun-facing side of fruit',
  },
  transplant_shock: {
    id: 'transplant_shock',
    name: 'Transplant Shock',
    category: 'abiotic',
    description: 'Wilting despite adequate water after transplanting. Roots not yet established.',
    symptomTags: ['wilting', 'stunting'],
    keyVisual: 'Wilting despite adequate water after recent transplant',
  },
  overwatering: {
    id: 'overwatering',
    name: 'Overwatering',
    category: 'abiotic',
    description: 'Yellowing lower leaves, edema, root rot from waterlogged soil.',
    symptomTags: ['yellowing', 'lower_leaves', 'wilting'],
    keyVisual: 'Yellowing lower leaves, mushy stems near soil line',
  },
};

/**
 * Conditions that can be visually confused with one another.
 * Each key maps to an ordered list of similar-looking alternatives.
 */
export const SIMILAR_CONDITIONS: Record<string, string[]> = {
  // Fungal confusion pairs (from doc 04 condition tables)
  early_blight: ['late_blight', 'septoria_leaf_spot'],
  late_blight: ['early_blight', 'botrytis'],
  powdery_mildew: ['downy_mildew'],
  downy_mildew: ['powdery_mildew', 'iron_chlorosis'],
  botrytis: ['late_blight', 'overwatering'],
  fusarium_wilt: ['transplant_shock', 'overwatering'],
  septoria_leaf_spot: ['early_blight', 'late_blight'],

  // Nutrient confusion pairs
  nitrogen_deficiency: ['overwatering', 'iron_chlorosis'],
  iron_chlorosis: ['manganese_deficiency', 'nitrogen_deficiency'],
  manganese_deficiency: ['iron_chlorosis', 'nitrogen_deficiency'],
  phosphorus_deficiency: ['potassium_deficiency'],
  potassium_deficiency: ['phosphorus_deficiency', 'sunscald'],
  blossom_end_rot: ['calcium_deficiency', 'botrytis'],
  calcium_deficiency: ['blossom_end_rot', 'phosphorus_deficiency'],

  // Abiotic confusion pairs
  sunscald: ['potassium_deficiency'],
  transplant_shock: ['fusarium_wilt', 'overwatering'],
  overwatering: ['nitrogen_deficiency', 'fusarium_wilt'],
};

// ── Symptom tag mapping ──────────────────────────────────────────────

/**
 * Maps visual_overlay strings (from species JSON symptom stages) to
 * semantic tags for cross-condition similarity scoring.
 */
const OVERLAY_TO_TAGS: Record<string, string[]> = {
  // Early blight overlays
  lower_leaf_spots: ['leaf_spots', 'concentric_rings', 'lower_leaves'],
  spreading_spots_yellowing: ['leaf_spots', 'yellowing'],
  spreading_spots: ['leaf_spots', 'yellowing'],
  stem_lesions: ['stem_lesions'],

  // Blossom end rot overlays
  fruit_base_discolor: ['fruit_rot', 'discoloration'],
  fruit_base_rot: ['fruit_rot', 'sunken'],

  // Downy mildew overlays
  interveinal_yellowing: ['yellowing', 'interveinal', 'chlorosis'],
  leaf_browning: ['leaf_browning', 'browning'],
  stem_blackening: ['stem_lesions'],

  // Fusarium wilt overlays
  asymmetric_wilt: ['wilting', 'asymmetric'],
  total_wilt: ['wilting', 'yellowing'],

  // Powdery mildew overlays
  white_powder: ['white_coating', 'powder'],
  powdery_coating: ['white_coating', 'powder', 'leaf_surface'],

  // Late blight overlays
  water_soaked_patches: ['water_soaked', 'leaf_spots'],
  white_mold: ['white_mold', 'stem_lesions'],

  // Generic overlays
  yellowing: ['yellowing'],
  wilting: ['wilting'],
  spots: ['leaf_spots'],
  leaf_curl: ['distortion'],
  fruit_spots: ['fruit_damage', 'leaf_spots'],
};

// ── Internal helpers ─────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Collect all unique symptom tags for a vulnerability's stages. */
function getVulnerabilityTags(vuln: Vulnerability): string[] {
  const tags = new Set<string>();
  for (const stage of vuln.symptoms.stages) {
    const overlayTags = OVERLAY_TO_TAGS[stage.visual_overlay];
    if (overlayTags) {
      for (const t of overlayTags) tags.add(t);
    }
  }
  return [...tags];
}

/**
 * Compute Jaccard similarity between two tag sets.
 * Returns 0 when either set is empty.
 */
export function computeTagSimilarity(tagsA: string[], tagsB: string[]): number {
  if (tagsA.length === 0 || tagsB.length === 0) return 0;
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Get the visible symptom tags for a plant from its active conditions.
 */
function collectVisibleTags(
  activeConditions: ActiveCondition[],
  species: PlantSpecies,
): string[] {
  const tags = new Set<string>();
  for (const active of activeConditions) {
    const vuln = species.vulnerabilities.find(
      (v) => v.condition_id === active.conditionId,
    );
    if (!vuln) continue;
    const stage = vuln.symptoms.stages[active.current_stage];
    if (!stage) continue;
    const overlayTags = OVERLAY_TO_TAGS[stage.visual_overlay];
    if (overlayTags) {
      for (const t of overlayTags) tags.add(t);
    }
  }
  return [...tags];
}

/**
 * Compute confidence for an active (true) condition.
 *
 * Early stages produce lower confidence to create diagnostic ambiguity.
 * Confidence rises as the condition progresses and symptoms become more
 * distinctive — mirroring real-world diagnosis difficulty.
 */
function scoreActiveCondition(
  active: ActiveCondition,
  vuln: Vulnerability,
): number {
  const maxStage = vuln.symptoms.stages.length - 1;
  const stageProgress = maxStage > 0 ? active.current_stage / maxStage : 1;
  // Base 0.4 → up to 0.95 at max stage + severity
  return clamp(0.4 + stageProgress * 0.35 + active.severity * 0.15, 0.3, 0.95);
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Generate diagnosis hypotheses for a plant displaying symptoms.
 *
 * Matches the plant's active symptom overlays against its species'
 * vulnerability list, then adds 1–2 plausible wrong answers from
 * the SIMILAR_CONDITIONS map.  Returns observations + hypotheses
 * sorted by confidence, capped at 3–5 results.
 *
 * @param plant   Entity with at least `species` and `activeConditions`
 * @param species The resolved PlantSpecies data for this plant
 * @param rng     Seeded RNG for selecting among similar conditions
 * @returns       DiagnosisResult with observations and ranked hypotheses
 */
export function generateHypotheses(
  plant: Entity,
  species: PlantSpecies,
  rng: SeededRng,
): DiagnosisResult {
  const activeConditions = plant.activeConditions?.conditions ?? [];

  // No symptoms → nothing to diagnose
  if (activeConditions.length === 0) {
    return { plantSpeciesId: species.id, observations: [], hypotheses: [] };
  }

  // ── Step 1: Collect visible observations ──────────────────────────

  const observations: string[] = [];
  for (const active of activeConditions) {
    const vuln = species.vulnerabilities.find(
      (v) => v.condition_id === active.conditionId,
    );
    if (!vuln) continue;
    const stage = vuln.symptoms.stages[active.current_stage];
    if (stage) {
      observations.push(stage.description);
    }
  }

  const visibleTags = collectVisibleTags(activeConditions, species);

  // ── Step 2: Score each species vulnerability ──────────────────────

  const hypotheses: DiagnosisHypothesis[] = [];
  const includedIds = new Set<string>();

  for (const vuln of species.vulnerabilities) {
    const active = activeConditions.find(
      (c) => c.conditionId === vuln.condition_id,
    );
    const info = CONDITION_DATABASE[vuln.condition_id];

    if (active) {
      // True condition — confidence based on stage progression
      const stage = vuln.symptoms.stages[active.current_stage];
      const confidence = scoreActiveCondition(active, vuln);

      hypotheses.push({
        conditionId: vuln.condition_id,
        conditionName: info?.name ?? vuln.condition_id,
        description: info?.description ?? '',
        confidence,
        symptomDescription: stage?.description ?? info?.keyVisual ?? '',
        fromSpeciesVuln: true,
      });
      includedIds.add(vuln.condition_id);
    } else {
      // Non-active vulnerability — score by tag similarity with visible symptoms
      const vulnTags = getVulnerabilityTags(vuln);
      const similarity = computeTagSimilarity(visibleTags, vulnTags);

      if (similarity > 0.15) {
        const displayStage = vuln.symptoms.stages[0];
        hypotheses.push({
          conditionId: vuln.condition_id,
          conditionName: info?.name ?? vuln.condition_id,
          description: info?.description ?? '',
          confidence: clamp(similarity * 0.7, 0.1, 0.6),
          symptomDescription:
            displayStage?.description ?? info?.keyVisual ?? '',
          fromSpeciesVuln: true,
        });
        includedIds.add(vuln.condition_id);
      }
    }
  }

  // ── Step 3: Add 1–2 plausible wrong answers from SIMILAR_CONDITIONS ─

  const activeIds = activeConditions.map((c) => c.conditionId);
  let redHerringBudget = rng.nextInt(1, 2);

  for (const activeId of activeIds) {
    if (redHerringBudget <= 0) break;

    const candidates = (SIMILAR_CONDITIONS[activeId] ?? []).filter(
      (id) => !includedIds.has(id) && CONDITION_DATABASE[id] != null,
    );
    if (candidates.length === 0) continue;

    // Pick 1–2 from the candidate list (ordered by relevance in SIMILAR_CONDITIONS)
    const count = Math.min(redHerringBudget, candidates.length);
    const selected = candidates.slice(0, count);

    for (const similarId of selected) {
      const info = CONDITION_DATABASE[similarId];
      if (!info) continue;

      const similarity = computeTagSimilarity(visibleTags, info.symptomTags);
      const confidence = clamp(similarity * 0.6 + 0.1, 0.1, 0.55);

      hypotheses.push({
        conditionId: similarId,
        conditionName: info.name,
        description: info.description,
        confidence,
        symptomDescription: info.keyVisual,
        fromSpeciesVuln: false,
      });
      includedIds.add(similarId);
      redHerringBudget--;
    }
  }

  // ── Step 4: Sort by confidence descending, return top 3–5 ─────────

  hypotheses.sort((a, b) => b.confidence - a.confidence);

  const MAX_HYPOTHESES = 5;
  return {
    plantSpeciesId: species.id,
    observations,
    hypotheses: hypotheses.slice(0, MAX_HYPOTHESES),
  };
}
