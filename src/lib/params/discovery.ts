/**
 * Parameter Discovery System
 * Automatically extracts controllable parameters from L-system grammars
 */

import type { Grammar, Symbol, ParametricRule } from '../grammar/types';
import type { Expression } from '../grammar/expression';

/** A discovered controllable parameter */
export interface DiscoveredParam {
	id: string;              // Unique identifier
	name: string;            // Human-readable name
	symbol: string;          // Symbol this parameter belongs to (e.g., 'A', 'F')
	paramIndex: number;      // Index in symbol's param list
	location: 'axiom' | 'rule';  // Where the parameter was found
	currentValue: number;    // Current value
	min: number;             // Suggested minimum
	max: number;             // Suggested maximum
	step: number;            // Suggested step size
	description?: string;    // Auto-generated description
}

/** Parameter types for heuristic naming and bounds */
type ParamType = 'length' | 'angle' | 'ratio' | 'count' | 'unknown';

/**
 * Detect parameter type from context
 */
function detectParamType(symbol: string, paramIndex: number, value: number): ParamType {
	// Angle parameters - used with + or - symbols
	if ((symbol === '+' || symbol === '-') && paramIndex === 0) {
		return 'angle';
	}
	
	// Ratio parameters - values between 0 and 1
	if (value > 0 && value < 1) {
		return 'ratio';
	}
	
	// Length/size parameters - positive numbers typically > 1
	if (value >= 1 && (symbol === 'F' || symbol === 'G' || symbol === 'A' || symbol === 'B')) {
		return 'length';
	}
	
	// Small positive integers might be counts
	if (Number.isInteger(value) && value >= 1 && value <= 10) {
		return 'count';
	}
	
	return 'unknown';
}

/**
 * Generate human-readable name for parameter
 */
function generateParamName(symbol: string, paramIndex: number, paramType: ParamType, location: 'axiom' | 'rule'): string {
	if (paramType === 'angle') {
		return 'Branch Angle';
	}
	
	if (paramType === 'ratio') {
		return `Scale Factor${paramIndex > 0 ? ` ${paramIndex + 1}` : ''}`;
	}
	
	if (paramType === 'length') {
		if (location === 'axiom') {
			return 'Initial Size';
		}
		return `Step Size${paramIndex > 0 ? ` ${paramIndex + 1}` : ''}`;
	}
	
	if (paramType === 'count') {
		return `Count${paramIndex > 0 ? ` ${paramIndex + 1}` : ''}`;
	}
	
	return `Parameter ${symbol}[${paramIndex}]`;
}

/**
 * Generate bounds for parameter
 */
function generateBounds(value: number, paramType: ParamType): { min: number; max: number; step: number } {
	switch (paramType) {
		case 'angle':
			return { min: 1, max: 180, step: 1 };
		
		case 'ratio':
			return { min: 0.1, max: 1.0, step: 0.05 };
		
		case 'length':
			// Scale bounds relative to current value
			return { 
				min: Math.max(0.5, value * 0.1), 
				max: value * 3, 
				step: Math.max(0.1, value * 0.1) 
			};
		
		case 'count':
			return { min: 1, max: Math.max(10, value * 2), step: 1 };
		
		default:
			// Generic bounds centered on current value
			return { 
				min: Math.min(0, value * 0.5), 
				max: Math.max(value * 2, 10), 
				step: Math.max(0.1, Math.abs(value) * 0.1) 
			};
	}
}

/**
 * Extract parameters from axiom symbols
 */
function discoverAxiomParams(axiom: Symbol[]): DiscoveredParam[] {
	const params: DiscoveredParam[] = [];
	
	for (const sym of axiom) {
		if (!sym.params || sym.params.length === 0) continue;
		
		for (let i = 0; i < sym.params.length; i++) {
			const value = sym.params[i];
			const paramType = detectParamType(sym.id, i, value);
			const bounds = generateBounds(value, paramType);
			
			params.push({
				id: `axiom_${sym.id}_${i}`,
				name: generateParamName(sym.id, i, paramType, 'axiom'),
				symbol: sym.id,
				paramIndex: i,
				location: 'axiom',
				currentValue: value,
				...bounds,
				description: `Initial ${paramType} for ${sym.id}`,
			});
		}
	}
	
	return params;
}

/**
 * Extract scaling factors from parametric rule expressions
 * e.g., l*0.7 → ratio parameter 0.7
 */
function extractScalingFactors(expr: Expression): { value: number; path: string }[] {
	const factors: { value: number; path: string }[] = [];
	
	if (expr.type === 'binary' && expr.op === '*') {
		// Look for variable * number or number * variable
		if (expr.left.type === 'variable' && expr.right.type === 'number') {
			factors.push({ value: expr.right.value, path: 'right' });
		} else if (expr.left.type === 'number' && expr.right.type === 'variable') {
			factors.push({ value: expr.left.value, path: 'left' });
		}
	}
	
	return factors;
}

/**
 * Extract parameters from parametric rules
 */
function discoverRuleParams(rules: ParametricRule[]): DiscoveredParam[] {
	const params: DiscoveredParam[] = [];
	const seenScalingFactors = new Set<number>();
	
	for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
		const rule = rules[ruleIdx];
		
		for (let succIdx = 0; succIdx < rule.successor.length; succIdx++) {
			const succ = rule.successor[succIdx];
			
			for (let paramIdx = 0; paramIdx < succ.params.length; paramIdx++) {
				const expr = succ.params[paramIdx];
				
				// Look for literal numbers (e.g., +(25))
				if (expr.type === 'number') {
					const value = expr.value;
					const paramType = detectParamType(succ.symbol, paramIdx, value);
					
					// Skip if it looks like a scaling factor we already have
					if (paramType === 'ratio' && seenScalingFactors.has(value)) continue;
					
					const bounds = generateBounds(value, paramType);
					
					params.push({
						id: `rule_${ruleIdx}_${succIdx}_${paramIdx}`,
						name: generateParamName(succ.symbol, paramIdx, paramType, 'rule'),
						symbol: succ.symbol,
						paramIndex: paramIdx,
						location: 'rule',
						currentValue: value,
						...bounds,
					});
				}
				
				// Look for scaling factors in expressions (e.g., l*0.7)
				const factors = extractScalingFactors(expr);
				for (const factor of factors) {
					if (seenScalingFactors.has(factor.value)) continue;
					seenScalingFactors.add(factor.value);
					
					const paramType = detectParamType(succ.symbol, paramIdx, factor.value);
					const bounds = generateBounds(factor.value, paramType);
					
					params.push({
						id: `factor_${ruleIdx}_${succIdx}_${paramIdx}`,
						name: paramType === 'ratio' ? 'Branch Ratio' : generateParamName(succ.symbol, paramIdx, paramType, 'rule'),
						symbol: succ.symbol,
						paramIndex: paramIdx,
						location: 'rule',
						currentValue: factor.value,
						...bounds,
					});
				}
			}
		}
	}
	
	return params;
}

/**
 * Discover all controllable parameters in a grammar
 */
export function discoverParameters(grammar: Grammar): DiscoveredParam[] {
	const params: DiscoveredParam[] = [];
	
	// Extract from axiom
	params.push(...discoverAxiomParams(grammar.axiom));
	
	// Extract from parametric rules
	if (grammar.parametricRules && grammar.parametricRules.length > 0) {
		params.push(...discoverRuleParams(grammar.parametricRules));
	}
	
	// Deduplicate by name (keep first occurrence)
	const seen = new Set<string>();
	const unique: DiscoveredParam[] = [];
	
	for (const param of params) {
		if (!seen.has(param.name)) {
			seen.add(param.name);
			unique.push(param);
		}
	}
	
	return unique;
}

/**
 * Update a parameter value in the grammar
 * Returns the modified grammar text (axiom and rules)
 */
export function updateParameterInGrammar(
	axiomText: string,
	rulesText: string,
	param: DiscoveredParam,
	newValue: number
): { axiom: string; rules: string } {
	if (param.location === 'axiom') {
		// Update axiom parameter
		// Match patterns like A(10) or A(10,20)
		const regex = new RegExp(`(${param.symbol}\\([^)]*?)\\b${param.currentValue}\\b([^)]*)\\)`);
		const newAxiom = axiomText.replace(regex, `$1${newValue}$2)`);
		return { axiom: newAxiom, rules: rulesText };
	} else {
		// Update rule parameter
		// This is trickier - need to find the specific occurrence
		// For now, do a simple text replacement
		const oldStr = String(param.currentValue);
		const newStr = String(newValue);
		
		// Replace in rules, being careful about context
		// Use word boundaries to avoid partial matches
		const regex = new RegExp(`\\b${oldStr.replace('.', '\\.')}\\b`);
		const newRules = rulesText.replace(regex, newStr);
		
		return { axiom: axiomText, rules: newRules };
	}
}
