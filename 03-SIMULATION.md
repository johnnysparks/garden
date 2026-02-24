# 03 — Simulation Engine

## Overview

The simulation engine runs once per week during the DUSK phase. It takes the current garden state + player actions from the ACT phase and computes the next state. All randomness uses seeded RNG for reproducibility/replays.

## Tick Order

The order of operations matters — it creates emergent behavior and edge cases the player learns to exploit.

```
1. WEATHER_APPLY        → set temperature, moisture, humidity for the week
2. SOIL_UPDATE          → amendments take effect, nutrients shift, moisture changes
3. COMPANION_EFFECTS    → adjacency bonuses/penalties calculated
4. GROWTH_TICK          → each plant advances growth based on conditions
5. STRESS_ACCUMULATE    → plants outside ideal ranges accumulate stress
6. DISEASE_CHECK        → stress + triggers → disease onset/progression
7. PEST_CHECK           → pest events spawn, spread, or resolve
8. HARVEST_CHECK        → mark ripe produce available for next week's harvest
9. SPREAD_CHECK         → invasive plants, disease spread, self-seeding
10. FROST_CHECK         → late in season, probability roll for killing frost
```

## 1. Weather System

Weather is pre-generated for the entire season at run start (with some variance). Player can spend SCOUT actions to peek ahead.

```typescript
interface WeekWeather {
  week: number;
  temp_high_c: number;
  temp_low_c: number;
  precipitation_mm: number;
  humidity: number;              // 0-1
  wind: "calm" | "light" | "moderate" | "strong";
  frost: boolean;                // killing frost
  special: WeatherEvent | null;  // heatwave, hailstorm, drought
}

type WeatherEvent = 
  | { type: "heatwave"; duration_weeks: number; temp_bonus: number }
  | { type: "drought"; duration_weeks: number; moisture_penalty: number }
  | { type: "heavy_rain"; flood_risk: number }
  | { type: "hail"; damage_severity: number }
  | { type: "early_frost"; temp: number }
  | { type: "indian_summer"; duration_weeks: number };
```

Weather is generated from a climate zone profile:

```typescript
interface ClimateZone {
  id: string;                    // "zone_8a"
  name: string;                  // "USDA Zone 8a — Pacific Northwest"
  avg_temps_by_week: number[];   // 30-week temperature curve
  temp_variance: number;         // how much temps can deviate
  precip_pattern: "winter_wet" | "summer_wet" | "even" | "arid";
  frost_free_weeks: [number, number];  // range of frost-free window
  first_frost_week_avg: number;
  humidity_baseline: number;
  special_event_weights: Record<string, number>;
}
```

## 2. Soil Update

Each plot has independent soil state:

```typescript
interface SoilState {
  ph: number;                    // 4.0 - 9.0
  nitrogen: number;              // 0-1 normalized
  phosphorus: number;            // 0-1
  potassium: number;             // 0-1
  organic_matter: number;        // 0-1
  moisture: number;              // 0-1
  temperature_c: number;         // derived from air temp + mulch + sun
  compaction: number;            // 0-1, higher = worse
  biology: number;               // 0-1, soil food web health
  amendments_pending: PendingAmendment[];
}

interface PendingAmendment {
  type: string;
  applied_week: number;
  effect_delay_weeks: number;
  effects: Partial<SoilState>;   // deltas to apply when delay expires
}
```

Each tick:

- Pending amendments that have reached their delay → apply effects
- Moisture adjusts based on precipitation, evaporation (temp-driven), mulch modifier
- Nutrients deplete based on plant uptake (larger plants consume more)
- Biology recovers slowly if organic matter is adequate, drops with synthetic fertilizer
- Organic matter decays slowly, replenished by mulch/compost

### Nutrient Cycling

Plants consume N/P/K based on their `needs` profile and current growth stage. Vegetative growth is N-heavy. Flowering/fruiting shifts to P/K-heavy. This means soil that was fine during early growth can become deficient at flowering — a common real-world surprise.

Nitrogen fixers (beans, peas) ADD nitrogen to soil. The benefit persists after the plant is removed. This is one of the key strategic insights the game teaches — crop rotation with legumes.

## 3. Companion Effects

For each planted plot, check all adjacent plots (8-cell neighborhood):

```
for each plant P:
  for each neighbor N in adjacent_cells(P):
    for each companion_entry in P.companions:
      if companion_entry.species_id == N.species_id:
        apply companion_entry.effects to P
    for each antagonist_entry in P.antagonists:
      if antagonist_entry.species_id == N.species_id:
        apply antagonist_entry.effects to P
```

Effects stack but with diminishing returns (two basils next to tomato ≠ 2× benefit).

**Discovery mechanic:** Companion/antagonist effects are NOT shown to the player upfront. When an interaction fires for the first time, a subtle visual cue appears (golden sparkle for positive, red flicker for negative). The effect is logged to the field journal as “observed interaction” with the actual modifier hidden until the player triggers it 3 times. This teaches through observation, not reading.

## 4. Growth Tick

Each plant has a growth progress float (0.0 → 1.0 across all stages):

```typescript
interface PlantInstance {
  id: string;
  species_id: string;
  plot: [number, number];
  planted_week: number;
  growth_progress: number;       // 0.0 - 1.0
  current_stage: string;         // "seedling", "vegetative", etc.
  health: number;                // 0-1, composite health score
  stress: number;                // 0-1, accumulated stress
  active_conditions: ActiveCondition[];
  companion_buffs: ActiveBuff[];
  harvests_remaining: number;    // for continuous harvest types
  visual_state: PlantVisualState; // current interpolated visual params
}
```

Growth rate per tick:

```
base_rate = species.growth_rate_value / total_expected_weeks
temp_modifier = gaussian_fit(current_temp, ideal_temp, tolerance_range)
water_modifier = gaussian_fit(soil_moisture, ideal_moisture, tolerance_range)
nutrient_modifier = min(N_adequacy, P_adequacy, K_adequacy)  // Liebig's law of minimum
light_modifier = sun_match(species.needs.sun, plot.sun_exposure)
companion_modifier = sum(companion_growth_effects)
stress_penalty = 1 - (plant.stress * 0.5)

growth_delta = base_rate * temp_modifier * water_modifier * nutrient_modifier 
             * light_modifier * companion_modifier * stress_penalty
```

**Liebig’s law of the minimum** is a real agricultural principle: growth is limited by the scarcest resource, not the average. If nitrogen is critically low, perfect water and sun don’t compensate. This is encoded directly in the `min()` call above.

## 5. Stress Accumulation

Stress is a float that accumulates when conditions are outside the plant’s ideal range and recovers slowly when conditions improve.

```
stress_delta = 0
if soil.ph outside species.needs.soil_ph: stress_delta += 0.05 * distance_from_range
if soil.moisture too high: stress_delta += 0.08
if soil.moisture too low: stress_delta += 0.1
if temp outside comfort zone: stress_delta += 0.05 * distance
if nutrient deficiency: stress_delta += 0.06 per deficient nutrient

// Recovery (only if all conditions met)
if all_conditions_met: stress_delta -= 0.03

plant.stress = clamp(plant.stress + stress_delta, 0, 1)
plant.health = 1 - (plant.stress * stress_to_health_factor) - disease_health_penalty
```

Stress affects:

- Growth rate (slows)
- Visual appearance (leaf droop, color desaturation, tremor animation)
- Disease susceptibility (stressed plants are more vulnerable)
- Yield (stressed plants produce less)

## 6. Disease Check

Each week, for each plant, roll against disease susceptibility:

```
for each vulnerability V in species.vulnerabilities:
  trigger_score = sum(
    for each trigger T in V.triggers:
      if condition_met(T, soil, weather): T.threshold_weight
  )
  onset_probability = V.susceptibility * trigger_score * (1 + plant.stress)
  
  if random() < onset_probability AND no_existing(V.condition_id):
    activate_disease(plant, V)
```

Active diseases progress through their symptom stages each tick. Each stage updates the visual overlay and journal description. If `spreads == true`, adjacent plants of the same family get an onset probability boost.

## 7. Pest Check

Pests are zone-level events, not per-plant. A pest event arrives and affects susceptible species.

```typescript
interface PestEvent {
  pest_id: string;               // "aphids"
  target_families: string[];     // ["Solanaceae", "Brassicaceae"]
  arrival_week: number;
  severity: number;              // 0-1
  duration_weeks: number;
  countered_by: string[];        // ["marigold", "ladybug_release"]
  visual: string;                // "small_insects_on_leaves"
}
```

Pest events are pre-generated at season start (like weather) but can be scouted. Companion plants with `pest_resistance` effects reduce severity for adjacent susceptible plants. This is how the player discovers that marigolds near tomatoes actually do something.

## 8. Harvest Check

When a plant’s growth progress enters the harvest window AND health > minimum threshold:

- Plant flagged as `harvestable`
- Visual cue: fruit changes to ripe color, gentle pulse animation
- Player can HARVEST as an action next week
- If not harvested within the harvest window, produce quality degrades
- For continuous harvest plants (tomatoes, beans), each harvest yields partial output and resets a harvest timer

## 9. Spread Check

Some plants spread:

- Mint runners → attempt to claim adjacent empty plots
- Self-seeders → probability of volunteer plants next run
- Disease spread (handled in disease check)
- Weed pressure → empty plots have a chance of spawning weeds that compete for resources

## 10. Frost Check

After the `first_frost_week_avg` for the climate zone, each week has an increasing probability of killing frost:

```
frost_probability = sigmoid(current_week - first_frost_week_avg, steepness=0.5)
if random() < frost_probability:
  killing_frost = true
  for each plant:
    if species.needs.frost_tolerance == "none": kill(plant)
    if species.needs.frost_tolerance == "light" AND frost_severity > 0.5: kill(plant)
    // hard frost tolerance survives
```

Frost ends the run. Surviving perennials enter dormancy and persist to the next run.

## Randomness & Seeds

All RNG uses a seeded PRNG (e.g., `mulberry32` or `xoshiro128`). The run seed determines:

- Weather generation
- Pest event timing
- Disease rolls
- All random events

This means runs are reproducible for debugging/replays, and the player can share seeds for challenge runs.

## Difficulty Scaling

Difficulty is controlled by:

1. **Climate zone** — shorter growing seasons, more extreme events
1. **Starting soil** — better zones might have poorer soil
1. **Pest pressure** — higher zones have more frequent/severe pest events
1. **Energy budget** — could be reduced in harder modes
1. **Information hiding** — harder zones might not reveal weather as far in advance

All of these are tuning knobs in the zone definition, not code changes.