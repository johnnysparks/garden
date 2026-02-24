# Scenario 1: Basic Planting and Growth — Test Report

Seed: `--seed 100`

## Commands Issued

1. Started game, advanced to ACT phase, planted all 4 species:
   - `plant tomato_cherokee_purple 1 1`
   - `plant basil_genovese 0 0`
   - `plant carrot_nantes 2 2`
   - `plant zucchini_black_beauty 0 2`
2. Advanced 11 weeks using `week`, ran `grid`/`plants` every week, `inspect` every 2 weeks.

## Observations

### Growth Progress Over 11 Weeks

| Species | Week 1 | Week 5 | Week 8 | Week 11 | Expected by Week 11 |
|---------|--------|--------|--------|---------|---------------------|
| Carrot (9–11 wk maturity) | 0% | 13% | 25% | 40% | ~80–100% |
| Tomato (12–16 wk maturity) | 0% | 2% | 5% | 13% | ~50–70% |
| Basil (8–10 wk maturity) | 0% | 2% | 4% | 14% | ~100% |
| Zucchini (7–9 wk maturity) | 0% | 1% | 1% | 7% | ~100% |

Growth rates are **2–5x slower than expected** based on species `days_to_maturity` values.

### Root Cause Analysis

The base growth rate formula in `src/lib/engine/ecs/systems/growth.ts:128-129`:
```
baseRate = GROWTH_RATE_VALUE[growth_rate] / totalExpectedWeeks(species)
```

`totalExpectedWeeks()` sums all stage durations (including senescence), producing values much larger than `days_to_maturity`:

| Species | days_to_maturity | totalExpectedWeeks | Base Rate | Weeks to 100% (perfect conditions) |
|---------|-----------------|-------------------|-----------|-------------------------------------|
| Carrot | 9–11 | 17.0 | 0.0588 | 17.0 |
| Tomato | 12–16 | 20.5 | 0.0634 | 15.8 |
| Basil | 8–10 | 14.0 | 0.0929 | 10.8 |
| Zucchini | 7–9 | 18.5 | 0.0865 | 11.6 |

Even with perfect conditions (all modifiers = 1.0), carrot takes 17 weeks for a 9–11 week crop. With realistic environmental modifiers (temperature, moisture, nutrients multiply together), effective growth drops another 40–60%.

## Bugs Found

### BUG 1: Growth rates too slow — plants cannot mature within a season
- **Severity: Major**
- **File:** `src/lib/engine/ecs/systems/growth.ts:128-129`
- **Reproduction:** Start with `--seed 100`, plant all 4 species week 1, advance 25+ weeks. No plant reaches harvest.
- **Expected:** Plants should reach harvest stage within their `days_to_maturity` window under reasonable conditions.
- **Actual:** Stage durations sum to 1.3–2.6x the `days_to_maturity` value. Combined with multiplicative environmental modifiers (temp × water × nutrients × light × stress), plants grow at ~30–50% of their expected rate. Basil (8–10 week crop) reaches only 14% after 11 weeks.
- **Suggested fix:** Either (a) scale `totalExpectedWeeks` to match `days_to_maturity` ranges, or (b) increase `GROWTH_RATE_VALUE` constants, or (c) reduce stage `duration_weeks` so they sum to the maturity window.

### BUG 2: Zucchini stress accumulation makes it unplayable when planted early
- **Severity: Major**
- **File:** `src/lib/engine/ecs/systems/stress.ts`
- **Reproduction:** Plant zucchini week 1 (soil temp ~8°C, needs ≥18°C). By week 8, stress reaches 0.71, health drops to 0.52, growth stalls at 1%.
- **Expected:** Early planting should cause some stress, but recovery should be possible when conditions improve in summer.
- **Actual:** Stress accumulates ~0.09/week in cold conditions. By the time soil temps reach 18°C (~week 9), stress is already 0.69 and health is 0.52. The stress penalty (1 - stress × 0.5 = 0.65) further slows the already-too-slow growth. Recovery can't outpace the damage.
- **Impact:** Zucchini is essentially unplayable unless the player knows to delay planting until week 8+, which the game doesn't communicate.

### BUG 3: Blossom end rot triggers on seedling-stage tomato
- **Severity: Minor**
- **File:** `src/lib/engine/ecs/systems/disease.ts`
- **Reproduction:** Plant tomato week 1, advance to week 11. Tomato at seedling 13% gets `blossom_end_rot onset`.
- **Expected:** Blossom end rot is a fruiting-stage disease. Disease checks should be gated to biologically appropriate growth stages.
- **Actual:** Disease system only skips `seed` and `germination` stages. Any plant in `seedling` or later can trigger any disease, including stage-inappropriate ones like blossom end rot on a pre-flowering plant.

### BUG 4: Grid truncates species names, losing meaningful info
- **Severity: Minor (UX)**
- **Reproduction:** Run `grid` with any plants.
- **Expected:** Species names should be readable. Common names (e.g., "Basil", "Tomato") or smart abbreviations would be clearer.
- **Actual:** Names like `basil_genove`, `zucchini_bla`, `tomato_chero` are truncated mid-word in grid columns.

## Mechanics Assessment

- **Planting:** Works correctly. All 4 species plant successfully, correct energy deduction.
- **Growth stages:** Progress through stages correctly (seed → germination → seedling → vegetative). Stage transitions match progress thresholds.
- **Stress system:** Mechanically correct but too aggressive — warm-weather crops planted in cold soil accumulate irreversible stress.
- **Companion buffs:** Correctly detected and displayed. 8-directional adjacency works as designed. Tomato correctly shows carrot and basil companion buffs.
- **Weather:** Varies naturally week to week. Hail event appeared week 4 with correct labeling.
- **Soil:** Nutrients slowly deplete (N drops from 0.47 to 0.38 over 12 weeks). pH stays constant without amendments. Moisture responds to precipitation.
- **Disease:** Triggers on stress, but stage-gating is incomplete (Bug 3).

## Output Quality

- `status` output is clear and informative with weather, energy, frost risk.
- `grid` output has good structure but name truncation hurts readability (Bug 4).
- `plants` output is concise and useful. The `!` stress indicator is a nice touch.
- `inspect` output is excellent — shows all relevant data (stage, health, stress, conditions, companion buffs, full soil state).
- DUSK tick summaries are very helpful for understanding what happened each week.
- Growth percentage display and stage names are intuitive.
