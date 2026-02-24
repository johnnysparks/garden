# 01 — Actions & Turn Structure

## Weekly Cycle

Each week follows a fixed phase order:

```
DAWN → PLAN → ACT → DUSK → ADVANCE
```

### Phases

**DAWN** (automated)
- Weather for the week is revealed
- Existing conditions progress (disease advances, pests spread)
- Visual: garden wakes up, light shifts

**PLAN** (player observes)
- Player surveys the garden freely — zoom, inspect, read status indicators
- No energy cost to look. Information gathering is free at surface level.
- Deep inspection (diagnosis) costs energy — see [04-DIAGNOSIS.md](./04-DIAGNOSIS.md)

**ACT** (player spends energy)
- Player takes actions from their energy budget
- Actions resolve immediately with visual feedback

**DUSK** (automated)
- Companion planting effects apply
- Growth tick for all plants
- Random events may fire (pest arrival, beneficial insect visit, neighbor's cat)
- Visual: light fades, garden settles

**ADVANCE**
- Week counter increments
- Season progress bar moves
- Check for frost event (probability increases as season progresses)

## Energy Budget

Base energy: **4 actions per week**

Modified by:
- Season: spring = 5 (long days), late fall = 3 (short days)
- Weather: rain week = -1 (can't work in mud), mild week = +0, perfect week = +1
- Tools: unlockable tools can reduce action cost of specific tasks
- Fatigue: consecutive high-action weeks may reduce next week's budget (stretch goal)

Energy does NOT carry over between weeks.

## Action Types

### PLANT (1-2 energy)
Place a species from your seed bank into an open plot slot.

- 1 energy for direct sow (seeds)
- 2 energy for transplant (starts, which skip early growth but cost more)
- Must meet minimum conditions: season window, soil temp threshold
- Planting too early/late is allowed but carries frost/bolt risk — game doesn't prevent bad decisions

### AMEND (1 energy)
Apply a soil amendment to a plot or zone.

- Compost: +organic matter, slow nutrient release
- Lime: +pH
- Sulfur: -pH
- Fertilizer (synthetic): fast nutrient boost, -soil biology
- Mulch: moisture retention, temperature buffer, weed suppression
- Inoculant: mycorrhizal fungi, nitrogen-fixing bacteria

Effects are NOT instantaneous. Amendments take 1-3 weeks to change soil parameters. This teaches the real lag in soil management.

### DIAGNOSE (1-2 energy)
Inspect a plant showing symptoms. See [04-DIAGNOSIS.md](./04-DIAGNOSIS.md) for full interaction design.

- 1 energy: visual inspection (see symptoms, make your guess)
- 2 energy: lab test (confirms diagnosis but costs more — available after meta-unlock)

### INTERVENE (1 energy)
Take action on a diagnosed or anticipated problem.

- Prune: remove diseased tissue, improve airflow
- Treat: apply organic/chemical treatment (must match diagnosis)
- Relocate: move a potted plant to different conditions
- Harvest: pick ripe produce (scores points, adds to seed bank if seed-saving variety)
- Pull: remove a plant entirely (sometimes the right call)

Wrong interventions waste energy AND can worsen the problem (e.g., overwatering a plant with root rot).

### SCOUT (1 energy)
Reveal information about upcoming weeks.

- Peek at next week's weather
- Check for incoming pest pressure (regional pest forecast)
- Survey soil conditions across all plots (quick nutrient read)

Scouting competes with doing. This is intentional. Information has a real cost.

### WAIT (0 energy)
Skip remaining actions this week. Sometimes the best move is to do nothing. The game should never punish patience when patience is correct.

## Plot Grid

The garden is a grid of plots. Starting size: 3×3 (9 plots).

- Each plot has independent soil state (pH, N/P/K, organic matter, moisture, temperature)
- Adjacent plots influence each other (companion planting radius = adjacent 8 cells)
- Plots can be OPEN, PLANTED, FALLOW, or MULCHED
- Fallow plots slowly recover soil health. This teaches crop rotation.

Grid expands via meta-progression (starting at 3×3, unlocking up to 5×5 or irregular shapes).
