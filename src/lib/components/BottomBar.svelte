<script lang="ts">
	/**
	 * BottomBar - Always-visible control strip
	 * Contains 2D/3D toggle, iterations, and export buttons
	 */

	import {
		lsystemParams,
		visualState,
		setIterations,
		getSafeMaxIterations,
	} from '../stores/lsystem.svelte';

	interface Props {
		onExportPNG: () => void;
		onExportSVG: () => void;
	}

	let { onExportPNG, onExportSVG }: Props = $props();

	const safeMax = $derived(getSafeMaxIterations());
</script>

<div class="bottom-bar">
	<!-- 2D/3D Toggle -->
	<div class="toggle-group">
		<button
			class="toggle-btn"
			class:active={!visualState.is3D}
			onclick={() => (visualState.is3D = false)}
		>
			2D
		</button>
		<button
			class="toggle-btn"
			class:active={visualState.is3D}
			onclick={() => (visualState.is3D = true)}
		>
			3D
		</button>
	</div>

	<!-- Iterations Slider -->
	<div class="slider-group">
		<span class="slider-label">Iterations</span>
		<input
			type="range"
			class="slider"
			min={0}
			max={Math.min(safeMax + 5, 30)}
			step={1}
			value={lsystemParams.iterations}
			oninput={(e) => setIterations(parseInt(e.currentTarget.value))}
		/>
		<span class="slider-value">{lsystemParams.iterations}</span>
	</div>

	<!-- Export Buttons -->
	<div class="export-group">
		<button class="export-btn" onclick={onExportPNG} title="Export as PNG">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="18" height="18" rx="2" />
				<circle cx="8.5" cy="8.5" r="1.5" />
				<path d="M21 15l-5-5L5 21" />
			</svg>
		</button>
		<button class="export-btn" onclick={onExportSVG} title="Export as SVG">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M14 3v4a1 1 0 0 0 1 1h4" />
				<path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
				<path d="M9 15l3-3 3 3" />
			</svg>
		</button>
	</div>
</div>

<style>
	.bottom-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 10px 16px;
		background: rgba(15, 15, 20, 0.9);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
	}

	/* 2D/3D Toggle */
	.toggle-group {
		display: flex;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		padding: 2px;
	}

	.toggle-btn {
		padding: 6px 12px;
		background: transparent;
		border: none;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: all 0.15s;
	}

	.toggle-btn:hover {
		color: rgba(255, 255, 255, 0.8);
	}

	.toggle-btn.active {
		background: rgba(16, 185, 129, 0.9);
		color: white;
	}

	/* Slider Group */
	.slider-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.slider-label {
		font-size: 11px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
	}

	.slider {
		width: 100px;
		height: 4px;
		appearance: none;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
		cursor: pointer;
	}

	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		background: rgb(16, 185, 129);
		border: 2px solid rgba(255, 255, 255, 0.9);
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	.slider-value {
		min-width: 20px;
		font-size: 12px;
		font-family: ui-monospace, monospace;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
	}

	/* Export Buttons */
	.export-group {
		display: flex;
		gap: 4px;
	}

	.export-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.5);
		transition: all 0.15s;
	}

	.export-btn:hover {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(16, 185, 129, 0.4);
		color: rgb(16, 185, 129);
	}

	.export-btn svg {
		width: 16px;
		height: 16px;
	}

	/* Mobile */
	@media (max-width: 640px) {
		.bottom-bar {
			gap: 10px;
			padding: 8px 12px;
		}

		.slider-label {
			display: none;
		}

		.slider {
			width: 80px;
		}
	}
</style>
