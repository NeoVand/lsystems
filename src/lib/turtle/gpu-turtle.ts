/**
 * GPU Turtle Interpreter
 * Processes L-system symbols to generate line segments on GPU
 */

import type { Symbol } from '../grammar/types';
import type { LineSegment } from '../gpu/types';
import turtleTransformWGSL from './turtle-transform.wgsl?raw';

const MAX_SEGMENTS = 2_000_000;
const MAX_SYMBOLS = 4_000_000;

export interface GPUTurtleContext {
	device: GPUDevice;
	
	// Pipelines
	anglesDeltaPipeline: GPUComputePipeline;
	scanAnglesPipeline: GPUComputePipeline;
	generateSegmentsPipeline: GPUComputePipeline;
	
	// Buffers
	paramsBuffer: GPUBuffer;
	symbolsBuffer: GPUBuffer;
	bracketDepthBuffer: GPUBuffer;
	bracketMatchBuffer: GPUBuffer;
	angleDeltasBuffer: GPUBuffer;
	cumulativeAnglesBuffer: GPUBuffer;
	positionsXBuffer: GPUBuffer;
	positionsYBuffer: GPUBuffer;
	segmentsBuffer: GPUBuffer;
	segmentCountBuffer: GPUBuffer;
	readbackBuffer: GPUBuffer | null;
	countReadbackBuffer: GPUBuffer;
	
	// State
	currentBufferSize: number;
	isReady: boolean;
}

/**
 * Initialize GPU turtle pipelines and buffers
 */
export async function initGPUTurtle(device: GPUDevice): Promise<GPUTurtleContext> {
	const turtleModule = device.createShaderModule({
		label: 'Turtle Transform Shader',
		code: turtleTransformWGSL,
	});

	// Create pipelines
	const anglesDeltaPipeline = device.createComputePipeline({
		label: 'Angle Deltas Pipeline',
		layout: 'auto',
		compute: { module: turtleModule, entryPoint: 'compute_angle_deltas' },
	});

	const scanAnglesPipeline = device.createComputePipeline({
		label: 'Scan Angles Pipeline',
		layout: 'auto',
		compute: { module: turtleModule, entryPoint: 'scan_angles' },
	});

	const generateSegmentsPipeline = device.createComputePipeline({
		label: 'Generate Segments Pipeline',
		layout: 'auto',
		compute: { module: turtleModule, entryPoint: 'generate_segments_serial' },
	});

	// Create buffers
	const initialSize = 65536;
	
	const paramsBuffer = device.createBuffer({
		label: 'Turtle Params',
		size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const symbolsBuffer = device.createBuffer({
		label: 'Symbols Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const bracketDepthBuffer = device.createBuffer({
		label: 'Bracket Depth Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const bracketMatchBuffer = device.createBuffer({
		label: 'Bracket Match Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const angleDeltasBuffer = device.createBuffer({
		label: 'Angle Deltas Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const cumulativeAnglesBuffer = device.createBuffer({
		label: 'Cumulative Angles Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const positionsXBuffer = device.createBuffer({
		label: 'Positions X Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const positionsYBuffer = device.createBuffer({
		label: 'Positions Y Buffer',
		size: initialSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	// Segment buffer: 8 floats per segment (32 bytes)
	const segmentsBuffer = device.createBuffer({
		label: 'Segments Buffer',
		size: MAX_SEGMENTS * 32,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
	});

	const segmentCountBuffer = device.createBuffer({
		label: 'Segment Count Buffer',
		size: 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});

	const countReadbackBuffer = device.createBuffer({
		label: 'Count Readback Buffer',
		size: 4,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
	});

	return {
		device,
		anglesDeltaPipeline,
		scanAnglesPipeline,
		generateSegmentsPipeline,
		paramsBuffer,
		symbolsBuffer,
		bracketDepthBuffer,
		bracketMatchBuffer,
		angleDeltasBuffer,
		cumulativeAnglesBuffer,
		positionsXBuffer,
		positionsYBuffer,
		segmentsBuffer,
		segmentCountBuffer,
		readbackBuffer: null,
		countReadbackBuffer,
		currentBufferSize: initialSize,
		isReady: true,
	};
}

/**
 * Resize buffers if needed
 */
function ensureBufferSize(ctx: GPUTurtleContext, symbolCount: number): void {
	if (symbolCount <= ctx.currentBufferSize) return;

	let newSize = ctx.currentBufferSize;
	while (newSize < symbolCount) {
		newSize *= 2;
	}
	newSize = Math.min(newSize, MAX_SYMBOLS);

	const { device } = ctx;

	// Destroy and recreate buffers
	ctx.symbolsBuffer.destroy();
	ctx.bracketDepthBuffer.destroy();
	ctx.bracketMatchBuffer.destroy();
	ctx.angleDeltasBuffer.destroy();
	ctx.cumulativeAnglesBuffer.destroy();
	ctx.positionsXBuffer.destroy();
	ctx.positionsYBuffer.destroy();

	ctx.symbolsBuffer = device.createBuffer({
		label: 'Symbols Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.bracketDepthBuffer = device.createBuffer({
		label: 'Bracket Depth Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.bracketMatchBuffer = device.createBuffer({
		label: 'Bracket Match Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.angleDeltasBuffer = device.createBuffer({
		label: 'Angle Deltas Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.cumulativeAnglesBuffer = device.createBuffer({
		label: 'Cumulative Angles Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.positionsXBuffer = device.createBuffer({
		label: 'Positions X Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.positionsYBuffer = device.createBuffer({
		label: 'Positions Y Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.currentBufferSize = newSize;
}

/**
 * Interpret symbols on GPU and return line segments
 */
export async function interpretSymbolsGPU(
	ctx: GPUTurtleContext,
	symbols: Symbol[],
	angleDegs: number,
	stepSize: number
): Promise<LineSegment[]> {
	if (!ctx.isReady || symbols.length === 0) {
		return [];
	}

	const { device } = ctx;
	
	// Ensure buffers are large enough
	ensureBufferSize(ctx, symbols.length);

	// Upload symbols
	const symbolData = new Uint32Array(symbols.length);
	for (let i = 0; i < symbols.length; i++) {
		symbolData[i] = symbols[i].id.charCodeAt(0);
	}
	device.queue.writeBuffer(ctx.symbolsBuffer, 0, symbolData);

	// Upload params
	const angleRad = (angleDegs * Math.PI) / 180;
	const params = new Float32Array([symbols.length, angleRad, stepSize, 0]);
	// Reinterpret first element as u32
	const paramsView = new DataView(params.buffer);
	paramsView.setUint32(0, symbols.length, true);
	device.queue.writeBuffer(ctx.paramsBuffer, 0, params);

	// Reset segment count
	device.queue.writeBuffer(ctx.segmentCountBuffer, 0, new Uint32Array([0]));

	// Create bind group for segment generation
	const generateBindGroup = device.createBindGroup({
		layout: ctx.generateSegmentsPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ctx.paramsBuffer } },
			{ binding: 1, resource: { buffer: ctx.symbolsBuffer } },
			{ binding: 2, resource: { buffer: ctx.bracketDepthBuffer } },
			{ binding: 3, resource: { buffer: ctx.bracketMatchBuffer } },
			{ binding: 4, resource: { buffer: ctx.angleDeltasBuffer } },
			{ binding: 5, resource: { buffer: ctx.cumulativeAnglesBuffer } },
			{ binding: 6, resource: { buffer: ctx.positionsXBuffer } },
			{ binding: 7, resource: { buffer: ctx.positionsYBuffer } },
			{ binding: 8, resource: { buffer: ctx.segmentsBuffer } },
			{ binding: 9, resource: { buffer: ctx.segmentCountBuffer } },
		],
	});

	// Execute compute
	const commandEncoder = device.createCommandEncoder();
	
	const pass = commandEncoder.beginComputePass();
	pass.setPipeline(ctx.generateSegmentsPipeline);
	pass.setBindGroup(0, generateBindGroup);
	pass.dispatchWorkgroups(1);  // Serial processing
	pass.end();

	// Copy count for readback
	commandEncoder.copyBufferToBuffer(
		ctx.segmentCountBuffer, 0,
		ctx.countReadbackBuffer, 0,
		4
	);

	device.queue.submit([commandEncoder.finish()]);

	// Read segment count
	await ctx.countReadbackBuffer.mapAsync(GPUMapMode.READ);
	const countData = new Uint32Array(ctx.countReadbackBuffer.getMappedRange().slice(0));
	const segmentCount = countData[0];
	ctx.countReadbackBuffer.unmap();

	if (segmentCount === 0) {
		return [];
	}

	// Read segments
	const segmentSize = 32; // 8 floats
	const readSize = segmentCount * segmentSize;
	
	if (!ctx.readbackBuffer || ctx.readbackBuffer.size < readSize) {
		ctx.readbackBuffer?.destroy();
		ctx.readbackBuffer = device.createBuffer({
			size: readSize,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});
	}

	const copyEncoder = device.createCommandEncoder();
	copyEncoder.copyBufferToBuffer(ctx.segmentsBuffer, 0, ctx.readbackBuffer, 0, readSize);
	device.queue.submit([copyEncoder.finish()]);

	await ctx.readbackBuffer.mapAsync(GPUMapMode.READ);
	const segmentData = new Float32Array(ctx.readbackBuffer.getMappedRange().slice(0));
	ctx.readbackBuffer.unmap();

	// Convert to LineSegment array
	const segments: LineSegment[] = new Array(segmentCount);
	for (let i = 0; i < segmentCount; i++) {
		const offset = i * 8;
		segments[i] = {
			start: [segmentData[offset], segmentData[offset + 1], 0],
			end: [segmentData[offset + 2], segmentData[offset + 3], 0],
			depth: Math.round(segmentData[offset + 4]),
			branchId: 0,
			color: [
				segmentData[offset + 5],
				segmentData[offset + 6],
				segmentData[offset + 7],
				1.0,
			],
		};
	}

	return segments;
}

/**
 * Check if GPU turtle should be used
 */
export function shouldUseGPUTurtle(symbolCount: number): boolean {
	// GPU has overhead, worth it for larger inputs
	return symbolCount > 5000;
}

/**
 * Clean up GPU turtle resources
 */
export function destroyGPUTurtle(ctx: GPUTurtleContext): void {
	ctx.paramsBuffer.destroy();
	ctx.symbolsBuffer.destroy();
	ctx.bracketDepthBuffer.destroy();
	ctx.bracketMatchBuffer.destroy();
	ctx.angleDeltasBuffer.destroy();
	ctx.cumulativeAnglesBuffer.destroy();
	ctx.positionsXBuffer.destroy();
	ctx.positionsYBuffer.destroy();
	ctx.segmentsBuffer.destroy();
	ctx.segmentCountBuffer.destroy();
	ctx.countReadbackBuffer.destroy();
	ctx.readbackBuffer?.destroy();
	ctx.isReady = false;
}
