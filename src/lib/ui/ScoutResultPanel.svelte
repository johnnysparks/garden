<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import type { WeekWeather } from '$lib/engine/ecs/components.js';
	import type { PestEvent } from '$lib/engine/ecs/components.js';
	import type { SoilState } from '$lib/engine/ecs/components.js';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		target: 'weather' | 'pests' | 'soil';
		weatherData?: WeekWeather[];
		pestData?: PestEvent[];
		soilData?: SoilState;
		onClose: () => void;
	}

	let { target, weatherData, pestData, soilData, onClose }: Props = $props();

	// ── Helpers ──────────────────────────────────────────────────────

	/** Convert Celsius to Fahrenheit. */
	function cToF(c: number): number {
		return Math.round(c * 9 / 5 + 32);
	}

	/** Convert mm precipitation to inches. */
	function mmToIn(mm: number): string {
		return (mm / 25.4).toFixed(1);
	}

	/** Format a weather special event for display. */
	function formatSpecial(special: WeekWeather['special']): string {
		if (!special) return '\u2014';
		switch (special.type) {
			case 'heatwave': return 'Heatwave';
			case 'drought': return 'Drought';
			case 'heavy_rain': return 'Heavy rain';
			case 'hail': return 'Hail';
			case 'early_frost': return 'Early frost';
			case 'indian_summer': return 'Indian summer';
			default: return '\u2014';
		}
	}

	/** Title for the panel based on scout target. */
	const TITLES: Record<string, string> = {
		weather: 'Weather Forecast',
		pests: 'Pest Forecast',
		soil: 'Soil Survey',
	};

	// ── Soil bar helpers ─────────────────────────────────────────────

	interface SoilRow {
		label: string;
		key: keyof SoilState;
		min: number;
		max: number;
		goodRange: [number, number];
	}

	const SOIL_ROWS: SoilRow[] = [
		{ label: 'pH', key: 'ph', min: 3, max: 10, goodRange: [6.0, 7.2] },
		{ label: 'Nitrogen', key: 'nitrogen', min: 0, max: 100, goodRange: [40, 80] },
		{ label: 'Phosphorus', key: 'phosphorus', min: 0, max: 100, goodRange: [30, 70] },
		{ label: 'Potassium', key: 'potassium', min: 0, max: 100, goodRange: [30, 70] },
		{ label: 'Organic Matter', key: 'organic_matter', min: 0, max: 100, goodRange: [40, 80] },
		{ label: 'Moisture', key: 'moisture', min: 0, max: 100, goodRange: [30, 70] },
		{ label: 'Compaction', key: 'compaction', min: 0, max: 100, goodRange: [0, 30] },
		{ label: 'Biology', key: 'biology', min: 0, max: 100, goodRange: [40, 80] },
	];

	/** Return a color class based on whether the value falls in a good range. */
	function barColor(value: number, goodRange: [number, number]): string {
		if (value >= goodRange[0] && value <= goodRange[1]) return 'bar-good';
		const low = goodRange[0];
		const high = goodRange[1];
		const range = high - low;
		if (value < low - range * 0.5 || value > high + range * 0.5) return 'bar-poor';
		return 'bar-moderate';
	}

	/** Compute bar width as a percentage of the range. */
	function barWidth(value: number, min: number, max: number): number {
		return Math.max(2, Math.min(100, ((value - min) / (max - min)) * 100));
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="result-overlay" transition:fade={{ duration: 150 }} onclick={onClose}>
	<div
		class="result-panel"
		transition:fly={{ y: 200, duration: 250 }}
		onclick={(e: MouseEvent) => e.stopPropagation()}
	>
		<div class="result-header">
			<h3>{TITLES[target] ?? 'Scout Results'}</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>
		<div class="result-body">
			{#if target === 'weather'}
				{#if weatherData && weatherData.length > 0}
					<table class="weather-table">
						<thead>
							<tr>
								<th>Week</th>
								<th>Temp (&deg;F)</th>
								<th>Rain (in)</th>
								<th>Wind</th>
								<th>Special</th>
							</tr>
						</thead>
						<tbody>
							{#each weatherData as w (w.week)}
								<tr>
									<td class="cell-week">{w.week}</td>
									<td class="cell-temp">{cToF(w.temp_low_c)}&ndash;{cToF(w.temp_high_c)}</td>
									<td class="cell-rain">{mmToIn(w.precipitation_mm)}</td>
									<td class="cell-wind">{w.wind}</td>
									<td class="cell-special">{formatSpecial(w.special)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="empty-msg">No weather data available.</p>
				{/if}

			{:else if target === 'pests'}
				{#if pestData && pestData.length > 0}
					<ul class="pest-list">
						{#each pestData as pest (pest.pest_id + '-' + pest.arrival_week)}
							<li class="pest-row">
								<span class="pest-icon">{pest.visual}</span>
								<div class="pest-info">
									<span class="pest-name">{pest.pest_id.replace(/_/g, ' ')}</span>
									<span class="pest-detail">
										Targets: {pest.target_families.join(', ')} &middot; Week {pest.arrival_week}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty-msg">No pest activity expected.</p>
				{/if}

			{:else if target === 'soil'}
				{#if soilData}
					<div class="soil-grid">
						{#each SOIL_ROWS as row (row.key)}
							{@const value = soilData[row.key]}
							<div class="soil-row">
								<span class="soil-label">{row.label}</span>
								<div class="soil-bar-track">
									<div
										class="soil-bar-fill {barColor(value, row.goodRange)}"
										style:width="{barWidth(value, row.min, row.max)}%"
									></div>
								</div>
								<span class="soil-value">
									{row.key === 'ph' ? value.toFixed(1) : Math.round(value)}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty-msg">Select a plot to inspect soil.</p>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.result-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 100;
	}

	.result-panel {
		background: #2a2a2a;
		border-radius: 16px 16px 0 0;
		width: 100%;
		max-width: 420px;
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.result-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.result-header h3 {
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

	.result-body {
		overflow-y: auto;
		padding: 12px 16px 16px;
		-webkit-overflow-scrolling: touch;
	}

	.empty-msg {
		text-align: center;
		color: #888;
		font-size: 13px;
		padding: 24px 16px;
		margin: 0;
	}

	/* ── Weather table ────────────────────────────────────────────── */

	.weather-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		color: #ddd;
	}

	.weather-table th {
		text-align: left;
		font-size: 11px;
		font-weight: 600;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 4px 6px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.weather-table td {
		padding: 8px 6px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.cell-week {
		font-weight: 600;
		font-family: monospace;
	}

	.cell-temp {
		font-family: monospace;
	}

	.cell-rain {
		font-family: monospace;
	}

	.cell-wind {
		text-transform: capitalize;
	}

	.cell-special {
		font-style: italic;
		color: #e8a838;
	}

	/* ── Pest list ────────────────────────────────────────────────── */

	.pest-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.pest-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.pest-icon {
		font-size: 20px;
		line-height: 1;
		flex-shrink: 0;
	}

	.pest-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.pest-name {
		font-size: 14px;
		font-weight: 600;
		color: #eee;
		text-transform: capitalize;
	}

	.pest-detail {
		font-size: 11px;
		color: #999;
	}

	/* ── Soil bars ────────────────────────────────────────────────── */

	.soil-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
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
		height: 10px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 5px;
		overflow: hidden;
	}

	.soil-bar-fill {
		height: 100%;
		border-radius: 5px;
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
</style>
