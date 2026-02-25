# Perennial — Project Roadmap

> Last updated 2026-02-25. All engine systems implemented and tested. All 4 gameplay bugs fixed. CLI complete. Web UI has garden grid with plant/wait/amend/scout/intervene actions. WS5.2 (Scout), WS5.3a–c (Intervene), WS5.4a (overlay types), and WS5.5 (Run End Screen) complete. WS5 broken into 39 granular subtasks across 9 work streams.

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
| Spread check system | done | Runner spreading, self-seeding, weed pressure, disease spread |
| Scoring engine | done | Four-category ScoreCard, zone multipliers, Three Sisters bonus |
| Simulation orchestrator | done | All 10 slots wired (1–10) |
| Diagnosis engine | done | Hypothesis generation, confidence scoring, similar-condition red herrings |
| Condition database | done | 21 conditions (7 fungal, 7 nutrient, 4 pest, 3 abiotic) |
| Amendments data | done | 6 amendments: compost, lime, sulfur, fertilizer, mulch, inoculant |
| Tools data | done | 7 tools defined with unlock conditions and effects |
| Species data | done | 6 species: tomato, basil, carrot, zucchini, mint, lettuce (validated by Zod schema) |
| Zone data | done | 2 zones: zone_8a, zone_7b |
| Game session (shared) | done | Shared engine session used by both CLI and web UI; amendment action in engine |
| CLI interface | done | Full REPL, all commands, piped mode, save/load, Node.js data loader |
| SVG plant rendering | done | Parametric stems, leaves (8 shapes), flowers (4 shapes), fruit (5 shapes) |
| Animation | done | Wind/sway, breathing, stress tremor, harvest pop, particle burst |
| Season palette | done | 7 palettes, color derivation, health-based desaturation |
| Individualization | done | Per-instance visual variation from seed |
| Svelte stores | done | Reactive gameState, derived stores (week, plants, harvests, etc.) |
| Dexie persistence (web) | done | Save/load, lifetime stats, seed bank, journal, run history |
| Meta-progression logic | done | processRunEnd, seed bank, journal, zone progress, tool unlocks |
| Web UI — title screen | done | Redesigned with botanical SVG illustration, visual system palette |
| Web UI — garden page | partial | Grid rendering, plant/wait actions, phase automation, seed selector |
| HUD components | partial | SeasonBar, WeatherRibbon, EnergyBar, ActionToolbar, SeedSelector |
| Dev tools | done | Plant Lab, Animation Lab |

### What's Remaining

| Area | Status | Notes |
|------|--------|-------|
| Disease overlays (visual) | todo | Placeholder — no SVG disease indicators |
| Pest visual overlays | todo | No SVG overlays for pest infestations |
| Audio system | todo | ambient.ts and sfx.ts are placeholders |
| Additional species | partial | 6 of ~16 planned species exist |
| Additional zones | partial | zone_7b added; climate ladder needs more |
| Web UI — amend action | todo | Toolbar button scaffolded, shows "coming soon" |
| Web UI — diagnose action | todo | Toolbar button scaffolded, shows "coming soon" |
| Web UI — intervene action | partial | InterveneMenu wired; pull confirm, pull entity removal, harvest toast remain (WS5.3d–f) |
| Web UI — scout action | done | ScoutPicker + ScoutResultPanel wired (weather/pest/soil views) |
| Web UI — run end screen | todo | Frost just logs to console |
| Web UI — zoom/detail views | todo | No pinch-to-zoom, no plot focus or plant detail |
| Web UI — field journal | todo | No journal UI (data layer exists) |
| Web UI — seed bank UI | todo | No between-run seed bank browsing (data layer exists) |
| Web UI — meta-progression UI | todo | No zone unlock, tool unlock, lifetime stats screens |

### Known Bugs

Found via CLI gameplay testing. All four bugs are now fixed.

| Bug | File | Status | Description |
|-----|------|--------|-------------|
| ~~Amendment not applied~~ | ~~`src/cli/commands.ts`~~ | fixed | Refactored into shared `GameSession.amendAction()` |
| ~~Unrealistic starting soil temp~~ | ~~`src/lib/engine/game-session.ts`~~ | fixed | `defaultSoil()` now accepts initial temp; `createGameSession` passes `zone.avg_temps_by_week[0]` |
| ~~Energy not reset~~ | ~~`src/lib/engine/turn-manager.ts`~~ | fixed | Energy now resets to 0/0 on ADVANCE→DAWN transition |
| ~~Slow warm-season growth~~ | ~~`src/lib/engine/ecs/systems/growth.ts`~~ | fixed | Temperature tolerance widened from 8 to 12; regression tests added |

---

## Workstreams

### WS1: Simulation Loop — COMPLETE

All 10 systems wired into the tick orchestrator.

### WS2: Diagnosis System — Engine Done, UI Remaining

The diagnosis engine and condition database are implemented. Treatment feedback and the UI layer remain.

**Remaining:**
- **WS2.2 — Diagnosis UI Flow** (todo): Spec doc 04 §Inspection Flow — zoom-in, examine action, observation notes, hypothesis cards, select + confirm. Depends on disease overlays (WS5.4).
- **WS2.3 — Treatment Feedback Loop** (todo): Spec doc 04 §Step 5 — correct/wrong treatment effects delayed 1-2 weeks. Depends on intervene action (WS5.3).

### WS3: Data Content — Species In Progress

The data pipeline (Zod validation, glob import) is solid. Tools and amendments are complete.

**Remaining:**
- **WS3.3 — Additional Species** (partial, 6 of ~16): Priority next species for gameplay variety:
  - Rosemary (perennial, Mediterranean, companion)
  - Pepper (Solanaceae, companion with tomato)
  - Marigold (pest resistance companion)
  - Beans (nitrogen fixer — crop rotation)
  - Strawberry (perennial, multi-year)
  - Corn (Three Sisters set)
- **WS3.4 — Additional Climate Zones** (partial): Spec doc 05 §Climate Ladder — 7a, 6b, 6a, 5b, 5a (cold path) + zone_9a, 10a (heat path).

### WS4: CLI Interface — COMPLETE

### WS5: Web UI Gameplay

The garden page has grid rendering, plant/wait actions, and phase automation. Action toolbar is scaffolded with placeholder buttons for amend/scout/diagnose. Most player actions and the full game lifecycle are missing.

> **Svelte UI Conventions (read before starting any WS5 task):**
>
> - **Runes, not stores for UI state.** Use `$state()`, `$derived`, `$effect()`. Traditional Svelte stores are only for engine state (`src/lib/state/stores.ts`).
> - **Props pattern.** Define an explicit `interface Props { ... }` and destructure with `let { ... }: Props = $props()`. Pass event handlers as `onAction`, `onClose` callback props — don't use Svelte events.
> - **Scoped styles only.** All CSS goes in `<style>` blocks. Use `style:property={value}` directives for dynamic values. No global CSS files.
> - **Mobile-first layout.** `max-width: 420–480px`, flex/grid, `box-sizing: border-box`. Bottom sheets slide up from bottom (`align-items: flex-end`).
> - **Transitions.** `transition:fly` for panels/toolbars, `transition:fade` for overlays. Duration 150–250ms.
> - **Dark theme.** Backgrounds `#2a2a2a`, text `#eee`, borders `rgba(255,255,255,0.1)`, buttons `rgba(255,255,255,0.08)`.
> - **Animation.** One shared RAF loop in `+page.svelte` passes `windState`/`timeMs` as props. Use `Spring` from `svelte/motion` for smooth value transitions. Use `will-change: transform` for GPU acceleration.
> - **Module types.** Export shared types from `<script lang="ts" module>` blocks in `.svelte` files.
> - **Overlay modals.** Full-screen `position: fixed; inset: 0` overlay with `rgba(0,0,0,0.5)` backdrop. Panel with `border-radius: 16px 16px 0 0` slides up. Click backdrop or X to close. See `AmendmentSelector.svelte` and `SeedSelector.svelte` as templates.
> - **Engine integration.** Call `session.xxxAction()` methods (which validate phase/energy/bounds, append events, update ECS). Bump `ecsTick++` after mutations to trigger reactive re-queries. Check `.ok` on `ActionResult` before proceeding.
> - **Testing.** No Svelte component tests in this project. Test logic in `.ts` modules. Run `npm test`, `npm run check`, `npm run build` before any PR.

---

#### WS5.1 — Amend Action Flow (done)

The amend button is wired, `AmendmentSelector.svelte` exists, and `onSelectAmendment()` in `+page.svelte` calls `session.amendAction()`. This flow is complete.

---

#### WS5.2 — Scout Action Flow (done)

Scout lets the player spend 1 energy to peek at upcoming weather, pest forecasts, or soil details. `ScoutPicker.svelte` selects a target; `ScoutResultPanel.svelte` displays weather table, pest list, or soil bars. Both are wired into `+page.svelte`. `session.scoutAction(target)` validates phase/energy and appends a `SCOUT` event.

Three scout targets exist in the design (docs/01-ACTIONS-AND-TURN.md): `weather`, `pests`, `soil`.

##### WS5.2a — Remove placeholder flag from Scout button (done)
> **Files:** `src/lib/ui/ActionToolbar.svelte`
> **Task:** Change `placeholder: false` on the `scout` action definition (line 61). This lets the button call `onAction('scout')` instead of showing a toast.
> **Verify:** Button no longer shows "coming soon" toast when clicked during ACT phase.

##### WS5.2b — Add scout target picker component (done)
> **Files:** Create `src/lib/ui/ScoutPicker.svelte`
> **Template:** Copy the structure of `AmendmentSelector.svelte` (overlay + bottom-sheet panel pattern).
> **Props interface:**
> ```typescript
> interface Props {
>   onSelect: (target: 'weather' | 'pests' | 'soil') => void;
>   onClose: () => void;
> }
> ```
> **Content:** Three buttons in a vertical list:
> - "Weather Forecast" (icon: cloud) — "Peek at next 3 weeks of weather"
> - "Pest Forecast" (icon: bug) — "See which pests may arrive soon"
> - "Soil Survey" (icon: layers) — "Inspect soil nutrients and pH"
> **Verify:** Component renders, clicking an option calls `onSelect` with the right target string, clicking backdrop calls `onClose`.

##### WS5.2c — Wire scout target picker into garden page (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Add `let showScoutPicker = $state(false);`
> 2. In `onAction()` switch, add `case 'scout': showScoutPicker = true; break;`
> 3. Add `onSelectScout(target: string)` handler that calls `session.scoutAction(target)`, checks `.ok`, bumps `ecsTick++`, and sets `showScoutPicker = false`.
> 4. Render `{#if showScoutPicker}<ScoutPicker onSelect={onSelectScout} onClose={() => showScoutPicker = false} />{/if}` after the other modals.
> **Verify:** Tapping Scout → picker appears → selecting a target → picker closes, energy decrements.

##### WS5.2d — Create ScoutResultPanel component (done)
> **Files:** Create `src/lib/ui/ScoutResultPanel.svelte`
> **Template:** Bottom-sheet overlay like `AmendmentSelector.svelte`.
> **Props interface:**
> ```typescript
> interface Props {
>   target: 'weather' | 'pests' | 'soil';
>   weatherData?: WeekWeather[];  // next 3 weeks from session.seasonWeather
>   pestData?: PestEvent[];       // upcoming pests from session.seasonPests
>   soilData?: SoilState;         // from session.getSoil(row, col)
>   onClose: () => void;
> }
> ```
> **Weather view:** Table with columns: Week, Temp (°F), Rain (in), Wind, Special events. Show 3 rows.
> **Pest view:** List of upcoming pest names + target families + arrival week. If none upcoming, show "No pest activity expected."
> **Soil view:** Show pH, nitrogen, phosphorus, potassium, organic_matter, moisture, compaction, biology as labeled rows with numeric values. Use colored bars (green = good, yellow = moderate, red = poor).
> **Verify:** Each view renders its data correctly. Close button works.

##### WS5.2e — Wire ScoutResultPanel display into garden page (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Add `let scoutResult = $state<{ target: string; weather?: WeekWeather[]; pests?: PestEvent[]; soil?: SoilState } | null>(null);`
> 2. In `onSelectScout()`, after successful `scoutAction()`, populate `scoutResult` based on `target`:
>    - `'weather'`: slice `session.seasonWeather` from current week index for 3 weeks
>    - `'pests'`: filter `session.seasonPests` where `arrival_week >= currentWeek`
>    - `'soil'`: call `session.getSoil(selectedPlot.row, selectedPlot.col)` (or first plot if no selection)
> 3. Render `{#if scoutResult}<ScoutResultPanel {...scoutResult} onClose={() => scoutResult = null} />{/if}`
> **Verify:** After scouting, result panel shows real game data. Closing the panel returns to garden view.

---

#### WS5.3 — Intervene Action Flow

Intervene lets the player perform actions on a planted plot: harvest, prune, treat disease, or pull (remove) a plant. The engine has `session.interveneAction(action, row, col, targetCondition?)` which validates everything and records treatments. There is also a separate `HarvestEvent` type, but harvest can go through `interveneAction` with `action='harvest'`. WS5.3a–c are complete: Act button, `InterveneMenu.svelte`, and wiring exist. WS5.3d–f remain.

##### WS5.3a — Add Intervene button to ActionToolbar (done)
> **Files:** `src/lib/ui/ActionToolbar.svelte`
> **Task:** Add a new action definition to the `ACTIONS` array (insert before `wait`):
> ```typescript
> {
>   id: 'intervene',
>   label: 'Act',
>   icon: '✂️',
>   energyCost: 1,
>   needsPlot: true,
>   needsEmpty: false,
>   needsPlant: true,
>   placeholder: false,
> }
> ```
> **Verify:** New "Act" button appears in toolbar when a planted plot is selected. Disabled when no plant at selected plot.

##### WS5.3b — Create InterveneMenu component (done)
> **Files:** Create `src/lib/ui/InterveneMenu.svelte`
> **Template:** Bottom-sheet overlay like `AmendmentSelector.svelte`.
> **Props interface:**
> ```typescript
> interface Props {
>   plantInfo: {
>     speciesId: string;
>     stage: string;
>     harvestReady: boolean;
>     conditions: Array<{ conditionId: string; severity: number }>;
>   };
>   onSelect: (action: string) => void;
>   onClose: () => void;
> }
> ```
> **Content:** Show a list of available actions, conditionally enabled:
> - "Harvest" (icon: basket) — only enabled when `plantInfo.harvestReady === true`
> - "Prune" (icon: scissors) — always available, description: "Remove dead/damaged growth"
> - "Treat" (icon: spray bottle) — only enabled when `plantInfo.conditions.length > 0`, shows condition name
> - "Pull" (icon: uprooted plant) — always available, description: "Remove plant from plot", show in red/warning style
> **Verify:** Renders correct actions. Harvest grayed out when not ready. Treat shows condition name. Pull shows warning styling.

##### WS5.3c — Wire InterveneMenu into garden page (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Import `InterveneMenu`.
> 2. Add `let showInterveneMenu = $state(false);`
> 3. Add a derived `selectedPlantInfo` that queries `session.getPlantAt(row, col)` when `selectedPlot` changes (use `$derived.by()`).
> 4. In `onAction()` switch, add `case 'intervene': showInterveneMenu = true; break;`
> 5. Add `onIntervene(action: string)` handler:
>    - Call `session.interveneAction(action, selectedPlot.row, selectedPlot.col)`
>    - Check `.ok`
>    - Bump `ecsTick++`
>    - Set `showInterveneMenu = false` and `selectedPlot = null`
> 6. Render `{#if showInterveneMenu && selectedPlantInfo}<InterveneMenu plantInfo={selectedPlantInfo} onSelect={onIntervene} onClose={() => showInterveneMenu = false} />{/if}`
> **Verify:** Tapping Act on a planted plot → menu appears → selecting Harvest/Prune/Treat/Pull → calls engine, closes menu, energy decrements.

##### WS5.3d — Add pull confirmation dialog (todo)
> **Files:** `src/lib/ui/InterveneMenu.svelte` (modify)
> **Task:** When the player taps "Pull", show an inline confirmation step instead of immediately calling `onSelect('pull')`:
> 1. Add `let confirmPull = $state(false);` to the component.
> 2. Pull button sets `confirmPull = true` instead of calling `onSelect`.
> 3. When `confirmPull` is true, replace the Pull button row with: "Remove {speciesId}? This cannot be undone." and two buttons: "Cancel" (resets `confirmPull`) and "Remove" (calls `onSelect('pull')`).
> **Verify:** Pull requires two taps. Cancel returns to normal menu.

##### WS5.3e — Handle pull action in engine — remove plant entity (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:** In the `onIntervene()` handler, when `action === 'pull'`, after calling `session.interveneAction('pull', ...)`:
> 1. Find the plant entity in the ECS world using `session.world.with('plotSlot', 'species')` and matching row/col.
> 2. Set `(entity as Entity).dead = true` to mark it as dead (matching the pattern used by frost/disease death).
> 3. Bump `ecsTick++` to refresh the grid display.
> **Note:** Check whether `interveneAction` already handles entity removal. If `session.interveneAction('pull', ...)` doesn't mark the entity dead, do it here. If it does, this task is already done — just verify.
> **Verify:** After pulling, the plot appears empty on the next render.

##### WS5.3f — Add harvest result feedback toast (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:** After a successful harvest intervene action:
> 1. Also dispatch a `HARVEST` event: `session.dispatch({ type: 'HARVEST', plant_id: \`${row},${col}\`, week: session.getWeek() })`.
> 2. Show a brief success toast or notification. Add a `let actionToast = $state('');` and a `showActionToast(msg)` function (with 2-second auto-clear via `setTimeout`).
> 3. Render the toast as a floating div above the toolbar (similar to the toast in `ActionToolbar.svelte`).
> 4. On successful harvest: `showActionToast('Harvested {speciesName}!')`.
> **Verify:** Harvesting shows a brief toast with the species name, then it fades.

---

#### WS5.4 — Disease Overlay Visuals

`src/lib/render/shapes/overlays.ts` is a placeholder with only a comment. Docs/06-VISUAL-SYSTEM.md specifies 11 overlay types. The disease system writes `activeConditions.conditions[]` on plant entities, each with a `current_stage` that maps to a `visual_overlay` string in the species JSON `SymptomStage` definition.

The rendering pipeline needs: overlay generator functions → a DiseaseOverlay component → integration into PlantRenderer.

##### WS5.4a — Define the overlay generator function signature and types (done)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Replace the placeholder comment with:
> 1. An `OverlayParams` interface:
>    ```typescript
>    export interface OverlayParams {
>      overlayId: string;
>      intensity: number;  // 0–1, maps to disease severity or stage progression
>      plantWidth: number; // bounding box width of the plant SVG
>      plantHeight: number;
>      seed: number;       // instance seed for visual variation
>    }
>    ```
> 2. An `OverlayElement` interface for SVG output:
>    ```typescript
>    export interface OverlayElement {
>      type: 'circle' | 'path' | 'rect';
>      attrs: Record<string, string | number>;
>    }
>    ```
> 3. A `generateOverlay(params: OverlayParams): OverlayElement[]` function signature that dispatches to per-overlay generators (start with an empty switch that returns `[]` for unknown overlay IDs).
> 4. Export everything.
> **Verify:** `npm run check` passes. File exports the types and function.

##### WS5.4b — Implement `leaf_spots` overlay generator (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Add a function `generateLeafSpots(params: OverlayParams): OverlayElement[]` that:
> 1. Generates 3–8 small circles (count scales with `intensity`).
> 2. Positions them randomly within the plant bounding box using a simple seeded hash of `params.seed + index`.
> 3. Each circle: `r` = 2–4, `fill` = brown (`#5D4037`), `opacity` = 0.4 + intensity * 0.4.
> 4. Wire it into the `generateOverlay` switch: `case 'leaf_spots': return generateLeafSpots(params);`
> **Verify:** Function returns an array of circle elements with reasonable positions and sizes.

##### WS5.4c — Implement `powdery_coating` overlay generator (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Add `generatePowderyCoating(params: OverlayParams): OverlayElement[]`:
> 1. Generate a single semi-transparent white rectangle covering the upper 60% of the plant bounding box.
> 2. `fill` = white, `opacity` = 0.15 + intensity * 0.25. `rx`/`ry` = 4 for rounded corners.
> 3. Wire into `generateOverlay` switch.
> **Verify:** Returns a single rect element with correct dimensions and opacity.

##### WS5.4d — Implement `yellowing_uniform` overlay generator (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Add `generateYellowingUniform(params: OverlayParams): OverlayElement[]`:
> 1. Generate a full-plant-sized rectangle with yellow tint.
> 2. `fill` = `#FDD835`, `opacity` = intensity * 0.35. Apply `mix-blend-mode: multiply` via attrs.
> 3. Wire into `generateOverlay` switch.
> **Verify:** Returns a rect element representing uniform yellowing.

##### WS5.4e — Implement `concentric_rings` overlay generator (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Add `generateConcentricRings(params: OverlayParams): OverlayElement[]`:
> 1. Generate 2–4 concentric circles (target/bullseye pattern) at 1–2 positions on the plant.
> 2. Outer circle: `r` = 6–8, `stroke` = `#5D4037`, `fill` = none, `stroke-width` = 1.
> 3. Inner circles decrease in radius by 2 each.
> 4. Position using seeded hash. Count of target groups scales with intensity.
> 5. Wire into `generateOverlay` switch.
> **Verify:** Returns circle elements forming a bullseye pattern.

##### WS5.4f — Implement remaining 7 overlay generators (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Implement generators for the remaining overlay types. Each follows the same pattern as above:
> - `interveinal_yellowing` — Yellow rectangles between "vein" lines. 2–4 narrow rects, fill `#FDD835`, opacity scales with intensity.
> - `fruit_base_rot` — Dark brown semi-circle at the bottom center of the plant bounding box. `fill` = `#3E2723`, size scales with intensity.
> - `stem_lesions` — 1–3 dark rectangles positioned along the vertical center (stem area). `fill` = `#4E342E`, narrow and tall.
> - `insect_clusters` — 8–20 tiny circles (r=1) clustered in 2–3 groups. `fill` = `#1B5E20`. Count scales with intensity.
> - `purple_tint` — Full-plant rect with purple overlay. `fill` = `#7B1FA2`, `opacity` = intensity * 0.2.
> - `brown_edges` — 4–8 small brown arcs/rects positioned at the outer edges of the bounding box. `fill` = `#795548`.
> - `wilting` — This is handled by the existing droop parameter in PlantRenderer, not a drawn overlay. Return `[]` and add a comment explaining wilting is applied via `leafDroop` in the renderer.
>
> Wire each into the `generateOverlay` switch statement.
> **Verify:** `npm run check` passes. Each function returns valid `OverlayElement[]`.

##### WS5.4g — Implement additional species-specific overlay IDs (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Species JSON files reference overlay IDs not in the doc-06 list. Add fallback mappings so the generator handles them:
> - `orange_pustules` → reuse `leaf_spots` with orange fill (`#E65100`)
> - `leaf_distortion` → reuse `wilting` (return `[]`, handled by droop)
> - `lower_leaf_spots` → reuse `leaf_spots` but position circles in bottom 40% of bounding box
> - `spreading_spots_yellowing` → combine `leaf_spots` + `yellowing_uniform`
>
> Wire into `generateOverlay` switch.
> **Verify:** All overlay IDs referenced in species JSON files are handled (no unknown IDs produce empty output silently).

##### WS5.4h — Create DiseaseOverlay Svelte component (todo)
> **Files:** Create `src/lib/render/DiseaseOverlay.svelte`
> **Task:** Create a component that renders SVG elements from overlay generator output:
> ```typescript
> interface Props {
>   overlayId: string;
>   intensity: number;
>   plantWidth: number;
>   plantHeight: number;
>   seed: number;
> }
> ```
> 1. Import `generateOverlay` from `shapes/overlays.js`.
> 2. Use `$derived` to compute `elements = generateOverlay({ overlayId, intensity, plantWidth, plantHeight, seed })`.
> 3. Render SVG elements in a `<g>` group using `{#each elements as el}`:
>    - If `el.type === 'circle'`: `<circle cx={el.attrs.cx} cy={el.attrs.cy} r={el.attrs.r} ... />`
>    - If `el.type === 'rect'`: `<rect ... />`
>    - If `el.type === 'path'`: `<path d={el.attrs.d} ... />`
> 4. Apply `pointer-events="none"` to the group so overlays don't capture clicks.
> **Verify:** `npm run check` passes. Component renders SVG elements from overlay data.

##### WS5.4i — Pass disease data through the rendering pipeline (todo)
> **Files:** `src/routes/garden/+page.svelte`, `src/lib/render/GardenGrid.svelte`, `src/lib/render/PlotCell.svelte`
> **Task:** Pipe `activeConditions` from ECS entities to PlotCell:
> 1. In `+page.svelte` `cells` derivation (line ~180), when building `CellData`, add a `conditions` field:
>    ```typescript
>    conditions: ((pe as Entity).activeConditions?.conditions ?? []).map(c => ({
>      overlayId: /* look up visual_overlay from species symptom stages */,
>      intensity: c.severity,
>    }))
>    ```
>    To get `visual_overlay`: use `pe.species.speciesId` to look up the species via `getSpecies()`, find the condition in `species.conditions`, and index into `symptoms.stages[c.current_stage].visual_overlay`.
> 2. Update `CellData` interface in `GardenGrid.svelte` to include `conditions: Array<{ overlayId: string; intensity: number }>`.
> 3. Pass `conditions` through `GardenGrid` → `PlotCell` as a prop.
> **Verify:** `npm run check` passes. Data flows through; no rendering changes yet.

##### WS5.4j — Render DiseaseOverlay in PlotCell (todo)
> **Files:** `src/lib/render/PlotCell.svelte`
> **Task:**
> 1. Import `DiseaseOverlay` component.
> 2. Accept `conditions` in the Props interface: `conditions?: Array<{ overlayId: string; intensity: number }>`.
> 3. After the `AnimatedPlant` rendering block, render overlays:
>    ```svelte
>    {#each conditions ?? [] as condition}
>      <DiseaseOverlay
>        overlayId={condition.overlayId}
>        intensity={condition.intensity}
>        plantWidth={CELL_SVG * 0.6}
>        plantHeight={CELL_SVG * 0.7}
>        seed={plant?.instanceSeed ?? 0}
>      />
>    {/each}
>    ```
> 4. Position the overlay group at the plant's center using a `<g transform="translate(...)">`.
> **Verify:** Plants with active diseases show visual overlay indicators. Run the game via CLI to trigger a disease, then view in web UI.

---

#### WS5.5 — Run End Screen

When frost kills the season, `+page.svelte` line 106 just does `console.log(...)`. The scoring engine (`scoring.ts`) has a complete `calculateScore()` function returning a `ScoreCard` with four categories. Meta-progression (`meta.ts`) has `processRunEnd()` to update seed bank, journal, and stats. Neither is called from the web UI.

##### WS5.5a — Create ScoreBreakdown component (done)
> **Files:** Create `src/lib/ui/ScoreBreakdown.svelte`
> **Task:** A purely presentational component that displays a `ScoreCard`:
> **Props:**
> ```typescript
> interface Props {
>   score: ScoreCard; // from src/lib/engine/scoring.ts
>   zone: string;
> }
> ```
> **Layout (vertical stack):**
> 1. Header: "Season Complete" + zone name
> 2. Four score category sections, each showing:
>    - Category name + icon (Harvest: basket, Soil: layers, Survival: shield, Knowledge: book)
>    - Individual line items (e.g., "5 species × 10 pts = 50")
>    - Category subtotal
> 3. Divider line
> 4. "Zone modifier" row: "×{zoneModifier}" with the multiplier value
> 5. Final total in large font
>
> **Style:** Dark theme card (`background: #2a2a2a`), monospace numbers, green accent for positive scores, red for penalties (deaths). Max-width 400px, centered.
> **Verify:** `npm run check` passes. Component renders a mock ScoreCard correctly.

##### WS5.5b — Create RunEndScreen component (done)
> **Files:** Create `src/lib/ui/RunEndScreen.svelte`
> **Template:** Full-screen overlay (like AmendmentSelector but takes the whole viewport).
> **Props:**
> ```typescript
> interface Props {
>   score: ScoreCard;
>   zone: string;
>   weeksSurvived: number;
>   endReason: 'frost' | 'abandon' | 'catastrophe';
>   newSeeds: string[];  // species IDs added to seed bank this run
>   onNewRun: () => void;
>   onMainMenu: () => void;
> }
> ```
> **Layout (scrollable):**
> 1. Reason banner: "Killing Frost" / "Season Abandoned" / "Catastrophe" with appropriate icon
> 2. Stats row: "Week {weeksSurvived} of 30" + "{endReason}"
> 3. `<ScoreBreakdown score={score} zone={zone} />`
> 4. If `newSeeds.length > 0`: "Seeds Unlocked" section listing new species names
> 5. Two buttons at bottom: "New Season" (`onNewRun`) and "Main Menu" (`onMainMenu`)
>
> **Style:** Fixed overlay, scrollable content, buttons at bottom with `position: sticky`.
> **Verify:** `npm run check` passes. Renders all sections with mock data.

##### WS5.5c — Calculate score when run ends (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Import `calculateScore` from `$lib/engine/scoring.js`.
> 2. Import `ScoreCard` type.
> 3. Add state: `let runEndData = $state<{ score: ScoreCard; weeksSurvived: number; reason: string; newSeeds: string[] } | null>(null);`
> 4. In the `phase === 'ADVANCE'` effect (line 102–110), when `advResult?.runEnded` is true, instead of `console.log`:
>    ```typescript
>    const score = calculateScore(session.eventLog.state, session.world, session.speciesLookup);
>    runEndData = {
>      score,
>      weeksSurvived: session.getWeek(),
>      reason: 'frost',
>      newSeeds: [], // populated in WS5.5d
>    };
>    ```
> **Verify:** `runEndData` is populated when frost occurs. No visual change yet (console.log can stay temporarily).

##### WS5.5d — Call processRunEnd for meta-progression (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:** After calculating the score in WS5.5c:
> 1. Import `processRunEnd` from `$lib/state/meta.js`.
> 2. Call `processRunEnd(session.eventLog.state, score, session.config.zone)` (check exact signature in `meta.ts` line 141).
> 3. Capture the return value to get newly unlocked seeds and populate `runEndData.newSeeds`.
> **Note:** `processRunEnd` is async (uses Dexie). Use an immediately-invoked async block or handle the promise.
> **Verify:** After a run ends, the Dexie database has a new entry in `runHistory`. Check via browser DevTools IndexedDB inspector.

##### WS5.5e — Render RunEndScreen when run ends (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Import `RunEndScreen`.
> 2. After the existing modal conditionals, add:
>    ```svelte
>    {#if runEndData}
>      <RunEndScreen
>        score={runEndData.score}
>        zone={session.config.zone.id}
>        weeksSurvived={runEndData.weeksSurvived}
>        endReason={runEndData.reason}
>        newSeeds={runEndData.newSeeds}
>        onNewRun={handleNewRun}
>        onMainMenu={handleMainMenu}
>      />
>    {/if}
>    ```
> 3. Add `handleNewRun()`: reload the page (`window.location.reload()` for now — proper flow in WS5.6).
> 4. Add `handleMainMenu()`: navigate to home (`window.location.href = base + '/'`).
> **Verify:** When frost kills the season, the end screen overlay appears with the score breakdown. "New Season" reloads. "Main Menu" navigates home.

##### WS5.5f — Remove console.log, clean up run-end flow (done)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:** Remove the `console.log('Killing frost! ...')` at line 106. The RunEndScreen now handles this. Ensure the ADVANCE phase effect does NOT call `s.turnManager.advancePhase()` when `runEnded` is true (already the case — the `else` branch handles it). Verify the game loop stops cleanly when the end screen is shown.
> **Verify:** No console.log on frost. End screen appears. Game loop stops.

---

#### WS5.6 — Run Start Flow

Currently the title screen (`src/routes/+page.svelte`) has a single "New Season" link to `/garden`. The garden page hardcodes `zone_8a` and a random seed (lines 114–115). No zone selection, seed input, or seed bank review exists.

##### WS5.6a — Add zone data imports and zone list (todo)
> **Files:** `src/routes/+page.svelte`
> **Task:**
> 1. Import both zone JSON files: `zone_8a.json` and `zone_7b.json`.
> 2. Create a `const AVAILABLE_ZONES = [zone8aData, zone7bData]` array with display metadata:
>    ```typescript
>    const ZONE_OPTIONS = [
>      { id: 'zone_8a', name: 'Zone 8a — Mild', data: zone8aData, difficulty: 'Easy' },
>      { id: 'zone_7b', name: 'Zone 7b — Moderate', data: zone7bData, difficulty: 'Medium' },
>    ];
>    ```
> 3. Add state: `let selectedZone = $state(ZONE_OPTIONS[0]);`
> **Verify:** `npm run check` passes. Zone data is importable.

##### WS5.6b — Create ZoneSelector component (todo)
> **Files:** Create `src/lib/ui/ZoneSelector.svelte`
> **Props:**
> ```typescript
> interface ZoneOption {
>   id: string;
>   name: string;
>   difficulty: string;
> }
> interface Props {
>   zones: ZoneOption[];
>   selectedId: string;
>   onSelect: (zoneId: string) => void;
> }
> ```
> **Layout:** Horizontal scrollable row of zone cards. Each card shows:
> - Zone name (e.g., "Zone 8a")
> - Difficulty label (e.g., "Easy") with color coding (green/yellow/orange/red)
> - Selected card has a highlighted border (green glow or solid border)
>
> **Style:** Cards `min-width: 120px`, rounded corners, dark theme. Selected card gets `border: 2px solid #4CAF50`.
> **Verify:** Renders zone cards, clicking one calls `onSelect` with the zone ID. Selected card is visually highlighted.

##### WS5.6c — Add seed input to title screen (todo)
> **Files:** `src/routes/+page.svelte`
> **Task:**
> 1. Add state: `let seedInput = $state('');` and `let useCustomSeed = $state(false);`
> 2. Below the "New Season" button area, add a collapsible "Advanced" section:
>    - A toggle/checkbox: "Custom seed"
>    - When toggled on, show a text input for the numeric seed
> 3. The seed value used will be: `useCustomSeed && seedInput ? parseInt(seedInput, 10) : Math.floor(Math.random() * 2**32)`
>
> **Style:** Input field: dark background, monospace font, `max-width: 200px`. Subtle and collapsed by default.
> **Verify:** Custom seed toggle shows/hides the input. Entering a number sets the seed.

##### WS5.6d — Pass zone and seed to garden page via URL params (todo)
> **Files:** `src/routes/+page.svelte`, `src/routes/garden/+page.svelte`
> **Task:**
> 1. In `+page.svelte`, change the "New Season" link from a static `<a>` to a button with `onclick`:
>    ```typescript
>    function startNewRun() {
>      const seed = useCustomSeed && seedInput ? parseInt(seedInput, 10) : Math.floor(Math.random() * 2**32);
>      const params = new URLSearchParams({ zone: selectedZone.id, seed: String(seed) });
>      window.location.href = `${base}/garden?${params}`;
>    }
>    ```
> 2. In `garden/+page.svelte` `onMount`, read URL params:
>    ```typescript
>    const url = new URL(window.location.href);
>    const zoneId = url.searchParams.get('zone') ?? 'zone_8a';
>    const seed = parseInt(url.searchParams.get('seed') ?? String(Math.floor(Math.random() * 2**32)), 10);
>    ```
> 3. Use a zone lookup to get the correct zone data instead of hardcoding `zone8aData`.
> 4. Import both zone JSONs and create a map: `const ZONES: Record<string, ClimateZone> = { zone_8a: ..., zone_7b: ... }`.
> 5. Replace `const zone = zone8aData as unknown as ClimateZone;` with `const zone = ZONES[zoneId] ?? ZONES['zone_8a'];`
>
> **Verify:** Navigating to `/garden?zone=zone_7b&seed=42` starts a run in zone 7b with seed 42. Default still works without params.

##### WS5.6e — Add ZoneSelector to title screen layout (todo)
> **Files:** `src/routes/+page.svelte`
> **Task:**
> 1. Import and render `<ZoneSelector>` between the subtitle and the "New Season" button.
> 2. Wire `onSelect` to update `selectedZone`.
> 3. Update the static metadata line (currently "Zone 8a · 5 species · 30-week season") to be dynamic: show `selectedZone.name` and the species count from `getAllSpecies().length`.
> **Verify:** Title screen shows zone cards. Selecting a zone updates the metadata. Starting a run uses the selected zone.

---

#### WS5.7 — Zoom & Detail Views

Currently only the garden overview (3×3 grid) exists. Design doc 06 specifies three zoom levels: garden overview → plot focus → plant detail. Selection currently just highlights the plot border.

##### WS5.7a — Create PlotDetailPanel component (todo)
> **Files:** Create `src/lib/ui/PlotDetailPanel.svelte`
> **Task:** A bottom-sheet panel that shows detailed info about a selected plot. This is the "plot focus" zoom level.
> **Props:**
> ```typescript
> interface Props {
>   soil: SoilState;
>   plant: PlantInfo | null;  // from game-session.ts PlantInfo type
>   pendingAmendments: PendingAmendment[];
>   onClose: () => void;
>   onZoomToPlant: () => void;  // navigate to plant detail
> }
> ```
> **Layout (two-column or stacked):**
> 1. **Header:** "Plot [{row},{col}]" + close button
> 2. **Soil section:** Labeled rows for pH, N/P/K, organic matter, moisture, compaction, biology. Values as numbers + small colored bar (green ≥0.6, yellow 0.3–0.6, red <0.3). Use the `SoilState` interface from `src/lib/engine/ecs/components.ts`.
> 3. **Amendments section:** If `pendingAmendments.length > 0`, list each with name and "Ready in X weeks".
> 4. **Plant section (if plant):** Species name, growth stage, health %, stress %, active conditions list. Tap plant name → `onZoomToPlant()`.
> 5. **Empty plot section (if !plant):** "Empty — ready for planting"
>
> **Style:** Bottom-sheet, max-height 50vh, scrollable. Dark theme.
> **Verify:** Renders correctly with mock data for both empty and planted plots.

##### WS5.7b — Wire PlotDetailPanel into garden page (todo)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Import `PlotDetailPanel`.
> 2. Add `let showPlotDetail = $state(false);`
> 3. Add a derived `selectedPlotData` using `$derived.by()` that, when `selectedPlot` is set, queries:
>    - `session.getSoil(row, col)`
>    - `session.getPlantAt(row, col)`
>    - `session.getPendingAmendments(row, col)`
> 4. Modify `onSelectPlot()`: on second tap of same plot (or add a dedicated "inspect" gesture), set `showPlotDetail = true`.
>    - Simplest approach: Double-tap detection. First tap selects. Tap again on same plot → `showPlotDetail = true`.
> 5. Render: `{#if showPlotDetail && selectedPlotData}<PlotDetailPanel {...selectedPlotData} onClose={() => showPlotDetail = false} onZoomToPlant={() => { /* WS5.7d */ }} />{/if}`
> **Verify:** Selecting a plot, then tapping again → detail panel slides up showing soil/plant info. Close button dismisses it.

##### WS5.7c — Create PlantDetailView component (todo)
> **Files:** Create `src/lib/ui/PlantDetailView.svelte`
> **Task:** Full-screen overlay showing a large plant rendering with detailed stats. This is the "plant detail" zoom level.
> **Props:**
> ```typescript
> interface Props {
>   plant: PlantInfo;
>   species: PlantSpecies;
>   palette: SeasonPalette;
>   windState: WindState;
>   timeMs: number;
>   onClose: () => void;
> }
> ```
> **Layout:**
> 1. **Top bar:** Species common name + close (X) button
> 2. **Plant rendering area (60% of height):** Large `<AnimatedPlant>` at 2–3× the normal grid cell size. Use the same SVG viewBox but scale up.
> 3. **Stats area (scrollable, 40%):**
>    - Growth: stage name + progress bar (e.g., "Flowering — 65%")
>    - Health: percentage + colored bar
>    - Stress: percentage + colored bar
>    - Conditions: list of active conditions with severity
>    - Companion buffs: list of active buffs from neighbors
>    - Harvest: "Ready" / "Not ready" + quality indicator
>
> **Style:** Fixed overlay, dark background. Plant SVG centered. Stats in a scrollable panel below.
> **Verify:** Renders a large plant with all stats. Close button returns to garden.

##### WS5.7d — Wire PlantDetailView into garden page (todo)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:**
> 1. Import `PlantDetailView`.
> 2. Add `let showPlantDetail = $state(false);`
> 3. In `PlotDetailPanel`'s `onZoomToPlant` callback: `showPlantDetail = true; showPlotDetail = false;`
> 4. Render: `{#if showPlantDetail && selectedPlotData?.plant}<PlantDetailView plant={selectedPlotData.plant} species={getSpecies(selectedPlotData.plant.speciesId)} palette={palette} windState={windState} timeMs={timeMs} onClose={() => showPlantDetail = false} />{/if}`
> **Verify:** From plot detail panel, tapping plant name → full-screen plant view. Close returns to garden.

---

#### WS5.8 — Frost Visual

When `frostCheckSystem` triggers a killing frost, `AdvanceResult.frost.killingFrost` becomes true. Currently nothing visual happens. The palette system has a `frost` palette defined in `palette.ts` (line 80–87). The doc specifies: white vignette from edges, palette shift to frost colors, dead plants go brown/droopy, perennials desaturate but hold shape.

##### WS5.8a — Add frost state to HUD stores (todo)
> **Files:** `src/lib/ui/hud-stores.svelte.ts`
> **Task:** Add a new reactive state for frost:
> ```typescript
> export const frost = $state({
>   active: false,
>   killedPlants: [] as string[],  // species IDs of killed plants
> });
> ```
> **Verify:** `npm run check` passes. New export is available.

##### WS5.8b — Set frost state when killing frost occurs (todo)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:** In the ADVANCE phase effect, when `advResult?.runEnded` and `advResult.frost.killingFrost`:
> 1. Import `frost` from hud-stores.
> 2. Set `frost.active = true` and `frost.killedPlants = advResult.frost.killed`.
> 3. Add a delay (e.g., 2–3 seconds via `setTimeout`) before showing the RunEndScreen, so the frost visual can play.
> **Verify:** `frost.active` becomes true when killing frost occurs. There's a pause before the end screen.

##### WS5.8c — Create FrostVignette component (todo)
> **Files:** Create `src/lib/render/FrostVignette.svelte`
> **Task:** A full-screen SVG overlay that creates a white vignette effect from the edges.
> **Props:**
> ```typescript
> interface Props {
>   active: boolean;
> }
> ```
> **Implementation:**
> 1. When `active` becomes true, render an SVG overlay with `position: fixed; inset: 0; pointer-events: none; z-index: 50;`
> 2. Use a radial gradient: transparent center → white edges. The gradient animates from `opacity: 0` to `opacity: 0.6` over 2 seconds using a CSS transition.
>    ```svelte
>    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">
>      <defs>
>        <radialGradient id="frost-vig">
>          <stop offset="30%" stop-color="white" stop-opacity="0"/>
>          <stop offset="100%" stop-color="white" stop-opacity="0.7"/>
>        </radialGradient>
>      </defs>
>      <rect width="100" height="100" fill="url(#frost-vig)"/>
>    </svg>
>    ```
> 3. Wrap in `{#if active}` with `transition:fade={{ duration: 2000 }}`.
> **Verify:** When active, a white vignette fades in from the edges over 2 seconds.

##### WS5.8d — Shift palette to frost colors (todo)
> **Files:** `src/routes/garden/+page.svelte`
> **Task:** When `frost.active` is true, override the season palette with the frost palette:
> 1. Import `SEASON_PALETTES` (already imported) — the frost palette is at `SEASON_PALETTES['frost']` if it exists, or define a frost palette inline matching `palette.ts` frost definition (sky: `#eceff1`, foliage_base: `#78909c`).
> 2. Change the `palette` derived value:
>    ```typescript
>    let palette = $derived(frost.active ? FROST_PALETTE : SEASON_PALETTES[seasonId]);
>    ```
>    where `FROST_PALETTE` is either imported or defined as a constant matching the frost colors.
> **Verify:** When frost fires, the sky, soil, and foliage colors shift to cold/gray tones.

##### WS5.8e — Add frost ground texture to PlotCell (todo)
> **Files:** `src/lib/render/PlotCell.svelte`
> **Task:** When the palette indicates frost (detect via `palette.warmth === 0` or add a `frostActive` prop):
> 1. Add a subtle white stipple/noise pattern over the soil background. Use an SVG pattern:
>    ```svelte
>    <pattern id="frost-tex" width="6" height="6" patternUnits="userSpaceOnUse">
>      <circle cx="1" cy="1" r="0.5" fill="white" opacity="0.3"/>
>      <circle cx="4" cy="4" r="0.5" fill="white" opacity="0.2"/>
>    </pattern>
>    <rect width={CELL_SVG} height={CELL_SVG} fill="url(#frost-tex)" opacity="0.5"/>
>    ```
> 2. Render this pattern rect after the main soil rect and before plants.
> **Verify:** When frost is active, soil cells have a subtle white crystalline texture.

##### WS5.8f — Add death/dormancy animation states (todo)
> **Files:** `src/lib/render/PlotCell.svelte` or `src/lib/render/AnimatedPlant.svelte`
> **Task:** When a plant entity has `dead === true` (killed by frost):
> 1. Add a `dead` field to the `PlantData` interface passed to PlotCell (check `CellData` in GardenGrid.svelte).
> 2. In `+page.svelte` cells derivation, add: `dead: !!(pe as Entity).dead`
> 3. When `dead === true`: max out `stress` to 1.0 (full desaturation + droop), which the existing PlantRenderer stress modifiers will handle (leaf droop, color desaturation).
> 4. For perennials that go dormant (not dead): set stress to 0.7 so they desaturate partially but don't fully wilt.
>
> **Verify:** After frost, dead annuals look fully wilted and brown. Perennials look faded but upright.

---

#### WS5.9 — Pest Visual Overlays

The pest system writes `pestInfestation.infestations[]` to plant entities, each with a `visual` string (e.g., `small_insects_on_leaves`) and `severity` (0–1). The 6 pest visual types are defined in `pest-gen.ts` PEST_CATALOG. These use the same overlay rendering pipeline as disease overlays (WS5.4).

##### WS5.9a — Add pest overlay generators to overlays.ts (todo)
> **Files:** `src/lib/render/shapes/overlays.ts`
> **Task:** Add generator functions for the 6 pest visual types:
> - `small_insects_on_leaves` — 10–25 tiny green dots (r=0.8–1.2) scattered on upper half of plant. Count scales with intensity. `fill` = `#2E7D32`.
> - `tiny_white_insects` — 8–20 tiny white dots (r=0.8) scattered across plant. `fill` = `#FAFAFA`, slight opacity variation.
> - `stippled_leaves` — Dense field of tiny dots (r=0.5) in a grid-like pattern across the plant. `fill` = `#FFF9C4` (pale yellow). Gives a speckled/bleached look.
> - `large_caterpillar` — 1 large shape: a curved path (like a fat arc) positioned on a leaf area. Length ~15–20% of plant width. `fill` = `#33691E` (dark green), `stroke` = `#1B5E20`. Only 1 instance regardless of intensity.
> - `leaf_holes_caterpillar` — 3–8 irregular circles with `fill` matching soil/background color to simulate holes. `r` = 2–4. Positioned in the upper portion of the plant.
> - `stippled_leaves_webbing` — Combine `stippled_leaves` output + 2–4 thin diagonal lines (`stroke` = `rgba(255,255,255,0.3)`, `stroke-width` = 0.5) to represent webbing.
>
> Wire each into the `generateOverlay` switch statement in the main dispatch function.
> **Verify:** Each function returns valid `OverlayElement[]`. `npm run check` passes.

##### WS5.9b — Pass pest infestation data through rendering pipeline (todo)
> **Files:** `src/routes/garden/+page.svelte`, `src/lib/render/GardenGrid.svelte`
> **Task:** Pipe `pestInfestation` from ECS entities to PlotCell, using the same `conditions` array as disease overlays (WS5.4i):
> 1. In `+page.svelte` `cells` derivation, when building plant data, read pest infestations:
>    ```typescript
>    const pestOverlays = ((pe as Entity).pestInfestation?.infestations ?? []).map(p => ({
>      overlayId: p.visual,
>      intensity: p.severity,
>    }));
>    ```
> 2. Merge pest overlays into the same `conditions` array used for disease overlays (or rename the field to `overlays` for clarity).
> 3. Both disease and pest overlays flow through the same `DiseaseOverlay` component (WS5.4h) — no new rendering component needed.
> **Verify:** Plants with pest infestations show visual overlays. The same rendering path handles both disease and pest overlays.

##### WS5.9c — Add pest overlay tests (todo)
> **Files:** Create `tests/render/overlay-generators.test.ts`
> **Task:** Write unit tests for the overlay generator functions:
> 1. Test that `generateOverlay({ overlayId: 'leaf_spots', intensity: 0.5, plantWidth: 100, plantHeight: 120, seed: 42 })` returns an array of circles with reasonable positions.
> 2. Test that `generateOverlay({ overlayId: 'small_insects_on_leaves', intensity: 1.0, ... })` returns more dots at high intensity than at low intensity.
> 3. Test that `generateOverlay({ overlayId: 'large_caterpillar', ... })` returns exactly 1 path element.
> 4. Test that `generateOverlay({ overlayId: 'unknown_overlay', ... })` returns `[]` (graceful fallback).
> 5. Test that output is deterministic: same params + seed → same output.
> **Verify:** `npm test` passes. All overlay generators have basic coverage.

### WS6: Meta-Progression UI

Data layer is complete and tested. All UI is missing.

- **WS6.1 — Seed Bank Browser** (todo)
- **WS6.2 — Field Journal UI** (todo)
- **WS6.3 — Climate Ladder / Zone Select** (todo): Depends on WS3.4
- **WS6.4 — Tool Unlock Screen** (todo)
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

| # | Task | Subtasks | Status |
|---|------|----------|--------|
| 1 | Fix remaining gameplay bugs (soil temp init, warm-season growth) | — | done |
| 2 | Amend action UI (WS5.1) | — | done |
| 3 | Intervene/harvest action UI (WS5.3) | WS5.3a–f (6 tasks) | partial (a–c done) |
| 4 | Run end screen (WS5.5) | WS5.5a–f (6 tasks) | done |
| 5 | Run start flow — zone/seed select (WS5.6) | WS5.6a–e (5 tasks) | todo |
| 6 | More species — pepper, beans, marigold, rosemary, corn (WS3.3) | — | todo |

### Phase 2 — Diagnosis & Strategic Depth
> The core learning mechanic works end-to-end. Players diagnose, treat, and learn.

| # | Task | Subtasks | Status |
|---|------|----------|--------|
| 7 | Disease overlay visuals (WS5.4) | WS5.4a–j (10 tasks) | partial (a done) |
| 8 | Pest visual overlays (WS5.9) | WS5.9a–c (3 tasks) | todo |
| 9 | Stress/disease visual modifiers (WS7.7) | — | todo |
| 10 | Diagnosis UI flow (WS2.2) | — | todo |
| 11 | Treatment feedback loop (WS2.3) | — | todo |
| 12 | Scout action UI (WS5.2) | WS5.2a–e (5 tasks) | done |
| 13 | Zoom & detail views (WS5.7) | WS5.7a–d (4 tasks) | todo |
| 14 | Companion discovery cues (WS7.5) | — | todo |

### Phase 3 — Meta-Progression & Content
> Between-run progression and content depth.

| # | Task | Status |
|---|------|--------|
| 15 | Additional zones — 2-3 (WS3.4) | todo |
| 16 | Climate ladder UI (WS6.3) | todo |
| 17 | Tool unlock screen (WS6.4) | todo |
| 18 | Seed bank browser (WS6.1) | todo |
| 19 | Field journal UI (WS6.2) | todo |
| 20 | Lifetime stats screen (WS6.5) | todo |
| 21 | Between-run flow (WS6.6) | todo |

### Phase 4 — Breadth & Polish

| # | Task | Status |
|---|------|--------|
| 22 | More species — strawberry, zone-specific (WS3.3) | todo |
| 23 | Full zone ladder (WS3.4) | todo |
| 24 | Audio system (WS7.1) | todo |
| 25 | Frost visual (WS5.8) | todo |
| 26 | PWA & offline (WS7.2) | todo |
| 27 | Onboarding / tutorial (WS7.3) | todo |
| 28 | Performance optimization (WS7.4) | todo |
| 29 | Seed swap events (WS7.6) | todo |

---

## Notes

- **Test convention:** Every new system should have a corresponding test file in `tests/` following existing patterns (fixtures, deterministic RNG, real system code with controlled inputs).
- **Species are data:** Adding species requires only a JSON file + `npm run validate:species`. No code changes.
- **CLI shares engine:** The CLI must not import from `src/lib/render/`, `src/lib/audio/`, `src/lib/state/stores.ts`, or `src/routes/`. It shares `engine/`, `data/`, `state/events.ts`, and `state/event-log.ts`.
- **The doc 03 tick order** (1-10) is the canonical reference. `simulation.ts` runs all 10 slots.
