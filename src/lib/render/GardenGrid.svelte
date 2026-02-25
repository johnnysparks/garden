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
	import { onMount } from 'svelte';
	import PlotCell from './PlotCell.svelte';
	import type { SeasonPalette } from './palette.js';
	import type { WindState } from './animation.js';

	interface Props {
		rows: number;
		cols: number;
		cells: CellData[];
		palette: SeasonPalette;
		windState: WindState;
		timeMs: number;
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
		selectedPlot = null,
		onSelectPlot,
	}: Props = $props();

	function cellAt(row: number, col: number): CellData | undefined {
		return cells.find((c) => c.row === row && c.col === col);
	}

	function isSelected(row: number, col: number): boolean {
		return selectedPlot?.row === row && selectedPlot?.col === col;
	}

	let hasSelection = $derived(selectedPlot !== null);

	// Build row/col indices for iteration
	let rowIndices = $derived(Array.from({ length: rows }, (_, i) => i));
	let colIndices = $derived(Array.from({ length: cols }, (_, i) => i));

	// Staggered entrance animation
	let entered = $state(false);
	onMount(() => {
		// Trigger entrance after a micro-task so the initial state is rendered first
		requestAnimationFrame(() => { entered = true; });
	});

	function entranceDelay(row: number, col: number): string {
		// Stagger from top-left to bottom-right
		const idx = row * cols + col;
		return `${idx * 60}ms`;
	}
</script>

<div
	class="garden-grid"
	style:--grid-cols={cols}
>
	{#each rowIndices as row}
		{#each colIndices as col}
			{@const cell = cellAt(row, col)}
			{#if cell}
				<div
					class="cell-entrance"
					class:entered
					style:transition-delay={entranceDelay(row, col)}
				>
					<PlotCell
						soil={cell.soil}
						mulched={cell.mulched}
						plant={cell.plant}
						{palette}
						{windState}
						{timeMs}
						selected={isSelected(row, col)}
						{hasSelection}
						onclick={() => onSelectPlot?.(row, col)}
					/>
				</div>
			{:else}
				<div
					class="empty-cell cell-entrance"
					class:entered
					style:transition-delay={entranceDelay(row, col)}
				></div>
			{/if}
		{/each}
	{/each}
</div>

<style>
	.garden-grid {
		display: grid;
		grid-template-columns: repeat(var(--grid-cols), 1fr);
		gap: 6px;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding: 12px;
		box-sizing: border-box;
	}

	.cell-entrance {
		opacity: 0;
		transform: scale(0.8) translateY(12px);
		transition:
			opacity 0.4s ease-out,
			transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.cell-entrance.entered {
		opacity: 1;
		transform: scale(1) translateY(0);
	}

	.empty-cell {
		aspect-ratio: 1;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 6px;
	}
</style>
