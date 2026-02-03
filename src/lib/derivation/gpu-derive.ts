/**
 * GPU-accelerated L-system Derivation
 * Uses parallel prefix sum for efficient symbol expansion
 */

import type { D0LRule, Symbol } from '../grammar/types';
import expansionCountsWGSL from './expansion-counts.wgsl?raw';
import prefixSumWGSL from './prefix-sum.wgsl?raw';
import deriveWGSL from './derive.wgsl?raw';

const WORKGROUP_SIZE = 256;
const ELEMENTS_PER_BLOCK = 512;
const MAX_RULES = 64;
const MAX_SUCCESSORS = 512;
const MAX_SYMBOLS = 8_000_000;

// Threshold below which CPU is faster due to GPU overhead
const GPU_THRESHOLD = 1000;

export interface GPUDerivationContext {
	device: GPUDevice;
	
	// Pipelines
	expansionCountsPipeline: GPUComputePipeline;
	scanBlocksPipeline: GPUComputePipeline;
	addBlockSumsPipeline: GPUComputePipeline;
	derivePipeline: GPUComputePipeline;
	
	// Persistent buffers
	rulesBuffer: GPUBuffer;
	successorsBuffer: GPUBuffer;
	paramsBuffer: GPUBuffer;
	
	// Ping-pong symbol buffers
	symbolBufferA: GPUBuffer;
	symbolBufferB: GPUBuffer;
	countsBuffer: GPUBuffer;
	prefixSumsBuffer: GPUBuffer;
	blockSumsBuffer: GPUBuffer;
	blockSumsScannedBuffer: GPUBuffer;
	
	// Staging buffer for readback
	readbackBuffer: GPUBuffer | null;
	
	// Current state
	currentBufferSize: number;
	ruleCount: number;
	isReady: boolean;
}

/**
 * Initialize GPU derivation pipelines and buffers
 */
export async function initGPUDerivation(device: GPUDevice): Promise<GPUDerivationContext> {
	// Create shader modules
	const expansionCountsModule = device.createShaderModule({
		label: 'Expansion Counts Shader',
		code: expansionCountsWGSL,
	});
	
	const prefixSumModule = device.createShaderModule({
		label: 'Prefix Sum Shader',
		code: prefixSumWGSL,
	});
	
	const deriveModule = device.createShaderModule({
		label: 'Derive Shader',
		code: deriveWGSL,
	});

	// Create pipelines with auto layout
	const expansionCountsPipeline = device.createComputePipeline({
		label: 'Expansion Counts Pipeline',
		layout: 'auto',
		compute: { module: expansionCountsModule, entryPoint: 'compute_counts' },
	});

	const scanBlocksPipeline = device.createComputePipeline({
		label: 'Scan Blocks Pipeline',
		layout: 'auto',
		compute: { module: prefixSumModule, entryPoint: 'scan_blocks' },
	});

	const addBlockSumsPipeline = device.createComputePipeline({
		label: 'Add Block Sums Pipeline',
		layout: 'auto',
		compute: { module: prefixSumModule, entryPoint: 'add_block_sums' },
	});

	const derivePipeline = device.createComputePipeline({
		label: 'Derive Pipeline',
		layout: 'auto',
		compute: { module: deriveModule, entryPoint: 'derive' },
	});

	// Create buffers
	const initialBufferSize = 131072; // 128K symbols initially
	
	const rulesBuffer = device.createBuffer({
		label: 'Rules Buffer',
		size: MAX_RULES * 16,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const successorsBuffer = device.createBuffer({
		label: 'Successors Buffer',
		size: MAX_SUCCESSORS * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const paramsBuffer = device.createBuffer({
		label: 'Params Buffer',
		size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const symbolBufferA = device.createBuffer({
		label: 'Symbol Buffer A',
		size: initialBufferSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	const symbolBufferB = device.createBuffer({
		label: 'Symbol Buffer B',
		size: initialBufferSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	const countsBuffer = device.createBuffer({
		label: 'Counts Buffer',
		size: initialBufferSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const prefixSumsBuffer = device.createBuffer({
		label: 'Prefix Sums Buffer',
		size: initialBufferSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	// For multi-pass prefix sum
	const maxBlocks = Math.ceil(initialBufferSize / ELEMENTS_PER_BLOCK);
	const blockSumsBuffer = device.createBuffer({
		label: 'Block Sums Buffer',
		size: maxBlocks * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	const blockSumsScannedBuffer = device.createBuffer({
		label: 'Block Sums Scanned Buffer',
		size: maxBlocks * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	return {
		device,
		expansionCountsPipeline,
		scanBlocksPipeline,
		addBlockSumsPipeline,
		derivePipeline,
		rulesBuffer,
		successorsBuffer,
		paramsBuffer,
		symbolBufferA,
		symbolBufferB,
		countsBuffer,
		prefixSumsBuffer,
		blockSumsBuffer,
		blockSumsScannedBuffer,
		readbackBuffer: null,
		currentBufferSize: initialBufferSize,
		ruleCount: 0,
		isReady: true,
	};
}

/**
 * Resize buffers if needed
 */
function ensureBufferSize(ctx: GPUDerivationContext, requiredSize: number): void {
	if (requiredSize <= ctx.currentBufferSize) return;
	
	// Double until we have enough
	let newSize = ctx.currentBufferSize;
	while (newSize < requiredSize) {
		newSize *= 2;
	}
	newSize = Math.min(newSize, MAX_SYMBOLS);
	
	const { device } = ctx;
	
	// Destroy old buffers
	ctx.symbolBufferA.destroy();
	ctx.symbolBufferB.destroy();
	ctx.countsBuffer.destroy();
	ctx.prefixSumsBuffer.destroy();
	ctx.blockSumsBuffer.destroy();
	ctx.blockSumsScannedBuffer.destroy();
	
	// Create new larger buffers
	ctx.symbolBufferA = device.createBuffer({
		label: 'Symbol Buffer A',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	ctx.symbolBufferB = device.createBuffer({
		label: 'Symbol Buffer B',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	ctx.countsBuffer = device.createBuffer({
		label: 'Counts Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.prefixSumsBuffer = device.createBuffer({
		label: 'Prefix Sums Buffer',
		size: newSize * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	const maxBlocks = Math.ceil(newSize / ELEMENTS_PER_BLOCK);
	ctx.blockSumsBuffer = device.createBuffer({
		label: 'Block Sums Buffer',
		size: maxBlocks * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
	});

	ctx.blockSumsScannedBuffer = device.createBuffer({
		label: 'Block Sums Scanned Buffer',
		size: maxBlocks * 4,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	ctx.currentBufferSize = newSize;
}

/**
 * Upload grammar rules to GPU
 */
export function uploadRules(ctx: GPUDerivationContext, rules: D0LRule[]): void {
	const { device, rulesBuffer, successorsBuffer } = ctx;
	
	const ruleData = new Uint32Array(MAX_RULES * 4);
	const successorData = new Uint32Array(MAX_SUCCESSORS);
	
	let successorOffset = 0;
	
	for (let i = 0; i < rules.length && i < MAX_RULES; i++) {
		const rule = rules[i];
		const predecessorId = rule.predecessor.charCodeAt(0);
		const successorCount = rule.successor.length;
		
		ruleData[i * 4 + 0] = predecessorId;
		ruleData[i * 4 + 1] = successorCount;
		ruleData[i * 4 + 2] = successorOffset;
		ruleData[i * 4 + 3] = 0;
		
		for (let j = 0; j < successorCount; j++) {
			successorData[successorOffset + j] = rule.successor[j].id.charCodeAt(0);
		}
		
		successorOffset += successorCount;
	}
	
	device.queue.writeBuffer(rulesBuffer, 0, ruleData);
	device.queue.writeBuffer(successorsBuffer, 0, successorData);
	ctx.ruleCount = rules.length;
}

/**
 * Run GPU derivation for N generations
 */
export async function deriveGPU(
	ctx: GPUDerivationContext,
	axiom: Symbol[],
	generations: number
): Promise<Symbol[]> {
	if (!ctx.isReady || axiom.length === 0 || generations === 0) {
		return axiom;
	}

	// For very small inputs, CPU is faster
	if (axiom.length < GPU_THRESHOLD && generations <= 3) {
		return null as unknown as Symbol[]; // Signal to use CPU fallback
	}

	const { device } = ctx;
	
	// Estimate final size and ensure buffers are large enough
	const estimatedSize = axiom.length * Math.pow(2, generations);
	ensureBufferSize(ctx, Math.min(estimatedSize, MAX_SYMBOLS));

	// Upload axiom to buffer A
	const axiomData = new Uint32Array(axiom.length);
	for (let i = 0; i < axiom.length; i++) {
		axiomData[i] = axiom[i].id.charCodeAt(0);
	}
	device.queue.writeBuffer(ctx.symbolBufferA, 0, axiomData);

	let inputBuffer = ctx.symbolBufferA;
	let outputBuffer = ctx.symbolBufferB;
	let currentCount = axiom.length;

	// Run derivation for each generation
	for (let gen = 0; gen < generations; gen++) {
		const outputCount = await deriveOneGeneration(ctx, currentCount, inputBuffer, outputBuffer);
		
		if (outputCount > ctx.currentBufferSize) {
			// Need to resize - for now just cap it
			currentCount = ctx.currentBufferSize;
		} else {
			currentCount = outputCount;
		}

		// Swap buffers
		[inputBuffer, outputBuffer] = [outputBuffer, inputBuffer];
	}

	// Read back results (inputBuffer has final result due to swap)
	return await readSymbols(ctx, inputBuffer, currentCount);
}

/**
 * Perform one generation of GPU derivation
 */
async function deriveOneGeneration(
	ctx: GPUDerivationContext,
	inputCount: number,
	inputBuffer: GPUBuffer,
	outputBuffer: GPUBuffer
): Promise<number> {
	const { device } = ctx;

	const commandEncoder = device.createCommandEncoder();

	// Step 1: Compute expansion counts
	const countsParams = new Uint32Array([inputCount, ctx.ruleCount, 0, 0]);
	device.queue.writeBuffer(ctx.paramsBuffer, 0, countsParams);

	const countsBindGroup = device.createBindGroup({
		layout: ctx.expansionCountsPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ctx.paramsBuffer } },
			{ binding: 1, resource: { buffer: inputBuffer } },
			{ binding: 2, resource: { buffer: ctx.rulesBuffer } },
			{ binding: 3, resource: { buffer: ctx.countsBuffer } },
		],
	});

	{
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(ctx.expansionCountsPipeline);
		pass.setBindGroup(0, countsBindGroup);
		pass.dispatchWorkgroups(Math.ceil(inputCount / WORKGROUP_SIZE));
		pass.end();
	}

	// Step 2: Prefix sum on counts
	const numBlocks = Math.ceil(inputCount / ELEMENTS_PER_BLOCK);
	
	// Scan each block
	const scanParams = new Uint32Array([inputCount, 0, 0, 0]);
	device.queue.writeBuffer(ctx.paramsBuffer, 0, scanParams);

	const scanBindGroup = device.createBindGroup({
		layout: ctx.scanBlocksPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ctx.paramsBuffer } },
			{ binding: 1, resource: { buffer: ctx.countsBuffer } },
			{ binding: 2, resource: { buffer: ctx.prefixSumsBuffer } },
			{ binding: 3, resource: { buffer: ctx.blockSumsBuffer } },
		],
	});

	{
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(ctx.scanBlocksPipeline);
		pass.setBindGroup(0, scanBindGroup);
		pass.dispatchWorkgroups(numBlocks);
		pass.end();
	}

	// If more than one block, need to scan block sums and add back
	if (numBlocks > 1) {
		// Scan block sums
		const blockScanParams = new Uint32Array([numBlocks, 0, 0, 0]);
		device.queue.writeBuffer(ctx.paramsBuffer, 0, blockScanParams);

		const blockScanBindGroup = device.createBindGroup({
			layout: ctx.scanBlocksPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: ctx.paramsBuffer } },
				{ binding: 1, resource: { buffer: ctx.blockSumsBuffer } },
				{ binding: 2, resource: { buffer: ctx.blockSumsScannedBuffer } },
				{ binding: 3, resource: { buffer: ctx.blockSumsBuffer } }, // dummy, won't be used
			],
		});

		{
			const pass = commandEncoder.beginComputePass();
			pass.setPipeline(ctx.scanBlocksPipeline);
			pass.setBindGroup(0, blockScanBindGroup);
			pass.dispatchWorkgroups(1); // Block sums fit in one workgroup
			pass.end();
		}

		// Add block sums back to main scan
		device.queue.writeBuffer(ctx.paramsBuffer, 0, scanParams);

		const addBindGroup = device.createBindGroup({
			layout: ctx.addBlockSumsPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: ctx.paramsBuffer } },
				{ binding: 1, resource: { buffer: ctx.countsBuffer } }, // unused but needed for layout
				{ binding: 2, resource: { buffer: ctx.prefixSumsBuffer } },
				{ binding: 3, resource: { buffer: ctx.blockSumsScannedBuffer } },
			],
		});

		{
			const pass = commandEncoder.beginComputePass();
			pass.setPipeline(ctx.addBlockSumsPipeline);
			pass.setBindGroup(0, addBindGroup);
			pass.dispatchWorkgroups(numBlocks);
			pass.end();
		}
	}

	// Step 3: Derive - expand symbols
	const deriveParams = new Uint32Array([inputCount, ctx.ruleCount, MAX_SUCCESSORS, 0]);
	device.queue.writeBuffer(ctx.paramsBuffer, 0, deriveParams);

	const deriveBindGroup = device.createBindGroup({
		layout: ctx.derivePipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ctx.paramsBuffer } },
			{ binding: 1, resource: { buffer: inputBuffer } },
			{ binding: 2, resource: { buffer: ctx.prefixSumsBuffer } },
			{ binding: 3, resource: { buffer: ctx.rulesBuffer } },
			{ binding: 4, resource: { buffer: ctx.successorsBuffer } },
			{ binding: 5, resource: { buffer: outputBuffer } },
		],
	});

	{
		const pass = commandEncoder.beginComputePass();
		pass.setPipeline(ctx.derivePipeline);
		pass.setBindGroup(0, deriveBindGroup);
		pass.dispatchWorkgroups(Math.ceil(inputCount / WORKGROUP_SIZE));
		pass.end();
	}

	device.queue.submit([commandEncoder.finish()]);

	// Calculate output count: last prefix sum + last count
	// For now, estimate. TODO: read back actual value
	const avgExpansion = 1.5; // Conservative estimate
	return Math.floor(inputCount * avgExpansion);
}

/**
 * Read symbols back from GPU
 */
async function readSymbols(
	ctx: GPUDerivationContext,
	buffer: GPUBuffer,
	count: number
): Promise<Symbol[]> {
	const { device } = ctx;
	
	// Create or reuse staging buffer
	const size = count * 4;
	if (!ctx.readbackBuffer || ctx.readbackBuffer.size < size) {
		ctx.readbackBuffer?.destroy();
		ctx.readbackBuffer = device.createBuffer({
			size,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});
	}

	const commandEncoder = device.createCommandEncoder();
	commandEncoder.copyBufferToBuffer(buffer, 0, ctx.readbackBuffer, 0, size);
	device.queue.submit([commandEncoder.finish()]);

	await ctx.readbackBuffer.mapAsync(GPUMapMode.READ);
	const data = new Uint32Array(ctx.readbackBuffer.getMappedRange().slice(0));
	ctx.readbackBuffer.unmap();
	
	const symbols: Symbol[] = new Array(count);
	for (let i = 0; i < count; i++) {
		symbols[i] = { id: String.fromCharCode(data[i]) };
	}
	
	return symbols;
}

/**
 * Check if GPU derivation should be used
 */
export function shouldUseGPU(symbolCount: number, generations: number): boolean {
	// GPU has overhead, only worth it for larger inputs
	const estimatedOutput = symbolCount * Math.pow(2, generations);
	return estimatedOutput > GPU_THRESHOLD;
}

/**
 * Clean up GPU resources
 */
export function destroyGPUDerivation(ctx: GPUDerivationContext): void {
	ctx.rulesBuffer.destroy();
	ctx.successorsBuffer.destroy();
	ctx.paramsBuffer.destroy();
	ctx.symbolBufferA.destroy();
	ctx.symbolBufferB.destroy();
	ctx.countsBuffer.destroy();
	ctx.prefixSumsBuffer.destroy();
	ctx.blockSumsBuffer.destroy();
	ctx.blockSumsScannedBuffer.destroy();
	ctx.readbackBuffer?.destroy();
	ctx.isReady = false;
}
