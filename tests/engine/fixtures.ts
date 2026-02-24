/**
 * Shared test fixtures for engine tests.
 * Inline plant species data matching the schema in 02-PLANT-SCHEMA.md.
 */

import type { PlantSpecies } from '../../src/lib/data/types.js';
import type { WeekWeather, Entity, SoilState } from '../../src/lib/engine/ecs/components.js';
import { createWorld, type GameWorld } from '../../src/lib/engine/ecs/world.js';

// ── Minimal tomato species fixture ───────────────────────────────────

export const TOMATO: PlantSpecies = {
  id: 'tomato_cherokee_purple',
  common_name: 'Cherokee Purple Tomato',
  botanical_name: "Solanum lycopersicum 'Cherokee Purple'",
  family: 'Solanaceae',
  type: 'annual',
  growth: {
    habit: 'indeterminate_vine',
    stages: [
      { id: 'seed', duration_weeks: [1, 2], description: 'A seed.' },
      { id: 'germination', duration_weeks: [1, 1], description: 'Germinating.' },
      { id: 'seedling', duration_weeks: [2, 3], description: 'Seedling.' },
      { id: 'vegetative', duration_weeks: [4, 6], description: 'Growing.' },
      { id: 'flowering', duration_weeks: [2, 3], description: 'Flowering.' },
      { id: 'fruiting', duration_weeks: [4, 6], description: 'Fruiting.' },
      { id: 'senescence', duration_weeks: [2, 4], description: 'Declining.' },
    ],
    days_to_maturity: [12, 16],
    max_height_cm: 180,
    max_spread_cm: 60,
    growth_rate: 'fast',
  },
  needs: {
    sun: 'full',
    water: 'moderate',
    soil_ph: [6.0, 6.8],
    nutrients: { N: 'moderate', P: 'high', K: 'high' },
    soil_temp_min_c: 15,
    frost_tolerance: 'none',
  },
  season: {
    sow_window: [4, 8],
    transplant_window: [6, 10],
    harvest_window: [12, 22],
    bolt_trigger: null,
  },
  companions: [
    {
      species_id: 'basil_genovese',
      effects: [{ type: 'pest_resistance', modifier: 0.3, radius: 1 }],
      lore: 'Basil masks tomato scent.',
    },
    {
      species_id: 'carrot_nantes',
      effects: [{ type: 'growth_rate', modifier: 0.1, radius: 1 }],
      lore: 'Carrots loosen soil.',
    },
  ],
  antagonists: [
    {
      species_id: 'fennel',
      effects: [{ type: 'allelopathy', modifier: -0.4, radius: 2 }],
      lore: 'Fennel inhibits tomato growth.',
    },
  ],
  vulnerabilities: [
    {
      condition_id: 'early_blight',
      susceptibility: 0.6,
      triggers: [
        { type: 'humidity_high', threshold: 0.7 },
        { type: 'crowding', threshold: 0.8 },
      ],
      symptoms: {
        stages: [
          { week: 0, visual_overlay: 'lower_leaf_spots', description: 'Spots on leaves.', reversible: true },
          { week: 2, visual_overlay: 'spreading_spots', description: 'Spots spread.', reversible: true },
          { week: 4, visual_overlay: 'stem_lesions', description: 'Stem lesions.', reversible: false },
        ],
        weeks_to_death: 8,
        spreads: true,
        spread_radius: 1,
      },
    },
  ],
  harvest: {
    yield_potential: 7,
    seed_saving: true,
    harvest_type: 'fruit',
    continuous_harvest: true,
  },
  visual: {
    stem: { height: [3, 55], thickness: [0.5, 2.5], color: '#558b2f', curve: 0.35, branch_frequency: 0.4, branch_angle: 45 },
    leaves: { shape: 'pinnate_compound', count: [2, 22], size: [2, 8], color: '#4caf50', droop: [5, 25], distribution: 'alternate', opacity: [0.7, 1.0] },
    flowers: { shape: 'simple', petal_count: 5, color: '#fdd835', size: 1.5, bloom_density: 0.3 },
    fruit: { shape: 'oblate', size: [0.5, 4], color_unripe: '#66bb6a', color_ripe: '#7b3f61', cluster_count: 3, hang_angle: 30 },
    animation: { sway_amplitude: 0.06, sway_frequency: 0.7, growth_spring_tension: 0.4, idle_breathing: 0.01 },
  },
  lore: {
    description: 'A Tennessee heirloom.',
    origin: 'Cherokee Nation, Tennessee',
    fun_fact: 'Dusky color from dual pigments.',
    difficulty: 'intermediate',
  },
};

// ── Minimal basil species fixture ────────────────────────────────────

export const BASIL: PlantSpecies = {
  id: 'basil_genovese',
  common_name: 'Genovese Basil',
  botanical_name: 'Ocimum basilicum',
  family: 'Lamiaceae',
  type: 'annual',
  growth: {
    habit: 'bush',
    stages: [
      { id: 'seed', duration_weeks: [1, 1], description: 'A tiny seed.' },
      { id: 'germination', duration_weeks: [1, 1], description: 'Sprouting.' },
      { id: 'seedling', duration_weeks: [1, 2], description: 'Seedling.' },
      { id: 'vegetative', duration_weeks: [3, 5], description: 'Bushy growth.' },
      { id: 'flowering', duration_weeks: [2, 3], description: 'Flower spikes.' },
      { id: 'fruiting', duration_weeks: [1, 2], description: 'Setting seed.' },
      { id: 'senescence', duration_weeks: [1, 2], description: 'Declining.' },
    ],
    days_to_maturity: [8, 10],
    max_height_cm: 60,
    max_spread_cm: 30,
    growth_rate: 'fast',
  },
  needs: {
    sun: 'full',
    water: 'moderate',
    soil_ph: [6.0, 7.0],
    nutrients: { N: 'moderate', P: 'moderate', K: 'moderate' },
    soil_temp_min_c: 18,
    frost_tolerance: 'none',
  },
  season: {
    sow_window: [6, 10],
    transplant_window: [8, 12],
    harvest_window: [10, 20],
    bolt_trigger: 'heat',
  },
  companions: [
    {
      species_id: 'tomato_cherokee_purple',
      effects: [{ type: 'growth_rate', modifier: 0.15, radius: 1 }],
      lore: 'Tomato and basil thrive together.',
    },
  ],
  antagonists: [],
  vulnerabilities: [],
  harvest: {
    yield_potential: 6,
    seed_saving: true,
    harvest_type: 'leaf',
    continuous_harvest: true,
  },
  visual: {
    stem: { height: [2, 20], thickness: [0.3, 1.2], color: '#558b2f', curve: 0.2, branch_frequency: 0.6, branch_angle: 35 },
    leaves: { shape: 'simple_oval', count: [4, 30], size: [1, 5], color: '#43a047', droop: [0, 10], distribution: 'opposite', opacity: [0.8, 1.0] },
    flowers: { shape: 'spike', petal_count: 4, color: '#ffffff', size: 0.8, bloom_density: 0.5 },
    fruit: null,
    animation: { sway_amplitude: 0.08, sway_frequency: 0.9, growth_spring_tension: 0.5, idle_breathing: 0.015 },
  },
  lore: {
    description: 'Classic Italian basil.',
    origin: 'Genoa, Italy',
    fun_fact: 'Name means "royal plant" in Greek.',
    difficulty: 'beginner',
  },
};

// ── Hardy perennial fixture (survives frost) ─────────────────────────

export const ROSEMARY: PlantSpecies = {
  id: 'rosemary',
  common_name: 'Rosemary',
  botanical_name: 'Salvia rosmarinus',
  family: 'Lamiaceae',
  type: 'perennial',
  growth: {
    habit: 'shrub',
    stages: [
      { id: 'seed', duration_weeks: [2, 3], description: 'Slow germinator.' },
      { id: 'germination', duration_weeks: [2, 3], description: 'Germinating.' },
      { id: 'seedling', duration_weeks: [3, 4], description: 'Tiny seedling.' },
      { id: 'vegetative', duration_weeks: [8, 12], description: 'Woody growth.' },
      { id: 'flowering', duration_weeks: [3, 4], description: 'Blue flowers.' },
      { id: 'fruiting', duration_weeks: [1, 2], description: 'Seeds forming.' },
      { id: 'senescence', duration_weeks: [2, 4], description: 'Dormant period.' },
    ],
    days_to_maturity: [16, 24],
    max_height_cm: 120,
    max_spread_cm: 90,
    growth_rate: 'slow',
  },
  needs: {
    sun: 'full',
    water: 'low',
    soil_ph: [6.0, 7.5],
    nutrients: { N: 'low', P: 'low', K: 'low' },
    soil_temp_min_c: 10,
    frost_tolerance: 'hard',
  },
  season: {
    sow_window: [4, 8],
    transplant_window: [6, 10],
    harvest_window: [12, 30],
    bolt_trigger: null,
  },
  companions: [],
  antagonists: [],
  vulnerabilities: [],
  harvest: {
    yield_potential: 5,
    seed_saving: false,
    harvest_type: 'leaf',
    continuous_harvest: true,
  },
  visual: {
    stem: { height: [3, 40], thickness: [0.4, 2.0], color: '#6d4c2f', curve: 0.15, branch_frequency: 0.7, branch_angle: 40 },
    leaves: { shape: 'needle', count: [10, 80], size: [0.5, 2], color: '#2e7d32', droop: [0, 5], distribution: 'opposite', opacity: [0.9, 1.0] },
    flowers: { shape: 'simple', petal_count: 5, color: '#7986cb', size: 0.5, bloom_density: 0.4 },
    fruit: null,
    animation: { sway_amplitude: 0.03, sway_frequency: 0.5, growth_spring_tension: 0.3, idle_breathing: 0.005 },
  },
  lore: {
    description: 'Aromatic Mediterranean herb.',
    origin: 'Mediterranean basin',
    fun_fact: 'Symbol of remembrance since ancient Greece.',
    difficulty: 'intermediate',
  },
};

// ── Fennel (antagonist for testing) ──────────────────────────────────

export const FENNEL: PlantSpecies = {
  id: 'fennel',
  common_name: 'Fennel',
  botanical_name: 'Foeniculum vulgare',
  family: 'Apiaceae',
  type: 'annual',
  growth: {
    habit: 'upright',
    stages: [
      { id: 'seed', duration_weeks: [1, 2], description: 'Seed.' },
      { id: 'germination', duration_weeks: [1, 2], description: 'Germinating.' },
      { id: 'seedling', duration_weeks: [2, 3], description: 'Seedling.' },
      { id: 'vegetative', duration_weeks: [4, 6], description: 'Growing.' },
      { id: 'flowering', duration_weeks: [2, 3], description: 'Yellow umbels.' },
      { id: 'fruiting', duration_weeks: [2, 3], description: 'Seeds forming.' },
      { id: 'senescence', duration_weeks: [1, 2], description: 'Declining.' },
    ],
    days_to_maturity: [10, 14],
    max_height_cm: 150,
    max_spread_cm: 45,
    growth_rate: 'moderate',
  },
  needs: {
    sun: 'full',
    water: 'moderate',
    soil_ph: [5.5, 7.0],
    nutrients: { N: 'moderate', P: 'moderate', K: 'moderate' },
    soil_temp_min_c: 10,
    frost_tolerance: 'light',
  },
  season: {
    sow_window: [4, 8],
    transplant_window: [6, 10],
    harvest_window: [12, 20],
    bolt_trigger: null,
  },
  companions: [],
  antagonists: [],
  vulnerabilities: [],
  harvest: {
    yield_potential: 5,
    seed_saving: true,
    harvest_type: 'whole',
    continuous_harvest: false,
  },
  visual: {
    stem: { height: [3, 45], thickness: [0.4, 1.5], color: '#7cb342', curve: 0.1, branch_frequency: 0.3, branch_angle: 30 },
    leaves: { shape: 'pinnate_compound', count: [4, 16], size: [2, 8], color: '#8bc34a', droop: [5, 15], distribution: 'alternate', opacity: [0.8, 1.0] },
    flowers: { shape: 'umbel', petal_count: 5, color: '#fdd835', size: 1.0, bloom_density: 0.6 },
    fruit: null,
    animation: { sway_amplitude: 0.07, sway_frequency: 0.8, growth_spring_tension: 0.4, idle_breathing: 0.01 },
  },
  lore: {
    description: 'The garden antagonist.',
    origin: 'Mediterranean',
    fun_fact: 'Ancient Romans believed it improved eyesight.',
    difficulty: 'intermediate',
  },
};

// ── Convenience helpers ──────────────────────────────────────────────

export const ALL_SPECIES = [TOMATO, BASIL, ROSEMARY, FENNEL];

export function makeSpeciesLookup(
  species: PlantSpecies[] = ALL_SPECIES,
): (id: string) => PlantSpecies | undefined {
  const map = new Map(species.map((s) => [s.id, s]));
  return (id) => map.get(id);
}

export function makeDefaultSoil(): SoilState {
  return {
    ph: 6.5,
    nitrogen: 0.6,
    phosphorus: 0.6,
    potassium: 0.6,
    organic_matter: 0.5,
    moisture: 0.5,
    temperature_c: 22,
    compaction: 0.2,
    biology: 0.5,
  };
}

export function makeDefaultWeather(overrides: Partial<WeekWeather> = {}): WeekWeather {
  return {
    week: 10,
    temp_high_c: 28,
    temp_low_c: 16,
    precipitation_mm: 20,
    humidity: 0.5,
    wind: 'light',
    frost: false,
    special: null,
    ...overrides,
  };
}

/**
 * Create a world with a single plot at (row, col) that has default soil,
 * and optionally plant a species on it.
 */
export function setupSinglePlot(
  world: GameWorld,
  row: number,
  col: number,
  soil?: Partial<SoilState>,
): void {
  world.add({
    plotSlot: { row, col },
    soil: { ...makeDefaultSoil(), ...soil },
    sunExposure: { level: 'full' },
  });
}

export function plantSpecies(
  world: GameWorld,
  speciesId: string,
  row: number,
  col: number,
): Entity {
  return world.add({
    plotSlot: { row, col },
    species: { speciesId },
    growth: { progress: 0, stage: 'seed', rate_modifier: 1 },
    health: { value: 1, stress: 0 },
    activeConditions: { conditions: [] },
    companionBuffs: { buffs: [] },
  });
}
