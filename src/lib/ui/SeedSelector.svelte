<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { PlantSpecies } from '$lib/data/types.js';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		species: PlantSpecies[];
		onSelect: (speciesId: string) => void;
		onClose: () => void;
	}

	let { species, onSelect, onClose }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="seed-overlay" transition:fade={{ duration: 150 }} onclick={onClose}>
	<div
		class="seed-panel"
		transition:fly={{ y: 200, duration: 250 }}
		onclick={(e: MouseEvent) => e.stopPropagation()}
	>
		<div class="seed-header">
			<h3>Choose a seed</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>
		<div class="seed-list">
			{#each species as sp (sp.id)}
				<button class="seed-row" onclick={() => onSelect(sp.id)}>
					<span class="seed-icon">
						{#if sp.harvest.harvest_type === 'fruit'}
							&#127813;
						{:else if sp.harvest.harvest_type === 'leaf'}
							&#127807;
						{:else if sp.harvest.harvest_type === 'root'}
							&#129382;
						{:else}
							&#127793;
						{/if}
					</span>
					<div class="seed-info">
						<span class="seed-name">{sp.common_name}</span>
						<span class="seed-detail">{sp.family} &middot; {sp.type}</span>
					</div>
					<span class="seed-cost">1 AP</span>
				</button>
			{:else}
				<p class="empty-msg">No seeds available. Harvest plants to add to your seed bank.</p>
			{/each}
		</div>
	</div>
</div>

<style>
	.seed-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
	}

	.seed-panel {
		background: #2a2a2a;
		border-radius: 16px 16px 0 0;
		width: 100%;
		max-width: 420px;
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.seed-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.seed-header h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: #eee;
	}

	.close-btn {
		background: none;
		border: none;
		color: #999;
		font-size: 22px;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}

	.close-btn:hover {
		color: #fff;
	}

	.seed-list {
		overflow-y: auto;
		padding: 8px;
		-webkit-overflow-scrolling: touch;
	}

	.seed-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		color: #eee;
		cursor: pointer;
		text-align: left;
		margin-bottom: 4px;
		transition:
			background 0.12s ease,
			transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.seed-row:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.seed-row:active {
		transform: scale(0.98);
	}

	.seed-icon {
		font-size: 24px;
		line-height: 1;
		flex-shrink: 0;
	}

	.seed-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.seed-name {
		font-size: 14px;
		font-weight: 600;
	}

	.seed-detail {
		font-size: 11px;
		color: #999;
	}

	.seed-cost {
		font-family: monospace;
		font-size: 10px;
		font-weight: 700;
		color: #ff9800;
		background: rgba(255, 152, 0, 0.12);
		padding: 2px 6px;
		border-radius: 6px;
		flex-shrink: 0;
	}

	.empty-msg {
		text-align: center;
		color: #888;
		font-size: 13px;
		padding: 24px 16px;
		margin: 0;
	}
</style>
