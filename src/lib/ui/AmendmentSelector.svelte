<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { SoilAmendment } from '$lib/data/types.js';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		amendments: SoilAmendment[];
		onSelect: (amendmentId: string) => void;
		onClose: () => void;
	}

	let { amendments, onSelect, onClose }: Props = $props();

	// ── Helpers ──────────────────────────────────────────────────────

	/** Map amendment ids to display icons. */
	function amendmentIcon(id: string): string {
		switch (id) {
			case 'compost':
				return '\uD83E\uDEB1'; // worm
			case 'lime':
				return '\u26AA'; // white circle
			case 'sulfur':
				return '\uD83D\uDFE1'; // yellow circle
			case 'fertilizer':
				return '\uD83E\uDDEA'; // test tube
			case 'mulch':
				return '\uD83C\uDF42'; // fallen leaf
			case 'inoculant':
				return '\uD83E\uDDA0'; // microbe
			default:
				return '\uD83E\uDEBB'; // potted plant
		}
	}

	/** Format the effects object into a readable summary string. */
	function formatEffects(effects: Record<string, number>): string {
		return Object.entries(effects)
			.map(([key, val]) => {
				const label = key.replace(/_/g, ' ');
				const sign = val > 0 ? '+' : '';
				return `${sign}${val} ${label}`;
			})
			.join(', ');
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="amend-overlay" transition:fade={{ duration: 150 }} onclick={onClose}>
	<div
		class="amend-panel"
		transition:fly={{ y: 200, duration: 250 }}
		onclick={(e: MouseEvent) => e.stopPropagation()}
	>
		<div class="amend-header">
			<h3>Choose an amendment</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>
		<div class="amend-list">
			{#each amendments as amendment (amendment.id)}
				<button class="amend-row" onclick={() => onSelect(amendment.id)}>
					<span class="amend-icon">{amendmentIcon(amendment.id)}</span>
					<div class="amend-info">
						<span class="amend-name">{amendment.name}</span>
						<span class="amend-detail">{formatEffects(amendment.effects)}</span>
					</div>
					<span class="amend-delay">{amendment.delay_weeks}w</span>
				</button>
			{:else}
				<p class="empty-msg">No amendments available.</p>
			{/each}
		</div>
	</div>
</div>

<style>
	.amend-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
	}

	.amend-panel {
		background: #2a2a2a;
		border-radius: 16px 16px 0 0;
		width: 100%;
		max-width: 420px;
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.amend-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.amend-header h3 {
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

	.amend-list {
		overflow-y: auto;
		padding: 8px;
		-webkit-overflow-scrolling: touch;
	}

	.amend-row {
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

	.amend-row:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.amend-row:active {
		transform: scale(0.98);
	}

	.amend-icon {
		font-size: 24px;
		line-height: 1;
		flex-shrink: 0;
	}

	.amend-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.amend-name {
		font-size: 14px;
		font-weight: 600;
	}

	.amend-detail {
		font-size: 11px;
		color: #999;
	}

	.amend-delay {
		font-family: monospace;
		font-size: 10px;
		font-weight: 700;
		color: #8bc34a;
		background: rgba(139, 195, 74, 0.12);
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
