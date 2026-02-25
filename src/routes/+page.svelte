<script lang="ts">
	import { base } from '$app/paths';
	import { getAllZones } from '$lib/data/index.js';
	import ZoneSelector from '$lib/ui/ZoneSelector.svelte';

	const zones = getAllZones();

	let selectedZone = $state(zones.find((z) => z.id === 'zone_8a')?.id ?? zones[0]?.id ?? '');
	let seedInput = $state('');

	let currentZone = $derived(zones.find((z) => z.id === selectedZone));
	let frostFreeWeeks = $derived(
		currentZone ? currentZone.frost_free_weeks[1] - currentZone.frost_free_weeks[0] : 0,
	);
	let speciesCount = $derived.by(() => {
		// Avoid importing getAllSpecies at module level to keep the landing page light;
		// the count in the meta line updates reactively based on zone selection.
		// For now, use a static count matching the loaded species data.
		return zones.length > 0 ? 6 : 0;
	});

	/** Build the garden URL with zone and optional seed as query params. */
	let gardenHref = $derived.by(() => {
		const params = new URLSearchParams();
		params.set('zone', selectedZone);
		if (seedInput.trim() !== '') {
			params.set('seed', seedInput.trim());
		}
		return `${base}/garden?${params.toString()}`;
	});

	/** Short zone label for the meta line (e.g. "Zone 8a"). */
	let zoneShortName = $derived.by(() => {
		if (!currentZone) return '';
		const match = currentZone.name.match(/Zone\s+\S+/);
		return match ? match[0] : currentZone.id;
	});
</script>

<svelte:head>
	<title>Perennial</title>
</svelte:head>

<main class="landing">
	<div class="illustration" aria-hidden="true">
		<!-- Botanical garden scene — early spring palette -->
		<svg viewBox="0 0 375 200" xmlns="http://www.w3.org/2000/svg" role="img">
			<!-- Soil band -->
			<rect x="0" y="152" width="375" height="48" fill="#5d4037" />
			<!-- Soil surface texture -->
			<path d="M0,153 Q90,149 188,153 Q280,157 375,153" stroke="#6d4c41" stroke-width="3" fill="none" />
			<ellipse cx="48" cy="163" rx="7" ry="3" fill="#6d4c41" opacity="0.55" />
			<ellipse cx="152" cy="166" rx="6" ry="2.5" fill="#4e342e" opacity="0.45" />
			<ellipse cx="248" cy="162" rx="8" ry="3" fill="#6d4c41" opacity="0.5" />
			<ellipse cx="335" cy="168" rx="5" ry="2.5" fill="#4e342e" opacity="0.55" />

			<!-- ── BASIL (x=80, bushy compact herb) ─────────────── -->
			<path d="M80,152 L80,98" stroke="#5d8a2c" stroke-width="2.5" stroke-linecap="round" fill="none" />
			<!-- Bottom opposite leaf pair -->
			<ellipse cx="63" cy="143" rx="15" ry="7.5" fill="#81c784" transform="rotate(-30, 63, 143)" />
			<ellipse cx="97" cy="143" rx="15" ry="7.5" fill="#6db56d" transform="rotate(30, 97, 143)" />
			<!-- Middle pair -->
			<ellipse cx="61" cy="127" rx="16" ry="8" fill="#81c784" transform="rotate(-35, 61, 127)" />
			<ellipse cx="99" cy="127" rx="16" ry="8" fill="#6db56d" transform="rotate(35, 99, 127)" />
			<!-- Upper pair -->
			<ellipse cx="65" cy="112" rx="13" ry="6.5" fill="#81c784" transform="rotate(-25, 65, 112)" />
			<ellipse cx="95" cy="112" rx="13" ry="6.5" fill="#6db56d" transform="rotate(25, 95, 112)" />
			<!-- Terminal cluster -->
			<ellipse cx="74" cy="101" rx="8" ry="10" fill="#a5d6a7" />
			<ellipse cx="86" cy="101" rx="8" ry="10" fill="#81c784" />
			<ellipse cx="80" cy="98" rx="7" ry="8" fill="#a5d6a7" />

			<!-- ── TOMATO VINE (x=190, indeterminate, tallest) ─── -->
			<path d="M190,152 C192,135 186,118 190,102 C194,87 188,72 191,58"
				stroke="#5a7a30" stroke-width="3" stroke-linecap="round" fill="none" />
			<!-- Side branch left -->
			<path d="M190,128 C178,119 164,114 156,107"
				stroke="#5a7a30" stroke-width="1.8" stroke-linecap="round" fill="none" />
			<!-- Side branch right -->
			<path d="M190,102 C202,93 213,88 220,80"
				stroke="#5a7a30" stroke-width="1.8" stroke-linecap="round" fill="none" />
			<!-- Left branch compound leaves (simplified as grouped leaflets) -->
			<ellipse cx="167" cy="115" rx="13" ry="6.5" fill="#81c784" transform="rotate(-18, 167, 115)" />
			<ellipse cx="157" cy="108" rx="12" ry="6" fill="#6db56d" transform="rotate(-34, 157, 108)" />
			<ellipse cx="161" cy="103" rx="10" ry="5" fill="#81c784" transform="rotate(-8, 161, 103)" />
			<!-- Right branch leaves -->
			<ellipse cx="213" cy="89" rx="12" ry="6" fill="#81c784" transform="rotate(14, 213, 89)" />
			<ellipse cx="221" cy="81" rx="11" ry="5.5" fill="#6db56d" transform="rotate(29, 221, 81)" />
			<!-- Top leaves -->
			<ellipse cx="183" cy="70" rx="12" ry="6" fill="#81c784" transform="rotate(-24, 183, 70)" />
			<ellipse cx="199" cy="63" rx="10" ry="5" fill="#6db56d" transform="rotate(18, 199, 63)" />
			<!-- Fruit: main ripe tomato -->
			<circle cx="172" cy="124" r="12" fill="#e53935" />
			<circle cx="172" cy="124" r="12" fill="none" stroke="#b71c1c" stroke-width="0.8" />
			<!-- Calyx -->
			<path d="M169,113 C170,115 172,114 174,113 C175,115 177,114 178,113"
				stroke="#5a7a30" stroke-width="1.5" fill="none" stroke-linecap="round" />
			<!-- Second smaller unripe fruit -->
			<circle cx="198" cy="108" r="8" fill="#81c784" />
			<circle cx="198" cy="108" r="8" fill="none" stroke="#558b2f" stroke-width="0.7" />
			<path d="M196,101 C197,103 199,102 200,101" stroke="#5a7a30" stroke-width="1.2" fill="none" stroke-linecap="round" />

			<!-- ── CARROT (x=297, feathery fronds) ─────────────── -->
			<!-- Frond left -->
			<path d="M297,152 C293,139 286,123 280,106"
				stroke="#66bb6a" stroke-width="1.8" stroke-linecap="round" fill="none" />
			<!-- Frond center -->
			<path d="M297,152 C296,137 295,120 295,98"
				stroke="#66bb6a" stroke-width="1.8" stroke-linecap="round" fill="none" />
			<!-- Frond right -->
			<path d="M297,152 C301,139 308,123 315,106"
				stroke="#66bb6a" stroke-width="1.8" stroke-linecap="round" fill="none" />
			<!-- Leaflets — left frond -->
			<ellipse cx="277" cy="120" rx="9" ry="4" fill="#81c784" transform="rotate(-52, 277, 120)" />
			<ellipse cx="282" cy="108" rx="8" ry="3.5" fill="#a5d6a7" transform="rotate(-42, 282, 108)" />
			<!-- Leaflets — center frond -->
			<ellipse cx="289" cy="118" rx="7.5" ry="3.5" fill="#81c784" transform="rotate(-62, 289, 118)" />
			<ellipse cx="303" cy="118" rx="7.5" ry="3.5" fill="#a5d6a7" transform="rotate(62, 303, 118)" />
			<ellipse cx="293" cy="104" rx="6.5" ry="3" fill="#81c784" transform="rotate(-48, 293, 104)" />
			<ellipse cx="299" cy="103" rx="6.5" ry="3" fill="#a5d6a7" transform="rotate(48, 299, 103)" />
			<!-- Leaflets — right frond -->
			<ellipse cx="313" cy="120" rx="9" ry="4" fill="#81c784" transform="rotate(52, 313, 120)" />
			<ellipse cx="309" cy="108" rx="8" ry="3.5" fill="#a5d6a7" transform="rotate(42, 309, 108)" />
			<!-- Carrot shoulder at soil line -->
			<path d="M293,153 L301,153 C302,159 303,170 301,182 L297,188 C295,180 293,164 293,153 Z"
				fill="#ff8f00" opacity="0.88" />

			<!-- ── Edge seedlings ─────────────────────────────── -->
			<!-- Left seedling -->
			<path d="M27,152 C25,144 19,137 13,132" stroke="#a5d6a7" stroke-width="1.5" fill="none" stroke-linecap="round" />
			<path d="M27,152 C29,144 35,137 41,132" stroke="#a5d6a7" stroke-width="1.5" fill="none" stroke-linecap="round" />
			<ellipse cx="12" cy="131" rx="7" ry="4" fill="#c8e6c9" transform="rotate(-28, 12, 131)" />
			<ellipse cx="41" cy="131" rx="7" ry="4" fill="#c8e6c9" transform="rotate(28, 41, 131)" />
			<!-- Right seedling -->
			<path d="M353,152 C351,145 347,139 341,135" stroke="#a5d6a7" stroke-width="1.5" fill="none" stroke-linecap="round" />
			<path d="M353,152 C355,145 359,139 365,135" stroke="#a5d6a7" stroke-width="1.5" fill="none" stroke-linecap="round" />
			<ellipse cx="340" cy="134" rx="7" ry="4" fill="#c8e6c9" transform="rotate(-28, 340, 134)" />
			<ellipse cx="365" cy="134" rx="7" ry="4" fill="#c8e6c9" transform="rotate(28, 365, 134)" />
		</svg>
	</div>

	<div class="content">
		<h1 class="title">PERENNIAL</h1>
		<div class="rule" aria-hidden="true"></div>
		<p class="subtitle">A roguelike gardening simulator</p>
		<p class="tagline">
			Each run is a growing season.<br />
			Death comes by frost.
		</p>

		<div class="run-config">
			<ZoneSelector
				{zones}
				selected={selectedZone}
				onSelect={(id) => (selectedZone = id)}
			/>

			<div class="seed-field">
				<label class="seed-label" for="seed-input">Seed</label>
				<input
					id="seed-input"
					class="seed-input"
					type="text"
					placeholder="Random"
					bind:value={seedInput}
					maxlength="20"
				/>
			</div>
		</div>

		<nav>
			<a href={gardenHref} class="play-btn">New Season</a>
		</nav>
		<p class="meta">{zoneShortName} &middot; {speciesCount} species &middot; 30-week season</p>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #e8f5e9;
	}

	.landing {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: #e8f5e9;
		padding: 2rem 1.5rem 2.5rem;
		box-sizing: border-box;
		gap: 0;
	}

	/* ── Illustration ──────────────────────────────────── */

	.illustration {
		width: 100%;
		max-width: 480px;
		margin-bottom: 0.5rem;
	}

	.illustration svg {
		width: 100%;
		height: auto;
		display: block;
	}

	/* ── Content ───────────────────────────────────────── */

	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.6rem;
		max-width: 380px;
		width: 100%;
	}

	.title {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(2.4rem, 9vw, 3.8rem);
		font-weight: 400;
		letter-spacing: 0.3em;
		color: #2e4a1e;
		margin: 0;
		line-height: 1;
		/* Trim the letter-spacing gap on the right */
		padding-left: 0.3em;
	}

	.rule {
		width: 4rem;
		height: 1px;
		background: #81c784;
		margin: 0.2rem 0;
	}

	.subtitle {
		font-family: monospace;
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #558b2f;
		margin: 0;
	}

	.tagline {
		font-family: Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-size: 1rem;
		line-height: 1.65;
		color: #4e342e;
		margin: 0.3rem 0 0.1rem;
	}

	/* ── Run config (zone + seed) ─────────────────────── */

	.run-config {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.2rem;
	}

	.seed-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.seed-label {
		font-family: monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #558b2f;
	}

	.seed-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid #c8e6c9;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.5);
		color: #4e342e;
		font-family: monospace;
		font-size: 0.8rem;
		box-sizing: border-box;
		outline: none;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.seed-input::placeholder {
		color: #a1887f;
		font-style: italic;
	}

	.seed-input:focus {
		border-color: #81c784;
		background: rgba(255, 255, 255, 0.8);
	}

	/* ── Play button ───────────────────────────────────── */

	.play-btn {
		display: inline-block;
		font-family: monospace;
		font-size: 0.9rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #fff;
		background: #558b2f;
		padding: 0.75rem 2.75rem;
		border-radius: 3px;
		text-decoration: none;
		margin-top: 0.4rem;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.play-btn:hover {
		background: #33691e;
	}

	.play-btn:active {
		transform: scale(0.97);
	}

	/* ── Meta line ─────────────────────────────────────── */

	.meta {
		font-family: monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		color: #8d6e63;
		margin: 0.1rem 0 0;
		opacity: 0.85;
	}

	/* ── Wide screens: side-by-side ────────────────────── */

	@media (min-width: 700px) {
		.landing {
			flex-direction: row;
			justify-content: center;
			gap: 3rem;
			padding: 3rem 4rem;
		}

		.illustration {
			max-width: 420px;
			flex: 1 1 420px;
			margin-bottom: 0;
		}

		.content {
			flex: 0 0 auto;
			align-items: flex-start;
			text-align: left;
			max-width: 320px;
		}

		.rule {
			align-self: flex-start;
		}
	}
</style>
