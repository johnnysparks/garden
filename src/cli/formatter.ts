/**
 * Text output formatters for CLI.
 *
 * Produces structured, LLM-readable text output matching the format spec
 * in docs/08-CLI-INTERFACE.md. All numeric values include units and labels.
 */

import type { CliSession, DuskTickResult, AdvanceResult, PlantInfo } from './session.js';
import type { SoilState, WeekWeather } from '../lib/engine/ecs/components.js';
import type { PlantSpecies } from '../lib/data/types.js';
import { TurnPhase } from '../lib/engine/turn-manager.js';
import { frostProbability } from '../lib/engine/weather-gen.js';

// ── Helpers ──────────────────────────────────────────────────────────

function seasonName(week: number): string {
  if (week <= 7) return 'Spring';
  if (week <= 20) return 'Summer';
  return 'Fall';
}

function windLabel(wind: string): string {
  return wind;
}

function weatherIcon(weather: WeekWeather): string {
  if (weather.special?.type === 'heavy_rain') return 'Rain';
  if (weather.special?.type === 'heatwave') return 'Heatwave';
  if (weather.special?.type === 'drought') return 'Drought';
  if (weather.special?.type === 'hail') return 'Hail';
  if (weather.special?.type === 'early_frost') return 'Early Frost';
  if (weather.special?.type === 'indian_summer') return 'Indian Summer';
  if (weather.precipitation_mm > 20) return 'Rainy';
  if (weather.temp_high_c > 30) return 'Hot';
  return 'Clear';
}

/** Short stage abbreviation for grid display. */
function stageAbbrev(stage: string): string {
  const map: Record<string, string> = {
    seed: 'seed',
    germination: 'germ',
    seedling: 'sdlg',
    vegetative: 'veg',
    flowering: 'flower',
    fruiting: 'fruit',
    senescence: 'sen',
  };
  return map[stage] ?? stage;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fixed(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

// ── Status ───────────────────────────────────────────────────────────

export function formatStatus(session: CliSession): string {
  const week = session.getWeek();
  const phase = session.getPhase();
  const energy = session.getEnergy();
  const weather = session.getCurrentWeather();
  const season = seasonName(week);

  const lines: string[] = [];
  lines.push(`=== Week ${week} . ${season} . ${phase} Phase ===`);
  lines.push(`Energy: ${energy.current}/${energy.max}`);
  lines.push(
    `Weather: ${weatherIcon(weather)} High ${weather.temp_high_c}C / Low ${weather.temp_low_c}C . Precip ${weather.precipitation_mm}mm . Humidity ${pct(weather.humidity)} . Wind ${windLabel(weather.wind)}`,
  );

  if (weather.special) {
    lines.push(`Special: ${weather.special.type}`);
  }

  const frostProb = frostProbability(week, session.config.zone.first_frost_week_avg);
  lines.push(`Frost risk: ${frostProb < 0.05 ? 'low' : frostProb < 0.3 ? 'moderate' : 'high'} (${pct(frostProb)})`);

  return lines.join('\n');
}

// ── Grid ─────────────────────────────────────────────────────────────

export function formatGrid(session: CliSession): string {
  const { gridRows, gridCols } = session;
  const plants = session.getPlants();
  const plantMap = new Map<string, PlantInfo>();
  for (const p of plants) {
    plantMap.set(`${p.row},${p.col}`, p);
  }

  const COL_WIDTH = 14;
  const lines: string[] = [];

  lines.push(`Garden (${gridRows}x${gridCols}):`);

  // Column headers
  const headerParts = ['  '];
  for (let c = 0; c < gridCols; c++) {
    headerParts.push(`Col ${c}`.padEnd(COL_WIDTH));
  }
  lines.push(headerParts.join(' '));

  // Top border
  lines.push(
    '  ' + Array.from({ length: gridCols }, () => '-'.repeat(COL_WIDTH)).join('-+-') + '-',
  );

  for (let r = 0; r < gridRows; r++) {
    const nameRow: string[] = [];
    const stageRow: string[] = [];
    const healthRow: string[] = [];

    for (let c = 0; c < gridCols; c++) {
      const plant = plantMap.get(`${r},${c}`);
      if (plant) {
        const shortId = plant.speciesId.length > COL_WIDTH - 2
          ? plant.speciesId.slice(0, COL_WIDTH - 2)
          : plant.speciesId;
        nameRow.push((' ' + shortId).padEnd(COL_WIDTH));
        stageRow.push((' ' + stageAbbrev(plant.stage) + ' ' + pct(plant.progress)).padEnd(COL_WIDTH));
        const healthStr = `h ${fixed(plant.health)} s ${fixed(plant.stress)}`;
        const warn = plant.stress > 0.2 || plant.conditions.length > 0 ? ' !' : '';
        healthRow.push((' ' + healthStr + warn).padEnd(COL_WIDTH));
      } else {
        nameRow.push(' [empty]'.padEnd(COL_WIDTH));
        stageRow.push(' '.padEnd(COL_WIDTH));
        healthRow.push(' '.padEnd(COL_WIDTH));
      }
    }

    lines.push(`${r} |${nameRow.join('|')}|`);
    lines.push(`  |${stageRow.join('|')}|`);
    lines.push(`  |${healthRow.join('|')}|`);

    if (r < gridRows - 1) {
      lines.push(
        '  ' + Array.from({ length: gridCols }, () => '-'.repeat(COL_WIDTH)).join('-+-') + '-',
      );
    }
  }

  // Bottom border
  lines.push(
    '  ' + Array.from({ length: gridCols }, () => '-'.repeat(COL_WIDTH)).join('-+-') + '-',
  );

  return lines.join('\n');
}

// ── Inspect ──────────────────────────────────────────────────────────

export function formatInspect(session: CliSession, row: number, col: number): string {
  const lines: string[] = [];
  lines.push(`=== Plot [${row}, ${col}] ===`);

  const plant = session.getPlantAt(row, col);
  if (plant) {
    const species = session.speciesLookup(plant.speciesId);
    const name = species ? `${species.common_name} (${species.botanical_name})` : plant.speciesId;
    lines.push(`Plant: ${name}`);
    lines.push(`  Stage: ${plant.stage} (progress: ${fixed(plant.progress)})`);
    lines.push(`  Health: ${fixed(plant.health)}`);
    lines.push(`  Stress: ${fixed(plant.stress)}${plant.stress > 0.2 ? ' !' : ''}`);
    if (plant.conditions.length > 0) {
      for (const cond of plant.conditions) {
        lines.push(`  Condition: ${cond.conditionId} (stage ${cond.stage}, severity ${fixed(cond.severity)})`);
      }
    } else {
      lines.push(`  Conditions: none`);
    }
    // TODO: Companion buff display only shows source species IDs, not effect
    // types or magnitudes. Players can't tell what benefit they're getting
    // (e.g. "basil_genovese: pest_resistance +0.3" vs just "basil_genovese").
    if (plant.companionBuffs.length > 0) {
      lines.push(`  Companion buffs: ${plant.companionBuffs.map((b) => b.source).join(', ')}`);
    } else {
      lines.push(`  Companion buffs: none`);
    }
    if (plant.harvestReady) {
      lines.push(`  ** HARVEST READY **`);
    }
  } else {
    lines.push(`Plant: [empty]`);
  }

  // TODO: BUG — Pending amendments are not displayed in inspect output.
  // The scenario doc says inspect should show pending amendments, but this
  // formatter never reads the plot entity's `amendments` component. Even once
  // the amendment-not-applied bug is fixed, players won't see pending amendments
  // here. Need to query the plot entity's `amendments.pending` array and display
  // each pending amendment with its type, applied_week, and weeks remaining.

  const soil = session.getSoil(row, col);
  if (soil) {
    lines.push(`Soil:`);
    lines.push(`  pH: ${fixed(soil.ph)} . Moisture: ${fixed(soil.moisture)} . Temp: ${fixed(soil.temperature_c)}C`);
    lines.push(`  N: ${fixed(soil.nitrogen)} . P: ${fixed(soil.phosphorus)} . K: ${fixed(soil.potassium)}`);
    lines.push(`  Organic matter: ${fixed(soil.organic_matter)} . Biology: ${fixed(soil.biology)} . Compaction: ${fixed(soil.compaction)}`);
  }

  return lines.join('\n');
}

// ── Diagnose ────────────────────────────────────────────────────────

export function formatDiagnose(session: CliSession, row: number, col: number): string {
  const plant = session.getPlantAt(row, col);
  if (!plant) {
    return `Error: No plant at [${row}, ${col}].`;
  }

  const species = session.speciesLookup(plant.speciesId);
  const name = species ? `${species.common_name}` : plant.speciesId;
  const lines: string[] = [];
  lines.push(`=== Diagnosis: ${name} [${row}, ${col}] ===`);
  lines.push(`Stage: ${plant.stage} (${pct(plant.progress)})`);
  lines.push(`Health: ${fixed(plant.health)} | Stress: ${fixed(plant.stress)}${plant.stress > 0.2 ? ' !' : ''}`);

  // Active conditions with symptom descriptions
  if (plant.conditions.length > 0) {
    lines.push('');
    lines.push('Active conditions:');
    for (const cond of plant.conditions) {
      lines.push(`  ${cond.conditionId} — severity ${fixed(cond.severity)}, stage ${cond.stage}`);
      if (species) {
        const vuln = species.vulnerabilities.find((v) => v.condition_id === cond.conditionId);
        if (vuln && vuln.symptoms.stages[cond.stage]) {
          const symptom = vuln.symptoms.stages[cond.stage];
          lines.push(`    Symptom: ${symptom.description}`);
          lines.push(`    Reversible: ${symptom.reversible ? 'yes' : 'no'}`);
          if (vuln.symptoms.weeks_to_death !== null) {
            lines.push(`    Lethal after ${vuln.symptoms.weeks_to_death} weeks if untreated`);
          }
        }
      }
    }
  } else {
    lines.push('');
    lines.push('No active conditions detected.');
  }

  // Environmental assessment
  const soil = session.getSoil(row, col);
  if (soil && species) {
    lines.push('');
    lines.push('Environmental assessment:');
    const warnings: string[] = [];

    if (soil.ph < species.needs.soil_ph[0]) {
      warnings.push(`  Soil pH ${fixed(soil.ph)} is below preferred range (${species.needs.soil_ph[0]}-${species.needs.soil_ph[1]})`);
    } else if (soil.ph > species.needs.soil_ph[1]) {
      warnings.push(`  Soil pH ${fixed(soil.ph)} is above preferred range (${species.needs.soil_ph[0]}-${species.needs.soil_ph[1]})`);
    }

    if (soil.temperature_c < species.needs.soil_temp_min_c) {
      warnings.push(`  Soil temp ${fixed(soil.temperature_c)}C is below minimum ${species.needs.soil_temp_min_c}C`);
    }

    const minNutrient = Math.min(soil.nitrogen, soil.phosphorus, soil.potassium);
    if (minNutrient < 0.3) {
      warnings.push(`  Low nutrients — N: ${fixed(soil.nitrogen)}, P: ${fixed(soil.phosphorus)}, K: ${fixed(soil.potassium)}`);
    }

    if (soil.moisture < 0.2) {
      warnings.push(`  Soil moisture critically low (${fixed(soil.moisture)})`);
    } else if (soil.moisture > 0.8) {
      warnings.push(`  Soil moisture excessive (${fixed(soil.moisture)}) — risk of root rot`);
    }

    if (warnings.length > 0) {
      for (const w of warnings) lines.push(w);
    } else {
      lines.push('  Conditions look good for this species.');
    }
  }

  return lines.join('\n');
}

// ── Weather ──────────────────────────────────────────────────────────

export function formatWeather(session: CliSession): string {
  const weather = session.getCurrentWeather();
  const week = session.getWeek();
  const lines: string[] = [];
  lines.push(`=== Weather — Week ${week} ===`);
  lines.push(`High: ${weather.temp_high_c}C / Low: ${weather.temp_low_c}C`);
  lines.push(`Precipitation: ${weather.precipitation_mm}mm`);
  lines.push(`Humidity: ${pct(weather.humidity)}`);
  lines.push(`Wind: ${weather.wind}`);
  lines.push(`Frost: ${weather.frost ? 'YES' : 'no'}`);
  if (weather.special) {
    lines.push(`Special event: ${weather.special.type}`);
  }
  return lines.join('\n');
}

// ── Plants list ──────────────────────────────────────────────────────

export function formatPlants(session: CliSession): string {
  const plants = session.getPlants();
  if (plants.length === 0) {
    return 'No plants in the garden.';
  }

  const lines: string[] = [];
  lines.push(`=== Plants (${plants.length}) ===`);
  for (const p of plants) {
    const warn = p.stress > 0.2 ? ' !' : '';
    lines.push(
      `  ${p.speciesId} [${p.row},${p.col}]: ${p.stage} ${pct(p.progress)} | health ${fixed(p.health)} | stress ${fixed(p.stress)}${warn}`,
    );
  }
  return lines.join('\n');
}

// ── Soil detail ──────────────────────────────────────────────────────

export function formatSoil(session: CliSession, row: number, col: number): string {
  const soil = session.getSoil(row, col);
  if (!soil) {
    return `Error: No plot at [${row}, ${col}].`;
  }

  const lines: string[] = [];
  lines.push(`=== Soil [${row}, ${col}] ===`);
  lines.push(`pH: ${fixed(soil.ph)}`);
  lines.push(`Moisture: ${fixed(soil.moisture)}`);
  lines.push(`Temperature: ${fixed(soil.temperature_c)}C`);
  lines.push(`Nitrogen: ${fixed(soil.nitrogen)}`);
  lines.push(`Phosphorus: ${fixed(soil.phosphorus)}`);
  lines.push(`Potassium: ${fixed(soil.potassium)}`);
  lines.push(`Organic matter: ${fixed(soil.organic_matter)}`);
  lines.push(`Biology: ${fixed(soil.biology)}`);
  lines.push(`Compaction: ${fixed(soil.compaction)}`);
  return lines.join('\n');
}

// ── Species info ─────────────────────────────────────────────────────

export function formatSpeciesList(species: PlantSpecies[]): string {
  if (species.length === 0) {
    return 'No species available.';
  }

  const lines: string[] = [];
  lines.push(`=== Available Species (${species.length}) ===`);
  for (const s of species) {
    lines.push(`  ${s.id}: ${s.common_name} (${s.botanical_name}) — ${s.type}, ${s.lore.difficulty}`);
  }
  return lines.join('\n');
}

export function formatSpeciesDetail(species: PlantSpecies): string {
  const lines: string[] = [];
  lines.push(`=== ${species.common_name} (${species.botanical_name}) ===`);
  lines.push(`ID: ${species.id}`);
  lines.push(`Family: ${species.family}`);
  lines.push(`Type: ${species.type}`);
  lines.push(`Difficulty: ${species.lore.difficulty}`);
  lines.push('');
  lines.push(`Growth: ${species.growth.habit}, ${species.growth.growth_rate} rate`);
  lines.push(`  Maturity: ${species.growth.days_to_maturity[0]}-${species.growth.days_to_maturity[1]} days`);
  lines.push(`  Max size: ${species.growth.max_height_cm}cm H x ${species.growth.max_spread_cm}cm W`);
  lines.push('');
  lines.push(`Needs:`);
  lines.push(`  Sun: ${species.needs.sun} | Water: ${species.needs.water}`);
  lines.push(`  Soil pH: ${species.needs.soil_ph[0]}-${species.needs.soil_ph[1]}`);
  lines.push(`  Nutrients: N=${species.needs.nutrients.N} P=${species.needs.nutrients.P} K=${species.needs.nutrients.K}`);
  lines.push(`  Min soil temp: ${species.needs.soil_temp_min_c}C`);
  lines.push(`  Frost tolerance: ${species.needs.frost_tolerance}`);
  lines.push('');
  lines.push(`Season:`);
  lines.push(`  Sow: weeks ${species.season.sow_window[0]}-${species.season.sow_window[1]}`);
  lines.push(`  Harvest: weeks ${species.season.harvest_window[0]}-${species.season.harvest_window[1]}`);
  if (species.season.bolt_trigger) {
    lines.push(`  Bolt trigger: ${species.season.bolt_trigger}`);
  }
  lines.push('');
  lines.push(`Harvest: ${species.harvest.harvest_type}, yield ${species.harvest.yield_potential}/10`);
  lines.push(`  Continuous: ${species.harvest.continuous_harvest ? 'yes' : 'no'} | Seed saving: ${species.harvest.seed_saving ? 'yes' : 'no'}`);

  if (species.companions.length > 0) {
    lines.push('');
    lines.push(`Companions: ${species.companions.map((c) => c.species_id).join(', ')}`);
  }
  if (species.antagonists.length > 0) {
    lines.push(`Antagonists: ${species.antagonists.map((a) => a.species_id).join(', ')}`);
  }

  lines.push('');
  lines.push(`Lore: ${species.lore.description}`);
  lines.push(`Fun fact: ${species.lore.fun_fact}`);
  return lines.join('\n');
}

// ── Tick summary ─────────────────────────────────────────────────────

// TODO: DUSK tick summary doesn't report active companion effects.
// Players have no indication that companion bonuses are firing unless they
// manually inspect each plant. Consider adding a "Companions:" section
// listing active buffs/debuffs applied this tick.
export function formatDuskTick(result: DuskTickResult): string {
  const lines: string[] = [];
  lines.push(`=== DUSK — Simulation Tick (Week ${result.week}) ===`);

  if (result.grown.length > 0) {
    lines.push('Growth:');
    for (const g of result.grown) {
      const delta = g.progress - g.prevProgress;
      const note = delta <= 0.001 ? ' (stalled)' : '';
      lines.push(
        `  ${g.speciesId} [${g.row},${g.col}]: ${g.stage} ${pct(g.prevProgress)} -> ${pct(g.progress)}${note}`,
      );
    }
  } else {
    lines.push('Growth: none');
  }

  if (result.stressed.length > 0) {
    lines.push('Stress:');
    for (const s of result.stressed) {
      lines.push(
        `  ${s.speciesId} [${s.row},${s.col}]: stress ${fixed(s.prevStress)} -> ${fixed(s.stress)}`,
      );
    }
  }

  if (result.diseaseOnsets.length > 0) {
    lines.push('Disease:');
    for (const d of result.diseaseOnsets) {
      lines.push(`  ${d.speciesId} [${d.row},${d.col}]: ${d.conditionId} onset`);
    }
  }

  if (result.harvestReady.length > 0) {
    lines.push('Harvest ready:');
    for (const h of result.harvestReady) {
      lines.push(`  ${h.speciesId} [${h.row},${h.col}]`);
    }
  }

  return lines.join('\n');
}

export function formatAdvance(result: AdvanceResult, zone: { first_frost_week_avg: number }): string {
  const lines: string[] = [];
  const nextWeek = result.weekAdvanced + 1;

  if (result.frost.killingFrost) {
    lines.push(`=== KILLING FROST ===`);
    lines.push(`Season has ended. Killing frost arrived at week ${result.weekAdvanced}.`);
    if (result.frost.killed.length > 0) {
      lines.push(`Killed: ${result.frost.killed.join(', ')}`);
    }
  } else {
    lines.push(`=== ADVANCE — Week ${result.weekAdvanced} -> ${nextWeek} ===`);
    lines.push(`Season: ${seasonName(nextWeek)}`);
    const nextFrostProb = frostProbability(nextWeek, zone.first_frost_week_avg);
    lines.push(`Frost probability next week: ${pct(nextFrostProb)}`);
  }

  return lines.join('\n');
}

// ── Event log ────────────────────────────────────────────────────────

export function formatLog(session: CliSession, count: number): string {
  const entries = session.eventLog.entries;
  const start = Math.max(0, entries.length - count);
  const slice = entries.slice(start);

  if (slice.length === 0) {
    return 'Event log is empty.';
  }

  const lines: string[] = [];
  lines.push(`=== Event Log (last ${slice.length} of ${entries.length}) ===`);
  for (const entry of slice) {
    const e = entry.event;
    lines.push(`  #${entry.index}: ${JSON.stringify(e)}`);
  }
  return lines.join('\n');
}

// ── Help ─────────────────────────────────────────────────────────────

const HELP_TEXT: Record<string, string> = {
  status: 'status — Show current week, phase, energy, weather, frost risk.',
  grid: 'grid — Show ASCII garden grid with plants.',
  inspect: 'inspect ROW COL — Detailed view of a specific plot (plant + soil).',
  weather: 'weather — Current week weather details.',
  plants: 'plants — List all planted species with growth and health.',
  soil: 'soil ROW COL — Detailed soil state for a plot.',
  species: 'species [ID] — List available species, or show details for one.',
  amendments: 'amendments — List available soil amendments.',
  log: 'log [N] — Show last N events (default 10).',
  plant: 'plant SPECIES_ID ROW COL — Plant a species at grid position. (ACT phase, costs 1 energy)',
  amend: 'amend AMENDMENT ROW COL — Apply soil amendment to a plot. (ACT phase, costs 1 energy)',
  diagnose: 'diagnose ROW COL — Inspect a plant for symptoms. (ACT phase, costs 1 energy)',
  intervene: 'intervene ACTION ROW COL — Take action on a plant. (ACT phase, costs 1 energy)',
  scout: 'scout TARGET — Reveal info (weather, pests, soil). (ACT phase, costs 1 energy)',
  wait: 'wait — End actions early, transition to DUSK.',
  advance: 'advance — Advance to the next phase.',
  week: 'week — Shortcut: advance through all phases to next week.',
  save: 'save [PATH] — Save event log to JSON file.',
  quit: 'quit — End the session.',
  help: 'help [COMMAND] — Show this help or details for a command.',
};

export function formatHelp(command?: string): string {
  if (command && HELP_TEXT[command]) {
    return HELP_TEXT[command];
  }

  if (command) {
    return `Unknown command: '${command}'. Type 'help' for available commands.`;
  }

  const lines: string[] = [];
  lines.push('=== Perennial CLI — Commands ===');
  lines.push('');
  lines.push('Query (any phase):');
  lines.push('  status, grid, inspect ROW COL, weather, plants,');
  lines.push('  soil ROW COL, species [ID], amendments, log [N], help [CMD]');
  lines.push('');
  lines.push('Actions (ACT phase only):');
  lines.push('  plant SPECIES ROW COL, amend TYPE ROW COL,');
  lines.push('  diagnose ROW COL, intervene ACTION ROW COL,');
  lines.push('  scout TARGET, wait');
  lines.push('');
  lines.push('Turn:');
  lines.push('  advance, week');
  lines.push('');
  lines.push('Session:');
  lines.push('  save [PATH], quit');
  return lines.join('\n');
}
