<script lang="ts">
	/**
	 * IconToolbar - Vertical icon strip for category selection
	 * Inspired by SpeciesSelector from boids project
	 */

	export type ToolbarCategory = 'plants' | 'fractals' | 'patterns' | 'structures' | 'custom' | 'colors' | 'settings';

	interface Props {
		activeCategory: ToolbarCategory | null;
		onSelect: (category: ToolbarCategory) => void;
	}

	let { activeCategory, onSelect }: Props = $props();

	interface CategoryDef {
		id: ToolbarCategory;
		label: string;
		icon: string; // SVG path
	}

	const categories: CategoryDef[] = [
		{
			id: 'plants',
			label: 'Plants & Trees',
			// Leaf icon
			icon: 'M12 2C9.5 5 7 8 7 12c0 2.8 2.2 5 5 5s5-2.2 5-5c0-4-2.5-7-5-10zm0 15c-1.7 0-3-1.3-3-3 0-2.4 1.5-5 3-7.5 1.5 2.5 3 5.1 3 7.5 0 1.7-1.3 3-3 3z',
		},
		{
			id: 'fractals',
			label: 'Fractals',
			// Spiral icon
			icon: 'M12 2a10 10 0 0 0 0 20 8 8 0 0 0 0-16 6 6 0 0 0 0 12 4 4 0 0 0 0-8 2 2 0 0 0 0 4',
		},
		{
			id: 'patterns',
			label: 'Patterns & Tilings',
			// Grid icon
			icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
		},
		{
			id: 'structures',
			label: '3D Structures',
			// Cube icon
			icon: 'M21 16.5V7.5L12 2 3 7.5v9l9 5.5 9-5.5zM12 4.2l6.5 4L12 12.2 5.5 8.2l6.5-4zM5 9.8l6 3.7v6.7L5 16.5V9.8zm14 6.7l-6 3.7v-6.7l6-3.7v6.7z',
		},
		{
			id: 'custom',
			label: 'Custom / Edit',
			// Pencil icon
			icon: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
		},
		{
			id: 'colors',
			label: 'Colors',
			// Palette icon
			icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10a2 2 0 0 0 2-2v-1.5a2 2 0 0 1 2-2h1.5a2 2 0 0 0 2-2C22 6.5 17.5 2 12 2zM7 12.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm2.5-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm2.5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
		},
		{
			id: 'settings',
			label: 'Settings',
			// Gear icon
			icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9.4-2.5l-1.5-.9c.1-.5.1-1.1 0-1.6l1.5-.9c.2-.1.3-.4.2-.6l-1.5-2.6c-.1-.2-.4-.3-.6-.2l-1.5.9c-.4-.3-.9-.6-1.4-.8V4.2c0-.2-.2-.4-.4-.4h-3c-.2 0-.4.2-.4.4v1.7c-.5.2-1 .5-1.4.8l-1.5-.9c-.2-.1-.5 0-.6.2L5.3 8.6c-.1.2 0 .5.2.6l1.5.9c-.1.5-.1 1.1 0 1.6l-1.5.9c-.2.1-.3.4-.2.6l1.5 2.6c.1.2.4.3.6.2l1.5-.9c.4.3.9.6 1.4.8v1.7c0 .2.2.4.4.4h3c.2 0 .4-.2.4-.4v-1.7c.5-.2 1-.5 1.4-.8l1.5.9c.2.1.5 0 .6-.2l1.5-2.6c.1-.2 0-.5-.2-.6z',
		},
	];

	function handleClick(id: ToolbarCategory) {
		// Toggle off if clicking the same category
		if (activeCategory === id) {
			onSelect(id); // Let parent decide behavior
		} else {
			onSelect(id);
		}
	}
</script>

<nav class="toolbar">
	{#each categories as cat (cat.id)}
		{@const isActive = activeCategory === cat.id}
		<button
			class="icon-btn"
			class:active={isActive}
			onclick={() => handleClick(cat.id)}
			title={cat.label}
			aria-label={cat.label}
			aria-pressed={isActive}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d={cat.icon} />
			</svg>
			{#if isActive}
				<span class="active-indicator"></span>
			{/if}
		</button>
	{/each}
</nav>

<style>
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 6px;
		background: rgba(15, 15, 20, 0.85);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
	}

	.icon-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
		transition: all 0.15s ease;
		color: rgba(255, 255, 255, 0.5);
	}

	.icon-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.8);
		transform: scale(1.05);
	}

	.icon-btn.active {
		background: rgba(16, 185, 129, 0.2);
		border-color: rgba(16, 185, 129, 0.5);
		color: rgb(16, 185, 129);
	}

	.icon-btn.active:hover {
		background: rgba(16, 185, 129, 0.25);
	}

	.icon-btn svg {
		width: 20px;
		height: 20px;
	}

	.active-indicator {
		position: absolute;
		left: -6px;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 16px;
		background: rgb(16, 185, 129);
		border-radius: 0 2px 2px 0;
	}

	/* Mobile: horizontal layout at bottom */
	@media (max-width: 640px) {
		.toolbar {
			flex-direction: row;
			padding: 6px 8px;
		}

		.active-indicator {
			left: 50%;
			top: auto;
			bottom: -6px;
			transform: translateX(-50%);
			width: 16px;
			height: 3px;
			border-radius: 2px 2px 0 0;
		}
	}
</style>
