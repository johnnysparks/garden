<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import GardenGrid, { type CellData } from '$lib/render/GardenGrid.svelte';
	import {
		SEASON_PALETTES,
	} from '$lib/render/palette.js';
	import { createWindState, updateWind, type WindState } from '$lib/render/animation.js';
	import { getSpecies, getAllSpecies } from '$lib/data/index.js';
	import { createGameSession, type GameSession } from '$lib/engine/game-session.js';
	import type { ClimateZone } from '$lib/engine/weather-gen.js';
	import type { Entity } from '$lib/engine/ecs/components.js';
	import SeasonBar from '$lib/ui/SeasonBar.svelte';
	import WeatherRibbon from '$lib/ui/WeatherRibbon.svelte';
	import EnergyBar from '$lib/ui/EnergyBar.svelte';
	import ActionToolbar from '$lib/ui/ActionToolbar.svelte';
	import SeedSelector from '$lib/ui/SeedSelector.svelte';
	import { season, energy, turn, weather, weekToSeasonId } from '$lib/ui/hud-stores.svelte.js';
	import zone8aData from '$lib/data/zones/zone_8a.json';

	// ── Constants ───────────────────────────────────────────────────────

	const GRID_ROWS = 3;
	const GRID_COLS = 3;

	// ── Shared animation loop ───────────────────────────────────────────
	// One rAF drives all AnimatedPlant instances via props.

	let windState = $state<WindState>(createWindState());
	let timeMs = $state(0);
	let rafId: number | null = null;
	let lastTimestamp = 0;

	function animationTick(timestamp: number) {
		if (lastTimestamp === 0) lastTimestamp = timestamp;
		const deltaMs = Math.min(timestamp - lastTimestamp, 100);
		lastTimestamp = timestamp;

		windState = updateWind(windState, deltaMs);
		timeMs = windState.elapsed;

		rafId = requestAnimationFrame(animationTick);
	}

	// ── Game session ────────────────────────────────────────────────────

	let session = $state<GameSession | null>(null);
	let ecsTick = $state(0);

	/** Advance from DUSK (or ACT) through to the next week's ACT phase. */
	function advanceToNextWeek() {
		if (!session) return;
		const phase = get(session.turnManager.phase);

		if (phase === 'ACT') {
			session.turnManager.endActions(); // ACT → DUSK (sim runs via callback)
		}
		// DUSK → ADVANCE (frost check via callback)
		session.turnManager.advancePhase();
		// ADVANCE → DAWN (increments week)
		session.turnManager.advancePhase();

		// Begin next week: DAWN → PLAN → ACT
		const weekIdx = Math.min(
			get(session.turnManager.week) - 1,
			session.seasonWeather.length - 1,
		);
		session.turnManager.advancePhase(); // DAWN → PLAN
		session.turnManager.beginWork(session.seasonWeather[weekIdx]); // PLAN → ACT

		ecsTick++;
	}

	onMount(() => {
		const seed = Math.floor(Math.random() * 2 ** 32);
		const zone = zone8aData as unknown as ClimateZone;

		const s = createGameSession({
			seed,
			zone,
			speciesLookup: getSpecies,
			gridRows: GRID_ROWS,
			gridCols: GRID_COLS,
		});
		session = s;

		// Sync HUD stores from session's turn manager
		const unsubPhase = s.turnManager.phase.subscribe((p) => {
			turn.phase = p;
		});
		const unsubWeek = s.turnManager.week.subscribe((w) => {
			season.week = w;
		});
		const unsubEnergy = s.turnManager.energy.subscribe((e) => {
			energy.current = e.current;
			energy.max = e.max;
		});
		const unsubWeather = s.currentWeather$.subscribe((w) => {
			weather.current = w;
		});

		// Set zone-derived season info
		season.totalWeeks = 30;
		season.frostStartWeek = zone.frost_free_weeks[1];

		// Advance from DAWN → PLAN → ACT so the player can interact
		const weekIdx = Math.min(get(s.turnManager.week) - 1, s.seasonWeather.length - 1);
		s.turnManager.advancePhase(); // DAWN → PLAN
		s.turnManager.beginWork(s.seasonWeather[weekIdx]); // PLAN → ACT

		ecsTick++;

		// Start the shared animation loop
		rafId = requestAnimationFrame(animationTick);

		return () => {
			unsubPhase();
			unsubWeek();
			unsubEnergy();
			unsubWeather();
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
		};
	});

	// ── Reactive queries ────────────────────────────────────────────────

	let cells = $derived.by((): CellData[] => {
		void ecsTick;
		if (!session) return [];

		const world = session.world;
		const plotEntities = world.with('plotSlot', 'soil');
		const plantEntities = world.with(
			'plotSlot',
			'species',
			'growth',
			'health',
			'visual',
		);

		const result: CellData[] = [];

		for (const plot of plotEntities) {
			const { row, col } = plot.plotSlot;
			const isMulched = ((plot as Entity).amendments?.pending ?? []).some(
				(a) => a.type === 'mulch',
			);

			// Find a plant at this location
			let plant: CellData['plant'] = null;
			for (const pe of plantEntities) {
				if (
					pe.plotSlot.row === row &&
					pe.plotSlot.col === col &&
					!(pe as Entity).dead
				) {
					const sp = getSpecies(pe.species.speciesId);
					if (sp) {
						plant = {
							species: sp,
							growthProgress: pe.growth.progress,
							stage: pe.growth.stage,
							stress: pe.health.stress,
							instanceSeed: pe.visual.instanceSeed,
						};
					}
					break;
				}
			}

			result.push({ row, col, soil: plot.soil, mulched: isMulched, plant });
		}

		return result;
	});

	// ── Season (derived from HUD store) ─────────────────────────────────

	let seasonId = $derived(weekToSeasonId(season.week));
	let palette = $derived(SEASON_PALETTES[seasonId]);

	// ── Selection state ─────────────────────────────────────────────────

	let selectedPlot = $state<{ row: number; col: number } | null>(null);

	function onSelectPlot(row: number, col: number) {
		if (selectedPlot?.row === row && selectedPlot?.col === col) {
			selectedPlot = null;
		} else {
			selectedPlot = { row, col };
		}
	}

	/** Check whether the currently selected plot has a living plant. */
	let selectedPlotHasPlant = $derived.by(() => {
		void ecsTick;
		if (!selectedPlot || !session) return false;
		const plantEntities = session.world.with('plotSlot', 'species');
		for (const pe of plantEntities) {
			if (
				pe.plotSlot.row === selectedPlot.row &&
				pe.plotSlot.col === selectedPlot.col &&
				!(pe as Entity).dead
			) {
				return true;
			}
		}
		return false;
	});

	// ── Seed selector state ─────────────────────────────────────────────

	let showSeedSelector = $state(false);

	/** All species currently available for planting. */
	let availableSpecies = $derived(getAllSpecies());

	function onSelectSeed(speciesId: string) {
		if (!selectedPlot || !session) return;

		// Spend energy via turn manager (returns false if insufficient)
		if (!session.turnManager.spendEnergy(1)) return;

		// Dispatch PLANT event through the session's event log
		session.dispatch({
			type: 'PLANT',
			species_id: speciesId,
			plot: [selectedPlot.row, selectedPlot.col],
			week: season.week,
		});

		// Add plant entity to session's ECS world
		const species = getSpecies(speciesId);
		if (species) {
			const instanceSeed = get(session.turnManager.week) * 1000 + selectedPlot.row * 10 + selectedPlot.col;
			session.world.add({
				plotSlot: { row: selectedPlot.row, col: selectedPlot.col },
				species: { speciesId },
				growth: { progress: 0.0, stage: 'seed', rate_modifier: 1.0 },
				health: { value: 1.0, stress: 0 },
				visual: { params: species.visual, instanceSeed },
				harvestState: {
					ripe: false,
					remaining: species.harvest.yield_potential,
					quality: 1.0,
				},
				activeConditions: { conditions: [] },
				companionBuffs: { buffs: [] },
			});
		}

		// If energy depleted, spendEnergy auto-transitions to DUSK — advance to next week
		if (get(session.turnManager.phase) !== 'ACT') {
			advanceToNextWeek();
		}

		ecsTick++;
		showSeedSelector = false;
		selectedPlot = null;
	}

	// ── Action dispatch ─────────────────────────────────────────────────

	function onAction(actionId: string) {
		if (!session) return;
		switch (actionId) {
			case 'plant': {
				if (!selectedPlot || selectedPlotHasPlant) return;
				showSeedSelector = true;
				break;
			}
			case 'wait': {
				advanceToNextWeek();
				selectedPlot = null;
				break;
			}
		}
	}
</script>

<svelte:head>
	<title>Garden — Perennial</title>
</svelte:head>

<div class="garden-page" style:background={palette.sky}>
	<header class="top-bar" style:background={palette.ui_bg}>
		<SeasonBar />
		<WeatherRibbon />
	</header>

	<main class="garden-content">
		<GardenGrid
			rows={GRID_ROWS}
			cols={GRID_COLS}
			{cells}
			{palette}
			{windState}
			{timeMs}
			{selectedPlot}
			{onSelectPlot}
		/>
	</main>

	<footer class="bottom-bar" style:background={palette.ui_bg}>
		<EnergyBar />
		<ActionToolbar
			{selectedPlot}
			{selectedPlotHasPlant}
			{onAction}
		/>
	</footer>
</div>

{#if showSeedSelector}
	<SeedSelector
		species={availableSpecies}
		onSelect={onSelectSeed}
		onClose={() => (showSeedSelector = false)}
	/>
{/if}

<style>
	.garden-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.top-bar {
		border-bottom: 1px solid rgba(0, 0, 0, 0.08);
		flex-shrink: 0;
	}

	.garden-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 8px;
		min-height: 0;
	}

	.bottom-bar {
		border-top: 1px solid rgba(0, 0, 0, 0.08);
		flex-shrink: 0;
	}
</style>
