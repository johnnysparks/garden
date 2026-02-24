# CLAUDE.md

## Project Overview

**Perennial** is a roguelike gardening simulator where each run is a growing season, death comes by frost, and the player builds real horticultural knowledge through play.

The game has two interfaces to the same engine:

- **Web UI** — Mobile-first browser game built with SvelteKit, TypeScript, and parametric SVG rendering.
- **CLI** — Thin Node.js wrapper that prints game state as structured text and accepts commands via stdin. Designed for automated playtesting by LLM agents, headless testing, and scripted scenarios.

The engine uses an Entity-Component-System (ECS) architecture via miniplex, event sourcing for state management, and seeded PRNG for deterministic runs. Every plant species is defined as a JSON file that encodes both simulation behavior and visual appearance — adding a new species requires no code changes.

## Commands

```bash
# Web UI
npm run dev              # Start Vite dev server with HMR
npm run build            # Validate species JSON + build static site
npm run preview          # Preview production build locally

# CLI
npx perennial play       # Start interactive CLI game session
npx perennial play --zone zone_8a --seed 42  # With options
npx perennial load saves/my-run.json         # Resume from save

# Shared
npm run test             # Run full test suite (vitest)
npm run test:watch       # Run tests in watch mode
npm run check            # SvelteKit sync + svelte-check type checking
npm run check:watch      # Type checking in watch mode
npm run validate:species # Validate all species JSON against Zod schema
```

Build runs `validate:species` before `vite build`. Both must pass for CI to succeed.

## Architecture

### Tech Stack

**Shared (Engine + Data)**

| Layer       | Choice                    | Notes                                              |
|-------------|---------------------------|----------------------------------------------------|
| Language    | TypeScript (strict mode)  | All source is TypeScript                           |
| ECS         | miniplex                  | Entity-component-system for game entities          |
| State       | Event sourcing            | Append-only event log, replay for save/load        |
| Validation  | Zod                       | Schema validation for species JSON at build time   |
| Testing     | Vitest                    | 719 tests across engine, data, render, and state   |

**Web UI**

| Layer       | Choice                    | Notes                                              |
|-------------|---------------------------|----------------------------------------------------|
| Framework   | SvelteKit 2.x             | Static adapter, deployed to GitHub Pages at `/garden` |
| Rendering   | Parametric SVG            | Plants rendered from JSON params, not sprites      |
| Reactivity  | Svelte stores             | Reactive UI derived from event log                 |
| Persistence | Dexie.js (IndexedDB)      | Offline-first, meta-progression across runs        |
| Build       | Vite                      | SvelteKit default bundler                          |

**CLI**

| Layer       | Choice                    | Notes                                              |
|-------------|---------------------------|----------------------------------------------------|
| Runtime     | Node.js 20+              | Direct engine import, no browser needed             |
| I/O         | readline (Node built-in)  | Interactive REPL + piped command support            |
| Persistence | fs (JSON files)           | Serialize event log to disk                        |

### Directory Structure

```
src/
  cli/                      # CLI interface (no Svelte/browser dependencies)
    index.ts                # Entry point, arg parsing, REPL loop
    commands.ts             # Command parser + dispatcher
    formatter.ts            # Text output formatters (grid, status, inspect)
    session.ts              # CLI-specific GameSession wrapper
    data-loader.ts          # Node.js species/zone/amendment loader (no Vite)
  lib/
    engine/                 # Simulation engine (no UI dependencies)
      ecs/
        components.ts       # ECS component type definitions (Entity union type)
        world.ts            # miniplex World factory + grid query helpers
        systems/            # One file per ECS system
          growth.ts         # Plant growth with Liebig's law of the minimum
          soil.ts           # Soil amendment processing, nutrient cycling
          weather.ts        # Weather application to soil/conditions
          companion.ts      # Adjacency-based companion/antagonist effects
          disease.ts        # Disease onset, progression, spread
          pest.ts           # Pest event resolution
          harvest.ts        # Harvest readiness checks
          spread.ts         # Invasive plant spreading
          frost.ts          # Killing frost probability + plant death
          stress.ts         # Stress accumulation from suboptimal conditions
      simulation.ts         # Tick orchestrator (runs systems in fixed order)
      weather-gen.ts        # Season weather pre-generation from zone profile
      pest-gen.ts           # Pest event pre-generation from zone pest weights
      diagnosis.ts          # Player diagnosis hypothesis matching
      scoring.ts            # End-of-run score calculation
      rng.ts                # Seeded PRNG (xoshiro128**), deterministic runs
    data/
      types.ts              # TypeScript interfaces matching docs/02-PLANT-SCHEMA.md
      schema.ts             # Zod schemas for build-time JSON validation
      loader.ts             # Vite glob import of species JSON + validation
      index.ts              # Re-exports for data module
      species/              # One JSON file per plant species
      zones/                # Climate zone definitions (JSON)
      amendments.json       # Soil amendment definitions
      tools.json            # Unlockable tool definitions
    state/
      events.ts             # GameEvent union type (PLANT, AMEND, HARVEST, etc.)
      event-log.ts          # Append-only log with reducer + replay
      stores.ts             # Svelte writable/derived stores for reactive UI
      save-load.ts          # Dexie DB schema + save/load/stats helpers
      meta.ts               # Meta-progression stores (seed bank, journal, zones)
    render/
      PlantRenderer.svelte  # Parametric SVG plant component
      AnimatedPlant.svelte  # Animated wrapper
      animation.ts          # Wind sway, breathing, growth spring, tremor
      individualize.ts      # Per-instance visual variation from seed
      palette.ts            # Season-driven color system
      particles.ts          # Minimal particle effects
      shapes/               # SVG path generators by plant part
        leaves.ts, stems.ts, flowers.ts, fruit.ts, overlays.ts
    audio/
      ambient.ts            # Procedural ambient soundscape
      sfx.ts                # Action sound effects
  routes/
    +page.svelte            # Title screen / main menu
    +layout.svelte          # Root layout
    +layout.ts              # SPA prerendering config
    garden/                 # Main gameplay view
    dev/plant-lab/          # Dev tool for previewing plant rendering
tests/
  engine/                   # Simulation system unit tests
    fixtures.ts             # Shared species fixtures + world helpers
  data/                     # Schema and species file validation tests
  render/                   # Animation and shape generator tests
  state/                    # Event log, save/load, meta-progression tests
scripts/
  validate-species.ts       # Build-time species JSON validator
```

### Simulation Tick Order

The simulation runs once per in-game week. System execution order matters for emergent behavior:

1. `weatherApplySystem` — hail damage, heavy rain compaction
2. `soilUpdateSystem` — amendments take effect, nutrients shift
3. `companionEffectsSystem` — adjacency bonuses/penalties calculated
4. `growthTickSystem` — plants advance growth based on conditions
5. `stressAccumulateSystem` — stress from suboptimal conditions
6. `diseaseCheckSystem` — stress + triggers may cause disease
7. `pestCheckSystem` — pest events, counter-species, companion resistance
8. `harvestCheckSystem` — harvest window detection, quality decay
9. `spreadCheckSystem` — disease spread, runner spreading, self-seeding, weed pressure
10. `frostCheckSystem` — late-season probability roll for killing frost

### Data Flow

```
Input (UI buttons / CLI commands) → GameEvent → Event Log (append-only)
  → RunState (via reducer replay) → Simulation Tick (on DUSK phase)
  → Updated ECS entities
  → Web UI: Svelte stores → SVG render + animation
  → CLI: Text formatter → stdout
```

### Key Patterns

- **Event sourcing**: All state derives from replaying the event log. Save = serialize events. Load = replay.
- **ECS queries**: Use `world.with('component1', 'component2')` to query entities with specific components.
- **Seeded RNG**: All randomness flows through `SeededRng` from `rng.ts` for deterministic, reproducible runs.
- **Species as data**: Plant species are JSON files validated by Zod schema. The `loader.ts` uses Vite's `import.meta.glob` for eager loading.
- **Gaussian response curves**: `gaussianFit()` models how well conditions match plant needs (temperature, moisture).
- **Liebig's law**: Growth is limited by the scarcest nutrient: `Math.min(N, P, K)` adequacy.

## Code Conventions

- **Imports**: Use `.js` extensions in import paths (TypeScript with `rewriteRelativeImportExtensions`)
- **Naming**: snake_case for JSON fields and species IDs, camelCase for TypeScript variables and functions
- **Species IDs**: Must be snake_case identifiers matching their JSON filename (e.g., `tomato_cherokee_purple.json` has `"id": "tomato_cherokee_purple"`)
- **Module organization**: Engine code has zero UI dependencies; data types mirror the design doc schemas
- **System functions**: Each ECS system is a pure function taking `SimulationContext` and mutating entities in-place
- **Component access**: Entity components are optional fields on the `Entity` interface; use `world.with()` for typed queries
- **File structure**: Section separators use `// ── Section Name ──────` comment banners
- **Doc comments**: JSDoc-style `/** */` comments on exported functions and interfaces
- **Inline types**: Prefer explicit interfaces over inline type literals

## Testing

Tests live in `tests/` mirroring the `src/lib/` structure. Run with `npm test`.

- **Test framework**: Vitest with `describe`/`it`/`expect`
- **Fixtures**: `tests/engine/fixtures.ts` provides species data (TOMATO, BASIL, ROSEMARY, FENNEL), world setup helpers (`setupSinglePlot`, `plantSpecies`), and default weather/soil factories
- **IndexedDB in tests**: Uses `fake-indexeddb` for Dexie tests (state/save-load, state/meta)
- **Test pattern**: Create a world, add plot + plant entities, run a system, assert on entity state changes
- **No mocking of systems**: Tests exercise real system code with controlled inputs

When writing new tests:
- Import fixtures from `tests/engine/fixtures.ts`
- Use `createWorld()` from `src/lib/engine/ecs/world.ts` for a fresh world
- Use `createRng(42)` for deterministic seeded randomness
- Build a `SimulationContext` with `makeDefaultWeather()` and `makeSpeciesLookup()`

## Before Making Any Changes

**Read `CONTRIBUTING.md` before starting work.** It defines the standards all contributions — including data-only additions — must meet. The key gate: `npm test`, `npm run check`, and `npm run build` must all pass before any PR can merge.

## Adding a New Plant Species

1. Create a JSON file in `src/lib/data/species/` named `{species_id}.json`
2. Follow the schema in `src/lib/data/types.ts` (or reference existing species files)
3. The `id` field must match the filename (without `.json`)
4. Run `npm run validate:species` to check against the Zod schema
5. Run `npm test` — species additions can affect render validation tests (e.g., `tests/render/plant-design-validation.test.ts`)
6. Run `npm run check` — TypeScript and Svelte type checking must pass
7. The species will auto-load via Vite glob import — no code changes needed

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
- Triggers on push to `main`
- Node 20, `npm ci`, `npm run build` (which validates species + builds)
- Deploys static build to GitHub Pages

The static adapter outputs to `build/` with base path `/garden` in production.

## Design Documents

The numbered markdown files in `docs/` are the game design documents:

| Doc | Contents |
|-----|----------|
| `docs/00-OVERVIEW.md` | Game concept, run structure, scoring, meta-progression overview |
| `docs/01-ACTIONS-AND-TURN.md` | Weekly turn phases (DAWN/PLAN/ACT/DUSK/ADVANCE), energy budget, action types |
| `docs/02-PLANT-SCHEMA.md` | Full PlantSpecies interface, visual params, example JSON |
| `docs/03-SIMULATION.md` | Tick order, weather/soil/growth/disease/pest/frost systems |
| `docs/04-DIAGNOSES.md` | Diagnosis interaction design — the core learning mechanic |
| `docs/05-META-PROGRESSION.md` | Seed bank, field journal, climate ladder, tool unlocks |
| `docs/06-VISUAL-SYSTEM.md` | Parametric SVG rendering, animation, season palette |
| `docs/07-ARCHITECTURE.md` | Technical stack, project structure, ECS, event sourcing, persistence |
| `docs/08-CLI-INTERFACE.md` | CLI wrapper design, command language, LLM agent playtesting |
| `docs/09-GAMEPLAY-TESTING.md` | CLI playtesting guide and test scenarios for LLM agents |
| `docs/PLANT-SPECIES-TEMPLATE.md` | Agent prompt template for creating new plant species |

These documents are the authoritative reference for game mechanics and should be consulted when implementing new features.
