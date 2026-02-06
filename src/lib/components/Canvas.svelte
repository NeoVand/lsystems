<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { initWebGPU, isWebGPUSupported, type GPUContext } from '../gpu/device';
	import { Renderer2D, hexToRgba } from '../render/renderer-2d';
	import type { LineSegment } from '../gpu/types';
	import { initGPUDerivationStore, destroyGPUDerivationStore, computeVertexBuffer, computeSegments, lsystemParams, visualState } from '../stores/lsystem.svelte';

	interface Props {
		segments: LineSegment[];
		backgroundColor?: string;
	}

	let { segments, backgroundColor = '#0a0a0f' }: Props = $props();

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let gpuContext: GPUContext | null = $state(null);
	let renderer: Renderer2D | null = $state(null);
	let error: string | null = $state(null);
	let isInitialized = $state(false);
	let canvasWidth = $state(800);
	let canvasHeight = $state(600);

	// Transform state for zoom/pan
	let scale = $state(1.0);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let isPanning = $state(false);
	let lastMouseX = 0;
	let lastMouseY = 0;
	
	// Track uploaded state
	let uploadedSegmentCount = 0;
	let lastVertexCount = 0;
	
	// Use fast path flag
	const USE_FAST_PATH = true;

	function renderFrame() {
		if (!renderer || !isInitialized) return;
		
		renderer.updateUniforms({
			viewport: [canvasWidth, canvasHeight],
			scale: scale,
			offsetX: offsetX,
			offsetY: offsetY,
		});
		renderer.render(hexToRgba(backgroundColor));
	}

	function clearCanvas() {
		if (!gpuContext) return;
		const { device, context } = gpuContext;
		const commandEncoder = device.createCommandEncoder();
		const textureView = context.getCurrentTexture().createView();
		const bg = hexToRgba(backgroundColor);
		const renderPass = commandEncoder.beginRenderPass({
			colorAttachments: [{
				view: textureView,
				clearValue: { r: bg[0], g: bg[1], b: bg[2], a: bg[3] },
				loadOp: 'clear',
				storeOp: 'store',
			}],
		});
		renderPass.end();
		device.queue.submit([commandEncoder.finish()]);
	}

	// Fast path: compute vertex buffer directly without intermediate objects
	// Uses a polling approach to avoid expensive dependency tracking
	let updateScheduled = false;
	
	function scheduleUpdate() {
		if (updateScheduled) return;
		updateScheduled = true;
		requestAnimationFrame(() => {
			updateScheduled = false;
			if (!renderer || !isInitialized || visualState.is3D) return;
			
			const result = computeVertexBuffer();
			if (result && (result.changed || result.vertexCount !== lastVertexCount)) {
				renderer.updateVertexBuffer(result.vertexData, result.vertexCount, result.useTriangles);
				lastVertexCount = result.vertexCount;
				uploadedSegmentCount = result.segmentCount;
				renderFrame();
			}
		});
	}
	
	// Track all relevant dependencies and schedule updates
	$effect(() => {
		if (!renderer || !isInitialized || visualState.is3D) return;
		
		// Access dependencies to trigger re-run when they change
		void lsystemParams.axiom;
		void lsystemParams.rules;
		void lsystemParams.iterations;
		void lsystemParams.angle;
		void visualState.colorMode;
		void visualState.hueOffset;
		void visualState.saturation;
		void visualState.lightness;
		void visualState.lineColor;
		void visualState.useSpectrum;
		void visualState.spectrumPreset;
		void visualState.useOpacityCurve;
		void visualState.lineWidth;
		
		scheduleUpdate();
	});

	// Re-render when view changes (cheap - only uniforms)
	$effect(() => {
		void backgroundColor;
		void canvasWidth;
		void canvasHeight;
		void scale;
		void offsetX;
		void offsetY;
		
		if (isInitialized && uploadedSegmentCount > 0) {
			renderFrame();
		} else if (isInitialized) {
			clearCanvas();
		}
	});

	// Mouse wheel zoom
	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		
		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		const newScale = Math.max(0.1, Math.min(10, scale * zoomFactor));
		
		// Zoom towards mouse position
		const rect = canvas.getBoundingClientRect();
		const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
		
		// Adjust offset to zoom towards cursor
		const scaleDiff = newScale - scale;
		offsetX -= mouseX * scaleDiff * 0.5;
		offsetY -= mouseY * scaleDiff * 0.5;
		
		scale = newScale;
	}

	// Pan with mouse drag - use RAF for smooth updates
	let pendingPanUpdate = false;
	let pendingDx = 0;
	let pendingDy = 0;

	function handleMouseDown(e: MouseEvent) {
		if (e.button === 0) { // Left click
			isPanning = true;
			lastMouseX = e.clientX;
			lastMouseY = e.clientY;
			canvas.style.cursor = 'grabbing';
		}
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isPanning) return;
		
		const rect = canvas.getBoundingClientRect();
		pendingDx += (e.clientX - lastMouseX) / rect.width * 2;
		pendingDy += -(e.clientY - lastMouseY) / rect.height * 2;
		
		lastMouseX = e.clientX;
		lastMouseY = e.clientY;
		
		// Batch updates with RAF
		if (!pendingPanUpdate) {
			pendingPanUpdate = true;
			requestAnimationFrame(() => {
				offsetX += pendingDx;
				offsetY += pendingDy;
				pendingDx = 0;
				pendingDy = 0;
				pendingPanUpdate = false;
			});
		}
	}

	function handleMouseUp() {
		isPanning = false;
		canvas.style.cursor = 'grab';
	}

	function handleMouseLeave() {
		isPanning = false;
		canvas.style.cursor = 'grab';
	}

	// Reset view
	function resetView() {
		scale = 1.0;
		offsetX = 0;
		offsetY = 0;
	}

	// Export canvas as PNG
	function exportPNG() {
		if (!canvas) return;
		
		// Create a temporary link and trigger download
		const link = document.createElement('a');
		link.download = `lsystem-${Date.now()}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
	}

	// Export as SVG
	function exportSVG() {
		// Get fresh segments directly from the store (works with fast path)
		const segs = computeSegments();
		if (segs.length === 0) return;
		
		// Calculate bounds
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const seg of segs) {
			minX = Math.min(minX, seg.start[0], seg.end[0]);
			minY = Math.min(minY, seg.start[1], seg.end[1]);
			maxX = Math.max(maxX, seg.start[0], seg.end[0]);
			maxY = Math.max(maxY, seg.start[1], seg.end[1]);
		}
		
		const padding = 0.1;
		const width = maxX - minX + padding * 2;
		const height = maxY - minY + padding * 2;
		const svgWidth = 800;
		const svgHeight = 800;
		const scaleFactor = Math.min(svgWidth / width, svgHeight / height);
		
		// Generate SVG
		let paths = '';
		for (const seg of segs) {
			const x1 = (seg.start[0] - minX + padding) * scaleFactor;
			const y1 = svgHeight - (seg.start[1] - minY + padding) * scaleFactor; // Flip Y
			const x2 = (seg.end[0] - minX + padding) * scaleFactor;
			const y2 = svgHeight - (seg.end[1] - minY + padding) * scaleFactor;
			const r = Math.round(seg.color[0] * 255);
			const g = Math.round(seg.color[1] * 255);
			const b = Math.round(seg.color[2] * 255);
			paths += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgb(${r},${g},${b})" stroke-width="1"/>\n`;
		}
		
		const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
<rect width="100%" height="100%" fill="${backgroundColor}"/>
${paths}</svg>`;
		
		// Download
		const blob = new Blob([svg], { type: 'image/svg+xml' });
		const link = document.createElement('a');
		link.download = `lsystem-${Date.now()}.svg`;
		link.href = URL.createObjectURL(blob);
		link.click();
		URL.revokeObjectURL(link.href);
	}

	// Expose export functions
	export { exportPNG, exportSVG };

	function handleResize() {
		if (!container || !canvas || !gpuContext) return;
		
		const rect = container.getBoundingClientRect();
		const newWidth = Math.max(Math.floor(rect.width), 100);
		const newHeight = Math.max(Math.floor(rect.height), 100);
		
		if (newWidth !== canvasWidth || newHeight !== canvasHeight) {
			canvasWidth = newWidth;
			canvasHeight = newHeight;
			
			gpuContext.context.configure({
				device: gpuContext.device,
				format: gpuContext.format,
				alphaMode: 'premultiplied',
			});
		}
	}

	onMount(() => {
		if (!isWebGPUSupported()) {
			error = 'WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+.';
			return;
		}

		const rect = container.getBoundingClientRect();
		canvasWidth = Math.max(Math.floor(rect.width), 100);
		canvasHeight = Math.max(Math.floor(rect.height), 100);

		initWebGPU(canvas)
			.then(async (ctx) => {
				gpuContext = ctx;
				renderer = new Renderer2D(gpuContext);
				await renderer.init();
				
				// Initialize GPU derivation
				await initGPUDerivationStore(ctx.device);
				
				isInitialized = true;
				await tick();
				// Effects will handle rendering
			})
			.catch((e) => {
				error = e instanceof Error ? e.message : 'Failed to initialize WebGPU';
				console.error('WebGPU init error:', e);
			});

		const handleWindowResize = () => requestAnimationFrame(handleResize);
		window.addEventListener('resize', handleWindowResize);
		setTimeout(handleResize, 100);

		return () => {
			window.removeEventListener('resize', handleWindowResize);
			destroyGPUDerivationStore();
			renderer?.destroy();
			gpuContext?.device.destroy();
		};
	});
</script>

<div bind:this={container} class="relative h-full w-full overflow-hidden">
	<canvas
		bind:this={canvas}
		width={canvasWidth}
		height={canvasHeight}
		class="absolute left-0 top-0 cursor-grab"
		onwheel={handleWheel}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseLeave}
	></canvas>

	{#if error}
		<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-red-950/80 p-6 text-center">
			<div>
				<svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<p class="mt-4 text-red-200">{error}</p>
				<p class="mt-2 text-sm text-red-300/70">Try using Chrome, Edge, or another WebGPU-enabled browser.</p>
			</div>
		</div>
	{/if}

	{#if !isInitialized && !error}
		<div class="absolute inset-0 flex items-center justify-center rounded-lg bg-neutral-900/80">
			<div class="flex items-center gap-3 text-neutral-400">
				<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
				</svg>
				<span>Initializing WebGPU...</span>
			</div>
		</div>
	{/if}

	<!-- Zoom controls -->
	{#if isInitialized}
		<div class="absolute bottom-4 right-4 flex items-center gap-2">
			<div class="flex items-center rounded-lg bg-neutral-800/90 backdrop-blur overflow-hidden">
				<button
					onclick={exportPNG}
					class="px-3 py-2 text-neutral-300 hover:bg-emerald-600 hover:text-white transition-colors text-xs flex items-center gap-1"
					title="Export as PNG"
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
					</svg>
					PNG
				</button>
				<button
					onclick={exportSVG}
					class="px-3 py-2 text-neutral-300 hover:bg-emerald-600 hover:text-white transition-colors text-xs border-l border-neutral-700"
					title="Export as SVG (vector)"
				>
					SVG
				</button>
			</div>
			<div class="flex items-center rounded-lg bg-neutral-800/90 backdrop-blur overflow-hidden">
				<button
					onclick={() => (scale = Math.max(0.1, scale * 0.8))}
					class="px-3 py-2 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
					title="Zoom out"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
					</svg>
				</button>
				<span class="px-2 text-xs text-neutral-400 tabular-nums min-w-[3rem] text-center">
					{Math.round(scale * 100)}%
				</span>
				<button
					onclick={() => (scale = Math.min(10, scale * 1.25))}
					class="px-3 py-2 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
					title="Zoom in"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
			<button
				onclick={resetView}
				class="px-3 py-2 rounded-lg bg-neutral-800/90 backdrop-blur text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors text-xs"
				title="Reset view"
			>
				Reset
			</button>
		</div>
	{/if}
</div>
