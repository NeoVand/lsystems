/**
 * CPU Turtle Interpreter
 * Reference implementation and fallback for small systems
 */

import type { LineSegment, TurtleTransform } from '../gpu/types';
import type { Symbol } from '../grammar/types';

/** Turtle configuration */
export interface TurtleConfig {
	angle: number; // Default turn angle in degrees
	stepSize: number; // Default step length
	initialPosition?: [number, number, number];
	initialAngle?: number; // Initial heading in degrees
}

/** Turtle state */
interface TurtleState {
	x: number;
	y: number;
	z: number;
	angle: number; // Current heading in radians
	depth: number; // Branch depth
	branchId: number; // Current branch ID
}

/** Default configuration */
const DEFAULT_CONFIG: TurtleConfig = {
	angle: 25,
	stepSize: 10,
	initialPosition: [0, 0, 0],
	initialAngle: 90, // Start pointing up
};

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * Interpret L-system symbols and produce line segments
 *
 * Supported commands:
 * - F, G: Move forward and draw line
 * - f, g: Move forward without drawing
 * - +: Turn left by angle
 * - -: Turn right by angle
 * - [: Push state (start branch)
 * - ]: Pop state (end branch)
 * - |: Turn around (180°)
 */
export function interpretSymbols(
	symbols: Symbol[],
	config: Partial<TurtleConfig> = {}
): LineSegment[] {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	
	// Pre-count draw commands to pre-allocate array
	let drawCount = 0;
	for (let i = 0; i < symbols.length; i++) {
		const c = symbols[i].id;
		if (c === 'F' || c === 'G') drawCount++;
	}
	
	const segments: LineSegment[] = new Array(drawCount);
	let segIdx = 0;
	
	// Pre-allocate stack (typical max depth is < 100)
	const stack: TurtleState[] = new Array(256);
	let stackTop = 0;

	// Initial state
	let x = cfg.initialPosition?.[0] ?? 0;
	let y = cfg.initialPosition?.[1] ?? 0;
	const z = cfg.initialPosition?.[2] ?? 0;
	let angle = toRadians(cfg.initialAngle ?? 90);
	let depth = 0;
	let branchId = 0;

	const angleRad = toRadians(cfg.angle);
	const step = cfg.stepSize;
	let nextBranchId = 1;

	for (let i = 0; i < symbols.length; i++) {
		const cmd = symbols[i].id;

		switch (cmd) {
			case 'F':
			case 'G': {
				// Move forward and draw
				const cosA = Math.cos(angle);
				const sinA = Math.sin(angle);
				const newX = x + cosA * step;
				const newY = y + sinA * step;

				segments[segIdx++] = {
					start: [x, y, z],
					end: [newX, newY, z],
					depth: depth,
					branchId: branchId,
					color: depthToColor(depth),
				};

				x = newX;
				y = newY;
				break;
			}

			case 'f':
			case 'g': {
				// Move forward without drawing
				x += Math.cos(angle) * step;
				y += Math.sin(angle) * step;
				break;
			}

			case '+': {
				// Turn left (counter-clockwise)
				angle += angleRad;
				break;
			}

			case '-': {
				// Turn right (clockwise)
				angle -= angleRad;
				break;
			}

			case '[': {
				// Push state
				stack[stackTop++] = { x, y, z, angle, depth, branchId };
				depth++;
				branchId = nextBranchId++;
				break;
			}

			case ']': {
				// Pop state
				if (stackTop > 0) {
					const restored = stack[--stackTop];
					x = restored.x;
					y = restored.y;
					angle = restored.angle;
					depth = restored.depth;
					branchId = restored.branchId;
				}
				break;
			}

			case '|': {
				// Turn around
				angle += Math.PI;
				break;
			}
		}
	}

	return segments;
}

/**
 * Generate color based on branch depth
 * Uses HSL color space for nice gradients
 */
function depthToColor(depth: number): [number, number, number, number] {
	// Hue cycles through spectrum based on depth
	const hue = (depth * 60) % 360;
	const saturation = 0.7;
	const lightness = 0.5;

	// Convert HSL to RGB
	const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = lightness - c / 2;

	let r: number, g: number, b: number;

	if (hue < 60) {
		[r, g, b] = [c, x, 0];
	} else if (hue < 120) {
		[r, g, b] = [x, c, 0];
	} else if (hue < 180) {
		[r, g, b] = [0, c, x];
	} else if (hue < 240) {
		[r, g, b] = [0, x, c];
	} else if (hue < 300) {
		[r, g, b] = [x, 0, c];
	} else {
		[r, g, b] = [c, 0, x];
	}

	return [r + m, g + m, b + m, 1.0];
}

/**
 * Calculate bounding box of line segments
 */
export function calculateBounds(segments: LineSegment[]): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
} {
	if (segments.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const seg of segments) {
		minX = Math.min(minX, seg.start[0], seg.end[0]);
		minY = Math.min(minY, seg.start[1], seg.end[1]);
		maxX = Math.max(maxX, seg.start[0], seg.end[0]);
		maxY = Math.max(maxY, seg.start[1], seg.end[1]);
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

/**
 * Center segments around origin and scale to fit
 * Mutates in place for performance
 */
export function normalizeSegments(
	segments: LineSegment[],
	targetSize: number = 2
): LineSegment[] {
	const bounds = calculateBounds(segments);

	if (bounds.width === 0 && bounds.height === 0) {
		return segments;
	}

	const scale = targetSize / Math.max(bounds.width, bounds.height);
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerY = (bounds.minY + bounds.maxY) / 2;

	// Mutate in place for performance (avoid allocations)
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		seg.start[0] = (seg.start[0] - centerX) * scale;
		seg.start[1] = (seg.start[1] - centerY) * scale;
		seg.end[0] = (seg.end[0] - centerX) * scale;
		seg.end[1] = (seg.end[1] - centerY) * scale;
	}

	return segments;
}
