/**
 * L-System State Management
 * Using Svelte 5 runes for reactive state
 */

import type { D0LRule, Grammar, Symbol } from '../grammar/types';
import type { LineSegment } from '../gpu/types';
import type { Preset } from '../presets/examples';
import { deriveN, getGenerationStats, calculateSafeGenerations } from '../derivation/derive';
import { interpretSymbols, normalizeSegments, type TurtleConfig } from '../turtle/cpu-turtle';
import { interpretFast, interpretToVertexBuffer, hexToRgbArray, type FastTurtleConfig, type ColorMode as FastColorMode } from '../turtle/fast-turtle';
import { interpretSymbols3D, normalizeSegments3D, type Segment3D } from '../turtle/turtle-3d';
import { interpretFast3D, interpretToVertexBuffer3D, type FastTurtle3DConfig, type ColorMode3D } from '../turtle/fast-turtle-3d';
import { parseGrammar, isParseError, serializeGrammar } from '../grammar/parser';
import { plant1, allPresets } from '../presets/examples';
import type { GPUDerivationContext } from '../derivation/gpu-derive';
import { initGPUDerivation, uploadRules, deriveGPU, shouldUseGPU, destroyGPUDerivation } from '../derivation/gpu-derive';
import type { GPUTurtleContext } from '../turtle/gpu-turtle';
import { initGPUTurtle, interpretSymbolsGPU, shouldUseGPUTurtle, destroyGPUTurtle } from '../turtle/gpu-turtle';
import type { ColorSpectrum } from '../color/spectrum';
import { defaultSpectrum, presetSpectrums, getPresetSpectrum } from '../color/presets';

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
	lineWidth: number; // Future use: line thickness multiplier when ! symbol is implemented
	showStats: boolean;
	hueOffset: number; // 0-360, shifts the color palette (legacy, used with HSL mode)
	is3D: boolean; // 3D rendering mode
	saturation: number; // 0-1 (legacy, used with HSL mode)
	lightness: number; // 0-1 (legacy, used with HSL mode)
	// Color spectrum system
	spectrum: ColorSpectrum; // Active color spectrum
	spectrumPreset: string; // Name of preset spectrum, or 'custom'
	useSpectrum: boolean; // If true, use spectrum; if false, use legacy HSL
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
	// Color spectrum system
	spectrum: defaultSpectrum,
	spectrumPreset: 'Forest',
	useSpectrum: true, // Use spectrum by default
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
let cachedUseSpectrum = true;
let cachedSpectrumPreset = 'Forest';

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
	const grammar = getCurrentGrammarPure();
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
 * Interpret symbols to segments (cached - only recomputes when needed)
 * Uses optimized fast turtle with fused normalization and coloring
 */
function interpretToSegments(symbols: Symbol[]): LineSegment[] {
	if (symbols.length === 0) return [];
	
	// Check if anything changed that requires re-interpretation
	const needsRecompute = 
		lsystemParams.angle !== cachedAngle || 
		cachedSegments.length === 0 ||
		visualState.colorMode !== cachedColorMode ||
		visualState.hueOffset !== cachedHueOffset ||
		visualState.saturation !== cachedSaturation ||
		visualState.lightness !== cachedLightness ||
		visualState.lineColor !== cachedLineColor ||
		visualState.useSpectrum !== cachedUseSpectrum ||
		visualState.spectrumPreset !== cachedSpectrumPreset;
	
	if (!needsRecompute) {
		return cachedSegments;
	}

	const startTime = performance.now();

	// Use fast turtle with fused normalization + coloring (single pass)
	const config: FastTurtleConfig = {
		angle: lsystemParams.angle,
		colorMode: visualState.colorMode as FastColorMode,
		hueOffset: visualState.hueOffset,
		saturation: visualState.saturation,
		lightness: visualState.lightness,
		uniformColor: hexToRgbArray(visualState.lineColor),
		// Spectrum coloring
		useSpectrum: visualState.useSpectrum,
		spectrum: visualState.spectrum,
	};

	cachedSegments = interpretFast(symbols, config);
	
	// Update all caches
	cachedAngle = lsystemParams.angle;
	cachedColorMode = visualState.colorMode;
	cachedHueOffset = visualState.hueOffset;
	cachedSaturation = visualState.saturation;
	cachedLightness = visualState.lightness;
	cachedLineColor = visualState.lineColor;
	cachedUseSpectrum = visualState.useSpectrum;
	cachedSpectrumPreset = visualState.spectrumPreset;
	
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

/** Cached vertex buffer state */
let cachedVertexData: Float32Array | null = null;
let cachedVertexCount = 0;
let cachedVertexAngle = -1;
let cachedVertexSymbolCount = -1;
let cachedVertexGrammarStr = '';
let cachedVertexIterations = -1;
let cachedVertexColorMode: ColorMode = 'depth';
let cachedVertexHueOffset = 0;
let cachedVertexSaturation = 0.7;
let cachedVertexLightness = 0.5;
let cachedVertexLineColor = '#4ade80';
let cachedVertexUseSpectrum = true;
let cachedVertexSpectrumPreset = 'Forest';

/**
 * Ultra-fast path: compute directly to GPU vertex format
 * Returns null if nothing changed (use cached data)
 */
export function computeVertexBuffer(): { 
	vertexData: Float32Array; 
	vertexCount: number; 
	segmentCount: number;
	changed: boolean;
} | null {
	const symbols = deriveSymbols();
	if (symbols.length === 0) return null;
	
	// Get current grammar string for comparison
	const grammar = getCurrentGrammarPure();
	const grammarStr = grammar ? serializeGrammar(grammar) : '';
	
	// Check if anything changed - including symbols (grammar, iterations)
	const symbolsChanged = 
		symbols.length !== cachedVertexSymbolCount ||
		grammarStr !== cachedVertexGrammarStr ||
		lsystemParams.iterations !== cachedVertexIterations;
	
	const needsRecompute = 
		symbolsChanged ||
		lsystemParams.angle !== cachedVertexAngle || 
		cachedVertexData === null ||
		visualState.colorMode !== cachedVertexColorMode ||
		visualState.hueOffset !== cachedVertexHueOffset ||
		visualState.saturation !== cachedVertexSaturation ||
		visualState.lightness !== cachedVertexLightness ||
		visualState.lineColor !== cachedVertexLineColor ||
		visualState.useSpectrum !== cachedVertexUseSpectrum ||
		visualState.spectrumPreset !== cachedVertexSpectrumPreset;
	
	if (!needsRecompute && cachedVertexData) {
		return {
			vertexData: cachedVertexData,
			vertexCount: cachedVertexCount,
			segmentCount: cachedVertexCount / 2,
			changed: false,
		};
	}

	const startTime = performance.now();

	const config: FastTurtleConfig = {
		angle: lsystemParams.angle,
		colorMode: visualState.colorMode as FastColorMode,
		hueOffset: visualState.hueOffset,
		saturation: visualState.saturation,
		lightness: visualState.lightness,
		uniformColor: hexToRgbArray(visualState.lineColor),
		// Spectrum coloring
		useSpectrum: visualState.useSpectrum,
		spectrum: visualState.spectrum,
	};

	const result = interpretToVertexBuffer(symbols, config);
	
	if (!result) return null;
	
	// Update caches
	cachedVertexData = result.vertexData;
	cachedVertexCount = result.vertexCount;
	cachedVertexSymbolCount = symbols.length;
	cachedVertexGrammarStr = grammarStr;
	cachedVertexIterations = lsystemParams.iterations;
	cachedVertexAngle = lsystemParams.angle;
	cachedVertexColorMode = visualState.colorMode;
	cachedVertexHueOffset = visualState.hueOffset;
	cachedVertexSaturation = visualState.saturation;
	cachedVertexLightness = visualState.lightness;
	cachedVertexLineColor = visualState.lineColor;
	cachedVertexUseSpectrum = visualState.useSpectrum;
	cachedVertexSpectrumPreset = visualState.spectrumPreset;
	
	// Also update standard caches for compatibility
	cachedAngle = lsystemParams.angle;
	cachedColorMode = visualState.colorMode;
	cachedHueOffset = visualState.hueOffset;
	cachedSaturation = visualState.saturation;
	cachedLightness = visualState.lightness;
	cachedLineColor = visualState.lineColor;
	cachedUseSpectrum = visualState.useSpectrum;
	cachedSpectrumPreset = visualState.spectrumPreset;
	
	engineState.segmentCount = result.segmentCount;
	engineState.lastInterpretTime = performance.now() - startTime;
	engineState.gpuTurtleActive = false;

	return {
		...result,
		changed: true,
	};
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
let cached3DUseSpectrum = true;
let cached3DSpectrumPreset = 'Forest';

/**
 * Compute 3D segments from current state
 */
export function computeSegments3D(): Segment3D[] {
	const symbols = deriveSymbols();
	if (symbols.length === 0) return [];
	
	const grammarStr = serializeGrammar(getCurrentGrammarPure()!);
	
	// Check if anything changed
	const needsRecompute = 
		grammarStr !== cached3DGrammarStr ||
		lsystemParams.iterations !== cached3DIterations ||
		lsystemParams.angle !== cached3DAngle ||
		cached3DSegments.length === 0 ||
		visualState.colorMode !== cached3DColorMode ||
		visualState.hueOffset !== cached3DHueOffset ||
		visualState.saturation !== cached3DSaturation ||
		visualState.lightness !== cached3DLightness ||
		visualState.lineColor !== cached3DLineColor ||
		visualState.useSpectrum !== cached3DUseSpectrum ||
		visualState.spectrumPreset !== cached3DSpectrumPreset;
	
	if (!needsRecompute) {
		return cached3DSegments;
	}
	
	const startTime = performance.now();
	
	// Use fast 3D turtle with fused normalization + coloring
	const config: FastTurtle3DConfig = {
		angle: lsystemParams.angle,
		colorMode: visualState.colorMode as ColorMode3D,
		hueOffset: visualState.hueOffset,
		saturation: visualState.saturation,
		lightness: visualState.lightness,
		uniformColor: hexToRgbArray(visualState.lineColor),
		// Spectrum coloring
		useSpectrum: visualState.useSpectrum,
		spectrum: visualState.spectrum,
	};
	
	cached3DSegments = interpretFast3D(symbols, config);
	cached3DGrammarStr = grammarStr;
	cached3DIterations = lsystemParams.iterations;
	cached3DAngle = lsystemParams.angle;
	
	// Update color cache
	cached3DColorMode = visualState.colorMode;
	cached3DHueOffset = visualState.hueOffset;
	cached3DSaturation = visualState.saturation;
	cached3DLightness = visualState.lightness;
	cached3DLineColor = visualState.lineColor;
	cached3DUseSpectrum = visualState.useSpectrum;
	cached3DSpectrumPreset = visualState.spectrumPreset;
	
	engineState.segmentCount = cached3DSegments.length;
	engineState.lastInterpretTime = performance.now() - startTime;
	
	// Return a new array reference so Canvas3D detects the change
	// (colors are modified in place, so we need a new reference to trigger re-upload)
	return [...cached3DSegments];
}

/** Cached 3D vertex buffer state */
let cached3DVertexData: Float32Array | null = null;
let cached3DVertexCount = 0;
let cached3DVertexSymbolCount = -1;
let cached3DVertexGrammarStr = '';
let cached3DVertexIterations = -1;
let cached3DVertexAngle = -1;
let cached3DVertexColorMode: ColorMode = 'depth';
let cached3DVertexHueOffset = 0;
let cached3DVertexSaturation = 0.7;
let cached3DVertexLightness = 0.5;
let cached3DVertexLineColor = '#4ade80';
let cached3DVertexUseSpectrum = true;
let cached3DVertexSpectrumPreset = 'Forest';

/**
 * Ultra-fast 3D path: compute directly to GPU vertex format
 */
export function computeVertexBuffer3D(): { 
	vertexData: Float32Array; 
	vertexCount: number; 
	segmentCount: number;
	changed: boolean;
} | null {
	const symbols = deriveSymbols();
	if (symbols.length === 0) return null;
	
	const grammar = getCurrentGrammarPure();
	const grammarStr = grammar ? serializeGrammar(grammar) : '';
	
	// Check if anything changed
	const symbolsChanged = 
		symbols.length !== cached3DVertexSymbolCount ||
		grammarStr !== cached3DVertexGrammarStr ||
		lsystemParams.iterations !== cached3DVertexIterations;
	
	const needsRecompute = 
		symbolsChanged ||
		lsystemParams.angle !== cached3DVertexAngle || 
		cached3DVertexData === null ||
		visualState.colorMode !== cached3DVertexColorMode ||
		visualState.hueOffset !== cached3DVertexHueOffset ||
		visualState.saturation !== cached3DVertexSaturation ||
		visualState.lightness !== cached3DVertexLightness ||
		visualState.lineColor !== cached3DVertexLineColor ||
		visualState.useSpectrum !== cached3DVertexUseSpectrum ||
		visualState.spectrumPreset !== cached3DVertexSpectrumPreset;
	
	if (!needsRecompute && cached3DVertexData) {
		return {
			vertexData: cached3DVertexData,
			vertexCount: cached3DVertexCount,
			segmentCount: cached3DVertexCount / 2,
			changed: false,
		};
	}

	const startTime = performance.now();

	const config: FastTurtle3DConfig = {
		angle: lsystemParams.angle,
		colorMode: visualState.colorMode as ColorMode3D,
		hueOffset: visualState.hueOffset,
		saturation: visualState.saturation,
		lightness: visualState.lightness,
		uniformColor: hexToRgbArray(visualState.lineColor),
		// Spectrum coloring
		useSpectrum: visualState.useSpectrum,
		spectrum: visualState.spectrum,
	};

	const result = interpretToVertexBuffer3D(symbols, config);
	
	if (!result) return null;
	
	// Update caches
	cached3DVertexData = result.vertexData;
	cached3DVertexCount = result.vertexCount;
	cached3DVertexSymbolCount = symbols.length;
	cached3DVertexGrammarStr = grammarStr;
	cached3DVertexIterations = lsystemParams.iterations;
	cached3DVertexAngle = lsystemParams.angle;
	cached3DVertexColorMode = visualState.colorMode;
	cached3DVertexHueOffset = visualState.hueOffset;
	cached3DVertexSaturation = visualState.saturation;
	cached3DVertexLightness = visualState.lightness;
	cached3DVertexLineColor = visualState.lineColor;
	cached3DVertexUseSpectrum = visualState.useSpectrum;
	cached3DVertexSpectrumPreset = visualState.spectrumPreset;
	
	engineState.segmentCount = result.segmentCount;
	engineState.lastInterpretTime = performance.now() - startTime;

	return {
		...result,
		changed: true,
	};
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
		const successor = r.successor.map((s) => s.id).join('');
		// Include probability if it's a stochastic rule
		const prob = r.probability !== undefined && r.probability !== 1 ? ` (${r.probability})` : '';
		ruleLines.push(`${r.predecessor} -> ${successor}${prob}`);
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
			// Include probability if it's a stochastic rule
			const prob = r.probability !== undefined && r.probability !== 1 ? ` (${r.probability})` : '';
			ruleLines.push(`${r.predecessor}${params}${condition} -> ${successor}${prob}`);
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
	lsystemParams.iterations = Math.max(0, Math.min(n, safeMax + 5)); // Allow overrun with warning
}

/**
 * Get all available presets
 */
export function getPresets(): Preset[] {
	return allPresets;
}

// ============ Color Spectrum Management ============

/**
 * Set spectrum by preset name
 */
export function setSpectrumPreset(presetName: string): void {
	const spectrum = getPresetSpectrum(presetName);
	if (spectrum) {
		visualState.spectrum = spectrum;
		visualState.spectrumPreset = presetName;
	}
}

/**
 * Set a custom spectrum
 */
export function setCustomSpectrum(spectrum: ColorSpectrum): void {
	visualState.spectrum = spectrum;
	visualState.spectrumPreset = 'custom';
}

/**
 * Toggle between spectrum and legacy HSL coloring
 */
export function setUseSpectrum(useSpectrum: boolean): void {
	visualState.useSpectrum = useSpectrum;
}

/**
 * Get all available spectrum presets
 */
export function getSpectrumPresets(): ColorSpectrum[] {
	return presetSpectrums;
}

// Re-export color types for use in components
export type { ColorSpectrum } from '../color/spectrum';
export { presetSpectrums } from '../color/presets';

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
