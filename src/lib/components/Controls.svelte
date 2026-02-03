<script lang="ts">
	import {
		lsystemParams,
		setIterations,
		getSafeMaxIterations,
	} from '../stores/lsystem.svelte';

	let safeMax = $derived(getSafeMaxIterations());
	let maxIterations = $derived(Math.min(safeMax + 5, 30));
</script>

<div class="space-y-5">
	<!-- Iterations -->
	<div>
		<div class="mb-1.5 flex items-center justify-between">
			<label for="iterations" class="text-sm font-medium text-neutral-300 flex items-center gap-1.5">
				Iterations
				<span class="text-neutral-500 text-xs font-normal cursor-help" title="Number of times to apply the production rules. Higher = more detail but slower.">(?)</span>
			</label>
			<span class="text-sm tabular-nums text-neutral-400">{lsystemParams.iterations}</span>
		</div>
		<input
			id="iterations"
			type="range"
			min="0"
			max={maxIterations}
			value={lsystemParams.iterations}
			oninput={(e) => setIterations(parseInt(e.currentTarget.value))}
			class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-700 accent-emerald-500"
		/>
		<div class="mt-1 flex justify-between text-xs text-neutral-500">
			<span>0</span>
			<span>{maxIterations}</span>
		</div>
		{#if lsystemParams.iterations > safeMax}
			<p class="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
				<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
				</svg>
				High iteration count - exponential growth
			</p>
		{/if}
	</div>

	<!-- Angle -->
	<div>
		<div class="mb-1.5 flex items-center justify-between">
			<label for="angle" class="text-sm font-medium text-neutral-300 flex items-center gap-1.5">
				Turn Angle
				<span class="text-neutral-500 text-xs font-normal cursor-help" title="Rotation angle for + and - commands in degrees.">(?)</span>
			</label>
			<span class="text-sm tabular-nums text-neutral-400">{lsystemParams.angle}°</span>
		</div>
		<input
			id="angle"
			type="range"
			min="1"
			max="180"
			step="0.5"
			value={lsystemParams.angle}
			oninput={(e) => (lsystemParams.angle = parseFloat(e.currentTarget.value))}
			class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-700 accent-emerald-500"
		/>
		<div class="mt-1 flex justify-between text-xs text-neutral-500">
			<span>1°</span>
			<span>180°</span>
		</div>
	</div>

	<!-- Quick presets for common angles -->
	<div>
		<p class="text-xs text-neutral-500 mb-2">Quick angles:</p>
		<div class="flex flex-wrap gap-1.5">
			{#each [25, 30, 45, 60, 90, 120] as angle}
				<button
					onclick={() => (lsystemParams.angle = angle)}
					class="px-2 py-1 text-xs rounded transition-colors {lsystemParams.angle === angle ? 'bg-emerald-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}"
				>
					{angle}°
				</button>
			{/each}
		</div>
	</div>
</div>
