/**
 * Build-time species JSON validation script.
 *
 * Reads every JSON file in src/lib/data/species/ and validates it against
 * the PlantSpecies Zod schema. Exits with code 1 if any file fails.
 *
 * Usage: npx tsx scripts/validate-species.ts
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// We duplicate the schema import path to avoid import.meta.glob (Vite-only).
// Re-use the same Zod schema source:
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const speciesDir = join(__dirname, '..', 'src', 'lib', 'data', 'species');

async function main() {
  // Dynamic import of the schema (ESM + TypeScript via tsx)
  const { PlantSpeciesSchema } = await import('../src/lib/data/schema.js');

  const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.warn('⚠  No species JSON files found in', speciesDir);
    process.exit(0);
  }

  let hasErrors = false;

  for (const file of files) {
    const filePath = join(speciesDir, file);
    const raw = await readFile(filePath, 'utf-8');

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error(`✗ ${file}: invalid JSON`);
      hasErrors = true;
      continue;
    }

    const result = PlantSpeciesSchema.safeParse(data);

    if (result.success) {
      // Cross-reference: verify id matches filename
      const expectedId = file.replace(/\.json$/, '');
      if (result.data.id !== expectedId) {
        console.error(
          `✗ ${file}: id "${result.data.id}" does not match filename (expected "${expectedId}")`,
        );
        hasErrors = true;
      } else {
        console.log(`✓ ${file}`);
      }
    } else {
      console.error(`✗ ${file}:`);
      for (const issue of result.error.issues) {
        console.error(`    ${issue.path.join('.')}: ${issue.message}`);
      }
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\nSpecies validation failed.');
    process.exit(1);
  }

  console.log(`\n${files.length} species file(s) validated successfully.`);
}

main();
