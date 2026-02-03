<script lang="ts">
	import { lsystemParams, engineState } from '../stores/lsystem.svelte';

	// Direct binding to store properties
	let axiom = $derived(lsystemParams.axiom);
	let rules = $derived(lsystemParams.rules);
</script>

<div class="space-y-4">
	<div>
		<label for="axiom" class="mb-1.5 block text-sm font-medium text-neutral-300"> Axiom </label>
		<input
			id="axiom"
			type="text"
			value={axiom}
			oninput={(e) => (lsystemParams.axiom = e.currentTarget.value)}
			class="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-100 placeholder-neutral-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
			placeholder="F"
		/>
	</div>

	<div>
		<label for="rules" class="mb-1.5 block text-sm font-medium text-neutral-300">
			Production Rules
		</label>
		<textarea
			id="rules"
			value={rules}
			oninput={(e) => (lsystemParams.rules = e.currentTarget.value)}
			rows="6"
			class="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-100 placeholder-neutral-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
			placeholder="F -> F+F-F-F+F"
		></textarea>
		<p class="mt-1 text-xs text-neutral-500">
			Format: <code class="rounded bg-neutral-800 px-1">symbol -> replacement</code>
		</p>
	</div>

	{#if engineState.parseError}
		<div class="rounded-md border border-red-900/50 bg-red-950/50 p-3 text-sm text-red-300">
			<span class="font-medium">Parse Error:</span>
			{engineState.parseError}
		</div>
	{/if}
</div>
