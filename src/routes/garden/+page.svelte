<script lang="ts">
	import { onMount } from 'svelte';
	import { World } from 'miniplex';
	import AnimatedPlant from '$lib/render/AnimatedPlant.svelte';
	import {
		SEASON_PALETTES,
		lerpColor,
		type SeasonId,
		type SeasonPalette,
	} from '$lib/render/palette.js';
	import { createRng, type SeededRng } from '$lib/engine/rng.js';
	import { runTick, type SimulationConfig } from '$lib/engine/simulation.js';
	import {
		generateSeasonWeather,
		type ClimateZone,
		type WeekWeather,
	} from '$lib/engine/weather-gen.js';
	import { getSpecies, getAllSpecies, getAllSpeciesIds } from '$lib/data/index.js';
	import type { Entity, SoilState } from '$lib/engine/ecs/components.js';
	import type { GameWorld } from '$lib/engine/ecs/world.js';
	import type { PlantSpecies, GrowthStageId } from '$lib/data/types.js';

	// ── Constants ───────────────────────────────────────────────────────

	const GRID_ROWS = 3;
	const GRID_COLS = 3;
	const CELL_SIZE = 100; // SVG units per plot cell
	const GRID_W = GRID_COLS * CELL_SIZE;
	const GRID_H = GRID_ROWS * CELL_SIZE;
	const SEASON_WEEKS = 30;

	// ── Zone data (inline — only one zone exists) ───────────────────────

	const ZONE_8A: ClimateZone = {
		id: 'zone_8a',
		name: 'USDA Zone 8a — Pacific Northwest',
		avg_temps_by_week: [
			10, 11, 12, 13, 14, 16, 18, 20, 22, 24,
			26, 27, 28, 29, 29, 29, 28, 27, 26, 24,
			22, 20, 18, 16, 14, 12, 10, 9, 8, 7,
		],
		temp_variance: 3.0,
		precip_pattern: 'winter_wet',
		frost_free_weeks: [6, 24],
		first_frost_week_avg: 25,
		humidity_baseline: 0.65,
		special_event_weights: {
			heatwave: 0.03,
			drought: 0.02,
			heavy_rain: 0.04,
			hail: 0.015,
			early_frost: 0.02,
			indian_summer: 0.03,
		},
	};

	// ── Season mapping ──────────────────────────────────────────────────

	function weekToSeason(week: number): { id: SeasonId; name: string } {
		if (week < 4) return { id: 'early_spring', name: 'Early Spring' };
		if (week < 8) return { id: 'late_spring', name: 'Late Spring' };
		if (week < 14) return { id: 'summer', name: 'Summer' };
		if (week < 18) return { id: 'late_summer', name: 'Late Summer' };
		if (week < 22) return { id: 'early_fall', name: 'Early Fall' };
		if (week < 26) return { id: 'late_fall', name: 'Late Fall' };
		return { id: 'frost', name: 'Frost' };
	}

	function weatherIcon(weather: WeekWeather): string {
		if (weather.frost) return '\u2744'; // snowflake
		if (weather.special?.type === 'heatwave') return '\u{1F525}'; // fire
		if (weather.special?.type === 'heavy_rain') return '\u{1F32A}'; // tornado/storm
		if (weather.special?.type === 'hail') return '\u{1F9CA}'; // ice
		if (weather.precipitation_mm > 15) return '\u{1F327}'; // rain
		if (weather.precipitation_mm > 5) return '\u26C5'; // partly cloudy
		return '\u2600'; // sun
	}

	// ── ECS World Setup ─────────────────────────────────────────────────

	const seed = 42;
	let rng: SeededRng = createRng(seed);
	let world: GameWorld = new World<Entity>();
	let currentWeek = $state(0);
	let weatherSchedule: WeekWeather[] = generateSeasonWeather(ZONE_8A, seed);

	// Initialize 3x3 plot grid with soil entities
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

	function createDefaultSoil(row: number, col: number): SoilState {
		// Vary soil slightly per plot for visual interest
		const plotRng = createRng(seed + row * 10 + col);
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

	initPlots();

	// ── Reactive queries ────────────────────────────────────────────────

	// We use a tick counter to force Svelte reactivity on ECS queries
	let ecsTick = $state(0);

	function getPlots() {
		// Access ecsTick to create reactive dependency
		void ecsTick;
		const plots: Array<{
			row: number;
			col: number;
			soil: SoilState;
			mulched: boolean;
		}> = [];
		for (const e of world.with('plotSlot', 'soil')) {
			plots.push({
				row: e.plotSlot.row,
				col: e.plotSlot.col,
				soil: e.soil,
				mulched: (e.amendments?.pending ?? []).some((a) => a.type === 'mulch'),
			});
		}
		return plots;
	}

	interface PlantView {
		row: number;
		col: number;
		speciesId: string;
		species: PlantSpecies;
		growth: { progress: number; stage: GrowthStageId; rate_modifier: number };
		health: { value: number; stress: number };
		instanceSeed: number;
	}

	function getPlants(): PlantView[] {
		void ecsTick;
		const result: PlantView[] = [];
		for (const e of world.with('plotSlot', 'species', 'growth', 'health', 'visual')) {
			if (e.dead) continue;
			const sp = getSpecies(e.species.speciesId);
			if (!sp) continue;
			result.push({
				row: e.plotSlot.row,
				col: e.plotSlot.col,
				speciesId: e.species.speciesId,
				species: sp,
				growth: e.growth,
				health: e.health,
				instanceSeed: e.visual.instanceSeed,
			});
		}
		return result;
	}

	let plots = $derived(getPlots());
	let plantViews = $derived(getPlants());

	// ── Season / Weather derived state ──────────────────────────────────

	let season = $derived(weekToSeason(currentWeek));
	let palette = $derived(SEASON_PALETTES[season.id]);
	let currentWeather = $derived(
		currentWeek < weatherSchedule.length
			? weatherSchedule[currentWeek]
			: weatherSchedule[weatherSchedule.length - 1],
	);
	let seasonProgress = $derived(currentWeek / (SEASON_WEEKS - 1));

	// ── Selection state ─────────────────────────────────────────────────

	let selectedPlot = $state<{ row: number; col: number } | null>(null);
	let selectedPlant = $state<string | null>(null); // speciesId@row,col

	function selectPlot(row: number, col: number) {
		const key = `${row},${col}`;
		const currentKey = selectedPlot ? `${selectedPlot.row},${selectedPlot.col}` : '';
		if (currentKey === key) {
			selectedPlot = null;
		} else {
			selectedPlot = { row, col };
		}
		selectedPlant = null;
	}

	function selectPlant(speciesId: string, row: number, col: number, event: MouseEvent) {
		event.stopPropagation();
		const key = `${speciesId}@${row},${col}`;
		if (selectedPlant === key) {
			selectedPlant = null;
		} else {
			selectedPlant = key;
			selectedPlot = { row, col };
		}
	}

	function isPlotSelected(row: number, col: number): boolean {
		return selectedPlot?.row === row && selectedPlot?.col === col;
	}

	function isPlantSelected(speciesId: string, row: number, col: number): boolean {
		return selectedPlant === `${speciesId}@${row},${col}`;
	}

	// ── Zoom state ──────────────────────────────────────────────────────

	type ZoomLevel = 'garden' | 'plot' | 'plant';
	let zoomLevel = $state<ZoomLevel>('garden');
	let zoomTarget = $state<{ row: number; col: number }>({ row: 1, col: 1 }); // center
	let animatingZoom = $state(false);

	// Smooth viewBox interpolation
	let currentViewBox = $state({
		x: 0,
		y: 0,
		w: GRID_W,
		h: GRID_H,
	});

	function getTargetViewBox(level: ZoomLevel, target: { row: number; col: number }) {
		switch (level) {
			case 'garden':
				return { x: 0, y: 0, w: GRID_W, h: GRID_H };
			case 'plot': {
				const cx = target.col * CELL_SIZE + CELL_SIZE / 2;
				const cy = target.row * CELL_SIZE + CELL_SIZE / 2;
				const hw = CELL_SIZE * 1.2;
				const hh = CELL_SIZE * 1.2;
				return { x: cx - hw / 2, y: cy - hh / 2, w: hw, h: hh };
			}
			case 'plant': {
				const cx = target.col * CELL_SIZE + CELL_SIZE / 2;
				const cy = target.row * CELL_SIZE + CELL_SIZE / 2;
				const hw = CELL_SIZE * 0.6;
				const hh = CELL_SIZE * 0.6;
				return { x: cx - hw / 2, y: cy - hh / 2, w: hw, h: hh };
			}
		}
	}

	function animateViewBox(target: typeof currentViewBox) {
		animatingZoom = true;
		const start = { ...currentViewBox };
		const duration = 400;
		const startTime = performance.now();

		function step(now: number) {
			const elapsed = now - startTime;
			const t = Math.min(1, elapsed / duration);
			// ease-out cubic
			const ease = 1 - Math.pow(1 - t, 3);

			currentViewBox = {
				x: start.x + (target.x - start.x) * ease,
				y: start.y + (target.y - start.y) * ease,
				w: start.w + (target.w - start.w) * ease,
				h: start.h + (target.h - start.h) * ease,
			};

			if (t < 1) {
				requestAnimationFrame(step);
			} else {
				animatingZoom = false;
			}
		}
		requestAnimationFrame(step);
	}

	function setZoom(level: ZoomLevel, target?: { row: number; col: number }) {
		if (target) zoomTarget = target;
		zoomLevel = level;
		animateViewBox(getTargetViewBox(level, target ?? zoomTarget));
	}

	// ── Gesture handling ────────────────────────────────────────────────

	let svgEl: SVGSVGElement | undefined = $state();
	let lastPinchDist = 0;
	let gestureActive = false;

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.deltaY > 0) {
			// zoom out
			if (zoomLevel === 'plant') setZoom('plot', zoomTarget);
			else if (zoomLevel === 'plot') setZoom('garden');
		} else {
			// zoom in
			if (zoomLevel === 'garden') {
				const target = selectedPlot ?? { row: 1, col: 1 };
				setZoom('plot', target);
			} else if (zoomLevel === 'plot') {
				setZoom('plant', zoomTarget);
			}
		}
	}

	function getTouchDist(touches: TouchList): number {
		if (touches.length < 2) return 0;
		const dx = touches[0].clientX - touches[1].clientX;
		const dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			gestureActive = true;
			lastPinchDist = getTouchDist(e.touches);
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!gestureActive || e.touches.length < 2) return;
		e.preventDefault();
		const dist = getTouchDist(e.touches);
		const delta = dist - lastPinchDist;

		if (Math.abs(delta) > 30) {
			if (delta > 0) {
				// pinch out (zoom in)
				if (zoomLevel === 'garden') {
					const target = selectedPlot ?? { row: 1, col: 1 };
					setZoom('plot', target);
				} else if (zoomLevel === 'plot') {
					setZoom('plant', zoomTarget);
				}
			} else {
				// pinch in (zoom out)
				if (zoomLevel === 'plant') setZoom('plot', zoomTarget);
				else if (zoomLevel === 'plot') setZoom('garden');
			}
			lastPinchDist = dist;
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) {
			gestureActive = false;
		}
	}

	// Double-tap to zoom in
	let lastTapTime = 0;
	function handleDoubleTap(row: number, col: number) {
		const now = Date.now();
		if (now - lastTapTime < 300) {
			// double tap
			if (zoomLevel === 'garden') {
				setZoom('plot', { row, col });
			} else if (zoomLevel === 'plot') {
				setZoom('plant', { row, col });
			} else {
				setZoom('garden');
			}
		}
		lastTapTime = now;
	}

	// ── Soil color derivation ───────────────────────────────────────────

	function soilColor(soil: SoilState, seasonPalette: SeasonPalette): string {
		// organic_matter 0..1 drives darkness. High organic = dark rich soil.
		// Low organic / high compaction = lighter sandy look.
		const baseSoil = seasonPalette.soil;
		const darkSoil = '#2e1a0e';
		const lightSoil = '#c8b99a';

		// Blend toward dark for high organic matter
		const organicBlend = lerpColor(baseSoil, darkSoil, soil.organic_matter * 0.6);

		// Blend toward light for low organic + high compaction (depleted)
		const depletion = Math.max(0, (1 - soil.organic_matter) * 0.3 + soil.compaction * 0.2);
		const finalSoil = lerpColor(organicBlend, lightSoil, depletion);

		// Moisture darkens slightly
		return lerpColor(finalSoil, darkSoil, soil.moisture * 0.15);
	}

	function mulchPattern(row: number, col: number): string {
		return `mulch-${row}-${col}`;
	}

	// ── Plant sizing ────────────────────────────────────────────────────

	function plantScale(species: PlantSpecies): number {
		// Scale based on max_spread relative to cell size
		// max_spread is in cm; we map ~60cm to fill ~60% of cell
		const spread = species.growth.max_spread_cm;
		const targetSvgSize = CELL_SIZE * 0.6;
		// The plant SVG renders from origin, typically ~50-80 SVG units tall
		// We scale so max_spread maps to targetSvgSize
		return targetSvgSize / Math.max(spread, 30);
	}

	// ── Simulation advance ──────────────────────────────────────────────

	function advanceWeek() {
		if (currentWeek >= SEASON_WEEKS - 1) return;

		const weather = weatherSchedule[currentWeek];
		const config: SimulationConfig = {
			world,
			rng,
			speciesLookup: (id: string) => getSpecies(id),
			firstFrostWeekAvg: ZONE_8A.first_frost_week_avg,
		};

		runTick(config, weather, currentWeek);
		currentWeek++;
		ecsTick++;
	}

	// ── Dev panel: add plant ────────────────────────────────────────────

	let devSpeciesId = $state(getAllSpeciesIds()[0] ?? '');
	let devPlotRow = $state(0);
	let devPlotCol = $state(0);
	let devPanelOpen = $state(true);

	function devAddPlant() {
		const species = getSpecies(devSpeciesId);
		if (!species) return;

		// Check if a plant already exists at this slot
		const existing = world.with('plotSlot', 'species');
		for (const e of existing) {
			if (e.plotSlot.row === devPlotRow && e.plotSlot.col === devPlotCol) {
				// Remove existing plant first
				world.remove(e);
				break;
			}
		}

		const instanceSeed = Math.floor(Math.random() * 100000);

		world.add({
			plotSlot: { row: devPlotRow, col: devPlotCol },
			species: { speciesId: devSpeciesId },
			growth: {
				progress: 0.1,
				stage: 'seedling' as GrowthStageId,
				rate_modifier: 1.0,
			},
			health: {
				value: 1.0,
				stress: 0,
			},
			visual: {
				params: species.visual,
				instanceSeed,
			},
			harvestState: {
				ripe: false,
				remaining: species.harvest.yield_potential,
				quality: 1.0,
			},
			activeConditions: { conditions: [] },
			companionBuffs: { buffs: [] },
		});

		ecsTick++;
	}

	function devRemovePlant(row: number, col: number) {
		const plants = world.with('plotSlot', 'species');
		for (const e of plants) {
			if (e.plotSlot.row === row && e.plotSlot.col === col) {
				world.remove(e);
				break;
			}
		}
		ecsTick++;
	}

	function devResetWeek() {
		currentWeek = 0;
		rng = createRng(seed);
		weatherSchedule = generateSeasonWeather(ZONE_8A, seed);

		// Rebuild world
		world = new World<Entity>();
		initPlots();
		ecsTick++;
	}

	// ── SVG viewBox string ──────────────────────────────────────────────

	let viewBoxStr = $derived(
		`${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.w} ${currentViewBox.h}`,
	);

	// Available species for dev panel
	let allSpeciesList = getAllSpecies();
</script>

<svelte:head>
	<title>Garden — Perennial</title>
</svelte:head>

<!-- Top Bar -->
<header class="top-bar" style:background={palette.ui_bg}>
	<div class="top-bar-left">
		<span class="week-badge">Week {currentWeek + 1}</span>
		<span class="season-name">{season.name}</span>
	</div>
	<div class="top-bar-center">
		<div class="season-progress-bar">
			<div class="season-progress-fill" style:width="{seasonProgress * 100}%"></div>
		</div>
	</div>
	<div class="top-bar-right">
		<span class="weather-temp">{currentWeather.temp_high_c.toFixed(0)}°/{currentWeather.temp_low_c.toFixed(0)}°</span>
		<span class="weather-icon">{weatherIcon(currentWeather)}</span>
	</div>
</header>

<!-- Garden SVG -->
<div
	class="garden-viewport"
	style:background={palette.sky}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		bind:this={svgEl}
		class="garden-svg"
		viewBox={viewBoxStr}
		preserveAspectRatio="xMidYMid meet"
		role="img"
		aria-label="Garden grid"
		onwheel={handleWheel}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
	>
		<defs>
			<!-- Mulch texture pattern -->
			<pattern id="mulch-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
				<rect width="8" height="8" fill="#5d4037" />
				<circle cx="2" cy="2" r="1.2" fill="#795548" opacity="0.6" />
				<circle cx="6" cy="5" r="1" fill="#4e342e" opacity="0.5" />
				<circle cx="4" cy="7" r="0.8" fill="#6d4c41" opacity="0.4" />
			</pattern>
		</defs>

		<!-- Plot grid -->
		{#each plots as plot (plot.row * GRID_COLS + plot.col)}
			{@const x = plot.col * CELL_SIZE}
			{@const y = plot.row * CELL_SIZE}
			{@const fill = soilColor(plot.soil, palette)}
			{@const selected = isPlotSelected(plot.row, plot.col)}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g
				class="plot-cell"
				onclick={() => { selectPlot(plot.row, plot.col); handleDoubleTap(plot.row, plot.col); }}
			>
				<!-- Soil fill -->
				<rect
					{x}
					{y}
					width={CELL_SIZE}
					height={CELL_SIZE}
					fill={fill}
				/>

				<!-- Mulch overlay -->
				{#if plot.mulched}
					<rect
						{x}
						{y}
						width={CELL_SIZE}
						height={CELL_SIZE}
						fill="url(#mulch-pattern)"
						opacity="0.5"
					/>
				{/if}

				<!-- Grid border -->
				<rect
					{x}
					{y}
					width={CELL_SIZE}
					height={CELL_SIZE}
					fill="none"
					stroke={selected ? palette.accent : 'rgba(0,0,0,0.12)'}
					stroke-width={selected ? 3 : 0.5}
				/>

				<!-- Selection highlight -->
				{#if selected}
					<rect
						x={x + 2}
						y={y + 2}
						width={CELL_SIZE - 4}
						height={CELL_SIZE - 4}
						fill="none"
						stroke={palette.accent}
						stroke-width="1"
						stroke-dasharray="4 2"
						opacity="0.6"
					/>
				{/if}
			</g>
		{/each}

		<!-- Plants -->
		{#each plantViews as pv (`${pv.speciesId}@${pv.row},${pv.col}`)}
			{@const cx = pv.col * CELL_SIZE + CELL_SIZE / 2}
			{@const cy = pv.row * CELL_SIZE + CELL_SIZE * 0.85}
			{@const scale = plantScale(pv.species)}
			{@const plantSelected = isPlantSelected(pv.speciesId, pv.row, pv.col)}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g
				class="plant-slot"
				transform="translate({cx}, {cy}) scale({scale})"
				onclick={(e) => selectPlant(pv.speciesId, pv.row, pv.col, e)}
			>
				{#if plantSelected}
					<circle
						cx="0"
						cy={-pv.species.visual.stem.height[1] * pv.growth.progress * 0.5}
						r={CELL_SIZE * 0.4 / scale}
						fill="none"
						stroke={palette.accent}
						stroke-width={2 / scale}
						stroke-dasharray="{4 / scale} {2 / scale}"
						opacity="0.5"
					/>
				{/if}

				<AnimatedPlant
					params={pv.species.visual}
					growthProgress={pv.growth.progress}
					stress={pv.health.stress}
					instanceSeed={pv.instanceSeed}
					stage={pv.growth.stage}
				/>
			</g>
		{/each}
	</svg>

	<!-- Zoom controls -->
	<div class="zoom-controls">
		<button
			class="zoom-btn"
			class:active={zoomLevel === 'garden'}
			onclick={() => setZoom('garden')}
			title="Garden overview"
		>
			&#9638;
		</button>
		<button
			class="zoom-btn"
			class:active={zoomLevel === 'plot'}
			onclick={() => setZoom('plot', selectedPlot ?? zoomTarget)}
			title="Plot focus"
		>
			&#9635;
		</button>
		<button
			class="zoom-btn"
			class:active={zoomLevel === 'plant'}
			onclick={() => setZoom('plant', selectedPlot ?? zoomTarget)}
			title="Plant detail"
		>
			&#9673;
		</button>
	</div>
</div>

<!-- Dev Panel -->
{#if devPanelOpen}
	<aside class="dev-panel">
		<div class="dev-header">
			<h3>Dev Panel</h3>
			<button class="dev-close" onclick={() => (devPanelOpen = false)}>&#10005;</button>
		</div>

		<div class="dev-section">
			<strong>Simulation</strong>
			<div class="dev-row">
				<button onclick={advanceWeek} disabled={currentWeek >= SEASON_WEEKS - 1}>
					Advance Week
				</button>
				<button onclick={devResetWeek}>Reset</button>
			</div>
			<div class="dev-info">
				Week {currentWeek + 1}/{SEASON_WEEKS} &middot; {season.name}
				<br />
				{currentWeather.temp_high_c.toFixed(1)}°C / {currentWeather.temp_low_c.toFixed(1)}°C
				&middot; {currentWeather.precipitation_mm.toFixed(0)}mm
				{#if currentWeather.frost}
					&middot; FROST
				{/if}
				{#if currentWeather.special}
					<br />Event: {currentWeather.special.type}
				{/if}
			</div>
		</div>

		<div class="dev-section">
			<strong>Add Plant</strong>
			<label>
				Species
				<select bind:value={devSpeciesId}>
					{#each allSpeciesList as sp}
						<option value={sp.id}>{sp.common_name}</option>
					{/each}
				</select>
			</label>
			<div class="dev-row">
				<label>
					Row
					<select bind:value={devPlotRow}>
						{#each Array(GRID_ROWS) as _, i}
							<option value={i}>{i}</option>
						{/each}
					</select>
				</label>
				<label>
					Col
					<select bind:value={devPlotCol}>
						{#each Array(GRID_COLS) as _, i}
							<option value={i}>{i}</option>
						{/each}
					</select>
				</label>
			</div>
			<button onclick={devAddPlant}>Plant</button>
		</div>

		<div class="dev-section">
			<strong>Plants</strong>
			{#each plantViews as pv}
				<div class="dev-plant-entry">
					<span>{pv.species.common_name} [{pv.row},{pv.col}]</span>
					<br />
					<span class="dev-detail">
						{pv.growth.stage} &middot; {(pv.growth.progress * 100).toFixed(0)}%
						&middot; HP {(pv.health.value * 100).toFixed(0)}
						&middot; Stress {(pv.health.stress * 100).toFixed(0)}
					</span>
					<button class="dev-remove" onclick={() => devRemovePlant(pv.row, pv.col)}>
						&#10005;
					</button>
				</div>
			{/each}
			{#if plantViews.length === 0}
				<span class="dev-detail">No plants yet</span>
			{/if}
		</div>

		<div class="dev-section">
			<strong>Selected Plot</strong>
			{#if selectedPlot}
				{@const sp = plots.find(
					(p) => p.row === selectedPlot!.row && p.col === selectedPlot!.col,
				)}
				{#if sp}
					<div class="dev-detail">
						[{sp.row},{sp.col}] pH {sp.soil.ph.toFixed(1)}
						&middot; N {(sp.soil.nitrogen * 100).toFixed(0)}
						&middot; P {(sp.soil.phosphorus * 100).toFixed(0)}
						&middot; K {(sp.soil.potassium * 100).toFixed(0)}
						<br />
						Organic {(sp.soil.organic_matter * 100).toFixed(0)}%
						&middot; Moisture {(sp.soil.moisture * 100).toFixed(0)}%
						&middot; Temp {sp.soil.temperature_c.toFixed(1)}°C
					</div>
				{/if}
			{:else}
				<span class="dev-detail">None selected</span>
			{/if}
		</div>
	</aside>
{:else}
	<button class="dev-toggle" onclick={() => (devPanelOpen = true)}>Dev</button>
{/if}

<style>
	/* ── Top Bar ──────────────────────────────────────────────────── */

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		font-family: monospace;
		font-size: 14px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		position: relative;
		z-index: 10;
	}

	.top-bar-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.week-badge {
		font-weight: 700;
		background: rgba(0, 0, 0, 0.08);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.season-name {
		color: #555;
	}

	.top-bar-center {
		flex: 1;
		max-width: 200px;
		margin: 0 16px;
	}

	.season-progress-bar {
		height: 6px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}

	.season-progress-fill {
		height: 100%;
		background: #66bb6a;
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.top-bar-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.weather-temp {
		font-weight: 600;
	}

	.weather-icon {
		font-size: 18px;
	}

	/* ── Garden Viewport ─────────────────────────────────────────── */

	.garden-viewport {
		flex: 1;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: none;
	}

	.garden-svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.plot-cell {
		cursor: pointer;
	}

	.plant-slot {
		cursor: pointer;
	}

	/* ── Zoom Controls ───────────────────────────────────────────── */

	.zoom-controls {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		z-index: 20;
	}

	.zoom-btn {
		width: 32px;
		height: 32px;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.85);
		cursor: pointer;
		font-size: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
	}

	.zoom-btn:hover {
		background: rgba(255, 255, 255, 1);
	}

	.zoom-btn.active {
		background: rgba(0, 0, 0, 0.1);
		border-color: rgba(0, 0, 0, 0.4);
	}

	/* ── Dev Panel ───────────────────────────────────────────────── */

	.dev-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 280px;
		background: #1e1e1e;
		color: #d4d4d4;
		font-family: monospace;
		font-size: 12px;
		padding: 12px;
		overflow-y: auto;
		z-index: 100;
		border-left: 2px solid #333;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.dev-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.dev-header h3 {
		margin: 0;
		font-size: 14px;
		color: #9cdcfe;
	}

	.dev-close {
		background: none;
		border: none;
		color: #d4d4d4;
		cursor: pointer;
		font-size: 16px;
	}

	.dev-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-top: 1px solid #333;
		padding-top: 8px;
	}

	.dev-section strong {
		color: #c586c0;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.dev-section label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: #9cdcfe;
		font-size: 11px;
	}

	.dev-section select {
		background: #2d2d2d;
		color: #d4d4d4;
		border: 1px solid #444;
		padding: 4px;
		border-radius: 3px;
		font-family: monospace;
		font-size: 11px;
	}

	.dev-section button {
		padding: 4px 8px;
		background: #2d2d2d;
		color: #d4d4d4;
		border: 1px solid #444;
		border-radius: 3px;
		cursor: pointer;
		font-family: monospace;
		font-size: 11px;
	}

	.dev-section button:hover {
		background: #3d3d3d;
	}

	.dev-section button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.dev-row {
		display: flex;
		gap: 6px;
	}

	.dev-info {
		font-size: 11px;
		line-height: 1.4;
		color: #888;
	}

	.dev-detail {
		font-size: 10px;
		color: #888;
		line-height: 1.3;
	}

	.dev-plant-entry {
		position: relative;
		padding: 4px;
		background: #2a2a2a;
		border-radius: 3px;
	}

	.dev-remove {
		position: absolute;
		right: 4px;
		top: 4px;
		background: none !important;
		border: none !important;
		color: #e57373 !important;
		cursor: pointer;
		font-size: 12px;
		padding: 0 !important;
	}

	.dev-toggle {
		position: fixed;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		background: #1e1e1e;
		color: #9cdcfe;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 8px 6px;
		cursor: pointer;
		font-family: monospace;
		font-size: 10px;
		writing-mode: vertical-rl;
		z-index: 100;
	}

	/* ── Layout ──────────────────────────────────────────────────── */

	:global(body) {
		margin: 0;
		overflow: hidden;
	}

	:global(html, body) {
		height: 100%;
	}

	:global(#svelte) {
		height: 100%;
	}
</style>
