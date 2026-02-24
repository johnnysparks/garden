/**
 * Zod validation schemas for plant species JSON files.
 *
 * Used at build time (via validate-species script) and in tests to ensure
 * all species JSON files conform to the schema defined in 02-PLANT-SCHEMA.md.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

const GrowthHabitSchema = z.enum([
  'bush',
  'indeterminate_vine',
  'runner_vine',
  'upright',
  'rosette',
  'grass',
  'root_crop',
  'climber',
  'ground_cover',
  'shrub',
]);

const GrowthStageIdSchema = z.enum([
  'seed',
  'germination',
  'seedling',
  'vegetative',
  'flowering',
  'fruiting',
  'senescence',
]);

const GrowthRateSchema = z.enum(['slow', 'moderate', 'fast', 'aggressive']);

// Forward-declared; the full PlantVisualParamsSchema is defined below.
// Growth stages only use a Partial<PlantVisualParams>, so we use passthrough
// for that nested field and validate the full visual at the top level.
const GrowthStageSchema = z.object({
  id: GrowthStageIdSchema,
  duration_weeks: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  visual_params: z.record(z.string(), z.unknown()).optional(),
  description: z.string().min(1),
});

const GrowthSchema = z.object({
  habit: GrowthHabitSchema,
  stages: z.array(GrowthStageSchema).min(1),
  days_to_maturity: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  max_height_cm: z.number().positive(),
  max_spread_cm: z.number().positive(),
  growth_rate: GrowthRateSchema,
});

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

const SunLevelSchema = z.enum(['full', 'partial', 'shade']);
const WaterLevelSchema = z.enum(['low', 'moderate', 'high']);
const NutrientLevelSchema = z.enum(['low', 'moderate', 'high']);
const FrostToleranceSchema = z.enum(['none', 'light', 'moderate', 'hard']);

const NutrientsSchema = z.object({
  N: NutrientLevelSchema,
  P: NutrientLevelSchema,
  K: NutrientLevelSchema,
});

const NeedsSchema = z.object({
  sun: SunLevelSchema,
  water: WaterLevelSchema,
  soil_ph: z.tuple([z.number(), z.number()]),
  nutrients: NutrientsSchema,
  soil_temp_min_c: z.number(),
  frost_tolerance: FrostToleranceSchema,
});

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

const BoltTriggerSchema = z
  .enum(['heat', 'cold', 'day_length'])
  .nullable();

const SeasonSchema = z.object({
  sow_window: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  transplant_window: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  harvest_window: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  bolt_trigger: BoltTriggerSchema,
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

const InteractionEffectTypeSchema = z.enum([
  'pest_resistance',
  'growth_rate',
  'flavor',
  'pollination',
  'nutrient_sharing',
  'allelopathy',
  'shade_benefit',
]);

const InteractionEffectSchema = z.object({
  type: InteractionEffectTypeSchema,
  modifier: z.number().min(-1).max(1),
  radius: z.number().nonnegative(),
});

const CompanionEntrySchema = z.object({
  species_id: z.string().min(1),
  effects: z.array(InteractionEffectSchema).min(1),
  lore: z.string().min(1),
  discovered: z.boolean().optional(),
});

const AntagonistEntrySchema = z.object({
  species_id: z.string().min(1),
  effects: z.array(InteractionEffectSchema).min(1),
  lore: z.string().min(1),
  discovered: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Vulnerabilities
// ---------------------------------------------------------------------------

const ConditionTriggerTypeSchema = z.enum([
  'humidity_high',
  'humidity_low',
  'temp_high',
  'temp_low',
  'overwater',
  'underwater',
  'ph_high',
  'ph_low',
  'nutrient_deficiency',
  'nutrient_excess',
  'crowding',
  'pest_vector',
]);

const ConditionTriggerSchema = z.object({
  type: ConditionTriggerTypeSchema,
  threshold: z.number(),
});

const SymptomStageSchema = z.object({
  week: z.number().int().nonnegative(),
  visual_overlay: z.string().min(1),
  description: z.string().min(1),
  reversible: z.boolean(),
});

const SymptomProgressionSchema = z.object({
  stages: z.array(SymptomStageSchema).min(1),
  weeks_to_death: z.number().int().positive().nullable(),
  spreads: z.boolean(),
  spread_radius: z.number().int().nonnegative(),
});

const VulnerabilitySchema = z.object({
  condition_id: z.string().min(1),
  susceptibility: z.number().min(0).max(1),
  min_stage: GrowthStageIdSchema.optional(),
  triggers: z.array(ConditionTriggerSchema).min(1),
  symptoms: SymptomProgressionSchema,
});

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

const HarvestTypeSchema = z.enum(['fruit', 'leaf', 'root', 'flower', 'seed', 'whole']);

const HarvestSchema = z.object({
  yield_potential: z.number().int().min(1).max(10),
  seed_saving: z.boolean(),
  harvest_type: HarvestTypeSchema,
  continuous_harvest: z.boolean(),
});

// ---------------------------------------------------------------------------
// Visual parameters
// ---------------------------------------------------------------------------

const LeafShapeSchema = z.enum([
  'simple_oval',
  'simple_pointed',
  'lobed',
  'pinnate_compound',
  'palmate',
  'linear',
  'heart',
  'needle',
]);

const LeafDistributionSchema = z.enum(['alternate', 'opposite', 'whorled', 'basal']);

const FlowerShapeSchema = z.enum(['simple', 'composite', 'spike', 'umbel', 'none']);
const FruitShapeSchema = z.enum(['sphere', 'oblate', 'elongated', 'pod', 'berry_cluster']);

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color (#RRGGBB)');

const StemVisualSchema = z.object({
  height: z.tuple([z.number(), z.number()]),
  thickness: z.tuple([z.number(), z.number()]),
  color: HexColorSchema,
  curve: z.number().min(0).max(1),
  branch_frequency: z.number().min(0).max(1),
  branch_angle: z.number().min(0).max(180),
});

const LeavesVisualSchema = z.object({
  shape: LeafShapeSchema,
  count: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  size: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  color: HexColorSchema,
  droop: z.tuple([z.number(), z.number()]),
  distribution: LeafDistributionSchema,
  opacity: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
});

const FlowersVisualSchema = z.object({
  shape: FlowerShapeSchema,
  petal_count: z.number().int().nonnegative(),
  color: HexColorSchema,
  size: z.number().nonnegative(),
  bloom_density: z.number().min(0).max(1),
});

const FruitVisualSchema = z.object({
  shape: FruitShapeSchema,
  size: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  color_unripe: HexColorSchema,
  color_ripe: HexColorSchema,
  cluster_count: z.number().int().nonnegative(),
  hang_angle: z.number().min(0).max(180),
});

const AnimationParamsSchema = z.object({
  sway_amplitude: z.number().nonnegative(),
  sway_frequency: z.number().nonnegative(),
  growth_spring_tension: z.number().nonnegative(),
  idle_breathing: z.number().nonnegative(),
});

const PlantVisualParamsSchema = z.object({
  stem: StemVisualSchema,
  leaves: LeavesVisualSchema,
  flowers: FlowersVisualSchema.nullable(),
  fruit: FruitVisualSchema.nullable(),
  animation: AnimationParamsSchema,
});

// ---------------------------------------------------------------------------
// Lore
// ---------------------------------------------------------------------------

const DifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);

const LoreSchema = z.object({
  description: z.string().min(1),
  origin: z.string().min(1),
  fun_fact: z.string().min(1),
  difficulty: DifficultySchema,
});

// ---------------------------------------------------------------------------
// Top-level PlantSpecies schema
// ---------------------------------------------------------------------------

const PlantTypeSchema = z.enum(['annual', 'biennial', 'perennial']);

export const PlantSpeciesSchema = z.object({
  id: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case identifier'),
  common_name: z.string().min(1),
  botanical_name: z.string().min(1),
  family: z.string().min(1),
  type: PlantTypeSchema,
  growth: GrowthSchema,
  needs: NeedsSchema,
  season: SeasonSchema,
  companions: z.array(CompanionEntrySchema),
  antagonists: z.array(AntagonistEntrySchema),
  vulnerabilities: z.array(VulnerabilitySchema),
  harvest: HarvestSchema,
  visual: PlantVisualParamsSchema,
  lore: LoreSchema,
});

export type PlantSpeciesInput = z.input<typeof PlantSpeciesSchema>;
