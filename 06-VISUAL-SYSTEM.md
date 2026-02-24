# 06 — Visual System

## Art Direction

**Style:** Flat vector with organic motion. Clean geometry, limited palettes, everything alive with procedural animation. References: Alto’s Odyssey color grading, Lottie animation fluidity, vintage seed catalog illustration (simplified). NOT pixel art, NOT cartoon, NOT realistic.

**Mood:** Quiet, meditative, alive. The garden should feel like a calm place you want to return to, even when things are dying.

## Parametric SVG Rendering

Every plant is rendered from its `PlantVisualParams` at runtime. No pre-made sprites. This means:

- Adding species is data, not art
- Growth is interpolation, not frame swapping
- Stress/disease is parameter perturbation, not overlay swapping
- Infinite visual variety from parameter randomization within species ranges

### Plant Rendering Pipeline

```
Species Config → Growth Interpolation → Stress Modifiers → SVG Generation → Animation Layer
```

**Step 1: Growth Interpolation**

Plant visual params define `[min, max]` ranges. Current growth_progress (0-1) interpolates between them:

```javascript
function interpolateParam(range, progress) {
  return range[0] + (range[1] - range[0]) * easeOutQuad(progress);
}

// Stem height at 40% growth:
// height: [3, 55] → 3 + (55-3) * easeOutQuad(0.4) → ~11.3
```

Easing creates naturalistic growth — fast early, slowing as the plant matures.

**Step 2: Stress Modifiers**

Stress and disease perturb the interpolated values:

```javascript
function applyStress(params, stress, conditions) {
  // Leaf droop increases with stress
  params.leaves.droop += stress * 30; // degrees
  
  // Color desaturates
  params.leaves.color = desaturate(params.leaves.color, stress * 0.5);
  
  // Stem curve increases (wilting)
  params.stem.curve += stress * 0.3;
  
  // Animation: add tremor
  params.animation.stress_tremor = stress * 0.02;
  
  // Disease-specific overlays
  for (const condition of conditions) {
    params.overlays.push(condition.visual_overlay);
  }
  
  return params;
}
```

**Step 3: SVG Generation**

Each plant is a Svelte component that generates SVG elements from params:

```svelte
<script>
  export let params; // interpolated + stressed PlantVisualParams
  
  // Generate stem path
  $: stemPath = generateStemBezier(params.stem);
  
  // Generate leaf positions along stem
  $: leafPositions = distributeLeaves(
    stemPath, 
    params.leaves.count, 
    params.leaves.distribution
  );
  
  // Generate fruit positions
  $: fruitPositions = distributeFruit(stemPath, params.fruit);
</script>

<g class="plant" transform="translate({x}, {y})">
  <!-- Stem -->
  <path d={stemPath} 
        stroke={params.stem.color} 
        stroke-width={params.stem.thickness}
        fill="none" />
  
  <!-- Leaves -->
  {#each leafPositions as leaf}
    <LeafShape 
      shape={params.leaves.shape}
      size={params.leaves.size}
      color={params.leaves.color}
      droop={params.leaves.droop}
      position={leaf}
      opacity={params.leaves.opacity} />
  {/each}
  
  <!-- Flowers (if flowering stage) -->
  {#if params.flowers && currentStage === 'flowering'}
    {#each flowerPositions as pos}
      <Flower shape={params.flowers.shape} 
              color={params.flowers.color} 
              size={params.flowers.size}
              position={pos} />
    {/each}
  {/if}
  
  <!-- Fruit (if fruiting stage) -->
  {#if params.fruit && currentStage === 'fruiting'}
    {#each fruitPositions as pos}
      <Fruit shape={params.fruit.shape}
             size={fruitSize}
             color={fruitColor}
             position={pos}
             hang_angle={params.fruit.hang_angle} />
    {/each}
  {/if}
  
  <!-- Disease overlays -->
  {#each params.overlays as overlay}
    <DiseaseOverlay type={overlay} plantBounds={bounds} />
  {/each}
</g>
```

### Leaf Shape Library

Each `LeafShape` type is a parametric SVG path generator:

```javascript
const LEAF_SHAPES = {
  simple_oval: (size) => {
    // Ellipse with slight point
    return `M0,0 C${size*0.4},${-size*0.3} ${size*0.4},${-size*0.7} 0,${-size} 
            C${-size*0.4},${-size*0.7} ${-size*0.4},${-size*0.3} 0,0`;
  },
  pinnate_compound: (size) => {
    // Central rachis with paired leaflets
    // Returns group of paths
  },
  palmate: (size) => {
    // Star-like lobes from central point (squash)
  },
  linear: (size) => {
    // Thin blade (grass, chive)
    return `M0,0 L${size*0.05},${-size} L${-size*0.05},${-size} Z`;
  },
  heart: (size) => {
    // Two lobes meeting at point (bean)
  },
  lobed: (size) => {
    // Irregular edge with rounded lobes (tomato single leaf)
  },
  needle: (size) => {
    // Very thin, rigid (rosemary)
  }
};
```

### Individual Plant Variation

To avoid uniformity, each PlantInstance gets a random offset seed applied to its visual params at planting time:

```javascript
function individualize(speciesParams, instanceSeed) {
  const rng = seededRandom(instanceSeed);
  return {
    ...speciesParams,
    stem: {
      ...speciesParams.stem,
      curve: speciesParams.stem.curve + rng(-0.1, 0.1),
      height: speciesParams.stem.height.map(h => h * rng(0.9, 1.1)),
    },
    leaves: {
      ...speciesParams.leaves,
      count: speciesParams.leaves.count.map(c => Math.round(c * rng(0.85, 1.15))),
    },
    animation: {
      ...speciesParams.animation,
      sway_frequency: speciesParams.animation.sway_frequency * rng(0.8, 1.2),
    }
  };
}
```

Two tomatoes in adjacent plots look like siblings, not clones.

## Animation System

All animation is procedural, driven by spring physics and sine functions. No keyframes, no sprite sheets.

### Wind / Sway

Global wind state affects all plants:

```javascript
// Global wind oscillator
const wind = {
  angle: 0,            // radians, slowly rotating
  strength: 0.5,       // 0-1, varies with weather
  gust_timer: 0,       // periodic gusts
};

// Per-plant sway
function calculateSway(plant, wind, time) {
  const mass = plant.params.stem.height[1] * plant.params.leaves.count[1];
  const response = plant.params.animation.sway_amplitude / Math.sqrt(mass);
  
  const baseSway = Math.sin(time * plant.params.animation.sway_frequency) * response;
  const windForce = Math.sin(wind.angle) * wind.strength * response * 2;
  const gust = wind.gust_timer > 0 ? Math.sin(time * 3) * 0.1 : 0;
  
  return baseSway + windForce + gust;
}
```

Leaves sway more than stems. Fruit hangs and swings with momentum.

### Growth Transitions

When growth_progress crosses a stage boundary, the plant’s visual params smoothly transition via spring physics:

```javascript
import { spring } from 'svelte/motion';

const stemHeight = spring(initialHeight, { stiffness: 0.05, damping: 0.3 });

// On growth tick:
$: $stemHeight = interpolateParam(params.stem.height, growth_progress);
// Spring automatically overshoots slightly and settles — organic feel
```

### Idle Breathing

Subtle scale oscillation on all living plants:

```javascript
function breathe(time, amplitude) {
  return 1 + Math.sin(time * 0.5) * amplitude;
}
// Applied as transform: scale(breathe(t, 0.01))
```

### Stress Tremor

Higher frequency, lower amplitude vibration for stressed plants:

```javascript
function stressTremor(time, stress) {
  if (stress < 0.3) return 0;
  const intensity = (stress - 0.3) * 0.03;
  return Math.sin(time * 12) * intensity + Math.sin(time * 17) * intensity * 0.5;
}
// Applied as transform: translate(tremor, tremor * 0.7)
```

### Harvest Pop

When player harvests fruit:

1. Fruit SVG detaches from plant
1. Spring upward with overshoot
1. Scale to 0 with ease-out
1. 3-5 colored circles burst outward and fade (particle stand-in)

All achievable with Svelte transitions + spring motion.

## Color System

### Seasonal Palette

The entire visual space shifts through the season. Background, soil, foliage base colors all derive from the current season phase:

```javascript
const SEASON_PALETTES = {
  early_spring: {
    sky: '#e8f5e9',
    soil: '#5d4037',
    foliage_base: '#81c784',
    accent: '#fff176',
    ui_bg: '#f1f8e9',
    warmth: 0.3,
  },
  late_spring: {
    sky: '#f1f8e9',
    foliage_base: '#66bb6a',
    accent: '#e91e63',
    warmth: 0.5,
  },
  summer: {
    sky: '#fffde7',
    foliage_base: '#43a047',
    accent: '#f44336',
    warmth: 0.8,
  },
  late_summer: {
    sky: '#fff8e1',
    foliage_base: '#689f38',
    accent: '#ff9800',
    warmth: 0.7,
  },
  early_fall: {
    sky: '#fff3e0',
    foliage_base: '#8d6e63',
    accent: '#ff6d00',
    warmth: 0.5,
  },
  late_fall: {
    sky: '#efebe9',
    foliage_base: '#a1887f',
    accent: '#795548',
    warmth: 0.2,
  },
  frost: {
    sky: '#eceff1',
    foliage_base: '#78909c',
    accent: '#b0bec5',
    warmth: 0.0,
  },
};
```

Transition between palettes is interpolated over 2-3 weeks. Never a sudden shift.

### Plant Color Derivation

Individual plant colors are offsets from `foliage_base`:

```javascript
function deriveColor(speciesColor, seasonPalette, health) {
  // Blend species-specific hue with seasonal base
  const seasonal = lerpColor(speciesColor, seasonPalette.foliage_base, 0.3);
  
  // Desaturate based on health
  const healthAdjusted = desaturate(seasonal, (1 - health) * 0.6);
  
  // Shift toward yellow/brown with stress
  if (health < 0.5) {
    return lerpColor(healthAdjusted, '#c9a94e', (0.5 - health) * 0.8);
  }
  
  return healthAdjusted;
}
```

### Frost Visual

When frost event triggers:

1. White vignette creeps from screen edges over 2 seconds
1. All plant colors shift toward `frost` palette
1. Annuals with `frost_tolerance: "none"` — leaves go brown, droop to max, desaturate fully
1. Perennials go dormant — desaturate but hold shape
1. Ground develops white frost texture overlay

This should feel somber but beautiful. Not a failure screen — a season ending.

## Garden View Layout

### Grid Display

Top-down view. Each plot is a rectangular cell in the grid. Plants render within their cell, taller plants can overlap into adjacent cell space visually (but not mechanically).

```
┌────┬────┬────┐
│    │    │    │   Each cell ~100×100 SVG units
│ 🌿 │ 🍅 │    │   Plants centered, sized by species max_spread
│    │    │    │
├────┼────┼────┤
│    │    │    │
│ 🌻 │ 🫘 │ 🌿 │   Soil texture varies per plot based on soil state
│    │    │    │
├────┼────┼────┤
│    │    │    │
│    │ 🥕 │ 🌶️ │   Empty plots show soil with possible weeds
│    │    │    │
└────┴────┴────┘
```

### Zoom Levels

1. **Garden overview** — full grid visible, plants as small icons, status indicators
1. **Plot focus** — single plot fills half the screen, plant at medium detail, stats visible
1. **Plant detail** — single plant fills screen, full SVG detail, diagnosis mode entry point

Pinch-to-zoom with smooth interpolation between levels.

### UI Overlay

Minimal chrome. The garden is the star.

```
┌──────────────────────────────────────────┐
│  Week 14 · Summer · ☀️ 28°C            │  ← thin top bar
│  ═══════════╡              ╞════════════ │  ← season progress
├──────────────────────────────────────────┤
│                                          │
│            [GARDEN VIEW]                 │  ← 80% of screen
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  ⚡ ⚡ ⚡ ⚡ ○   Energy: 4/5             │  ← energy bar
│  [Plant] [Amend] [Diagnose] [Scout] [▸] │  ← action toolbar
└──────────────────────────────────────────┘
```

Action toolbar slides away when not in ACT phase. Between-phase transitions have subtle screen-wide color shifts (dawn = warm, dusk = cool).

## Disease Overlay Visuals

Disease overlays are SVG elements layered on top of affected plant parts:

|Overlay ID             |Visual                                                                 |
|-----------------------|-----------------------------------------------------------------------|
|`interveinal_yellowing`|Leaf fill shifts: veins stay green, areas between veins shift to yellow|
|`leaf_spots`           |Small circles (brown/dark) scattered on leaf surfaces                  |
|`concentric_rings`     |Target-pattern circles on leaves (early blight signature)              |
|`powdery_coating`      |Semi-transparent white overlay on leaf surfaces                        |
|`wilting`              |Droop parameter maxed, leaf edges curl (path deformation)              |
|`fruit_base_rot`       |Dark patch on bottom of fruit shapes                                   |
|`stem_lesions`         |Dark patches on stem path                                              |
|`insect_clusters`      |Tiny dots clustered on leaf undersides                                 |
|`yellowing_uniform`    |Entire leaf color shifts yellow, oldest leaves first                   |
|`purple_tint`          |Reddish-purple hue overlay on leaves                                   |
|`brown_edges`          |Leaf edge paths get brown color, working inward                        |

Each overlay has an intensity parameter (0-1) that corresponds to disease progression stage.

## Performance Targets

- 20 plants on screen with full animation: 60fps on iPhone 12+
- Zoom transitions: <16ms per frame
- SVG generation per plant: <2ms
- Total garden render: <30ms
- Animation loop overhead: <5ms per frame

If these aren’t met, fallback strategies:

1. Reduce leaf count for far-zoom
1. Disable individual leaf animation at overview zoom (sway entire plant group instead)
1. Simplify overlays to color shifts only
1. Reduce breathing/idle animation to CSS-only transforms

## Plant Design Validation

Every species must pass five visual checks before it ships. These checks are enforced at three levels: automated unit tests, parameter guidelines baked into this document, and human review in the Plant Lab dev tool.

### The Five Checks

#### 1. Silhouette Test

**Question:** Is the plant outline recognizable at a glance?

**Automated (unit test assertions):**
- Mature plant crown width (from branch endpoints) ≥ 15% of stem height for vines, ≥ 20% for bushes.
- Branch count ≥ 3 at maturity for any species with `branch_frequency > 0.3`.
- Seedling height < 20% of mature height at `progress = 0.1`.

**Parameter guidelines:**
- `branch_frequency` for `bush` habit: 0.7–1.0. Bushes need many branches.
- `branch_frequency` for `indeterminate_vine`: 0.4–0.7. Vines branch moderately.
- `branch_frequency` for `upright`: 0.1–0.4. Upright plants are columnar.
- `branch_angle` controls crown shape: 30–50° for compact, 50–70° for spreading.

#### 2. Anatomy Test

**Question:** Are organs attached to plausible points on the plant?

**Automated:**
- Branch endpoints span ≥ 25% of stem height (not all clustered at one level).
- Branches alternate left/right (endpoints have both positive and negative X values).
- Leaves appear on both the main stem and branch tips (the renderer distributes up to 40% of leaves onto branch endpoints).

**Parameter guidelines:**
- Leaf `distribution` must match the plant family: `opposite` for Lamiaceae (basil, mint), `alternate` for Solanaceae (tomato, pepper), `whorled` for Rubiaceae.
- Flower `bloom_density` controls how many flowers appear: 0.2–0.4 for sparse bloomers, 0.5–0.8 for profuse bloomers.
- Fruit `hang_angle` should reflect weight: 15–25° for small fruit, 30–45° for heavy fruit.

#### 3. Density Test

**Question:** Does the plant have enough leaf mass to look alive?

**Automated:**
- Mature leaf count ≥ 15 for most species.
- For `pinnate_compound` leaves: leaflet size (`max_size × 0.22`) > 1.5 SVG units.
- Leaf coverage ratio: `(count × size² × shape_factor) / (height × width)` > 0.3.
- For `bush` habit: max leaf count ≥ 25.

**Parameter guidelines by leaf shape:**

| Leaf Shape | Shape Factor | Min Count (mature) | Min Size (mature) |
|---|---|---|---|
| `simple_oval` | 0.5 | 20 | 5 |
| `pinnate_compound` | 0.3 | 12 | 10 |
| `palmate` | 0.6 | 8 | 8 |
| `linear` | 0.1 | 40 | 3 |
| `needle` | 0.05 | 60 | 1.5 |
| `lobed` | 0.4 | 12 | 7 |
| `heart` | 0.5 | 15 | 6 |
| `simple_pointed` | 0.4 | 15 | 5 |

#### 4. Palette Test

**Question:** Are colors cohesive with clear value separation?

**Automated:**
- RGB distance between stem and leaf colors ≥ 25 (readable contrast).
- All four organ colors (stem, leaf, flower, fruit) pairwise distance ≥ 30.
- Cross-species: stem colors differ between species (distance ≥ 20).
- Leaf green channel is dominant (G > R and G > B) for healthy foliage.

**Parameter guidelines:**
- Choose stem color from the plant's actual botany, not a generic green. Tomato stems are gray-green (#6a8a3c), basil stems are bright yellow-green (#7cb342), woody herbs are brown (#6d4c2f).
- Leaf color encodes species identity. Dark green for heavy feeders (tomato), bright green for herbs (basil), gray-green for Mediterranean plants (rosemary).
- Never reuse the exact same stem color between different species.

#### 5. Stage Readability Test

**Question:** Can a player instantly tell what growth stage a plant is in?

**Automated:**
- Each successive stage (seedling → vegetative → flowering → fruiting) is taller.
- Each successive stage has more leaves.
- Fruit at `progress = 0.9` is wider than stem thickness (visible against the stem).
- Seedling has < 10 leaves; mature has > 15.

**Parameter guidelines:**
- `height` range should span at least 5:1 (min to max) for clear size progression.
- `leaf count` range should span at least 4:1.
- `leaf size` range should span at least 2:1 (young leaves are smaller).
- Flower `size` should be at least 1.0 SVG units to be visible against foliage.

### Validation Layers

**Layer 1: Unit tests** (`tests/render/plant-design-validation.test.ts`)

Automated tests encode the five checks as numeric assertions on the rendering pipeline output. They run against species visual params directly — no browser or screenshot needed. Every species gets its own test suite covering all five checks, plus a cross-species distinctiveness suite.

Run: `npm test -- tests/render/plant-design-validation.test.ts`

**Layer 2: Build-time schema validation** (`npm run validate:species`)

The Zod schema validates structural correctness of species JSON at build time. It catches type errors, missing fields, and out-of-range values, but does not encode visual quality checks. Those are in the unit tests.

**Layer 3: Plant Lab visual review** (`/dev/plant-lab`)

The dev tool renders individual species at configurable growth progress, stress, and season values. Use it for subjective quality review (does this "look like" the real plant?) alongside a real photo reference. The unit tests catch structural failures; the Plant Lab catches aesthetic ones.

### Reference Descriptions for Species Authors

When writing SVG parameters for a new species, start from a real-world botanical description — not from tweaking numbers until something looks okay. Include a mental model of the plant's architecture:

**Example — Cherokee Purple Tomato:**
> Indeterminate vine, 150–180 cm tall. Single main stem with lateral suckers (branches) at every leaf node. Large pinnately compound leaves (20–30 cm) with 5–9 toothed leaflets, dark green, slightly drooping under their own weight. Small yellow star-shaped flowers in clusters. Heavy oblate fruit (200–400g) ripening to dusky purple-pink with persistent green shoulders. Stems are medium green, hairy, with a distinctive tomato smell.

**Example — Genovese Basil:**
> Compact bushy annual, 30–60 cm tall. Square stems branching profusely from every node (especially if pinched). Large, glossy, cupped oval leaves (5–8 cm), bright vivid green, arranged in opposite pairs. White flower spikes emerge from stem tips when plant bolts. Stems are bright yellow-green when young, becoming slightly woody with age.

These descriptions directly inform parameter choices: the tomato description tells you `branch_frequency: 0.55`, `leaves.shape: 'pinnate_compound'`, `leaves.size: [3, 12]`, `fruit.shape: 'oblate'`. The basil description tells you `branch_frequency: 0.85`, `leaves.shape: 'simple_oval'`, `stem.color: '#7cb342'`.

### Deterministic Test Scenarios

For reproducible comparisons when tuning or reviewing, use these canonical configurations:

- **Seeds:** 42 (small phenotype), 123 (medium), 999 (large)
- **Stages:** `'seedling'` (progress=0.15), `'vegetative'` (0.45), `'flowering'` (0.7), `'fruiting'` (0.9)
- **Stress levels:** 0.0 (healthy), 0.4 (moderate), 0.8 (severe)
- **Seasons:** `'late_spring'`, `'summer'`, `'early_fall'`