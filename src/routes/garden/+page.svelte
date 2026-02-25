<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import GardenGrid, { type CellData } from '$lib/render/GardenGrid.svelte';
	import {
		SEASON_PALETTES,
	} from '$lib/render/palette.js';
	import { createWindState, updateWind, type WindState } from '$lib/render/animation.js';
	import { getSpecies, getAllSpecies, getAllAmendments, getAmendment } from '$lib/data/index.js';
	import { createGameSession, type GameSession } from '$lib/engine/game-session.js';
	import type { ClimateZone } from '$lib/engine/weather-gen.js';
	import type { Entity, WeekWeather, PestEvent, SoilState } from '$lib/engine/ecs/components.js';
	import SeasonBar from '$lib/ui/SeasonBar.svelte';
	import WeatherRibbon from '$lib/ui/WeatherRibbon.svelte';
	import EnergyBar from '$lib/ui/EnergyBar.svelte';
	import ActionToolbar from '$lib/ui/ActionToolbar.svelte';
	import SeedSelector from '$lib/ui/SeedSelector.svelte';
	import AmendmentSelector from '$lib/ui/AmendmentSelector.svelte';
	import ScoutPicker from '$lib/ui/ScoutPicker.svelte';
	import ScoutResultPanel from '$lib/ui/ScoutResultPanel.svelte';
	import InterveneMenu from '$lib/ui/InterveneMenu.svelte';
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

	/** Transition PLAN → ACT with the current week's energy budget. */
	function handleBeginWork() {
		if (!session) return;
		const weekIdx = Math.min(
			get(session.turnManager.week) - 1,
			session.seasonWeather.length - 1,
		);
		session.turnManager.beginWork(session.seasonWeather[weekIdx]);
	}

	// ── Phase-reactive behavior ────────────────────────────────────────
	// Subscribes to turn.phase and drives automated transitions with
	// timeouts (DAWN, DUSK) or immediate logic (ADVANCE).

	$effect(() => {
		const phase = turn.phase;
		const s = session;
		if (!s) return;

		if (phase === 'DAWN') {
			// Reveal this week's weather on the HUD
			const weekIdx = Math.min(
				get(s.turnManager.week) - 1,
				s.seasonWeather.length - 1,
			);
			weather.current = s.seasonWeather[weekIdx];

			// Auto-advance to PLAN after a short pause
			const timer = setTimeout(() => {
				s.turnManager.advancePhase(); // DAWN → PLAN
			}, 1500);
			return () => clearTimeout(timer);
		}

		if (phase === 'DUSK') {
			// Simulation tick has already run (via onPhaseChange callback)
			// Use untrack to prevent ecsTick from becoming a dependency of
			// this effect — otherwise the read-modify-write of ecsTick++
			// re-triggers the effect while phase is still DUSK, creating an
			// infinite loop that cancels the setTimeout on every iteration
			// and freezes the game.
			untrack(() => ecsTick++);

			// Auto-advance to ADVANCE after a short pause
			const timer = setTimeout(() => {
				s.turnManager.advancePhase(); // DUSK → ADVANCE
			}, 1500);
			return () => clearTimeout(timer);
		}

		if (phase === 'ADVANCE') {
			untrack(() => ecsTick++);
			const advResult = get(s.advanceResult$);
			if (advResult?.runEnded) {
				console.log('Killing frost! The growing season has ended.', advResult);
			} else {
				s.turnManager.advancePhase(); // ADVANCE → DAWN (increments week)
			}
		}
	});

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

		// Session starts in DAWN — the $effect will auto-advance to PLAN
		// after 1500ms, then the player taps "Begin Work" to enter ACT.

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

		// Spend energy via session (returns false if insufficient)
		if (!session.spendEnergy(1)) return;

		// Dispatch PLANT event through the session's event log
		session.dispatch({
			type: 'PLANT',
			species_id: speciesId,
			plot: [selectedPlot.row, selectedPlot.col],
			week: season.week,
		});

		// Add plant entity via shared factory (includes visual for rendering)
		const instanceSeed = get(session.turnManager.week) * 1000 + selectedPlot.row * 10 + selectedPlot.col;
		session.addPlant(speciesId, selectedPlot.row, selectedPlot.col, { instanceSeed });

		// If energy depleted, spendEnergy auto-transitions to DUSK.
		// The $effect handles DUSK → ADVANCE → DAWN automatically.

		ecsTick++;
		showSeedSelector = false;
		selectedPlot = null;
	}

	// ── Intervene menu state ─────────────────────────────────────────────

	let showInterveneMenu = $state(false);

	/** Plant info snapshot for the currently selected plot, updated reactively. */
	let selectedPlantInfo = $derived.by(() => {
		void ecsTick;
		if (!selectedPlot || !session) return undefined;
		return session.getPlantAt(selectedPlot.row, selectedPlot.col);
	});

	// ── Amendment selector state ────────────────────────────────────────

	let showAmendSelector = $state(false);

	/** All amendments available for soil treatment. */
	let availableAmendments = $derived(getAllAmendments());

	function onSelectAmendment(amendmentId: string) {
		if (!selectedPlot || !session) return;

		const amendment = getAmendment(amendmentId);
		if (!amendment) return;

		// Use the session's validated action which handles energy, event log, and ECS
		const result = session.amendAction(selectedPlot.row, selectedPlot.col, amendment);
		if (!result.ok) return;

		// If energy depleted, spendEnergy auto-transitions to DUSK.
		// The $effect handles DUSK → ADVANCE → DAWN automatically.

		ecsTick++;
		showAmendSelector = false;
		selectedPlot = null;
	}

	// ── Scout picker state ─────────────────────────────────────────────

	let showScoutPicker = $state(false);

	// ── Scout result panel state ───────────────────────────────────────

	let scoutResult = $state<{
		target: 'weather' | 'pests' | 'soil';
		weatherData?: WeekWeather[];
		pestData?: PestEvent[];
		soilData?: SoilState;
	} | null>(null);

	function onSelectScout(target: 'weather' | 'pests' | 'soil') {
		if (!session) return;

		const result = session.scoutAction(target);
		if (!result.ok) return;

		ecsTick++;
		showScoutPicker = false;

		// Populate result data based on target
		const currentWeek = session.getWeek();
		if (target === 'weather') {
			const startIdx = Math.min(currentWeek, session.seasonWeather.length - 1);
			const weatherData = session.seasonWeather.slice(startIdx, startIdx + 3);
			scoutResult = { target, weatherData };
		} else if (target === 'pests') {
			const pestData = session.seasonPests.filter(
				(p) => p.arrival_week >= currentWeek,
			);
			scoutResult = { target, pestData };
		} else if (target === 'soil') {
			// Use the selected plot if available, otherwise default to (0, 0)
			const row = selectedPlot?.row ?? 0;
			const col = selectedPlot?.col ?? 0;
			const soilData = session.getSoil(row, col);
			scoutResult = { target, soilData };
		}
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
			case 'amend': {
				if (!selectedPlot) return;
				showAmendSelector = true;
				break;
			}
			case 'scout': {
				showScoutPicker = true;
				break;
			}
			case 'intervene': {
				showInterveneMenu = true;
				break;
			}
			case 'wait': {
				session.turnManager.endActions(); // ACT → DUSK
				selectedPlot = null;
				break;
			}
		}
	}

	// ── Action toast state ──────────────────────────────────────────────

	let actionToast = $state('');
	let actionToastTimer: ReturnType<typeof setTimeout> | null = null;

	function showActionToast(msg: string) {
		actionToast = msg;
		if (actionToastTimer) clearTimeout(actionToastTimer);
		actionToastTimer = setTimeout(() => {
			actionToast = '';
		}, 2000);
	}

	function onIntervene(action: string) {
		if (!selectedPlot || !session) return;
		const { row, col } = selectedPlot;
		const result = session.interveneAction(action, row, col);
		if (!result.ok) return;

		if (action === 'pull') {
			// Mark the plant entity as dead so it disappears from the grid
			const plants = session.world.with('plotSlot', 'species');
			for (const p of plants) {
				if (p.plotSlot.row === row && p.plotSlot.col === col && !(p as Entity).dead) {
					(p as Entity).dead = true;
					break;
				}
			}
		}

		if (action === 'harvest') {
			// Record a HARVEST event for scoring / meta-progression
			session.dispatch({
				type: 'HARVEST',
				plant_id: `${row},${col}`,
				week: session.getWeek(),
			});
			const species = getSpecies(result.plant.speciesId);
			const name = species?.common_name ?? result.plant.speciesId;
			showActionToast(`Harvested ${name}!`);
		}

		ecsTick++;
		showInterveneMenu = false;
		selectedPlot = null;
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
		{#if turn.phase === 'PLAN'}
			<div class="begin-work-wrapper" transition:fly={{ y: 40, duration: 250 }}>
				<button class="begin-work-btn" onclick={handleBeginWork}>
					Begin Work
				</button>
			</div>
		{/if}
		<ActionToolbar
			{selectedPlot}
			{selectedPlotHasPlant}
			{onAction}
		/>
		{#if actionToast}
			<div class="action-toast" transition:fly={{ y: 20, duration: 150 }}>
				{actionToast}
			</div>
		{/if}
	</footer>
</div>

{#if showSeedSelector}
	<SeedSelector
		species={availableSpecies}
		onSelect={onSelectSeed}
		onClose={() => (showSeedSelector = false)}
	/>
{/if}

{#if showAmendSelector}
	<AmendmentSelector
		amendments={availableAmendments}
		onSelect={onSelectAmendment}
		onClose={() => (showAmendSelector = false)}
	/>
{/if}

{#if showScoutPicker}
	<ScoutPicker
		onSelect={onSelectScout}
		onClose={() => (showScoutPicker = false)}
	/>
{/if}

{#if scoutResult}
	<ScoutResultPanel
		target={scoutResult.target}
		weatherData={scoutResult.weatherData}
		pestData={scoutResult.pestData}
		soilData={scoutResult.soilData}
		onClose={() => (scoutResult = null)}
	/>
{/if}

{#if showInterveneMenu && selectedPlantInfo}
	<InterveneMenu
		plantInfo={selectedPlantInfo}
		onSelect={onIntervene}
		onClose={() => (showInterveneMenu = false)}
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
		position: relative;
		border-top: 1px solid rgba(0, 0, 0, 0.08);
		flex-shrink: 0;
	}

	.begin-work-wrapper {
		display: flex;
		justify-content: center;
		padding: 8px 12px 12px;
	}

	.begin-work-btn {
		padding: 10px 32px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		background: rgba(76, 175, 80, 0.85);
		color: #fff;
		font-size: 15px;
		font-weight: 600;
		font-family: monospace;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.begin-work-btn:hover {
		background: rgba(76, 175, 80, 1);
	}

	.begin-work-btn:active {
		transform: scale(0.96);
	}

	.action-toast {
		position: absolute;
		top: -36px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		font-size: 13px;
		font-family: monospace;
		padding: 5px 14px;
		border-radius: 12px;
		white-space: nowrap;
		pointer-events: none;
		z-index: 10;
	}
</style>
