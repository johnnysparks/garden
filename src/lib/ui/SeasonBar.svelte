<script lang="ts">
	import {
		season,
		weather,
		weekToSeasonId,
		seasonLabel,
		weatherIcon,
	} from './hud-stores.svelte.js';

	let seasonId = $derived(weekToSeasonId(season.week));
	let label = $derived(seasonLabel(seasonId));
	let icon = $derived(weatherIcon(weather.current));
	let temp = $derived(weather.current.temp_high_c);

	/** 0-1 progress through the full season. */
	let progress = $derived(season.week / (season.totalWeeks - 1));

	/** 0-1 position where frost danger zone starts on the track. */
	let frostStart = $derived(season.frostStartWeek / (season.totalWeeks - 1));
</script>

<div class="season-bar">
	<div class="season-info">
		<span class="week-label">Week {season.week}</span>
		<span class="separator">&middot;</span>
		<span class="season-name">{label}</span>
		<span class="separator">&middot;</span>
		<span class="weather-temp">{icon} {temp}&deg;C</span>
	</div>

	<div class="progress-track">
		<div
			class="frost-zone"
			style:left="{frostStart * 100}%"
			style:width="{(1 - frostStart) * 100}%"
		></div>
		<div class="progress-fill" style:width="{progress * 100}%"></div>
		<div class="progress-marker" style:left="{progress * 100}%"></div>
	</div>
</div>

<style>
	.season-bar {
		padding: 8px 16px 6px;
		flex-shrink: 0;
	}

	.season-info {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: monospace;
		font-size: 13px;
		font-weight: 600;
		color: #444;
	}

	.separator {
		color: #aaa;
		font-weight: 400;
	}

	.weather-temp {
		font-weight: 500;
	}

	.progress-track {
		position: relative;
		height: 4px;
		background: rgba(0, 0, 0, 0.08);
		border-radius: 2px;
		margin-top: 6px;
	}

	.frost-zone {
		position: absolute;
		top: 0;
		height: 100%;
		background: linear-gradient(
			90deg,
			rgba(173, 216, 230, 0.3),
			rgba(200, 220, 240, 0.6),
			rgba(220, 235, 250, 0.8)
		);
		border-radius: 0 2px 2px 0;
	}

	.progress-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: linear-gradient(90deg, #81c784, #43a047);
		border-radius: 2px;
		transition: width 0.4s ease;
	}

	.progress-marker {
		position: absolute;
		top: 50%;
		width: 10px;
		height: 10px;
		background: #fff;
		border: 2px solid #43a047;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		transition: left 0.4s ease;
		z-index: 1;
	}
</style>
