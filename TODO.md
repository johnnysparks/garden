# Perennial — Project Roadmap

> Last updated 2026-02-24 by comparing design docs (docs/00–08) against the implemented codebase.
> All 607 tests pass. The full simulation loop (9 of 10 systems), scoring engine, CLI interface, and amendments data are complete.
> What remains is the diagnosis system, visual overlays, Web UI action flows, meta-progression UI, additional content, and polish.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| done | Implemented and tested |
| partial | Partially implemented or stubbed |
| todo | Not started / placeholder only |

---

## Current State at a Glance

### What's Working

| Area | Status | Notes |
|------|--------|-------|
| ECS architecture (miniplex) | done | Entity/component types, world helpers, typed queries |
| Event sourcing | done | Full event log, reducer, replay, serialization round-trip |
| Seeded RNG | done | xoshiro128**, state save/restore, deterministic runs |
| Turn manager | done | DAWN→PLAN→ACT→DUSK→ADVANCE cycle, energy budget, season/weather modifiers |
| Weather generation | done | 30-week season from zone profile, special events, frost sigmoid |
| Soil system | done | Amendment processing, moisture, nutrient depletion, biology, organic matter |
| Companion system | done | Adjacency buffs/debuffs, diminishing returns, per-tick clearing |
| Growth system | done | Gaussian response curves, Liebig's law, stage progression, companion modifiers |
| Stress system | done | pH/moisture/temp/nutrient stress, recovery, health derivation |
| Disease system | done | Onset probability, symptom stage progression, stress amplification, plant death |
| Frost system | done | Sigmoid probability, tolerance checks, perennial dormancy |
| SVG plant rendering | done | Parametric stems, leaves (8 shapes), flowers (4 shapes), fruit (5 shapes) |
| Animation | done | Wind/sway, breathing, stress tremor, harvest pop, particle burst |
| Season palette | done | 7 palettes, color derivation, health-based desaturation |
| Individualization | done | Per-instance visual variation from seed |
| Plant design validation | done | 5 visual checks automated in tests for tomato + basil |
| Svelte stores | done | Reactive gameState, derived stores (week, plants, harvests, etc.) |
| Dexie persistence (web) | done | Save/load, lifetime stats, seed bank, journal, run history, zones, tools |
| Meta-progression logic | done | processRunEnd integration, seed bank, journal, zone progress, tool unlocks |
| Weather apply system | done | Hail damage + heavy rain compaction (tick slot #1) |
| Pest system | done | Full pest check with counter-species, companion resistance (tick slot #7) |
| Pest event pre-generation | done | 6-pest catalog, independent RNG stream, zone pest weights |
| Harvest check system | done | Harvest windows, quality decay, continuous harvest (tick slot #8) |
| Scoring engine | done | Four-category ScoreCard, zone multipliers, Three Sisters bonus |
| Simulation orchestrator | done | All systems wired: slots 1–8, 10 (only spread #9 missing) |
| Amendments data | done | 6 amendments: compost, lime, sulfur, fertilizer, mulch, inoculant |
| CLI interface | done | Full REPL, all commands, piped mode, save/load, Node.js data loader |
| Species data | done | 2 species: tomato_cherokee_purple, basil_genovese (validated by Zod schema) |
| Zone data | done | 1 zone: zone_8a |
| Game session | done | Session creation, tick integration, weather exposure, frost run-end |
| Web UI — garden page | partial | Grid rendering, plant/wait actions, phase automation, seed selector |
| HUD components | partial | SeasonBar, WeatherRibbon, EnergyBar, ActionToolbar, SeedSelector |
| Dev tools | done | Plant Lab, Animation Lab |

### What's Stubbed or Missing

| Area | Status | Notes |
|------|--------|-------|
| Spread check system | todo | Placeholder file — no invasive spreading, self-seeding, weeds |
| Diagnosis engine | todo | Placeholder file — no hypothesis generation or matching |
| Disease overlays (visual) | todo | Placeholder file — no visual disease indicators |
| Pest visual overlays | todo | No SVG overlays for pest infestations |
| Audio system | todo | Both ambient.ts and sfx.ts are placeholder files |
| Tools data | todo | tools.json is empty `[]` |
| Additional species | todo | Only 2 of many planned species exist |
| Additional zones | todo | Only zone_8a exists; climate ladder needs more |
| Web UI — amend action | todo | No amendment UI flow |
| Web UI — diagnose action | todo | No diagnosis UI flow |
| Web UI — intervene action | todo | No intervention/harvest/prune/treat UI |
| Web UI — scout action | todo | No scouting UI |
| Web UI — run end screen | todo | Frost just logs to console |
| Web UI — title screen | partial | Exists but minimal (just "Play" link) |
| Web UI — zoom/detail views | todo | No pinch-to-zoom, no plot focus or plant detail views |
| Web UI — field journal | todo | No journal UI (data layer exists) |
| Web UI — seed bank UI | todo | No between-run seed bank browsing (data layer exists) |
| Web UI — meta-progression UI | todo | No zone unlock, tool unlock, lifetime stats screens |

---

## Workstreams

The work divides into 7 workstreams. The dependency graph below shows which blocks must complete before others can start.

```
                    ┌─────────────────────────┐
                    │  WS1: Complete Sim Loop  │
                    │  (weather apply, pest,   │
                    │   harvest, spread, score) │
                    └──────────┬──────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              v                v                v
  ┌───────────────────┐ ┌──────────────┐ ┌──────────────────┐
  │ WS2: Diagnosis    │ │ WS3: Data    │ │ WS4: CLI         │
  │ (engine +         │ │ (amendments, │ │ (full interface   │
  │  hypothesis UI)   │ │  species,    │ │  per doc 08)     │
  └────────┬──────────┘ │  zones,      │ └──────────────────┘
           │            │  tools)      │
           │            └──────┬───────┘
           │                   │
           v                   v
  ┌───────────────────────────────────────┐
  │  WS5: Web UI Gameplay                │
  │  (all player actions, run lifecycle, │
  │   zoom views, disease overlays)      │
  └────────────────┬──────────────────────┘
                   │
                   v
  ┌───────────────────────────────────────┐
  │  WS6: Meta-Progression UI            │
  │  (seed bank, journal, zone ladder,   │
  │   tool unlocks, run history screens) │
  └────────────────┬──────────────────────┘
                   │
                   v
  ┌───────────────────────────────────────┐
  │  WS7: Polish                         │
  │  (audio, PWA, frost visuals,         │
  │   onboarding, performance)           │
  └───────────────────────────────────────┘
```

---

## WS1: Complete Simulation Loop

The engine runs 9 of 10 planned systems. Only spread (slot #9) remains as a placeholder. The scoring engine is fully implemented.

### WS1.1 — Weather Apply System ✅
- **File:** `src/lib/engine/ecs/systems/weather.ts`
- **Status:** done
- Implements hail damage (scaled by plant stage) and heavy rain compaction effects. Wired into tick slot #1.

### WS1.2 — Pest System ✅
- **File:** `src/lib/engine/ecs/systems/pest.ts`
- **Status:** done
- Full pestCheckSystem with companion pest_resistance modifiers, counter-species reduction, health/stress damage, pestInfestation component management. Wired into tick slot #7.

#### WS1.2a — Pest Event Pre-Generation ✅
- **File:** `src/lib/engine/pest-gen.ts`
- **Status:** done
- Built-in PEST_CATALOG with 6 pest types (aphids, whitefly, thrips, tomato_hornworm, cabbage_moth, spider_mite). Independent RNG stream (PEST_SEED_MASK), zone-level pest_event_weights support, min-gap enforcement. Wired into createGameSession().

### WS1.3 — Harvest Check System ✅
- **File:** `src/lib/engine/ecs/systems/harvest.ts`
- **Status:** done
- Harvest window detection, minimum health checks, quality decay per unharvested week, continuous harvest for multi-harvest species. Wired into tick slot #8.

### WS1.4 — Spread Check System
- **File:** `src/lib/engine/ecs/systems/spread.ts`
- **Status:** todo (placeholder)
- **Spec:** doc 03 §9 — mint runners claim adjacent empty plots, self-seeders probability for next run volunteers, weed pressure on empty plots
- **Depends on:** growth system (done)
- **Blocks:** nothing critical (can be deferred)

### WS1.5 — Scoring Engine ✅
- **File:** `src/lib/engine/scoring.ts`
- **Status:** done
- Four-category ScoreCard (harvest, soil, survival, knowledge). Zone-based difficulty multipliers. Three Sisters planting set bonus.

### WS1.6 — Wire Systems into Tick Orchestrator ✅
- **File:** `src/lib/engine/simulation.ts`
- **Status:** done (slots 1–8, 10 wired; only spread #9 missing)

---

## WS2: Diagnosis System

The core educational mechanic. Engine + UI are both needed. This is the deepest design doc (doc 04) and the biggest single feature.

### WS2.1 — Diagnosis Engine
- **File:** `src/lib/engine/diagnosis.ts`
- **Status:** todo (placeholder)
- **Spec:** doc 04 §Hypothesis generation — match plant active_symptoms against vulnerability list, compute confidence scores, add 1-2 plausible wrong answers from SIMILAR_CONDITIONS, sort by confidence, return top 3-5
- **Depends on:** disease system (done), species vulnerability data (done in 2 species)
- **Blocks:** WS2.2, WS4 (CLI diagnose command)

### WS2.2 — Diagnosis UI Flow
- **Spec:** doc 04 §Inspection Flow — zoom-in (free), examine (1 energy), observation notes from symptom state, context clues (pH, moisture, weather, neighbors), hypothesis cards with confidence indicators, select + confirm
- **Depends on:** WS2.1, disease overlays (WS5.4)
- **Blocks:** WS6 (journal entries from diagnoses, pattern libraries)

### WS2.3 — Treatment Feedback Loop
- **Spec:** doc 04 §Step 5 — correct diagnosis + correct treatment stabilizes condition, wrong treatment no effect or worsens, feedback delayed 1-2 weeks
- **Depends on:** WS2.1, intervene action (WS5.3)

### WS2.4 — Condition Database
- **Spec:** doc 04 §Condition Database — fungal (5 conditions), nutrient deficiency (6), pest-related (4), abiotic (4) = 19 conditions minimum
- **Currently:** disease data is embedded in species JSON vulnerabilities; need broader condition registry
- **Depends on:** nothing
- **Blocks:** WS2.1 (SIMILAR_CONDITIONS lookup)

---

## WS3: Data Content

Species, amendments, tools, and zones are all JSON-driven. The pipeline works (Zod validation, glob import, auto-loading), so this is primarily content authoring.

### WS3.1 — Amendments Data ✅
- **File:** `src/lib/data/amendments.json`
- **Status:** done
- 6 amendments defined: compost, lime, sulfur, fertilizer (synthetic), mulch, inoculant. Each with effect delays (1–3 weeks) and soil deltas.

### WS3.2 — Tools Data
- **File:** `src/lib/data/tools.json`
- **Status:** todo (empty array)
- **Spec:** doc 05 §Tools — soil test kit, weather almanac, hand lens, drip irrigation, cold frame, compost bin, seed library, each with unlock conditions and effects
- **Depends on:** nothing
- **Blocks:** WS6 (tool unlock UI)

### WS3.3 — Additional Plant Species (Batch 1: Starter Set)
- **Status:** 2 of many species exist
- **Spec:** doc 02 + doc 03 + doc 04 reference many plants — tomato, basil, rosemary, pepper, carrot, squash, cucumber, peas, beans, lettuce, spinach, corn, marigold, strawberry, mint, fennel
- **Priority species for core gameplay:**
  - Rosemary (perennial, Mediterranean, companion)
  - Pepper (Solanaceae family, companion with tomato)
  - Marigold (pest resistance companion)
  - Beans (nitrogen fixer — teaches crop rotation)
  - Squash/zucchini (Three Sisters set, distinct visual)
  - Lettuce (cool season, bolt risk, fast cycle)
  - Mint (spreading mechanic for WS1.4)
  - Strawberry (perennial, multi-year progression)
- **Depends on:** schema (done), visual pipeline (done)
- **Blocks:** richer gameplay, companion discovery, diagnosis variety

### WS3.4 — Additional Climate Zones
- **Status:** 1 zone (zone_8a)
- **Spec:** doc 05 §Climate Ladder — zone_7b, 7a, 6b, 6a, 5b, 5a (cold path) + zone_9a, 10a (heat path)
- **Depends on:** weather-gen (done)
- **Blocks:** WS6 (zone unlock progression)

### WS3.5 — Species Batch 2 (Zone-Specific & Advanced)
- Varieties/cultivars for existing species (San Marzano tomato, Brandywine, etc.)
- Zone-specific species (cold-hardy, heat-tolerant)
- **Depends on:** WS3.4

---

## WS4: CLI Interface ✅

The CLI is fully implemented with interactive REPL, piped command support, and all documented commands.

### WS4.1 — CLI Entry Point & REPL ✅
- **File:** `src/cli/index.ts` (244 lines)
- Entry point with arg parsing (--zone, --seed), interactive readline REPL, piped/non-interactive mode.

### WS4.2 — Command Parser & Dispatcher ✅
- **File:** `src/cli/commands.ts` (485 lines)
- All commands: new, load, save, quit, advance, week, plant, amend, diagnose, intervene, scout, wait, status, grid, inspect, weather, plants, soil, species, amendments, log, score, help.

### WS4.3 — Text Formatters ✅
- **File:** `src/cli/formatter.ts` (529 lines)
- Status, ASCII grid, inspect, weather, plants, soil, species, logs, diagnostics output.

### WS4.4 — CLI Session Wrapper ✅
- **File:** `src/cli/session.ts` (496 lines)
- Wraps GameSession without Svelte store dependencies, JSON file save/load via fs.

### WS4.5 — CLI Data Loader ✅
- **File:** `src/cli/data-loader.ts` (137 lines)
- Node.js-compatible species/zone/amendment loading without Vite import.meta.glob.

---

## WS5: Web UI Gameplay

The garden page exists with grid rendering, plant action, and phase automation. Most player actions and the full game lifecycle are missing.

### WS5.1 — Amend Action Flow
- Wire "Amend" button in ActionToolbar → amendment selector → dispatch AMEND event → add PendingAmendment to soil entity
- **Depends on:** WS3.1 (amendments data)

### WS5.2 — Scout Action Flow
- Wire "Scout" button → target selector (weather peek / pest forecast / soil survey) → reveal info overlay
- **Pest scouting:** Allow the player to peek at upcoming `PestEvent` arrivals (arrival week, target families, severity tier) from the pre-generated `seasonPests` list. Costs 1 energy; reveals the next N weeks of pest pressure.
- **Depends on:** WS1.2a (pre-generated pest events), WS1.2 (pest data to scout)

### WS5.3 — Intervene Action Flow
- Wire "Intervene" button → action selector (prune, treat, harvest, pull) → dispatch INTERVENE/HARVEST event → ECS state update
- **Depends on:** WS1.3 (harvest system), WS2.1 (diagnosis for treatment targeting)

### WS5.4 — Disease Overlay Visuals
- **File:** `src/lib/render/shapes/overlays.ts`
- **Status:** todo (placeholder)
- **Spec:** doc 06 §Disease Overlay Visuals — 11 overlay types (interveinal_yellowing, leaf_spots, concentric_rings, powdery_coating, wilting, fruit_base_rot, stem_lesions, insect_clusters, yellowing_uniform, purple_tint, brown_edges), each with intensity parameter
- **Depends on:** disease system (done)
- **Blocks:** WS2.2 (diagnosis needs visible symptoms)

### WS5.9 — Pest Visual Overlays in SVG Renderer
- **File:** `src/lib/render/shapes/overlays.ts` (extend alongside disease overlays)
- **Status:** todo
- **Spec:** When a plant entity has an active `pestInfestation` component, render pest-specific SVG overlays driven by the `visual` string from `PestDefinition`. Overlay types needed: `small_insects_on_leaves` (aphid clusters — small dot clusters on leaf surfaces), `tiny_white_insects` (whitefly — speckling on undersides), `stippled_leaves` (thrips — silvery streaks), `large_caterpillar` (hornworm — large green body on stem), `leaf_holes_caterpillar` (cabbage moth — ragged holes), `stippled_leaves_webbing` (spider mite — fine webbing + stippling). Each overlay takes a `severity` parameter (0–1) controlling density/opacity.
- **Depends on:** WS1.2a (pest events that create `pestInfestation` component), WS5.4 (shares `overlays.ts`)
- **Blocks:** WS5.2 visual feedback (scout reveals correspond to visible overlays)

### WS5.5 — Run End Screen
- Currently frost just logs to console
- **Spec:** doc 08 output format (killing frost summary), doc 05 scoring
- Show final score breakdown, season summary, new unlocks
- **Depends on:** WS1.5 (scoring engine)

### WS5.6 — Run Start Flow
- Title screen → new game (zone select, seed input, seed bank review) → garden page
- Currently just a "Play" link that hard-codes zone_8a and random seed
- **Depends on:** WS3.4 (zones to select from)

### WS5.7 — Zoom & Detail Views
- **Spec:** doc 06 §Zoom Levels — garden overview, plot focus, plant detail
- Pinch-to-zoom, smooth interpolation, diagnosis entry point from plant detail
- **Depends on:** grid rendering (done)

### WS5.8 — Frost Visual
- **Spec:** doc 06 §Frost Visual — white vignette, palette shift, annual death animation, perennial dormancy, ground frost texture
- **Depends on:** frost system (done), palette (done)

---

## WS6: Meta-Progression UI

The data layer for meta-progression (Dexie persistence, seed bank, journal, zone progress, tool unlocks) is fully implemented and tested. What's missing is the player-facing UI.

### WS6.1 — Seed Bank Browser
- Browse unlocked species + cultivars, view stats, select for next run
- **Spec:** doc 05 §Seed Bank
- **Depends on:** seed bank data layer (done), WS3.3 (more species)

### WS6.2 — Field Journal UI
- Species pages, diagnosis log, season summaries, discovery tracker (progress bars)
- **Spec:** doc 05 §Field Journal
- **Depends on:** journal data layer (done)

### WS6.3 — Climate Ladder / Zone Select
- Zone unlock display, branching path visualization (cold path vs hot path), unlock criteria
- **Spec:** doc 05 §Climate Ladder
- **Depends on:** WS1.5 (scoring for unlock criteria), WS3.4 (zone data)

### WS6.4 — Tool Unlock Screen
- Display unlocked tools, show unlock conditions for locked ones, explain effects
- **Spec:** doc 05 §Tools
- **Depends on:** WS3.2 (tools data)

### WS6.5 — Lifetime Stats & Run History
- Total runs, species grown, conditions diagnosed, best scores, Green Thumb Index
- **Spec:** doc 05 §Lifetime Stats
- **Depends on:** lifetime stats data layer (done)

### WS6.6 — Between-Run Flow
- Run end → score display → new unlocks → seed bank → zone select → new run
- **Depends on:** WS5.5, WS6.1, WS6.3

---

## WS7: Polish

Lower priority work that adds quality but isn't required for core gameplay.

### WS7.1 — Audio System
- **Files:** `src/lib/audio/ambient.ts`, `src/lib/audio/sfx.ts`
- **Status:** todo (placeholders)
- **Spec:** doc 07 mentions procedural ambient + SFX
- Procedural garden soundscape (wind, rain, birds), action SFX (planting, harvesting, phase transitions)

### WS7.2 — PWA & Offline
- **Spec:** doc 00 mentions PWA-capable for offline play
- Service worker, manifest, offline asset caching

### WS7.3 — Onboarding / Tutorial
- First-run guidance, contextual hints during early weeks
- **Depends on:** full gameplay loop

### WS7.4 — Performance Optimization
- **Spec:** doc 06 §Performance Targets — 60fps with 20 plants, <2ms SVG gen/plant
- LOD at zoom levels, leaf count reduction at overview, CSS-only fallback animations

### WS7.5 — Companion Discovery Visual Cues
- **Spec:** doc 03 §3 — golden sparkle for positive interaction, red flicker for negative, hidden until observed 3 times
- **Depends on:** companion system (done), visual pipeline (done)

### WS7.6 — Seed Swap Events
- **Spec:** doc 05 §Seed Bank — random between-run trade offer
- **Depends on:** WS6.1 (seed bank UI), WS3.3 (cultivar variants)

### WS7.7 — Stress/Disease Visual Modifiers
- **Spec:** doc 06 §Step 2 — leaf droop from stress, color desaturation, stem curve (wilting), params perturbation from conditions
- Currently animation system supports tremor but PlantRenderer doesn't apply stress-driven visual parameter changes
- **Depends on:** visual pipeline (done)

---

## Suggested Priority Order

Phase 1 targets a playable end-to-end loop. Phase 2 adds depth. Phase 3 adds breadth and polish.

### Phase 1 — Minimum Playable Season
> Goal: A player can start a run, plant, amend, harvest, see score, start another run.
> **Engine work complete.** Web UI action flows and content remain.

| # | Task | Workstream | Status |
|---|------|------------|--------|
| 1 | ~~Weather apply system~~ | WS1.1 | ✅ done |
| 2 | ~~Harvest check system~~ | WS1.3 | ✅ done |
| 3 | ~~Scoring engine~~ | WS1.5 | ✅ done |
| 4 | ~~Wire weather + harvest into tick orchestrator~~ | WS1.6 | ✅ done |
| 5 | ~~Amendments data~~ | WS3.1 | ✅ done |
| 6 | Amend action UI | WS5.1 | todo |
| 7 | Intervene/harvest action UI | WS5.3 | todo |
| 8 | Run end screen | WS5.5 | todo |
| 9 | Run start flow (zone/seed select) | WS5.6 | todo |
| 10 | 4-6 more species (pepper, beans, marigold, lettuce, rosemary, squash) | WS3.3 | todo |

### Phase 2 — Diagnosis & Strategic Depth
> Goal: The core learning mechanic works. Players diagnose, treat, and learn.
> **Pest engine work complete.** Diagnosis, visual overlays, and UI remain.

| # | Task | Workstream | Status |
|---|------|------------|--------|
| 11 | Condition database (19+ conditions) | WS2.4 | todo |
| 12 | Disease overlay visuals | WS5.4 | todo |
| 13 | Stress/disease visual modifiers | WS7.7 | todo |
| 14 | Diagnosis engine | WS2.1 | todo |
| 15 | Diagnosis UI flow | WS2.2 | todo |
| 16 | Treatment feedback loop | WS2.3 | todo |
| 17 | ~~Pest event pre-generation (pest-gen.ts)~~ | WS1.2a | ✅ done |
| 18 | ~~Pest system (wire pre-gen into tick)~~ | WS1.2 | ✅ done |
| 19 | Pest visual overlays | WS5.9 | todo |
| 20 | Scout action UI (pest scouting) | WS5.2 | todo |
| 21 | Companion discovery cues | WS7.5 | todo |
| 22 | Zoom & detail views | WS5.7 | todo |

### Phase 3 — Meta-Progression & CLI
> Goal: Between-run progression gives the game long-term pull. CLI enables automated playtesting.
> **CLI is fully complete.** Meta-progression UI and content remain.

| # | Task | Workstream | Status |
|---|------|------------|--------|
| 21 | Field journal UI | WS6.2 | todo |
| 22 | Seed bank browser | WS6.1 | todo |
| 23 | Tools data | WS3.2 | todo |
| 24 | Tool unlock screen | WS6.4 | todo |
| 25 | Additional zones (2-3) | WS3.4 | todo |
| 26 | Climate ladder UI | WS6.3 | todo |
| 27 | Between-run flow | WS6.6 | todo |
| 28 | Lifetime stats screen | WS6.5 | todo |
| 29 | ~~CLI entry point & REPL~~ | WS4.1 | ✅ done |
| 30 | ~~CLI command parser~~ | WS4.2 | ✅ done |
| 31 | ~~CLI text formatters~~ | WS4.3 | ✅ done |
| 32 | ~~CLI session wrapper~~ | WS4.4 | ✅ done |
| 33 | ~~CLI data loader~~ | WS4.5 | ✅ done |

### Phase 4 — Breadth & Polish
> Goal: Content richness, audio, offline, performance.

| # | Task | Workstream | Depends On |
|---|------|------------|------------|
| 34 | Spread check system | WS1.4 | — |
| 35 | Species batch 2 (zone-specific, cultivars) | WS3.5 | WS3.4 |
| 36 | Remaining zones (full ladder) | WS3.4 | — |
| 37 | Audio system | WS7.1 | — |
| 38 | Frost visual | WS5.8 | — |
| 39 | PWA & offline | WS7.2 | — |
| 40 | Onboarding / tutorial | WS7.3 | Phase 2 |
| 41 | Performance optimization | WS7.4 | — |
| 42 | Seed swap events | WS7.6 | WS6.1 |

---

## Dependency Graph (Gantt-Style)

Tasks that can run in parallel are on the same row. Arrows show hard dependencies.

```
Phase 1 — Minimum Playable Season
═══════════════════════════════════════════════════════════════════════

  [WS1.1 Weather Apply]──────┐
                              ├──[WS1.6 Wire into Tick]──┐      ALL ✅ DONE
  [WS1.3 Harvest Check]──────┘                           │
  [WS1.5 Scoring]─────────────────────────────┐          │
  [WS3.1 Amendments Data]────────────────┐    │          │
  ── engine complete ──                  │    │          │
                                         v    v          v
  Remaining UI work:            [WS5.1 Amend UI] [WS5.5 Run End]
                                [WS5.3 Intervene/Harvest UI]
                                [WS5.6 Run Start Flow]
                                [WS3.3 More Species]
                                              ── PHASE 1 UI REMAINING ──


Phase 2 — Diagnosis & Strategic Depth
═══════════════════════════════════════════════════════════════════════

  [WS1.2a Pest Pre-Gen] ✅ DONE
  [WS1.2 Pest System]   ✅ DONE
  ── pest engine complete ──

  Remaining:
  [WS2.4 Condition DB]─────>[WS2.1 Diagnosis Engine]──>[WS2.2 Diagnosis UI]
                                                    └──>[WS2.3 Treatment Loop]
  [WS5.4 Disease Overlays]──────────────────────────┘
  [WS7.7 Stress Visuals]
  [WS5.9 Pest Overlays]──>[WS5.2 Scout UI]
  [WS7.5 Companion Cues]
  [WS5.7 Zoom Views]
                                              ── PHASE 2 COMPLETE ──


Phase 3 — Meta-Progression & CLI
═══════════════════════════════════════════════════════════════════════

  [WS4 CLI] ✅ ALL DONE (entry, commands, formatters, session, data loader)
  ── CLI complete ──

  Remaining:
  [WS6.2 Journal UI]
  [WS6.1 Seed Bank UI]─────────────────────────────┐
  [WS3.2 Tools Data]──>[WS6.4 Tool Unlock Screen]  │
  [WS3.4 More Zones]──>[WS6.3 Climate Ladder UI]───┤
  [WS6.5 Lifetime Stats]                           │
                                                    v
                                            [WS6.6 Between-Run Flow]
                                              ── PHASE 3 COMPLETE ──


Phase 4 — Breadth & Polish
═══════════════════════════════════════════════════════════════════════

  [WS1.4 Spread System]
  [WS3.5 Species Batch 2]
  [WS3.4 Full Zone Ladder]
  [WS7.1 Audio]
  [WS5.8 Frost Visual]
  [WS7.2 PWA/Offline]
  [WS7.3 Onboarding]
  [WS7.4 Performance]
  [WS7.6 Seed Swap Events]
                                              ── PHASE 4 COMPLETE ──
```

---

## Notes

- **Test convention:** Every new system should have a corresponding test file in `tests/` following existing patterns (fixtures, deterministic RNG, real system code with controlled inputs).
- **Species are data:** Adding species requires only a JSON file + `npm run validate:species`. No code changes.
- **CLI shares engine:** The CLI must not import from `src/lib/render/`, `src/lib/audio/`, `src/lib/state/stores.ts`, or `src/routes/`. It shares `engine/`, `data/`, `state/events.ts`, and `state/event-log.ts`.
- **The doc 03 tick order** (1-10) is the canonical reference. `simulation.ts` currently runs slots 1,2,3,4,5,6,7,8,10. Only slot 9 (spread) is not yet wired.
