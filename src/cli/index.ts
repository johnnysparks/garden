#!/usr/bin/env tsx
/**
 * Perennial CLI — entry point.
 *
 * Thin Node.js wrapper over the game engine. Supports interactive REPL
 * and piped command mode for automated playtesting by LLM agents.
 *
 * Usage:
 *   npx perennial play [--zone ZONE] [--seed N]
 *   npx perennial load PATH
 *   npx perennial cmd "command string"
 */

import { createInterface } from 'node:readline';
import { readFileSync, existsSync } from 'node:fs';
import { createCliSession, type CliSession } from './session.js';
import { getSpeciesLookup, getZone, getAllZoneIds } from './data-loader.js';
import { executeCommand } from './commands.js';
import { formatStatus, formatHelp } from './formatter.js';
import type { GameEvent } from '../lib/state/events.js';
import { createEventLog } from '../lib/state/event-log.js';

// ── Arg parsing ──────────────────────────────────────────────────────

interface CliArgs {
  subcommand: 'play' | 'load' | 'cmd' | 'help';
  zone: string;
  seed: number;
  loadPath?: string;
  cmdString?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node + script path
  const result: CliArgs = {
    subcommand: 'play',
    zone: 'zone_8a',
    seed: Math.floor(Math.random() * 100000),
  };

  if (args.length === 0 || args[0] === 'play') {
    result.subcommand = 'play';
  } else if (args[0] === 'load') {
    result.subcommand = 'load';
    result.loadPath = args[1];
  } else if (args[0] === 'cmd') {
    result.subcommand = 'cmd';
    result.cmdString = args.slice(1).join(' ');
  } else if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    result.subcommand = 'help';
  } else {
    result.subcommand = 'play';
  }

  // Parse --zone and --seed from remaining args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--zone' && args[i + 1]) {
      result.zone = args[i + 1];
      i++;
    } else if (args[i] === '--seed' && args[i + 1]) {
      const s = parseInt(args[i + 1], 10);
      if (!isNaN(s)) result.seed = s;
      i++;
    }
  }

  return result;
}

// ── Session creation ─────────────────────────────────────────────────

function createSession(zoneId: string, seed: number): CliSession | null {
  const zone = getZone(zoneId);
  if (!zone) {
    const available = getAllZoneIds();
    console.error(`Error: Unknown zone '${zoneId}'. Available: ${available.join(', ')}`);
    return null;
  }

  const speciesLookup = getSpeciesLookup();

  return createCliSession({
    seed,
    zone,
    speciesLookup,
  });
}

function loadSession(path: string): CliSession | null {
  if (!existsSync(path)) {
    console.error(`Error: File not found: ${path}`);
    return null;
  }

  const raw = readFileSync(path, 'utf-8');
  let events: GameEvent[];
  try {
    events = JSON.parse(raw);
  } catch {
    console.error(`Error: Invalid JSON in ${path}`);
    return null;
  }

  // Find the RUN_START event to get seed and zone
  const startEvent = events.find((e) => e.type === 'RUN_START');
  if (!startEvent || startEvent.type !== 'RUN_START') {
    console.error('Error: No RUN_START event in save file.');
    return null;
  }

  const zone = getZone(startEvent.zone);
  if (!zone) {
    console.error(`Error: Unknown zone '${startEvent.zone}' in save file.`);
    return null;
  }

  const speciesLookup = getSpeciesLookup();
  const session = createCliSession({
    seed: startEvent.seed,
    zone,
    speciesLookup,
  });

  // Replay events (skip RUN_START since createCliSession already added it)
  for (const event of events.slice(1)) {
    if (event.type === 'PLANT') {
      // Re-create plant entity via shared factory
      session.addPlant(event.species_id, event.plot[0], event.plot[1]);
      session.dispatch(event);
    } else if (event.type === 'ADVANCE_WEEK') {
      // Advance through phases to simulate the week
      session.advancePhase(); // triggers appropriate handlers
    } else {
      session.dispatch(event);
    }
  }

  return session;
}

// ── REPL ─────────────────────────────────────────────────────────────

function startRepl(session: CliSession): void {
  const isInteractive = process.stdin.isTTY;
  const prompt = isInteractive ? 'perennial> ' : '';

  // Show initial status
  console.log(formatStatus(session));
  console.log('');
  if (isInteractive) {
    console.log("Type 'help' for available commands.");
    console.log('');
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt,
    terminal: isInteractive,
  });

  rl.prompt();

  rl.on('line', (line: string) => {
    const result = executeCommand(session, line);

    if (result.output) {
      console.log(result.output);
      console.log('');
    }

    if (result.quit) {
      rl.close();
      return;
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// ── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv);

  if (args.subcommand === 'help') {
    console.log('Perennial — a roguelike gardening simulator');
    console.log('');
    console.log('Usage:');
    console.log('  npx perennial play [--zone ZONE] [--seed N]   Start interactive game');
    console.log('  npx perennial load PATH                       Resume from save file');
    console.log('  npx perennial cmd "COMMAND"                   Run single command');
    console.log('  npx perennial help                            Show this help');
    console.log('');
    console.log('Options:');
    console.log('  --zone ZONE   Climate zone (default: zone_8a)');
    console.log('  --seed N      Random seed for deterministic runs');
    console.log('');
    console.log(formatHelp());
    process.exit(0);
  }

  if (args.subcommand === 'load') {
    if (!args.loadPath) {
      console.error('Error: load requires a file path. Usage: npx perennial load PATH');
      process.exit(1);
    }
    const session = loadSession(args.loadPath);
    if (!session) process.exit(1);
    startRepl(session);
    return;
  }

  if (args.subcommand === 'cmd') {
    if (!args.cmdString) {
      console.error('Error: cmd requires a command string. Usage: npx perennial cmd "COMMAND"');
      process.exit(1);
    }
    const session = createSession(args.zone, args.seed);
    if (!session) process.exit(1);
    const result = executeCommand(session, args.cmdString);
    if (result.output) console.log(result.output);
    process.exit(0);
  }

  // Default: play
  const session = createSession(args.zone, args.seed);
  if (!session) process.exit(1);

  console.log(`Perennial — Season begins. Zone: ${args.zone}, Seed: ${args.seed}`);
  console.log('');
  startRepl(session);
}

main();
