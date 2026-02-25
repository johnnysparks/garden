<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { ScoreCard } from '$lib/engine/scoring.js';
	import ScoreBreakdown from './ScoreBreakdown.svelte';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		score: ScoreCard;
		zone: string;
		weeksSurvived: number;
		endReason: 'frost' | 'abandon' | 'catastrophe';
		newSeeds: string[];
		onNewRun: () => void;
		onMainMenu: () => void;
	}

	let { score, zone, weeksSurvived, endReason, newSeeds, onNewRun, onMainMenu }: Props = $props();

	// ── Derived display values ──────────────────────────────────────

	const reasonConfig = $derived.by(() => {
		switch (endReason) {
			case 'frost':
				return { label: 'Killing Frost', icon: '\u2744\uFE0F' };
			case 'abandon':
				return { label: 'Season Abandoned', icon: '\uD83D\uDEAA' };
			case 'catastrophe':
				return { label: 'Catastrophe', icon: '\u26A0\uFE0F' };
		}
	});
</script>

<div class="run-end-overlay" transition:fade={{ duration: 200 }}>
	<div class="run-end-content" transition:fly={{ y: 40, duration: 300 }}>
		<div class="reason-banner">
			<span class="reason-icon">{reasonConfig.icon}</span>
			<h1 class="reason-label">{reasonConfig.label}</h1>
		</div>

		<div class="stats-row">
			<span class="stat">Week {weeksSurvived} of 30</span>
		</div>

		<ScoreBreakdown {score} {zone} />

		{#if newSeeds.length > 0}
			<div class="new-seeds">
				<h3 class="seeds-title">Seeds Unlocked</h3>
				<ul class="seeds-list">
					{#each newSeeds as seedId (seedId)}
						<li class="seed-item">{seedId.replace(/_/g, ' ')}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="button-bar">
			<button class="btn btn-primary" onclick={onNewRun}>New Season</button>
			<button class="btn btn-secondary" onclick={onMainMenu}>Main Menu</button>
		</div>
	</div>
</div>

<style>
	.run-end-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		overflow-y: auto;
		padding: 16px;
	}

	.run-end-content {
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* ── Reason banner ──────────────────────────────────────────── */

	.reason-banner {
		text-align: center;
		padding: 12px 0 4px;
	}

	.reason-icon {
		font-size: 36px;
		display: block;
		margin-bottom: 6px;
	}

	.reason-label {
		margin: 0;
		font-size: 22px;
		font-weight: 700;
		color: #eee;
		letter-spacing: 0.5px;
	}

	/* ── Stats row ──────────────────────────────────────────────── */

	.stats-row {
		text-align: center;
	}

	.stat {
		font-size: 13px;
		color: #aaa;
		font-family: monospace;
	}

	/* ── New seeds ──────────────────────────────────────────────── */

	.new-seeds {
		background: #2a2a2a;
		border-radius: 12px;
		padding: 14px 20px;
	}

	.seeds-title {
		margin: 0 0 8px;
		font-size: 14px;
		font-weight: 600;
		color: #8bc34a;
	}

	.seeds-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.seed-item {
		font-size: 13px;
		color: #ccc;
		padding: 3px 0;
		text-transform: capitalize;
	}

	.seed-item::before {
		content: '\uD83C\uDF31 ';
	}

	/* ── Button bar ─────────────────────────────────────────────── */

	.button-bar {
		display: flex;
		gap: 12px;
		position: sticky;
		bottom: 0;
		padding: 12px 0;
	}

	.btn {
		flex: 1;
		padding: 12px 16px;
		border: none;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 600;
		font-family: system-ui, -apple-system, sans-serif;
		cursor: pointer;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.btn:active {
		transform: scale(0.96);
	}

	.btn-primary {
		background: rgba(76, 175, 80, 0.85);
		color: #fff;
	}

	.btn-primary:hover {
		background: rgba(76, 175, 80, 1);
	}

	.btn-secondary {
		background: rgba(255, 255, 255, 0.1);
		color: #ccc;
	}

	.btn-secondary:hover {
		background: rgba(255, 255, 255, 0.18);
	}
</style>
