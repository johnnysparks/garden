<script lang="ts" module>
	import type { SoilState } from '$lib/engine/ecs/components.js';
	import type { PlantSpecies, GrowthStageId } from '$lib/data/types.js';

	export interface CellPlant {
		species: PlantSpecies;
		growthProgress: number;
		stage: GrowthStageId;
		stress: number;
		instanceSeed: number;
	}

	export interface CellData {
		row: number;
		col: number;
		soil: SoilState;
		mulched: boolean;
		plant: CellPlant | null;
	}
</script>

<script lang="ts">
	import PlotCell from './PlotCell.svelte';
	import type { SeasonPalette } from './palette.js';
	import type { WindState } from './animation.js';
	import type { DaylightState } from './daylight.js';

	interface Props {
		rows: number;
		cols: number;
		cells: CellData[];
		palette: SeasonPalette;
		windState: WindState;
		timeMs: number;
		daylight: DaylightState;
		selectedPlot?: { row: number; col: number } | null;
		onSelectPlot?: (row: number, col: number) => void;
	}

	let {
		rows,
		cols,
		cells,
		palette,
		windState,
		timeMs,
		daylight,
		selectedPlot = null,
		onSelectPlot,
	}: Props = $props();

	function cellAt(row: number, col: number): CellData | undefined {
		return cells.find((c) => c.row === row && c.col === col);
	}

	function isSelected(row: number, col: number): boolean {
		return selectedPlot?.row === row && selectedPlot?.col === col;
	}

	// Build row/col indices for iteration
	let rowIndices = $derived(Array.from({ length: rows }, (_, i) => i));
	let colIndices = $derived(Array.from({ length: cols }, (_, i) => i));
</script>

<div
	class="garden-grid"
	style:--grid-cols={cols}
>
	{#each rowIndices as row}
		{#each colIndices as col}
			{@const cell = cellAt(row, col)}
			{#if cell}
				<PlotCell
					soil={cell.soil}
					mulched={cell.mulched}
					plant={cell.plant}
					{palette}
					{windState}
					{timeMs}
					{daylight}
					selected={isSelected(row, col)}
					onclick={() => onSelectPlot?.(row, col)}
				/>
			{:else}
				<div class="empty-cell"></div>
			{/if}
		{/each}
	{/each}
</div>

<style>
	.garden-grid {
		display: grid;
		grid-template-columns: repeat(var(--grid-cols), 1fr);
		gap: 4px;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding: 12px;
		box-sizing: border-box;
	}

	.empty-cell {
		aspect-ratio: 1;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 4px;
	}
</style>
