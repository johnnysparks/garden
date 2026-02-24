/**
 * Meta-progression state — persists across runs.
 *
 * Svelte stores backed by Dexie. These are loaded once at app startup
 * and updated when runs end. Covers: seed bank, journal entries,
 * unlocked zones, unlocked tools, lifetime stats.
 */

import { writable, type Writable } from 'svelte/store';
import type { RunState } from './event-log.js';
import {
  getDB,
  createDefaultStats,
  type SeedBankRow,
  type JournalRow,
  type UnlockedZoneRow,
  type UnlockedToolRow,
  type LifetimeStatsRow,
  type RunHistoryRow,
} from './save-load.js';

// ── Stores ──────────────────────────────────────────────────────────

export const seedBank: Writable<SeedBankRow[]> = writable([]);
export const journal: Writable<JournalRow[]> = writable([]);
export const unlockedZones: Writable<UnlockedZoneRow[]> = writable([]);
export const unlockedTools: Writable<UnlockedToolRow[]> = writable([]);
export const lifetimeStats: Writable<LifetimeStatsRow> = writable(createDefaultStats());
export const runHistory: Writable<RunHistoryRow[]> = writable([]);

// ── Load from DB ────────────────────────────────────────────────────

export async function loadMetaProgression(): Promise<void> {
  const db = getDB();

  const [seeds, entries, zones, tools, stats, history] = await Promise.all([
    db.seedBank.toArray(),
    db.journal.toArray(),
    db.unlockedZones.toArray(),
    db.unlockedTools.toArray(),
    db.lifetimeStats.get('stats'),
    db.runHistory.toArray(),
  ]);

  seedBank.set(seeds);
  journal.set(entries);
  unlockedZones.set(zones);
  unlockedTools.set(tools);
  lifetimeStats.set(stats ?? createDefaultStats());
  runHistory.set(history);
}

// ── Seed bank operations ────────────────────────────────────────────

export async function addToSeedBank(speciesId: string, week: number): Promise<void> {
  const db = getDB();
  const existing = await db.seedBank.get(speciesId);

  if (!existing) {
    const row: SeedBankRow = {
      speciesId,
      cultivars: [],
      discovered_week: week,
    };
    await db.seedBank.put(row);
    seedBank.update((arr) => [...arr, row]);
  }
}

export async function addCultivar(speciesId: string, cultivar: string): Promise<void> {
  const db = getDB();
  const existing = await db.seedBank.get(speciesId);

  if (existing && !existing.cultivars.includes(cultivar)) {
    existing.cultivars = [...existing.cultivars, cultivar];
    await db.seedBank.put(existing);
    seedBank.update((arr) => arr.map((s) => (s.speciesId === speciesId ? existing : s)));
  }
}

// ── Journal operations ──────────────────────────────────────────────

export async function addJournalEntry(entry: JournalRow): Promise<void> {
  const db = getDB();
  await db.journal.put(entry);
  journal.update((arr) => [...arr, entry]);
}

// ── Zone operations ─────────────────────────────────────────────────

export async function unlockZone(
  zoneId: string,
  score: number,
): Promise<void> {
  const db = getDB();
  const existing = await db.unlockedZones.get(zoneId);

  if (existing) {
    const updated: UnlockedZoneRow = {
      ...existing,
      runs_completed: existing.runs_completed + 1,
      best_score: Math.max(existing.best_score, score),
    };
    await db.unlockedZones.put(updated);
    unlockedZones.update((arr) =>
      arr.map((z) => (z.zoneId === zoneId ? updated : z)),
    );
  } else {
    const row: UnlockedZoneRow = {
      zoneId,
      best_score: score,
      runs_completed: 1,
    };
    await db.unlockedZones.put(row);
    unlockedZones.update((arr) => [...arr, row]);
  }
}

// ── Tool operations ─────────────────────────────────────────────────

export async function unlockTool(toolId: string): Promise<void> {
  const db = getDB();
  const existing = await db.unlockedTools.get(toolId);

  if (!existing) {
    const row: UnlockedToolRow = {
      toolId,
      unlock_date: new Date().toISOString(),
    };
    await db.unlockedTools.put(row);
    unlockedTools.update((arr) => [...arr, row]);
  }
}

// ── Run completion ──────────────────────────────────────────────────

/**
 * Process run completion: update lifetime stats, seed bank, journal,
 * zone progress, and run history. Called when a RUN_END event fires.
 */
export async function processRunEnd(
  runState: RunState,
  score: number,
): Promise<void> {
  const db = getDB();

  // 1. Record run in history
  const historyEntry: RunHistoryRow = {
    zone: runState.zone,
    score,
    seed: runState.seed,
    weeks_survived: runState.currentWeek,
    end_reason: runState.endReason ?? 'abandon',
    species_planted: [...new Set(runState.plants.map((p) => p.species_id))],
    species_harvested: [
      ...new Set(
        runState.harvests.map((h) => {
          const plant = runState.plants.find(
            (p) => h.plant_id === `${p.species_id}@${p.plot[0]},${p.plot[1]}`,
          );
          return plant?.species_id ?? h.plant_id;
        }),
      ),
    ],
    timestamp: Date.now(),
  };
  await db.runHistory.add(historyEntry);
  runHistory.update((arr) => [...arr, historyEntry]);

  // 2. Add harvested species to seed bank
  for (const harvest of runState.harvests) {
    const plant = runState.plants.find(
      (p) => harvest.plant_id === `${p.species_id}@${p.plot[0]},${p.plot[1]}`,
    );
    if (plant) {
      await addToSeedBank(plant.species_id, harvest.week);
    }
  }

  // 3. Update zone progress
  await unlockZone(runState.zone, score);

  // 4. Add season summary journal entry
  const summaryEntry: JournalRow = {
    entryId: `summary_${runState.seed}_${Date.now()}`,
    type: 'season_summary',
    content: `Season in ${runState.zone}: ${runState.currentWeek} weeks, ${runState.harvests.length} harvests, score ${score}`,
    run: runState.seed,
    week: runState.currentWeek,
  };
  await addJournalEntry(summaryEntry);

  // 5. Update lifetime stats
  const stats = (await db.lifetimeStats.get('stats')) ?? createDefaultStats();
  const uniqueSpecies = new Set(runState.plants.map((p) => p.species_id));

  stats.total_runs += 1;
  stats.total_species_grown += uniqueSpecies.size;
  stats.total_conditions_diagnosed += runState.diagnoses.length;
  stats.total_harvests += runState.harvests.length;
  stats.total_plants_planted += runState.plants.length;

  if (!stats.best_scores_by_zone[runState.zone] || score > stats.best_scores_by_zone[runState.zone]) {
    stats.best_scores_by_zone[runState.zone] = score;
  }

  await db.lifetimeStats.put(stats);
  lifetimeStats.set(stats);
}
