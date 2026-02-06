<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { initWebGPU } from '../gpu/device';
	import { Renderer3D, type CameraState } from '../render/renderer-3d';
	import type { Segment3D } from '../turtle/turtle-3d';
	import { engineState, lsystemParams, visualState, computeVertexBuffer3D } from '../stores/lsystem.svelte';

	interface Props {
		segments: Segment3D[];
		backgroundColor?: string;
	}

	let { segments, backgroundColor = '#0a0a0f' }: Props = $props();

	let canvas: HTMLCanvasElement;
	let renderer: Renderer3D | null = null;
	let isInitialized = $state(false);
	let error = $state<string | null>(null);
	let canvasWidth = $state(800);
	let canvasHeight = $state(600);

	// Camera state for orbit controls
	// Using standard orbit camera: theta=azimuth (around Z), phi=elevation above XY plane
	let camera = $state<CameraState>({
		distance: 4,
		theta: Math.PI * 0.75, // 135° - viewing from front-left
		phi: Math.PI * 0.2,    // 36° elevation - looking slightly down at the tree
		target: [0, 0, 0.5],   // Offset target slightly up to center on tree
		fov: Math.PI / 4,      // 45 degrees
	});

	// Mouse state for drag
	let isDragging = false;
	let isPanning = false;
	let lastMouseX = 0;
	let lastMouseY = 0;

	// Track segments for upload
	let uploadedSegmentCount = 0;

	function hexToRgba(hex: string): [number, number, number, number] {
		const r = parseInt(hex.slice(1, 3), 16) / 255;
		const g = parseInt(hex.slice(3, 5), 16) / 255;
		const b = parseInt(hex.slice(5, 7), 16) / 255;
		return [r, g, b, 1];
	}

	function renderFrame() {
		if (!renderer || !isInitialized) return;
		const aspect = canvasWidth / canvasHeight;
		renderer.updateCamera(camera, aspect);
		renderer.render(hexToRgba(backgroundColor));
	}

	// Initialize WebGPU and renderer
	onMount(() => {
		let animationId: number;
		let ctx: Awaited<ReturnType<typeof initWebGPU>> | null = null;

		const init = async () => {
			// Wait for Svelte to update DOM
			await tick();
			
			// Additional frame wait if needed
			if (!canvas) {
				await new Promise(resolve => requestAnimationFrame(resolve));
				await tick();
			}
			
			if (!canvas) {
				error = 'Canvas not available';
				engineState.gpuAvailable = false;
				return;
			}
			
			try {
				// Set initial canvas size
				const dpr = Math.min(window.devicePixelRatio, 2);
				const rect = canvas.getBoundingClientRect();
				canvas.width = Math.floor(rect.width * dpr) || 800;
				canvas.height = Math.floor(rect.height * dpr) || 600;
				canvasWidth = canvas.width;
				canvasHeight = canvas.height;
				
				ctx = await initWebGPU(canvas);

				renderer = new Renderer3D(ctx);
				await renderer.init();
				isInitialized = true;
				engineState.gpuAvailable = true;

				// Render loop
				const loop = () => {
					renderFrame();
					animationId = requestAnimationFrame(loop);
				};
				loop();
			} catch (e) {
				error = e instanceof Error ? e.message : 'WebGPU init failed';
				engineState.gpuAvailable = false;
				console.error('3D WebGPU init error:', e);
			}
		};

		init();

		// Handle resize
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				const dpr = Math.min(window.devicePixelRatio, 2);
				canvasWidth = Math.floor(width * dpr);
				canvasHeight = Math.floor(height * dpr);
				if (canvas) {
					canvas.width = canvasWidth;
					canvas.height = canvasHeight;
				}
			}
		});

		resizeObserver.observe(canvas.parentElement!);

		return () => {
			cancelAnimationFrame(animationId);
			resizeObserver.disconnect();
			renderer?.destroy();
		};
	});

	// Track vertex count for change detection
	let lastVertexCount = 0;

	// Ultra-fast path: direct vertex buffer output (same as 2D Canvas)
	$effect(() => {
		// Must explicitly track isInitialized so effect re-runs when initialization completes
		const initialized = isInitialized;
		const currentRenderer = renderer;
		
		if (!currentRenderer || !initialized) return;
		
		// Track dependencies for recomputation
		void lsystemParams.axiom;
		void lsystemParams.rules;
		void lsystemParams.iterations;
		void lsystemParams.angle;
		void visualState.colorMode;
		void visualState.hueOffset;
		void visualState.saturation;
		void visualState.lightness;
		void visualState.lineColor;
		
		// Compute directly to vertex buffer (skips intermediate Segment3D[] array)
		const result = computeVertexBuffer3D();
		if (result && result.vertexCount > 0) {
			currentRenderer.updateVertexBuffer(result.vertexData, result.vertexCount);
			lastVertexCount = result.vertexCount;
			uploadedSegmentCount = result.segmentCount;
		}
	});

	// Mouse handlers for orbit controls
	function onMouseDown(e: MouseEvent) {
		e.preventDefault();
		lastMouseX = e.clientX;
		lastMouseY = e.clientY;
		
		if (e.button === 0 && !e.shiftKey) {
			// Left click = orbit
			isDragging = true;
			canvas.style.cursor = 'grabbing';
		} else if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
			// Right click or shift+left = pan
			isPanning = true;
			canvas.style.cursor = 'move';
		}
	}

	function onMouseMove(e: MouseEvent) {
		const dx = e.clientX - lastMouseX;
		const dy = e.clientY - lastMouseY;
		lastMouseX = e.clientX;
		lastMouseY = e.clientY;

		if (isDragging) {
			// Orbit: horizontal = azimuth (theta), vertical = elevation (phi)
			camera.theta -= dx * 0.008;
			// Clamp phi to avoid gimbal lock (-85° to +85°)
			camera.phi = Math.max(-Math.PI * 0.47, Math.min(Math.PI * 0.47, camera.phi + dy * 0.008));
		} else if (isPanning) {
			// Pan: move target based on camera orientation
			// Dragging right should move content right (target moves right in world space from camera's view)
			const panSpeed = camera.distance * 0.002;
			const cosTheta = Math.cos(camera.theta);
			const sinTheta = Math.sin(camera.theta);
			
			// Pan in camera's local XY plane (perpendicular to view direction)
			// dx positive = drag right = content moves right = target moves in camera's right direction
			camera.target = [
				camera.target[0] + (dx * sinTheta - dy * cosTheta * Math.sin(camera.phi)) * panSpeed,
				camera.target[1] + (-dx * cosTheta - dy * sinTheta * Math.sin(camera.phi)) * panSpeed,
				camera.target[2] + dy * Math.cos(camera.phi) * panSpeed,
			];
		}
	}

	function onMouseUp() {
		isDragging = false;
		isPanning = false;
		canvas.style.cursor = 'grab';
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		// Smoother zoom with exponential scaling
		const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
		camera.distance = Math.max(0.5, Math.min(50, camera.distance * zoomFactor));
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault(); // Prevent context menu on right-click
	}

	function resetCamera() {
		camera = {
			distance: 4,
			theta: Math.PI * 0.75,
			phi: Math.PI * 0.2,
			target: [0, 0, 0.5],
			fov: Math.PI / 4,
		};
	}

	// Export canvas as PNG
	function exportPNG() {
		if (!canvas) return;
		
		// Create a temporary link and trigger download
		const link = document.createElement('a');
		link.download = `lsystem-3d-${Date.now()}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
	}

	// Expose export function
	export { exportPNG };
</script>

<div class="relative h-full w-full overflow-hidden bg-neutral-950">
	<canvas
		bind:this={canvas}
		class="h-full w-full cursor-grab"
		onmousedown={onMouseDown}
		onmousemove={onMouseMove}
		onmouseup={onMouseUp}
		onmouseleave={onMouseUp}
		onwheel={onWheel}
		oncontextmenu={onContextMenu}
	></canvas>

	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-red-900/50">
			<p class="text-red-200">{error}</p>
		</div>
	{/if}

	{#if !isInitialized && !error}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="flex items-center gap-3 text-neutral-400">
				<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
				</svg>
				<span>Initializing 3D...</span>
			</div>
		</div>
	{/if}

	<!-- 3D Controls (positioned above bottom bar) -->
	{#if isInitialized}
		<div class="absolute bottom-20 right-4 flex items-center gap-2">
			<div class="flex items-center rounded-lg bg-neutral-800/90 backdrop-blur overflow-hidden">
				<button
					onclick={() => (camera.distance = Math.min(20, camera.distance * 1.25))}
					class="px-3 py-2 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
					title="Zoom out"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
					</svg>
				</button>
				<span class="px-2 text-xs text-neutral-400 tabular-nums min-w-[3rem] text-center">
					{(1 / camera.distance * 100).toFixed(0)}%
				</span>
				<button
					onclick={() => (camera.distance = Math.max(0.5, camera.distance * 0.8))}
					class="px-3 py-2 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
					title="Zoom in"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			</div>
			<button
				onclick={resetCamera}
				class="px-3 py-2 rounded-lg bg-neutral-800/90 backdrop-blur text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors text-xs"
				title="Reset camera"
			>
				Reset
			</button>
		</div>

		<!-- 3D indicator and help -->
		<div class="absolute top-4 right-4 flex flex-col items-end gap-2">
			<div class="px-2 py-1 rounded bg-purple-600/80 backdrop-blur text-white text-xs font-medium">
				3D MODE
			</div>
			<div class="px-2 py-1 rounded bg-neutral-800/70 backdrop-blur text-neutral-400 text-xs">
				Drag: orbit · Shift+drag / Right: pan · Scroll: zoom
			</div>
		</div>
	{/if}
</div>
