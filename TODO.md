# Perennial — Project Roadmap

> Last updated 2026-02-24. All engine systems are implemented and tested, including spread check (runners, self-seeding, weed pressure, disease spread). Diagnosis engine, condition database, tools data, and mint species landed. What remains: Web UI action flows, diagnosis UI, meta-progression UI, visual overlays, more content, bug fixes, and polish.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| done | Implemented and tested |
| partial | Partially implemented |
| todo | Not started / placeholder only |

---

## Current State at a Glance

### What's Working

| Area | Status | Notes |
|------|--------|-------|
| ECS architecture (miniplex) | done | Entity/component types, world helpers, typed queries |
| Event sourcing | done | Full event log, reducer, replay, serialization round-trip |
| Seeded RNG | done | xoshiro128**, state save/restore, deterministic runs |
| Turn manager | done | DAWN→PLAN→ACT→DUSK→ADVANCE cycle, energy budget |
| Weather generation | done | 30-week season from zone profile, special events, frost sigmoid |
| Soil system | done | Amendment processing, moisture, nutrient depletion, biology |
| Companion system | done | Adjacency buffs/debuffs, diminishing returns |
| Growth system | done | Gaussian response curves, Liebig's law, stage progression |
| Stress system | done | pH/moisture/temp/nutrient stress, recovery, health derivation |
| Disease system | done | Onset probability, symptom stages, stress amplification, plant death |
| Pest system | done | Full pest check with counter-species, companion resistance |
| Pest event pre-generation | done | 6-pest catalog, independent RNG stream, zone pest weights |
| Frost system | done | Sigmoid probability, tolerance checks, perennial dormancy |
| Weather apply system | done | Hail damage, heavy rain compaction |
| Harvest check system | done | Harvest windows, quality decay, continuous harvest |
| Scoring engine | done | Four-category ScoreCard, zone multipliers, Three Sisters bonus |
| Simulation orchestrator | done | All 10 slots wired (1–10) |
| Diagnosis engine | done | Hypothesis generation, confidence scoring, similar-condition red herrings |
| Condition database | done | 21 conditions (7 fungal, 7 nutrient, 4 pest, 3 abiotic) |
| Amendments data | done | 6 amendments: compost, lime, sulfur, fertilizer, mulch, inoculant |
| Tools data | done | 7 tools defined with unlock conditions and effects |
| Species data | done | 5 species: tomato, basil, carrot, zucchini, mint (validated by Zod schema) |
| Zone data | done | 2 zones: zone_8a, zone_7b |
| Game session (shared) | done | Shared engine session used by both CLI and web UI |
| CLI interface | done | Full REPL, all commands, piped mode, save/load, Node.js data loader |
| SVG plant rendering | done | Parametric stems, leaves (8 shapes), flowers (4 shapes), fruit (5 shapes) |
| Animation | done | Wind/sway, breathing, stress tremor, harvest pop, particle burst |
| Season palette | done | 7 palettes, color derivation, health-based desaturation |
| Individualization | done | Per-instance visual variation from seed |
| Svelte stores | done | Reactive gameState, derived stores (week, plants, harvests, etc.) |
| Dexie persistence (web) | done | Save/load, lifetime stats, seed bank, journal, run history |
| Meta-progression logic | done | processRunEnd, seed bank, journal, zone progress, tool unlocks |
| Web UI — garden page | partial | Grid rendering, plant/wait actions, phase automation, seed selector |
| HUD components | partial | SeasonBar, WeatherRibbon, EnergyBar, ActionToolbar, SeedSelector |
| Dev tools | done | Plant Lab, Animation Lab |

### What's Stubbed or Missing

| Area | Status | Notes |
|------|--------|-------|
| Spread check system | done | Runner spreading, self-seeding, weed pressure, disease spread |
| Pest conditions in diagnosis DB | done | 4 pest conditions (aphid, whitefly, hornworm, spider mite) in CONDITION_DATABASE |
| Disease overlays (visual) | todo | Placeholder — no SVG disease indicators |
| Pest visual overlays | todo | No SVG overlays for pest infestations |
| Audio system | todo | ambient.ts and sfx.ts are placeholders |
| Additional species | todo | 4 of many planned species exist |
| Additional zones | partial | zone_7b added; climate ladder needs more |
| Web UI — amend action | todo | No amendment UI flow |
| Web UI — diagnose action | todo | No diagnosis UI flow |
| Web UI — intervene action | todo | No intervention/harvest/prune/treat UI |
| Web UI — scout action | todo | No scouting UI |
| Web UI — run end screen | todo | Frost just logs to console |
| Web UI — title screen | partial | Exists but minimal (just "Play" link) |
| Web UI — zoom/detail views | todo | No pinch-to-zoom, no plot focus or plant detail |
| Web UI — field journal | todo | No journal UI (data layer exists) |
| Web UI — seed bank UI | todo | No between-run seed bank browsing (data layer exists) |
| Web UI — meta-progression UI | todo | No zone unlock, tool unlock, lifetime stats screens |

### Known Bugs (from Playtesting)

Found via CLI gameplay testing sessions. Marked with `// TODO: BUG` in source.

| Bug | File | Description |
|-----|------|-------------|
| Amendment not applied | `src/cli/commands.ts:331` | AMEND event dispatched but amendment never added to soil entity |
| Unrealistic starting soil temp | `src/lib/engine/game-session.ts:231` | Initial soil temp 20°C is too warm for early spring |
| Energy not reset | `src/lib/engine/turn-manager.ts:194` | Energy not reset when entering new week's DAWN phase |
| Slow warm-season growth | `src/lib/engine/ecs/systems/growth.ts:132` | Growth extremely slow for warm-season crops in zone_8a |

---

## Workstreams

### WS1: Simulation Loop — COMPLETE

All 10 systems are wired into the tick orchestrator, including the spread check system (slot #9).

**Done:**
- WS1.4 — Spread Check System: `src/lib/engine/ecs/systems/spread.ts` — disease spread, runner spreading (mint), self-seeding, weed pressure. Mint species created. 36 tests.

### WS2: Diagnosis System — Engine Done, UI Remaining

The diagnosis engine and condition database are implemented. Treatment feedback and the UI layer remain.

**Done:**
- WS2.1 — Diagnosis engine (`src/lib/engine/diagnosis.ts`): `generateHypotheses()` with confidence scoring, symptom tag matching, SIMILAR_CONDITIONS red herrings. Tested in `tests/engine/diagnosis.test.ts`.
- WS2.4 — Condition database: 21 conditions (7 fungal, 7 nutrient, 4 pest, 3 abiotic) embedded in `diagnosis.ts` as `CONDITION_DATABASE`.
- WS2.4a — Pest conditions: 4 pest-related conditions (aphid_damage, whitefly_damage, hornworm_damage, spider_mite_damage) with SIMILAR_CONDITIONS entries and OVERLAY_TO_TAGS mappings.

**Remaining:**
- **WS2.2 — Diagnosis UI Flow** (todo): Spec doc 04 §Inspection Flow — zoom-in, examine action, observation notes, hypothesis cards, select + confirm. Depends on disease overlays (WS5.4).
- **WS2.3 — Treatment Feedback Loop** (todo): Spec doc 04 §Step 5 — correct/wrong treatment effects delayed 1-2 weeks. Depends on intervene action (WS5.3).
- WS2.4a — Pest Conditions (done): 4 pest conditions added to CONDITION_DATABASE with SIMILAR_CONDITIONS and overlay mappings.

### WS3: Data Content — Tools Done, Species In Progress

The data pipeline (Zod validation, glob import) is solid. Tools data is complete. Species are growing.

**Done:**
- WS3.1 — Amendments data (6 amendments)
- WS3.2 — Tools data (7 tools with unlock conditions and effects)

**Remaining:**
- **WS3.3 — Additional Species** (partial, 5 of ~16): Priority next species for gameplay variety:
  - Rosemary (perennial, Mediterranean, companion)
  - Pepper (Solanaceae, companion with tomato)
  - Marigold (pest resistance companion)
  - Beans (nitrogen fixer — crop rotation)
  - Lettuce (cool season, bolt risk, fast cycle)
  - ~~Mint (spreading mechanic for WS1.4)~~ — done
  - Strawberry (perennial, multi-year)
  - Corn (Three Sisters set)
- **WS3.4 — Additional Climate Zones** (partial): Spec doc 05 §Climate Ladder — ~~zone_7b~~, 7a, 6b, 6a, 5b, 5a (cold path) + zone_9a, 10a (heat path). zone_7b added.

### WS4: CLI Interface — COMPLETE

Fully implemented: REPL, all commands, piped mode, save/load, formatters, Node.js data loader. A CLI gameplay testing guide has been added for LLM agent playtesting sessions.

### WS5: Web UI Gameplay

The garden page has grid rendering, plant/wait actions, and phase automation. Most player actions and the full game lifecycle are missing.

- **WS5.1 — Amend Action Flow** (todo): Wire amendment selector → AMEND event → soil entity
- **WS5.2 — Scout Action Flow** (todo): Weather peek, pest forecast, soil survey. Depends on pest pre-gen (done).
- **WS5.3 — Intervene Action Flow** (todo): Prune, treat, harvest, pull actions
- **WS5.4 — Disease Overlay Visuals** (todo): `overlays.ts` is a placeholder. 11 overlay types per doc 06. Blocks diagnosis UI.
- **WS5.5 — Run End Screen** (todo): Score breakdown, season summary, new unlocks
- **WS5.6 — Run Start Flow** (todo): Zone select, seed input, seed bank review
- **WS5.7 — Zoom & Detail Views** (todo): Garden overview → plot focus → plant detail
- **WS5.8 — Frost Visual** (todo): White vignette, palette shift, death/dormancy animations
- **WS5.9 — Pest Visual Overlays** (todo): 6 pest-specific SVG overlays per pest type

### WS6: Meta-Progression UI

Data layer is complete and tested. All UI is missing.

- **WS6.1 — Seed Bank Browser** (todo)
- **WS6.2 — Field Journal UI** (todo)
- **WS6.3 — Climate Ladder / Zone Select** (todo): Depends on WS3.4
- **WS6.4 — Tool Unlock Screen** (todo): Tools data is now ready (WS3.2 done)
- **WS6.5 — Lifetime Stats & Run History** (todo)
- **WS6.6 — Between-Run Flow** (todo): Depends on WS5.5, WS6.1, WS6.3

### WS7: Polish

- **WS7.1 — Audio System** (todo): Placeholders only
- **WS7.2 — PWA & Offline** (todo)
- **WS7.3 — Onboarding / Tutorial** (todo)
- **WS7.4 — Performance Optimization** (todo)
- **WS7.5 — Companion Discovery Cues** (todo): Golden sparkle / red flicker
- **WS7.6 — Seed Swap Events** (todo)
- **WS7.7 — Stress/Disease Visual Modifiers** (todo): Leaf droop, desaturation, wilting

---

## Priority Phases

### Phase 1 — Minimum Playable Season
> A player can start a run, plant, amend, harvest, see score, start another run.
> Engine work is complete. Web UI action flows, more species, and bug fixes remain.

| # | Task | Status |
|---|------|--------|
| 1 | Fix known bugs (4 playtesting bugs) | todo |
| 2 | Amend action UI (WS5.1) | todo |
| 3 | Intervene/harvest action UI (WS5.3) | todo |
| 4 | Run end screen (WS5.5) | todo |
| 5 | Run start flow — zone/seed select (WS5.6) | todo |
| 6 | 4–6 more species — pepper, beans, marigold, lettuce, rosemary, corn (WS3.3) | todo |

### Phase 2 — Diagnosis & Strategic Depth
> The core learning mechanic works end-to-end. Players diagnose, treat, and learn.
> Diagnosis engine is done. Visual overlays and UI remain.

| # | Task | Status |
|---|------|--------|
| 7 | Add pest conditions to diagnosis DB (WS2.4a) | done |
| 8 | Disease overlay visuals (WS5.4) | todo |
| 9 | Pest visual overlays (WS5.9) | todo |
| 10 | Stress/disease visual modifiers (WS7.7) | todo |
| 11 | Diagnosis UI flow (WS2.2) | todo |
| 12 | Treatment feedback loop (WS2.3) | todo |
| 13 | Scout action UI (WS5.2) | todo |
| 14 | Zoom & detail views (WS5.7) | todo |
| 15 | Companion discovery cues (WS7.5) | todo |

### Phase 3 — Meta-Progression & Content
> Between-run progression and content depth.

| # | Task | Status |
|---|------|--------|
| 16 | Additional zones — 2-3 (WS3.4) | todo |
| 17 | Climate ladder UI (WS6.3) | todo |
| 18 | Tool unlock screen (WS6.4) | todo |
| 19 | Seed bank browser (WS6.1) | todo |
| 20 | Field journal UI (WS6.2) | todo |
| 21 | Lifetime stats screen (WS6.5) | todo |
| 22 | Between-run flow (WS6.6) | todo |

### Phase 4 — Breadth & Polish

| # | Task | Status |
|---|------|--------|
| 23 | Spread check system (WS1.4) | done |
| 24 | More species — mint, strawberry, zone-specific (WS3.3/3.5) | todo |
| 25 | Full zone ladder (WS3.4) | todo |
| 26 | Audio system (WS7.1) | todo |
| 27 | Frost visual (WS5.8) | todo |
| 28 | PWA & offline (WS7.2) | todo |
| 29 | Onboarding / tutorial (WS7.3) | todo |
| 30 | Performance optimization (WS7.4) | todo |
| 31 | Seed swap events (WS7.6) | todo |

---

## Notes

- **Test convention:** Every new system should have a corresponding test file in `tests/` following existing patterns (fixtures, deterministic RNG, real system code with controlled inputs).
- **Species are data:** Adding species requires only a JSON file + `npm run validate:species`. No code changes.
- **CLI shares engine:** The CLI must not import from `src/lib/render/`, `src/lib/audio/`, `src/lib/state/stores.ts`, or `src/routes/`. It shares `engine/`, `data/`, `state/events.ts`, and `state/event-log.ts`.
- **The doc 03 tick order** (1-10) is the canonical reference. `simulation.ts` runs all 10 slots.
- **Bug fixes first:** The 4 known bugs affect basic gameplay (amendments, energy, growth). Fix before building UI on top.
