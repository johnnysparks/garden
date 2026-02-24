# Contributing to Perennial

Thanks for your interest in contributing to Perennial. This guide covers the main types of work on our roadmap and the standards we hold contributions to.

## Getting Started

```bash
npm install
npm run dev          # Start the dev server
npm test             # Run the full test suite (vitest)
npm run check        # TypeScript + Svelte type checking
npm run build        # Validate species JSON + production build
```

All three of `test`, `check`, and `build` must pass before a PR can merge. CI runs them automatically.

## Development Workflow

1. Branch from `main`.
2. Make your changes, following the conventions below.
3. Run `npm test` and `npm run check` locally before pushing.
4. Open a PR against `main` with a clear description of what changed and why.

## Task Types

The project roadmap lives in `TODO.md`. Below are the main categories of work and what we expect for each.

### Bug Fixes

Known bugs are marked with `// TODO: BUG` in source. When fixing a bug:

- **Write a failing test first.** The test should reproduce the bug with controlled inputs before you touch the fix. This proves the bug exists and prevents regressions.
- **Keep the fix focused.** Don't bundle unrelated refactors or cleanups into a bug-fix PR.
- **Update or remove the `// TODO: BUG` comment** once the fix is in place.

### New Plant Species

Adding a species requires no code changes — just a JSON file. See `docs/PLANT-SPECIES-TEMPLATE.md` for the full workflow.

1. Create `src/lib/data/species/{species_id}.json`. The `id` field must match the filename (without `.json`), and both must be `snake_case`.
2. Reference existing species files and `src/lib/data/types.ts` for the schema.
3. Run `npm run validate:species` to check against the Zod schema.
4. **Verify in-game behavior.** Use the CLI (`npx perennial play`) to plant the species and observe a few weeks of growth, stress, and harvest behavior. Note any unrealistic results in the PR description.
5. **Cross-reference real horticulture.** Growth rates, companion effects, pH and temperature ranges, and disease susceptibility should reflect real-world data. Cite sources in your PR description.

### New Engine Systems or System Changes

Engine code lives in `src/lib/engine/` and must have zero UI dependencies.

- **Consult the design docs.** The `docs/` directory is the authoritative reference. Read the relevant doc before starting work (e.g., `docs/03-SIMULATION.md` for simulation systems).
- **One system per file** in `src/lib/engine/ecs/systems/`. System functions are pure functions taking `SimulationContext` and mutating entities in-place.
- **Write thorough tests.** Every system must have a corresponding test file in `tests/engine/`. Follow the existing pattern: create a world, add entities, run the system, assert on entity state. Use `createRng(42)` for deterministic seeded randomness and fixtures from `tests/engine/fixtures.ts`.
- **Respect tick order.** The simulation tick order (documented in `docs/03-SIMULATION.md` and `src/lib/engine/simulation.ts`) determines emergent behavior. If your change affects ordering, discuss it in the PR.

### Web UI Features

The web UI is SvelteKit with parametric SVG rendering. UI code lives in `src/routes/` and `src/lib/render/`.

- **Mobile-first.** Design for small screens first.
- **Reactive stores, not direct state.** UI derives its state from Svelte stores in `src/lib/state/stores.ts`, which derive from the event log. Don't bypass event sourcing.
- **Update the design docs** if your feature introduces new interaction patterns not covered by the existing docs.

### CLI Changes

The CLI (`src/cli/`) is a thin wrapper around the shared engine.

- **No browser dependencies.** The CLI must not import from `src/lib/render/`, `src/lib/audio/`, `src/lib/state/stores.ts`, or `src/routes/`. It shares `engine/`, `data/`, `state/events.ts`, and `state/event-log.ts`.
- **Structured text output.** Formatters live in `src/cli/formatter.ts`. Output should be parseable by both humans and LLM agents.

### Data Content (Zones, Amendments, Tools)

- Zones go in `src/lib/data/zones/`, amendments in `amendments.json`, tools in `tools.json`.
- All data is validated at build time by Zod schemas.
- **Ground your data in reality.** Temperature ranges, frost dates, and nutrient profiles should reflect real-world agricultural data.

## Testing Standards

Tests are the primary way we maintain confidence in a simulation with many interacting systems. We take test quality seriously.

### Requirements

- **Every new system or feature must have tests.** PRs adding engine logic without tests will not be merged.
- **Bug fixes require a regression test.** Write the failing test before the fix.
- **Tests exercise real code.** We don't mock engine systems. Tests use controlled inputs (specific weather, soil, species) and assert on real outputs.
- **Tests must be deterministic.** Use `createRng(42)` (or any fixed seed) for randomness. Tests must produce the same result every run.

### Conventions

- Test files live in `tests/` mirroring the `src/lib/` structure.
- Use Vitest's `describe`/`it`/`expect` API.
- Import fixtures from `tests/engine/fixtures.ts` — this provides species data (`TOMATO`, `BASIL`, `ROSEMARY`, `FENNEL`), world setup helpers, and default factories.
- Use `createWorld()` from `src/lib/engine/ecs/world.ts` for a fresh ECS world.
- Build a `SimulationContext` with `makeDefaultWeather()` and `makeSpeciesLookup()` from fixtures.

### Coverage

- Aim for meaningful coverage, not line-count targets. A test that validates an important interaction between two systems is worth more than five trivial getter tests.
- When touching existing code, check whether existing tests still cover the behavior. If your change alters behavior, update the tests to match.
- Edge cases matter in a simulation. Test boundary conditions: zero nutrients, extreme temperatures, first and last weeks of the season, empty grids, full grids.

## Code Conventions

- **TypeScript strict mode.** The project uses `"strict": true`. No `any` escapes without a comment explaining why.
- **Import paths use `.js` extensions.** TypeScript is configured with `rewriteRelativeImportExtensions`.
- **Naming:** `snake_case` for JSON fields and species IDs, `camelCase` for TypeScript variables and functions.
- **Section separators:** `// ── Section Name ──────` comment banners to organize files.
- **Doc comments:** JSDoc-style `/** */` on exported functions and interfaces.
- **Explicit interfaces.** Prefer named interfaces over inline type literals.
- **Engine isolation.** Engine code (`src/lib/engine/`) must never import from render, audio, stores, or routes.

## Documentation

- **Update design docs when behavior changes.** The numbered docs in `docs/` are the authoritative spec. If your change makes a doc inaccurate, update it in the same PR.
- **CLAUDE.md stays current.** If you add a new command, change directory structure, or alter conventions, update `CLAUDE.md`.
- **PR descriptions matter.** Explain *what* changed and *why*. For species, include your horticultural sources. For system changes, reference the relevant design doc section.

## Leave It Better Than You Found It

When working in a file, look for small opportunities to improve what's already there:

- Fix a typo in a nearby comment.
- Add a missing type annotation on a function you're calling.
- Replace a magic number with a named constant.
- Tighten a loose `any` type you encounter.

Keep these incidental improvements small and obviously correct. If a cleanup warrants discussion, split it into a separate PR.

## Architecture Decisions

If you're considering a change that would affect the project's architecture — new dependencies, changes to the ECS/event-sourcing patterns, build pipeline modifications — open an issue to discuss it first. The design docs in `docs/` explain the rationale behind current decisions.
