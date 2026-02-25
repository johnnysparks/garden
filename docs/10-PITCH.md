# Perennial — A Living Garden Simulator

## The Pitch

*You don't grow a garden. You design one — then it grows itself.*

Perennial is a garden ecosystem simulator where you lay out beds, install irrigation, choose plantings, and watch a backyard come alive. Bees find your flowers. Soil health shifts over seasons. The drip system you installed keeps things alive through a drought while you sit back and watch.

This isn't a farming game where you click each crop every day. It's SimCity for your backyard — you build systems, set schedules, and observe emergent behavior. The garden rewards good design with beauty and abundance. It punishes neglect with weeds, compaction, and pest outbreaks. And the best gardens are the ones that barely need you anymore.

## Core Fantasy

You step into a bare patch of yard. Over weeks and seasons, you transform it into a living ecosystem — paths winding through raised beds, drip lines quietly watering at dawn, bees drifting between lavender and tomato blossoms, a compost bin slowly generating the amendment that feeds next year's soil.

The fantasy isn't "I planted a tomato." It's "I designed a system where tomatoes thrive."

## Core Loop

```
Design → Observe → Respond → Refine
```

1. **Design**: Place infrastructure (beds, paths, irrigation), choose plantings, set automation schedules. This is where you spend your budget and express your knowledge.

2. **Observe**: Watch the season unfold. Soil health maps show moisture gradients. Pollinators find (or don't find) your flowers. Growth responds to the conditions you created.

3. **Respond**: Things go wrong — a heatwave, an aphid outbreak, a drainage problem you didn't foresee. You intervene with targeted actions, but every intervention costs time and money. The best gardens need fewer responses.

4. **Refine**: Between seasons, you see what worked. Upgrade infrastructure. Swap out underperformers. Expand into new zones of the yard. The garden compounds — each season builds on the last.

## The Efficiency Principle

The game's central insight: **doing less is mastery.**

A beginner spends every resource every week — planting, amending, diagnosing, rearranging. They're learning, and that's valuable, but the garden reflects the chaos.

An expert installs good infrastructure, plants the right companions in the right spots, and then mostly watches. Their score multiplier climbs because unused action capacity reflects a well-designed system. The "perfect garden" isn't one where you're constantly busy — it's one that runs itself.

This maps directly to real horticulture. Experienced gardeners know that the best intervention is often no intervention. Overwatering kills more plants than drought. Over-fertilizing burns roots. The game teaches this by rewarding restraint.

## The Layers

The garden is a stack of interacting systems. You build from the bottom up.

### Layer 0: Terrain

The yard itself. Soil types vary by location — clay in one corner, sandy loam in another. Sun exposure changes through the day (that fence casts afternoon shade). Slope affects drainage. You don't control terrain, but you read it and design around it.

### Layer 1: Infrastructure

The permanent (or semi-permanent) things you build.

| Infrastructure | What It Does | Upgrade Path |
|---------------|-------------|-------------|
| **Garden beds** | Define planting zones, improve soil isolation | Ground-level → raised frame → deep bed → cold frame |
| **Paths** | Access for maintenance, drainage channels | Dirt → gravel → flagstone → permeable paver |
| **Irrigation** | Passive moisture delivery | Soaker hose → drip line → timer → moisture sensor |
| **Compost** | Generates amendments over time | Open pile → tumbler → worm bin → hot compost system |
| **Rain collection** | Water storage, drought buffer | Single barrel → linked barrels → cistern |
| **Lighting** | Season extension, nighttime pollinators | Solar path lights → grow lights → greenhouse glazing |
| **Pollinator habitat** | Attracts beneficial insects | Log pile → bee hotel → multi-habitat station |
| **Fencing/borders** | Pest exclusion, microclimate | Chicken wire → solid fence → living hedge |

Infrastructure has upfront cost and ongoing maintenance. A drip line that isn't winterized breaks. A compost bin that isn't turned stalls. But well-maintained infrastructure compounds — it gets more valuable every season.

### Layer 2: Automation

Schedules and triggers you set on infrastructure.

- **Irrigation timers**: Water zone A at dawn, zone B in the evening. Adjust for rain.
- **Soil care cycles**: Compost top-dress every 4 weeks. Mulch refresh at season start.
- **Alerts**: Notify when soil moisture drops below threshold, when frost is forecast, when a pest is detected.

Automation is the bridge between "I do everything manually" and "the garden runs itself." Upgrading infrastructure unlocks smarter automation — a basic timer waters on a schedule, a moisture sensor waters on demand.

### Layer 3: Plants

The living things. Each species is a data-driven entity with real horticultural needs — temperature curves, pH preferences, nutrient demands, companion relationships, disease vulnerabilities.

Plants respond to everything below them: the soil they're in, the water they receive, the infrastructure protecting them. A tomato in a raised bed with drip irrigation and basil companion will dramatically outperform the same tomato in bare ground with a hose.

The plant library grows with the player. Start with easy annuals (basil, lettuce, zucchini). Unlock perennials, fruit trees, native wildflowers, cover crops. Each addition makes the ecosystem richer.

### Layer 4: Agents

Autonomous creatures that emerge from the ecosystem you've built.

**Pollinators** (bees, butterflies, hoverflies):
- Path-find between flowering plants each tick
- Boost fruit set on plants they visit
- Attracted by flower diversity, color, native species
- You never place them — they arrive when conditions are right
- Different species have different ranges and preferences

**Pests** (aphids, hornworms, slugs):
- Arrive based on weather, season, and plant vulnerability
- Spread between adjacent plants of the same family
- Countered by companion planting, beneficial insects, physical barriers
- Not "enemies" — part of the ecosystem. Ladybugs eat aphids. Parasitic wasps control hornworms. A healthy garden manages its own pests.

**Soil organisms** (earthworms, mycorrhizal networks):
- Invisible but tracked in the simulation
- Biology score reflects soil life health
- Worms improve compaction and drainage passively
- Mycorrhizal networks transfer nutrients between connected plants
- Boosted by organic matter, harmed by synthetic fertilizers and compaction

## What Exists Today

The simulation engine is built and tested:

- **ECS architecture** (miniplex) with entity-component systems
- **Plant growth model** — Gaussian response curves for temperature/moisture, Liebig's Law for nutrients, stress accumulation, disease ecology
- **Soil chemistry** — pH, N/P/K, organic matter, moisture, biology, compaction — all modeled and interactive
- **Companion planting** — adjacency-based buffs and penalties from real horticultural relationships
- **Disease/pest systems** — stress-triggered onset, environmental spread, treatment feedback
- **Weather generation** — seeded seasonal weather with special events (heatwave, drought, hail)
- **Frost mechanics** — probabilistic season-ending frost with tolerance levels
- **Climate zones** — zone-specific temperature curves, precipitation patterns, pest profiles
- **Deterministic simulation** — seeded PRNG, event sourcing, full replay capability
- **719 tests** across engine, data, rendering, and state
- **Two interfaces** — SvelteKit web UI with parametric SVG rendering, plus CLI for automated playtesting

The plant simulation core — growth curves, soil chemistry, companion interactions, disease ecology — is the foundation everything else builds on. It's real, it's tested, and it doesn't need to be rewritten. The new layers (infrastructure, automation, agents) are additive.

## What Gets Built Next

### Phase 1: Expanded Garden

Grow the grid from 3x3 to a real garden space. Variable-size plots. Scrollable/zoomable map. Soil health heat map overlay. This is mostly a rendering and UI challenge — the engine already supports arbitrary grid sizes.

### Phase 2: Infrastructure

New entity types for paths, beds, and irrigation. Infrastructure placement during a planning phase. Soil isolation in raised beds. Irrigation as passive moisture delivery. The ECS architecture handles this naturally — infrastructure items are just entities with components.

### Phase 3: Automation & Economy

Timers on irrigation. Maintenance schedules. An economy (budget per season) that forces trade-offs between infrastructure investment and plant variety. The efficiency multiplier: unused action capacity boosts your score because a well-designed garden shouldn't need constant attention.

### Phase 4: Agents

Pollinators as autonomous entities with simple movement AI. Path-finding between flowers. Pollination as a mechanical boost to fruit set. Pest agents that arrive, spread, and interact with companion defenses. This is where the garden starts feeling alive — emergent behavior from simple rules.

### Phase 5: Multi-Season Persistence

Perennial plants survive between seasons. Infrastructure persists and degrades. Soil health carries forward. The garden becomes a long-term project, not a single run. Each season you're refining a design, not starting from scratch.

## Moments of Delight

- You plant lavender near your tomatoes. A week later, a bee appears. It visits the lavender, then drifts to the tomato flowers. Your fruit yield ticks up. You never told it to do that.

- You check the soil health map after a dry week. Everything is red — except the bed with drip irrigation. That one's green. You smile and start planning where to run the next line.

- A hailstorm hits. Your exposed lettuce is shredded. But the bed under the cold frame? Untouched. That upgrade paid for itself.

- You notice aphids on your roses. You almost intervene — then you see ladybugs arriving from the wildflower border you planted last season. You do nothing. The aphids are gone next week.

- End of season. Your score card shows: 3 actions taken in the last 8 weeks. Efficiency multiplier: 2.4x. The garden ran itself. You designed it that way.

## Design Principles

1. **Indirect control over direct manipulation.** You create conditions, not outcomes. You plant lavender to attract bees, not drag a bee onto a flower.

2. **Systems over actions.** The interesting decisions are structural (where to put irrigation, which companions to group) not operational (water this plant today).

3. **Real horticulture, not fantasy farming.** Every mechanic maps to something a real gardener would recognize. The game teaches through simulation, not tutorials.

4. **Emergence over scripting.** Pollinators, pests, soil biology, and weather interact to produce outcomes the designer didn't hand-author. The garden surprises you.

5. **Restraint as mastery.** The best players intervene least. The game mechanically rewards this through efficiency scoring and teaches it through experience.

6. **Beauty as feedback.** A healthy garden looks beautiful. A struggling garden looks stressed. Visual state communicates health without numbers.
