# 08 — CLI Interface

## Motivation

The game engine (`src/lib/engine/`) has zero UI dependencies. A thin CLI wrapper can expose the full game loop — creating sessions, dispatching actions, advancing weeks, inspecting state — through stdin/stdout. This enables:

- **Automated playtesting:** Point Claude Code (or any LLM agent) at the CLI with a prompt like "play this game, report bugs and feedback." The agent uses Bash to run commands, reads text output, and iterates.
- **Headless testing:** Exercise the full game loop without a browser.
- **Scripted scenarios:** Pipe a sequence of commands to reproduce specific game states for debugging or balance tuning.

## Two Interfaces

Perennial has two interfaces to the same engine:

| | Web UI | CLI |
|---|---|---|
| **Entry point** | SvelteKit routes (`src/routes/`) | Node CLI script (`src/cli/`) |
| **Rendering** | Parametric SVG ([06-VISUAL-SYSTEM.md](./06-VISUAL-SYSTEM.md)) | Structured text (ASCII grid, tables) |
| **Animation** | Spring physics, wind sway, particles | N/A |
| **Audio** | Procedural ambient + SFX | N/A |
| **Persistence** | Dexie.js (IndexedDB) | Event log JSON files on disk |
| **Input** | Touch/mouse gestures, UI buttons | CLI commands via stdin |
| **State management** | Svelte stores + event sourcing | Event sourcing only (no reactive stores) |
| **Target user** | Human player | Human player, LLM agent, automated scripts |

Both interfaces share:

- `src/lib/engine/` — simulation, ECS, systems, weather generation, scoring, RNG
- `src/lib/data/` — species JSON, zone definitions, amendments, tools
- `src/lib/state/events.ts` — GameEvent type definitions
- `src/lib/state/event-log.ts` — append-only event log with reducer + replay

The CLI does **not** depend on Svelte, the render pipeline, the audio system, or any browser APIs.

## CLI Design

### Invocation

```bash
# Start a new interactive REPL session
npx perennial play --zone zone_8a --seed 12345

# Resume from a saved event log
npx perennial load saves/my-run.json

# Run a single command against a new session (non-interactive)
npx perennial cmd "plant tomato_cherokee_purple 1 1"

# Show help
npx perennial help
```

The `play` subcommand starts a new run and enters an interactive REPL. If `--zone` or `--seed` are omitted, defaults are `zone_8a` and a random seed.

### Command Language

Commands are short, typed strings. One command per line in interactive mode, or piped from a file.

#### Session Commands

| Command | Description |
|---|---|
| `load PATH` | Load an event log JSON and replay to restore state. |
| `save [PATH]` | Save current event log to JSON file. |
| `quit` | End the session. Prompts to save if unsaved. |

#### Turn Commands

| Command | Description |
|---|---|
| `advance` | Advance to the next phase. Cycles DAWN→PLAN→ACT→DUSK→ADVANCE. |
| `week` | Shortcut: advance through all phases to the next week's PLAN phase. |

#### Action Commands (valid during ACT phase)

| Command | Effect | Energy |
|---|---|---|
| `plant SPECIES_ID ROW COL` | Plant a species at grid position. | 1–2 |
| `amend AMENDMENT ROW COL` | Apply soil amendment to a plot. | 1 |
| `diagnose ROW COL` | Inspect a plant for symptoms. | 1–2 |
| `intervene ACTION ROW COL` | Take action on a plant (prune, treat, pull, harvest). | 1 |
| `scout TARGET` | Reveal info (weather, pests, soil). | 1 |
| `wait` | End actions early. | 0 |

#### Query Commands (valid any time)

| Command | Description |
|---|---|
| `status` | Current week, phase, energy, season, weather summary. |
| `grid` | ASCII representation of the garden grid with plant states. |
| `inspect ROW COL` | Detailed state of a specific plot: plant, soil, conditions. |
| `weather` | Current week's weather details. |
| `plants` | List all planted species with growth stage and health. |
| `soil ROW COL` | Detailed soil state for a plot. |
| `species [ID]` | List available species, or show details for one. |
| `amendments` | List available soil amendments. |
| `log [N]` | Show last N events from the event log (default: 10). |
| `score` | Current run score breakdown. |
| `help [COMMAND]` | Show help for all commands or a specific one. |

### Output Format

All output is structured text, designed to be readable by both humans and LLMs.

#### Status Output

```
═══ Week 14 · Summer · ACT Phase ═══
Energy: 3/5
Weather: ☀ High 28°C / Low 18°C · Precip 0mm · Humidity 45% · Wind calm
Frost risk: low
```

#### Grid Output

```
Garden (3×3):
     Col 0          Col 1          Col 2
  ┌──────────┬──────────────┬──────────────┐
0 │ tomato   │ basil        │ [empty]      │
  │ veg 62%  │ flower 78%   │              │
  │ ♥ 0.85   │ ♥ 0.92       │              │
  ├──────────┼──────────────┼──────────────┤
1 │ pepper   │ [empty]      │ rosemary     │
  │ seed 12% │              │ veg 45%      │
  │ ♥ 1.00   │              │ ♥ 0.70 ⚠     │
  ├──────────┼──────────────┼──────────────┤
2 │ [empty]  │ carrot       │ [empty]      │
  │          │ veg 55%      │              │
  │          │ ♥ 0.95       │              │
  └──────────┴──────────────┴──────────────┘
```

Key: Growth stages (seed/germ/sdlg/veg/flower/fruit/sen), ♥ = health (0–1), ⚠ = stressed or diseased.

#### Inspect Output

```
═══ Plot [1, 2] ═══
Plant: rosemary (Rosmarinus officinalis)
  Stage: vegetative (progress: 0.45)
  Health: 0.70
  Stress: 0.35 ⚠
  Conditions: powdery_mildew (stage 1, severity 0.2)
  Companion buffs: none
Soil:
  pH: 7.2 · Moisture: 0.30 · Temp: 22°C
  N: 0.40 · P: 0.55 · K: 0.50
  Organic matter: 0.35 · Biology: 0.45 · Compaction: 0.20
  Pending amendments: lime (1 week remaining)
```

#### Advance/Tick Output

When advancing through DUSK (simulation tick), the CLI prints a summary of what happened:

```
═══ DUSK — Simulation Tick (Week 14) ═══
Growth:
  tomato [0,0]: vegetative 58% → 62%
  basil [0,1]: flowering 74% → 78%
  pepper [1,0]: seed 10% → 12%
  carrot [2,1]: vegetative 51% → 55%
  rosemary [1,2]: vegetative 43% → 45% (slow — stress)
Stress:
  rosemary [1,2]: stress 0.30 → 0.35 (moisture deficit)
Disease:
  rosemary [1,2]: powdery_mildew onset (severity 0.2)
Frost: no frost this week
```

When advancing through ADVANCE:

```
═══ ADVANCE — Week 14 → 15 ═══
Season: summer
Frost probability next week: 2%
```

If a killing frost occurs:

```
═══ KILLING FROST ═══
Season has ended. First frost arrived at week 26.
Killed: tomato [0,0], basil [0,1], pepper [1,0], carrot [2,1]
Survived (perennial): rosemary [1,2] → dormant

Final Score:
  Harvest diversity: 2 species (40 pts)
  Soil health delta: +0.05 (15 pts)
  Survival rate: 40% (20 pts)
  Journal entries: 3 diagnoses (30 pts)
  Total: 105 pts
```

### Error Handling

Invalid commands produce clear error messages:

```
> plant tomato_cherokee_purple 1 1
Error: Not in ACT phase (current: PLAN). Use 'advance' to move to ACT.

> plant fake_species 0 0
Error: Unknown species 'fake_species'. Use 'species' to list available species.

> plant tomato_cherokee_purple 5 5
Error: Plot [5, 5] out of bounds. Grid is 3×3 (valid: 0-2).

> plant tomato_cherokee_purple 0 0
Error: Plot [0, 0] is already occupied by tomato_cherokee_purple.

> diagnose 0 0
Error: Not enough energy. Need 1, have 0.
```

### Piped / Non-Interactive Mode

Commands can be piped for scripted playthrough:

```bash
echo "plant tomato_cherokee_purple 0 0
plant basil_genovese 0 1
wait
week
status" | npx perennial play --zone zone_8a --seed 42
```

Each command's output is printed, separated by blank lines. Exit code 0 on clean finish, 1 on error.

### Event Log Persistence

The CLI saves and loads game state as plain JSON files — the serialized event log array:

```json
[
  { "type": "RUN_START", "seed": 12345, "zone": "zone_8a" },
  { "type": "PLANT", "species_id": "tomato_cherokee_purple", "plot": [0, 0], "week": 0 },
  { "type": "ADVANCE_WEEK" },
  { "type": "AMEND", "amendment": "compost", "plot": [0, 0], "week": 1 }
]
```

Loading replays the entire log to reconstruct state — same as the web UI's Dexie-based save/load, but with the filesystem instead of IndexedDB.

## Architecture

### Source Location

```
src/
  cli/
    index.ts           # Entry point, arg parsing, REPL loop
    commands.ts        # Command parser + dispatcher
    formatter.ts       # Text output formatters (grid, status, inspect, tick summary)
    session.ts         # CLI-specific GameSession wrapper (no Svelte stores)
```

### Dependency Graph

```
src/cli/
  ├── src/lib/engine/          # Simulation, ECS, systems, RNG
  │     ├── simulation.ts
  │     ├── ecs/world.ts
  │     ├── ecs/components.ts
  │     ├── ecs/systems/*
  │     ├── weather-gen.ts
  │     ├── scoring.ts
  │     └── rng.ts
  ├── src/lib/data/            # Species JSON, zones, amendments
  │     ├── loader.ts          # (may need a Node-compatible loader variant)
  │     ├── types.ts
  │     └── species/*.json
  └── src/lib/state/           # Event types and log (NOT stores.ts)
        ├── events.ts
        └── event-log.ts
```

The CLI does **not** import from:

- `src/lib/render/` — SVG rendering, animation, palette, particles
- `src/lib/audio/` — sound system
- `src/lib/state/stores.ts` — Svelte-specific reactive stores
- `src/lib/state/save-load.ts` — Dexie/IndexedDB persistence
- `src/lib/state/meta.ts` — Svelte-specific meta-progression stores
- `src/routes/` — SvelteKit pages
- `src/lib/ui/` — Svelte UI components

### Data Loading

The web UI loads species JSON via Vite's `import.meta.glob` (browser-only). The CLI needs a Node-compatible loader:

- Option A: A `loader-node.ts` that uses `fs.readFileSync` + `JSON.parse` + Zod validation.
- Option B: A shared `loader-core.ts` that accepts a record of JSON objects, with platform-specific wrappers for Vite glob (web) and fs (CLI).

Either way, the validated `SpeciesLookup` function is the same type for both interfaces.

### Session Wrapper

The CLI session wrapper mirrors `GameSession` from `src/lib/engine/game-session.ts` but without Svelte store subscriptions:

```typescript
interface CliSession {
  readonly world: GameWorld;
  readonly turnManager: TurnManager;
  readonly eventLog: EventLog;
  readonly rng: SeededRng;
  readonly seasonWeather: readonly WeekWeather[];
  readonly speciesLookup: SpeciesLookup;

  dispatch(event: GameEvent): void;
  processWeek(): { tick: DuskTickResult; advance: AdvanceResult };
  getPlants(): PlantInfo[];
  getSoil(row: number, col: number): SoilState | undefined;
  getScore(): ScoreBreakdown;
  toJSON(): GameEvent[];
}
```

If `GameSession` already avoids Svelte dependencies in its core logic, the CLI may be able to use it directly. The key constraint is that the CLI must not pull in any Svelte imports transitively.

## LLM Agent Playtesting

The primary use case for the CLI is automated playtesting by an LLM agent (Claude Code). The workflow:

1. Agent starts a game: `npx perennial play --zone zone_8a --seed 42`
2. Agent reads the `status` and `grid` output to understand game state
3. Agent issues action commands (`plant`, `amend`, `diagnose`, etc.)
4. Agent advances weeks and reads tick summaries
5. Agent plays through a full season, observing outcomes
6. Agent reports: bugs encountered, confusing output, balance feedback, strategy observations

### Agent Prompt Template

```
You are playtesting a roguelike gardening simulator called Perennial.
Use the CLI to play a complete season. Your goals:

1. Play strategically — try to maximize your score
2. Report any bugs (crashes, incorrect output, inconsistent state)
3. Note any confusing or unclear output
4. Provide balance feedback (is anything too easy/hard/pointless?)
5. Document interesting emergent interactions you discover

Start with: npx perennial play --zone zone_8a --seed 42
Use 'help' to see available commands.
Use 'species' to see what you can plant.
Use 'status' and 'grid' frequently to track game state.
```

### Output Design for LLM Readability

The text output is intentionally:

- **Structured with clear delimiters** — `═══` section headers, consistent field labels
- **Numeric** — health 0.70 not "somewhat stressed", progress 62% not "mid-vegetative"
- **Exhaustive** — every state change in a tick is printed, not summarized away
- **Consistent** — same format every time, parseable by pattern matching
- **Self-documenting** — labels on every value, units included

This makes it straightforward for an LLM to read game state, reason about it, and issue commands without needing to parse complex visual output.
