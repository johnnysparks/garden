<script lang="ts" module>
	// ── Shared rAF Loop ─────────────────────────────────────────────────────────
	// One loop drives all AnimatedPlant instances. Each instance registers a
	// per-frame callback; the loop updates global wind once, then invokes them all.

	import {
		updateWind,
		createWindState,
		type WindState,
	} from './animation.js';

	type FrameCallback = (wind: WindState, time: number, deltaTime: number) => void;

	const callbacks = new Set<FrameCallback>();
	let windState: WindState = createWindState();
	let totalTime = 0;
	let lastTimestamp = 0;
	let rafId: number | null = null;

	function tick(timestamp: number) {
		if (lastTimestamp === 0) lastTimestamp = timestamp;
		const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // cap at 100 ms
		lastTimestamp = timestamp;
		totalTime += deltaTime;

		// Global wind — computed once, shared by every plant.
		windState = updateWind(windState, deltaTime, totalTime);

		for (const cb of callbacks) {
			cb(windState, totalTime, deltaTime);
		}

		if (callbacks.size > 0) {
			rafId = requestAnimationFrame(tick);
		} else {
			rafId = null;
		}
	}

	function registerCallback(cb: FrameCallback) {
		callbacks.add(cb);
		if (rafId === null) {
			lastTimestamp = 0;
			rafId = requestAnimationFrame(tick);
		}
	}

	function unregisterCallback(cb: FrameCallback) {
		callbacks.delete(cb);
		if (callbacks.size === 0 && rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}
</script>

<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { onMount } from 'svelte';
	import PlantRenderer from './PlantRenderer.svelte';
	import {
		calculateSway,
		breathe,
		stressTremor,
		harvestPop,
		generateParticleBurst,
		type WindState as WindStateAlias,
		type Particle,
	} from './animation.js';
	import type { PlantVisualParams, GrowthStageId } from '$lib/data/types.js';

	// ── Props ────────────────────────────────────────────────────────────────────

	interface Props {
		params: PlantVisualParams;
		growthProgress: number; // 0-1
		stress: number; // 0-1
		instanceSeed: number;
		stage: GrowthStageId;
	}

	let { params, growthProgress, stress, instanceSeed, stage }: Props = $props();

	// ── Springs ──────────────────────────────────────────────────────────────────
	// Smooth transitions when game-tick values jump between frames.
	// Initial prop capture is intentional; $effect blocks below track changes.

	const growthSpring = new Spring(growthProgress, {
		stiffness: params.animation.growth_spring_tension,
		damping: 0.7,
	});

	const stressSpring = new Spring(stress, {
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

	let plantMass = $derived(params.stem.height[1] * params.leaves.count[1]);

	let particleColor = $derived(
		params.fruit?.color_ripe ?? params.flowers?.color ?? '#ffd700',
	);

	// ── Per-frame state (written by rAF, read by template) ───────────────────────

	let transformStyle = $state('');
	let plantOpacity = $state(1);

	// ── Harvest animation ────────────────────────────────────────────────────────

	const HARVEST_DURATION = 0.6; // seconds

	let harvesting = $state(false);
	let harvestStartTime = 0; // plain var — only rAF + triggerHarvest touch it
	let particles = $state<Particle[]>([]);

	// ── rAF callback ─────────────────────────────────────────────────────────────

	function onFrame(wind: WindStateAlias, time: number, _dt: number) {
		const currentStress = stressSpring.current;

		// Sway
		const swayX = calculateSway(
			plantMass,
			params.animation.sway_amplitude,
			params.animation.sway_frequency,
			wind,
			time,
		);

		// Breathing
		const breatheScale = breathe(time, params.animation.idle_breathing);

		// Stress tremor
		const tremor = stressTremor(time, currentStress);

		if (harvesting) {
			const progress = Math.min(1, (time - harvestStartTime) / HARVEST_DURATION);
			const pop = harvestPop(progress);

			particles = generateParticleBurst(5, progress);

			const tx = swayX + tremor.x;
			const ty = tremor.y + pop.y;
			const s = breatheScale * pop.scale;

			transformStyle = `translate(${tx}px, ${ty}px) scale(${s})`;
			plantOpacity = pop.opacity;

			if (progress >= 1) {
				harvesting = false;
				particles = [];
				plantOpacity = 1;
			}
		} else {
			const tx = swayX + tremor.x;
			const ty = tremor.y;

			transformStyle = `translate(${tx}px, ${ty}px) scale(${breatheScale})`;
			plantOpacity = 1;
		}
	}

	// ── Lifecycle ────────────────────────────────────────────────────────────────

	onMount(() => {
		registerCallback(onFrame);
		return () => unregisterCallback(onFrame);
	});

	// ── Public API ───────────────────────────────────────────────────────────────

	/**
	 * Play the harvest pop + particle burst sequence.
	 * Call via bind:this on the component instance.
	 */
	export function triggerHarvest() {
		if (harvesting) return;
		harvesting = true;
		harvestStartTime = totalTime;
	}
</script>

<!--
  Outer <g> receives CSS transforms every frame.
  will-change hints the browser to promote to its own compositing layer.
  No SVG structure inside PlantRenderer is touched during animation.
-->
<g
	class="animated-plant"
	style:transform={transformStyle}
	style:opacity={plantOpacity}
	style:will-change="transform, opacity"
	style:transform-origin="center bottom"
>
	<PlantRenderer
		{params}
		growthProgress={growthSpring.current}
		stress={stressSpring.current}
		{instanceSeed}
		{stage}
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
