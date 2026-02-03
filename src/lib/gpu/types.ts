/**
 * WebGPU type definitions and constants for L-system rendering
 */

/** Symbol buffer layout - 32 bytes per symbol for GPU alignment */
export interface GPUSymbol {
	id: number; // 4 bytes: symbol identifier
	flags: number; // 4 bytes: is_drawable, is_branch, etc.
	params: [number, number, number, number]; // 16 bytes: up to 4 parameters
	depth: number; // 4 bytes: bracket nesting depth
	branchId: number; // 4 bytes: which branch segment this belongs to
}

/** Symbol flags bitfield */
export const SymbolFlags = {
	DRAWABLE: 1 << 0,
	BRANCH_OPEN: 1 << 1,
	BRANCH_CLOSE: 1 << 2,
	ROTATION: 1 << 3,
} as const;

/** Buffer size constants */
export const GPU_LIMITS = {
	SYMBOL_SIZE: 32, // bytes per symbol
	MAX_BUFFER_SIZE: 128 * 1024 * 1024, // 128MB conservative
	MAX_SYMBOLS: Math.floor((128 * 1024 * 1024) / 32), // ~4M symbols
	WORKGROUP_SIZE: 256,
} as const;

/** GPU device capabilities */
export interface GPUCapabilities {
	maxBufferSize: number;
	maxComputeWorkgroupSize: number;
	maxStorageBufferBindingSize: number;
	supportsTimestampQuery: boolean;
}

/** Vertex data for 2D line rendering */
export interface LineVertex {
	position: [number, number];
	color: [number, number, number, number];
}

/** Transform state for turtle graphics */
export interface TurtleTransform {
	x: number;
	y: number;
	z: number;
	angle: number; // radians
	// For 3D: heading, pitch, roll vectors
	heading: [number, number, number];
	left: [number, number, number];
	up: [number, number, number];
}

/** Line segment produced by turtle */
export interface LineSegment {
	start: [number, number, number];
	end: [number, number, number];
	depth: number;
	branchId: number;
	color: [number, number, number, number];
}

/** WebGPU context state */
export interface GPUContext {
	adapter: GPUAdapter;
	device: GPUDevice;
	context: GPUCanvasContext;
	format: GPUTextureFormat;
	capabilities: GPUCapabilities;
}

/** Buffer pool entry */
export interface BufferEntry {
	buffer: GPUBuffer;
	size: number;
	usage: GPUBufferUsageFlags;
	label?: string;
}

/** Pipeline cache entry */
export interface PipelineEntry {
	pipeline: GPUComputePipeline | GPURenderPipeline;
	bindGroupLayout: GPUBindGroupLayout;
}
