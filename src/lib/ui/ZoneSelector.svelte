<script lang="ts">
	import type { ClimateZone } from '$lib/engine/weather-gen.js';

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		zones: ClimateZone[];
		selected: string;
		onSelect: (zoneId: string) => void;
	}

	let { zones, selected, onSelect }: Props = $props();

	/** Extract short label from zone name (e.g. "Zone 8a") */
	function shortLabel(zone: ClimateZone): string {
		const match = zone.name.match(/Zone\s+(\S+)/);
		return match ? match[1] : zone.id;
	}

	/** Extract region description after the dash (e.g. "Pacific Northwest") */
	function regionLabel(zone: ClimateZone): string {
		const idx = zone.name.indexOf('\u2014');
		if (idx >= 0) return zone.name.slice(idx + 1).trim();
		const dashIdx = zone.name.indexOf('-');
		if (dashIdx >= 0) return zone.name.slice(dashIdx + 1).trim();
		return '';
	}

	/** Frost-free weeks as a readable range */
	function frostInfo(zone: ClimateZone): string {
		const weeks = zone.frost_free_weeks[1] - zone.frost_free_weeks[0];
		return `${weeks} frost-free weeks`;
	}
</script>

<div class="zone-selector" role="group" aria-label="Climate Zone">
	<span class="zone-label">Climate Zone</span>
	<div class="zone-options">
		{#each zones as zone (zone.id)}
			<button
				class="zone-btn"
				class:active={selected === zone.id}
				onclick={() => onSelect(zone.id)}
			>
				<span class="zone-code">{shortLabel(zone)}</span>
				<span class="zone-region">{regionLabel(zone)}</span>
				<span class="zone-frost">{frostInfo(zone)}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.zone-selector {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.zone-label {
		font-family: monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #558b2f;
	}

	.zone-options {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.zone-btn {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.55rem 0.75rem;
		border: 1px solid #c8e6c9;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.5);
		color: #4e342e;
		cursor: pointer;
		text-align: left;
		transition:
			background 0.12s ease,
			border-color 0.12s ease,
			transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.zone-btn:hover {
		background: rgba(255, 255, 255, 0.8);
		border-color: #81c784;
	}

	.zone-btn:active {
		transform: scale(0.98);
	}

	.zone-btn.active {
		background: #558b2f;
		border-color: #558b2f;
		color: #fff;
	}

	.zone-code {
		font-family: monospace;
		font-size: 0.85rem;
		font-weight: 700;
		flex-shrink: 0;
		min-width: 2.2rem;
	}

	.zone-region {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 0.8rem;
		flex: 1;
	}

	.zone-btn.active .zone-region {
		color: rgba(255, 255, 255, 0.85);
	}

	.zone-frost {
		font-family: monospace;
		font-size: 0.62rem;
		color: #8d6e63;
		flex-shrink: 0;
	}

	.zone-btn.active .zone-frost {
		color: rgba(255, 255, 255, 0.7);
	}
</style>
