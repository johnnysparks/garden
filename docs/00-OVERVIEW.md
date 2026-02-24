# Perennial — Game Design Document

## One-liner

A roguelike gardening simulator where each run is a growing season, death comes by frost, and you build real horticultural knowledge through play.

## Core Fantasy

You are a gardener learning by doing. Every season you plant, diagnose, intervene, and harvest — building a persistent seed bank, field journal, and perennial garden across runs. Failure is a teacher. Frost is inevitable. The garden persists.

## Genre

Roguelike simulation with meta-progression. Mobile-first browser game.

## Platform

Two interfaces to the same engine:

- **Web UI** — Mobile-first browser game (SvelteKit, parametric SVG, PWA-capable for offline play). The primary player-facing interface.
- **CLI** — Thin Node.js wrapper that prints game state as structured text and accepts commands via stdin. Designed for automated playtesting by LLM agents (Claude Code), headless testing, and scripted scenarios. See [08-CLI-INTERFACE.md](./08-CLI-INTERFACE.md).

## Target Player

Curious adults who want to learn real horticulture through a game with genuine strategic depth. Not casual/idle — this is a thinking game with real consequences.

## Pillars

1. **Knowledge through play.** Every mechanic maps to a real horticultural concept. No quiz screens, no flashcards. You learn because understanding the real system IS the optimal strategy.
2. **Triage under uncertainty.** You never have enough actions. Information is a resource. The game is about decisions, not execution.
3. **Failure is progress.** A run where everything dies but you correctly diagnosed powdery mildew is a win. The field journal grows regardless.
4. **Living beauty.** The garden is a quiet, organic visual space. Plants breathe, sway, grow. Seasons shift. It should feel like tending something alive.

## Run Structure

Each run = one growing season, spring through first frost.
Time unit = 1 week. A typical run is 20-30 weeks depending on climate zone.
Each week the player has a limited **energy budget** (actions).

### Win/Loss

There is no binary win/loss. Each run is scored on:

- **Harvest diversity** — number of distinct species successfully harvested
- **Soil health delta** — did you leave the soil better or worse?
- **Survival rate** — % of plantings that reached harvest
- **Journal entries** — new diagnoses made (correct or not)
- **Perennials established** — long-term investments that persist

### Run End

- First frost ends the season. Annuals die. Perennials go dormant.
- Catastrophic failures (total pest outbreak, soil death) can end a run early.
- Player can also choose to "close the season" early if things are beyond recovery.

## Meta-Progression

See [05-META-PROGRESSION.md](./05-META-PROGRESSION.md)

- **Perennial garden** — plants that survive between runs
- **Seed bank** — unlocked varieties available for future runs
- **Field journal** — cumulative knowledge base the player builds
- **Climate ladder** — harder zones unlocked by successful runs

## Documents

| Doc | Contents |
|-----|----------|
| [01-ACTIONS-AND-TURN.md](./01-ACTIONS-AND-TURN.md) | Weekly turn structure, action types, energy system |
| [02-PLANT-SCHEMA.md](./02-PLANT-SCHEMA.md) | Plant data model — mechanical and visual parameters |
| [03-SIMULATION.md](./03-SIMULATION.md) | Week-tick engine, growth, disease, weather, interactions |
| [04-DIAGNOSIS.md](./04-DIAGNOSIS.md) | Diagnosis interaction design — the core learning mechanic |
| [05-META-PROGRESSION.md](./05-META-PROGRESSION.md) | Between-run systems, seed bank, journal, climate zones |
| [06-VISUAL-SYSTEM.md](./06-VISUAL-SYSTEM.md) | Parametric SVG rendering, animation, color system |
| [07-ARCHITECTURE.md](./07-ARCHITECTURE.md) | Technical stack, project structure, data flow |
| [08-CLI-INTERFACE.md](./08-CLI-INTERFACE.md) | CLI wrapper design, command language, LLM agent playtesting |
