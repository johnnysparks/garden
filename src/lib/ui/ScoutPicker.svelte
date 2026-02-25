<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		onSelect: (target: 'weather' | 'pests' | 'soil') => void;
		onClose: () => void;
	}

	let { onSelect, onClose }: Props = $props();

	// ── Scout target definitions ─────────────────────────────────────

	const SCOUT_TARGETS: Array<{
		id: 'weather' | 'pests' | 'soil';
		label: string;
		icon: string;
		description: string;
	}> = [
		{
			id: 'weather',
			label: 'Weather Forecast',
			icon: '\u2601\uFE0F', // cloud
			description: 'Peek at next 3 weeks of weather',
		},
		{
			id: 'pests',
			label: 'Pest Forecast',
			icon: '\uD83D\uDC1B', // bug
			description: 'See which pests may arrive soon',
		},
		{
			id: 'soil',
			label: 'Soil Survey',
			icon: '\uD83D\uDDC2\uFE0F', // layers / card index dividers
			description: 'Inspect soil nutrients and pH',
		},
	];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scout-overlay" transition:fade={{ duration: 150 }} onclick={onClose}>
	<div
		class="scout-panel"
		transition:fly={{ y: 200, duration: 250 }}
		onclick={(e: MouseEvent) => e.stopPropagation()}
	>
		<div class="scout-header">
			<h3>Scout — choose a target</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>
		<div class="scout-list">
			{#each SCOUT_TARGETS as target (target.id)}
				<button class="scout-row" onclick={() => onSelect(target.id)}>
					<span class="scout-icon">{target.icon}</span>
					<div class="scout-info">
						<span class="scout-name">{target.label}</span>
						<span class="scout-detail">{target.description}</span>
					</div>
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.scout-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
	}

	.scout-panel {
		background: #2a2a2a;
		border-radius: 16px 16px 0 0;
		width: 100%;
		max-width: 420px;
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.scout-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.scout-header h3 {
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

	.scout-list {
		overflow-y: auto;
		padding: 8px;
		-webkit-overflow-scrolling: touch;
	}

	.scout-row {
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

	.scout-row:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.scout-row:active {
		transform: scale(0.98);
	}

	.scout-icon {
		font-size: 24px;
		line-height: 1;
		flex-shrink: 0;
	}

	.scout-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.scout-name {
		font-size: 14px;
		font-weight: 600;
	}

	.scout-detail {
		font-size: 11px;
		color: #999;
	}
</style>
