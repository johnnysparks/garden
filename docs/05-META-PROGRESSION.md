# 05 — Meta-Progression

## Design Principle

Meta-progression should mirror real gardening wisdom: you get better not because the world gets easier, but because YOU know more. The game doesn’t give you power-ups. It gives you knowledge, tools, and accumulated biological capital (perennials, soil health, seed diversity).

## Progression Systems

### 1. Seed Bank

**Unlock:** Successfully harvest a species → its seed added to your seed bank permanently.

**Depth mechanic — Cultivar Variants:** Each species has a base variety available from the start. Successful harvests with seed-saving enabled have a chance to yield variant cultivars:

```
Base: "Tomato — Cherry Red" (available from start)
Variant: "Tomato — Cherokee Purple" (unlocked via seed saving)
Variant: "Tomato — San Marzano" (unlocked via seed saving)
Rare: "Tomato — Brandywine" (seed swap event only)
```

Variants have different stat profiles — drought tolerance, disease resistance, yield, flavor score. Collecting cultivars creates a “gotta catch ’em all” pull while teaching real cultivar diversity.

**Seed Swap Events:** Randomly between runs, a “seed swap” event offers a trade — one of your cultivars for a random rare variety. Teaches the real tradition of community seed exchanges.

### 2. Field Journal

The journal is BOTH a game UI element AND the player’s actual learning artifact. It persists across all runs and contains:

**Species Pages** (one per species encountered):

- Growth stages observed with descriptions
- Ideal conditions (revealed through play, not given upfront)
- Companion/antagonist interactions discovered
- Disease/pest vulnerabilities identified
- Personal notes: best planting week, favorite plot location
- Harvest records: best yield, total harvests

**Diagnosis Log:**

- Every diagnosis made, with date and outcome
- Confirmed conditions get full encyclopedia entries
- Misdiagnoses logged with “later identified as…” corrections
- Confusion pairs documented (“Iron chlorosis vs. manganese deficiency”)

**Season Summaries:**

- Each completed run gets a one-page summary
- What grew, what died, what was learned
- Score breakdown
- “Lesson learned” auto-generated from biggest failure

**Discovery Tracker:**

- Companion interactions: X of Y discovered
- Conditions diagnosed: X of Y
- Species grown: X of Y
- Progress bars that fill across runs

### 3. Perennial Garden

Perennials that survive frost enter dormancy. Next run, they’re already in the garden — established, partially grown, but needing maintenance.

**Year-over-year progression:**

- Year 1: Strawberry plant, small, few fruit
- Year 2: Runners have spread, moderate yield
- Year 3: Full patch, heavy yield but needs renovation

This teaches the multi-year investment of perennial gardening. Blueberries don’t produce well until year 3. Asparagus takes 3 years before first harvest but then produces for 20.

**Neglect penalty:** If a perennial isn’t maintained (pruned, fed, watered) across runs, it declines. A run where you ignore your blueberries to focus on annual crops will show declining blueberry health next run.

**Perennial slots:** Limited to prevent the garden from being entirely pre-planted. Start with 2 perennial slots, unlock more with progression.

### 4. Climate Ladder

Start: **Zone 8a** (Pacific Northwest — long growing season, mild, forgiving)

Unlock progression:

```
Zone 8a → Zone 7b → Zone 7a → Zone 6b → Zone 6a → Zone 5b → Zone 5a
                                                        ↓
                                            Zone 9a → Zone 10a (heat challenge)
```

The ladder branches: you can go colder (shorter season, harder frost management) or hotter (disease pressure, heat stress, water management).

**Zone unlock criteria:**

- Complete 3 runs in current zone
- Achieve minimum score thresholds in harvest diversity and survival
- Correctly diagnose at least N conditions

Each new zone changes:

- Growing season length
- Available species (some plants only work in certain zones)
- Pest/disease pressure profiles
- Weather volatility
- Starting soil conditions

### 5. Tools & Upgrades

Unlockable tools that expand capabilities (not power — information and efficiency):

|Tool           |Unlock Condition                         |Effect                                                           |
|---------------|-----------------------------------------|-----------------------------------------------------------------|
|Soil Test Kit  |Complete 5 runs                          |See soil pH/nutrient levels directly (previously hidden/inferred)|
|Weather Almanac|Scout 20 times                           |See 2 weeks ahead instead of 1                                   |
|Hand Lens      |Diagnose 10 conditions                   |+1 confidence accuracy in diagnosis                              |
|Drip Irrigation|Successful water management across 3 runs|Auto-water at set moisture level (saves 1 action/week)           |
|Cold Frame     |Survive a frost event                    |Protect 2 plots from light frost                                 |
|Compost Bin    |Use compost 15 times                     |Compost quality improves over runs (better organic matter boost) |
|Seed Library   |Save 10 cultivars                        |Seed swap events become more frequent                            |

Tools don’t make the game easier — they shift the skill ceiling. Soil test kit means you now have information you’re expected to act on. Drip irrigation frees an action but you need to set it correctly or it overwaters.

### 6. Garden Expansion

The garden grid starts at 3×3 (9 plots) and can expand through meta-progression:

- **4×4 grid** — Unlocked after completing 5 runs (any zone)
- **5×5 grid** — Unlocked after completing 10 runs with a minimum score threshold

Larger grids increase strategic options (more companion planting combinations, crop rotation space) but also increase management complexity — more actions needed per week to maintain everything. The energy budget does not scale with grid size, so the player must triage more aggressively.

## Scoring

### Per-Run Score

```
HARVEST SCORE:
  + 10 per species harvested
  + 5 bonus per unique family represented
  + 20 for completing a "set" (e.g., Three Sisters: corn + bean + squash)
  + bonus for rare cultivars

SOIL SCORE:
  + 10 × soil_health_improvement (can be negative)
  + 5 per plot left in better condition than start
  + 10 for nitrogen fixer rotation bonus

SURVIVAL SCORE:
  + 5 per plant that reached harvest stage
  - 2 per plant that died mid-season
  + 15 per perennial successfully established

KNOWLEDGE SCORE:
  + 10 per new correct diagnosis
  + 5 per new companion interaction discovered
  + 5 per new species grown for first time
  + 3 per journal entry earned (even from mistakes)

SEASON MODIFIER:
  × 1.0 for Zone 8
  × 1.2 for Zone 7
  × 1.5 for Zone 6
  × 2.0 for Zone 5
```

### Lifetime Stats

- Total runs completed
- Total species grown
- Total conditions diagnosed
- Longest perennial streak (consecutive runs maintaining a perennial)
- Best single-run score per zone
- Rarest cultivar collected
- “Green Thumb Index” — composite mastery score

## Progression Pacing

Target pacing for a new player:

|Runs |Expected State                                                                                  |
|-----|------------------------------------------------------------------------------------------------|
|1    |Learn basic planting, probably lose most plants. Unlock 2-3 seed bank entries.                  |
|2-3  |Understand soil basics, first successful harvests. First diagnosis.                             |
|4-5  |Companion planting discovery starts. First perennial established.                               |
|6-8  |Soil management becomes strategic. Zone 7 unlocked.                                             |
|10-15|Diagnosis becomes intuitive for common conditions. Multiple perennials. Rich seed bank.         |
|15-20|Zone 6 territory. Advanced cultivars. Journal is substantial reference.                         |
|20+  |Zone 5 mastery. Optimizing crop rotations, succession planting, multi-year perennial strategies.|

A single run should take 15-25 minutes. Meaningful progression every 2-3 runs.