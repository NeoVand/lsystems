<script lang="ts">
	/**
	 * ColorControls - Compact color spectrum picker
	 * Inspired by PaletteIcon from boids project
	 */

	import {
		visualState,
		setSpectrumPreset,
		getSpectrumPresets,
		type ColorSpectrum,
	} from '../stores/lsystem.svelte';
	import { sampleSpectrum, rgbToHex } from '../color/spectrum';

	const presets = getSpectrumPresets();

	// Color modes
	type ColorMode = 'depth' | 'branch' | 'position' | 'age' | 'uniform';
	const colorModes: { id: ColorMode; label: string }[] = [
		{ id: 'depth', label: 'Depth' },
		{ id: 'branch', label: 'Branch' },
		{ id: 'age', label: 'Age' },
		{ id: 'position', label: 'Position' },
		{ id: 'uniform', label: 'Solid' },
	];

	function getGradientCss(spectrum: ColorSpectrum): string {
		const stops: string[] = [];
		for (let i = 0; i <= 10; i++) {
			const t = i / 10;
			const rgb = sampleSpectrum(spectrum, t);
			stops.push(`${rgbToHex(rgb)} ${t * 100}%`);
		}
		return `linear-gradient(to right, ${stops.join(', ')})`;
	}

	function handlePresetClick(preset: ColorSpectrum) {
		if (preset.name) {
			setSpectrumPreset(preset.name);
		}
	}
</script>

<div class="color-controls">
	<!-- Active Gradient Preview -->
	<div class="gradient-preview" style="background: {getGradientCss(visualState.spectrum)}"></div>

	<!-- Preset Chips -->
	<div class="presets-grid">
		{#each presets as preset (preset.name)}
			{@const isActive = visualState.spectrumPreset === preset.name}
			<button
				class="preset-chip"
				class:active={isActive}
				onclick={() => handlePresetClick(preset)}
				title={preset.name}
				style="background: {getGradientCss(preset)}"
			>
				<span class="sr-only">{preset.name}</span>
			</button>
		{/each}
	</div>

	<!-- Color Mode -->
	<div class="mode-section">
		<span class="section-label">Map by</span>
		<select
			class="mode-select"
			value={visualState.colorMode}
			onchange={(e) => (visualState.colorMode = e.currentTarget.value as ColorMode)}
		>
			{#each colorModes as mode (mode.id)}
				<option value={mode.id}>{mode.label}</option>
			{/each}
		</select>
	</div>

	<!-- Background Color -->
	<div class="bg-section">
		<span class="section-label">Background</span>
		<div class="color-input-wrapper">
			<input
				type="color"
				class="color-input"
				bind:value={visualState.backgroundColor}
			/>
			<span class="color-value">{visualState.backgroundColor}</span>
		</div>
	</div>

	<!-- Uniform Color (only when mode is uniform) -->
	{#if visualState.colorMode === 'uniform'}
		<div class="bg-section">
			<span class="section-label">Line Color</span>
			<div class="color-input-wrapper">
				<input
					type="color"
					class="color-input"
					bind:value={visualState.lineColor}
				/>
				<span class="color-value">{visualState.lineColor}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.color-controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* Gradient Preview */
	.gradient-preview {
		height: 24px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	/* Preset Grid */
	.presets-grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 4px;
	}

	.preset-chip {
		aspect-ratio: 1;
		min-height: 28px;
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.preset-chip:hover {
		transform: scale(1.1);
		z-index: 1;
	}

	.preset-chip.active {
		border-color: rgb(16, 185, 129);
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* Mode Section */
	.mode-section {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.section-label {
		font-size: 11px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}

	.mode-select {
		flex: 1;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.mode-select:focus {
		outline: none;
		border-color: rgba(16, 185, 129, 0.5);
	}

	/* Background Section */
	.bg-section {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.color-input-wrapper {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.color-input {
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		cursor: pointer;
		background: transparent;
	}

	.color-input::-webkit-color-swatch-wrapper {
		padding: 2px;
	}

	.color-input::-webkit-color-swatch {
		border-radius: 2px;
		border: none;
	}

	.color-value {
		font-size: 11px;
		font-family: ui-monospace, monospace;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
	}
</style>
