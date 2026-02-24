/**
 * Plant species data types — matches the schema defined in 02-PLANT-SCHEMA.md.
 *
 * Every plant species is a single JSON object encoding both mechanical behavior
 * (for the simulation engine) and visual appearance (for the parametric SVG renderer).
 * Adding a new species = adding a new JSON file. No code changes required.
 */

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export type GrowthHabit =
  | 'bush'
  | 'indeterminate_vine'
  | 'runner_vine'
  | 'upright'
  | 'rosette'
  | 'grass'
  | 'root_crop'
  | 'climber'
  | 'ground_cover'
  | 'shrub';

export type GrowthStageId =
  | 'seed'
  | 'germination'
  | 'seedling'
  | 'vegetative'
  | 'flowering'
  | 'fruiting'
  | 'senescence';

export interface GrowthStage {
  id: GrowthStageId;
  duration_weeks: [number, number];
  visual_params?: Partial<PlantVisualParams>;
  description: string;
}

export type GrowthRate = 'slow' | 'moderate' | 'fast' | 'aggressive';

export interface Growth {
  habit: GrowthHabit;
  stages: GrowthStage[];
  days_to_maturity: [number, number];
  max_height_cm: number;
  max_spread_cm: number;
  growth_rate: GrowthRate;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export type SunLevel = 'full' | 'partial' | 'shade';
export type WaterLevel = 'low' | 'moderate' | 'high';
export type NutrientLevel = 'low' | 'moderate' | 'high';
export type FrostTolerance = 'none' | 'light' | 'moderate' | 'hard';

export interface Nutrients {
  N: NutrientLevel;
  P: NutrientLevel;
  K: NutrientLevel;
}

export interface Needs {
  sun: SunLevel;
  water: WaterLevel;
  soil_ph: [number, number];
  nutrients: Nutrients;
  soil_temp_min_c: number;
  frost_tolerance: FrostTolerance;
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

export type BoltTrigger = 'heat' | 'cold' | 'day_length' | null;

export interface Season {
  sow_window: [number, number];
  transplant_window: [number, number];
  harvest_window: [number, number];
  bolt_trigger: BoltTrigger;
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export type InteractionEffectType =
  | 'pest_resistance'
  | 'growth_rate'
  | 'flavor'
  | 'pollination'
  | 'nutrient_sharing'
  | 'allelopathy'
  | 'shade_benefit';

export interface InteractionEffect {
  type: InteractionEffectType;
  modifier: number;
  radius: number;
}

export interface CompanionEntry {
  species_id: string;
  effects: InteractionEffect[];
  lore: string;
  discovered?: boolean;
}

export interface AntagonistEntry {
  species_id: string;
  effects: InteractionEffect[];
  lore: string;
  discovered?: boolean;
}

// ---------------------------------------------------------------------------
// Vulnerabilities
// ---------------------------------------------------------------------------

export type ConditionTriggerType =
  | 'humidity_high'
  | 'humidity_low'
  | 'temp_high'
  | 'temp_low'
  | 'overwater'
  | 'underwater'
  | 'ph_high'
  | 'ph_low'
  | 'nutrient_deficiency'
  | 'nutrient_excess'
  | 'crowding'
  | 'pest_vector';

export interface ConditionTrigger {
  type: ConditionTriggerType;
  threshold: number;
}

export interface SymptomStage {
  week: number;
  visual_overlay: string;
  description: string;
  reversible: boolean;
}

export interface SymptomProgression {
  stages: SymptomStage[];
  weeks_to_death: number | null;
  spreads: boolean;
  spread_radius: number;
}

export interface Vulnerability {
  condition_id: string;
  susceptibility: number;
  min_stage?: GrowthStageId;
  triggers: ConditionTrigger[];
  symptoms: SymptomProgression;
}

// ---------------------------------------------------------------------------
// Spread behavior
// ---------------------------------------------------------------------------

export interface RunnerSpread {
  /** Per-tick probability of attempting to spread to an adjacent empty plot. */
  rate: number;
  /** Maximum Chebyshev distance for runner reach. */
  radius: number;
  /** Plant must be at least this stage to start spreading. */
  min_stage: GrowthStageId;
}

export interface SelfSeedBehavior {
  /** Probability per tick (during harvest/senescence) of producing a volunteer seed. */
  rate: number;
}

export interface SpreadBehavior {
  runner?: RunnerSpread;
  self_seed?: SelfSeedBehavior;
}

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

export type HarvestType = 'fruit' | 'leaf' | 'root' | 'flower' | 'seed' | 'whole';

export interface Harvest {
  yield_potential: number;
  seed_saving: boolean;
  harvest_type: HarvestType;
  continuous_harvest: boolean;
}

// ---------------------------------------------------------------------------
// Visual parameters
// ---------------------------------------------------------------------------

export type LeafShape =
  | 'simple_oval'
  | 'simple_pointed'
  | 'lobed'
  | 'pinnate_compound'
  | 'palmate'
  | 'linear'
  | 'heart'
  | 'needle';

export type LeafDistribution = 'alternate' | 'opposite' | 'whorled' | 'basal';

export type FlowerShape = 'simple' | 'composite' | 'spike' | 'umbel' | 'none';

export type FruitShape = 'sphere' | 'oblate' | 'elongated' | 'pod' | 'berry_cluster';

export interface StemVisual {
  height: [number, number];
  thickness: [number, number];
  color: string;
  curve: number;
  branch_frequency: number;
  branch_angle: number;
}

export interface LeavesVisual {
  shape: LeafShape;
  count: [number, number];
  size: [number, number];
  color: string;
  droop: [number, number];
  distribution: LeafDistribution;
  opacity: [number, number];
}

export interface FlowersVisual {
  shape: FlowerShape;
  petal_count: number;
  color: string;
  size: number;
  bloom_density: number;
}

export interface FruitVisual {
  shape: FruitShape;
  size: [number, number];
  color_unripe: string;
  color_ripe: string;
  cluster_count: number;
  hang_angle: number;
}

export interface AnimationParams {
  sway_amplitude: number;
  sway_frequency: number;
  growth_spring_tension: number;
  idle_breathing: number;
}

export interface PlantVisualParams {
  stem: StemVisual;
  leaves: LeavesVisual;
  flowers: FlowersVisual | null;
  fruit: FruitVisual | null;
  animation: AnimationParams;
}

// ---------------------------------------------------------------------------
// Lore / encyclopedia
// ---------------------------------------------------------------------------

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Lore {
  description: string;
  origin: string;
  fun_fact: string;
  difficulty: Difficulty;
}

// ---------------------------------------------------------------------------
// Top-level species
// ---------------------------------------------------------------------------

export type PlantType = 'annual' | 'biennial' | 'perennial';

export interface PlantSpecies {
  id: string;
  common_name: string;
  botanical_name: string;
  family: string;
  type: PlantType;
  growth: Growth;
  needs: Needs;
  season: Season;
  companions: CompanionEntry[];
  antagonists: AntagonistEntry[];
  vulnerabilities: Vulnerability[];
  harvest: Harvest;
  spreading?: SpreadBehavior;
  visual: PlantVisualParams;
  lore: Lore;
}
