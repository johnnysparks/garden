<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { untrack } from 'svelte';
	import PlantRenderer from './PlantRenderer.svelte';
	import {
		calculateSway,
		breathe,
		stressTremor,
		harvestPop,
		generateParticleBurst,
		type WindState,
		type Particle,
	} from './animation.js';
	import type { PlantVisualParams, GrowthStageId } from '$lib/data/types.js';
	import type { SeasonPalette } from './palette.js';

	// ── Props ────────────────────────────────────────────────────────────────────
	// The parent manages a single rAF loop for the whole garden and passes
	// windState + timeMs down. This component computes its transforms
	// synchronously — no per-plant animation frame.

	interface Props {
		visualParams: PlantVisualParams;
		growthProgress: number; // 0-1
		stress: number; // 0-1
		instanceSeed: number;
		windState: WindState;
		timeMs: number;
		stage: GrowthStageId;
		palette?: SeasonPalette;
		/** Heliotropism lean in degrees (positive = lean right toward west). */
		sunLean?: number;
	}

	let {
		visualParams,
		growthProgress,
		stress,
		instanceSeed,
		windState,
		timeMs,
		stage,
		palette,
		sunLean = 0,
	}: Props = $props();

	// ── Springs ──────────────────────────────────────────────────────────────────
	// Smooth transitions when game-tick values jump between frames.
	// Initial prop capture is intentional; $effect blocks below track changes.

	const growthSpring = new Spring(untrack(() => growthProgress), {
		stiffness: untrack(() => visualParams.animation.growth_spring_tension),
		damping: 0.7,
	});

	const stressSpring = new Spring(untrack(() => stress), {
		stiffness: 0.05,
		damping: 0.7,
	});

	$effect(() => {
		growthSpring.target = growthProgress;
	});
	$effect(() => {
		stressSpring.target = stress;
	});

	// ── Derived constants ────────────────────────────────────────────────────────

	let plantMass = $derived(
		visualParams.stem.height[1] * visualParams.leaves.count[1],
	);

	let particleColor = $derived(
		visualParams.fruit?.color_ripe ?? visualParams.flowers?.color ?? '#ffd700',
	);

	// ── Synchronous per-frame animation values ──────────────────────────────────
	// Recomputed reactively whenever the parent updates timeMs or windState.

	let swayX = $derived(
		calculateSway(
			visualParams.animation.sway_amplitude,
			visualParams.animation.sway_frequency,
			plantMass,
			windState,
			timeMs,
		),
	);

	let breatheScale = $derived(
		breathe(timeMs, visualParams.animation.idle_breathing),
	);

	let tremor = $derived(stressTremor(timeMs, stressSpring.current));

	// ── Harvest animation ────────────────────────────────────────────────────────

	const HARVEST_DURATION = 600; // ms

	let harvesting = $state(false);
	let harvestStartTime = 0;

	let harvestProgress = $derived(
		harvesting
			? Math.min(1, (timeMs - harvestStartTime) / HARVEST_DURATION)
			: 0,
	);

	let pop = $derived(harvesting ? harvestPop(harvestProgress) : null);

	let particles = $derived<Particle[]>(
		harvesting ? generateParticleBurst(5, harvestProgress) : [],
	);

	// Auto-end harvest when animation completes
	$effect(() => {
		if (harvesting && harvestProgress >= 1) {
			harvesting = false;
		}
	});

	// ── Final transform ─────────────────────────────────────────────────────────

	let transformStyle = $derived.by(() => {
		const tx = swayX + tremor.x;
		const rot = sunLean;
		if (pop) {
			const ty = tremor.y + pop.y;
			const s = breatheScale * pop.scale;
			return `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${s})`;
		}
		return `translate(${tx}px, ${tremor.y}px) rotate(${rot}deg) scale(${breatheScale})`;
	});

	let plantOpacity = $derived(pop ? pop.opacity : 1);

	// ── Public API ───────────────────────────────────────────────────────────────

	/**
	 * Play the harvest pop + particle burst sequence.
	 * Call via bind:this on the component instance.
	 */
	export function triggerHarvest() {
		if (harvesting) return;
		harvesting = true;
		harvestStartTime = timeMs;
	}
</script>

<!--
  Outer <g> receives CSS transforms every frame.
  will-change hints the browser to promote to its own compositing layer.
  style: bindings (not attribute bindings) for GPU-composited transforms.
-->
<g
	class="animated-plant"
	style:transform={transformStyle}
	style:opacity={plantOpacity}
	style:will-change="transform, opacity"
	style:transform-origin="center bottom"
>
	<PlantRenderer
		params={visualParams}
		growthProgress={growthSpring.current}
		stress={stressSpring.current}
		{instanceSeed}
		{stage}
		{palette}
	/>

	<!-- Harvest particle burst -->
	{#if harvesting && particles.length > 0}
		{#each particles as p}
			<circle
				cx={p.x}
				cy={p.y}
				r={3 * p.scale}
				fill={particleColor}
				opacity={p.opacity}
			/>
		{/each}
	{/if}
</g>
