<script lang="ts">
	import AnimatedPlant from './AnimatedPlant.svelte';
	import { lerpColor, type SeasonPalette } from './palette.js';
	import type { WindState } from './animation.js';
	import type { SoilState } from '$lib/engine/ecs/components.js';
	import type { PlantSpecies, GrowthStageId } from '$lib/data/types.js';

	const CELL_SVG = 100; // SVG units per cell

	interface PlantData {
		species: PlantSpecies;
		growthProgress: number;
		stage: GrowthStageId;
		stress: number;
		instanceSeed: number;
	}

	interface Props {
		soil: SoilState;
		mulched: boolean;
		plant: PlantData | null;
		palette: SeasonPalette;
		windState: WindState;
		timeMs: number;
		selected?: boolean;
		hasSelection?: boolean;
		onclick?: () => void;
	}

	let { soil, mulched, plant, palette, windState, timeMs, selected = false, hasSelection = false, onclick }: Props = $props();

	// ── Soil color derivation ───────────────────────────────────────

	let soilFill = $derived.by(() => {
		const baseSoil = palette.soil;
		const darkSoil = '#2e1a0e';
		const lightSoil = '#c8b99a';

		// Organic matter drives darkness
		const organicBlend = lerpColor(baseSoil, darkSoil, soil.organic_matter * 0.6);

		// Low organic + high compaction = depleted, lighter
		const depletion = Math.max(
			0,
			(1 - soil.organic_matter) * 0.3 + soil.compaction * 0.2,
		);
		const finalSoil = lerpColor(organicBlend, lightSoil, depletion);

		// Moisture darkens slightly
		return lerpColor(finalSoil, darkSoil, soil.moisture * 0.15);
	});

	// ── Plant scale ─────────────────────────────────────────────────

	let plantScale = $derived.by(() => {
		if (!plant) return 1;
		const spread = plant.species.growth.max_spread_cm;
		const targetSvgSize = CELL_SVG * 0.6;
		return targetSvgSize / Math.max(spread, 30);
	});

	// ── Moisture texture lines ──────────────────────────────────────

	let moistureLines = $derived.by(() => {
		if (soil.moisture < 0.4) return [];
		const count = Math.floor(soil.moisture * 6);
		const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
		for (let i = 0; i < count; i++) {
			const y = 15 + i * 14;
			lines.push({
				x1: 10 + (i % 3) * 8,
				y1: y,
				x2: 10 + (i % 3) * 8 + 18 + (i % 2) * 10,
				y2: y + 2,
			});
		}
		return lines;
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="plot-cell" class:selected class:has-selection={hasSelection} onclick={onclick}>
	<svg
		viewBox="0 0 {CELL_SVG} {CELL_SVG}"
		preserveAspectRatio="xMidYMid meet"
		xmlns="http://www.w3.org/2000/svg"
	>
		<defs>
			<!-- Mulch texture pattern -->
			<pattern id="mulch-pat" width="10" height="10" patternUnits="userSpaceOnUse">
				<rect width="10" height="10" fill="#a1887f" />
				<ellipse cx="3" cy="3" rx="2" ry="1" fill="#8d6e63" opacity="0.6" />
				<ellipse cx="8" cy="7" rx="1.5" ry="0.8" fill="#795548" opacity="0.5" />
				<ellipse cx="5" cy="9" rx="1" ry="0.5" fill="#6d4c41" opacity="0.4" />
			</pattern>
			<!-- Selection glow filter -->
			{#if selected}
				<filter id="sel-glow" x="-20%" y="-20%" width="140%" height="140%">
					<feGaussianBlur stdDeviation="3" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			{/if}
		</defs>

		<!-- Soil background -->
		<rect width={CELL_SVG} height={CELL_SVG} fill={soilFill} />

		<!-- Moisture texture: subtle wavy lines when moist -->
		{#each moistureLines as line}
			<line
				x1={line.x1}
				y1={line.y1}
				x2={line.x2}
				y2={line.y2}
				stroke="rgba(0,0,0,0.08)"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		{/each}

		<!-- Mulch overlay -->
		{#if mulched}
			<rect
				width={CELL_SVG}
				height={CELL_SVG}
				fill="url(#mulch-pat)"
				opacity="0.45"
			/>
		{/if}

		<!-- Plant or empty state -->
		{#if plant}
			<g transform="translate({CELL_SVG / 2}, {CELL_SVG * 0.85}) scale({plantScale})">
				<AnimatedPlant
					visualParams={plant.species.visual}
					growthProgress={plant.growthProgress}
					stress={plant.stress}
					instanceSeed={plant.instanceSeed}
					stage={plant.stage}
					{windState}
					{timeMs}
				/>
			</g>
		{:else}
			<!-- Empty plot: subtle "+" indicator -->
			<g opacity="0.18">
				<line
					x1={CELL_SVG / 2}
					y1={CELL_SVG / 2 - 8}
					x2={CELL_SVG / 2}
					y2={CELL_SVG / 2 + 8}
					stroke="white"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<line
					x1={CELL_SVG / 2 - 8}
					y1={CELL_SVG / 2}
					x2={CELL_SVG / 2 + 8}
					y2={CELL_SVG / 2}
					stroke="white"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</g>
		{/if}

		<!-- Selection glow + border -->
		{#if selected}
			<rect
				x="1"
				y="1"
				width={CELL_SVG - 2}
				height={CELL_SVG - 2}
				fill="none"
				stroke={palette.accent}
				stroke-width="2"
				rx="2"
				opacity="0.4"
				filter="url(#sel-glow)"
			/>
			<rect
				x="1.5"
				y="1.5"
				width={CELL_SVG - 3}
				height={CELL_SVG - 3}
				fill="none"
				stroke={palette.accent}
				stroke-width="2.5"
				rx="2"
				opacity="0.85"
			/>
		{/if}
	</svg>
</div>

<style>
	.plot-cell {
		aspect-ratio: 1;
		cursor: pointer;
		border-radius: 6px;
		overflow: hidden;
		transition:
			transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.3s ease,
			opacity 0.25s ease,
			filter 0.25s ease;
		transform: scale(1) translateY(0);
		will-change: transform, box-shadow, opacity;
	}

	.plot-cell:hover {
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
	}

	.plot-cell:active {
		transform: scale(0.93) !important;
		transition-duration: 0.08s;
	}

	.plot-cell.selected {
		transform: scale(1.06) translateY(-3px);
		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.6),
			0 4px 12px 2px rgba(0, 0, 0, 0.18);
		z-index: 2;
		animation: selected-glow 2s ease-in-out infinite;
	}

	.plot-cell.has-selection:not(.selected) {
		opacity: 0.7;
		filter: brightness(0.85);
		transform: scale(0.97);
	}

	@keyframes selected-glow {
		0%, 100% { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6), 0 4px 12px 2px rgba(0, 0, 0, 0.18); }
		50% { box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 16px 4px rgba(0, 0, 0, 0.22); }
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
