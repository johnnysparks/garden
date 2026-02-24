# 07 — Technical Architecture

## Stack

|Layer      |Choice                        |Version|Why                                                            |
|-----------|------------------------------|-------|---------------------------------------------------------------|
|Framework  |SvelteKit                     |2.x    |Lightweight, native stores, transitions, SSR for landing page  |
|Language   |TypeScript                    |5.x    |Type safety for complex game state                             |
|Rendering  |SVG (DOM-native)              |—      |Parametric plants, Svelte component integration                |
|Animation  |svelte/motion + rAF loop      |—      |Spring physics for growth, manual loop for continuous animation|
|ECS        |miniplex                      |latest |Entity-component-system for game entities                      |
|State      |Svelte stores + event sourcing|—      |Reactive UI + replayable game log                              |
|Audio      |Tone.js                       |latest |Procedural ambient sound                                       |
|Persistence|Dexie.js (IndexedDB)          |latest |Offline-first local storage                                    |
|Gestures   |use-gesture (or Hammer.js)    |latest |Pinch/zoom/drag on mobile                                      |
|Build      |Vite                          |latest |SvelteKit default bundler                                      |
|PWA        |vite-plugin-pwa               |latest |Offline capability, installable                                |

## Project Structure

```
perennial/
├── src/
│   ├── lib/
│   │   ├── engine/                # Game simulation (no UI dependencies)
│   │   │   ├── ecs/
│   │   │   │   ├── world.ts       # miniplex world setup
│   │   │   │   ├── components.ts  # ECS component definitions
│   │   │   │   └── systems/
│   │   │   │       ├── growth.ts
│   │   │   │       ├── soil.ts
│   │   │   │       ├── weather.ts
│   │   │   │       ├── disease.ts
│   │   │   │       ├── pest.ts
│   │   │   │       ├── companion.ts
│   │   │   │       ├── harvest.ts
│   │   │   │       ├── spread.ts
│   │   │   │       └── frost.ts
│   │   │   ├── simulation.ts      # Tick orchestrator (runs systems in order)
│   │   │   ├── weather-gen.ts     # Season weather generation
│   │   │   ├── diagnosis.ts       # Hypothesis generation, matching
│   │   │   ├── scoring.ts         # Run scoring calculations
│   │   │   └── rng.ts             # Seeded PRNG
│   │   │
│   │   ├── data/                  # All game content (JSON)
│   │   │   ├── species/           # One JSON per species
│   │   │   │   ├── tomato_cherokee_purple.json
│   │   │   │   ├── basil_genovese.json
│   │   │   │   └── ...
│   │   │   ├── conditions/        # Disease/pest/abiotic conditions
│   │   │   │   ├── early_blight.json
│   │   │   │   ├── powdery_mildew.json
│   │   │   │   └── ...
│   │   │   ├── climate_zones/     # Zone definitions
│   │   │   │   ├── zone_8a.json
│   │   │   │   └── ...
│   │   │   ├── amendments.json    # Soil amendment definitions
│   │   │   └── tools.json         # Unlockable tool definitions
│   │   │
│   │   ├── state/                 # Game state management
│   │   │   ├── stores.ts          # Svelte stores for reactive state
│   │   │   ├── events.ts          # Event types for event sourcing
│   │   │   ├── event-log.ts       # Event recording + replay
│   │   │   ├── save-load.ts       # Dexie persistence layer
│   │   │   └── meta.ts            # Meta-progression state (seed bank, journal, etc.)
│   │   │
│   │   ├── render/                # Visual system
│   │   │   ├── PlantRenderer.svelte    # Parametric SVG plant from params
│   │   │   ├── shapes/
│   │   │   │   ├── leaves.ts           # Leaf shape path generators
│   │   │   │   ├── stems.ts            # Stem bezier generators
│   │   │   │   ├── flowers.ts          # Flower shape generators
│   │   │   │   ├── fruit.ts            # Fruit shape generators
│   │   │   │   └── overlays.ts         # Disease overlay generators
│   │   │   ├── animation.ts            # Wind, breathing, tremor, springs
│   │   │   ├── palette.ts              # Season color system
│   │   │   ├── individualize.ts        # Per-instance visual variation
│   │   │   └── particles.ts            # Minimal particle effects
│   │   │
│   │   ├── audio/                 # Sound system
│   │   │   ├── ambient.ts         # Procedural garden soundscape
│   │   │   └── sfx.ts             # Action sound effects
│   │   │
│   │   └── ui/                    # Shared UI components
│   │       ├── ActionBar.svelte
│   │       ├── EnergyBar.svelte
│   │       ├── SeasonBar.svelte
│   │       ├── WeatherRibbon.svelte
│   │       └── ...
│   │
│   ├── routes/                    # SvelteKit pages
│   │   ├── +page.svelte           # Title screen / main menu
│   │   ├── garden/
│   │   │   └── +page.svelte       # Main gameplay view
│   │   ├── journal/
│   │   │   └── +page.svelte       # Field journal browser
│   │   ├── seeds/
│   │   │   └── +page.svelte       # Seed bank management
│   │   ├── diagnosis/
│   │   │   └── +page.svelte       # Diagnosis mode (overlay on garden)
│   │   └── summary/
│   │       └── +page.svelte       # End-of-run summary screen
│   │
│   ├── app.html
│   └── app.css                    # Global styles, CSS custom properties
│
├── static/
│   ├── fonts/
│   └── audio/                     # Any non-procedural audio samples
│
├── tests/
│   ├── engine/                    # Simulation unit tests
│   │   ├── growth.test.ts
│   │   ├── disease.test.ts
│   │   ├── companion.test.ts
│   │   └── simulation.test.ts    # Integration: full tick cycle
│   └── render/
│       └── plant-renderer.test.ts
│
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Data Flow

```
                    ┌──────────────┐
                    │  Player      │
                    │  Input       │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Event       │  ← All player actions become events
                    │  Dispatch    │
                    └──────┬───────┘
                           │
                ┌──────────▼──────────┐
                │  Event Log          │  ← Append-only, serializable
                │  (event-log.ts)     │
                └──────────┬──────────┘
                           │
              ┌────────────▼────────────┐
              │  Game State Stores      │  ← Derived from event replay
              │  (Svelte writable)      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Simulation Tick        │  ← Triggered at week advance
              │  (simulation.ts)        │
              │  Runs ECS systems       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Updated Entity State   │  ← New plant states, soil, etc.
              └─────┬──────────┬────────┘
                    │          │
         ┌──────────▼──┐  ┌───▼──────────┐
         │  Render      │  │  UI Updates   │
         │  Pipeline    │  │  (stores →    │
         │  (SVG)       │  │   components) │
         └──────────────┘  └──────────────┘
```

## ECS Architecture

Using miniplex for entity management. Every game object is an entity with attached components.

### Components

```typescript
// components.ts

// Spatial
interface Position { x: number; y: number; }  // grid coordinates
interface PlotSlot { row: number; col: number; }

// Botanical
interface Species { speciesId: string; }
interface Growth { 
  progress: number;        // 0-1
  stage: GrowthStageId;
  rate_modifier: number;   // cumulative modifier
}
interface Health {
  value: number;           // 0-1
  stress: number;          // 0-1
}
interface Harvest {
  ripe: boolean;
  remaining: number;
  quality: number;
}

// Soil (attached to plot entities, not plant entities)
interface Soil {
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  organic_matter: number;
  moisture: number;
  temperature: number;
  compaction: number;
  biology: number;
}

// Conditions
interface ActiveConditions {
  conditions: ActiveCondition[];
}
interface ActiveCondition {
  conditionId: string;
  onset_week: number;
  current_stage: number;
  severity: number;
}

// Companion
interface CompanionBuffs {
  buffs: { source: string; effects: InteractionEffect[] }[];
}

// Visual (derived each frame from other components)
interface Visual {
  params: PlantVisualParams;  // current interpolated + stressed
  instanceSeed: number;       // for individualization
}

// Meta
interface Perennial {
  years_established: number;
  dormant: boolean;
}
```

### Systems

Each system is a function that queries entities with specific component sets and updates them:

```typescript
// Example: growth system
function growthSystem(world: World, weather: WeekWeather, deltaWeek: number) {
  const plants = world.with("species", "growth", "health", "plotSlot");
  
  for (const plant of plants) {
    const species = getSpecies(plant.species.speciesId);
    const soil = getSoilAtPlot(world, plant.plotSlot);
    
    const growthDelta = calculateGrowthDelta(species, soil, weather, plant);
    plant.growth.progress = Math.min(1, plant.growth.progress + growthDelta);
    plant.growth.stage = determineStage(species, plant.growth.progress);
  }
}
```

## Event Sourcing

All state changes originate from events. The current state is derived by replaying events.

```typescript
type GameEvent =
  | { type: 'PLANT'; species_id: string; plot: [number, number]; week: number }
  | { type: 'AMEND'; amendment: string; plot: [number, number]; week: number }
  | { type: 'DIAGNOSE'; plant_id: string; hypothesis: string; week: number }
  | { type: 'INTERVENE'; plant_id: string; action: string; week: number }
  | { type: 'SCOUT'; target: string; week: number }
  | { type: 'HARVEST'; plant_id: string; week: number }
  | { type: 'ADVANCE_WEEK' }
  | { type: 'RUN_START'; seed: number; zone: string }
  | { type: 'RUN_END'; reason: 'frost' | 'abandon' | 'catastrophe' };
```

Benefits:

- **Save/Load:** serialize event log → Dexie. Deserialize → replay to restore state.
- **Undo:** pop last event, replay from start (or maintain checkpoints every N events).
- **Field Journal:** generated from event history — “Week 14: Planted Cherokee Purple at [2,3]”
- **Replay:** deterministic if RNG is seeded. Same seed + same events = same outcome.
- **Debug:** full action history for bug reproduction.

## Persistence Schema (Dexie)

```typescript
const db = new Dexie('PerennialDB');

db.version(1).stores({
  // Current run
  currentRun: 'id',              // singleton: { id: 'current', eventLog: [], seed: number, zone: string }
  
  // Meta-progression
  seedBank: 'speciesId',          // { speciesId, cultivars: [], discovered_week: number }
  journal: 'entryId',            // { entryId, type, content, run, week }
  perennials: 'plantId',         // { plantId, speciesId, years, health, plot }
  unlockedZones: 'zoneId',       // { zoneId, best_score, runs_completed }
  unlockedTools: 'toolId',       // { toolId, unlock_date }
  
  // Stats
  lifetimeStats: 'id',           // singleton with all cumulative stats
  runHistory: '++id, zone, score', // completed run summaries
});
```

## Performance Strategy

### Rendering Budget

Target: 16ms frame budget (60fps)

|Task          |Budget|Strategy                                        |
|--------------|------|------------------------------------------------|
|SVG update    |5ms   |Only re-render plants whose visual state changed|
|Animation calc|3ms   |rAF loop, batch transform updates               |
|Spring physics|2ms   |svelte/motion handles this efficiently          |
|Event handling|1ms   |Debounced gesture processing                    |
|Headroom      |5ms   |Buffer for GC, browser overhead                 |

### Optimization Techniques

1. **Dirty flagging:** Only re-render plant SVGs when their state actually changes (growth tick, stress change, disease onset). Between ticks, only animation transforms update — no SVG re-generation.
1. **LOD (Level of Detail):**
- Zoom level 1 (overview): Plants are simplified icons (circle + stem), minimal animation
- Zoom level 2 (focus): Full plant rendering, individual leaf animation
- Zoom level 3 (detail): Maximum detail, disease overlays, particle effects
1. **Offscreen culling:** If zoomed in, don’t animate plants outside the viewport.
1. **Animation pooling:** Shared sine/cosine values computed once per frame, distributed to all plants. Not per-plant trig calls.

## Testing Strategy

### Unit Tests (Vitest)

- **Simulation systems:** Each system tested in isolation with mock entities
- **Growth calculation:** Verify Liebig’s law, temperature response curves
- **Disease engine:** Trigger conditions, progression timing, spread mechanics
- **Companion matching:** Correct effects applied for known pairs
- **Scoring:** Verify score calculations match spec

### Integration Tests

- **Full tick cycle:** Run a complete week tick with known inputs, verify outputs
- **Multi-week simulation:** Run 10 weeks, verify plant reaches expected growth stage
- **Event replay:** Record events, replay, verify identical state

### Visual Tests (Playwright)

- **Plant rendering:** Screenshot comparison of known species at known growth stages
- **Season palette:** Verify color transitions across full season
- **Zoom levels:** Verify LOD transitions

### Data Validation

- **Schema validation:** All species JSON files validated against TypeScript types at build time
- **Cross-reference check:** All companion/antagonist references point to existing species
- **Balance sanity:** Automated check that no species is strictly dominant

## Build & Deploy

- **Dev:** `npm run dev` — Vite dev server with HMR
- **Build:** `npm run build` — SvelteKit static adapter (no server needed)
- **Deploy:** Static hosting (Vercel, Netlify, Cloudflare Pages)
- **PWA:** Service worker for offline play, installable on mobile home screen
- **CI:** GitHub Actions — lint, typecheck, test, build on PR