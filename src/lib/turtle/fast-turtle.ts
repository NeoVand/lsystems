/**
 * Fast CPU Turtle Interpreter
 * Optimized for performance with fused normalization and coloring
 * 
 * Key optimizations:
 * 1. Single pass: interpret + compute bounds simultaneously
 * 2. In-place normalization using pre-computed bounds
 * 3. Fused color computation
 * 4. Pre-allocated typed arrays to avoid GC
 * 5. Inlined math operations
 */

import type { Symbol } from '../grammar/types';
import type { LineSegment } from '../gpu/types';
import type { ColorSpectrum } from '../color/spectrum';
import { sampleSpectrum } from '../color/spectrum';

/** Color mode options */
export type ColorMode = 'depth' | 'branch' | 'position' | 'age' | 'uniform';

/** Configuration for fast turtle */
/** Point on an opacity curve */
export interface OpacityCurvePoint {
	x: number; // 0-1 position (e.g., depth ratio)
	y: number; // 0-1 opacity value
}

export interface FastTurtleConfig {
	angle: number; // Turn angle in degrees
	colorMode: ColorMode;
	hueOffset: number;
	saturation: number;
	lightness: number;
	uniformColor: [number, number, number]; // RGB 0-1
	// Spectrum coloring
	useSpectrum?: boolean; // If true, use spectrum instead of HSL
	spectrum?: ColorSpectrum; // The color spectrum to use
	// Opacity curve
	useOpacityCurve?: boolean;
	opacityCurve?: OpacityCurvePoint[];
	// Line width (in pixels, for thick line rendering)
	lineWidth?: number; // Default 1 (thin lines). >1 uses triangle quads
}

// Pre-allocated buffers for reuse across calls
let segmentBuffer: LineSegment[] | null = null;
let segmentBufferCapacity = 0;

// Lookup table for sin/cos (every 0.1 degree)
const ANGLE_LUT_SIZE = 3600;
const sinLUT = new Float32Array(ANGLE_LUT_SIZE);
const cosLUT = new Float32Array(ANGLE_LUT_SIZE);

// Initialize LUTs
for (let i = 0; i < ANGLE_LUT_SIZE; i++) {
	const rad = (i / 10) * Math.PI / 180;
	sinLUT[i] = Math.sin(rad);
	cosLUT[i] = Math.cos(rad);
}

/**
 * Fast sin using LUT (angle in radians)
 */
function fastSin(rad: number): number {
	// Normalize to 0-360 degrees
	let deg = (rad * 180 / Math.PI) % 360;
	if (deg < 0) deg += 360;
	const idx = Math.round(deg * 10) % ANGLE_LUT_SIZE;
	return sinLUT[idx];
}

/**
 * Fast cos using LUT (angle in radians)
 */
function fastCos(rad: number): number {
	let deg = (rad * 180 / Math.PI) % 360;
	if (deg < 0) deg += 360;
	const idx = Math.round(deg * 10) % ANGLE_LUT_SIZE;
	return cosLUT[idx];
}

/**
 * Sample opacity curve at position t (0-1)
 * Uses linear interpolation between points
 */
function sampleOpacityCurve(curve: OpacityCurvePoint[], t: number): number {
	if (!curve || curve.length === 0) return 1;
	if (curve.length === 1) return curve[0].y;
	
	// Clamp t to [0, 1]
	const clampedT = t < 0 ? 0 : (t > 1 ? 1 : t);
	
	// Find surrounding points (assume sorted by x)
	let i = 0;
	while (i < curve.length - 1 && curve[i + 1].x < clampedT) {
		i++;
	}
	
	// Handle edge cases
	if (i >= curve.length - 1) return curve[curve.length - 1].y;
	if (clampedT <= curve[0].x) return curve[0].y;
	
	// Linear interpolation
	const p0 = curve[i];
	const p1 = curve[i + 1];
	const denom = p1.x - p0.x;
	if (denom === 0) return p0.y;
	const localT = (clampedT - p0.x) / denom;
	return p0.y + localT * (p1.y - p0.y);
}

/**
 * HSL to RGB conversion (inlined for performance)
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r: number, g: number, b: number;

	if (h < 60) {
		r = c; g = x; b = 0;
	} else if (h < 120) {
		r = x; g = c; b = 0;
	} else if (h < 180) {
		r = 0; g = c; b = x;
	} else if (h < 240) {
		r = 0; g = x; b = c;
	} else if (h < 300) {
		r = x; g = 0; b = c;
	} else {
		r = c; g = 0; b = x;
	}

	return [r + m, g + m, b + m];
}

/**
 * Ensure segment buffer has enough capacity
 */
function ensureCapacity(needed: number): void {
	if (segmentBufferCapacity >= needed && segmentBuffer) return;
	
	const newCapacity = Math.max(needed, segmentBufferCapacity * 2, 1024);
	segmentBuffer = new Array(newCapacity);
	
	// Pre-create segment objects to avoid allocation in hot path
	for (let i = 0; i < newCapacity; i++) {
		segmentBuffer[i] = {
			start: [0, 0, 0],
			end: [0, 0, 0],
			depth: 0,
			branchId: 0,
			color: [0, 0, 0, 1],
		};
	}
	
	segmentBufferCapacity = newCapacity;
}

/**
 * Fast turtle interpretation with fused normalization and coloring
 * Returns segments normalized to [-1, 1] range
 */
export function interpretFast(
	symbols: Symbol[],
	config: FastTurtleConfig
): LineSegment[] {
	if (symbols.length === 0) return [];
	
	// Pre-count draw commands to pre-allocate
	let drawCount = 0;
	for (let i = 0; i < symbols.length; i++) {
		const c = symbols[i].id;
		if (c === 'F' || c === 'G' || c === 'A' || c === 'B') drawCount++;
	}
	
	if (drawCount === 0) return [];
	
	// Ensure buffer capacity
	ensureCapacity(drawCount);
	
	const PI = Math.PI;
	const angleRad = config.angle * PI / 180;
	const stepSize = 10; // Fixed step size, normalized later
	
	// Turtle state
	let x = 0;
	let y = 0;
	let angle = PI / 2; // Start pointing up
	let depth = 0;
	let branchId = 0;
	let nextBranchId = 1;
	
	// Stack (pre-allocated)
	const stackX = new Float32Array(256);
	const stackY = new Float32Array(256);
	const stackAngle = new Float32Array(256);
	const stackDepth = new Uint16Array(256);
	const stackBranch = new Uint32Array(256);
	let stackTop = 0;
	
	// Bounds tracking
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;
	
	// Interpretation pass - store raw coordinates and track bounds
	let segIdx = 0;
	
	for (let i = 0; i < symbols.length; i++) {
		const sym = symbols[i];
		const cmd = sym.id;
		
		switch (cmd) {
			case 'F':
			case 'G':
			case 'A':
			case 'B': {
				// Use parameter as step size if provided, otherwise use default
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : stepSize;
				// Use precise math for accuracy (LUT can be used if needed)
				const cosA = Math.cos(angle);
				const sinA = Math.sin(angle);
				const newX = x + cosA * step;
				const newY = y + sinA * step;
				
				// Store segment (reuse pre-allocated object)
				const seg = segmentBuffer![segIdx];
				seg.start[0] = x;
				seg.start[1] = y;
				seg.end[0] = newX;
				seg.end[1] = newY;
				seg.depth = depth;
				seg.branchId = branchId;
				segIdx++;
				
				// Update bounds
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (newX < minX) minX = newX;
				if (newX > maxX) maxX = newX;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
				if (newY < minY) minY = newY;
				if (newY > maxY) maxY = newY;
				
				x = newX;
				y = newY;
				break;
			}
			
			case 'f':
			case 'g': {
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : stepSize;
				x += Math.cos(angle) * step;
				y += Math.sin(angle) * step;
				break;
			}
			
			case '+': {
				const turnAngle = (sym.params && sym.params.length > 0) 
					? sym.params[0] * PI / 180 
					: angleRad;
				angle += turnAngle;
				break;
			}
			
			case '-': {
				const turnAngle = (sym.params && sym.params.length > 0) 
					? sym.params[0] * PI / 180 
					: angleRad;
				angle -= turnAngle;
				break;
			}
			
			case '[': {
				stackX[stackTop] = x;
				stackY[stackTop] = y;
				stackAngle[stackTop] = angle;
				stackDepth[stackTop] = depth;
				stackBranch[stackTop] = branchId;
				stackTop++;
				depth++;
				branchId = nextBranchId++;
				break;
			}
			
			case ']': {
				if (stackTop > 0) {
					stackTop--;
					x = stackX[stackTop];
					y = stackY[stackTop];
					angle = stackAngle[stackTop];
					depth = stackDepth[stackTop];
					branchId = stackBranch[stackTop];
				}
				break;
			}
			
			case '|': {
				angle += PI;
				break;
			}
			
			// 3D rotation commands (ignored in 2D mode)
			case '&':
			case '^':
			case '\\':
			case '/':
				break;
		}
	}
	
	// Edge case: no segments generated
	if (segIdx === 0) return [];
	
	// Compute normalization parameters
	const width = maxX - minX;
	const height = maxY - minY;
	const maxDim = Math.max(width, height);
	
	if (maxDim === 0) {
		// Degenerate case
		return [];
	}
	
	const scale = 1.8 / maxDim;
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	
	// Compute max values for color normalization
	let maxDepth = 0;
	let maxBranchId = 0;
	for (let i = 0; i < segIdx; i++) {
		const seg = segmentBuffer![i];
		if (seg.depth > maxDepth) maxDepth = seg.depth;
		if (seg.branchId > maxBranchId) maxBranchId = seg.branchId;
	}
	
	const rangeX = maxX - minX || 1;
	const rangeY = maxY - minY || 1;
	
	// Fused normalization + coloring pass
	const { colorMode, hueOffset, saturation, lightness, uniformColor, useSpectrum, spectrum } = config;
	
	for (let i = 0; i < segIdx; i++) {
		const seg = segmentBuffer![i];
		
		// Normalize coordinates in place
		seg.start[0] = (seg.start[0] - centerX) * scale;
		seg.start[1] = (seg.start[1] - centerY) * scale;
		seg.end[0] = (seg.end[0] - centerX) * scale;
		seg.end[1] = (seg.end[1] - centerY) * scale;
		
		// Handle uniform color mode
		if (colorMode === 'uniform') {
			seg.color[0] = uniformColor[0];
			seg.color[1] = uniformColor[1];
			seg.color[2] = uniformColor[2];
			seg.color[3] = 1.0;
			continue;
		}
		
		// Calculate normalized value t (0-1) based on color mode
		let t: number;
		
		switch (colorMode) {
			case 'depth':
				t = maxDepth > 0 ? seg.depth / maxDepth : 0;
				break;
			
			case 'branch':
				t = maxBranchId > 0 ? (seg.branchId % 100) / 100 : 0;
				break;
			
			case 'position': {
				const cx = (seg.start[0] + seg.end[0]) / 2;
				const cy = (seg.start[1] + seg.end[1]) / 2;
				// Normalize position to 0-1 using angle
				t = (Math.atan2(cy, cx) / PI + 1) / 2;
				break;
			}
			
			case 'age':
				t = i / segIdx;
				break;
			
			default:
				t = 0;
		}
		
		// Apply color
		let rgb: [number, number, number];
		
		if (useSpectrum && spectrum) {
			// Use spectrum coloring
			rgb = sampleSpectrum(spectrum, t);
		} else {
			// Legacy HSL coloring
			const hue = (t * 360 + hueOffset) % 360;
			rgb = hslToRgb(hue, saturation, lightness);
		}
		
		seg.color[0] = rgb[0];
		seg.color[1] = rgb[1];
		seg.color[2] = rgb[2];
		seg.color[3] = 1.0;
	}
	
	// Return slice of buffer (creates new array reference but reuses segment objects)
	return segmentBuffer!.slice(0, segIdx);
}

/**
 * Convert hex color to RGB array
 */
export function hexToRgbArray(hex: string): [number, number, number] {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return [0.5, 0.5, 0.5];
	return [
		parseInt(result[1], 16) / 255,
		parseInt(result[2], 16) / 255,
		parseInt(result[3], 16) / 255,
	];
}

// Pre-allocated vertex buffer for direct GPU upload
let vertexBuffer: Float32Array | null = null;
let vertexBufferCapacity = 0;

/**
 * Ultra-fast interpretation that outputs directly to GPU vertex format
 * Returns Float32Array with format: [x1, y1, r, g, b, a, x2, y2, r, g, b, a, ...]
 * Each line segment = 2 vertices = 12 floats
 * 
 * Also returns the segment count and bounds for potential use
 */
export function interpretToVertexBuffer(
	symbols: Symbol[],
	config: FastTurtleConfig
): { vertexData: Float32Array; vertexCount: number; segmentCount: number; useTriangles: boolean } | null {
	if (symbols.length === 0) return null;
	
	// Pre-count draw commands
	let drawCount = 0;
	for (let i = 0; i < symbols.length; i++) {
		const c = symbols[i].id;
		if (c === 'F' || c === 'G' || c === 'A' || c === 'B') drawCount++;
	}
	
	if (drawCount === 0) return null;
	
	// Determine if we need thick lines (triangles)
	const lineWidth = config.lineWidth ?? 1;
	const useTriangles = lineWidth > 1;
	
	// Floats needed:
	// - Thin lines (line-list): 12 floats per segment (2 vertices × 6 floats)
	// - Thick lines (triangle-list): 36 floats per segment (6 vertices × 6 floats for 2 triangles)
	const floatsPerSegment = useTriangles ? 36 : 12;
	const floatsNeeded = drawCount * floatsPerSegment;
	if (vertexBufferCapacity < floatsNeeded || !vertexBuffer) {
		vertexBufferCapacity = Math.max(floatsNeeded, vertexBufferCapacity * 2, 12288);
		vertexBuffer = new Float32Array(vertexBufferCapacity);
	}
	
	const PI = Math.PI;
	const angleRad = config.angle * PI / 180;
	const stepSize = 10;
	
	// Turtle state
	let x = 0;
	let y = 0;
	let angle = PI / 2;
	let depth = 0;
	let branchId = 0;
	let nextBranchId = 1;
	
	// Stack
	const stackX = new Float32Array(256);
	const stackY = new Float32Array(256);
	const stackAngle = new Float32Array(256);
	const stackDepth = new Uint16Array(256);
	const stackBranch = new Uint32Array(256);
	let stackTop = 0;
	
	// Raw segment data (position only, will normalize later)
	const rawX1 = new Float32Array(drawCount);
	const rawY1 = new Float32Array(drawCount);
	const rawX2 = new Float32Array(drawCount);
	const rawY2 = new Float32Array(drawCount);
	const rawDepth = new Uint16Array(drawCount);
	const rawBranch = new Uint32Array(drawCount);
	
	// Bounds
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;
	
	let segIdx = 0;
	
	// First pass: interpret and collect raw data + bounds
	for (let i = 0; i < symbols.length; i++) {
		const sym = symbols[i];
		const cmd = sym.id;
		
		switch (cmd) {
			case 'F':
			case 'G':
			case 'A':
			case 'B': {
				// Use parameter as step size if provided, otherwise use default
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : stepSize;
				const cosA = Math.cos(angle);
				const sinA = Math.sin(angle);
				const newX = x + cosA * step;
				const newY = y + sinA * step;
				
				rawX1[segIdx] = x;
				rawY1[segIdx] = y;
				rawX2[segIdx] = newX;
				rawY2[segIdx] = newY;
				rawDepth[segIdx] = depth;
				rawBranch[segIdx] = branchId;
				segIdx++;
				
				// Bounds
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (newX < minX) minX = newX;
				if (newX > maxX) maxX = newX;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
				if (newY < minY) minY = newY;
				if (newY > maxY) maxY = newY;
				
				x = newX;
				y = newY;
				break;
			}
			
			case 'f':
			case 'g': {
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : stepSize;
				x += Math.cos(angle) * step;
				y += Math.sin(angle) * step;
				break;
			}
			
			case '+': {
				const turnAngle = (sym.params && sym.params.length > 0) 
					? sym.params[0] * PI / 180 
					: angleRad;
				angle += turnAngle;
				break;
			}
			
			case '-': {
				const turnAngle = (sym.params && sym.params.length > 0) 
					? sym.params[0] * PI / 180 
					: angleRad;
				angle -= turnAngle;
				break;
			}
			
			case '[': {
				stackX[stackTop] = x;
				stackY[stackTop] = y;
				stackAngle[stackTop] = angle;
				stackDepth[stackTop] = depth;
				stackBranch[stackTop] = branchId;
				stackTop++;
				depth++;
				branchId = nextBranchId++;
				break;
			}
			
			case ']': {
				if (stackTop > 0) {
					stackTop--;
					x = stackX[stackTop];
					y = stackY[stackTop];
					angle = stackAngle[stackTop];
					depth = stackDepth[stackTop];
					branchId = stackBranch[stackTop];
				}
				break;
			}
			
			case '|': {
				angle += PI;
				break;
			}
		}
	}
	
	if (segIdx === 0) return null;
	
	// Normalization params
	const width = maxX - minX;
	const height = maxY - minY;
	const maxDim = Math.max(width, height);
	if (maxDim === 0) return null;
	
	const scale = 1.8 / maxDim;
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	
	// Color params
	const { colorMode, hueOffset, saturation, lightness, uniformColor, useSpectrum, spectrum, useOpacityCurve, opacityCurve, lineWidth: configLineWidth } = config;
	
	// Line width in normalized coordinates (scale from pixels to normalized space)
	// The normalized coordinate range is approximately [-0.9, 0.9] after scaling
	// We want lineWidth=1 to be thin (use lines), lineWidth=5 to be visibly thick
	// Scale factor: lineWidth of 5 should produce roughly 1-2% of the canvas width
	const halfWidth = ((configLineWidth ?? 1) / 2) * 0.008; // 0.8% per unit of lineWidth
	
	// Sort opacity curve points for efficient sampling
	const sortedOpacityCurve = useOpacityCurve && opacityCurve 
		? [...opacityCurve].sort((a, b) => a.x - b.x) 
		: null;
	
	// Compute max values for color normalization
	let maxDepth = 0;
	let maxBranchId = 0;
	for (let i = 0; i < segIdx; i++) {
		if (rawDepth[i] > maxDepth) maxDepth = rawDepth[i];
		if (rawBranch[i] > maxBranchId) maxBranchId = rawBranch[i];
	}
	
	// Second pass: normalize + color + write to vertex buffer
	let vIdx = 0;
	
	for (let i = 0; i < segIdx; i++) {
		// Normalized positions
		const x1 = (rawX1[i] - centerX) * scale;
		const y1 = (rawY1[i] - centerY) * scale;
		const x2 = (rawX2[i] - centerX) * scale;
		const y2 = (rawY2[i] - centerY) * scale;
		
		// Color
		let r: number, g: number, b: number;
		
		if (colorMode === 'uniform') {
			r = uniformColor[0];
			g = uniformColor[1];
			b = uniformColor[2];
		} else {
			// Calculate normalized value t (0-1) based on color mode
			let t: number;
			
			switch (colorMode) {
				case 'depth':
					t = maxDepth > 0 ? rawDepth[i] / maxDepth : 0;
					break;
				case 'branch':
					t = maxBranchId > 0 ? (rawBranch[i] % 100) / 100 : 0;
					break;
				case 'position': {
					const cx = (x1 + x2) / 2;
					const cy = (y1 + y2) / 2;
					t = (Math.atan2(cy, cx) / PI + 1) / 2;
					break;
				}
				case 'age':
					t = i / segIdx;
					break;
				default:
					t = 0;
			}
			
			// Apply color based on spectrum or HSL
			if (useSpectrum && spectrum) {
				const rgb = sampleSpectrum(spectrum, t);
				r = rgb[0];
				g = rgb[1];
				b = rgb[2];
			} else {
				const hue = (t * 360 + hueOffset) % 360;
				const rgb = hslToRgb(hue, saturation, lightness);
				r = rgb[0];
				g = rgb[1];
				b = rgb[2];
			}
		}
		
		// Calculate alpha from opacity curve (based on depth)
		let alpha = 1.0;
		if (sortedOpacityCurve && maxDepth > 0) {
			const depthT = rawDepth[i] / maxDepth;
			alpha = sampleOpacityCurve(sortedOpacityCurve, depthT);
		}
		
		if (useTriangles) {
			// Generate a quad (2 triangles, 6 vertices) for thick lines
			// Calculate perpendicular direction
			const dx = x2 - x1;
			const dy = y2 - y1;
			const len = Math.sqrt(dx * dx + dy * dy);
			
			if (len > 0) {
				// Perpendicular unit vector scaled by half-width
				const px = (-dy / len) * halfWidth;
				const py = (dx / len) * halfWidth;
				
				// Four corners of the quad
				const ax = x1 - px, ay = y1 - py; // Bottom-left
				const bx = x1 + px, by = y1 + py; // Top-left
				const cx = x2 + px, cy = y2 + py; // Top-right
				const dx2 = x2 - px, dy2 = y2 - py; // Bottom-right
				
				// Triangle 1: A, B, C
				vertexBuffer![vIdx++] = ax; vertexBuffer![vIdx++] = ay;
				vertexBuffer![vIdx++] = r; vertexBuffer![vIdx++] = g; vertexBuffer![vIdx++] = b; vertexBuffer![vIdx++] = alpha;
				
				vertexBuffer![vIdx++] = bx; vertexBuffer![vIdx++] = by;
				vertexBuffer![vIdx++] = r; vertexBuffer![vIdx++] = g; vertexBuffer![vIdx++] = b; vertexBuffer![vIdx++] = alpha;
				
				vertexBuffer![vIdx++] = cx; vertexBuffer![vIdx++] = cy;
				vertexBuffer![vIdx++] = r; vertexBuffer![vIdx++] = g; vertexBuffer![vIdx++] = b; vertexBuffer![vIdx++] = alpha;
				
				// Triangle 2: A, C, D
				vertexBuffer![vIdx++] = ax; vertexBuffer![vIdx++] = ay;
				vertexBuffer![vIdx++] = r; vertexBuffer![vIdx++] = g; vertexBuffer![vIdx++] = b; vertexBuffer![vIdx++] = alpha;
				
				vertexBuffer![vIdx++] = cx; vertexBuffer![vIdx++] = cy;
				vertexBuffer![vIdx++] = r; vertexBuffer![vIdx++] = g; vertexBuffer![vIdx++] = b; vertexBuffer![vIdx++] = alpha;
				
				vertexBuffer![vIdx++] = dx2; vertexBuffer![vIdx++] = dy2;
				vertexBuffer![vIdx++] = r; vertexBuffer![vIdx++] = g; vertexBuffer![vIdx++] = b; vertexBuffer![vIdx++] = alpha;
			}
		} else {
			// Simple line (2 vertices)
			// Vertex 1 (start)
			vertexBuffer![vIdx++] = x1;
			vertexBuffer![vIdx++] = y1;
			vertexBuffer![vIdx++] = r;
			vertexBuffer![vIdx++] = g;
			vertexBuffer![vIdx++] = b;
			vertexBuffer![vIdx++] = alpha;
			
			// Vertex 2 (end)
			vertexBuffer![vIdx++] = x2;
			vertexBuffer![vIdx++] = y2;
			vertexBuffer![vIdx++] = r;
			vertexBuffer![vIdx++] = g;
			vertexBuffer![vIdx++] = b;
			vertexBuffer![vIdx++] = alpha;
		}
	}
	
	return {
		vertexData: vertexBuffer!,
		vertexCount: useTriangles ? segIdx * 6 : segIdx * 2,
		segmentCount: segIdx,
		useTriangles,
	};
}
