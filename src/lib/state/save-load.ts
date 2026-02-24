/**
 * Dexie persistence layer for IndexedDB.
 *
 * Schema follows 07-ARCHITECTURE.md. The current run is stored as a
 * serialized event log. Meta-progression tables persist across runs.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { GameEvent } from './events.js';

// ── Table row types ─────────────────────────────────────────────────

export interface CurrentRunRow {
  id: string; // always 'current'
  eventLog: GameEvent[];
  seed: number;
  zone: string;
}

export interface SeedBankRow {
  speciesId: string;
  cultivars: string[];
  discovered_week: number;
}

export interface JournalRow {
  entryId: string;
  type: 'species_page' | 'diagnosis_log' | 'season_summary' | 'discovery';
  content: string;
  run: number;
  week: number;
}

export interface PerennialRow {
  plantId: string;
  speciesId: string;
  years: number;
  health: number;
  plot: [number, number];
}

export interface UnlockedZoneRow {
  zoneId: string;
  best_score: number;
  runs_completed: number;
}

export interface UnlockedToolRow {
  toolId: string;
  unlock_date: string;
}

export interface LifetimeStatsRow {
  id: string; // always 'stats'
  total_runs: number;
  total_species_grown: number;
  total_conditions_diagnosed: number;
  longest_perennial_streak: number;
  best_scores_by_zone: Record<string, number>;
  total_harvests: number;
  total_plants_planted: number;
}

export interface RunHistoryRow {
  id?: number; // auto-increment
  zone: string;
  score: number;
  seed: number;
  weeks_survived: number;
  end_reason: 'frost' | 'abandon' | 'catastrophe';
  species_planted: string[];
  species_harvested: string[];
  timestamp: number;
}

// ── Database class ──────────────────────────────────────────────────

export class PerennialDB extends Dexie {
  currentRun!: EntityTable<CurrentRunRow, 'id'>;
  seedBank!: EntityTable<SeedBankRow, 'speciesId'>;
  journal!: EntityTable<JournalRow, 'entryId'>;
  perennials!: EntityTable<PerennialRow, 'plantId'>;
  unlockedZones!: EntityTable<UnlockedZoneRow, 'zoneId'>;
  unlockedTools!: EntityTable<UnlockedToolRow, 'toolId'>;
  lifetimeStats!: EntityTable<LifetimeStatsRow, 'id'>;
  runHistory!: EntityTable<RunHistoryRow, 'id'>;

  constructor(name = 'PerennialDB') {
    super(name);

    this.version(1).stores({
      currentRun: 'id',
      seedBank: 'speciesId',
      journal: 'entryId',
      perennials: 'plantId',
      unlockedZones: 'zoneId',
      unlockedTools: 'toolId',
      lifetimeStats: 'id',
      runHistory: '++id, zone, score',
    });
  }
}

// ── Singleton instance ──────────────────────────────────────────────

let db: PerennialDB | null = null;

export function getDB(name?: string): PerennialDB {
  if (!db) {
    db = new PerennialDB(name);
  }
  return db;
}

/** Replace the DB instance (useful for tests with in-memory DBs). */
export function setDB(instance: PerennialDB): void {
  db = instance;
}

/** Close and clear the singleton (for cleanup). */
export async function closeDB(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Save / Load current run ─────────────────────────────────────────

export async function saveCurrentRun(
  eventLog: GameEvent[],
  seed: number,
  zone: string,
): Promise<void> {
  const database = getDB();
  await database.currentRun.put({
    id: 'current',
    eventLog,
    seed,
    zone,
  });
}

export async function loadCurrentRun(): Promise<CurrentRunRow | undefined> {
  const database = getDB();
  return database.currentRun.get('current');
}

export async function deleteCurrentRun(): Promise<void> {
  const database = getDB();
  await database.currentRun.delete('current');
}

// ── Lifetime stats helpers ──────────────────────────────────────────

export function createDefaultStats(): LifetimeStatsRow {
  return {
    id: 'stats',
    total_runs: 0,
    total_species_grown: 0,
    total_conditions_diagnosed: 0,
    longest_perennial_streak: 0,
    best_scores_by_zone: {},
    total_harvests: 0,
    total_plants_planted: 0,
  };
}

export async function getLifetimeStats(): Promise<LifetimeStatsRow> {
  const database = getDB();
  const stats = await database.lifetimeStats.get('stats');
  return stats ?? createDefaultStats();
}

export async function updateLifetimeStats(
  updater: (stats: LifetimeStatsRow) => LifetimeStatsRow,
): Promise<void> {
  const database = getDB();
  const current = await getLifetimeStats();
  await database.lifetimeStats.put(updater(current));
}
