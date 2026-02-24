<script lang="ts">
	import AnimatedPlant from '$lib/render/AnimatedPlant.svelte';
	import { getAllSpecies } from '$lib/data/index.js';
	import { SEASON_PALETTES } from '$lib/render/palette.js';
	import { createWindState, updateWind, type WindState } from '$lib/render/animation.js';
	import type { PlantSpecies, GrowthStageId } from '$lib/data/types.js';

	// ── Species setup ────────────────────────────────────────────────────────────
	// Use available species, filling remaining slots with tomato at different seeds.

	const allSpecies = getAllSpecies();
	const GRID_SIZE = 9;

	interface PlantSlot {
		species: PlantSpecies;
		instanceSeed: number;
		stress: number;
	}

	function buildSlots(): PlantSlot[] {
		const slots: PlantSlot[] = [];
		for (let i = 0; i < GRID_SIZE; i++) {
			const species = allSpecies[i % allSpecies.length] ?? allSpecies[0];
			slots.push({
				species,
				instanceSeed: 1000 + i * 7777,
				stress: 0,
			});
		}
		return slots;
	}

	let slots = $state(buildSlots());
	let selectedIndex = $state<number | null>(null);
	let selectedStress = $state(0);

	// Sync stress slider with selected plant
	$effect(() => {
		if (selectedIndex !== null) {
			selectedStress = slots[selectedIndex].stress;
		}
	});

	function setStressOnSelected(value: number) {
		if (selectedIndex === null) return;
		slots[selectedIndex].stress = value;
		selectedStress = value;
	}

	// ── Animation controls ───────────────────────────────────────────────────────

	let windDirection = $state(0); // degrees 0-360
	let windStrength = $state(0.5); // 0-1
	let gustsEnabled = $state(true);
	let speedMultiplier = $state(1); // 0.5, 1, 2
	let stage = $state<GrowthStageId>('vegetative');
	let growthProgress = $state(0.65);
	const palette = SEASON_PALETTES.summer;

	// ── Animation loop ───────────────────────────────────────────────────────────

	let windState = $state<WindState>(createWindState());
	let timeMs = $state(0);
	let fps = $state(0);

	let animFrameId = 0;
	let lastFrameTime = 0;
	let frameCount = 0;
	let fpsAccumulator = 0;

	// Plant refs for triggering harvest
	let plantRefs: (ReturnType<typeof AnimatedPlant> | undefined)[] = $state(
		Array(GRID_SIZE).fill(undefined),
	);

	function tick(now: number) {
		if (lastFrameTime === 0) lastFrameTime = now;
		const rawDelta = now - lastFrameTime;
		lastFrameTime = now;

		const delta = rawDelta * speedMultiplier;

		// FPS counter
		frameCount++;
		fpsAccumulator += rawDelta;
		if (fpsAccumulator >= 1000) {
			fps = Math.round((frameCount * 1000) / fpsAccumulator);
			frameCount = 0;
			fpsAccumulator = 0;
		}

		// Update wind - apply manual direction/strength overrides
		let newWind = updateWind(windState, delta);

		// Override angle and strength from sliders
		const dirRad = (windDirection * Math.PI) / 180;
		newWind = {
			...newWind,
			angle: dirRad,
			strength: windStrength,
			// Suppress gusts if disabled
			gustRemaining: gustsEnabled ? newWind.gustRemaining : 0,
			gustTimer: gustsEnabled ? newWind.gustTimer : 99999,
		};

		// When gusts are enabled and one fires, reflect the boost in strength
		if (gustsEnabled && newWind.gustRemaining > 0) {
			newWind = {
				...newWind,
				strength: Math.min(1, windStrength + 0.3),
			};
		}

		windState = newWind;
		timeMs += delta;

		animFrameId = requestAnimationFrame(tick);
	}

	$effect(() => {
		animFrameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(animFrameId);
	});

	// ── Actions ──────────────────────────────────────────────────────────────────

	function triggerHarvestOnSelected() {
		if (selectedIndex === null) return;
		const ref = plantRefs[selectedIndex];
		if (ref) ref.triggerHarvest();
	}

	// SVG viewBox sizing (matches plant-lab)
	const viewBoxW = 80;
	const viewBoxH = 60;
</script>

<svelte:head>
	<title>Animation Lab</title>
</svelte:head>

<div class="lab">
	<!-- Controls panel -->
	<div class="controls">
		<h1>Animation Lab</h1>

		<fieldset>
			<legend>Wind</legend>
			<label>
				Direction: {windDirection}°
				<input type="range" min="0" max="360" step="1" bind:value={windDirection} />
			</label>
			<label>
				Strength: {windStrength.toFixed(2)}
				<input type="range" min="0" max="1" step="0.01" bind:value={windStrength} />
			</label>
			<label class="checkbox-row">
				<input type="checkbox" bind:checked={gustsEnabled} />
				Gusts
			</label>
		</fieldset>

		<fieldset>
			<legend>Plant</legend>
			<label>
				Growth Stage
				<select bind:value={stage}>
					{#each ['seed', 'germination', 'seedling', 'vegetative', 'flowering', 'fruiting', 'senescence'] as stg}
						<option value={stg}>{stg}</option>
					{/each}
				</select>
			</label>
			<label>
				Growth Progress: {growthProgress.toFixed(2)}
				<input type="range" min="0" max="1" step="0.01" bind:value={growthProgress} />
			</label>
		</fieldset>

		<fieldset>
			<legend>Selected Plant {selectedIndex !== null ? `(#${selectedIndex})` : '(none)'}</legend>
			{#if selectedIndex !== null}
				<label>
					Stress: {selectedStress.toFixed(2)}
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={selectedStress}
						oninput={(e) => setStressOnSelected(Number(e.currentTarget.value))}
					/>
				</label>
				<button onclick={triggerHarvestOnSelected}>Trigger Harvest</button>
			{:else}
				<p class="hint">Click a plant to select it</p>
			{/if}
		</fieldset>

		<fieldset>
			<legend>Speed</legend>
			<div class="speed-buttons">
				<button class:active={speedMultiplier === 0.5} onclick={() => (speedMultiplier = 0.5)}>
					0.5x
				</button>
				<button class:active={speedMultiplier === 1} onclick={() => (speedMultiplier = 1)}>
					1x
				</button>
				<button class:active={speedMultiplier === 2} onclick={() => (speedMultiplier = 2)}>
					2x
				</button>
			</div>
		</fieldset>
	</div>

	<!-- Plant grid -->
	<div class="grid-area">
		<div class="fps-counter" class:fps-warning={fps > 0 && fps < 50}>
			{fps} FPS
		</div>

		<div class="grid">
			{#each slots as slot, i}
				<button
					class="cell"
					class:selected={selectedIndex === i}
					onclick={() => (selectedIndex = selectedIndex === i ? null : i)}
				>
					<svg
						viewBox="{-viewBoxW / 2} {-viewBoxH} {viewBoxW} {viewBoxH}"
						xmlns="http://www.w3.org/2000/svg"
					>
						<!-- Ground line -->
						<line
							x1={-viewBoxW / 2}
							y1="0"
							x2={viewBoxW / 2}
							y2="0"
							stroke={palette.soil}
							stroke-width="0.5"
						/>
						<AnimatedPlant
							bind:this={plantRefs[i]}
							visualParams={slot.species.visual}
							{growthProgress}
							stress={slot.stress}
							instanceSeed={slot.instanceSeed}
							{windState}
							{timeMs}
							{stage}
							{palette}
						/>
					</svg>
					<span class="cell-label">{slot.species.common_name}</span>
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.lab {
		display: grid;
		grid-template-columns: minmax(240px, 300px) 1fr;
		height: 100vh;
		font-family: monospace;
		font-size: 13px;
		color: #333;
		background: #fafafa;
	}

	/* ── Controls ────────────────────────────────────────────────────────── */

	.controls {
		padding: 16px;
		overflow-y: auto;
		background: #f5f5f5;
		border-right: 1px solid #ddd;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.controls h1 {
		font-size: 18px;
		margin: 0 0 4px 0;
	}

	fieldset {
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 8px 12px;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	legend {
		font-weight: 600;
		font-size: 12px;
		padding: 0 4px;
	}

	.controls label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 600;
	}

	.controls select,
	.controls input[type='range'] {
		width: 100%;
	}

	.controls button {
		padding: 6px 12px;
		cursor: pointer;
		font-family: monospace;
		border-radius: 4px;
		border: 1px solid #ddd;
		background: #efefef;
	}

	.controls button:hover {
		background: #e0e0e0;
	}

	.checkbox-row {
		flex-direction: row !important;
		align-items: center;
	}

	.checkbox-row input[type='checkbox'] {
		width: auto;
	}

	.hint {
		margin: 0;
		color: #999;
		font-style: italic;
		font-weight: 400;
	}

	.speed-buttons {
		display: flex;
		gap: 4px;
	}

	.speed-buttons button {
		flex: 1;
		padding: 6px 0;
		font-size: 12px;
	}

	.speed-buttons button.active {
		background: #333;
		color: #fff;
		border-color: #333;
	}

	/* ── Grid area ───────────────────────────────────────────────────────── */

	.grid-area {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		overflow: auto;
	}

	.fps-counter {
		position: absolute;
		top: 12px;
		right: 16px;
		font-size: 16px;
		font-weight: 700;
		padding: 4px 10px;
		background: rgba(0, 0, 0, 0.7);
		color: #4caf50;
		border-radius: 4px;
		z-index: 10;
		font-variant-numeric: tabular-nums;
	}

	.fps-counter.fps-warning {
		color: #f44336;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(3, 1fr);
		gap: 8px;
		width: min(80vh, 80vw, 700px);
		height: min(80vh, 80vw, 700px);
	}

	.cell {
		position: relative;
		border: 2px solid transparent;
		border-radius: 8px;
		background: #fffde7;
		cursor: pointer;
		padding: 4px;
		display: flex;
		flex-direction: column;
		align-items: center;
		font-family: monospace;
	}

	.cell:hover {
		border-color: #bbb;
	}

	.cell.selected {
		border-color: #1976d2;
		box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3);
	}

	.cell svg {
		width: 100%;
		flex: 1;
		display: block;
	}

	.cell-label {
		font-size: 10px;
		color: #666;
		padding: 2px 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	/* ── Responsive ──────────────────────────────────────────────────────── */

	@media (max-width: 768px) {
		.lab {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			height: auto;
			min-height: 100vh;
		}

		.controls {
			border-right: 0;
			border-bottom: 1px solid #ddd;
		}

		.grid {
			width: min(90vw, 500px);
			height: min(90vw, 500px);
		}
	}
</style>
