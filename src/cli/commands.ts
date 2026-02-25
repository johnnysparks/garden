/**
 * Command parser and dispatcher for the CLI.
 *
 * Parses one-line text commands, validates arguments, and dispatches to
 * the session's action methods + formatter. Game logic (phase/energy/bounds
 * validation, event dispatch, ECS mutations) lives in the session; this
 * module handles text I/O only.
 */

import { writeFileSync } from 'node:fs';
import { TurnPhase } from '../lib/engine/turn-manager.js';
import type { CliSession } from './session.js';
import { getAllSpecies, getAllAmendments, getAmendment } from './data-loader.js';
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
  formatScore,
} from './formatter.js';

// ── Command result ───────────────────────────────────────────────────

export interface CommandResult {
  output: string;
  quit?: boolean;
}

// ── Parse helpers ────────────────────────────────────────────────────

export function parseRowCol(args: string[]): { row: number; col: number } | string {
  if (args.length < 2) return 'Missing ROW COL arguments.';
  const row = parseInt(args[0], 10);
  const col = parseInt(args[1], 10);
  if (isNaN(row) || isNaN(col)) return 'ROW and COL must be numbers.';
  return { row, col };
}

/**
 * After an action that spent energy, if the action exhausted energy and
 * auto-transitioned to DUSK, format the dusk tick + advance results and
 * auto-advance through non-interactive phases to DAWN.
 * Returns empty string if still in ACT.
 */
export function formatAutoAdvance(session: CliSession): string {
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
      if (!session.inBounds(rc.row, rc.col)) {
        return { output: `Error: Plot [${rc.row}, ${rc.col}] out of bounds. Grid is ${session.gridRows}x${session.gridCols} (valid: 0-${session.gridRows - 1}).` };
      }
      return { output: formatInspect(session, rc.row, rc.col) };
    }

    case 'weather':
      return { output: formatWeather(session) };

    case 'plants':
      return { output: formatPlants(session) };

    case 'soil': {
      const rc = parseRowCol(args);
      if (typeof rc === 'string') return { output: `Error: ${rc}` };
      if (!session.inBounds(rc.row, rc.col)) {
        return { output: `Error: Plot [${rc.row}, ${rc.col}] out of bounds. Grid is ${session.gridRows}x${session.gridCols} (valid: 0-${session.gridRows - 1}).` };
      }
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
      return { output: formatScore(session) };

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
      if (session.isRunEnded()) {
        outputParts.push(formatScore(session));
      }
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
      if (session.isRunEnded()) {
        outputParts.push(formatScore(session));
      }
      return { output: outputParts.join('\n\n') };
    }

    // ── Action commands (ACT phase) ─────────────────────────────────
    //
    // Each action delegates to session.*Action() for validation + execution,
    // then handles CLI-specific arg parsing and output formatting.

    case 'plant': {
      if (args.length < 3) {
        return { output: 'Error: Usage: plant SPECIES_ID ROW COL' };
      }
      const speciesId = args[0];
      const rc = parseRowCol(args.slice(1));
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      const result = session.plantAction(speciesId, rc.row, rc.col);
      if (!result.ok) return { output: `Error: ${result.error}` };

      const species = session.speciesLookup(speciesId);
      const energy = session.getEnergy();
      let output = `Planted ${species?.common_name ?? speciesId} (${speciesId}) at [${rc.row}, ${rc.col}]. Energy: ${energy.current}/${energy.max}`;
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'amend': {
      if (args.length < 3) {
        return { output: 'Error: Usage: amend AMENDMENT ROW COL' };
      }
      const amendmentId = args[0];
      const rc = parseRowCol(args.slice(1));
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      // Look up the amendment definition (CLI-specific data loading)
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

      const result = session.amendAction(rc.row, rc.col, amendmentDef);
      if (!result.ok) return { output: `Error: ${result.error}` };

      const energy = session.getEnergy();
      let output = `Applied ${amendmentDef.name} to [${rc.row}, ${rc.col}]. Energy: ${energy.current}/${energy.max}`;
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'diagnose': {
      const rc = parseRowCol(args);
      if (typeof rc === 'string') return { output: `Error: ${rc}` };

      const result = session.diagnoseAction(rc.row, rc.col);
      if (!result.ok) return { output: `Error: ${result.error}` };

      let output = formatDiagnose(session, rc.row, rc.col);
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'intervene': {
      if (args.length < 3) {
        return { output: 'Error: Usage: intervene ACTION ROW COL [CONDITION]' };
      }
      const action = args[0];
      const rc = parseRowCol(args.slice(1));
      if (typeof rc === 'string') return { output: `Error: ${rc}` };
      // Optional: explicit target condition (4th arg after ACTION ROW COL)
      const targetCondition = args.length >= 4 ? args[3] : undefined;

      const result = session.interveneAction(action, rc.row, rc.col, targetCondition);
      if (!result.ok) return { output: `Error: ${result.error}` };

      const energy = session.getEnergy();
      let output = `Intervened on ${result.plant.speciesId} at [${rc.row}, ${rc.col}]: ${action}. Energy: ${energy.current}/${energy.max}`;
      if (targetCondition) {
        output += `\nTreating: ${targetCondition}`;
      }
      output += '\nFeedback will appear in 1-2 weeks.';
      const autoAdv = formatAutoAdvance(session);
      if (autoAdv) output += '\n\n' + autoAdv;
      return { output };
    }

    case 'scout': {
      if (args.length < 1) {
        return { output: 'Error: Usage: scout TARGET (weather, pests, soil)' };
      }
      const target = args[0];

      const result = session.scoutAction(target);
      if (!result.ok) return { output: `Error: ${result.error}` };

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
      if (session.getPhase() !== TurnPhase.ACT) {
        return { output: `Error: Not in ACT phase (current: ${session.getPhase()}).` };
      }

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
      if (session.isRunEnded()) {
        outputParts.push(formatScore(session));
      }
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
