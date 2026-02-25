/**
 * Treatment definitions and condition mapping.
 *
 * Maps player treatment actions to the conditions they can effectively treat.
 * Used by the treatment feedback system to evaluate whether the player's
 * intervention was appropriate for the diagnosed condition.
 *
 * See docs/04-DIAGNOSES.md §Step 5 for design intent.
 */

import type { TreatmentOutcome, ActiveCondition, ActiveTreatment } from './ecs/components.js';
import { CONDITION_DATABASE } from './diagnosis.js';

// ── Treatment action definitions ────────────────────────────────────

export interface TreatmentDefinition {
  id: string;
  name: string;
  description: string;
  /** Condition IDs this treatment is effective against. */
  effective_against: string[];
}

/**
 * Master list of treatment actions the player can choose.
 *
 * Each treatment is effective against specific conditions. The mapping
 * reflects real-world horticultural practice — pruning diseased leaves
 * helps with fungal leaf infections, fungicide sprays target fungal
 * pathogens, etc.
 */
export const TREATMENT_DATABASE: Record<string, TreatmentDefinition> = {
  prune: {
    id: 'prune',
    name: 'Remove Affected Leaves',
    description: 'Cut away visibly diseased or damaged plant tissue.',
    effective_against: [
      'early_blight',
      'late_blight',
      'powdery_mildew',
      'downy_mildew',
      'septoria_leaf_spot',
      'botrytis',
    ],
  },
  spray_fungicide: {
    id: 'spray_fungicide',
    name: 'Apply Fungicide',
    description: 'Spray copper-based fungicide on affected plant.',
    effective_against: [
      'early_blight',
      'late_blight',
      'powdery_mildew',
      'downy_mildew',
      'botrytis',
      'fusarium_wilt',
      'septoria_leaf_spot',
    ],
  },
  spray_neem: {
    id: 'spray_neem',
    name: 'Apply Neem Oil',
    description: 'Spray neem oil to deter soft-bodied insects and mild fungal issues.',
    effective_against: [
      'aphid_damage',
      'whitefly_damage',
      'spider_mite_damage',
      'powdery_mildew',
    ],
  },
  hand_pick: {
    id: 'hand_pick',
    name: 'Hand-Pick Pests',
    description: 'Manually remove visible pests from the plant.',
    effective_against: [
      'hornworm_damage',
      'aphid_damage',
    ],
  },
  adjust_watering: {
    id: 'adjust_watering',
    name: 'Adjust Watering',
    description: 'Change watering schedule to address moisture-related issues.',
    effective_against: [
      'overwatering',
      'blossom_end_rot',
      'calcium_deficiency',
    ],
  },
  amend_soil: {
    id: 'amend_soil',
    name: 'Amend Soil',
    description: 'Add targeted nutrients or pH adjusters to the soil.',
    effective_against: [
      'nitrogen_deficiency',
      'phosphorus_deficiency',
      'potassium_deficiency',
      'iron_chlorosis',
      'manganese_deficiency',
      'calcium_deficiency',
    ],
  },
  pull_plant: {
    id: 'pull_plant',
    name: 'Pull Plant',
    description: 'Remove the entire plant. Drastic but stops disease spread.',
    effective_against: [], // Special case — always "works" by removing the plant
  },
  monitor: {
    id: 'monitor',
    name: 'Monitor',
    description: 'Continue observing without taking action.',
    effective_against: [
      'transplant_shock',
      'sunscald',
    ],
  },
};

// ── Evaluation logic ────────────────────────────────────────────────

/** Severity reduction applied when a treatment is effective on a reversible condition. */
const EFFECTIVE_SEVERITY_REDUCTION = 0.15;

/** Severity increase when wrong diagnosis leads to a worsening condition. */
const WRONG_DIAGNOSIS_SEVERITY_BUMP = 0.1;

/**
 * Check whether a treatment action is effective against a condition.
 */
export function isTreatmentEffective(action: string, conditionId: string): boolean {
  const treatment = TREATMENT_DATABASE[action];
  if (!treatment) return false;
  return treatment.effective_against.includes(conditionId);
}

/**
 * Evaluate the outcome of a treatment applied to a plant.
 *
 * Returns a TreatmentOutcome describing what happened, plus
 * recommended mutations to apply to the plant's conditions.
 */
export function evaluateTreatment(
  treatment: ActiveTreatment,
  activeConditions: ActiveCondition[],
): TreatmentOutcome {
  const { action, targetCondition } = treatment;

  // Check if the diagnosed condition is actually present
  const actualCondition = activeConditions.find(
    (c) => c.conditionId === targetCondition,
  );
  const diagnosisCorrect = actualCondition !== undefined;

  // Check if the treatment is appropriate for the target condition
  const treatmentEffective = isTreatmentEffective(action, targetCondition);

  // Determine outcome category
  let result: TreatmentOutcome['result'];
  if (diagnosisCorrect && treatmentEffective) {
    // Look up whether current stage is reversible
    const info = CONDITION_DATABASE[targetCondition];
    // Conditions caught early (low severity) can be resolved; later ones stabilize
    if (actualCondition.severity <= 0.3) {
      result = 'resolved';
    } else {
      result = 'stabilized';
    }
  } else if (diagnosisCorrect && !treatmentEffective) {
    result = 'ineffective';
  } else {
    // Wrong diagnosis — treatment misses entirely and may worsen things
    result = 'worsened';
  }

  return {
    action,
    targetCondition,
    diagnosisCorrect,
    treatmentEffective,
    result,
  };
}

/**
 * Apply a treatment outcome to a plant's active conditions.
 *
 * Mutates the conditions array in place:
 * - 'resolved': removes the condition
 * - 'stabilized': reduces severity, halts progression
 * - 'ineffective': no change
 * - 'worsened': bumps severity on all active conditions
 */
export function applyTreatmentOutcome(
  outcome: TreatmentOutcome,
  conditions: ActiveCondition[],
): void {
  switch (outcome.result) {
    case 'resolved': {
      const idx = conditions.findIndex(
        (c) => c.conditionId === outcome.targetCondition,
      );
      if (idx !== -1) {
        conditions.splice(idx, 1);
      }
      break;
    }
    case 'stabilized': {
      const cond = conditions.find(
        (c) => c.conditionId === outcome.targetCondition,
      );
      if (cond) {
        cond.severity = Math.max(0, cond.severity - EFFECTIVE_SEVERITY_REDUCTION);
      }
      break;
    }
    case 'ineffective':
      // No change — wasted action
      break;
    case 'worsened': {
      // Wrong diagnosis: all existing conditions get slightly worse
      for (const cond of conditions) {
        cond.severity = Math.min(1, cond.severity + WRONG_DIAGNOSIS_SEVERITY_BUMP);
      }
      break;
    }
  }
}
