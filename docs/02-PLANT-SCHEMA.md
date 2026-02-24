# 02 — Plant Data Schema

## Design Principle

Every plant species is defined as a single JSON object that encodes BOTH mechanical behavior (for the simulation engine) AND visual appearance (for the parametric SVG renderer). Adding a new species = adding a new JSON entry. No code changes required.

## Schema Definition

```typescript
interface PlantSpecies {
  id: string;                    // "tomato_cherokee_purple"
  common_name: string;           // "Cherokee Purple Tomato"
  botanical_name: string;        // "Solanum lycopersicum"
  family: string;                // "Solanaceae"
  type: "annual" | "biennial" | "perennial";

  // --- GROWTH ---
  growth: {
    habit: GrowthHabit;
    stages: GrowthStage[];
    days_to_maturity: [number, number];  // range, weeks
    max_height_cm: number;
    max_spread_cm: number;
    growth_rate: "slow" | "moderate" | "fast" | "aggressive";
  };

  // --- REQUIREMENTS ---
  needs: {
    sun: "full" | "partial" | "shade";
    water: "low" | "moderate" | "high";
    soil_ph: [number, number];          // [min, max] ideal range
    nutrients: {
      N: "low" | "moderate" | "high";
      P: "low" | "moderate" | "high";
      K: "low" | "moderate" | "high";
    };
    soil_temp_min_c: number;            // minimum for germination
    frost_tolerance: "none" | "light" | "moderate" | "hard";
  };

  // --- SEASON ---
  season: {
    sow_window: [number, number];       // week range for direct sow
    transplant_window: [number, number]; // week range for transplant
    harvest_window: [number, number];    // weeks after planting
    bolt_trigger: "heat" | "cold" | "day_length" | null;
  };

  // --- INTERACTIONS ---
  companions: CompanionEntry[];
  antagonists: AntagonistEntry[];

  // --- VULNERABILITIES ---
  vulnerabilities: Vulnerability[];

  // --- HARVEST ---
  harvest: {
    yield_potential: number;             // 1-10 scale
    seed_saving: boolean;                // can player save seeds?
    harvest_type: "fruit" | "leaf" | "root" | "flower" | "seed" | "whole";
    continuous_harvest: boolean;         // pick-and-regrow vs one-time
  };

  // --- VISUAL ---
  visual: PlantVisualParams;

  // --- ENCYCLOPEDIA ---
  lore: {
    description: string;                 // 1-2 sentences for journal
    origin: string;                      // geographic origin
    fun_fact: string;                    // memorable detail
    difficulty: "beginner" | "intermediate" | "advanced";
  };
}
```

## Growth Stages

```typescript
type GrowthHabit =
  | "bush"              // tomato determinate, pepper, basil
  | "indeterminate_vine"// tomato indeterminate, cucumber
  | "runner_vine"       // squash, melon
  | "upright"           // corn, sunflower
  | "rosette"           // lettuce, cabbage
  | "grass"             // chives, lemongrass
  | "root_crop"         // carrot, beet (above-ground foliage, below-ground payoff)
  | "climber"           // beans, peas
  | "ground_cover"      // strawberry, thyme
  | "shrub";            // blueberry, rosemary (perennial)

interface GrowthStage {
  id: "seed" | "germination" | "seedling" | "vegetative" | "flowering" | "fruiting" | "senescence";
  duration_weeks: [number, number];  // range
  visual_params: Partial<PlantVisualParams>;  // overrides for this stage
  description: string;               // journal text for first time seeing this stage
}
```

## Companion & Antagonist Entries

```typescript
interface CompanionEntry {
  species_id: string;                // "basil"
  effects: InteractionEffect[];
  lore: string;                      // "Basil's volatile oils confuse tomato hornworm moths"
  discovered: boolean;               // toggled at runtime, not in species def
}

interface AntagonistEntry {
  species_id: string;                // "fennel"
  effects: InteractionEffect[];
  lore: string;
  discovered: boolean;
}

interface InteractionEffect {
  type: "pest_resistance" | "growth_rate" | "flavor" | "pollination"
      | "nutrient_sharing" | "allelopathy" | "shade_benefit";
  modifier: number;                  // -1.0 to 1.0, negative = harmful
  radius: number;                    // in grid cells, typically 1
}
```

## Vulnerabilities

```typescript
interface Vulnerability {
  condition_id: string;              // "powdery_mildew"
  susceptibility: number;            // 0-1, probability weight
  triggers: ConditionTrigger[];
  symptoms: SymptomProgression;
}

interface ConditionTrigger {
  type: "humidity_high" | "humidity_low" | "temp_high" | "temp_low"
      | "overwater" | "underwater" | "ph_high" | "ph_low"
      | "nutrient_deficiency" | "nutrient_excess" | "crowding" | "pest_vector";
  threshold: number;                 // condition-specific
}

interface SymptomProgression {
  stages: SymptomStage[];
  weeks_to_death: number | null;     // null = won't kill, just reduces yield
  spreads: boolean;                  // can infect adjacent plants?
  spread_radius: number;
}

interface SymptomStage {
  week: number;                      // weeks after onset
  visual_overlay: string;            // "interveinal_yellowing" | "leaf_spots" | etc.
  description: string;               // what the player sees in inspection
  reversible: boolean;               // can treatment at this stage still work?
}
```

## Visual Parameters

```typescript
interface PlantVisualParams {
  // --- STEM ---
  stem: {
    height: [number, number];        // [min, max] in SVG units, interpolated by growth
    thickness: [number, number];
    color: string;                   // hex, shifted by season palette
    curve: number;                   // 0 = straight, 1 = very curved
    branch_frequency: number;        // 0-1, how often branches appear
    branch_angle: number;            // degrees from stem
  };

  // --- LEAVES ---
  leaves: {
    shape: LeafShape;
    count: [number, number];         // interpolated by growth stage
    size: [number, number];          // min/max individual leaf size
    color: string;                   // base, modified by health/season
    droop: [number, number];         // angle range, increases with stress
    distribution: "alternate" | "opposite" | "whorled" | "basal";
    opacity: [number, number];       // young leaves more translucent
  };

  // --- FLOWERS ---
  flowers: {
    shape: "simple" | "composite" | "spike" | "umbel" | "none";
    petal_count: number;
    color: string;
    size: number;
    bloom_density: number;           // flowers per branch
  } | null;

  // --- FRUIT ---
  fruit: {
    shape: "sphere" | "oblate" | "elongated" | "pod" | "berry_cluster";
    size: [number, number];          // grows over fruiting stage
    color_unripe: string;
    color_ripe: string;
    cluster_count: number;
    hang_angle: number;              // how much fruit droops from weight
  } | null;

  // --- ANIMATION ---
  animation: {
    sway_amplitude: number;          // wind response magnitude
    sway_frequency: number;          // oscillation speed
    growth_spring_tension: number;   // bounciness of growth transitions
    idle_breathing: number;          // subtle scale oscillation magnitude
  };
}

type LeafShape =
  | "simple_oval"       // basil, spinach
  | "simple_pointed"    // pepper
  | "lobed"             // tomato, oak
  | "pinnate_compound"  // tomato, carrot
  | "palmate"           // squash, cannabis
  | "linear"            // grass, chive
  | "heart"             // bean, sweet potato
  | "needle";           // rosemary, lavender
```

## Example: Complete Tomato Entry

```json
{
  "id": "tomato_cherokee_purple",
  "common_name": "Cherokee Purple Tomato",
  "botanical_name": "Solanum lycopersicum 'Cherokee Purple'",
  "family": "Solanaceae",
  "type": "annual",
  "growth": {
    "habit": "indeterminate_vine",
    "stages": [
      {"id": "seed", "duration_weeks": [1, 2], "description": "A small flat seed, tan with fine hairs."},
      {"id": "germination", "duration_weeks": [1, 1], "description": "First root emerges, pushing the seed coat upward."},
      {"id": "seedling", "duration_weeks": [2, 3], "description": "Cotyledons open. First true leaves are deeply lobed."},
      {"id": "vegetative", "duration_weeks": [4, 6], "description": "Rapid vine growth. Stems thicken and develop characteristic tomato smell when brushed."},
      {"id": "flowering", "duration_weeks": [2, 3], "description": "Small yellow star-shaped flowers in clusters. Each flower can become a fruit."},
      {"id": "fruiting", "duration_weeks": [4, 6], "description": "Green fruits swell, then ripen to deep dusky purple-pink with green shoulders."},
      {"id": "senescence", "duration_weeks": [2, 4], "description": "Vine yellows from base up. Last fruits ripen as plant declines."}
    ],
    "days_to_maturity": [12, 16],
    "max_height_cm": 180,
    "max_spread_cm": 60,
    "growth_rate": "fast"
  },
  "needs": {
    "sun": "full",
    "water": "moderate",
    "soil_ph": [6.0, 6.8],
    "nutrients": {"N": "moderate", "P": "high", "K": "high"},
    "soil_temp_min_c": 15,
    "frost_tolerance": "none"
  },
  "season": {
    "sow_window": [4, 8],
    "transplant_window": [6, 10],
    "harvest_window": [12, 22],
    "bolt_trigger": null
  },
  "companions": [
    {
      "species_id": "basil",
      "effects": [{"type": "pest_resistance", "modifier": 0.3, "radius": 1}],
      "lore": "Basil's aromatic oils mask tomato scent from hornworm moths."
    },
    {
      "species_id": "carrot",
      "effects": [{"type": "growth_rate", "modifier": 0.1, "radius": 1}],
      "lore": "Carrots loosen soil around tomato roots, improving drainage."
    }
  ],
  "antagonists": [
    {
      "species_id": "fennel",
      "effects": [{"type": "allelopathy", "modifier": -0.4, "radius": 2}],
      "lore": "Fennel exudes substances that inhibit tomato growth. Keep them far apart."
    },
    {
      "species_id": "brassica_cabbage",
      "effects": [{"type": "growth_rate", "modifier": -0.2, "radius": 1}],
      "lore": "Heavy feeders competing for the same nutrients."
    }
  ],
  "vulnerabilities": [
    {
      "condition_id": "early_blight",
      "susceptibility": 0.6,
      "triggers": [
        {"type": "humidity_high", "threshold": 0.7},
        {"type": "crowding", "threshold": 0.8}
      ],
      "symptoms": {
        "stages": [
          {"week": 0, "visual_overlay": "lower_leaf_spots", "description": "Dark concentric rings appearing on lowest leaves.", "reversible": true},
          {"week": 2, "visual_overlay": "spreading_spots_yellowing", "description": "Spots spread upward. Affected leaves yellow and drop.", "reversible": true},
          {"week": 4, "visual_overlay": "stem_lesions", "description": "Dark lesions on stems. Fruit may show leathery dark patches.", "reversible": false}
        ],
        "weeks_to_death": 8,
        "spreads": true,
        "spread_radius": 1
      }
    },
    {
      "condition_id": "blossom_end_rot",
      "susceptibility": 0.4,
      "triggers": [
        {"type": "nutrient_deficiency", "threshold": 0.5},
        {"type": "overwater", "threshold": 0.7}
      ],
      "symptoms": {
        "stages": [
          {"week": 0, "visual_overlay": "fruit_base_discolor", "description": "Small water-soaked spot at blossom end of green fruit.", "reversible": true},
          {"week": 1, "visual_overlay": "fruit_base_rot", "description": "Spot enlarges to dark, leathery, sunken area. Calcium uptake issue, often from inconsistent watering.", "reversible": false}
        ],
        "weeks_to_death": null,
        "spreads": false,
        "spread_radius": 0
      }
    }
  ],
  "harvest": {
    "yield_potential": 7,
    "seed_saving": true,
    "harvest_type": "fruit",
    "continuous_harvest": true
  },
  "visual": {
    "stem": {
      "height": [3, 55],
      "thickness": [0.5, 2.5],
      "color": "#558b2f",
      "curve": 0.35,
      "branch_frequency": 0.4,
      "branch_angle": 45
    },
    "leaves": {
      "shape": "pinnate_compound",
      "count": [2, 22],
      "size": [2, 8],
      "color": "#4caf50",
      "droop": [5, 25],
      "distribution": "alternate",
      "opacity": [0.7, 1.0]
    },
    "flowers": {
      "shape": "simple",
      "petal_count": 5,
      "color": "#fdd835",
      "size": 1.5,
      "bloom_density": 0.3
    },
    "fruit": {
      "shape": "oblate",
      "size": [0.5, 4],
      "color_unripe": "#66bb6a",
      "color_ripe": "#7b3f61",
      "cluster_count": 3,
      "hang_angle": 30
    },
    "animation": {
      "sway_amplitude": 0.06,
      "sway_frequency": 0.7,
      "growth_spring_tension": 0.4,
      "idle_breathing": 0.01
    }
  },
  "lore": {
    "description": "A Tennessee heirloom with complex, smoky-sweet flavor and striking purple-pink skin.",
    "origin": "Cherokee Nation, Tennessee, pre-1890",
    "fun_fact": "The dusky color comes from both red and green pigments expressed simultaneously — green chlorophyll persists in the shoulders even when ripe.",
    "difficulty": "intermediate"
  }
}
```

## Starter Species List (v1)

Target: 15-20 species for first playable build.

| Species | Type | Difficulty | Why included |
|---------|------|-----------|--------------|
| Tomato (Cherokee Purple) | Annual | Intermediate | Flagship. Rich interaction set. |
| Basil (Genovese) | Annual | Beginner | Classic companion. Fast feedback loop. |
| Lettuce (Butterhead) | Annual | Beginner | Quick harvest. Bolt mechanic intro. |
| Carrot (Nantes) | Annual | Beginner | Root crop mechanic. Slow reveal. |
| Zucchini | Annual | Beginner | Aggressive growth. Space management. |
| Pepper (Jalapeño) | Annual | Intermediate | Heat/stress interaction. Solanaceae family. |
| Bean (Provider) | Annual | Beginner | Nitrogen fixer. Companion powerhouse. |
| Corn (Golden Bantam) | Annual | Intermediate | Three Sisters combo. Height mechanic. |
| Squash (Butternut) | Annual | Intermediate | Three Sisters. Runner vine space hog. |
| Cucumber | Annual | Beginner | Trellis/ground choice. |
| Marigold (French) | Annual | Beginner | Pest deterrent. Not food — utility planting. |
| Sunflower | Annual | Beginner | Height, pollinator attractor, seed harvest. |
| Strawberry | Perennial | Intermediate | First perennial available. Runner mechanic. |
| Rosemary | Perennial | Intermediate | Woody perennial. Drought tolerance. |
| Blueberry | Perennial | Advanced | Acid soil requirement. Multi-year payoff. |
| Mint | Perennial | Beginner | Invasive spread mechanic. Containment lesson. |
| Garlic | Biennial | Intermediate | Fall planting. Overwinter mechanic. |
| Fennel | Annual | Intermediate | The antagonist. Teaches allelopathy. |
