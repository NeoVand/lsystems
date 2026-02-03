/**
 * 3D Turtle Interpreter
 * Full 3D support with pitch, roll, and yaw rotations
 */

import type { Symbol } from '../grammar/types';

/** 3D Line segment for rendering */
export interface Segment3D {
	start: [number, number, number];
	end: [number, number, number];
	depth: number;
	branchId: number;
	color: [number, number, number, number];
}

/** 3D Turtle configuration */
export interface Turtle3DConfig {
	angle: number; // Default turn angle in degrees
	stepSize: number; // Default step length
}

/** 3D Vector */
type Vec3 = [number, number, number];

/** 3x3 Rotation matrix (column-major) */
type Mat3 = [number, number, number, number, number, number, number, number, number];

// ============ Vector Operations ============

function vec3Add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
	return [v[0] * s, v[1] * s, v[2] * s];
}

function mat3MulVec(m: Mat3, v: Vec3): Vec3 {
	return [
		m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
		m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
		m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
	];
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

function mat3Identity(): Mat3 {
	return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function mat3Clone(m: Mat3): Mat3 {
	return [...m] as Mat3;
}

// Rotation around local U axis (yaw - turn left/right)
function rotateU(angle: number): Mat3 {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return [c, s, 0, -s, c, 0, 0, 0, 1];
}

// Rotation around local L axis (pitch - tilt up/down)
function rotateL(angle: number): Mat3 {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return [c, 0, -s, 0, 1, 0, s, 0, c];
}

// Rotation around local H axis (roll - barrel roll)
function rotateH(angle: number): Mat3 {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return [1, 0, 0, 0, c, -s, 0, s, c];
}

/** 3D Turtle state */
interface TurtleState3D {
	pos: Vec3;
	rot: Mat3; // Orientation matrix
	depth: number;
	branchId: number;
}

/**
 * Interpret L-system symbols in 3D
 *
 * Supported commands:
 * - F, G: Move forward and draw line
 * - f, g: Move forward without drawing
 * - +: Turn left (yaw) by angle
 * - -: Turn right (yaw) by angle
 * - &: Pitch down
 * - ^: Pitch up
 * - \: Roll left
 * - /: Roll right
 * - |: Turn around (180° yaw)
 * - [: Push state (start branch)
 * - ]: Pop state (end branch)
 */
export function interpretSymbols3D(
	symbols: Symbol[],
	config: Turtle3DConfig
): Segment3D[] {
	// Pre-count draw commands
	let drawCount = 0;
	for (let i = 0; i < symbols.length; i++) {
		const c = symbols[i].id;
		if (c === 'F' || c === 'G') drawCount++;
	}

	const segments: Segment3D[] = new Array(drawCount);
	let segIdx = 0;

	// Pre-allocate stack
	const stack: TurtleState3D[] = new Array(256);
	let stackTop = 0;

	// Initial state - position at origin, heading UPWARD (+Z)
	// Rotation matrix columns: [Heading, Left, Up]
	// H = [0, 0, 1] (forward is +Z, upward)
	// L = [0, 1, 0] (left is +Y)
	// U = [-1, 0, 0] (turtle's local up is -X)
	let pos: Vec3 = [0, 0, 0];
	let rot: Mat3 = [
		0, 0, 1,   // Column 0: Heading (+Z)
		0, 1, 0,   // Column 1: Left (+Y)
		-1, 0, 0,  // Column 2: Up (-X)
	];
	let depth = 0;
	let branchId = 0;
	let nextBranchId = 1;

	const angleRad = (config.angle * Math.PI) / 180;
	const step = config.stepSize;

	// Heading vector is the first column of rotation matrix
	const getHeading = (): Vec3 => [rot[0], rot[1], rot[2]];

	for (let i = 0; i < symbols.length; i++) {
		const sym = symbols[i];
		const cmd = sym.id;
		const symStep = (sym.params && sym.params.length > 0) ? sym.params[0] : step;
		const symAngle = (sym.params && sym.params.length > 0) 
			? (sym.params[0] * Math.PI) / 180 
			: angleRad;

		switch (cmd) {
			case 'F':
			case 'G': {
				const heading = getHeading();
				const newPos = vec3Add(pos, vec3Scale(heading, symStep));
				
				segments[segIdx++] = {
					start: [...pos] as Vec3,
					end: [...newPos] as Vec3,
					depth,
					branchId,
					color: depthToColor(depth),
				};
				
				pos = newPos;
				break;
			}

			case 'f':
			case 'g': {
				const heading = getHeading();
				pos = vec3Add(pos, vec3Scale(heading, symStep));
				break;
			}

			case '+': // Yaw left (turn left)
				rot = mat3Mul(rot, rotateU(symAngle));
				break;

			case '-': // Yaw right (turn right)
				rot = mat3Mul(rot, rotateU(-symAngle));
				break;

			case '&': // Pitch down
				rot = mat3Mul(rot, rotateL(symAngle));
				break;

			case '^': // Pitch up
				rot = mat3Mul(rot, rotateL(-symAngle));
				break;

			case '\\': // Roll left
				rot = mat3Mul(rot, rotateH(symAngle));
				break;

			case '/': // Roll right
				rot = mat3Mul(rot, rotateH(-symAngle));
				break;

			case '|': // Turn around (180°)
				rot = mat3Mul(rot, rotateU(Math.PI));
				break;

			case '[': // Push state
				stack[stackTop++] = {
					pos: [...pos] as Vec3,
					rot: mat3Clone(rot),
					depth,
					branchId,
				};
				depth++;
				branchId = nextBranchId++;
				break;

			case ']': // Pop state
				if (stackTop > 0) {
					const state = stack[--stackTop];
					pos = state.pos;
					rot = state.rot;
					depth = state.depth;
					branchId = state.branchId;
				}
				break;
		}
	}

	return segments;
}

/**
 * Generate color based on branch depth
 */
function depthToColor(depth: number): [number, number, number, number] {
	const hue = (depth * 60) % 360;
	const saturation = 0.7;
	const lightness = 0.5;

	const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = lightness - c / 2;

	let r: number, g: number, b: number;
	if (hue < 60) [r, g, b] = [c, x, 0];
	else if (hue < 120) [r, g, b] = [x, c, 0];
	else if (hue < 180) [r, g, b] = [0, c, x];
	else if (hue < 240) [r, g, b] = [0, x, c];
	else if (hue < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];

	return [r + m, g + m, b + m, 1.0];
}

/**
 * Calculate 3D bounding box
 */
export function calculateBounds3D(segments: Segment3D[]): {
	min: Vec3;
	max: Vec3;
	center: Vec3;
	size: number;
} {
	if (segments.length === 0) {
		return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: 0 };
	}

	const min: Vec3 = [Infinity, Infinity, Infinity];
	const max: Vec3 = [-Infinity, -Infinity, -Infinity];

	for (const seg of segments) {
		for (let i = 0; i < 3; i++) {
			min[i] = Math.min(min[i], seg.start[i], seg.end[i]);
			max[i] = Math.max(max[i], seg.start[i], seg.end[i]);
		}
	}

	const center: Vec3 = [
		(min[0] + max[0]) / 2,
		(min[1] + max[1]) / 2,
		(min[2] + max[2]) / 2,
	];

	const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);

	return { min, max, center, size };
}

/**
 * Normalize 3D segments to fit in unit cube centered at origin
 */
export function normalizeSegments3D(
	segments: Segment3D[],
	targetSize: number = 2
): Segment3D[] {
	const bounds = calculateBounds3D(segments);
	if (bounds.size === 0) return segments;

	const scale = targetSize / bounds.size;
	const cx = bounds.center[0];
	const cy = bounds.center[1];
	const cz = bounds.center[2];

	for (const seg of segments) {
		seg.start[0] = (seg.start[0] - cx) * scale;
		seg.start[1] = (seg.start[1] - cy) * scale;
		seg.start[2] = (seg.start[2] - cz) * scale;
		seg.end[0] = (seg.end[0] - cx) * scale;
		seg.end[1] = (seg.end[1] - cy) * scale;
		seg.end[2] = (seg.end[2] - cz) * scale;
	}

	return segments;
}
