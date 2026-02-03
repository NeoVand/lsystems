/**
 * L-System State Management
 * Using Svelte 5 runes for reactive state
 */

import type { D0LRule, Grammar, Symbol } from '../grammar/types';
import type { LineSegment } from '../gpu/types';
import type { Preset } from '../presets/examples';
import { deriveN, getGenerationStats, calculateSafeGenerations } from '../derivation/derive';
import { interpretSymbols, normalizeSegments, type TurtleConfig } from '../turtle/cpu-turtle';
import { interpretSymbols3D, normalizeSegments3D, type Segment3D } from '../turtle/turtle-3d';
import { parseGrammar, isParseError, serializeGrammar } from '../grammar/parser';
import { plant1, allPresets } from '../presets/examples';
import type { GPUDerivationContext } from '../derivation/gpu-derive';
import { initGPUDerivation, uploadRules, deriveGPU, shouldUseGPU, destroyGPUDerivation } from '../derivation/gpu-derive';
import type { GPUTurtleContext } from '../turtle/gpu-turtle';
import { initGPUTurtle, interpretSymbolsGPU, shouldUseGPUTurtle, destroyGPUTurtle } from '../turtle/gpu-turtle';

/** L-system parameters */
export interface LSystemParams {
	axiom: string;
	rules: string; // Raw text format for editor
	iterations: number;
	angle: number;
}

/** Engine state */
export interface EngineState {
	symbolCount: number;
	segmentCount: number;
	currentGeneration: number;
	isComputing: boolean;
	parseError: string | null;
	gpuAvailable: boolean;
	gpuDerivationActive: boolean;
	gpuTurtleActive: boolean;
	lastDerivationTime: number;
	lastInterpretTime: number;
}

/** Color mode options */
export type ColorMode = 'depth' | 'branch' | 'position' | 'age' | 'uniform';

/** Visualization settings */
export interface VisualState {
	colorMode: ColorMode;
	backgroundColor: string;
	lineColor: string; // Used for uniform mode
	lineWidth: number;
	showStats: boolean;
	hueOffset: number; // 0-360, shifts the color palette
	is3D: boolean; // 3D rendering mode
	saturation: number; // 0-1
	lightness: number; // 0-1
}

// ============ State Stores ============

/** Main L-system parameters */
export const lsystemParams = $state<LSystemParams>({
	axiom: 'X',
	rules: 'X -> F+[[X]-X]-F[-FX]+X\nF -> FF',
	iterations: 5,
	angle: 25,
});

/** Engine state */
export const engineState = $state<EngineState>({
	symbolCount: 0,
	segmentCount: 0,
	currentGeneration: 0,
	isComputing: false,
	parseError: null,
	gpuAvailable: false,
	gpuDerivationActive: false,
	gpuTurtleActive: false,
	lastDerivationTime: 0,
	lastInterpretTime: 0,
});

/** Visual settings */
export const visualState = $state<VisualState>({
	colorMode: 'depth',
	backgroundColor: '#0a0a0f',
	lineColor: '#4ade80',
	lineWidth: 1.0, // Line width multiplier (1.0 = default)
	showStats: true,
	hueOffset: 0,
	saturation: 0.7,
	lightness: 0.5,
	is3D: false,
});

/** Current preset name */
export const currentPreset = $state<{ name: string }>({ name: 'Plant 1' });

/** Cached derivation (symbols) - only recompute when grammar/iterations change */
let cachedSymbols: Symbol[] = [];
let cachedGrammarStr: string = '';
let cachedIterations = -1;

/** Cached interpretation (segments) - recompute when angle changes */
let cachedSegments: LineSegment[] = [];
let cachedAngle = -1;
let cachedColorMode: ColorMode = 'depth';
let cachedHueOffset = 0;
let cachedSaturation = 0.7;
let cachedLightness = 0.5;
let cachedLineColor = '#4ade80';

/** GPU derivation context */
let gpuDerivationCtx: GPUDerivationContext | null = null;
let gpuRulesUploaded = false;
let gpuRulesHash = '';

/** GPU turtle context */
let gpuTurtleCtx: GPUTurtleContext | null = null;

// ============ Derived State ============

/**
 * Parse grammar from current params (pure function, no state mutation)
 */
function parseCurrentGrammar(): { grammar: Grammar | null; error: string | null } {
	const fullText = `axiom: ${lsystemParams.axiom}\n${lsystemParams.rules}`;
	const result = parseGrammar(fullText);

	if (isParseError(result)) {
		return { grammar: null, error: `Line ${result.line}: ${result.message}` };
	}

	return { grammar: result, error: null };
}

/**
 * Get current grammar (for use in actions, updates error state)
 */
export function getCurrentGrammar(): Grammar | null {
	const { grammar, error } = parseCurrentGrammar();
	engineState.parseError = error;
	return grammar;
}

/**
 * Get current grammar without side effects (for use in derived/templates)
 */
export function getCurrentGrammarPure(): Grammar | null {
	return parseCurrentGrammar().grammar;
}

/**
 * Derive symbols (cached - only recomputes when grammar/iterations change)
 * Uses CPU derivation (GPU derivation available via computeSegmentsAsync)
 */
function deriveSymbols(): Symbol[] {
	const grammar = getCurrentGrammar();
	if (!grammar) return [];

	const grammarStr = serializeGrammar(grammar);
	
	// Check if we can use cached symbols
	if (grammarStr === cachedGrammarStr && lsystemParams.iterations === cachedIterations) {
		return cachedSymbols;
	}

	// Need to re-derive
	engineState.isComputing = true;
	const startTime = performance.now();
	
	// CPU derivation (fast for most cases)
	const symbols = deriveN(grammar, lsystemParams.iterations);
	engineState.gpuDerivationActive = false;
	
	engineState.symbolCount = symbols.length;
	engineState.currentGeneration = lsystemParams.iterations;
	engineState.lastDerivationTime = performance.now() - startTime;
	
	// Update cache
	cachedSymbols = symbols;
	cachedGrammarStr = grammarStr;
	cachedIterations = lsystemParams.iterations;
	engineState.isComputing = false;
	
	// Invalidate segment cache since symbols changed
	cachedAngle = -1;
	
	return symbols;
}

/**
 * HSL to RGB conversion
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r: number, g: number, b: number;

	if (h < 60) {
		[r, g, b] = [c, x, 0];
	} else if (h < 120) {
		[r, g, b] = [x, c, 0];
	} else if (h < 180) {
		[r, g, b] = [0, c, x];
	} else if (h < 240) {
		[r, g, b] = [0, x, c];
	} else if (h < 300) {
		[r, g, b] = [x, 0, c];
	} else {
		[r, g, b] = [c, 0, x];
	}

	return [r + m, g + m, b + m];
}

/**
 * Hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return [0.5, 0.5, 0.5];
	return [
		parseInt(result[1], 16) / 255,
		parseInt(result[2], 16) / 255,
		parseInt(result[3], 16) / 255,
	];
}

/**
 * Apply color to segments based on visual settings
 */
function applyColors(segments: LineSegment[]): void {
	if (segments.length === 0) return;

	const { colorMode, hueOffset, saturation, lightness, lineColor } = visualState;
	
	// Find max values for normalization
	let maxDepth = 0;
	let maxBranchId = 0;
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;
	
	for (const seg of segments) {
		maxDepth = Math.max(maxDepth, seg.depth);
		maxBranchId = Math.max(maxBranchId, seg.branchId);
		minX = Math.min(minX, seg.start[0], seg.end[0]);
		maxX = Math.max(maxX, seg.start[0], seg.end[0]);
		minY = Math.min(minY, seg.start[1], seg.end[1]);
		maxY = Math.max(maxY, seg.start[1], seg.end[1]);
	}
	
	const rangeX = maxX - minX || 1;
	const rangeY = maxY - minY || 1;

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		let hue: number;

		switch (colorMode) {
			case 'depth':
				// Color by branch depth
				hue = (seg.depth * 60 + hueOffset) % 360;
				break;
			
			case 'branch':
				// Unique color per branch
				hue = ((seg.branchId * 137.5) + hueOffset) % 360; // Golden angle for spread
				break;
			
			case 'position':
				// Color by position (radial gradient from center)
				const cx = (seg.start[0] + seg.end[0]) / 2;
				const cy = (seg.start[1] + seg.end[1]) / 2;
				const nx = (cx - minX) / rangeX;
				const ny = (cy - minY) / rangeY;
				hue = (Math.atan2(ny - 0.5, nx - 0.5) * 180 / Math.PI + 180 + hueOffset) % 360;
				break;
			
			case 'age':
				// Color by drawing order
				hue = ((i / segments.length) * 360 + hueOffset) % 360;
				break;
			
			case 'uniform':
				// Single color from lineColor setting
				const rgb = hexToRgb(lineColor);
				seg.color = [rgb[0], rgb[1], rgb[2], 1.0];
				continue;
			
			default:
				hue = hueOffset;
		}

		const rgb = hslToRgb(hue, saturation, lightness);
		seg.color = [rgb[0], rgb[1], rgb[2], 1.0];
	}
}

/**
 * Interpret symbols to segments (cached - only recomputes when angle changes)
 */
function interpretToSegments(symbols: Symbol[]): LineSegment[] {
	if (symbols.length === 0) return [];
	
	const needsReinterpret = lsystemParams.angle !== cachedAngle || cachedSegments.length === 0;
	const needsRecolor = needsReinterpret ||
		visualState.colorMode !== cachedColorMode ||
		visualState.hueOffset !== cachedHueOffset ||
		visualState.saturation !== cachedSaturation ||
		visualState.lightness !== cachedLightness ||
		visualState.lineColor !== cachedLineColor;
	
	if (!needsReinterpret && !needsRecolor) {
		return cachedSegments;
	}

	const startTime = performance.now();

	if (needsReinterpret) {
		// Need to re-interpret
		const config: TurtleConfig = {
			angle: lsystemParams.angle,
			stepSize: 10, // Fixed step size - gets normalized anyway
		};

		const segments = interpretSymbols(symbols, config);
		cachedSegments = normalizeSegments(segments, 1.8);
		cachedAngle = lsystemParams.angle;
	}
	
	// Apply colors
	applyColors(cachedSegments);
	
	// Update color cache
	cachedColorMode = visualState.colorMode;
	cachedHueOffset = visualState.hueOffset;
	cachedSaturation = visualState.saturation;
	cachedLightness = visualState.lightness;
	cachedLineColor = visualState.lineColor;
	
	engineState.segmentCount = cachedSegments.length;
	engineState.lastInterpretTime = performance.now() - startTime;
	engineState.gpuTurtleActive = false;

	return cachedSegments;
}

/**
 * Compute line segments from current state (fast path for angle/step changes)
 */
export function computeSegments(): LineSegment[] {
	const symbols = deriveSymbols();
	return interpretToSegments(symbols);
}

// ============ 3D Support ============

let cached3DSegments: Segment3D[] = [];
let cached3DAngle = -1;
let cached3DGrammarStr = '';
let cached3DIterations = -1;
let cached3DColorMode: ColorMode = 'depth';
let cached3DHueOffset = 0;
let cached3DSaturation = 0.7;
let cached3DLightness = 0.5;
let cached3DLineColor = '#4ade80';

/**
 * Apply colors to 3D segments based on visual settings
 */
function applyColors3D(segments: Segment3D[]): void {
	if (segments.length === 0) return;

	const { colorMode, hueOffset, saturation, lightness, lineColor } = visualState;
	
	// Find max values for normalization
	let maxDepth = 0;
	let maxBranchId = 0;
	let minX = Infinity, maxX = -Infinity;
	let minY = Infinity, maxY = -Infinity;
	let minZ = Infinity, maxZ = -Infinity;
	
	for (const seg of segments) {
		maxDepth = Math.max(maxDepth, seg.depth);
		maxBranchId = Math.max(maxBranchId, seg.branchId);
		minX = Math.min(minX, seg.start[0], seg.end[0]);
		maxX = Math.max(maxX, seg.start[0], seg.end[0]);
		minY = Math.min(minY, seg.start[1], seg.end[1]);
		maxY = Math.max(maxY, seg.start[1], seg.end[1]);
		minZ = Math.min(minZ, seg.start[2], seg.end[2]);
		maxZ = Math.max(maxZ, seg.start[2], seg.end[2]);
	}
	
	const rangeX = maxX - minX || 1;
	const rangeY = maxY - minY || 1;
	const rangeZ = maxZ - minZ || 1;
	const maxRange = Math.max(rangeX, rangeY, rangeZ);

	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		let hue: number;

		switch (colorMode) {
			case 'depth':
				hue = (seg.depth * 60 + hueOffset) % 360;
				break;
			
			case 'branch':
				hue = ((seg.branchId * 137.5) + hueOffset) % 360;
				break;
			
			case 'position':
				// 3D position-based color using distance from center
				const cx = (seg.start[0] + seg.end[0]) / 2;
				const cy = (seg.start[1] + seg.end[1]) / 2;
				const cz = (seg.start[2] + seg.end[2]) / 2;
				const dist = Math.sqrt(cx*cx + cy*cy + cz*cz);
				hue = ((dist / (maxRange * 0.5)) * 180 + hueOffset) % 360;
				break;
			
			case 'age':
				hue = ((i / segments.length) * 360 + hueOffset) % 360;
				break;
			
			case 'uniform':
				const rgb = hexToRgb(lineColor);
				seg.color = [rgb[0], rgb[1], rgb[2], 1.0];
				continue;
			
			default:
				hue = hueOffset;
		}

		const rgb = hslToRgb(hue, saturation, lightness);
		seg.color = [rgb[0], rgb[1], rgb[2], 1.0];
	}
}

/**
 * Compute 3D segments from current state
 */
export function computeSegments3D(): Segment3D[] {
	const symbols = deriveSymbols();
	if (symbols.length === 0) return [];
	
	const grammarStr = serializeGrammar(getCurrentGrammarPure()!);
	
	// Check if we need to reinterpret (grammar, iterations, or angle changed)
	const needsReinterpret = 
		grammarStr !== cached3DGrammarStr ||
		lsystemParams.iterations !== cached3DIterations ||
		lsystemParams.angle !== cached3DAngle ||
		cached3DSegments.length === 0;
	
	// Check if we need to recolor
	const needsRecolor = needsReinterpret ||
		visualState.colorMode !== cached3DColorMode ||
		visualState.hueOffset !== cached3DHueOffset ||
		visualState.saturation !== cached3DSaturation ||
		visualState.lightness !== cached3DLightness ||
		visualState.lineColor !== cached3DLineColor;
	
	if (!needsReinterpret && !needsRecolor) {
		return cached3DSegments;
	}
	
	const startTime = performance.now();
	
	if (needsReinterpret) {
		const segments = interpretSymbols3D(symbols, {
			angle: lsystemParams.angle,
			stepSize: 10,
		});
		
		cached3DSegments = normalizeSegments3D(segments, 1.8);
		cached3DGrammarStr = grammarStr;
		cached3DIterations = lsystemParams.iterations;
		cached3DAngle = lsystemParams.angle;
	}
	
	// Apply colors based on visual settings
	applyColors3D(cached3DSegments);
	
	// Update color cache
	cached3DColorMode = visualState.colorMode;
	cached3DHueOffset = visualState.hueOffset;
	cached3DSaturation = visualState.saturation;
	cached3DLightness = visualState.lightness;
	cached3DLineColor = visualState.lineColor;
	
	engineState.segmentCount = cached3DSegments.length;
	engineState.lastInterpretTime = performance.now() - startTime;
	
	// Return a new array reference so Canvas3D detects the change
	// (colors are modified in place, so we need a new reference to trigger re-upload)
	return [...cached3DSegments];
}

/**
 * Check if current state is 3D
 */
export function is3DMode(): boolean {
	return visualState.is3D;
}

/**
 * Get generation statistics (pure, no side effects)
 */
export function getStats(): { generation: number; symbols: number }[] {
	const grammar = getCurrentGrammarPure();
	if (!grammar) return [];

	const counts = getGenerationStats(grammar, lsystemParams.iterations);
	return counts.map((count, i) => ({ generation: i, symbols: count }));
}

/**
 * Get safe max iterations for current grammar (pure, no side effects)
 */
export function getSafeMaxIterations(): number {
	const grammar = getCurrentGrammarPure();
	if (!grammar) return 10;

	return calculateSafeGenerations(grammar);
}

// ============ Actions ============

/**
 * Load a preset
 */
export function loadPreset(preset: Preset): void {
	currentPreset.name = preset.name;
	
	// Handle axiom - include params if present
	lsystemParams.axiom = preset.grammar.axiom.map((s) => {
		if (s.params && s.params.length > 0) {
			return `${s.id}(${s.params.join(',')})`;
		}
		return s.id;
	}).join('');
	
	// Build rules string
	const ruleLines: string[] = [];
	
	// D0L rules
	for (const r of preset.grammar.rules) {
		ruleLines.push(`${r.predecessor} -> ${r.successor.map((s) => s.id).join('')}`);
	}
	
	// Parametric rules
	if (preset.grammar.parametricRules) {
		for (const r of preset.grammar.parametricRules) {
			const params = r.params.length > 0 ? `(${r.params.join(',')})` : '';
			const condition = r.condition ? ` : ${stringifyExprForPreset(r.condition)}` : '';
			const successor = r.successor.map((s) => {
				if (s.params.length > 0) {
					return `${s.symbol}(${s.params.map(stringifyExprForPreset).join(',')})`;
				}
				return s.symbol;
			}).join('');
			ruleLines.push(`${r.predecessor}${params}${condition} -> ${successor}`);
		}
	}
	
	lsystemParams.rules = ruleLines.join('\n');
	lsystemParams.iterations = preset.iterations;
	lsystemParams.angle = preset.angle;
	
	// Set 3D mode based on preset
	visualState.is3D = preset.is3D ?? false;

	// Clear cache to force recompute
	cachedGrammarStr = '';
	cachedIterations = -1;
	cachedAngle = -1;
	cachedSegments = [];
	cached3DSegments = [];
	cached3DAngle = -1;
}

/**
 * Stringify expression for preset display
 */
function stringifyExprForPreset(expr: import('../grammar/expression').Expression): string {
	switch (expr.type) {
		case 'number': return String(expr.value);
		case 'variable': return expr.name;
		case 'binary': return `${stringifyExprForPreset(expr.left)}${expr.op}${stringifyExprForPreset(expr.right)}`;
		case 'unary': return `${expr.op}${stringifyExprForPreset(expr.operand)}`;
		case 'call': return `${expr.name}(${expr.args.map(stringifyExprForPreset).join(',')})`;
		default: return '0';
	}
}

/**
 * Reset to default state
 */
export function reset(): void {
	loadPreset(plant1);
}

/**
 * Regenerate - clears cache to force new random values for stochastic L-systems
 */
export function regenerate(): void {
	cachedGrammarStr = '';
	cachedIterations = -1;
	cachedSegments = [];
	cachedAngle = -1;
	cached3DSegments = [];
	cached3DAngle = -1;
}

/**
 * Update iterations with safety check
 */
export function setIterations(n: number): void {
	const safeMax = getSafeMaxIterations();
	lsystemParams.iterations = Math.max(0, Math.min(n, safeMax + 2)); // Allow slight overrun with warning
}

/**
 * Get all available presets
 */
export function getPresets(): Preset[] {
	return allPresets;
}

// ============ GPU Integration ============

/**
 * Initialize GPU derivation and turtle (call from Canvas when device is ready)
 */
export async function initGPUDerivationStore(device: GPUDevice): Promise<void> {
	try {
		gpuDerivationCtx = await initGPUDerivation(device);
		gpuTurtleCtx = await initGPUTurtle(device);
		engineState.gpuAvailable = true;
	} catch (e) {
		console.error('Failed to initialize GPU:', e);
		engineState.gpuAvailable = false;
	}
}

/**
 * Clean up GPU resources
 */
export function destroyGPUDerivationStore(): void {
	if (gpuDerivationCtx) {
		destroyGPUDerivation(gpuDerivationCtx);
		gpuDerivationCtx = null;
	}
	if (gpuTurtleCtx) {
		destroyGPUTurtle(gpuTurtleCtx);
		gpuTurtleCtx = null;
	}
	engineState.gpuAvailable = false;
}

/**
 * Async GPU computation (derivation + turtle)
 * Returns null if GPU not available or input too small
 */
export async function computeSegmentsAsync(): Promise<LineSegment[] | null> {
	const grammar = getCurrentGrammar();
	if (!grammar) return null;
	
	// First derive symbols (CPU for now, GPU derivation TBD)
	const symbols = deriveSymbols();
	if (symbols.length === 0) return null;
	
	// Check if GPU turtle is worth using
	if (!gpuTurtleCtx || !gpuTurtleCtx.isReady) {
		return null;
	}
	
	if (!shouldUseGPUTurtle(symbols.length)) {
		return null;
	}
	
	// Check cache
	if (lsystemParams.angle === cachedAngle && cachedSegments.length > 0) {
		return cachedSegments;
	}
	
	const startTime = performance.now();
	
	try {
		// Run GPU turtle interpretation
		const segments = await interpretSymbolsGPU(
			gpuTurtleCtx,
			symbols,
			lsystemParams.angle,
			10 // step size
		);
		
		if (segments.length === 0) {
			return null;
		}
		
		// Normalize segments
		const normalized = normalizeSegments(segments, 1.8);
		
		engineState.gpuTurtleActive = true;
		engineState.segmentCount = normalized.length;
		engineState.lastInterpretTime = performance.now() - startTime;
		
		// Update cache
		cachedAngle = lsystemParams.angle;
		cachedSegments = normalized;
		
		return normalized;
	} catch (e) {
		console.error('GPU turtle failed:', e);
		return null;
	}
}
