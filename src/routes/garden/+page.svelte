<script lang="ts">
	import { onMount } from 'svelte';
	import { World } from 'miniplex';
	import GardenGrid, { type CellData } from '$lib/render/GardenGrid.svelte';
	import {
		SEASON_PALETTES,
		type SeasonId,
	} from '$lib/render/palette.js';
	import { createRng } from '$lib/engine/rng.js';
	import { getSpecies, getAllSpecies } from '$lib/data/index.js';
	import type { Entity, SoilState } from '$lib/engine/ecs/components.js';
	import type { GameWorld } from '$lib/engine/ecs/world.js';
	import type { GrowthStageId } from '$lib/data/types.js';
	import SeasonBar from '$lib/ui/SeasonBar.svelte';
	import WeatherRibbon from '$lib/ui/WeatherRibbon.svelte';
	import EnergyBar from '$lib/ui/EnergyBar.svelte';
	import ActionToolbar from '$lib/ui/ActionToolbar.svelte';
	import SeedSelector from '$lib/ui/SeedSelector.svelte';
	import { season, energy, turn, weekToSeasonId } from '$lib/ui/hud-stores.svelte.js';
	import { dispatch } from '$lib/state/stores.js';

	// ── Constants ───────────────────────────────────────────────────────

	const GRID_ROWS = 3;
	const GRID_COLS = 3;
	const SEED = 42;

	// ── ECS World ───────────────────────────────────────────────────────

	let world: GameWorld = new World<Entity>();
	let ecsTick = $state(0);

	function createDefaultSoil(row: number, col: number): SoilState {
		const plotRng = createRng(SEED + row * 10 + col);
		return {
			ph: 6.2 + plotRng.nextFloat(-0.3, 0.3),
			nitrogen: 0.5 + plotRng.nextFloat(-0.15, 0.15),
			phosphorus: 0.4 + plotRng.nextFloat(-0.1, 0.1),
			potassium: 0.4 + plotRng.nextFloat(-0.1, 0.1),
			organic_matter: 0.3 + plotRng.nextFloat(-0.15, 0.15),
			moisture: 0.5 + plotRng.nextFloat(-0.1, 0.1),
			temperature_c: 18,
			compaction: 0.3 + plotRng.nextFloat(-0.1, 0.1),
			biology: 0.4 + plotRng.nextFloat(-0.1, 0.1),
		};
	}

	function initPlots() {
		for (let row = 0; row < GRID_ROWS; row++) {
			for (let col = 0; col < GRID_COLS; col++) {
				world.add({
					plotSlot: { row, col },
					soil: createDefaultSoil(row, col),
					amendments: { pending: [] },
					sunExposure: { level: 'full' },
				});
			}
		}
	}

	function addPlant(
		row: number,
		col: number,
		speciesId: string,
		progress: number,
		stage: GrowthStageId,
		stress: number = 0,
		health: number = 1.0,
	) {
		const species = getSpecies(speciesId);
		if (!species) return;

		const instanceSeed = SEED * 100 + row * 10 + col;

		world.add({
			plotSlot: { row, col },
			species: { speciesId },
			growth: { progress, stage, rate_modifier: 1.0 },
			health: { value: health, stress },
			visual: { params: species.visual, instanceSeed },
			harvestState: {
				ripe: stage === 'fruiting' && progress > 0.7,
				remaining: species.harvest.yield_potential,
				quality: health,
			},
			activeConditions: { conditions: [] },
			companionBuffs: { buffs: [] },
		});
	}

	// Initialize plot grid immediately
	initPlots();

	// Mulch a plot for visual demo
	function mulchPlot(row: number, col: number) {
		for (const e of world.with('plotSlot', 'amendments')) {
			if (e.plotSlot.row === row && e.plotSlot.col === col) {
				e.amendments.pending.push({
					type: 'mulch',
					applied_week: 0,
					effect_delay_weeks: 0,
					effects: {},
				});
				break;
			}
		}
	}

	// ── Hardcoded test garden ───────────────────────────────────────────
	// 5 plants at various growth stages across a 3x3 grid.

	onMount(() => {
		// Basil seedling — just getting started
		addPlant(0, 0, 'basil_genovese', 0.15, 'seedling');

		// Tomato mid vegetative — bushy, leafy
		addPlant(0, 1, 'tomato_cherokee_purple', 0.4, 'vegetative');

		// Tomato at fruiting — tall with fruit
		addPlant(1, 0, 'tomato_cherokee_purple', 0.8, 'fruiting');

		// Basil flowering, slightly stressed
		addPlant(1, 2, 'basil_genovese', 0.6, 'flowering', 0.25, 0.8);

		// Tomato seedling with some stress
		addPlant(2, 2, 'tomato_cherokee_purple', 0.2, 'seedling', 0.15, 0.9);

		// Mulch the bottom-left empty plot
		mulchPlot(2, 0);

		ecsTick++;
	});

	// ── Reactive queries ────────────────────────────────────────────────

	let cells = $derived.by((): CellData[] => {
		void ecsTick;

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
			const isMulched = (plot.amendments?.pending ?? []).some(
				(a) => a.type === 'mulch',
			);

			// Find a plant at this location
			let plant: CellData['plant'] = null;
			for (const pe of plantEntities) {
				if (
					pe.plotSlot.row === row &&
					pe.plotSlot.col === col &&
					!pe.dead
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
		if (!selectedPlot) return false;
		const plantEntities = world.with('plotSlot', 'species');
		for (const pe of plantEntities) {
			if (
				pe.plotSlot.row === selectedPlot.row &&
				pe.plotSlot.col === selectedPlot.col &&
				!pe.dead
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
		if (!selectedPlot) return;
		if (energy.current < 1) return;

		// Dispatch PLANT event
		dispatch({
			type: 'PLANT',
			species_id: speciesId,
			plot: [selectedPlot.row, selectedPlot.col],
			week: season.week,
		});

		// Add plant entity to ECS world
		addPlant(selectedPlot.row, selectedPlot.col, speciesId, 0.0, 'seed');

		// Decrement energy
		energy.current = Math.max(0, energy.current - 1);

		// Update ECS tick and clean up UI state
		ecsTick++;
		showSeedSelector = false;
		selectedPlot = null;
	}

	// ── Action dispatch ─────────────────────────────────────────────────

	function onAction(actionId: string) {
		switch (actionId) {
			case 'plant': {
				if (!selectedPlot || selectedPlotHasPlant) return;
				showSeedSelector = true;
				break;
			}
			case 'wait': {
				// Spend remaining energy, advance to DUSK phase
				energy.current = 0;
				turn.phase = 'DUSK';
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
