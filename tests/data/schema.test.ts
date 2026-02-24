import { describe, it, expect } from 'vitest';
import { PlantSpeciesSchema } from '../../src/lib/data/schema.js';
import tomatoData from '../../src/lib/data/species/tomato_cherokee_purple.json';
import basilData from '../../src/lib/data/species/basil_genovese.json';

describe('PlantSpeciesSchema', () => {
  describe('valid species files', () => {
    it('validates tomato_cherokee_purple.json', () => {
      const result = PlantSpeciesSchema.safeParse(tomatoData);
      if (!result.success) {
        console.error(result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it('validates basil_genovese.json', () => {
      const result = PlantSpeciesSchema.safeParse(basilData);
      if (!result.success) {
        console.error(result.error.issues);
      }
      expect(result.success).toBe(true);
    });
  });

  describe('id format', () => {
    it('rejects ids with uppercase', () => {
      const data = { ...tomatoData, id: 'TomatoCherokee' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects ids with spaces', () => {
      const data = { ...tomatoData, id: 'tomato cherokee' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects empty ids', () => {
      const data = { ...tomatoData, id: '' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('growth validation', () => {
    it('rejects invalid growth habit', () => {
      const data = {
        ...tomatoData,
        growth: { ...tomatoData.growth, habit: 'flying' },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects invalid growth rate', () => {
      const data = {
        ...tomatoData,
        growth: { ...tomatoData.growth, growth_rate: 'supersonic' },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('requires at least one growth stage', () => {
      const data = {
        ...tomatoData,
        growth: { ...tomatoData.growth, stages: [] },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('needs validation', () => {
    it('rejects invalid sun level', () => {
      const data = {
        ...tomatoData,
        needs: { ...tomatoData.needs, sun: 'ultraviolet' },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects invalid frost tolerance', () => {
      const data = {
        ...tomatoData,
        needs: { ...tomatoData.needs, frost_tolerance: 'invincible' },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('interaction validation', () => {
    it('rejects modifier out of range (> 1)', () => {
      const data = {
        ...tomatoData,
        companions: [
          {
            species_id: 'test',
            effects: [{ type: 'growth_rate', modifier: 1.5, radius: 1 }],
            lore: 'test',
          },
        ],
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects modifier out of range (< -1)', () => {
      const data = {
        ...tomatoData,
        companions: [
          {
            species_id: 'test',
            effects: [{ type: 'growth_rate', modifier: -1.5, radius: 1 }],
            lore: 'test',
          },
        ],
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('vulnerability validation', () => {
    it('rejects susceptibility > 1', () => {
      const data = {
        ...tomatoData,
        vulnerabilities: [
          {
            ...tomatoData.vulnerabilities[0],
            susceptibility: 1.5,
          },
        ],
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects susceptibility < 0', () => {
      const data = {
        ...tomatoData,
        vulnerabilities: [
          {
            ...tomatoData.vulnerabilities[0],
            susceptibility: -0.1,
          },
        ],
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('visual validation', () => {
    it('rejects invalid hex color', () => {
      const data = {
        ...tomatoData,
        visual: {
          ...tomatoData.visual,
          stem: { ...tomatoData.visual.stem, color: 'green' },
        },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('accepts null flowers', () => {
      const data = {
        ...tomatoData,
        visual: { ...tomatoData.visual, flowers: null },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('accepts null fruit', () => {
      const data = {
        ...tomatoData,
        visual: { ...tomatoData.visual, fruit: null },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('harvest validation', () => {
    it('rejects yield_potential > 10', () => {
      const data = {
        ...tomatoData,
        harvest: { ...tomatoData.harvest, yield_potential: 15 },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects yield_potential < 1', () => {
      const data = {
        ...tomatoData,
        harvest: { ...tomatoData.harvest, yield_potential: 0 },
      };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('type validation', () => {
    it('accepts annual', () => {
      const data = { ...tomatoData, type: 'annual' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('accepts biennial', () => {
      const data = { ...tomatoData, type: 'biennial' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('accepts perennial', () => {
      const data = { ...tomatoData, type: 'perennial' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const data = { ...tomatoData, type: 'immortal' };
      const result = PlantSpeciesSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('missing required fields', () => {
    it('rejects missing id', () => {
      const { id, ...rest } = tomatoData;
      const result = PlantSpeciesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing growth', () => {
      const { growth, ...rest } = tomatoData;
      const result = PlantSpeciesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing visual', () => {
      const { visual, ...rest } = tomatoData;
      const result = PlantSpeciesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects missing lore', () => {
      const { lore, ...rest } = tomatoData;
      const result = PlantSpeciesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });
});
