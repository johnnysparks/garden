<script lang="ts">
	let { children } = $props();
</script>

<div class="garden-layout">
	{@render children()}
</div>

<style>
	.garden-layout {
		display: flex;
		flex-direction: column;
		position: fixed;
		inset: 0;
		overflow: hidden;
		touch-action: none;
		overscroll-behavior: none;
	}
</style>
