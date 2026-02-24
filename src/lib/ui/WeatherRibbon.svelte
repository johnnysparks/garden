<script lang="ts">
	import {
		weather,
		weatherIcon,
		weatherDescription,
	} from './hud-stores.svelte.js';

	let expanded = $state(false);

	function toggle() {
		expanded = !expanded;
	}
</script>

<div class="weather-ribbon">
	<button class="ribbon-toggle" onclick={toggle}>
		<span class="current-icon">{weatherIcon(weather.current)}</span>
		<span class="current-desc">{weatherDescription(weather.current)}</span>
		<span class="toggle-arrow">{expanded ? '\u25B2' : '\u25BC'}</span>
	</button>

	{#if expanded}
		<div class="weather-cards">
			<div class="weather-card">
				<div class="card-label">This Week</div>
				<div class="card-icon">{weatherIcon(weather.current)}</div>
				<div class="card-temp">
					{weather.current.temp_high_c}&deg; / {weather.current.temp_low_c}&deg;
				</div>
				<div class="card-desc">{weatherDescription(weather.current)}</div>
				{#if weather.current.precipitation_mm > 1}
					<div class="card-precip">
						\uD83D\uDCA7 {weather.current.precipitation_mm.toFixed(0)}mm
					</div>
				{/if}
			</div>

			{#if weather.scouted && weather.next}
				<div class="weather-card scouted">
					<div class="card-label">Next Week</div>
					<div class="card-icon">{weatherIcon(weather.next)}</div>
					<div class="card-temp">
						{weather.next.temp_high_c}&deg; / {weather.next.temp_low_c}&deg;
					</div>
					<div class="card-desc">{weatherDescription(weather.next)}</div>
					{#if weather.next.precipitation_mm > 1}
						<div class="card-precip">
							\uD83D\uDCA7 {weather.next.precipitation_mm.toFixed(0)}mm
						</div>
					{/if}
				</div>
			{:else}
				<div class="weather-card locked">
					<div class="card-label">Next Week</div>
					<div class="card-icon">\uD83D\uDD12</div>
					<div class="card-desc">Scout to reveal</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.weather-ribbon {
		flex-shrink: 0;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.ribbon-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 16px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 14px;
		color: #555;
		font-family: monospace;
	}

	.ribbon-toggle:hover {
		background: rgba(0, 0, 0, 0.03);
	}

	.current-icon {
		font-size: 16px;
	}

	.current-desc {
		font-size: 12px;
		color: #777;
	}

	.toggle-arrow {
		font-size: 8px;
		margin-left: auto;
		color: #999;
	}

	.weather-cards {
		display: flex;
		gap: 8px;
		padding: 0 16px 8px;
	}

	.weather-card {
		flex: 1;
		padding: 8px;
		background: rgba(0, 0, 0, 0.03);
		border-radius: 6px;
		font-family: monospace;
		font-size: 12px;
		text-align: center;
	}

	.weather-card.locked {
		opacity: 0.5;
	}

	.card-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888;
		margin-bottom: 4px;
	}

	.card-icon {
		font-size: 20px;
		margin: 2px 0;
	}

	.card-temp {
		font-weight: 600;
		color: #444;
		margin: 2px 0;
	}

	.card-desc {
		color: #666;
	}

	.card-precip {
		color: #5c9bd6;
		margin-top: 2px;
	}
</style>
