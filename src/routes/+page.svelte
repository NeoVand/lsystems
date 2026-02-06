<script lang="ts">
	import { onMount } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Canvas3D from '$lib/components/Canvas3D.svelte';
	import IconToolbar from '$lib/components/IconToolbar.svelte';
	import ControlPanel from '$lib/components/ControlPanel.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import type { ToolbarCategory } from '$lib/components/IconToolbar.svelte';
	import {
		visualState,
		engineState,
		lsystemParams,
		loadPreset,
		regenerate,
	} from '$lib/stores/lsystem.svelte';
	import { plant1 } from '$lib/presets/examples';
	import type { LineSegment } from '$lib/gpu/types';
	import type { Segment3D } from '$lib/turtle/turtle-3d';

	// Canvas refs for export
	let canvasRef: Canvas | null = $state(null);
	let canvas3DRef: Canvas3D | null = $state(null);

	// Note: Canvas and Canvas3D components handle their own rendering via computeVertexBuffer()
	// These are only used as fallback/for legacy compatibility
	let segments: LineSegment[] = $state([]);
	let segments3D: Segment3D[] = $state([]);
	
	// UI state
	let activeCategory: ToolbarCategory | null = $state(null);

	onMount(() => {
		loadPreset(plant1);
	});

	function handleCategorySelect(category: ToolbarCategory) {
		// Toggle off if same category
		if (activeCategory === category) {
			activeCategory = null;
		} else {
			activeCategory = category;
		}
	}

	function handleClosePanel() {
		activeCategory = null;
	}

	function handleExportPNG() {
		if (visualState.is3D) {
			canvas3DRef?.exportPNG?.();
		} else {
			canvasRef?.exportPNG?.();
		}
	}

	function handleExportSVG() {
		if (visualState.is3D) {
			// 3D SVG export not supported
			alert('SVG export is only available in 2D mode');
		} else {
			canvasRef?.exportSVG?.();
		}
	}
</script>

<svelte:head>
	<title>L-System Lab</title>
</svelte:head>

<!-- Full-screen canvas (2D or 3D) -->
<div class="canvas-container">
	{#key visualState.is3D}
		{#if visualState.is3D}
			<Canvas3D bind:this={canvas3DRef} segments={segments3D} backgroundColor={visualState.backgroundColor} />
		{:else}
			<Canvas bind:this={canvasRef} {segments} backgroundColor={visualState.backgroundColor} />
		{/if}
	{/key}
</div>

<!-- Icon Toolbar (left side) with regenerate button -->
<div class="toolbar-container">
	<IconToolbar {activeCategory} onSelect={handleCategorySelect} />
	<button
		class="regenerate-btn"
		onclick={() => regenerate()}
		title="Regenerate (R)"
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
		</svg>
	</button>
</div>

<!-- Control Panel (next to toolbar when active) -->
{#if activeCategory}
	<div class="panel-container">
		<ControlPanel category={activeCategory} onClose={handleClosePanel} />
	</div>
{/if}

<!-- Bottom Bar -->
<div class="bottom-container">
	<BottomBar onExportPNG={handleExportPNG} onExportSVG={handleExportSVG} />
</div>

<!-- Stats overlay (top-left, next to toolbar) -->
<div class="stats-overlay">
	<div class="stat">
		<span class="stat-label">Symbols</span>
		<span class="stat-value">{engineState.symbolCount.toLocaleString()}</span>
	</div>
	<div class="stat">
		<span class="stat-label">Lines</span>
		<span class="stat-value">{engineState.segmentCount.toLocaleString()}</span>
	</div>
	{#if engineState.isComputing}
		<div class="computing-indicator">
			<svg class="spinner" viewBox="0 0 24 24">
				<circle class="spinner-track" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" />
				<path class="spinner-head" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
			</svg>
		</div>
	{/if}
</div>

<!-- Keyboard shortcut hints (shown only on desktop) -->
<div class="keyboard-hints">
	<span class="hint"><kbd>1-6</kbd> Categories</span>
	<span class="hint"><kbd>R</kbd> Regenerate</span>
	<span class="hint"><kbd>↑↓</kbd> Iterations</span>
	<span class="hint"><kbd>Esc</kbd> Close</span>
</div>

<!-- Keyboard shortcuts -->
<svelte:window
	onkeydown={(e) => {
		// Ignore if typing in input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		// Close panel with Escape
		if (e.code === 'Escape' && activeCategory) {
			e.preventDefault();
			activeCategory = null;
			return;
		}

		// Category shortcuts (1-6)
		const categories: ToolbarCategory[] = ['plants', 'fractals', 'patterns', 'structures', 'colors', 'settings'];
		if (e.key >= '1' && e.key <= '6') {
			e.preventDefault();
			const idx = parseInt(e.key) - 1;
			activeCategory = activeCategory === categories[idx] ? null : categories[idx];
			return;
		}

		// Regenerate with R
		if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) {
			e.preventDefault();
			regenerate();
			return;
		}

		// Iterations with arrow keys
		if (e.code === 'ArrowUp' && !e.metaKey && !e.ctrlKey) {
			e.preventDefault();
			const max = 12; // Reasonable safe max
			if (lsystemParams.iterations < max) {
				lsystemParams.iterations++;
			}
			return;
		}
		if (e.code === 'ArrowDown' && !e.metaKey && !e.ctrlKey) {
			e.preventDefault();
			if (lsystemParams.iterations > 1) {
				lsystemParams.iterations--;
			}
			return;
		}

		// 2D/3D toggle with Space
		if (e.code === 'Space' && !e.metaKey && !e.ctrlKey) {
			e.preventDefault();
			visualState.is3D = !visualState.is3D;
			return;
		}
	}}
/>

<style>
	/* Full-screen canvas */
	.canvas-container {
		position: fixed;
		inset: 0;
		background: rgb(10, 10, 15);
	}

	/* Icon Toolbar + Regenerate */
	.toolbar-container {
		position: fixed;
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	/* Regenerate button (below toolbar) */
	.regenerate-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: rgba(15, 15, 20, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.5);
		transition: all 0.15s;
	}

	.regenerate-btn:hover {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(16, 185, 129, 0.4);
		color: rgb(16, 185, 129);
	}

	.regenerate-btn svg {
		width: 18px;
		height: 18px;
	}

	/* Control Panel */
	.panel-container {
		position: fixed;
		left: 72px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 15;
	}

	/* Bottom Bar */
	.bottom-container {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
	}

	/* Stats Overlay (top-left, away from 3D controls) */
	.stats-overlay {
		position: fixed;
		top: 16px;
		left: 72px;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 14px;
		background: rgba(15, 15, 20, 0.8);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		z-index: 10;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.stat-label {
		font-size: 9px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: rgba(255, 255, 255, 0.4);
	}

	.stat-value {
		font-size: 13px;
		font-family: ui-monospace, monospace;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.8);
	}

	.computing-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spinner {
		width: 18px;
		height: 18px;
		color: rgb(16, 185, 129);
	}

	.spinner-track {
		opacity: 0.2;
	}

	.spinner-head {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
			transform-origin: 12px 12px;
		}
		to {
			transform: rotate(360deg);
			transform-origin: 12px 12px;
		}
	}

	/* Keyboard hints (positioned above bottom bar) */
	.keyboard-hints {
		position: fixed;
		bottom: 70px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		background: rgba(15, 15, 20, 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		z-index: 5;
		pointer-events: none;
	}

	.hint {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.35);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.hint kbd {
		display: inline-block;
		padding: 2px 5px;
		font-family: ui-monospace, monospace;
		font-size: 9px;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Mobile adjustments */
	@media (max-width: 640px) {
		.toolbar-container {
			left: 12px;
			bottom: 80px;
			top: auto;
			transform: none;
			flex-direction: row;
		}

		.panel-container {
			left: 12px;
			bottom: 140px;
			top: auto;
			transform: none;
		}

		.bottom-container {
			bottom: 12px;
		}

		.stats-overlay {
			top: 12px;
			left: 12px;
			padding: 6px 10px;
			gap: 12px;
		}

		/* Hide keyboard hints on mobile */
		.keyboard-hints {
			display: none;
		}
	}

	/* Touch-friendly tap targets */
	@media (pointer: coarse) {
		.regenerate-btn {
			width: 44px;
			height: 44px;
		}
	}
</style>
