<script lang="ts">
	/**
	 * CurveEditor - Interactive curve editor for visual properties
	 * Used to control how opacity, saturation, brightness, or thickness
	 * changes over depth/age/position in the L-system visualization.
	 */

	interface CurvePoint {
		x: number; // 0-1 position along curve
		y: number; // 0-1 value at that position
	}

	interface Props {
		/** The curve points */
		points: CurvePoint[];
		/** Callback when points change */
		onPointsChange: (points: CurvePoint[]) => void;
		/** Width of the editor */
		width?: number;
		/** Height of the editor */
		height?: number;
		/** Label for the curve */
		label?: string;
		/** Color of the curve line */
		curveColor?: string;
		/** Whether to show the background gradient preview */
		showGradient?: boolean;
	}

	let {
		points,
		onPointsChange,
		width = 200,
		height = 80,
		label = '',
		curveColor = '#10b981',
		showGradient = false,
	}: Props = $props();

	let isDragging = $state(false);
	let dragIndex = $state<number | null>(null);
	let svgRef: SVGSVGElement | null = $state(null);

	// Padding for the curve area
	const padding = { top: 8, right: 8, bottom: 8, left: 8 };
	const innerWidth = $derived(width - padding.left - padding.right);
	const innerHeight = $derived(height - padding.top - padding.bottom);

	// Convert data coords to SVG coords
	function toSvgX(x: number): number {
		return padding.left + x * innerWidth;
	}

	function toSvgY(y: number): number {
		return padding.top + (1 - y) * innerHeight;
	}

	// Convert SVG coords to data coords
	function toDataX(svgX: number): number {
		return Math.max(0, Math.min(1, (svgX - padding.left) / innerWidth));
	}

	function toDataY(svgY: number): number {
		return Math.max(0, Math.min(1, 1 - (svgY - padding.top) / innerHeight));
	}

	// Generate smooth curve path using catmull-rom spline
	function getCurvePath(): string {
		if (points.length < 2) return '';

		const sortedPoints = [...points].sort((a, b) => a.x - b.x);

		// Simple line for 2 points
		if (sortedPoints.length === 2) {
			return `M ${toSvgX(sortedPoints[0].x)} ${toSvgY(sortedPoints[0].y)} L ${toSvgX(sortedPoints[1].x)} ${toSvgY(sortedPoints[1].y)}`;
		}

		// Catmull-Rom spline for smoother curves
		let path = `M ${toSvgX(sortedPoints[0].x)} ${toSvgY(sortedPoints[0].y)}`;

		for (let i = 0; i < sortedPoints.length - 1; i++) {
			const p0 = sortedPoints[Math.max(0, i - 1)];
			const p1 = sortedPoints[i];
			const p2 = sortedPoints[Math.min(sortedPoints.length - 1, i + 1)];
			const p3 = sortedPoints[Math.min(sortedPoints.length - 1, i + 2)];

			// Calculate control points
			const tension = 0.5;
			const cp1x = toSvgX(p1.x + (p2.x - p0.x) * tension / 6);
			const cp1y = toSvgY(p1.y + (p2.y - p0.y) * tension / 6);
			const cp2x = toSvgX(p2.x - (p3.x - p1.x) * tension / 6);
			const cp2y = toSvgY(p2.y - (p3.y - p1.y) * tension / 6);

			path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toSvgX(p2.x)} ${toSvgY(p2.y)}`;
		}

		return path;
	}

	// Handle drag start
	function handleMouseDown(e: MouseEvent, index: number) {
		e.preventDefault();
		isDragging = true;
		dragIndex = index;
	}

	// Handle drag
	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || dragIndex === null || !svgRef) return;

		const rect = svgRef.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const newX = toDataX(x);
		const newY = toDataY(y);

		// Don't allow moving first/last point's x position
		const isEndpoint = dragIndex === 0 || dragIndex === points.length - 1;

		const newPoints = [...points];
		newPoints[dragIndex] = {
			x: isEndpoint ? points[dragIndex].x : newX,
			y: newY,
		};

		onPointsChange(newPoints);
	}

	// Handle drag end
	function handleMouseUp() {
		isDragging = false;
		dragIndex = null;
	}

	// Add a new point on double-click
	function handleDoubleClick(e: MouseEvent) {
		if (!svgRef) return;

		const rect = svgRef.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		const newPoint: CurvePoint = {
			x: toDataX(x),
			y: toDataY(y),
		};

		// Don't add if too close to existing points
		const tooClose = points.some(
			(p) => Math.abs(p.x - newPoint.x) < 0.05
		);

		if (!tooClose) {
			const newPoints = [...points, newPoint].sort((a, b) => a.x - b.x);
			onPointsChange(newPoints);
		}
	}

	// Remove a point on right-click (except endpoints)
	function handleContextMenu(e: MouseEvent, index: number) {
		e.preventDefault();

		// Don't remove endpoints
		if (index === 0 || index === points.length - 1) return;

		const newPoints = points.filter((_, i) => i !== index);
		onPointsChange(newPoints);
	}

	// Generate gradient for preview
	function getGradientStops(): string {
		const sortedPoints = [...points].sort((a, b) => a.x - b.x);
		return sortedPoints
			.map((p) => {
				const alpha = Math.round(p.y * 255);
				return `rgba(255,255,255,${p.y}) ${p.x * 100}%`;
			})
			.join(', ');
	}
</script>

<div class="curve-editor">
	{#if label}
		<div class="label">{label}</div>
	{/if}

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<svg
		bind:this={svgRef}
		{width}
		{height}
		class="curve-svg"
		role="application"
		aria-label="Curve editor - drag points to adjust, double-click to add, right-click to remove"
		tabindex="0"
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
		ondblclick={handleDoubleClick}
	>
		<!-- Background gradient preview -->
		{#if showGradient}
			<defs>
				<linearGradient id="curve-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
					{#each [...points].sort((a, b) => a.x - b.x) as point}
						<stop offset="{point.x * 100}%" stop-color="white" stop-opacity={point.y} />
					{/each}
				</linearGradient>
			</defs>
			<rect
				x={padding.left}
				y={padding.top}
				width={innerWidth}
				height={innerHeight}
				fill="url(#curve-gradient)"
				opacity="0.3"
			/>
		{/if}

		<!-- Grid lines -->
		<g class="grid">
			<!-- Horizontal grid lines -->
			{#each [0, 0.25, 0.5, 0.75, 1] as y}
				<line
					x1={padding.left}
					y1={toSvgY(y)}
					x2={width - padding.right}
					y2={toSvgY(y)}
					stroke="rgba(255,255,255,0.1)"
					stroke-width="1"
				/>
			{/each}
			<!-- Vertical grid lines -->
			{#each [0, 0.25, 0.5, 0.75, 1] as x}
				<line
					x1={toSvgX(x)}
					y1={padding.top}
					x2={toSvgX(x)}
					y2={height - padding.bottom}
					stroke="rgba(255,255,255,0.1)"
					stroke-width="1"
				/>
			{/each}
		</g>

		<!-- Curve path -->
		<path
			d={getCurvePath()}
			fill="none"
			stroke={curveColor}
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>

		<!-- Control points -->
		{#each points as point, i}
			<circle
				cx={toSvgX(point.x)}
				cy={toSvgY(point.y)}
				r={dragIndex === i ? 6 : 5}
				fill={curveColor}
				stroke="white"
				stroke-width="2"
				class="point"
				class:dragging={dragIndex === i}
				onmousedown={(e) => handleMouseDown(e, i)}
				oncontextmenu={(e) => handleContextMenu(e, i)}
				role="button"
				tabindex="0"
				aria-label="Control point {i + 1}"
			/>
		{/each}
	</svg>

	<div class="hint">Double-click to add point, right-click to remove</div>
</div>

<style>
	.curve-editor {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.label {
		font-size: 11px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.curve-svg {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		cursor: crosshair;
	}

	.point {
		cursor: grab;
		transition: r 0.1s;
	}

	.point:hover {
		filter: brightness(1.2);
	}

	.point.dragging {
		cursor: grabbing;
	}

	.hint {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.35);
		text-align: center;
	}
</style>
