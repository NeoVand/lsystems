<script lang="ts">
	import { loadPreset, getPresets, currentPreset } from '../stores/lsystem.svelte';
	import type { Preset } from '../presets/examples';

	let presets = getPresets();
	let isOpen = $state(false);

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
			class="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-800 shadow-xl"
		>
			{#each presets as preset}
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
