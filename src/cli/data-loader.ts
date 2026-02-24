/**
 * Node-compatible data loader for CLI.
 *
 * Reads species JSON from disk using fs instead of Vite's import.meta.glob.
 * Validates each file against the Zod schema. Returns a SpeciesLookup function
 * compatible with the engine's SimulationContext.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlantSpeciesSchema } from '../lib/data/schema.js';
import { ClimateZoneSchema, type ClimateZone } from '../lib/engine/weather-gen.js';
import type { PlantSpecies, SoilAmendment } from '../lib/data/types.js';
import type { SpeciesLookup } from '../lib/engine/ecs/components.js';

// ── Path resolution ─────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'lib', 'data');
const SPECIES_DIR = join(DATA_DIR, 'species');
const ZONES_DIR = join(DATA_DIR, 'zones');

// ── Species loading ─────────────────────────────────────────────────

/** All loaded species, keyed by species id. */
const speciesMap = new Map<string, PlantSpecies>();

function loadSpecies(): void {
  if (speciesMap.size > 0) return; // already loaded

  const files = readdirSync(SPECIES_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const filePath = join(SPECIES_DIR, file);
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const result = PlantSpeciesSchema.safeParse(raw);

    if (result.success) {
      speciesMap.set(result.data.id, raw as PlantSpecies);
    } else {
      const errors = result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      console.error(`[species-loader] ${file}: ${errors.join(', ')}`);
    }
  }
}

/**
 * Get a SpeciesLookup function for the engine.
 * Loads species from disk on first call.
 */
export function getSpeciesLookup(): SpeciesLookup {
  loadSpecies();
  return (id: string) => speciesMap.get(id);
}

/** Get all loaded species as an array. */
export function getAllSpecies(): PlantSpecies[] {
  loadSpecies();
  return Array.from(speciesMap.values());
}

/** Get all species ids. */
export function getAllSpeciesIds(): string[] {
  loadSpecies();
  return Array.from(speciesMap.keys());
}

// ── Amendment loading ────────────────────────────────────────────────

/** @deprecated Use `SoilAmendment` from `src/lib/data/types.ts` instead. */
export type AmendmentDef = SoilAmendment;

let amendmentsList: SoilAmendment[] | null = null;

function loadAmendments(): void {
  if (amendmentsList !== null) return;

  const filePath = join(DATA_DIR, 'amendments.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  amendmentsList = Array.isArray(raw) ? raw : [];
}

/** Get all available amendments. */
export function getAllAmendments(): SoilAmendment[] {
  loadAmendments();
  return amendmentsList!;
}

/** Look up an amendment by id. */
export function getAmendment(id: string): SoilAmendment | undefined {
  loadAmendments();
  return amendmentsList!.find((a) => a.id === id);
}

// ── Zone loading ────────────────────────────────────────────────────

const zoneMap = new Map<string, ClimateZone>();

function loadZones(): void {
  if (zoneMap.size > 0) return;

  const files = readdirSync(ZONES_DIR).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const filePath = join(ZONES_DIR, file);
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const result = ClimateZoneSchema.safeParse(raw);

    if (result.success) {
      zoneMap.set(result.data.id, raw as ClimateZone);
    } else {
      const errors = result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      console.error(`[zone-loader] ${file}: ${errors.join(', ')}`);
    }
  }
}

/** Get a climate zone by id. */
export function getZone(id: string): ClimateZone | undefined {
  loadZones();
  return zoneMap.get(id);
}

/** Get all loaded zone ids. */
export function getAllZoneIds(): string[] {
  loadZones();
  return Array.from(zoneMap.keys());
}
