<script lang="ts">
	import { loadPreset, getPresets, currentPreset } from '../stores/lsystem.svelte';
	import type { Preset } from '../presets/examples';

	let presets = getPresets();
	let isOpen = $state(false);

	// Categorize presets
	const categories = [
		{ id: '3d', name: '3D', icon: '🧊', is3D: true },
		{ id: 'fractals', name: 'Fractals', icon: '❄️', patterns: ['Koch', 'Dragon', 'Sierpinski', 'Hilbert', 'Gosper', 'Lévy', '32-Segment', 'Quadratic'] },
		{ id: 'plants', name: 'Plants & Trees', icon: '🌿', patterns: ['Plant', 'Tree', 'Bush'] },
		{ id: 'tilings', name: 'Tilings & Patterns', icon: '🔷', patterns: ['Penrose', 'Crystal', 'Board'] },
		{ id: 'parametric', name: 'Parametric', icon: '📐', patterns: ['Parametric'] },
		{ id: 'stochastic', name: 'Stochastic', icon: '🎲', patterns: ['Stochastic'] },
	];

	function getCategoryForPreset(preset: Preset): string {
		// 3D presets first
		if (preset.is3D) return '3d';
		
		for (const cat of categories) {
			if (cat.patterns && cat.patterns.some(p => preset.name.includes(p))) {
				return cat.id;
			}
		}
		return 'fractals';
	}

	const groupedPresets = $derived(() => {
		const groups: Record<string, Preset[]> = {};
		for (const cat of categories) {
			groups[cat.id] = [];
		}
		for (const preset of presets) {
			const catId = getCategoryForPreset(preset);
			groups[catId].push(preset);
		}
		return groups;
	});

	function selectPreset(preset: Preset) {
		loadPreset(preset);
		isOpen = false;
	}
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (isOpen = !isOpen)}
		class="flex w-full items-center justify-between rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
	>
		<span>{currentPreset.name}</span>
		<svg
			class="h-4 w-4 text-neutral-400 transition-transform {isOpen ? 'rotate-180' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if isOpen}
		<div
			class="absolute z-20 mt-1 max-h-[70vh] w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-800 shadow-xl"
		>
			{#each categories as category}
				{@const categoryPresets = groupedPresets()[category.id]}
				{#if categoryPresets.length > 0}
					<div class="sticky top-0 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-400 border-b border-neutral-700/50">
						{category.icon} {category.name}
					</div>
					{#each categoryPresets as preset}
						<button
							type="button"
							onclick={() => selectPreset(preset)}
							class="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-700 {currentPreset.name ===
							preset.name
								? 'bg-emerald-900/30 text-emerald-400'
								: 'text-neutral-200'}"
						>
							<span class="font-medium">{preset.name}</span>
							<span class="block text-xs text-neutral-500">{preset.description}</span>
						</button>
					{/each}
				{/if}
			{/each}
		</div>
	{/if}
</div>

<!-- Close dropdown when clicking outside -->
{#if isOpen}
	<button
		type="button"
		class="fixed inset-0 z-10 cursor-default"
		onclick={() => (isOpen = false)}
		aria-label="Close"
	></button>
{/if}
