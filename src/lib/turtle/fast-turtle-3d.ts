/**
 * Fast 3D Turtle Interpreter
 * Optimized for performance with fused normalization and coloring
 */

import type { Symbol } from '../grammar/types';
import type { Segment3D } from './turtle-3d';
import type { ColorSpectrum } from '../color/spectrum';
import { sampleSpectrum } from '../color/spectrum';

/** Color mode options */
export type ColorMode3D = 'depth' | 'branch' | 'position' | 'age' | 'uniform';

/** Configuration for fast 3D turtle */
export interface FastTurtle3DConfig {
	angle: number; // Turn angle in degrees
	colorMode: ColorMode3D;
	hueOffset: number;
	saturation: number;
	lightness: number;
	uniformColor: [number, number, number]; // RGB 0-1
	// Spectrum coloring
	useSpectrum?: boolean; // If true, use spectrum instead of HSL
	spectrum?: ColorSpectrum; // The color spectrum to use
}

/** 3D Vector */
type Vec3 = [number, number, number];

/** 3x3 Rotation matrix (column-major) */
type Mat3 = [number, number, number, number, number, number, number, number, number];

// Pre-allocated segment buffer
let segmentBuffer: Segment3D[] | null = null;
let segmentBufferCapacity = 0;

/**
 * HSL to RGB conversion
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r: number, g: number, b: number;
	if (h < 60) { r = c; g = x; b = 0; }
	else if (h < 120) { r = x; g = c; b = 0; }
	else if (h < 180) { r = 0; g = c; b = x; }
	else if (h < 240) { r = 0; g = x; b = c; }
	else if (h < 300) { r = x; g = 0; b = c; }
	else { r = c; g = 0; b = x; }

	return [r + m, g + m, b + m];
}

/**
 * Ensure segment buffer has enough capacity
 */
function ensureCapacity(needed: number): void {
	if (segmentBufferCapacity >= needed && segmentBuffer) return;
	
	const newCapacity = Math.max(needed, segmentBufferCapacity * 2, 1024);
	segmentBuffer = new Array(newCapacity);
	
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

// Rotation matrices (inlined for performance)
function rotateU(c: number, s: number): Mat3 {
	return [c, s, 0, -s, c, 0, 0, 0, 1];
}

function rotateL(c: number, s: number): Mat3 {
	return [c, 0, -s, 0, 1, 0, s, 0, c];
}

function rotateH(c: number, s: number): Mat3 {
	return [1, 0, 0, 0, c, -s, 0, s, c];
}

function mat3Mul(a: Mat3, b: Mat3): Mat3 {
	return [
		a[0]*b[0] + a[3]*b[1] + a[6]*b[2],
		a[1]*b[0] + a[4]*b[1] + a[7]*b[2],
		a[2]*b[0] + a[5]*b[1] + a[8]*b[2],
		a[0]*b[3] + a[3]*b[4] + a[6]*b[5],
		a[1]*b[3] + a[4]*b[4] + a[7]*b[5],
		a[2]*b[3] + a[5]*b[4] + a[8]*b[5],
		a[0]*b[6] + a[3]*b[7] + a[6]*b[8],
		a[1]*b[6] + a[4]*b[7] + a[7]*b[8],
		a[2]*b[6] + a[5]*b[7] + a[8]*b[8],
	];
}

/**
 * Fast 3D turtle interpretation with fused normalization and coloring
 */
export function interpretFast3D(
	symbols: Symbol[],
	config: FastTurtle3DConfig
): Segment3D[] {
	if (symbols.length === 0) return [];
	
	// Pre-count draw commands
	let drawCount = 0;
	for (let i = 0; i < symbols.length; i++) {
		const c = symbols[i].id;
		if (c === 'F' || c === 'G' || c === 'A' || c === 'B') drawCount++;
	}
	
	if (drawCount === 0) return [];
	
	ensureCapacity(drawCount);
	
	const PI = Math.PI;
	const angleRad = config.angle * PI / 180;
	const cosAngle = Math.cos(angleRad);
	const sinAngle = Math.sin(angleRad);
	const defaultStep = 10;
	
	// Pre-compute 180° rotation
	const cos180 = -1;
	const sin180 = 0;
	
	// Turtle state
	let px = 0, py = 0, pz = 0;
	// Initial rotation: heading +Z (upward)
	let r0 = 0, r1 = 0, r2 = 1;
	let r3 = 0, r4 = 1, r5 = 0;
	let r6 = -1, r7 = 0, r8 = 0;
	
	let depth = 0;
	let branchId = 0;
	let nextBranchId = 1;
	
	// Stack (pre-allocated typed arrays)
	const stackPX = new Float32Array(256);
	const stackPY = new Float32Array(256);
	const stackPZ = new Float32Array(256);
	const stackR = new Float32Array(256 * 9);
	const stackDepth = new Uint16Array(256);
	const stackBranch = new Uint32Array(256);
	let stackTop = 0;
	
	// Bounds tracking
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;
	let minZ = Infinity, maxZ = -Infinity;
	
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
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : defaultStep;
				// Heading is first column: [r0, r1, r2]
				const newX = px + r0 * step;
				const newY = py + r1 * step;
				const newZ = pz + r2 * step;
				
				const seg = segmentBuffer![segIdx];
				seg.start[0] = px;
				seg.start[1] = py;
				seg.start[2] = pz;
				seg.end[0] = newX;
				seg.end[1] = newY;
				seg.end[2] = newZ;
				seg.depth = depth;
				seg.branchId = branchId;
				segIdx++;
				
				// Update bounds
				if (px < minX) minX = px;
				if (px > maxX) maxX = px;
				if (newX < minX) minX = newX;
				if (newX > maxX) maxX = newX;
				if (py < minY) minY = py;
				if (py > maxY) maxY = py;
				if (newY < minY) minY = newY;
				if (newY > maxY) maxY = newY;
				if (pz < minZ) minZ = pz;
				if (pz > maxZ) maxZ = pz;
				if (newZ < minZ) minZ = newZ;
				if (newZ > maxZ) maxZ = newZ;
				
				px = newX;
				py = newY;
				pz = newZ;
				break;
			}
			
			case 'f':
			case 'g': {
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : defaultStep;
				px += r0 * step;
				py += r1 * step;
				pz += r2 * step;
				break;
			}
			
			case '+': { // Yaw left
				const c = cosAngle, s = sinAngle;
				const nr0 = r0*c - r3*s, nr1 = r1*c - r4*s, nr2 = r2*c - r5*s;
				const nr3 = r0*s + r3*c, nr4 = r1*s + r4*c, nr5 = r2*s + r5*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r3 = nr3; r4 = nr4; r5 = nr5;
				break;
			}
			
			case '-': { // Yaw right
				const c = cosAngle, s = -sinAngle;
				const nr0 = r0*c - r3*s, nr1 = r1*c - r4*s, nr2 = r2*c - r5*s;
				const nr3 = r0*s + r3*c, nr4 = r1*s + r4*c, nr5 = r2*s + r5*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r3 = nr3; r4 = nr4; r5 = nr5;
				break;
			}
			
			case '&': { // Pitch down
				const c = cosAngle, s = sinAngle;
				const nr0 = r0*c + r6*s, nr1 = r1*c + r7*s, nr2 = r2*c + r8*s;
				const nr6 = -r0*s + r6*c, nr7 = -r1*s + r7*c, nr8 = -r2*s + r8*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '^': { // Pitch up
				const c = cosAngle, s = -sinAngle;
				const nr0 = r0*c + r6*s, nr1 = r1*c + r7*s, nr2 = r2*c + r8*s;
				const nr6 = -r0*s + r6*c, nr7 = -r1*s + r7*c, nr8 = -r2*s + r8*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '\\': { // Roll left
				const c = cosAngle, s = sinAngle;
				const nr3 = r3*c - r6*s, nr4 = r4*c - r7*s, nr5 = r5*c - r8*s;
				const nr6 = r3*s + r6*c, nr7 = r4*s + r7*c, nr8 = r5*s + r8*c;
				r3 = nr3; r4 = nr4; r5 = nr5;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '/': { // Roll right
				const c = cosAngle, s = -sinAngle;
				const nr3 = r3*c - r6*s, nr4 = r4*c - r7*s, nr5 = r5*c - r8*s;
				const nr6 = r3*s + r6*c, nr7 = r4*s + r7*c, nr8 = r5*s + r8*c;
				r3 = nr3; r4 = nr4; r5 = nr5;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '|': { // Turn around (180° yaw)
				r0 = -r0; r1 = -r1; r2 = -r2;
				r3 = -r3; r4 = -r4; r5 = -r5;
				break;
			}
			
			case '[': {
				const base = stackTop * 9;
				stackPX[stackTop] = px;
				stackPY[stackTop] = py;
				stackPZ[stackTop] = pz;
				stackR[base] = r0; stackR[base+1] = r1; stackR[base+2] = r2;
				stackR[base+3] = r3; stackR[base+4] = r4; stackR[base+5] = r5;
				stackR[base+6] = r6; stackR[base+7] = r7; stackR[base+8] = r8;
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
					const base = stackTop * 9;
					px = stackPX[stackTop];
					py = stackPY[stackTop];
					pz = stackPZ[stackTop];
					r0 = stackR[base]; r1 = stackR[base+1]; r2 = stackR[base+2];
					r3 = stackR[base+3]; r4 = stackR[base+4]; r5 = stackR[base+5];
					r6 = stackR[base+6]; r7 = stackR[base+7]; r8 = stackR[base+8];
					depth = stackDepth[stackTop];
					branchId = stackBranch[stackTop];
				}
				break;
			}
		}
	}
	
	if (segIdx === 0) return [];
	
	// Compute normalization
	const width = maxX - minX;
	const height = maxY - minY;
	const depthRange = maxZ - minZ;
	const maxDim = Math.max(width, height, depthRange);
	
	if (maxDim === 0) return [];
	
	const scale = 1.8 / maxDim;
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	const centerZ = (minZ + maxZ) / 2;
	
	// Color params
	const { colorMode, hueOffset, saturation, lightness, uniformColor, useSpectrum, spectrum } = config;
	
	// Compute max values for color normalization
	let maxDepth = 0;
	let maxBranchId = 0;
	for (let i = 0; i < segIdx; i++) {
		const seg = segmentBuffer![i];
		if (seg.depth > maxDepth) maxDepth = seg.depth;
		if (seg.branchId > maxBranchId) maxBranchId = seg.branchId;
	}
	
	// Fused normalization + coloring pass
	for (let i = 0; i < segIdx; i++) {
		const seg = segmentBuffer![i];
		
		// Normalize
		seg.start[0] = (seg.start[0] - centerX) * scale;
		seg.start[1] = (seg.start[1] - centerY) * scale;
		seg.start[2] = (seg.start[2] - centerZ) * scale;
		seg.end[0] = (seg.end[0] - centerX) * scale;
		seg.end[1] = (seg.end[1] - centerY) * scale;
		seg.end[2] = (seg.end[2] - centerZ) * scale;
		
		// Handle uniform color
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
				const cz = (seg.start[2] + seg.end[2]) / 2;
				const dist = Math.sqrt(cx*cx + cy*cy + cz*cz);
				t = Math.min(dist / 1.8, 1); // Normalize to 0-1 based on max distance
				break;
			}
			case 'age':
				t = i / segIdx;
				break;
			default:
				t = 0;
		}
		
		// Apply color based on spectrum or HSL
		let rgb: [number, number, number];
		if (useSpectrum && spectrum) {
			rgb = sampleSpectrum(spectrum, t);
		} else {
			const hue = (t * 360 + hueOffset) % 360;
			rgb = hslToRgb(hue, saturation, lightness);
		}
		
		seg.color[0] = rgb[0];
		seg.color[1] = rgb[1];
		seg.color[2] = rgb[2];
		seg.color[3] = 1.0;
	}
	
	return segmentBuffer!.slice(0, segIdx);
}

// Pre-allocated vertex buffer for direct GPU upload
let vertexBuffer3D: Float32Array | null = null;
let vertexBuffer3DCapacity = 0;

/**
 * Ultra-fast 3D interpretation that outputs directly to GPU vertex format
 * Returns Float32Array with format: [x1, y1, z1, r, g, b, a, x2, y2, z2, r, g, b, a, ...]
 * Each line segment = 2 vertices = 14 floats
 */
export function interpretToVertexBuffer3D(
	symbols: Symbol[],
	config: FastTurtle3DConfig
): { vertexData: Float32Array; vertexCount: number; segmentCount: number } | null {
	if (symbols.length === 0) return null;
	
	// Pre-count draw commands
	let drawCount = 0;
	for (let i = 0; i < symbols.length; i++) {
		const c = symbols[i].id;
		if (c === 'F' || c === 'G' || c === 'A' || c === 'B') drawCount++;
	}
	
	if (drawCount === 0) return null;
	
	// Ensure buffer capacity (14 floats per segment: 2 vertices × 7 floats)
	const floatsNeeded = drawCount * 14;
	if (vertexBuffer3DCapacity < floatsNeeded || !vertexBuffer3D) {
		vertexBuffer3DCapacity = Math.max(floatsNeeded, vertexBuffer3DCapacity * 2, 14336);
		vertexBuffer3D = new Float32Array(vertexBuffer3DCapacity);
	}
	
	const PI = Math.PI;
	const angleRad = config.angle * PI / 180;
	const cosAngle = Math.cos(angleRad);
	const sinAngle = Math.sin(angleRad);
	const defaultStep = 10;
	
	// Turtle state (position)
	let px = 0, py = 0, pz = 0;
	// Rotation matrix elements (initial: heading +Z)
	let r0 = 0, r1 = 0, r2 = 1;
	let r3 = 0, r4 = 1, r5 = 0;
	let r6 = -1, r7 = 0, r8 = 0;
	
	let depth = 0;
	let branchId = 0;
	let nextBranchId = 1;
	
	// Stack
	const stackPX = new Float32Array(256);
	const stackPY = new Float32Array(256);
	const stackPZ = new Float32Array(256);
	const stackR = new Float32Array(256 * 9);
	const stackDepth = new Uint16Array(256);
	const stackBranch = new Uint32Array(256);
	let stackTop = 0;
	
	// Raw segment storage for normalization
	const rawX1 = new Float32Array(drawCount);
	const rawY1 = new Float32Array(drawCount);
	const rawZ1 = new Float32Array(drawCount);
	const rawX2 = new Float32Array(drawCount);
	const rawY2 = new Float32Array(drawCount);
	const rawZ2 = new Float32Array(drawCount);
	const rawDepth = new Uint16Array(drawCount);
	const rawBranch = new Uint32Array(drawCount);
	
	// Bounds
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;
	let minZ = Infinity, maxZ = -Infinity;
	
	let segIdx = 0;
	
	// First pass: interpret
	for (let i = 0; i < symbols.length; i++) {
		const sym = symbols[i];
		const cmd = sym.id;
		
		switch (cmd) {
			case 'F':
			case 'G':
			case 'A':
			case 'B': {
				// Use parameter as step size if provided, otherwise use default
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : defaultStep;
				const newX = px + r0 * step;
				const newY = py + r1 * step;
				const newZ = pz + r2 * step;
				
				rawX1[segIdx] = px;
				rawY1[segIdx] = py;
				rawZ1[segIdx] = pz;
				rawX2[segIdx] = newX;
				rawY2[segIdx] = newY;
				rawZ2[segIdx] = newZ;
				rawDepth[segIdx] = depth;
				rawBranch[segIdx] = branchId;
				segIdx++;
				
				// Bounds
				if (px < minX) minX = px;
				if (px > maxX) maxX = px;
				if (newX < minX) minX = newX;
				if (newX > maxX) maxX = newX;
				if (py < minY) minY = py;
				if (py > maxY) maxY = py;
				if (newY < minY) minY = newY;
				if (newY > maxY) maxY = newY;
				if (pz < minZ) minZ = pz;
				if (pz > maxZ) maxZ = pz;
				if (newZ < minZ) minZ = newZ;
				if (newZ > maxZ) maxZ = newZ;
				
				px = newX; py = newY; pz = newZ;
				break;
			}
			
			case 'f':
			case 'g': {
				const step = (sym.params && sym.params.length > 0) ? sym.params[0] : defaultStep;
				px += r0 * step;
				py += r1 * step;
				pz += r2 * step;
				break;
			}
			
			case '+': {
				const c = cosAngle, s = sinAngle;
				const nr0 = r0*c - r3*s, nr1 = r1*c - r4*s, nr2 = r2*c - r5*s;
				const nr3 = r0*s + r3*c, nr4 = r1*s + r4*c, nr5 = r2*s + r5*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r3 = nr3; r4 = nr4; r5 = nr5;
				break;
			}
			
			case '-': {
				const c = cosAngle, s = -sinAngle;
				const nr0 = r0*c - r3*s, nr1 = r1*c - r4*s, nr2 = r2*c - r5*s;
				const nr3 = r0*s + r3*c, nr4 = r1*s + r4*c, nr5 = r2*s + r5*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r3 = nr3; r4 = nr4; r5 = nr5;
				break;
			}
			
			case '&': {
				const c = cosAngle, s = sinAngle;
				const nr0 = r0*c + r6*s, nr1 = r1*c + r7*s, nr2 = r2*c + r8*s;
				const nr6 = -r0*s + r6*c, nr7 = -r1*s + r7*c, nr8 = -r2*s + r8*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '^': {
				const c = cosAngle, s = -sinAngle;
				const nr0 = r0*c + r6*s, nr1 = r1*c + r7*s, nr2 = r2*c + r8*s;
				const nr6 = -r0*s + r6*c, nr7 = -r1*s + r7*c, nr8 = -r2*s + r8*c;
				r0 = nr0; r1 = nr1; r2 = nr2;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '\\': {
				const c = cosAngle, s = sinAngle;
				const nr3 = r3*c - r6*s, nr4 = r4*c - r7*s, nr5 = r5*c - r8*s;
				const nr6 = r3*s + r6*c, nr7 = r4*s + r7*c, nr8 = r5*s + r8*c;
				r3 = nr3; r4 = nr4; r5 = nr5;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '/': {
				const c = cosAngle, s = -sinAngle;
				const nr3 = r3*c - r6*s, nr4 = r4*c - r7*s, nr5 = r5*c - r8*s;
				const nr6 = r3*s + r6*c, nr7 = r4*s + r7*c, nr8 = r5*s + r8*c;
				r3 = nr3; r4 = nr4; r5 = nr5;
				r6 = nr6; r7 = nr7; r8 = nr8;
				break;
			}
			
			case '|': {
				r0 = -r0; r1 = -r1; r2 = -r2;
				r3 = -r3; r4 = -r4; r5 = -r5;
				break;
			}
			
			case '[': {
				const base = stackTop * 9;
				stackPX[stackTop] = px;
				stackPY[stackTop] = py;
				stackPZ[stackTop] = pz;
				stackR[base] = r0; stackR[base+1] = r1; stackR[base+2] = r2;
				stackR[base+3] = r3; stackR[base+4] = r4; stackR[base+5] = r5;
				stackR[base+6] = r6; stackR[base+7] = r7; stackR[base+8] = r8;
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
					const base = stackTop * 9;
					px = stackPX[stackTop];
					py = stackPY[stackTop];
					pz = stackPZ[stackTop];
					r0 = stackR[base]; r1 = stackR[base+1]; r2 = stackR[base+2];
					r3 = stackR[base+3]; r4 = stackR[base+4]; r5 = stackR[base+5];
					r6 = stackR[base+6]; r7 = stackR[base+7]; r8 = stackR[base+8];
					depth = stackDepth[stackTop];
					branchId = stackBranch[stackTop];
				}
				break;
			}
		}
	}
	
	if (segIdx === 0) return null;
	
	// Normalization params
	const width = maxX - minX;
	const height = maxY - minY;
	const depthRange = maxZ - minZ;
	const maxDim = Math.max(width, height, depthRange);
	if (maxDim === 0) return null;
	
	const scale = 1.8 / maxDim;
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	const centerZ = (minZ + maxZ) / 2;
	
	const { colorMode, hueOffset, saturation, lightness, uniformColor, useSpectrum, spectrum } = config;
	
	// Compute max values for color normalization
	let maxDepthVal = 0;
	let maxBranchIdVal = 0;
	for (let i = 0; i < segIdx; i++) {
		if (rawDepth[i] > maxDepthVal) maxDepthVal = rawDepth[i];
		if (rawBranch[i] > maxBranchIdVal) maxBranchIdVal = rawBranch[i];
	}
	
	// Second pass: normalize + color + write to vertex buffer
	let vIdx = 0;
	
	for (let i = 0; i < segIdx; i++) {
		// Normalized positions
		const x1 = (rawX1[i] - centerX) * scale;
		const y1 = (rawY1[i] - centerY) * scale;
		const z1 = (rawZ1[i] - centerZ) * scale;
		const x2 = (rawX2[i] - centerX) * scale;
		const y2 = (rawY2[i] - centerY) * scale;
		const z2 = (rawZ2[i] - centerZ) * scale;
		
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
					t = maxDepthVal > 0 ? rawDepth[i] / maxDepthVal : 0;
					break;
				case 'branch':
					t = maxBranchIdVal > 0 ? (rawBranch[i] % 100) / 100 : 0;
					break;
				case 'position': {
					const dist = Math.sqrt(x1*x1 + y1*y1 + z1*z1);
					t = Math.min(dist / 1.8, 1);
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
		
		// Vertex 1 (start)
		vertexBuffer3D![vIdx++] = x1;
		vertexBuffer3D![vIdx++] = y1;
		vertexBuffer3D![vIdx++] = z1;
		vertexBuffer3D![vIdx++] = r;
		vertexBuffer3D![vIdx++] = g;
		vertexBuffer3D![vIdx++] = b;
		vertexBuffer3D![vIdx++] = 1.0;
		
		// Vertex 2 (end)
		vertexBuffer3D![vIdx++] = x2;
		vertexBuffer3D![vIdx++] = y2;
		vertexBuffer3D![vIdx++] = z2;
		vertexBuffer3D![vIdx++] = r;
		vertexBuffer3D![vIdx++] = g;
		vertexBuffer3D![vIdx++] = b;
		vertexBuffer3D![vIdx++] = 1.0;
	}
	
	return {
		vertexData: vertexBuffer3D!,
		vertexCount: segIdx * 2,
		segmentCount: segIdx,
	};
}
