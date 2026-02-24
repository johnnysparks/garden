# Gameplay Testing via CLI

This document is a self-contained guide for LLM agents (Sonnet, Haiku, etc.) to playtest Perennial through the CLI. You should not need to read any source files — everything required to play and evaluate the game is here.

## Quick Start

```bash
# Start a new game (deterministic with seed)
npx perennial play --zone zone_8a --seed 42

# You are now in an interactive REPL. Type commands and press Enter.
# The game starts at Week 1, DAWN phase.
```

## How the Game Works

You are a gardener managing a **3×3 grid** of plots over a ~25-30 week growing season. Each week has 5 phases:

```
DAWN → PLAN → ACT → DUSK → ADVANCE
```

- **DAWN/PLAN**: Automated setup. Weather is revealed, you can observe the garden.
- **ACT**: You spend energy on actions (planting, amending soil, diagnosing, etc.).
- **DUSK**: The simulation tick runs — plants grow, stress accumulates, diseases check, etc.
- **ADVANCE**: Week increments. Late in the season, frost probability increases. A killing frost ends the run.

Use `advance` to move through phases. Use `week` to skip straight to the next week's ACT phase.

### Energy

You get **4-5 energy per week** (varies by season/weather). Energy does NOT carry over. Most actions cost 1 energy, but planting via transplant costs 2 and lab-test diagnosis costs 2. When energy hits 0, the turn auto-advances to DUSK. Use `wait` (free) to end your turn early.

### Goal

Grow a diverse, healthy garden. Harvest produce. Keep plants alive until frost. Your score is based on harvest diversity, soil health improvement, plant survival rate, and journal entries from diagnoses.

## Command Reference

### Navigating Turns

| Command | Effect |
|---------|--------|
| `advance` | Move to next phase |
| `week` | Skip to next week's ACT phase |
| `wait` | End actions early (0 energy) |

### Actions (ACT Phase Only, 1-2 Energy Each)

| Command | Syntax | What It Does |
|---------|--------|--------------|
| `plant` | `plant SPECIES_ID ROW COL` | Plant a species at a grid position (0-indexed) |
| `amend` | `amend AMENDMENT ROW COL` | Apply a soil amendment to a plot |
| `diagnose` | `diagnose ROW COL` | Inspect a plant for problems |
| `intervene` | `intervene ACTION ROW COL` | Act on a plant: `prune`, `pull`, etc. |
| `scout` | `scout TARGET` | Reveal info: `weather`, `pests`, or `soil` |

### Queries (Any Phase, Free)

| Command | What It Shows |
|---------|---------------|
| `status` | Week, phase, energy, weather, frost risk |
| `grid` | ASCII garden layout with plant names, stages, health |
| `inspect ROW COL` | Detailed plant + soil state for a plot |
| `weather` | Temperature, precipitation, humidity, wind, frost |
| `plants` | All planted species with location, stage, health |
| `soil ROW COL` | Detailed soil chemistry for a plot |
| `species` | List all available species with IDs and difficulty |
| `species ID` | Detailed stats for one species |
| `amendments` | List all available soil amendments |
| `log [N]` | Last N events (default 10) |
| `help` | Full help text |

### Session

| Command | Effect |
|---------|--------|
| `save [PATH]` | Save game to JSON file |
| `quit` | Exit |

## Available Species

| ID | Common Name | Type | Difficulty | Weeks to Maturity | Key Needs |
|----|-------------|------|------------|-------------------|-----------|
| `tomato_cherokee_purple` | Cherokee Purple Tomato | Annual | Intermediate | 12-16 | Full sun, moderate water, pH 6.0-6.8, soil temp ≥15°C |
| `basil_genovese` | Genovese Basil | Annual | Beginner | 8-10 | Full sun, moderate water, pH 6.0-7.0, soil temp ≥18°C |
| `carrot_nantes` | Nantes Carrot | Biennial | Beginner | 9-11 | Full sun, moderate water, pH 6.0-6.8, frost tolerant (light) |
| `zucchini_black_beauty` | Black Beauty Zucchini | Annual | Beginner | 7-9 | Full sun, high water, pH 6.0-7.5, soil temp ≥18°C |

### Companion / Antagonist Relationships

| Species | Companions (benefits nearby) | Antagonists (harms nearby) |
|---------|------|------|
| Tomato | basil_genovese, carrot_nantes | fennel, brassica_cabbage |
| Basil | tomato_cherokee_purple, pepper_jalapeno | sage |
| Carrot | tomato_cherokee_purple, rosemary, lettuce_butterhead | fennel |
| Zucchini | corn_golden_bantam, bean_provider, marigold_french | fennel, potato_yukon |

Note: Some listed companions/antagonists are species not yet in the game. Only the 4 species above are plantable. The tomato-basil and tomato-carrot companion pairs are the testable ones.

## Available Amendments

| ID | Effect | Delay |
|----|--------|-------|
| `compost` | +organic matter, +N/P/K, +biology | 2 weeks |
| `lime` | +pH (raises by ~0.5) | 3 weeks |
| `sulfur` | -pH (lowers by ~0.5) | 3 weeks |
| `fertilizer` | +N/P/K (synthetic, strong), -biology | 1 week |
| `mulch` | +moisture, +organic matter, -compaction | 1 week |
| `inoculant` | +biology, +nitrogen | 2 weeks |

## Available Zone

Only `zone_8a` (Pacific Northwest) is currently implemented:
- Season: ~25-30 weeks, frost-free weeks 6-24
- Temperatures: 10°C rising to ~29°C mid-season, declining to ~7°C
- Precipitation: Winter-wet pattern
- Special events: heatwave, drought, heavy rain, hail, early frost, indian summer
- Pests: aphids, whitefly, thrips, tomato hornworm, spider mite

## Key Game Mechanics to Understand

### Growth

Plants progress 0.0 → 1.0 through stages: seed → germination → seedling → vegetative → flowering → fruiting → senescence. Growth rate depends on:

- **Temperature**: Gaussian curve around ideal temp. Too hot or cold slows growth.
- **Water**: Gaussian curve around ideal moisture.
- **Nutrients**: Limited by the scarcest of N, P, K (Liebig's Law of the Minimum).
- **Stress penalty**: High stress slows growth.
- **Companion bonus**: Adjacent companion plants can boost growth.

### Stress

Accumulates (0.0-1.0) when conditions are suboptimal:
- Wrong pH, too wet/dry, wrong temperature, nutrient deficiency
- Recovers slowly when all conditions are met
- High stress → disease susceptibility, slowed growth, reduced yield

### Disease

Triggered by stress + environmental conditions. Progresses through stages if untreated. Can spread to adjacent plants of the same family.

### Frost

After approximately week 25, killing frost probability increases each week. Frost kills non-tolerant plants and ends the run. Carrots have light frost tolerance; the others have none.

### Scoring

End-of-run score based on:
- Harvest diversity (number of different species harvested)
- Soil health improvement
- Plant survival rate
- Diagnosis journal entries

## Typical Turn Sequence Example

```
> status
═══ Week 1 · Spring · ACT Phase ═══
Energy: 5/5
Weather: ☀ High 15°C / Low 8°C · Precip 12mm · Humidity 65% · Wind light
Frost risk: none

> grid
(shows empty 3×3 grid)

> plant tomato_cherokee_purple 1 1
Planted Cherokee Purple Tomato at [1, 1].

> amend compost 1 1
Applied compost to [1, 1]. Takes effect in 2 weeks.

> plant basil_genovese 1 0
Planted Genovese Basil at [1, 0].

> plant carrot_nantes 0 1
Planted Nantes Carrot at [0, 1].

> wait
Ending actions early.

(DUSK tick runs — simulation processes growth, weather effects, etc.)
(ADVANCE — week increments)

> status
═══ Week 2 · Spring · ACT Phase ═══
...
```

---

# Test Scenarios

Each scenario below describes a play pattern, what to observe, and what outcomes indicate correct vs broken behavior. When running a scenario, use the specified seed for reproducibility.

When reporting results, note:
- Commands you issued and their output
- Any error messages or unexpected behavior
- Whether game mechanics matched the expectations described
- Any output that seems wrong, missing, or confusing

---

## Scenario 1: Basic Planting and Growth

**Seed**: `--seed 100`

**Goal**: Verify plants can be planted and grow over time.

**Steps**:
1. Start game: `npx perennial play --zone zone_8a --seed 100`
2. Check `status` and `species` to see what's available
3. Plant all 4 species in different plots:
   ```
   plant tomato_cherokee_purple 1 1
   plant basil_genovese 0 0
   plant carrot_nantes 2 2
   plant zucchini_black_beauty 0 2
   ```
4. Use `wait` to end the turn
5. Advance 10 weeks using `week` repeatedly
6. Each week, run `grid` and `plants` to observe progress
7. Run `inspect` on each plant every 2-3 weeks

**Expected Behavior**:
- All plants should show increasing growth progress each week
- Health should start at or near 1.0
- Growth stages should advance: seed → germination → seedling → vegetative → flowering
- Basil and zucchini (fast growers) should advance faster than tomato (slow)
- Carrot should be intermediate
- No plants should die without reason
- `grid` output should be well-formatted with consistent columns

**Red Flags**:
- Growth progress decreasing without stress or disease
- Plants stuck at 0% for multiple weeks
- Health dropping below 0.5 with no explanation in `inspect`
- Missing or malformed output from any command
- Errors from valid commands

---

## Scenario 2: Companion Planting Effects

**Seed**: `--seed 200`

**Goal**: Verify companion planting adjacency bonuses work correctly.

**Steps**:
1. Start game with seed 200
2. Plant tomato and basil adjacent to each other (they are companions):
   ```
   plant tomato_cherokee_purple 1 1
   plant basil_genovese 1 0
   ```
3. Plant carrot adjacent to tomato (also companions):
   ```
   plant carrot_nantes 0 1
   ```
4. Advance 8-10 weeks, checking `inspect` on all plants each week
5. Note any companion buff indicators in the inspect output
6. Compare growth rates — plants with companions should grow slightly faster

**Expected Behavior**:
- Tomato at [1,1] benefits from both basil and carrot adjacency
- Basil at [1,0] benefits from tomato adjacency
- Carrot at [0,1] benefits from tomato adjacency
- Companion effects should appear in inspect output or DUSK tick summaries
- Growth rates for companioned plants should be slightly higher than baseline

**Red Flags**:
- No indication of companion effects anywhere in output
- Companion effects applying to non-adjacent plants
- Negative effects from known companion pairs
- Companion effects being unreasonably large (>50% growth boost)

---

## Scenario 3: Soil Amendment Lifecycle

**Seed**: `--seed 300`

**Goal**: Verify amendments apply correctly with proper delays and effects.

**Steps**:
1. Start game with seed 300
2. Check initial soil state: `soil 1 1`
3. Apply compost (2-week delay): `amend compost 1 1`
4. Apply mulch to a different plot (1-week delay): `amend mulch 0 0`
5. Apply fertilizer to a third plot (1-week delay): `amend fertilizer 2 2`
6. Check `inspect 1 1` — should show pending amendment
7. Advance 1 week. Check `soil 0 0` and `soil 2 2` — mulch and fertilizer should have taken effect
8. Check `soil 1 1` — compost should still be pending
9. Advance 1 more week. Check `soil 1 1` — compost should now be active
10. Compare soil values before and after amendments

**Expected Behavior**:
- `soil` command shows pH, moisture, N/P/K, organic matter, biology, compaction
- Amendments show as "pending" in inspect output before delay expires
- After delay, soil values should change:
  - Compost: organic matter up, slight N/P/K increase, biology up
  - Mulch: moisture up, slight organic matter up, compaction down
  - Fertilizer: N/P/K up significantly, biology down
- Values should be reasonable (0.0-1.0 range, pH 4.0-9.0)
- Lime should raise pH, sulfur should lower pH

**Bonus Test**: Apply lime and sulfur to same plot in different weeks — pH should shift up then down.

**Red Flags**:
- Amendments taking effect immediately (ignoring delay)
- No visible change in soil values after amendment delay
- Soil values going outside valid ranges (negative, >1.0, pH outside 4-9)
- Pending amendments not shown in inspect
- Amendment effects being applied to wrong plot

---

## Scenario 4: Stress and Suboptimal Conditions

**Seed**: `--seed 400`

**Goal**: Verify stress accumulates under poor conditions and affects growth.

**Steps**:
1. Start game with seed 400
2. Plant basil (needs soil temp ≥18°C) very early when soil is cold:
   ```
   plant basil_genovese 0 0
   ```
3. Apply sulfur to lower pH below basil's preference (6.0-7.0):
   ```
   amend sulfur 0 0
   ```
4. Also plant tomato in good conditions for comparison:
   ```
   plant tomato_cherokee_purple 1 1
   amend compost 1 1
   ```
5. Advance 5-8 weeks, checking `inspect` on both plants each week
6. Observe stress values and growth rate differences

**Expected Behavior**:
- Basil should accumulate stress due to cold soil temps early season and pH shift
- Stress should appear in `inspect` output as a numeric value (0.0-1.0)
- Growth should be slower for the stressed basil than the well-tended tomato
- Health should decrease as stress increases
- If conditions improve (warmer weather mid-season), stress may slowly recover

**Red Flags**:
- Stress values not changing despite poor conditions
- Plants showing no health impact from high stress
- Stress values exceeding 1.0 or going negative
- Growth rate identical for stressed and unstressed plants
- Plant dying instantly instead of gradual stress accumulation

---

## Scenario 5: Full Season Playthrough to Frost

**Seed**: `--seed 500`

**Goal**: Play a complete season and verify frost mechanics end the run correctly.

**Steps**:
1. Start game with seed 500
2. Plant a diverse garden in weeks 1-3:
   ```
   plant tomato_cherokee_purple 1 1
   plant basil_genovese 1 0
   plant carrot_nantes 0 1
   plant zucchini_black_beauty 2 1
   ```
3. Amend soil as needed (compost on heavy feeders, mulch for moisture)
4. Advance week by week. After week 20, check `status` every week for frost risk
5. Use `scout weather` periodically to check ahead
6. Continue advancing until frost kills the garden or you reach week 30+
7. Note the final score output

**Expected Behavior**:
- Frost risk should increase after approximately week 24-25
- `status` should show frost risk escalating: none → low → moderate → high
- When killing frost hits: non-frost-tolerant plants die, carrots (light tolerance) may survive light frost
- Run should end with a score summary
- Score should reflect harvest diversity, soil health, survival, journal entries
- Game should handle the end state gracefully (no crashes, clear output)

**Red Flags**:
- Frost never occurring (game running to week 40+)
- Frost killing frost-tolerant plants at light severity
- No score output at end of run
- Game crashing or hanging at end of run
- Frost risk display not changing as weeks progress
- All plants dying simultaneously with no graduated response

---

## Scenario 6: Harvest Mechanics

**Seed**: `--seed 600`

**Goal**: Verify plants become harvestable and can be harvested.

**Steps**:
1. Start game with seed 600
2. Plant fast-maturing species:
   ```
   plant zucchini_black_beauty 1 1
   plant basil_genovese 0 0
   ```
3. Amend with compost and fertilizer for fast growth:
   ```
   amend compost 1 1
   amend fertilizer 0 0
   ```
4. Advance weeks. Monitor growth progress via `inspect`
5. Zucchini (7-9 weeks) and basil (8-10 weeks) should reach harvest readiness
6. When a plant shows as harvestable, use `intervene harvest ROW COL` or check if there is a `harvest` command
7. Observe harvest output and scoring implications

**Expected Behavior**:
- Plants should reach harvest stage when growth progress enters the harvest window
- A harvestable indicator should appear in `grid` or `inspect` output
- Harvesting should succeed and produce feedback
- Continuous-harvest plants (basil leaves, zucchini fruit) should remain alive after harvest
- Harvest should contribute to end-of-run score

**Red Flags**:
- Plants reaching 100% growth but never becoming harvestable
- Harvesting killing the plant unexpectedly
- No harvest indicator visible in any output
- Harvest command not recognized or erroring
- Score not reflecting successful harvests

---

## Scenario 7: Weather Events and Their Effects

**Seed**: `--seed 700`

**Goal**: Observe special weather events and verify they affect the garden.

**Steps**:
1. Start game with seed 700
2. Plant all 4 species in the grid
3. Advance week by week for the full season
4. Check `weather` every week — look for special events (heatwave, drought, heavy rain, hail)
5. When a special event occurs, note its effects on plants in the DUSK tick
6. Compare plant health before and after weather events
7. Try different seeds if seed 700 doesn't produce special events within 15 weeks

**Expected Behavior**:
- Special weather events should appear in `weather` output
- Hail: should cause direct damage to plants
- Heavy rain: should increase soil moisture and possibly compaction
- Heatwave: should stress heat-sensitive plants
- Drought: should reduce soil moisture
- Effects should be reflected in DUSK tick output and plant inspect

**Red Flags**:
- Weather events having no effect on plants or soil
- Weather events causing instant plant death
- No special events across many different seeds
- Weather values being physically impossible (negative temperature, >100% humidity)
- Weather not varying week to week

---

## Scenario 8: Error Handling and Edge Cases

**Seed**: `--seed 800`

**Goal**: Verify the CLI handles invalid input gracefully.

**Steps**:
1. Start game with seed 800
2. Try each of these invalid commands and note the error message:
   ```
   plant fake_species 0 0
   plant tomato_cherokee_purple 5 5
   plant tomato_cherokee_purple -1 0
   amend fake_amendment 0 0
   inspect 5 5
   diagnose 0 0          (on empty plot)
   plant tomato_cherokee_purple 0 0
   plant basil_genovese 0 0   (double plant same plot)
   ```
3. Try actions outside ACT phase:
   - During DAWN/PLAN phase, try `plant tomato_cherokee_purple 0 0`
4. Try exhausting energy:
   - Plant until energy runs out, then try one more action
5. Try nonsense input:
   ```
   asdfghjkl
   plant
   amend compost
   ```

**Expected Behavior**:
- Each invalid command should produce a clear, informative error message
- No crashes or stack traces shown to the user
- Game state should not be corrupted by invalid commands
- Error messages should suggest the correct usage
- The game should continue normally after any error

**Red Flags**:
- Stack traces or unhandled exceptions in output
- Game crashing on invalid input
- Invalid commands silently succeeding
- Game state corrupted after error (wrong phase, wrong energy count)
- Unhelpful error messages (just "Error" with no details)

---

## Scenario 9: Nutrient Depletion and Liebig's Law

**Seed**: `--seed 900`

**Goal**: Verify that nutrient mechanics work and Liebig's Law limits growth correctly.

**Steps**:
1. Start game with seed 900
2. Plant tomato (heavy feeder) without amendments:
   ```
   plant tomato_cherokee_purple 0 0
   ```
3. Plant another tomato with full soil support:
   ```
   plant tomato_cherokee_purple 2 2
   amend compost 2 2
   amend fertilizer 2 2
   ```
4. Advance 10-15 weeks, comparing `soil` and `inspect` for both plots
5. Track N/P/K levels — the unfed tomato should show nutrient decline
6. Compare growth rates between the two

**Expected Behavior**:
- Soil nutrients (N/P/K) should decrease over time as plants consume them
- The unamended tomato should grow slower due to nutrient limitation
- `inspect` or DUSK tick should indicate nutrient-related stress
- The amended tomato should grow faster with better nutrient availability
- Growth limitation should follow the minimum nutrient (Liebig's Law), not the average

**Red Flags**:
- Nutrients never decreasing despite plant growth
- Both plants growing at identical rates regardless of soil nutrients
- Nutrient values going negative
- No indication in output about what's limiting growth
- Soil nutrients jumping erratically between weeks

---

## Scenario 10: Save and Load Integrity

**Seed**: `--seed 1000`

**Goal**: Verify save/load produces identical game state.

**Steps**:
1. Start game with seed 1000
2. Plant a few species and advance 5 weeks
3. Run `status`, `grid`, `plants` — record the output
4. Save the game: `save test-save.json`
5. Advance 2 more weeks, note the state
6. Quit: `quit`
7. Load the save: `npx perennial load test-save.json`
8. Run `status`, `grid`, `plants` — compare with the saved state
9. The state should match what it was at the save point (week 5), not week 7
10. Advance 2 more weeks — behavior should be identical to the first playthrough (same seed = deterministic)

**Expected Behavior**:
- Save file is created as valid JSON
- Loading restores exact game state at time of save
- All plant positions, growth progress, soil state match
- Continuing from load produces identical results (deterministic via seed)
- No data loss or corruption

**Red Flags**:
- Load restoring wrong week or phase
- Plant state not matching (different health, growth, positions)
- Soil state diverging after load
- Save file being empty or malformed JSON
- Load command failing with errors
- Non-deterministic behavior after load (different outcomes with same seed)

---

## Scenario 11: Diagnosis Flow

**Seed**: `--seed 1100`

**Goal**: Test the diagnosis mechanic on a stressed or diseased plant.

**Steps**:
1. Start game with seed 1100
2. Plant tomato and deliberately stress it — avoid amending soil, let conditions be suboptimal:
   ```
   plant tomato_cherokee_purple 0 0
   ```
3. Also plant basil next to it for comparison:
   ```
   plant basil_genovese 0 1
   ```
4. Advance 8-12 weeks. Monitor stress via `inspect 0 0` each week
5. When stress exceeds 0.3 or a condition appears, try `diagnose 0 0`
6. Observe the diagnosis output — should show symptoms and hypothesis options
7. If diagnosis suggests a condition, try `intervene prune 0 0` or another intervention
8. Advance 2 weeks and check if the intervention had any effect

**Expected Behavior**:
- `diagnose` should cost 1 energy and produce meaningful output
- Output should describe visible symptoms
- Hypothesis options should be relevant to the plant's actual condition
- Interventions should have some effect (positive or negative)
- Diagnosis and intervention should appear in `log` output

**Red Flags**:
- `diagnose` producing empty or generic output regardless of plant state
- Diagnosis available on healthy plants with no useful information
- Interventions having no effect after multiple weeks
- Diagnosis not costing energy
- No symptom descriptions in diagnosis output

---

## Scenario 12: Long-Running Stability

**Seed**: `--seed 1200`

**Goal**: Verify the game handles a full 30-week season without crashes.

**Steps**:
1. Start game with seed 1200
2. Plant all 4 species in the first 2 weeks
3. Amend soil for all plots
4. Advance week by week for the entire season:
   - Each week: `status`, `grid`, then `week`
   - Every 5 weeks: `inspect` on all plants, `soil` on all plots
5. Continue until frost ends the run or you reach week 35
6. Note any errors, slowdowns, or inconsistencies along the way

**Expected Behavior**:
- Game should run the full season without errors
- Output should remain consistent and well-formatted throughout
- No memory errors, hangs, or crashes
- Plant stages should progress logically (never going backwards)
- Final score should be displayed at end of run

**Red Flags**:
- Game hanging or becoming unresponsive
- Output format degrading over time
- Plant growth progress going backwards
- Errors appearing after many weeks that didn't appear earlier
- Game not ending (no frost, no termination condition)
- Inconsistent state (plants that were dead appearing alive, etc.)

---

## Reporting Template

When completing a test scenario, report your findings in this format:

```
## Scenario [N]: [Name]
Seed: --seed [X]

### Commands Issued
(List key commands and their output, especially unexpected ones)

### Observations
- [What happened vs what was expected]

### Bugs Found
- [Severity: Critical/Major/Minor] [Description]
  - Reproduction: [exact commands]
  - Expected: [what should happen]
  - Actual: [what did happen]

### Mechanics Assessment
- [Does this mechanic work as described? Any balance concerns?]

### Output Quality
- [Was output clear, well-formatted, and informative?]
```

---

## Tips for Effective Testing

1. **Use `status` liberally** — it's free and gives you the most important state info.
2. **Use `inspect ROW COL` to debug** — it shows plant health, stress, conditions, and full soil state.
3. **Compare with and without** — test a mechanic by setting up one plot with the feature and one without.
4. **Watch DUSK output carefully** — that's where you see the simulation results.
5. **Track values over time** — growth, stress, health, and soil should change gradually, not jump.
6. **Try to break things** — invalid input, edge cases, and unusual play patterns reveal bugs.
7. **Note output clarity** — if you can't understand what the game is telling you, that's a UX bug.
8. **Check phase transitions** — the DAWN→PLAN→ACT→DUSK→ADVANCE cycle should be consistent.
9. **Seed reproducibility** — running the same seed twice should produce identical results if you issue identical commands.
