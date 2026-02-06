<script lang="ts">
	/**
	 * ControlPanel - Floating panel with presets, parameters, and grammar editor
	 */

	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import type { ToolbarCategory } from './IconToolbar.svelte';
	import type { Preset } from '../presets/examples';
	import ColorControls from './ColorControls.svelte';
	import CurveEditor from './CurveEditor.svelte';
	import {
		lsystemParams,
		visualState,
		loadPreset,
		getPresets,
		getDiscoveredParameters,
		updateDiscoveredParameter,
		setOpacityCurve,
		setUseOpacityCurve,
		type DiscoveredParam,
		type CurvePoint,
	} from '../stores/lsystem.svelte';

	interface Props {
		category: ToolbarCategory;
		onClose: () => void;
	}

	let { category, onClose }: Props = $props();

	// Collapsible sections
	let grammarExpanded = $state(false);

	// Get presets filtered by category
	const allPresets = getPresets();

	function getPresetsForCategory(cat: ToolbarCategory): Preset[] {
		switch (cat) {
			case 'plants':
				return allPresets.filter(
					(p) =>
						p.name.toLowerCase().includes('tree') ||
						p.name.toLowerCase().includes('plant') ||
						p.name.toLowerCase().includes('bush') ||
						p.name.toLowerCase().includes('fern')
				);
			case 'fractals':
				return allPresets.filter(
					(p) =>
						p.name.toLowerCase().includes('koch') ||
						p.name.toLowerCase().includes('sierpinski') ||
						p.name.toLowerCase().includes('dragon') ||
						p.name.toLowerCase().includes('lévy') ||
						p.name.toLowerCase().includes('gosper') ||
						p.name.toLowerCase().includes('curve')
				);
			case 'patterns':
				return allPresets.filter(
					(p) =>
						p.name.toLowerCase().includes('hilbert') ||
						p.name.toLowerCase().includes('penrose') ||
						p.name.toLowerCase().includes('crystal') ||
						p.name.toLowerCase().includes('board') ||
						p.name.toLowerCase().includes('segment') ||
						p.name.toLowerCase().includes('quadratic')
				);
			case 'structures':
				return allPresets.filter((p) => p.is3D === true);
			case 'custom':
				return []; // Custom mode shows grammar editor
			case 'colors':
				return []; // Colors panel doesn't show presets
			case 'settings':
				return []; // Settings doesn't show presets
			default:
				return allPresets;
		}
	}

	const categoryPresets = $derived(getPresetsForCategory(category));

	// Get discovered parameters for current grammar
	const discoveredParams = $derived(getDiscoveredParameters());

	// Category labels
	const categoryLabels: Record<ToolbarCategory, string> = {
		plants: 'Plants & Trees',
		fractals: 'Fractals',
		patterns: 'Patterns',
		structures: '3D Structures',
		custom: 'Custom',
		colors: 'Colors',
		settings: 'Settings',
	};

	function handlePresetClick(preset: Preset) {
		loadPreset(preset);
	}

	function handleParamChange(param: DiscoveredParam, value: number) {
		updateDiscoveredParameter(param, value);
	}
</script>

<div class="panel" transition:slide={{ duration: 200, easing: cubicOut, axis: 'x' }}>
	<!-- Header -->
	<header class="panel-header">
		<h2 class="panel-title">{categoryLabels[category]}</h2>
		<button class="close-btn" onclick={onClose} aria-label="Close panel">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>
	</header>

	<div class="panel-content">
		{#if category === 'colors'}
			<!-- Colors Panel -->
			<ColorControls />
		{:else if category === 'settings'}
			<!-- Settings Panel -->
			<section class="section">
				<h3 class="section-title">Visual</h3>
				<div class="param-row">
					<span class="param-name">Line Width</span>
					<input
						type="range"
						class="param-slider"
						min={1}
						max={5}
						step={0.5}
						bind:value={visualState.lineWidth}
					/>
					<span class="param-value">{visualState.lineWidth}</span>
				</div>
			</section>

			<section class="section">
				<div class="section-header">
					<h3 class="section-title">Opacity Curve</h3>
					<label class="toggle-label">
						<input
							type="checkbox"
							class="toggle-checkbox"
							bind:checked={visualState.useOpacityCurve}
						/>
						<span class="toggle-text">{visualState.useOpacityCurve ? 'On' : 'Off'}</span>
					</label>
				</div>
				{#if visualState.useOpacityCurve}
					<CurveEditor
						points={visualState.opacityCurve}
						onPointsChange={(points) => setOpacityCurve(points)}
						label="Depth → Opacity"
						curveColor="#10b981"
						showGradient={true}
						width={246}
						height={80}
					/>
				{/if}
			</section>
		{:else}
			<!-- Standard Category Panel -->
			
			<!-- Presets Grid -->
			{#if categoryPresets.length > 0}
				<section class="section">
					<div class="preset-grid">
						{#each categoryPresets as preset (preset.name)}
							<button
								class="preset-chip"
								onclick={() => handlePresetClick(preset)}
								title={preset.description}
							>
								<span class="preset-name">{preset.name}</span>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Dynamic Parameters -->
			{#if discoveredParams.length > 0}
				<section class="section">
					<h3 class="section-title">Parameters</h3>
					<div class="params-list">
						{#each discoveredParams as param (param.id)}
							<div class="param-row">
								<span class="param-name">{param.name}</span>
								<input
									type="range"
									class="param-slider"
									min={param.min}
									max={param.max}
									step={param.step}
									value={param.currentValue}
									oninput={(e) => handleParamChange(param, parseFloat(e.currentTarget.value))}
								/>
								<span class="param-value">{param.currentValue.toFixed(param.step < 1 ? 2 : 0)}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Global Angle (always show for non-parametric) -->
			{#if discoveredParams.length === 0 || !discoveredParams.some(p => p.name === 'Branch Angle')}
				<section class="section">
					<h3 class="section-title">Angle</h3>
					<div class="param-row">
						<span class="param-name">Turn Angle</span>
						<input
							type="range"
							class="param-slider"
							min={1}
							max={180}
							step={1}
							bind:value={lsystemParams.angle}
						/>
						<span class="param-value">{lsystemParams.angle}°</span>
					</div>
				</section>
			{/if}

			<!-- Grammar Editor (Collapsible) -->
			<section class="section">
				<button class="section-toggle" onclick={() => (grammarExpanded = !grammarExpanded)}>
					<svg
						class="toggle-icon"
						class:expanded={grammarExpanded}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M9 18l6-6-6-6" />
					</svg>
					<span>Grammar</span>
				</button>

				{#if grammarExpanded}
					<div class="grammar-editor" transition:slide={{ duration: 150, easing: cubicOut }}>
						<div class="input-group">
							<label class="input-label" for="axiom-input">Axiom</label>
							<input
								id="axiom-input"
								type="text"
								class="text-input"
								bind:value={lsystemParams.axiom}
								placeholder="Starting symbols"
							/>
						</div>
						<div class="input-group">
							<label class="input-label" for="rules-input">Rules</label>
							<textarea
								id="rules-input"
								class="text-input rules-textarea"
								bind:value={lsystemParams.rules}
								placeholder="Production rules"
								rows={4}
							></textarea>
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.panel {
		width: 280px;
		max-height: calc(100vh - 120px);
		background: rgba(15, 15, 20, 0.92);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
	}

	.panel-title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.4);
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 12px 14px;
	}

	.section {
		margin-bottom: 16px;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section-title {
		margin: 0 0 8px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: rgba(255, 255, 255, 0.4);
	}

	/* Preset Grid */
	.preset-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.preset-chip {
		padding: 6px 10px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.preset-chip:hover {
		background: rgba(16, 185, 129, 0.15);
		border-color: rgba(16, 185, 129, 0.4);
	}

	.preset-name {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.7);
	}

	.preset-chip:hover .preset-name {
		color: rgba(16, 185, 129, 1);
	}

	/* Parameters */
	.params-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.param-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.param-name {
		flex: 0 0 80px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.param-slider {
		flex: 1;
		height: 4px;
		appearance: none;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		cursor: pointer;
	}

	.param-slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		background: rgb(16, 185, 129);
		border: 2px solid rgba(255, 255, 255, 0.9);
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.param-slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	.param-value {
		flex: 0 0 40px;
		font-size: 11px;
		font-family: ui-monospace, monospace;
		color: rgba(255, 255, 255, 0.5);
		text-align: right;
	}

	/* Section Toggle */
	.section-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		margin: -6px -8px;
		width: calc(100% + 16px);
		background: none;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.6);
		font-size: 11px;
		font-weight: 500;
		text-align: left;
		transition: all 0.15s;
	}

	.section-toggle:hover {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.9);
	}

	.toggle-icon {
		width: 14px;
		height: 14px;
		transition: transform 0.2s;
	}

	.toggle-icon.expanded {
		transform: rotate(90deg);
	}

	/* Grammar Editor */
	.grammar-editor {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.input-label {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		color: rgba(255, 255, 255, 0.4);
	}

	.text-input {
		padding: 8px 10px;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.9);
		transition: border-color 0.15s;
	}

	.text-input:focus {
		outline: none;
		border-color: rgba(16, 185, 129, 0.5);
	}

	.text-input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.rules-textarea {
		resize: vertical;
		min-height: 60px;
		line-height: 1.5;
	}

	/* Section header with toggle */
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.section-header .section-title {
		margin-bottom: 0;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	.toggle-checkbox {
		width: 16px;
		height: 16px;
		accent-color: rgb(16, 185, 129);
		cursor: pointer;
	}

	.toggle-text {
		font-size: 10px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Mobile */
	@media (max-width: 640px) {
		.panel {
			width: calc(100vw - 24px);
			max-width: 320px;
			max-height: 60vh;
		}
	}
</style>
