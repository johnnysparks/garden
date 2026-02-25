<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { PlantInfo } from '$lib/engine/game-session.js';
	import {
		SOIL_ROWS,
		normalizeForColor,
		barColor,
		barWidth,
		displayValue,
		titleCase,
		weeksRemaining,
	} from './plot-detail-helpers.js';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		row: number;
		col: number;
		soil: import('$lib/engine/ecs/components.js').SoilState;
		plant: PlantInfo | null;
		pendingAmendments: import('$lib/engine/ecs/components.js').PendingAmendment[];
		currentWeek: number;
		onClose: () => void;
		onZoomToPlant: () => void;
	}

	let { row, col, soil, plant, pendingAmendments, currentWeek, onClose, onZoomToPlant }: Props =
		$props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="detail-overlay" transition:fade={{ duration: 150 }} onclick={onClose}>
	<div
		class="detail-panel"
		transition:fly={{ y: 200, duration: 250 }}
		onclick={(e: MouseEvent) => e.stopPropagation()}
	>
		<div class="detail-header">
			<h3>Plot [{row},{col}]</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>
		<div class="detail-body">
			<!-- Soil Section -->
			<section class="detail-section">
				<h4 class="section-title">Soil</h4>
				<div class="soil-grid">
					{#each SOIL_ROWS as sr (sr.key)}
						{@const value = soil[sr.key]}
						{@const normalized = normalizeForColor(sr.key, value, sr.inverted)}
						<div class="soil-row">
							<span class="soil-label">{sr.label}</span>
							<div class="soil-bar-track">
								<div
									class="soil-bar-fill {barColor(normalized)}"
									style:width="{barWidth(sr.key, value)}%"
								></div>
							</div>
							<span class="soil-value">{displayValue(sr.key, value)}</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- Amendments Section -->
			{#if pendingAmendments.length > 0}
				<section class="detail-section">
					<h4 class="section-title">Amendments</h4>
					<ul class="amendment-list">
						{#each pendingAmendments as amendment}
							{@const remaining = weeksRemaining(amendment, currentWeek)}
							<li class="amendment-row">
								<span class="amendment-name">{titleCase(amendment.type)}</span>
								<span class="amendment-delay">
									{#if remaining > 0}
										Ready in {remaining} week{remaining !== 1 ? 's' : ''}
									{:else}
										Active
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Plant Section -->
			{#if plant}
				<section class="detail-section">
					<h4 class="section-title">Plant</h4>
					<div class="plant-info">
						<button class="plant-name-btn" onclick={onZoomToPlant}>
							{titleCase(plant.speciesId)} &#8250;
						</button>
						<div class="plant-stats">
							<div class="stat-row">
								<span class="stat-label">Growth Stage</span>
								<span class="stat-value">{titleCase(plant.stage)}</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Health</span>
								<span class="stat-value">{Math.round(plant.health * 100)}%</span>
							</div>
							<div class="stat-row">
								<span class="stat-label">Stress</span>
								<span class="stat-value">{Math.round(plant.stress * 100)}%</span>
							</div>
						</div>
						{#if plant.conditions.length > 0}
							<div class="conditions-list">
								<span class="conditions-label">Active Conditions</span>
								<div class="conditions-tags">
									{#each plant.conditions as condition}
										<span class="condition-tag">{titleCase(condition.conditionId)}</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>
			{:else}
				<section class="detail-section">
					<p class="empty-plot-msg">Empty &mdash; ready for planting</p>
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	/* ── Overlay + panel (bottom-sheet pattern) ───────────────────── */

	.detail-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
	}

	.detail-panel {
		background: #2a2a2a;
		border-radius: 16px 16px 0 0;
		width: 100%;
		max-width: 420px;
		max-height: 50vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.detail-header h3 {
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

	.detail-body {
		overflow-y: auto;
		padding: 8px 16px 16px;
		-webkit-overflow-scrolling: touch;
	}

	/* ── Sections ─────────────────────────────────────────────────── */

	.detail-section {
		margin-bottom: 12px;
	}

	.section-title {
		font-size: 11px;
		font-weight: 600;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin: 0 0 8px;
	}

	/* ── Soil bars ────────────────────────────────────────────────── */

	.soil-grid {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.soil-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.soil-label {
		width: 100px;
		font-size: 12px;
		font-weight: 600;
		color: #ccc;
		flex-shrink: 0;
	}

	.soil-bar-track {
		flex: 1;
		height: 8px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		overflow: hidden;
	}

	.soil-bar-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.bar-good {
		background: #4caf50;
	}

	.bar-moderate {
		background: #ffc107;
	}

	.bar-poor {
		background: #f44336;
	}

	.soil-value {
		width: 36px;
		text-align: right;
		font-size: 12px;
		font-family: monospace;
		font-weight: 600;
		color: #ddd;
		flex-shrink: 0;
	}

	/* ── Amendments ───────────────────────────────────────────────── */

	.amendment-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.amendment-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.amendment-name {
		font-size: 13px;
		color: #eee;
		font-weight: 500;
	}

	.amendment-delay {
		font-size: 11px;
		color: #4caf50;
		font-weight: 600;
	}

	/* ── Plant info ───────────────────────────────────────────────── */

	.plant-info {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.plant-name-btn {
		background: none;
		border: none;
		color: #ff9800;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		text-align: left;
	}

	.plant-name-btn:hover {
		text-decoration: underline;
	}

	.plant-stats {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
	}

	.stat-label {
		font-size: 12px;
		color: #999;
	}

	.stat-value {
		font-size: 12px;
		font-weight: 600;
		color: #eee;
		font-family: monospace;
	}

	/* ── Conditions ───────────────────────────────────────────────── */

	.conditions-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.conditions-label {
		font-size: 11px;
		color: #999;
	}

	.conditions-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.condition-tag {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 10px;
		background: rgba(244, 67, 54, 0.2);
		color: #f44336;
		font-weight: 500;
	}

	/* ── Empty plot ───────────────────────────────────────────────── */

	.empty-plot-msg {
		text-align: center;
		color: #888;
		font-size: 13px;
		padding: 12px 0;
		margin: 0;
		font-style: italic;
	}
</style>
