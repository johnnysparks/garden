<script lang="ts">
	import type { ScoreCard } from '$lib/engine/scoring.js';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		score: ScoreCard;
		zone: string;
	}

	let { score, zone }: Props = $props();

	// ── Category display config ─────────────────────────────────────

	interface LineItem {
		label: string;
		value: number;
	}

	interface CategoryConfig {
		name: string;
		icon: string;
		items: LineItem[];
		total: number;
	}

	let categories: CategoryConfig[] = $derived([
		{
			name: 'Harvest',
			icon: '\u{1F9FA}',
			items: [
				{ label: `${score.harvest.speciesCount} species harvested`, value: score.harvest.speciesCount * 10 },
				{ label: `${score.harvest.familyCount} families`, value: score.harvest.familyCount * 5 },
				{ label: `${score.harvest.setCount} planting sets`, value: score.harvest.setCount * 20 },
			],
			total: score.harvest.total,
		},
		{
			name: 'Soil',
			icon: '\u{1FAA8}',
			items: [
				{ label: `Avg health delta ${score.soil.healthDelta >= 0 ? '+' : ''}${score.soil.healthDelta.toFixed(2)}`, value: Math.round(score.soil.healthDelta * 10) },
				{ label: `${score.soil.plotsImproved} plots improved`, value: score.soil.plotsImproved * 5 },
				{ label: 'Nitrogen fixer bonus', value: score.soil.nitrogenFixerBonus },
			],
			total: score.soil.total,
		},
		{
			name: 'Survival',
			icon: '\u{1F6E1}\u{FE0F}',
			items: [
				{ label: `${score.survival.harvestReady} harvest-ready`, value: score.survival.harvestReady * 5 },
				{ label: `${score.survival.deaths} deaths`, value: score.survival.deaths * -2 },
				{ label: `${score.survival.perennialsEstablished} perennials`, value: score.survival.perennialsEstablished * 15 },
			],
			total: score.survival.total,
		},
		{
			name: 'Knowledge',
			icon: '\u{1F4D6}',
			items: [
				{ label: `${score.knowledge.diagnoses} diagnoses`, value: score.knowledge.diagnoses * 10 },
				{ label: `${score.knowledge.uniqueSpecies} unique species`, value: score.knowledge.uniqueSpecies * 5 },
			],
			total: score.knowledge.total,
		},
	]);
</script>

<div class="score-card">
	<div class="score-header">
		<h2 class="score-title">Season Complete</h2>
		<span class="score-zone">{zone.replace(/_/g, ' ')}</span>
	</div>

	{#each categories as cat (cat.name)}
		<div class="category">
			<div class="category-header">
				<span class="category-icon">{cat.icon}</span>
				<span class="category-name">{cat.name}</span>
				<span class="category-total" class:negative={cat.total < 0}>{cat.total}</span>
			</div>
			<div class="line-items">
				{#each cat.items as item (item.label)}
					<div class="line-item">
						<span class="line-label">{item.label}</span>
						<span class="line-value" class:positive={item.value > 0} class:negative={item.value < 0}>
							{item.value > 0 ? '+' : ''}{item.value}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<div class="divider"></div>

	<div class="zone-modifier-row">
		<span class="modifier-label">Zone modifier</span>
		<span class="modifier-value">&times;{score.zoneModifier.toFixed(1)}</span>
	</div>

	<div class="final-total">
		<span class="final-label">Final Score</span>
		<span class="final-value">{score.total}</span>
	</div>
</div>

<style>
	.score-card {
		background: #2a2a2a;
		border-radius: 12px;
		padding: 20px;
		max-width: 400px;
		margin: 0 auto;
		color: #ddd;
		font-family: system-ui, -apple-system, sans-serif;
	}

	/* ── Header ──────────────────────────────────────────────────── */

	.score-header {
		text-align: center;
		margin-bottom: 20px;
	}

	.score-title {
		margin: 0 0 4px;
		font-size: 20px;
		font-weight: 700;
		color: #eee;
	}

	.score-zone {
		font-size: 13px;
		color: #999;
		text-transform: capitalize;
	}

	/* ── Category sections ───────────────────────────────────────── */

	.category {
		margin-bottom: 16px;
	}

	.category-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 6px;
	}

	.category-icon {
		font-size: 16px;
		line-height: 1;
	}

	.category-name {
		font-size: 14px;
		font-weight: 600;
		color: #eee;
		flex: 1;
	}

	.category-total {
		font-family: monospace;
		font-size: 14px;
		font-weight: 700;
		color: #4caf50;
	}

	.category-total.negative {
		color: #f44336;
	}

	.line-items {
		padding-left: 26px;
	}

	.line-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2px 0;
	}

	.line-label {
		font-size: 12px;
		color: #aaa;
	}

	.line-value {
		font-family: monospace;
		font-size: 12px;
		font-weight: 600;
		color: #aaa;
	}

	.line-value.positive {
		color: #4caf50;
	}

	.line-value.negative {
		color: #f44336;
	}

	/* ── Divider ─────────────────────────────────────────────────── */

	.divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 16px 0;
	}

	/* ── Zone modifier ───────────────────────────────────────────── */

	.zone-modifier-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 4px 0;
		margin-bottom: 12px;
	}

	.modifier-label {
		font-size: 13px;
		color: #aaa;
	}

	.modifier-value {
		font-family: monospace;
		font-size: 14px;
		font-weight: 600;
		color: #ddd;
	}

	/* ── Final total ─────────────────────────────────────────────── */

	.final-total {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.final-label {
		font-size: 16px;
		font-weight: 700;
		color: #eee;
	}

	.final-value {
		font-family: monospace;
		font-size: 28px;
		font-weight: 700;
		color: #4caf50;
	}
</style>
