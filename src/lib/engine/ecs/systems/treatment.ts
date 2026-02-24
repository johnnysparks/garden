/**
 * treatment_feedback system — runs after disease_check in the tick order.
 *
 * Evaluates pending treatments whose feedback delay has elapsed.
 * Applies the outcome to the plant's active conditions:
 *
 *   Correct diagnosis + correct treatment → condition resolved or stabilized
 *   Correct diagnosis + wrong treatment   → no effect (wasted action)
 *   Wrong diagnosis + any treatment       → conditions worsen slightly
 *
 * The 1–2 week delay mirrors reality: you don't know if your treatment
 * worked immediately. This creates tension and reinforces the learning loop.
 *
 * See docs/04-DIAGNOSES.md §Step 5 for design intent.
 */

import type {
  SimulationContext,
  ActiveCondition,
  ActiveTreatment,
  TreatmentOutcome,
} from '../components.js';
import { evaluateTreatment, applyTreatmentOutcome } from '../../treatment.js';

/** Collected outcomes from a single tick, for reporting. */
export interface TreatmentFeedbackResult {
  outcomes: Array<{
    speciesId: string;
    row: number;
    col: number;
    outcome: TreatmentOutcome;
  }>;
}

/**
 * Process pending treatments and apply feedback outcomes.
 *
 * For each plant with `activeTreatments`, checks whether the feedback
 * delay has elapsed. If so, evaluates the treatment against the plant's
 * current conditions and mutates state accordingly.
 *
 * Special case: `pull_plant` treatment removes the plant entity entirely.
 */
export function treatmentFeedbackSystem(ctx: SimulationContext): TreatmentFeedbackResult {
  const { world, currentWeek } = ctx;
  const plants = world.with('species', 'health', 'plotSlot');
  const result: TreatmentFeedbackResult = { outcomes: [] };

  for (const plant of plants) {
    if ((plant as { dead?: boolean }).dead) continue;

    const entity = plant as typeof plant & {
      activeTreatments?: { treatments: ActiveTreatment[] };
      activeConditions?: { conditions: ActiveCondition[] };
    };

    if (!entity.activeTreatments || entity.activeTreatments.treatments.length === 0) {
      continue;
    }

    const conditions = entity.activeConditions?.conditions ?? [];
    const readyTreatments: ActiveTreatment[] = [];
    const pendingTreatments: ActiveTreatment[] = [];

    for (const t of entity.activeTreatments.treatments) {
      if (currentWeek >= t.feedback_week) {
        readyTreatments.push(t);
      } else {
        pendingTreatments.push(t);
      }
    }

    // Process ready treatments
    for (const treatment of readyTreatments) {
      // Special case: pull_plant removes the entire plant
      if (treatment.action === 'pull_plant') {
        world.addComponent(plant, 'dead', true);
        result.outcomes.push({
          speciesId: plant.species.speciesId,
          row: plant.plotSlot.row,
          col: plant.plotSlot.col,
          outcome: {
            action: 'pull_plant',
            targetCondition: treatment.targetCondition,
            diagnosisCorrect: true,
            treatmentEffective: true,
            result: 'resolved',
          },
        });
        break; // Plant is dead, no more treatments matter
      }

      const outcome = evaluateTreatment(treatment, conditions);
      applyTreatmentOutcome(outcome, conditions);

      result.outcomes.push({
        speciesId: plant.species.speciesId,
        row: plant.plotSlot.row,
        col: plant.plotSlot.col,
        outcome,
      });
    }

    // Keep only pending treatments
    entity.activeTreatments.treatments = pendingTreatments;
  }

  return result;
}
