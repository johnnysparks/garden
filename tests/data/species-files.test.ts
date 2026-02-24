import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlantSpeciesSchema } from '../../src/lib/data/schema.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const speciesDir = join(__dirname, '..', '..', 'src', 'lib', 'data', 'species');

describe('species JSON files', () => {
  it('should have at least one species file', async () => {
    const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('all species files are valid JSON and pass schema validation', async () => {
    const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const raw = await readFile(join(speciesDir, file), 'utf-8');
      const data = JSON.parse(raw);
      const result = PlantSpeciesSchema.safeParse(data);

      if (!result.success) {
        const errors = result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('\n');
        throw new Error(`${file} failed validation:\n${errors}`);
      }

      expect(result.success).toBe(true);
    }
  });

  it('species id matches filename for all files', async () => {
    const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const raw = await readFile(join(speciesDir, file), 'utf-8');
      const data = JSON.parse(raw);
      const expectedId = file.replace(/\.json$/, '');
      expect(data.id).toBe(expectedId);
    }
  });

  it('all companion/antagonist species_ids are snake_case', async () => {
    const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));
    const snakeCase = /^[a-z][a-z0-9_]*$/;

    for (const file of files) {
      const raw = await readFile(join(speciesDir, file), 'utf-8');
      const data = JSON.parse(raw);

      for (const c of data.companions ?? []) {
        expect(c.species_id).toMatch(snakeCase);
      }
      for (const a of data.antagonists ?? []) {
        expect(a.species_id).toMatch(snakeCase);
      }
    }
  });

  it('all growth stages use valid stage ids', async () => {
    const validStages = new Set([
      'seed',
      'germination',
      'seedling',
      'vegetative',
      'flowering',
      'fruiting',
      'senescence',
    ]);

    const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const raw = await readFile(join(speciesDir, file), 'utf-8');
      const data = JSON.parse(raw);

      for (const stage of data.growth.stages) {
        expect(validStages.has(stage.id)).toBe(true);
      }
    }
  });

  it('no duplicate species ids', async () => {
    const files = (await readdir(speciesDir)).filter((f) => f.endsWith('.json'));
    const ids = new Set<string>();

    for (const file of files) {
      const raw = await readFile(join(speciesDir, file), 'utf-8');
      const data = JSON.parse(raw);
      expect(ids.has(data.id)).toBe(false);
      ids.add(data.id);
    }
  });
});
