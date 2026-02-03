/**
 * WebGPU device initialization and management
 */

import type { GPUCapabilities, GPUContext } from './types';
export type { GPUContext } from './types';

/** Error types for WebGPU initialization */
export class WebGPUNotSupportedError extends Error {
	constructor() {
		super('WebGPU is not supported in this browser');
		this.name = 'WebGPUNotSupportedError';
	}
}

export class WebGPUAdapterError extends Error {
	constructor() {
		super('Failed to get WebGPU adapter');
		this.name = 'WebGPUAdapterError';
	}
}

export class WebGPUDeviceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WebGPUDeviceError';
	}
}

/**
 * Check if WebGPU is available in the current browser
 */
export function isWebGPUSupported(): boolean {
	return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Query device capabilities
 */
function getCapabilities(adapter: GPUAdapter, device: GPUDevice): GPUCapabilities {
	const limits = device.limits;
	return {
		maxBufferSize: limits.maxBufferSize,
		maxComputeWorkgroupSize: limits.maxComputeWorkgroupSizeX,
		maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
		supportsTimestampQuery: adapter.features.has('timestamp-query'),
	};
}

/**
 * Initialize WebGPU device and context
 */
export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContext> {
	// Check WebGPU support
	if (!isWebGPUSupported()) {
		throw new WebGPUNotSupportedError();
	}

	// Request adapter
	const adapter = await navigator.gpu.requestAdapter({
		powerPreference: 'high-performance',
	});

	if (!adapter) {
		throw new WebGPUAdapterError();
	}

	// Log adapter info (if available, for debugging)
	if ('requestAdapterInfo' in adapter && import.meta.env.DEV) {
		const adapterInfo = await (adapter as GPUAdapter & { requestAdapterInfo(): Promise<GPUAdapterInfo> }).requestAdapterInfo();
		console.debug('WebGPU Adapter:', adapterInfo);
	}

	// Request device with default limits (simpler, more compatible)
	const device = await adapter.requestDevice({
		label: 'L-System Device',
	});

	// Handle device loss
	device.lost.then((info) => {
		console.error('WebGPU device lost:', info.message);
		if (info.reason !== 'destroyed') {
			// Could attempt recovery here
			throw new WebGPUDeviceError(`Device lost: ${info.reason} - ${info.message}`);
		}
	});

	// Configure canvas context
	const context = canvas.getContext('webgpu');
	if (!context) {
		throw new WebGPUDeviceError('Failed to get WebGPU canvas context');
	}

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device,
		format,
		alphaMode: 'premultiplied',
	});

	const capabilities = getCapabilities(adapter, device);

	return {
		adapter,
		device,
		context,
		format,
		capabilities,
	};
}

/**
 * Create a buffer with specified usage
 */
export function createBuffer(
	device: GPUDevice,
	size: number,
	usage: GPUBufferUsageFlags,
	label?: string
): GPUBuffer {
	return device.createBuffer({
		label,
		size,
		usage,
		mappedAtCreation: false,
	});
}

/**
 * Write data to a GPU buffer
 */
export function writeBuffer(device: GPUDevice, buffer: GPUBuffer, data: ArrayBuffer): void {
	device.queue.writeBuffer(buffer, 0, data);
}

/**
 * Clean up WebGPU resources
 */
export function destroyGPUContext(ctx: GPUContext): void {
	ctx.device.destroy();
}
