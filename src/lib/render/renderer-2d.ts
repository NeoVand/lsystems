/**
 * 2D WebGPU Renderer
 * Renders L-system line segments using WebGPU
 */

import type { GPUContext, LineSegment } from '../gpu/types';

/** Vertex shader for 2D lines */
const vertexShader = /* wgsl */ `
struct Uniforms {
    viewport: vec2f,
    scale: f32,
    offsetX: f32,
    offsetY: f32,
    _padding: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec2f,
    @location(1) color: vec4f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    // Apply scale and offset
    let scaledPos = input.position * uniforms.scale + vec2f(uniforms.offsetX, uniforms.offsetY);
    
    // Convert to clip space
    output.position = vec4f(scaledPos, 0.0, 1.0);
    output.color = input.color;
    
    return output;
}
`;

/** Fragment shader */
const fragmentShader = /* wgsl */ `
struct FragmentInput {
    @location(0) color: vec4f,
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
    return input.color;
}
`;

/** Uniform buffer data layout */
interface Uniforms {
	viewport: [number, number];
	scale: number;
	offsetX: number;
	offsetY: number;
}

/**
 * 2D Line Renderer using WebGPU
 */
export class Renderer2D {
	private pipeline: GPURenderPipeline | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private vertexBuffer: GPUBuffer | null = null;
	private bindGroup: GPUBindGroup | null = null;
	private vertexCount = 0;

	constructor(private ctx: GPUContext) {}

	/**
	 * Initialize render pipeline
	 */
	async init(): Promise<void> {
		const { device, format } = this.ctx;

		// Create shader modules
		const vertexModule = device.createShaderModule({
			label: 'Line Vertex Shader',
			code: vertexShader,
		});

		const fragmentModule = device.createShaderModule({
			label: 'Line Fragment Shader',
			code: fragmentShader,
		});

		// Create uniform buffer
		// WGSL struct alignment: vec2f(8) + f32(4) + f32(4) + f32(4) + padding to 16 + vec3f(12) = 48 bytes
		this.uniformBuffer = device.createBuffer({
			label: 'Uniforms',
			size: 48,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// Create bind group layout
		const bindGroupLayout = device.createBindGroupLayout({
			label: 'Renderer Bind Group Layout',
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX,
					buffer: { type: 'uniform' },
				},
			],
		});

		// Create bind group
		this.bindGroup = device.createBindGroup({
			label: 'Renderer Bind Group',
			layout: bindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffer },
				},
			],
		});

		// Create pipeline
		const pipelineLayout = device.createPipelineLayout({
			label: 'Renderer Pipeline Layout',
			bindGroupLayouts: [bindGroupLayout],
		});

		this.pipeline = device.createRenderPipeline({
			label: '2D Line Pipeline',
			layout: pipelineLayout,
			vertex: {
				module: vertexModule,
				entryPoint: 'main',
				buffers: [
					{
						arrayStride: 24, // 2 floats position + 4 floats color = 24 bytes
						attributes: [
							{ shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
							{ shaderLocation: 1, offset: 8, format: 'float32x4' }, // color
						],
					},
				],
			},
			fragment: {
				module: fragmentModule,
				entryPoint: 'main',
				targets: [{ format }],
			},
			primitive: {
				topology: 'line-list',
			},
			multisample: {
				count: 1,
			},
		});
	}

	// Reusable vertex data buffer to avoid allocations
	private vertexDataBuffer: Float32Array | null = null;

	/**
	 * Update vertex buffer with new segments
	 */
	updateSegments(segments: LineSegment[]): void {
		const { device } = this.ctx;
		const floatsNeeded = segments.length * 2 * 6; // 6 floats per vertex

		// Reuse or grow the vertex data buffer
		if (!this.vertexDataBuffer || this.vertexDataBuffer.length < floatsNeeded) {
			// Allocate with some headroom to avoid frequent reallocations
			this.vertexDataBuffer = new Float32Array(Math.max(floatsNeeded, floatsNeeded * 1.5));
		}
		
		const vertexData = this.vertexDataBuffer;
		let offset = 0;

		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			// Start vertex
			vertexData[offset] = seg.start[0];
			vertexData[offset + 1] = seg.start[1];
			vertexData[offset + 2] = seg.color[0];
			vertexData[offset + 3] = seg.color[1];
			vertexData[offset + 4] = seg.color[2];
			vertexData[offset + 5] = seg.color[3];

			// End vertex
			vertexData[offset + 6] = seg.end[0];
			vertexData[offset + 7] = seg.end[1];
			vertexData[offset + 8] = seg.color[0];
			vertexData[offset + 9] = seg.color[1];
			vertexData[offset + 10] = seg.color[2];
			vertexData[offset + 11] = seg.color[3];
			
			offset += 12;
		}

		// Recreate GPU buffer if needed
		const requiredSize = floatsNeeded * 4; // bytes
		if (!this.vertexBuffer || this.vertexBuffer.size < requiredSize) {
			this.vertexBuffer?.destroy();
			this.vertexBuffer = device.createBuffer({
				label: 'Vertex Buffer',
				size: Math.max(requiredSize, requiredSize * 1.5),
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}

		// Only write the portion we used
		device.queue.writeBuffer(this.vertexBuffer, 0, vertexData.buffer, 0, floatsNeeded * 4);
		this.vertexCount = segments.length * 2;
	}

	/**
	 * Update uniform values
	 */
	updateUniforms(uniforms: Uniforms): void {
		const { device } = this.ctx;

		// Match WGSL struct layout with proper alignment (48 bytes total)
		const data = new Float32Array([
			uniforms.viewport[0],  // offset 0
			uniforms.viewport[1],  // offset 4
			uniforms.scale,        // offset 8
			uniforms.offsetX,      // offset 12
			uniforms.offsetY,      // offset 16
			0,                     // offset 20 (padding to align vec3f to 16 bytes)
			0,                     // offset 24
			0,                     // offset 28
			0, 0, 0,               // offset 32: vec3f _padding (12 bytes)
			0,                     // offset 44 (padding to 48)
		]);

		device.queue.writeBuffer(this.uniformBuffer!, 0, data);
	}

	/**
	 * Render a frame
	 */
	render(backgroundColor: [number, number, number, number] = [0.04, 0.04, 0.06, 1]): void {
		if (!this.pipeline || !this.bindGroup || this.vertexCount === 0) {
			return;
		}

		const { device, context } = this.ctx;

		const commandEncoder = device.createCommandEncoder();
		const textureView = context.getCurrentTexture().createView();

		const renderPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textureView,
					clearValue: { r: backgroundColor[0], g: backgroundColor[1], b: backgroundColor[2], a: backgroundColor[3] },
					loadOp: 'clear',
					storeOp: 'store',
				},
			],
		});

		renderPass.setPipeline(this.pipeline);
		renderPass.setBindGroup(0, this.bindGroup);
		renderPass.setVertexBuffer(0, this.vertexBuffer!);
		renderPass.draw(this.vertexCount);
		renderPass.end();

		device.queue.submit([commandEncoder.finish()]);
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.vertexBuffer?.destroy();
		this.uniformBuffer?.destroy();
	}
}

/**
 * Parse hex color to RGBA
 */
export function hexToRgba(hex: string): [number, number, number, number] {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) {
		return [0, 0, 0, 1];
	}
	return [
		parseInt(result[1], 16) / 255,
		parseInt(result[2], 16) / 255,
		parseInt(result[3], 16) / 255,
		1,
	];
}
