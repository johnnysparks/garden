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
		height: 100vh;
		overflow: hidden;
	}
</style>
