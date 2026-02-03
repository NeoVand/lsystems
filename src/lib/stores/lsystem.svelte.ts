/**
 * L-System State Management
 * Using Svelte 5 runes for reactive state
 */

import type { D0LRule, Grammar, Symbol } from '../grammar/types';
import type { LineSegment } from '../gpu/types';
import type { Preset } from '../presets/examples';
import { deriveN, getGenerationStats, calculateSafeGenerations } from '../derivation/derive';
import { interpretSymbols, normalizeSegments, type TurtleConfig } from '../turtle/cpu-turtle';
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

/** Visualization settings */
export interface VisualState {
	colorMode: 'depth' | 'branch' | 'uniform';
	backgroundColor: string;
	lineColor: string;
	lineWidth: number;
	showStats: boolean;
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
	lineWidth: 1.5,
	showStats: true,
});

/** Current preset name */
export const currentPreset = $state<{ name: string }>({ name: 'Plant 1' });

/** Cached derivation (symbols) - only recompute when grammar/iterations change */
let cachedSymbols: Symbol[] = [];
let cachedGrammarStr: string = '';
let cachedIterations = -1;

/** Cached interpretation (segments) - recompute when angle changes */
let cachedSegments: LineSegment[] = $state([]);
let cachedAngle = -1;

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
 * Interpret symbols to segments (cached - only recomputes when angle changes)
 */
function interpretToSegments(symbols: Symbol[]): LineSegment[] {
	if (symbols.length === 0) return [];
	
	// Check if we can use cached segments
	if (lsystemParams.angle === cachedAngle && cachedSegments.length > 0) {
		return cachedSegments;
	}

	const startTime = performance.now();

	// Need to re-interpret
	const config: TurtleConfig = {
		angle: lsystemParams.angle,
		stepSize: 10, // Fixed step size - gets normalized anyway
	};

	const t1 = performance.now();
	const segments = interpretSymbols(symbols, config);
	const t2 = performance.now();
	const normalized = normalizeSegments(segments, 1.8);
	const t3 = performance.now();
	
	// Detailed timing (check console for bottleneck)
	if (symbols.length > 10000) {
		console.log(`Turtle: interpret=${(t2-t1).toFixed(1)}ms, normalize=${(t3-t2).toFixed(1)}ms, total=${(t3-startTime).toFixed(1)}ms`);
	}
	
	engineState.segmentCount = normalized.length;
	engineState.lastInterpretTime = performance.now() - startTime;
	engineState.gpuTurtleActive = false;

	// Update cache
	cachedAngle = lsystemParams.angle;
	cachedSegments = normalized;

	return normalized;
}

/**
 * Compute line segments from current state (fast path for angle/step changes)
 */
export function computeSegments(): LineSegment[] {
	const symbols = deriveSymbols();
	return interpretToSegments(symbols);
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
	lsystemParams.axiom = preset.grammar.axiom.map((s) => s.id).join('');
	lsystemParams.rules = preset.grammar.rules
		.map((r) => `${r.predecessor} -> ${r.successor.map((s) => s.id).join('')}`)
		.join('\n');
	lsystemParams.iterations = preset.iterations;
	lsystemParams.angle = preset.angle;

	// Clear cache to force recompute
	cachedGrammarStr = '';
	cachedIterations = -1;
	cachedAngle = -1;
}

/**
 * Reset to default state
 */
export function reset(): void {
	loadPreset(plant1);
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
