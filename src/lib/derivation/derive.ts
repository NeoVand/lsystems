/**
 * L-system Derivation Engine
 * Handles symbol expansion using production rules
 */

import type { D0LRule, Grammar, Symbol } from '../grammar/types';

/**
 * Apply one generation of derivation rules
 * D0L: Each symbol is replaced independently in parallel
 */
export function derive(symbols: Symbol[], rules: D0LRule[]): Symbol[] {
	// Build rule lookup map for O(1) access
	const ruleMap = new Map<string, Symbol[]>();
	for (const rule of rules) {
		ruleMap.set(rule.predecessor, rule.successor);
	}

	// First pass: count output size for pre-allocation
	let outputSize = 0;
	for (let i = 0; i < symbols.length; i++) {
		const replacement = ruleMap.get(symbols[i].id);
		outputSize += replacement ? replacement.length : 1;
	}

	// Pre-allocate result array
	const result: Symbol[] = new Array(outputSize);
	let outIdx = 0;

	// Second pass: apply rules
	for (let i = 0; i < symbols.length; i++) {
		const symbol = symbols[i];
		const replacement = ruleMap.get(symbol.id);
		if (replacement) {
			// Rule found - expand (copy symbol objects)
			for (let j = 0; j < replacement.length; j++) {
				result[outIdx++] = { id: replacement[j].id };
			}
		} else {
			// No rule - identity
			result[outIdx++] = { id: symbol.id };
		}
	}

	return result;
}

/**
 * Apply multiple generations of derivation
 */
export function deriveN(grammar: Grammar, generations: number): Symbol[] {
	let symbols = [...grammar.axiom];

	for (let i = 0; i < generations; i++) {
		symbols = derive(symbols, grammar.rules);
	}

	return symbols;
}

/**
 * Get symbol counts for each generation (for preview/stats)
 */
export function getGenerationStats(grammar: Grammar, maxGenerations: number): number[] {
	const stats: number[] = [];
	let symbols = [...grammar.axiom];

	stats.push(symbols.length);

	for (let i = 0; i < maxGenerations; i++) {
		symbols = derive(symbols, grammar.rules);
		stats.push(symbols.length);
	}

	return stats;
}

/**
 * Estimate growth rate of L-system
 * Returns ratio of output symbols to input symbols per rule
 */
export function estimateGrowthRate(grammar: Grammar): number {
	if (grammar.rules.length === 0) return 1;

	let totalExpansion = 0;
	let ruleCount = 0;

	for (const rule of grammar.rules) {
		totalExpansion += rule.successor.length;
		ruleCount++;
	}

	return totalExpansion / ruleCount;
}

/**
 * Calculate safe number of generations given memory constraints
 */
export function calculateSafeGenerations(
	grammar: Grammar,
	maxSymbols: number = 4_000_000
): number {
	const growthRate = estimateGrowthRate(grammar);
	const axiomLength = grammar.axiom.length;

	if (growthRate <= 1) return 100; // Won't grow

	// symbols ≈ axiomLength * growthRate^n
	// maxSymbols = axiomLength * growthRate^n
	// n = log(maxSymbols / axiomLength) / log(growthRate)
	const safeGen = Math.floor(Math.log(maxSymbols / axiomLength) / Math.log(growthRate));

	return Math.max(1, Math.min(safeGen, 20)); // Clamp to reasonable range
}

/**
 * Convert symbols to string representation
 */
export function symbolsToString(symbols: Symbol[]): string {
	return symbols.map((s) => s.id).join('');
}

/**
 * Convert string to symbols
 */
export function stringToSymbols(str: string): Symbol[] {
	return str.split('').map((id) => ({ id }));
}
