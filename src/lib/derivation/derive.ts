/**
 * L-system Derivation Engine
 * Handles symbol expansion using production rules
 */

import type { D0LRule, Grammar, ParametricRule, Symbol } from '../grammar/types';
import { evaluateExpression, type Expression } from '../grammar/expression';

/**
 * Select a rule stochastically from a list of rules with probabilities
 */
function selectStochasticRule<T extends { probability?: number }>(rules: T[]): T {
	if (rules.length === 1) return rules[0];
	
	// Calculate total probability
	let totalProb = 0;
	for (const rule of rules) {
		totalProb += rule.probability ?? 1;
	}
	
	// Normalize if needed and pick randomly
	const rand = Math.random() * totalProb;
	let cumulative = 0;
	
	for (const rule of rules) {
		cumulative += rule.probability ?? 1;
		if (rand < cumulative) {
			return rule;
		}
	}
	
	return rules[rules.length - 1];
}

/**
 * Apply one generation of derivation rules
 * Supports D0L, parametric, and stochastic rules
 */
export function derive(symbols: Symbol[], rules: D0LRule[], parametricRules: ParametricRule[] = []): Symbol[] {
	// Build D0L rule lookup map (group by predecessor for stochastic support)
	const d0lRuleMap = new Map<string, D0LRule[]>();
	for (const rule of rules) {
		const existing = d0lRuleMap.get(rule.predecessor) || [];
		existing.push(rule);
		d0lRuleMap.set(rule.predecessor, existing);
	}

	// Build parametric rule lookup (can have multiple rules per symbol)
	const paramRuleMap = new Map<string, ParametricRule[]>();
	for (const rule of parametricRules) {
		const existing = paramRuleMap.get(rule.predecessor) || [];
		existing.push(rule);
		paramRuleMap.set(rule.predecessor, existing);
	}

	// Process symbols - can't easily pre-allocate for parametric since output varies
	const result: Symbol[] = [];

	for (let i = 0; i < symbols.length; i++) {
		const symbol = symbols[i];
		
		// Try parametric rules first (if symbol has params)
		if (symbol.params && symbol.params.length > 0) {
			const paramRules = paramRuleMap.get(symbol.id);
			if (paramRules) {
				// Build variable bindings from symbol params
				let matched = false;
				
				// Filter rules that match param count and condition
				const matchingRules: ParametricRule[] = [];
				for (const rule of paramRules) {
					if (rule.params.length !== symbol.params.length) continue;
					
					const vars: Record<string, number> = {};
					for (let p = 0; p < rule.params.length; p++) {
						vars[rule.params[p]] = symbol.params[p];
					}
					
					// Check condition if present
					if (rule.condition) {
						try {
							const condResult = evaluateExpression(rule.condition, vars);
							if (!condResult) continue;
						} catch {
							continue;
						}
					}
					
					matchingRules.push(rule);
				}
				
				if (matchingRules.length > 0) {
					// Select rule (stochastically if multiple)
					const selectedRule = selectStochasticRule(matchingRules);
					
					const vars: Record<string, number> = {};
					for (let p = 0; p < selectedRule.params.length; p++) {
						vars[selectedRule.params[p]] = symbol.params[p];
					}
					
					// Apply rule - evaluate successor expressions
					for (const succ of selectedRule.successor) {
						const newParams: number[] = [];
						for (const expr of succ.params) {
							try {
								newParams.push(evaluateExpression(expr, vars));
							} catch {
								newParams.push(0);
							}
						}
						result.push({
							id: succ.symbol,
							params: newParams.length > 0 ? newParams : undefined,
						});
					}
					matched = true;
				}
				
				if (matched) continue;
			}
		}
		
		// Try D0L rules (with stochastic selection)
		const d0lRules = d0lRuleMap.get(symbol.id);
		if (d0lRules && d0lRules.length > 0) {
			// Select rule (stochastically if multiple)
			const selectedRule = selectStochasticRule(d0lRules);
			for (let j = 0; j < selectedRule.successor.length; j++) {
				result.push({ id: selectedRule.successor[j].id });
			}
			continue;
		}
		
		// No rule - identity
		result.push({ id: symbol.id, params: symbol.params });
	}

	return result;
}

/**
 * Apply multiple generations of derivation
 */
export function deriveN(grammar: Grammar, generations: number): Symbol[] {
	let symbols = [...grammar.axiom];
	const parametricRules = grammar.parametricRules || [];

	for (let i = 0; i < generations; i++) {
		symbols = derive(symbols, grammar.rules, parametricRules);
	}

	return symbols;
}

/**
 * Get symbol counts for each generation (for preview/stats)
 */
export function getGenerationStats(grammar: Grammar, maxGenerations: number): number[] {
	const stats: number[] = [];
	let symbols = [...grammar.axiom];
	const parametricRules = grammar.parametricRules || [];

	stats.push(symbols.length);

	for (let i = 0; i < maxGenerations; i++) {
		symbols = derive(symbols, grammar.rules, parametricRules);
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
