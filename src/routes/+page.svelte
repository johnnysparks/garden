<script lang="ts">
	import { base } from '$app/paths';
</script>

<main>
	<h1>Perennial</h1>
	<p>A roguelike gardening simulator.</p>
	<nav>
		<a href="{base}/garden">Play</a>
	</nav>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 1rem;
	}

	nav a {
		font-size: 1.25rem;
		padding: 0.5rem 1.5rem;
		border: 1px solid currentColor;
		text-decoration: none;
	}

	nav a:hover {
		text-decoration: underline;
	}
</style>
