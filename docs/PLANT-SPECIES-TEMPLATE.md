# Plant Species Creation Template

Use this document as the prompt/guide for a single Claude Code agent session to create one new plant species for Perennial. Each species deserves its own session with dedicated research, accurate horticultural data, distinctive visual representation, and full validation.

---

## Agent Session Prompt

Copy and customize the block below as the task prompt for a new agent session:

```
Create a new plant species JSON for Perennial: **[COMMON NAME] ([VARIETY])**

Species ID: `[species_id]` (snake_case, must match filename)
File: `src/lib/data/species/[species_id].json`

## Context

Perennial is a roguelike gardening simulator that teaches real horticulture through play. Every plant species is a single JSON file — no code changes needed. The JSON encodes both simulation behavior and parametric SVG visual appearance.

This species matters for gameplay because: [WHY — e.g., "nitrogen fixer that teaches crop rotation", "pest-deterrent companion", "cool-season bolt-risk crop", "invasive spreading mechanic"]

## Your Task

### Phase 1: Research (do NOT write JSON yet)

Research the real-world horticulture of this plant. You need accurate data for:

1. **Botanical identity** — full botanical name with cultivar, plant family, annual/biennial/perennial
2. **Growth habit** — choose from: bush, indeterminate_vine, runner_vine, upright, rosette, grass, root_crop, climber, ground_cover, shrub
3. **Growth stages** — realistic durations in weeks for: seed, germination, seedling, vegetative, flowering, fruiting, senescence. Write vivid 1-sentence descriptions a gardener would recognize for each stage.
4. **Days to maturity** — range in weeks (not days, despite the field name) from transplant to first harvest
5. **Physical dimensions** — max height and spread in centimeters
6. **Growing requirements**:
   - Sun: full / partial / shade
   - Water: low / moderate / high
   - Soil pH range (two decimals, e.g. [6.0, 7.0])
   - NPK needs: each as low / moderate / high
   - Minimum soil temperature for germination (Celsius)
   - Frost tolerance: none / light / moderate / hard
7. **Season windows** (in week numbers, where week 1 ≈ early March):
   - Direct sow window
   - Transplant window
   - Harvest window (weeks after planting when harvest is possible)
   - Bolt trigger: heat / cold / day_length / null
8. **Companion planting** — which species benefit this plant and why? Use real companion planting science (volatile oils, root exudates, pest confusion, nutrient sharing). Reference species by their Perennial IDs when they exist: `tomato_cherokee_purple`, `basil_genovese`. For species not yet in the game, use the planned ID from the starter list (e.g. `pepper_jalapeno`, `carrot_nantes`, `marigold_french`, `bean_provider`, `corn_golden_bantam`, `squash_butternut`, `lettuce_butterhead`, `mint_spearmint`, `strawberry_alpine`, `rosemary`, `fennel`, `cucumber_marketmore`, `sunflower_mammoth`, `blueberry_duke`, `garlic_softneck`, `spinach_bloomsdale`, `pea_sugar_snap`).
9. **Antagonist planting** — which species harm this plant? Same ID rules.
10. **Vulnerabilities** — 2-3 real diseases/conditions this plant is susceptible to. For each:
    - Condition ID (snake_case, e.g. `powdery_mildew`, `early_blight`)
    - Susceptibility (0-1 probability weight)
    - Environmental triggers that cause onset (humidity, temperature, watering, pH, crowding)
    - Symptom progression: 2-3 stages with week offsets, visual overlay names, descriptions a player would see during inspection, and whether each stage is reversible
    - Whether it kills the plant (weeks_to_death or null)
    - Whether it spreads to neighbors
11. **Harvest** — yield potential (1-10), harvest type (fruit/leaf/root/flower/seed/whole), whether continuous harvest is possible, whether seeds can be saved
12. **Lore** — 1-2 sentence description, geographic origin, one memorable fun fact, difficulty (beginner/intermediate/advanced)

### Phase 2: Visual Parameters

Design the parametric SVG appearance. The visual system uses flat vector art with organic motion — clean geometry, limited palettes, everything alive with procedural animation. Style references: Alto's Odyssey color grading, Lottie animation fluidity, vintage seed catalog illustration (simplified). NOT pixel art, NOT cartoon, NOT realistic.

**Start from a botanical reference description.** Before touching numbers, write a 2-3 sentence description of the real plant's architecture. This directly informs parameter choices. Example:

> **Cherokee Purple Tomato:** Indeterminate vine, 150-180 cm tall. Single main stem with lateral suckers at every leaf node. Large pinnately compound leaves (20-30 cm) with 5-9 toothed leaflets, dark green, slightly drooping. Small yellow star-shaped flowers in clusters. Heavy oblate fruit ripening to dusky purple-pink with green shoulders.

Reference the existing species for SVG unit calibration:
- Tomato: height [3, 55], thickness [0.8, 3.0], 20 leaves max, fruit size up to 5.5
- Basil: height [2, 18], thickness [0.5, 2.0], 36 leaves max, no fruit

For this species, determine:

**Stem:**
- height range [min, max] in SVG units (seed → mature). Small herbs: [2, 18]. Tall vines: [3, 55]. Trees/large shrubs: [3, 40+].
- thickness range [min, max]. Herbs: [0.3, 1.5]. Woody: [0.5, 3.0].
- color as hex (#RRGGBB) — choose from the plant's actual botany, not generic green. Tomato stems are gray-green (#6a8a3c), basil stems are bright yellow-green (#7cb342), woody herbs are brown (#6d4c2f). Never reuse exact stem colors between species.
- curve (0=straight, 1=very curved) — upright plants ~0.05, vines ~0.3
- branch_frequency (0-1) — must match growth habit:
  - `bush` habit: 0.7-1.0 (bushes need many branches)
  - `indeterminate_vine`: 0.4-0.7 (moderate branching)
  - `upright`: 0.1-0.4 (columnar)
  - `climber`: 0.2-0.5
  - `rosette`/`root_crop`: 0.0-0.2 (leaves from base)
  - `ground_cover`: 0.6-0.9 (spreading)
  - `shrub`: 0.5-0.8 (woody branching)
- branch_angle (degrees) — 30-50° for compact crown, 50-70° for spreading crown

**Leaves:**
- shape: simple_oval (basil, spinach), simple_pointed (pepper), lobed (tomato single leaf), pinnate_compound (tomato, carrot), palmate (squash), linear (grass, chive), heart (bean, sweet potato), needle (rosemary, lavender)
- count range [min, max] — seed has few, mature has many. Minimum mature counts by shape:

  | Leaf Shape | Min Count (mature) | Min Size (mature) | Typical Range |
  |---|---|---|---|
  | `simple_oval` | 20 | 5 | [4, 36] |
  | `pinnate_compound` | 12 | 10 | [2, 20] |
  | `palmate` | 8 | 8 | [2, 14] |
  | `linear` | 40 | 3 | [6, 60] |
  | `needle` | 60 | 1.5 | [10, 80] |
  | `lobed` | 12 | 7 | [2, 18] |
  | `heart` | 15 | 6 | [2, 24] |
  | `simple_pointed` | 15 | 5 | [3, 28] |

- color as hex — encodes species identity. Dark green (#2e7d32) for heavy feeders, bright green (#43a047) for herbs, gray-green (#78909c) for Mediterranean plants, blue-green (#00897b) for waxy leaves. Leaf green channel must be dominant (G > R and G > B).
- droop range [min, max] degrees — stiff leaves ~[0, 5], floppy ~[10, 35]
- distribution — must match plant family: `opposite` for Lamiaceae (basil, mint, rosemary), `alternate` for Solanaceae (tomato, pepper), `basal` for rosettes (lettuce), `whorled` for some herbs
- opacity range [min, max] — young leaves more translucent [0.7, 1.0]

**Flowers** (or null if visually insignificant):
- shape: simple (5-petal), composite (daisy-like), spike (basil/mint), umbel (carrot/dill), none
- petal_count, color (hex), size (SVG units — must be ≥ 1.0 to be visible against foliage), bloom_density (0-1, sparse 0.2-0.4, profuse 0.5-0.8)

**Fruit** (or null if no visible fruit):
- shape: sphere, oblate (flat round), elongated (pepper/bean), pod, berry_cluster
- size range [min, max] — fruit at progress=0.9 must be wider than stem thickness to be visible
- unripe color (hex), ripe color (hex)
- cluster_count (fruits per cluster), hang_angle (15-25° for small/light fruit, 30-45° for heavy fruit)

**Animation:**
- sway_amplitude — light/flexible plants ~0.08, stiff/woody ~0.03
- sway_frequency — lighter plants oscillate faster ~0.9, heavy ~0.5
- growth_spring_tension — bounciness of growth transitions ~0.3-0.5
- idle_breathing — subtle scale oscillation ~0.005-0.015

**The Five Visual Checks** — your species must pass all of these:

1. **Silhouette Test:** Is the plant outline recognizable at a glance? Mature crown width ≥ 15% of stem height (vines) or ≥ 20% (bushes). Branch count ≥ 3 at maturity if branch_frequency > 0.3.
2. **Anatomy Test:** Are organs attached to plausible points? Leaf distribution matches family. Branches alternate left/right. Leaves on both main stem and branch tips.
3. **Density Test:** Does the plant have enough leaf mass? Mature leaf count ≥ 15 for most species. Coverage ratio (count × size² × shape_factor) / (height × width) > 0.3.
4. **Palette Test:** Are colors cohesive? RGB distance between stem and leaf colors ≥ 25. All organ colors pairwise distance ≥ 30. Stem color differs from all other species (distance ≥ 20).
5. **Stage Readability Test:** Can you tell growth stages apart? Each stage taller and leafier than the last. Height range spans at least 5:1 (min to max). Leaf count range spans at least 4:1. Leaf size range spans at least 2:1.

**Visual review:** After validation, use the Plant Lab dev tool at `/dev/plant-lab` to render the species at these canonical configurations:
- Seeds 42, 123, 999 for phenotype variation
- Progress: 0.15 (seedling), 0.45 (vegetative), 0.7 (flowering), 0.9 (fruiting)
- Stress: 0.0 (healthy), 0.4 (moderate), 0.8 (severe)
- Seasons: late_spring, summer, early_fall

### Phase 3: Write the JSON

Create the file at `src/lib/data/species/[species_id].json`.

Follow these rules strictly:
- The `id` field MUST match the filename (without .json)
- All colors MUST be hex format #RRGGBB (6 digits, validated by regex)
- All growth stages MUST be present in order: seed, germination, seedling, vegetative, flowering, fruiting, senescence
- `days_to_maturity` is actually in WEEKS (legacy field name)
- Companion/antagonist `species_id` values should use the canonical IDs listed above
- Do NOT include `discovered` field on companion/antagonist entries (runtime only)
- `visual_params` on growth stages is optional — omit it unless the stage needs specific visual overrides

### Phase 4: Validate

Run all three commands and fix any errors before proceeding:

```bash
npm run validate:species   # Zod schema check on all species JSON
npm test                   # Full test suite — includes render and data schema tests
npm run check              # TypeScript + Svelte type checking
```

`npm run validate:species` checks:
- All required fields present with correct types
- Hex colors match #RRGGBB pattern
- Numeric ranges are valid (e.g., susceptibility 0-1, modifier -1 to 1)
- snake_case ID format
- ID matches filename

`npm test` catches regressions in `tests/render/plant-design-validation.test.ts` and the data schema tests triggered by your new species file.

`npm run check` confirms no TypeScript errors — data changes can surface type inference issues in the loader or components.

### Phase 5: Verify companion cross-references

Check that any companion/antagonist references to THIS new species are added to the OTHER species' JSON files too. Companion planting is bidirectional in the real world, but each species file only lists its own perspective.

For example, if you create `carrot_nantes` and list `tomato_cherokee_purple` as a companion, also update `tomato_cherokee_purple.json` to reference `carrot_nantes` if it doesn't already.

### Phase 6: Commit

Commit the new/modified species JSON file(s) with a message like:
`Add [common name] species ([species_id])`
```

---

## Priority Species Checklist

Species to create (each as its own agent session):

| # | Species ID | Common Name | Key Mechanic | Status |
|---|-----------|-------------|-------------|--------|
| 1 | `rosemary` | Rosemary | Perennial, Mediterranean, drought-tolerant companion | In test fixtures only — needs full JSON |
| 2 | `pepper_jalapeno` | Jalapeno Pepper | Solanaceae family, heat/stress interaction, tomato companion | Not started |
| 3 | `marigold_french` | French Marigold | Pest resistance companion (not food — utility planting) | Not started |
| 4 | `bean_provider` | Provider Bush Bean | Nitrogen fixer — teaches crop rotation, Three Sisters | Not started |
| 5 | `squash_butternut` | Butternut Squash | Runner vine, Three Sisters, space management | Not started |
| 6 | `lettuce_butterhead` | Butterhead Lettuce | Cool season, bolt risk (heat trigger), fast cycle | Done |
| 7 | `mint_spearmint` | Spearmint Mint | Invasive spread mechanic, containment lesson | Not started |
| 8 | `strawberry_alpine` | Alpine Strawberry | Perennial, ground cover, multi-year progression | Not started |
| 9 | `carrot_nantes` | Nantes Carrot | Root crop mechanic, slow visual reveal | Not started |
| 10 | `corn_golden_bantam` | Golden Bantam Corn | Three Sisters combo, height/shade mechanic | Not started |
| 11 | `cucumber_marketmore` | Marketmore Cucumber | Trellis/ground choice, climber | Not started |
| 12 | `fennel` | Florence Fennel | The antagonist — teaches allelopathy | In test fixtures only — needs full JSON |
| 13 | `sunflower_mammoth` | Mammoth Sunflower | Height, pollinator attractor, seed harvest | Not started |
| 14 | `garlic_softneck` | Softneck Garlic | Fall planting, overwinter mechanic, biennial | Not started |
| 15 | `spinach_bloomsdale` | Bloomsdale Spinach | Cool season, bolt risk (day_length), fast cycle | Not started |
| 16 | `pea_sugar_snap` | Sugar Snap Pea | Climber, nitrogen fixer, cool season | Not started |

---

## Reference: Existing Species

These species already exist as full JSON files in `src/lib/data/species/`:

- `tomato_cherokee_purple` — The flagship. Indeterminate vine, Solanaceae, intermediate difficulty.
- `basil_genovese` — Classic companion. Bush habit, fast grower, beginner difficulty.

These exist as test fixtures in `tests/engine/fixtures.ts` but NOT as JSON files:

- `rosemary` — Shrub, perennial, hard frost tolerance. Fixture has full data.
- `fennel` — Upright, annual, the antagonist. Fixture has full data.

When creating `rosemary` or `fennel` as JSON files, use the fixture data as a starting point but enrich descriptions, add vulnerabilities, and fill in companion/antagonist references.

---

## Reference: Allowed Enum Values

Quick reference for all enum values accepted by the Zod schema:

**growth.habit:** bush, indeterminate_vine, runner_vine, upright, rosette, grass, root_crop, climber, ground_cover, shrub

**growth.stages[].id:** seed, germination, seedling, vegetative, flowering, fruiting, senescence

**growth.growth_rate:** slow, moderate, fast, aggressive

**needs.sun:** full, partial, shade

**needs.water:** low, moderate, high

**needs.nutrients (N/P/K):** low, moderate, high

**needs.frost_tolerance:** none, light, moderate, hard

**season.bolt_trigger:** heat, cold, day_length, null

**harvest.harvest_type:** fruit, leaf, root, flower, seed, whole

**type:** annual, biennial, perennial

**visual.leaves.shape:** simple_oval, simple_pointed, lobed, pinnate_compound, palmate, linear, heart, needle

**visual.leaves.distribution:** alternate, opposite, whorled, basal

**visual.flowers.shape:** simple, composite, spike, umbel, none

**visual.fruit.shape:** sphere, oblate, elongated, pod, berry_cluster

**Interaction effect types:** pest_resistance, growth_rate, flavor, pollination, nutrient_sharing, allelopathy, shade_benefit

**Condition trigger types:** humidity_high, humidity_low, temp_high, temp_low, overwater, underwater, ph_high, ph_low, nutrient_deficiency, nutrient_excess, crowding, pest_vector

**lore.difficulty:** beginner, intermediate, advanced

---

## Reference: Common Diseases by Plant Family

Use these for vulnerability entries (from doc 04):

**Solanaceae** (tomato, pepper, potato): early_blight, late_blight, blossom_end_rot, blossom_drop, septoria_leaf_spot

**Cucurbitaceae** (squash, cucumber, melon): powdery_mildew, downy_mildew, squash_vine_borer (pest), mosaic_virus

**Fabaceae** (beans, peas): rust, anthracnose, root_rot, powdery_mildew

**Lamiaceae** (basil, mint, rosemary): downy_mildew, fusarium_wilt, root_rot

**Apiaceae** (carrot, fennel, dill): cavity_spot, leaf_blight, carrot_rust_fly (pest)

**Asteraceae** (lettuce, sunflower, marigold): downy_mildew, bottom_rot, bolting (abiotic)

**Poaceae** (corn): corn_smut, rust, stalk_rot

**Rosaceae** (strawberry): botrytis_gray_mold, verticillium_wilt, leaf_scorch

**Nutrient deficiencies** (any plant): nitrogen_deficiency, phosphorus_deficiency, potassium_deficiency, iron_chlorosis, calcium_deficiency

---

## Reference: Visual Overlay IDs for Symptom Stages

Use these overlay IDs in vulnerability symptom stages (from doc 06). Each overlay has an intensity parameter (0-1) tied to disease progression:

| Overlay ID | Visual Effect |
|---|---|
| `interveinal_yellowing` | Veins stay green, areas between shift to yellow |
| `leaf_spots` | Small brown/dark circles scattered on leaf surfaces |
| `concentric_rings` | Target-pattern circles on leaves (early blight signature) |
| `powdery_coating` | Semi-transparent white overlay on leaf surfaces |
| `wilting` | Droop maxed, leaf edges curl |
| `fruit_base_rot` | Dark patch on bottom of fruit shapes |
| `stem_lesions` | Dark patches on stem path |
| `insect_clusters` | Tiny dots clustered on leaf undersides |
| `yellowing_uniform` | Entire leaf color shifts yellow, oldest leaves first |
| `purple_tint` | Reddish-purple hue overlay on leaves |
| `brown_edges` | Leaf edge paths get brown color, working inward |
| `lower_leaf_spots` | Spots concentrated on lowest leaves |
| `spreading_spots_yellowing` | Spots spreading upward with yellowing |
| `leaf_browning` | Yellow patches turn brown and necrotic |
| `stem_blackening` | Stems darken as vascular tissue compromised |
| `asymmetric_wilt` | One side wilts while other looks fine |
| `total_wilt` | Entire plant wilts despite adequate water |
| `fruit_base_discolor` | Water-soaked spot at blossom end of fruit |

You can also create new overlay IDs for species-specific symptoms — they will be passed through to the render pipeline.

---

## Validation Checklist

Before considering a species complete, verify:

**Data accuracy:**
- [ ] File is at `src/lib/data/species/{species_id}.json`
- [ ] `id` field matches filename exactly
- [ ] All 7 growth stages present in order (seed → senescence)
- [ ] Stage descriptions are vivid, specific to THIS plant (not generic)
- [ ] `days_to_maturity` values are in weeks and realistic
- [ ] `soil_ph` range is realistic for this species
- [ ] `soil_temp_min_c` is realistic germination temperature
- [ ] Season windows make sense for a temperate growing season
- [ ] At least 1 companion with real horticultural basis
- [ ] At least 1 antagonist OR documented reason why none
- [ ] At least 2 vulnerabilities with realistic triggers and symptoms
- [ ] Symptom descriptions use real horticultural language

**Visual quality (the five checks):**
- [ ] All hex colors are valid #RRGGBB format
- [ ] **Silhouette:** Plant outline recognizable, branch_frequency matches habit guidelines
- [ ] **Anatomy:** Leaf distribution matches plant family, branch_angle reasonable
- [ ] **Density:** Mature leaf count meets minimums for leaf shape (see table above)
- [ ] **Palette:** Stem/leaf RGB distance ≥ 25, stem color unique vs other species
- [ ] **Stage readability:** Height range ≥ 5:1, leaf count range ≥ 4:1, leaf size range ≥ 2:1
- [ ] Leaf shape matches real plant morphology
- [ ] Flower size ≥ 1.0 SVG units (if flowers not null)
- [ ] Fruit size at maturity > stem thickness (if fruit not null)
- [ ] Botanical reference description written before choosing params

**Automated validation:**
- [ ] `npm run validate:species` passes
- [ ] `npm test` passes (includes `tests/render/plant-design-validation.test.ts`)
- [ ] `npm run check` passes (TypeScript + Svelte type checking)

**Integration:**
- [ ] Cross-references updated in other species files
- [ ] Reviewed in Plant Lab at `/dev/plant-lab` across growth stages and stress levels
- [ ] Committed with descriptive message
