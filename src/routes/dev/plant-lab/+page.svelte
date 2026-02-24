<script lang="ts">
	import PlantRenderer from '$lib/render/PlantRenderer.svelte';
	import { getAllSpecies } from '$lib/data/index.js';
	import { SEASON_PALETTES, type SeasonId } from '$lib/render/palette.js';
	import type { GrowthStageId, PlantSpecies } from '$lib/data/types.js';

	const allSpecies = getAllSpecies();
	const seasonIds = Object.keys(SEASON_PALETTES) as SeasonId[];
	const stages: GrowthStageId[] = [
		'seed', 'germination', 'seedling', 'vegetative', 'flowering', 'fruiting', 'senescence',
	];

	let selectedSpeciesId = $state(allSpecies[0]?.id ?? '');
	let growthProgress = $state(0.5);
	let stress = $state(0);
	let selectedSeason = $state<SeasonId>('summer');
	let selectedStage = $state<GrowthStageId>('vegetative');
	let showDiseaseOverlay = $state(false);
	let instanceSeed = $state(Math.floor(Math.random() * 100000));
	let showLiveParams = $state(false);

	let species = $derived(allSpecies.find((s) => s.id === selectedSpeciesId) ?? allSpecies[0]);
	let palette = $derived(SEASON_PALETTES[selectedSeason]);

	// Compute effective stress: when disease overlay is on, add 0.4 stress
	let effectiveStress = $derived(Math.min(1, stress + (showDiseaseOverlay ? 0.4 : 0)));

	// Build the interpolated params snapshot for the JSON panel
	let paramsSnapshot = $derived.by(() => {
		if (!species) return null;
		return {
			species: species.id,
			instanceSeed,
			growthProgress: Math.round(growthProgress * 100) / 100,
			stress: Math.round(effectiveStress * 100) / 100,
			stage: selectedStage,
			season: selectedSeason,
			diseaseOverlay: showDiseaseOverlay,
			visual: species.visual,
		};
	});

	function randomizeSeed() {
		instanceSeed = Math.floor(Math.random() * 100000);
	}

	// SVG viewBox sizing: the plant grows from origin upward (-Y)
	// We give generous room: 60 wide, up to ~50 tall
	const viewBoxW = 80;
	const viewBoxH = 60;
</script>

<svelte:head>
	<title>Plant Lab</title>
</svelte:head>

<div class="lab">
	<div class="controls">
		<h1>Plant Lab</h1>

		<label>
			Species
			<select bind:value={selectedSpeciesId}>
				{#each allSpecies as sp}
					<option value={sp.id}>{sp.common_name} ({sp.id})</option>
				{/each}
			</select>
		</label>

		<label>
			Growth Stage
			<select bind:value={selectedStage}>
				{#each stages as stg}
					<option value={stg}>{stg}</option>
				{/each}
			</select>
		</label>

		<label>
			Growth Progress: {growthProgress.toFixed(2)}
			<input type="range" min="0" max="1" step="0.01" bind:value={growthProgress} />
		</label>

		<label>
			Stress: {stress.toFixed(2)}
			<input type="range" min="0" max="1" step="0.01" bind:value={stress} />
		</label>

		<label>
			Season
			<select bind:value={selectedSeason}>
				{#each seasonIds as sid}
					<option value={sid}>{sid}</option>
				{/each}
			</select>
		</label>

		<label class="checkbox-row">
			<input type="checkbox" bind:checked={showDiseaseOverlay} />
			Disease overlay (+0.4 stress)
		</label>

		<label>
			Instance Seed: {instanceSeed}
			<button onclick={randomizeSeed}>Randomize Seed</button>
		</label>

		<div class="season-preview" style:background={palette.sky}>
			<span class="swatch" style:background={palette.foliage_base}></span>
			<span class="swatch" style:background={palette.soil}></span>
			<span class="swatch" style:background={palette.accent}></span>
		</div>
	</div>

	<div class="canvas" style:background={palette.sky}>
		{#if species}
			<svg
				width="500"
				height="500"
				viewBox="{-viewBoxW / 2} {-viewBoxH} {viewBoxW} {viewBoxH}"
				xmlns="http://www.w3.org/2000/svg"
			>
				<!-- Ground line -->
				<line x1={-viewBoxW / 2} y1="0" x2={viewBoxW / 2} y2="0" stroke={palette.soil} stroke-width="0.5" />

				<!-- Plant, rooted at origin -->
				<PlantRenderer
					params={species.visual}
					growthProgress={growthProgress}
					stress={effectiveStress}
					{instanceSeed}
					stage={selectedStage}
				/>
			</svg>
		{/if}
	</div>

	<div class="json-panel">
		<div class="json-panel-header">
			<h2>Live Params</h2>
			<button
				type="button"
				class="json-toggle"
				onclick={() => (showLiveParams = !showLiveParams)}
				aria-expanded={showLiveParams}
			>
				{showLiveParams ? 'Hide' : 'Show'} JSON
			</button>
		</div>
		{#if showLiveParams}
			<pre>{JSON.stringify(paramsSnapshot, null, 2)}</pre>
		{/if}
	</div>
</div>

<style>
	.lab {
		display: grid;
		grid-template-columns: minmax(280px, 340px) 1fr minmax(300px, 360px);
		grid-template-rows: 1fr;
		height: 100vh;
		font-family: monospace;
		font-size: 13px;
		color: #333;
	}

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
		margin: 0 0 8px 0;
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
		padding: 8px 12px;
		cursor: pointer;
		font-family: monospace;
		border-radius: 999px;
		border: 1px solid #ddd;
		background: #efefef;
	}

	.checkbox-row {
		flex-direction: row !important;
		align-items: center;
	}

	.checkbox-row input[type='checkbox'] {
		width: auto;
	}

	.season-preview {
		display: flex;
		gap: 4px;
		padding: 8px;
		border-radius: 4px;
		border: 1px solid #ccc;
	}

	.swatch {
		display: inline-block;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		border: 1px solid rgba(0, 0, 0, 0.15);
	}

	.canvas {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		min-height: 320px;
	}

	.canvas svg {
		display: block;
		width: min(92vw, 560px);
		height: min(92vw, 560px);
	}

	.json-panel {
		padding: 16px;
		overflow-y: auto;
		background: #1e1e1e;
		color: #d4d4d4;
		border-left: 1px solid #333;
	}

	.json-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}

	.json-panel h2 {
		font-size: 14px;
		margin: 0;
		color: #9cdcfe;
	}

	.json-toggle {
		border: 1px solid #3e3e3e;
		border-radius: 999px;
		padding: 6px 10px;
		font-family: monospace;
		font-size: 11px;
		background: #2a2a2a;
		color: #d4d4d4;
		cursor: pointer;
	}

	.json-panel pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 11px;
		line-height: 1.5;
	}

	@media (max-width: 1024px) {
		.lab {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(300px, 50vh) auto;
			height: auto;
			min-height: 100vh;
		}

		.controls {
			border-right: 0;
			border-bottom: 1px solid #ddd;
		}

		.canvas {
			border-bottom: 1px solid #bbb;
		}

		.json-panel {
			border-left: 0;
			border-top: 1px solid #333;
		}
	}
</style>
