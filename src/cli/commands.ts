/**
 * Command parser and dispatcher for the CLI.
 *
 * Parses one-line text commands, validates arguments, checks phase/energy
 * constraints, and dispatches to the session + formatter.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { TurnPhase } from '../lib/engine/turn-manager.js';
import type { CliSession, DuskTickResult, AdvanceResult } from './session.js';
import { createCliSession, type CliSessionConfig } from './session.js';
import { getAllSpecies, getAllSpeciesIds, getSpeciesLookup, getZone, getAllAmendments, getAmendment } from './data-loader.js';
import type { PlantSpecies } from '../lib/data/types.js';
import {
  formatStatus,
  formatGrid,
  formatInspect,
  formatWeather,
  formatPlants,
  formatSoil,
  formatSpeciesList,
  formatSpeciesDetail,
  formatDuskTick,
  formatAdvance,
  formatLog,
  formatHelp,
  formatDiagnose,
} from './formatter.js';

// ── Command result ───────────────────────────────────────────────────

export interface CommandResult {
  output: string;
  quit?: boolean;
}

// ── Parse helpers ────────────────────────────────────────────────────

function parseRowCol(args: string[]): { row: number; col: number } | string {
  if (args.length < 2) return 'Missing ROW COL arguments.';
  const row = parseInt(args[0], 10);
  const col = parseInt(args[1], 10);
  if (isNaN(row) || isNaN(col)) return 'ROW and COL must be numbers.';
  return { row, col };
}

function requirePhase(session: CliSession, required: TurnPhase): string | null {
  const current = session.getPhase();
  if (current !== required) {
    return `Error: Not in ${required} phase (current: ${current}). Use 'advance' to change phase.`;
  }
  return null;
}

function requireEnergy(session: CliSession, cost: number): string | null {
  const energy = session.getEnergy();
  if (energy.current < cost) {
    return `Error: Not enough energy. Need ${cost}, have ${energy.current}.`;
  }
  return null;
}

function requireBounds(session: CliSession, row: number, col: number): string | null {
  if (!session.inBounds(row, col)) {
    return `Error: Plot [${row}, ${col}] out of bounds. Grid is ${session.gridRows}x${session.gridCols} (valid: 0-${session.gridRows - 1}).`;
  }
  return null;
}

/**
 * After spending energy, if the action exhausted energy and auto-transitioned
 * to DUSK, format the dusk tick + advance results and auto-advance through
 * non-interactive phases to DAWN. Returns empty string if still in ACT.
 */
function formatAutoAdvance(session: CliSession): string {
  if (session.getPhase() !== TurnPhase.DUSK) return '';

  const parts: string[] = [];
  const duskResult = session.consumeLastDuskResult();
  if (duskResult) {
    parts.push(formatDuskTick(duskResult));
  }

  // Auto-advance through DUSK → ADVANCE → DAWN
  let safety = 5;
  while (safety-- > 0) {
    if (session.isRunEnded()) break;
    const result = session.advancePhase();
    if (result.advance) {
      parts.push(formatAdvance(result.advance, session.config.zone));
    }
    const phase = session.getPhase();
    if (phase !== TurnPhase.DUSK && phase !== TurnPhase.ADVANCE) break;
  }

  parts.push(formatStatus(session));
  return parts.join('\n\n');
}

// ── Command dispatcher ───────────────────────────────────────────────

export function executeCommand(session: CliSession, input: string): CommandResult {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return { output: '' };
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // ── Query commands (any phase) ──────────────────────────────────

  switch (cmd) {
    case 'status':
      return { output: formatStatus(session) };

    case 'grid':
      return { output: formatGrid(session) };

    case 'inspect': {
      const rc = parseRowCol(args);
      if (typeof rc === 'string') return { output: `Error: ${rc}` };
      const boundsErr = requireBounds(session, rc.row, rc.col);
      if (boundsErr) return { output: boundsErr };
      return { output: formatInspect(session, rc.row, rc.col) };
    }

    case 'weather':
      return { output: formatWeather(session) };

    case 'plants':
      return { output: formatPlants(session) };

    case 'soil': {
      const rc = parseRowCol(args);
      if (typeof rc === 'string') return { output: `Error: ${rc}` };
      const boundsErr = requireBounds(session, rc.row, rc.col);
      if (boundsErr) return { output: boundsErr };
      return { output: formatSoil(session, rc.row, rc.col) };
    }

    case 'species': {
      if (args.length > 0) {
        const id = args[0];
        const lookup = session.speciesLookup(id);
        if (!lookup) {
          return {
            output: `Error: Unknown species '${id}'. Use 'species' to list available species.`,
          };
        }
        return { output: formatSpeciesDetail(lookup) };
      }
      return { output: formatSpeciesList(getAllSpecies()) };
    }

    case 'amendments': {
      const amendments = getAllAmendments();
      if (amendments.length === 0) {
        return { output: 'No amendments available.' };
      }
      const lines = [`=== Available Amendments (${amendments.length}) ===`];
      for (const a of amendments) {
        lines.push(`  ${a.id}: ${a.name} (delay: ${a.delay_weeks} weeks)`);
      }
      return { output: lines.join('\n') };
    }

    case 'log': {
      const count = args.length > 0 ? parseInt(args[0], 10) : 10;
      return { output: formatLog(session, isNaN(count) ? 10 : count) };
    }

    case 'help':
      return { output: formatHelp(args[0]) };

    case 'score':
      return { output: 'Score: scoring not yet implemented.' };

    // ── Turn commands ───────────────────────────────────────────────

    case 'advance': {
      if (session.isRunEnded()) {
        return { output: 'Error: Run has ended. Start a new game.' };
      }
      const outputParts: string[] = [];

      // Advance at least once, then auto-continue through non-interactive
      // phases (DUSK and ADVANCE) so the player lands on an interactive phase.
      let safety = 5;
      do {
        const result = session.advancePhase();

        if (result.dusk) {
          outputParts.push(formatDuskTick(result.dusk));
        }
        if (result.advance) {
          outputParts.push(formatAdvance(result.advance, session.config.zone));
        }

        const phase = session.getPhase();
        // Stop at interactive phases (DAWN, PLAN, ACT) or if run ended
        if (phase !== TurnPhase.DUSK && phase !== TurnPhase.ADVANCE) break;
        if (session.isRunEnded()) break;
      } while (safety-- > 0);

      outputParts.push(formatStatus(session));
      return { output: outputParts.join('\n\n') };
    }

    case 'week': {
      if (session.isRunEnded()) {
        return { output: 'Error: Run has ended. Start a new game.' };
      }
      const outputParts: string[] = [];
      const startWeek = session.getWeek();

      // Advance through all phases until we reach ACT in a new week.
      let safety = 12;
      while (safety-- > 0) {
        if (session.isRunEnded()) break;

        const result = session.advancePhase();

        if (result.dusk) {
          outputParts.push(formatDuskTick(result.dusk));
        }
        if (result.advance) {
          outputParts.push(formatAdvance(result.advance, session.config.zone));
        }

        // Stop once we've advanced at least one week and reached ACT
        if (session.getWeek() > startWeek && result.phase === TurnPhase.ACT) break;
      }

      outputParts.push(formatStatus(session));
      return { output: outputParts.join('\n\n') };
    }

    // ── Action commands (ACT phase) ─────────────────────────────────

    case 'plant': {
      const phaseErr = requirePhase(session, TurnPhase.ACT);
      if (phaseErr) return { output: phaseErr };
      if (args.length < 3) {
        return { output: 'Error: Usage: plant SPECIES_ID ROW COL' };
      }
      const speciesId = args[0];
      const rc = parseRowCol(args.slice(1));
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      const boundsErr = requireBounds(session, rc.row, rc.col);
      if (boundsErr) return { output: boundsErr };

      const species = session.speciesLookup(speciesId);
      if (!species) {
        return {
          output: `Error: Unknown species '${speciesId}'. Use 'species' to list available species.`,
        };
      }

      if (session.isOccupied(rc.row, rc.col)) {
        const existing = session.getPlantAt(rc.row, rc.col);
        return {
          output: `Error: Plot [${rc.row}, ${rc.col}] is already occupied by ${existing?.speciesId ?? 'a plant'}.`,
        };
      }

      const energyErr = requireEnergy(session, 1);
      if (energyErr) return { output: energyErr };

      // Spend energy
      session.spendEnergy(1);

      // Record event
      const week = session.getWeek();
      session.dispatch({
        type: 'PLANT',
        species_id: speciesId,
        plot: [rc.row, rc.col],
        week,
      });

      // Add plant entity via shared factory
      session.addPlant(speciesId, rc.row, rc.col);

      const energy = session.getEnergy();
      let output = `Planted ${species.common_name} (${speciesId}) at [${rc.row}, ${rc.col}]. Energy: ${energy.current}/${energy.max}`;
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'amend': {
      const phaseErr = requirePhase(session, TurnPhase.ACT);
      if (phaseErr) return { output: phaseErr };
      if (args.length < 3) {
        return { output: 'Error: Usage: amend AMENDMENT ROW COL' };
      }
      const amendmentId = args[0];
      const rc = parseRowCol(args.slice(1));
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      const amendmentDef = getAmendment(amendmentId);
      if (!amendmentDef) {
        const available = getAllAmendments();
        if (available.length === 0) {
          return { output: 'Error: No amendments available.' };
        }
        return {
          output: `Error: Unknown amendment '${amendmentId}'. Available: ${available.map((a) => a.id).join(', ')}`,
        };
      }

      const boundsErr = requireBounds(session, rc.row, rc.col);
      if (boundsErr) return { output: boundsErr };

      const energyErr = requireEnergy(session, 1);
      if (energyErr) return { output: energyErr };

      session.spendEnergy(1);

      const week = session.getWeek();
      session.dispatch({
        type: 'AMEND',
        amendment: amendmentId,
        plot: [rc.row, rc.col],
        week,
      });

      const energy = session.getEnergy();
      let output = `Applied ${amendmentDef.name} to [${rc.row}, ${rc.col}]. Energy: ${energy.current}/${energy.max}`;
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'diagnose': {
      const phaseErr = requirePhase(session, TurnPhase.ACT);
      if (phaseErr) return { output: phaseErr };
      const rc = parseRowCol(args);
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      const boundsErr = requireBounds(session, rc.row, rc.col);
      if (boundsErr) return { output: boundsErr };

      const plant = session.getPlantAt(rc.row, rc.col);
      if (!plant) {
        return { output: `Error: No plant at [${rc.row}, ${rc.col}].` };
      }

      const energyErr = requireEnergy(session, 1);
      if (energyErr) return { output: energyErr };

      session.spendEnergy(1);
      session.dispatch({
        type: 'DIAGNOSE',
        plant_id: `${rc.row},${rc.col}`,
        hypothesis: 'visual_inspection',
        week: session.getWeek(),
      });

      let output = formatDiagnose(session, rc.row, rc.col);
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'intervene': {
      const phaseErr = requirePhase(session, TurnPhase.ACT);
      if (phaseErr) return { output: phaseErr };
      if (args.length < 3) {
        return { output: 'Error: Usage: intervene ACTION ROW COL' };
      }
      const action = args[0];
      const rc = parseRowCol(args.slice(1));
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      const boundsErr = requireBounds(session, rc.row, rc.col);
      if (boundsErr) return { output: boundsErr };

      const plant = session.getPlantAt(rc.row, rc.col);
      if (!plant) {
        return { output: `Error: No plant at [${rc.row}, ${rc.col}].` };
      }

      const energyErr = requireEnergy(session, 1);
      if (energyErr) return { output: energyErr };

      session.spendEnergy(1);
      session.dispatch({
        type: 'INTERVENE',
        plant_id: `${rc.row},${rc.col}`,
        action,
        week: session.getWeek(),
      });

      const energy = session.getEnergy();
      let output = `Intervened on ${plant.speciesId} at [${rc.row}, ${rc.col}]: ${action}. Energy: ${energy.current}/${energy.max}`;
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'scout': {
      const phaseErr = requirePhase(session, TurnPhase.ACT);
      if (phaseErr) return { output: phaseErr };
      if (args.length < 1) {
        return { output: 'Error: Usage: scout TARGET (weather, pests, soil)' };
      }

      const energyErr = requireEnergy(session, 1);
      if (energyErr) return { output: energyErr };

      session.spendEnergy(1);
      const target = args[0];
      session.dispatch({
        type: 'SCOUT',
        target,
        week: session.getWeek(),
      });

      if (target === 'weather') {
        let output = formatWeather(session);
        const autoAdv = formatAutoAdvance(session);
        if (autoAdv) output += '\n\n' + autoAdv;
        return { output };
      }
      const energy = session.getEnergy();
      let output = `Scouted: ${target}. Energy: ${energy.current}/${energy.max}`;
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'wait': {
      const phaseErr = requirePhase(session, TurnPhase.ACT);
      if (phaseErr) return { output: phaseErr };

      // endActions triggers DUSK phase callback (simulation runs)
      const duskResult = session.endActions();
      const outputParts: string[] = ['Ended actions early.'];

      if (duskResult) {
        outputParts.push(formatDuskTick(duskResult));
      }

      // Now advance through DUSK → ADVANCE
      const advResult = session.advancePhase();
      if (advResult.advance) {
        outputParts.push(formatAdvance(advResult.advance, session.config.zone));
      }

      // ADVANCE → DAWN
      if (!session.isRunEnded()) {
        session.advancePhase();
      }

      outputParts.push(formatStatus(session));
      return { output: outputParts.join('\n\n') };
    }

    // ── Session commands ──────────────────────────────────────────────

    case 'save': {
      const path = args[0] ?? 'save.json';
      const json = JSON.stringify(session.toJSON(), null, 2);
      writeFileSync(path, json, 'utf-8');
      return { output: `Saved ${session.eventLog.length} events to ${path}.` };
    }

    case 'quit':
      return { output: 'Goodbye.', quit: true };

    default:
      return {
        output: `Unknown command: '${cmd}'. Type 'help' for available commands.`,
      };
  }
}
