<script lang="ts">
	import { onMount } from 'svelte';
	import { untrack } from 'svelte';
	import Canvas from '$lib/components/Canvas.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import Controls from '$lib/components/Controls.svelte';
	import PresetSelector from '$lib/components/PresetSelector.svelte';
	import {
		computeSegments,
		visualState,
		engineState,
		lsystemParams,
		loadPreset,
	} from '$lib/stores/lsystem.svelte';
	import { plant1 } from '$lib/presets/examples';
	import type { LineSegment } from '$lib/gpu/types';

	let segments: LineSegment[] = $state([]);
	let panelOpen = $state(true);
	let activeTab: 'preset' | 'grammar' | 'params' = $state('preset');

	// Recompute segments when parameters change
	$effect(() => {
		// Track these dependencies
		void lsystemParams.axiom;
		void lsystemParams.rules;
		void lsystemParams.iterations;
		void lsystemParams.angle;
		
		// Use untrack to avoid tracking state updates
		untrack(() => {
			segments = computeSegments();
		});
	});

	onMount(() => {
		loadPreset(plant1);
	});

	function togglePanel() {
		panelOpen = !panelOpen;
	}
</script>

<svelte:head>
	<title>L-System Lab</title>
</svelte:head>

<!-- Full-screen canvas -->
<div class="fixed inset-0 bg-neutral-950">
	<Canvas {segments} backgroundColor={visualState.backgroundColor} />
</div>

<!-- Floating control panel -->
<div
	class="fixed left-4 top-4 z-10 flex flex-col transition-all duration-300"
	class:translate-x-0={panelOpen}
	class:-translate-x-[calc(100%-3rem)]={!panelOpen}
>
	<!-- Panel header with collapse button -->
	<div class="flex items-center gap-2 mb-2">
		<button
			onclick={togglePanel}
			class="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-800/90 backdrop-blur text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
			title={panelOpen ? 'Collapse panel' : 'Expand panel'}
		>
			<svg
				class="h-5 w-5 transition-transform duration-300"
				class:rotate-180={!panelOpen}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		
		{#if panelOpen}
			<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800/90 backdrop-blur">
				<div class="flex h-6 w-6 items-center justify-center rounded bg-emerald-600">
					<svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
				</div>
				<span class="text-sm font-medium text-white">L-System Lab</span>
			</div>
		{/if}
	</div>

	<!-- Main panel content -->
	{#if panelOpen}
		<div class="w-80 rounded-xl bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 shadow-2xl overflow-hidden">
			<!-- Tab navigation -->
			<div class="flex border-b border-neutral-700/50">
				<button
					onclick={() => (activeTab = 'preset')}
					class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'preset' ? 'text-emerald-400 bg-neutral-800/50' : 'text-neutral-400 hover:text-neutral-200'}"
				>
					Presets
				</button>
				<button
					onclick={() => (activeTab = 'grammar')}
					class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'grammar' ? 'text-emerald-400 bg-neutral-800/50' : 'text-neutral-400 hover:text-neutral-200'}"
				>
					Grammar
				</button>
				<button
					onclick={() => (activeTab = 'params')}
					class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'params' ? 'text-emerald-400 bg-neutral-800/50' : 'text-neutral-400 hover:text-neutral-200'}"
				>
					Parameters
				</button>
			</div>

			<!-- Tab content -->
			<div class="p-4 max-h-[60vh] overflow-y-auto">
				{#if activeTab === 'preset'}
					<PresetSelector />
					
					<div class="mt-4 p-3 rounded-lg bg-neutral-800/50 text-xs text-neutral-400">
						<p class="font-medium text-neutral-300 mb-1">Quick Start</p>
						<p>Select a preset to load a classic L-system. Then adjust parameters to explore variations.</p>
					</div>
				{:else if activeTab === 'grammar'}
					<Editor />
					
					<details class="mt-4 group">
						<summary class="flex cursor-pointer items-center justify-between text-sm text-neutral-400 hover:text-neutral-200">
							<span>Symbol Reference</span>
							<svg class="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</summary>
						<div class="mt-3 space-y-1 text-xs text-neutral-500">
							<div><code class="text-emerald-400">F, G</code> - Move forward and draw line</div>
							<div><code class="text-emerald-400">f</code> - Move forward without drawing</div>
							<div><code class="text-emerald-400">+</code> - Turn left by angle</div>
							<div><code class="text-emerald-400">-</code> - Turn right by angle</div>
							<div><code class="text-emerald-400">[</code> - Save position (start branch)</div>
							<div><code class="text-emerald-400">]</code> - Restore position (end branch)</div>
						</div>
					</details>
				{:else if activeTab === 'params'}
					<Controls />
				{/if}
			</div>

			<!-- Stats footer -->
			<div class="px-4 py-3 border-t border-neutral-700/50 bg-neutral-800/30">
				<div class="flex flex-col gap-1.5 text-xs">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-4">
							<span class="text-neutral-500">
								Symbols: <span class="text-neutral-300 tabular-nums">{engineState.symbolCount.toLocaleString()}</span>
							</span>
							<span class="text-neutral-500">
								Lines: <span class="text-neutral-300 tabular-nums">{engineState.segmentCount.toLocaleString()}</span>
							</span>
						</div>
						{#if engineState.isComputing}
							<div class="flex items-center gap-1 text-amber-400">
								<svg class="h-3 w-3 animate-spin" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
								</svg>
								<span>Computing</span>
							</div>
						{/if}
					</div>
					<div class="flex items-center justify-between text-neutral-500">
						<div class="flex items-center gap-3">
							<span>
								Derive: <span class="text-neutral-400 tabular-nums">{engineState.lastDerivationTime.toFixed(0)}ms</span>
							</span>
							<span>
								Turtle: <span class="text-neutral-400 tabular-nums">{engineState.lastInterpretTime.toFixed(0)}ms</span>
							</span>
						</div>
						<span class="flex items-center gap-1.5">
							{#if engineState.gpuAvailable}
								<span class="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
								<span class="text-emerald-400/80">GPU Render</span>
							{:else}
								<span class="flex h-1.5 w-1.5 rounded-full bg-neutral-600"></span>
								<span>No WebGPU</span>
							{/if}
						</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Keyboard shortcut hint -->
<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 text-xs text-neutral-600 pointer-events-none">
	<kbd class="px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-400">Space</kbd> toggle panel
	<span class="mx-2">•</span>
	<kbd class="px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-400">Scroll</kbd> zoom
	<span class="mx-2">•</span>
	<kbd class="px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-400">Drag</kbd> pan
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.code === 'Space' && e.target === document.body) {
			e.preventDefault();
			togglePanel();
		}
	}}
/>
