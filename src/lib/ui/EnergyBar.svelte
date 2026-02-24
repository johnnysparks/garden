<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { energy } from './hud-stores.svelte.js';

	const animated = new Spring(energy.current, {
		stiffness: 0.15,
		damping: 0.4,
	});

	$effect(() => {
		animated.target = energy.current;
	});
</script>

<div class="energy-bar">
	<span class="energy-label">AP</span>
	{#each { length: energy.max } as _, i}
		{@const fill = Math.min(1, Math.max(0, animated.current - i))}
		<span
			class="dot"
			class:filled={fill > 0.5}
			style:transform="scale({0.8 + fill * 0.2})"
			style:opacity={fill > 0.5 ? 1 : 0.3}
		>
			{fill > 0.5 ? '\u26A1' : '\u25CB'}
		</span>
	{/each}
</div>

<style>
	.energy-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 16px;
		font-size: 18px;
		flex-shrink: 0;
	}

	.energy-label {
		font-family: monospace;
		font-size: 11px;
		font-weight: 700;
		color: #888;
		letter-spacing: 0.5px;
		margin-right: 4px;
	}

	.dot {
		display: inline-block;
		line-height: 1;
		user-select: none;
	}

	.filled {
		filter: drop-shadow(0 0 3px rgba(255, 193, 7, 0.5));
	}
</style>
