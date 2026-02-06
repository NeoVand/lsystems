/**
 * 3D WebGPU Renderer for L-systems
 * Perspective camera with orbit controls
 */

import type { GPUContext } from '../gpu/types';
import type { Segment3D } from '../turtle/turtle-3d';

const vertexShader = /* wgsl */ `
struct Uniforms {
    mvp: mat4x4f,
    cameraPos: vec3f,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec3f,
    @location(1) color: vec4f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
    @location(1) worldPos: vec3f,
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniforms.mvp * vec4f(input.position, 1.0);
    output.color = input.color;
    output.worldPos = input.position;
    return output;
}
`;

const fragmentShader = /* wgsl */ `
struct FragmentInput {
    @location(0) color: vec4f,
    @location(1) worldPos: vec3f,
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
    // Simple depth-based fog for depth perception
    let dist = length(input.worldPos);
    let fog = 1.0 - smoothstep(0.0, 5.0, dist) * 0.3;
    return vec4f(input.color.rgb * fog, input.color.a);
}
`;

/** Camera state for orbit controls */
export interface CameraState {
	distance: number;
	theta: number; // Azimuth angle (radians)
	phi: number;   // Elevation angle (radians)
	target: [number, number, number];
	fov: number;
}

/**
 * 3D Line Renderer using WebGPU
 */
export class Renderer3D {
	private pipeline: GPURenderPipeline | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private vertexBuffer: GPUBuffer | null = null;
	private bindGroup: GPUBindGroup | null = null;
	private vertexCount = 0;
	private depthTexture: GPUTexture | null = null;
	private depthView: GPUTextureView | null = null;
	private lastWidth = 0;
	private lastHeight = 0;

	constructor(private ctx: GPUContext) {}

	async init(): Promise<void> {
		const { device, format } = this.ctx;

		const vertexModule = device.createShaderModule({
			label: '3D Vertex Shader',
			code: vertexShader,
		});

		const fragmentModule = device.createShaderModule({
			label: '3D Fragment Shader',
			code: fragmentShader,
		});

		// Uniform buffer for MVP matrix + camera position (128 bytes)
		this.uniformBuffer = device.createBuffer({
			label: '3D Uniforms',
			size: 128,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const bindGroupLayout = device.createBindGroupLayout({
			label: '3D Bind Group Layout',
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' },
				},
			],
		});

		this.bindGroup = device.createBindGroup({
			label: '3D Bind Group',
			layout: bindGroupLayout,
			entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
		});

		const pipelineLayout = device.createPipelineLayout({
			label: '3D Pipeline Layout',
			bindGroupLayouts: [bindGroupLayout],
		});

		this.pipeline = device.createRenderPipeline({
			label: '3D Line Pipeline',
			layout: pipelineLayout,
			vertex: {
				module: vertexModule,
				entryPoint: 'main',
				buffers: [
					{
						arrayStride: 28, // 3 floats position + 4 floats color = 28 bytes
						attributes: [
							{ shaderLocation: 0, offset: 0, format: 'float32x3' },
							{ shaderLocation: 1, offset: 12, format: 'float32x4' },
						],
					},
				],
			},
			fragment: {
				module: fragmentModule,
				entryPoint: 'main',
				targets: [{
					format,
					blend: {
						color: {
							srcFactor: 'src-alpha',
							dstFactor: 'one-minus-src-alpha',
							operation: 'add',
						},
						alpha: {
							srcFactor: 'one',
							dstFactor: 'one-minus-src-alpha',
							operation: 'add',
						},
					},
				}],
			},
			primitive: {
				topology: 'line-list',
			},
			depthStencil: {
				format: 'depth24plus',
				depthWriteEnabled: true,
				depthCompare: 'less',
			},
			multisample: { count: 1 },
		});
	}

	private ensureDepthTexture(width: number, height: number): void {
		if (this.depthTexture && this.lastWidth === width && this.lastHeight === height) {
			return;
		}

		this.depthTexture?.destroy();

		const { device } = this.ctx;
		this.depthTexture = device.createTexture({
			label: 'Depth Texture',
			size: { width, height },
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.depthView = this.depthTexture.createView();
		this.lastWidth = width;
		this.lastHeight = height;
	}

	// Reusable vertex data buffer
	private vertexDataBuffer: Float32Array | null = null;

	updateSegments(segments: Segment3D[]): void {
		const { device } = this.ctx;
		const floatsPerVertex = 7; // 3 pos + 4 color
		const floatsNeeded = segments.length * 2 * floatsPerVertex;

		// Reuse or grow the vertex data buffer
		if (!this.vertexDataBuffer || this.vertexDataBuffer.length < floatsNeeded) {
			this.vertexDataBuffer = new Float32Array(Math.max(floatsNeeded, floatsNeeded * 1.5));
		}

		const vertexData = this.vertexDataBuffer;
		let offset = 0;

		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			// Start vertex
			vertexData[offset] = seg.start[0];
			vertexData[offset + 1] = seg.start[1];
			vertexData[offset + 2] = seg.start[2];
			vertexData[offset + 3] = seg.color[0];
			vertexData[offset + 4] = seg.color[1];
			vertexData[offset + 5] = seg.color[2];
			vertexData[offset + 6] = seg.color[3];

			// End vertex
			vertexData[offset + 7] = seg.end[0];
			vertexData[offset + 8] = seg.end[1];
			vertexData[offset + 9] = seg.end[2];
			vertexData[offset + 10] = seg.color[0];
			vertexData[offset + 11] = seg.color[1];
			vertexData[offset + 12] = seg.color[2];
			vertexData[offset + 13] = seg.color[3];
			
			offset += 14;
		}

		const requiredSize = floatsNeeded * 4;
		if (!this.vertexBuffer || this.vertexBuffer.size < requiredSize) {
			this.vertexBuffer?.destroy();
			this.vertexBuffer = device.createBuffer({
				label: '3D Vertex Buffer',
				size: Math.max(requiredSize, requiredSize * 1.5),
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}

		device.queue.writeBuffer(this.vertexBuffer, 0, vertexData.buffer, 0, floatsNeeded * 4);
		this.vertexCount = segments.length * 2;
	}

	/**
	 * Direct vertex buffer upload - fast path
	 */
	updateVertexBuffer(vertexData: Float32Array, vertexCount: number): void {
		const { device } = this.ctx;
		
		const bytesNeeded = vertexCount * 7 * 4; // 7 floats per vertex (3 pos + 4 color)
		
		if (!this.vertexBuffer || this.vertexBuffer.size < bytesNeeded) {
			this.vertexBuffer?.destroy();
			this.vertexBuffer = device.createBuffer({
				label: '3D Vertex Buffer',
				size: Math.max(bytesNeeded, bytesNeeded * 1.5),
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}

		device.queue.writeBuffer(this.vertexBuffer, 0, vertexData.buffer, 0, bytesNeeded);
		this.vertexCount = vertexCount;
	}

	updateCamera(camera: CameraState, aspect: number): void {
		const { device } = this.ctx;

		// Orbit camera: theta = azimuth around Z, phi = elevation above XY plane
		// phi: 0 = on XY plane, positive = above (looking down), negative = below (looking up)
		// theta: 0 = from +X direction, PI/2 = from +Y direction
		const cosPhi = Math.cos(camera.phi);
		const sinPhi = Math.sin(camera.phi);
		const cosTheta = Math.cos(camera.theta);
		const sinTheta = Math.sin(camera.theta);
		
		// Camera position in world space
		const x = camera.distance * cosPhi * cosTheta;
		const y = camera.distance * cosPhi * sinTheta;
		const z = camera.distance * sinPhi;
		
		const cameraPos: [number, number, number] = [
			x + camera.target[0],
			y + camera.target[1],
			z + camera.target[2],
		];

		// Build matrices - Z is up
		const view = lookAt(cameraPos, camera.target, [0, 0, 1]);
		const proj = perspective(camera.fov, aspect, 0.01, 100);
		const mvp = mat4Mul(proj, view);

		// Pack into uniform buffer
		const data = new Float32Array(32);
		data.set(mvp, 0); // 16 floats for mvp
		data.set(cameraPos, 16); // 3 floats for camera position
		data[19] = 0; // padding

		device.queue.writeBuffer(this.uniformBuffer!, 0, data);
	}

	render(bgColor: [number, number, number, number]): void {
		if (!this.pipeline || !this.vertexBuffer || this.vertexCount === 0) return;

		const { device, context } = this.ctx;
		const texture = context.getCurrentTexture();
		const width = texture.width;
		const height = texture.height;

		this.ensureDepthTexture(width, height);

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: texture.createView(),
					clearValue: { r: bgColor[0], g: bgColor[1], b: bgColor[2], a: bgColor[3] },
					loadOp: 'clear',
					storeOp: 'store',
				},
			],
			depthStencilAttachment: {
				view: this.depthView!,
				depthClearValue: 1.0,
				depthLoadOp: 'clear',
				depthStoreOp: 'store',
			},
		});

		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup!);
		pass.setVertexBuffer(0, this.vertexBuffer);
		pass.draw(this.vertexCount);
		pass.end();

		device.queue.submit([encoder.finish()]);
	}

	destroy(): void {
		this.uniformBuffer?.destroy();
		this.vertexBuffer?.destroy();
		this.depthTexture?.destroy();
	}
}

// ============ Matrix math helpers ============

type Mat4 = Float32Array;

/**
 * Multiply two 4x4 matrices in column-major order (as WGSL expects)
 * Result = A * B in mathematical notation
 */
function mat4Mul(a: Mat4, b: Mat4): Mat4 {
	const out = new Float32Array(16);
	// Column-major: element at (row, col) is at index col*4 + row
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			out[col * 4 + row] =
				a[0 * 4 + row] * b[col * 4 + 0] +
				a[1 * 4 + row] * b[col * 4 + 1] +
				a[2 * 4 + row] * b[col * 4 + 2] +
				a[3 * 4 + row] * b[col * 4 + 3];
		}
	}
	return out;
}

function lookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]): Mat4 {
	const zAxis = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
	const xAxis = normalize(cross(up, zAxis));
	const yAxis = cross(zAxis, xAxis);

	return new Float32Array([
		xAxis[0], yAxis[0], zAxis[0], 0,
		xAxis[1], yAxis[1], zAxis[1], 0,
		xAxis[2], yAxis[2], zAxis[2], 0,
		-dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
	]);
}

function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan(fovY / 2);
	const rangeInv = 1 / (near - far);
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (near + far) * rangeInv, -1,
		0, 0, near * far * rangeInv * 2, 0,
	]);
}

function normalize(v: [number, number, number]): [number, number, number] {
	const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
	return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
