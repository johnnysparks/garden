<script lang="ts">
	import { fly } from 'svelte/transition';
	import { energy, turn, type TurnPhase } from './hud-stores.svelte.js';

	// ── Action definitions ──────────────────────────────────────────

	export interface ActionDef {
		id: string;
		label: string;
		icon: string;
		energyCost: number;
		/** Whether this action requires a plot to be selected. */
		needsPlot: boolean;
		/** Whether this action requires the selected plot to be empty. */
		needsEmpty: boolean;
		/** Whether this action requires the selected plot to have a plant. */
		needsPlant: boolean;
		/** If true, show "Coming soon" tooltip instead of acting. */
		placeholder: boolean;
	}

	export const ACTIONS: ActionDef[] = [
		{
			id: 'plant',
			label: 'Plant',
			icon: '\uD83C\uDF31',
			energyCost: 1,
			needsPlot: true,
			needsEmpty: true,
			needsPlant: false,
			placeholder: false,
		},
		{
			id: 'amend',
			label: 'Amend',
			icon: '\uD83E\uDEBB',
			energyCost: 1,
			needsPlot: true,
			needsEmpty: false,
			needsPlant: false,
			placeholder: false,
		},
		{
			id: 'diagnose',
			label: 'Diagnose',
			icon: '\uD83D\uDD0D',
			energyCost: 1,
			needsPlot: true,
			needsEmpty: false,
			needsPlant: true,
			placeholder: true,
		},
		{
			id: 'scout',
			label: 'Scout',
			icon: '\uD83E\uDDED',
			energyCost: 1,
			needsPlot: false,
			needsEmpty: false,
			needsPlant: false,
			placeholder: false,
		},
		{
			id: 'wait',
			label: 'Wait',
			icon: '\u23F3',
			energyCost: 0,
			needsPlot: false,
			needsEmpty: false,
			needsPlant: false,
			placeholder: false,
		},
	];

	// ── Props ────────────────────────────────────────────────────────

	interface Props {
		selectedPlot: { row: number; col: number } | null;
		selectedPlotHasPlant: boolean;
		onAction: (actionId: string) => void;
	}

	let { selectedPlot, selectedPlotHasPlant, onAction }: Props = $props();

	// ── Derived state ────────────────────────────────────────────────

	let isActPhase = $derived(turn.phase === 'ACT');

	function isDisabled(action: ActionDef): boolean {
		if (!isActPhase) return true;
		if (action.energyCost > energy.current) return true;
		if (action.needsPlot && !selectedPlot) return true;
		if (action.needsEmpty && selectedPlot && selectedPlotHasPlant) return true;
		if (action.needsPlant && selectedPlot && !selectedPlotHasPlant) return true;
		return false;
	}

	// ── Toast state ──────────────────────────────────────────────────

	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	function showToast(msg: string) {
		toast = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toast = '';
		}, 1500);
	}

	function handleClick(action: ActionDef) {
		if (isDisabled(action)) return;
		if (action.placeholder) {
			showToast(`${action.label} — coming soon`);
			return;
		}
		onAction(action.id);
	}
</script>

{#if isActPhase}
	<div class="action-toolbar" transition:fly={{ y: 80, duration: 250 }}>
		<div class="action-buttons">
			{#each ACTIONS as action (action.id)}
				{@const disabled = isDisabled(action)}
				<button
					class="action-btn"
					class:disabled
					{disabled}
					onclick={() => handleClick(action)}
					title={action.placeholder ? `${action.label} — coming soon` : action.label}
				>
					<span class="action-icon">{action.icon}</span>
					<span class="action-label">{action.label}</span>
					{#if action.energyCost > 0}
						<span class="energy-badge">{action.energyCost}</span>
					{/if}
				</button>
			{/each}
		</div>
		{#if toast}
			<div class="toast" transition:fly={{ y: 20, duration: 150 }}>
				{toast}
			</div>
		{/if}
	</div>
{/if}

<style>
	.action-toolbar {
		position: relative;
		padding: 8px 12px 12px;
	}

	.action-buttons {
		display: flex;
		gap: 6px;
		justify-content: center;
	}

	.action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 8px 10px 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.08);
		color: #eee;
		font-size: 12px;
		cursor: pointer;
		position: relative;
		min-width: 56px;
		transition:
			background 0.15s ease,
			opacity 0.15s ease,
			transform 0.1s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.action-btn:not(.disabled):hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.action-btn:not(.disabled):active {
		transform: scale(0.95);
	}

	.action-btn.disabled {
		opacity: 0.35;
		cursor: default;
	}

	.action-icon {
		font-size: 20px;
		line-height: 1;
	}

	.action-label {
		font-family: monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.3px;
		text-transform: uppercase;
	}

	.energy-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		background: #ff9800;
		color: #1a1a1a;
		font-size: 9px;
		font-weight: 700;
		font-family: monospace;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.toast {
		position: absolute;
		top: -32px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		font-size: 12px;
		padding: 4px 12px;
		border-radius: 12px;
		white-space: nowrap;
		pointer-events: none;
	}
</style>
