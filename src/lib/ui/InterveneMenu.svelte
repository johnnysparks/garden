<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	// ── Props ────────────────────────────────────────────────────────

	interface PlantInfo {
		speciesId: string;
		stage: string;
		harvestReady: boolean;
		conditions: Array<{ conditionId: string; severity: number }>;
	}

	interface Props {
		plantInfo: PlantInfo;
		onSelect: (action: string) => void;
		onClose: () => void;
	}

	let { plantInfo, onSelect, onClose }: Props = $props();

	// ── Pull confirmation ─────────────────────────────────────────────

	let confirmPull = $state(false);

	function handlePull() {
		confirmPull = true;
	}

	function cancelPull() {
		confirmPull = false;
	}

	// ── Helpers ──────────────────────────────────────────────────────

	function firstConditionName(): string {
		if (plantInfo.conditions.length === 0) return '';
		// Format condition id for display (snake_case → Title Case)
		return plantInfo.conditions[0].conditionId
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function speciesDisplayName(): string {
		return plantInfo.speciesId
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="intervene-overlay" transition:fade={{ duration: 150 }} onclick={onClose}>
	<div
		class="intervene-panel"
		transition:fly={{ y: 200, duration: 250 }}
		onclick={(e: MouseEvent) => e.stopPropagation()}
	>
		<div class="intervene-header">
			<h3>Act on {speciesDisplayName()}</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>

		<div class="intervene-list">
			<!-- Harvest -->
			<button
				class="intervene-row"
				class:row-disabled={!plantInfo.harvestReady}
				disabled={!plantInfo.harvestReady}
				onclick={() => onSelect('harvest')}
			>
				<span class="row-icon">🧺</span>
				<div class="row-info">
					<span class="row-name">Harvest</span>
					<span class="row-detail">
						{plantInfo.harvestReady ? 'Ready to harvest' : 'Not ready yet'}
					</span>
				</div>
			</button>

			<!-- Prune -->
			<button class="intervene-row" onclick={() => onSelect('prune')}>
				<span class="row-icon">✂️</span>
				<div class="row-info">
					<span class="row-name">Prune</span>
					<span class="row-detail">Remove dead or damaged growth</span>
				</div>
			</button>

			<!-- Treat -->
			<button
				class="intervene-row"
				class:row-disabled={plantInfo.conditions.length === 0}
				disabled={plantInfo.conditions.length === 0}
				onclick={() => onSelect('treat')}
			>
				<span class="row-icon">🪣</span>
				<div class="row-info">
					<span class="row-name">Treat</span>
					<span class="row-detail">
						{plantInfo.conditions.length > 0
							? `Treating: ${firstConditionName()}`
							: 'No active conditions'}
					</span>
				</div>
			</button>

			<!-- Pull (with confirmation) -->
			{#if confirmPull}
				<div class="pull-confirm">
					<p class="pull-confirm-msg">Remove {speciesDisplayName()}? This cannot be undone.</p>
					<div class="pull-confirm-buttons">
						<button class="confirm-btn cancel-btn" onclick={cancelPull}>Cancel</button>
						<button class="confirm-btn remove-btn" onclick={() => onSelect('pull')}>Remove</button>
					</div>
				</div>
			{:else}
				<button class="intervene-row row-danger" onclick={handlePull}>
					<span class="row-icon">🌱</span>
					<div class="row-info">
						<span class="row-name">Pull</span>
						<span class="row-detail">Remove plant from plot</span>
					</div>
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.intervene-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
	}

	.intervene-panel {
		background: #2a2a2a;
		border-radius: 16px 16px 0 0;
		width: 100%;
		max-width: 420px;
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.intervene-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.intervene-header h3 {
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

	.intervene-list {
		overflow-y: auto;
		padding: 8px;
		-webkit-overflow-scrolling: touch;
	}

	.intervene-row {
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

	.intervene-row:not(.row-disabled):hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.intervene-row:not(.row-disabled):active {
		transform: scale(0.98);
	}

	.intervene-row.row-disabled {
		opacity: 0.35;
		cursor: default;
	}

	.intervene-row.row-danger {
		border-color: rgba(244, 67, 54, 0.25);
		color: #ef9a9a;
	}

	.intervene-row.row-danger:hover {
		background: rgba(244, 67, 54, 0.1);
	}

	.row-icon {
		font-size: 22px;
		line-height: 1;
		flex-shrink: 0;
	}

	.row-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.row-name {
		font-size: 14px;
		font-weight: 600;
	}

	.row-detail {
		font-size: 11px;
		color: #999;
	}

	/* Pull confirmation */
	.pull-confirm {
		border: 1px solid rgba(244, 67, 54, 0.35);
		border-radius: 10px;
		background: rgba(244, 67, 54, 0.08);
		padding: 12px;
		margin-bottom: 4px;
	}

	.pull-confirm-msg {
		margin: 0 0 10px;
		font-size: 13px;
		color: #ef9a9a;
		text-align: center;
	}

	.pull-confirm-buttons {
		display: flex;
		gap: 8px;
	}

	.confirm-btn {
		flex: 1;
		padding: 8px;
		border-radius: 8px;
		border: none;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.cancel-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #eee;
	}

	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.18);
	}

	.remove-btn {
		background: #c62828;
		color: #fff;
	}

	.remove-btn:hover {
		background: #e53935;
	}
</style>
