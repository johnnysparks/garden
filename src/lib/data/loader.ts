/**
 * Species data loader.
 *
 * Uses Vite's glob import to load all species JSON files at build time.
 * Each species is validated against the Zod schema on first access in dev mode.
 */

import { PlantSpeciesSchema } from './schema.js';
import type { PlantSpecies } from './types.js';

// Vite glob import — eagerly loads every JSON file under species/
// With `import: 'default'`, the resolved type is the default export directly.
const speciesModules = import.meta.glob<PlantSpecies>(
  './species/*.json',
  { eager: true, import: 'default' },
);

/** All loaded species, keyed by species id. */
const speciesMap = new Map<string, PlantSpecies>();

/** Validation errors collected during loading (empty if all valid). */
const loadErrors: Array<{ file: string; errors: string[] }> = [];

for (const [path, data] of Object.entries(speciesModules)) {
  const result = PlantSpeciesSchema.safeParse(data);

  if (result.success) {
    speciesMap.set(result.data.id, data as PlantSpecies);
  } else {
    loadErrors.push({
      file: path,
      errors: result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }
}

if (loadErrors.length > 0) {
  console.error('[species-loader] Validation errors found:');
  for (const { file, errors } of loadErrors) {
    console.error(`  ${file}:`);
    for (const err of errors) {
      console.error(`    - ${err}`);
    }
  }
}

/**
 * Get a species by id. Returns undefined if not found.
 */
export function getSpecies(id: string): PlantSpecies | undefined {
  return speciesMap.get(id);
}

/**
 * Get a species by id, throwing if not found.
 */
export function getSpeciesOrThrow(id: string): PlantSpecies {
  const species = speciesMap.get(id);
  if (!species) {
    throw new Error(`Unknown species id: "${id}"`);
  }
  return species;
}

/**
 * Get all loaded species as an array.
 */
export function getAllSpecies(): PlantSpecies[] {
  return Array.from(speciesMap.values());
}

/**
 * Get all species ids.
 */
export function getAllSpeciesIds(): string[] {
  return Array.from(speciesMap.keys());
}

/**
 * Returns any validation errors encountered during loading.
 */
export function getLoadErrors(): ReadonlyArray<{ file: string; errors: string[] }> {
  return loadErrors;
}
