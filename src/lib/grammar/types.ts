/**
 * L-system grammar type definitions
 */

/** A symbol in the L-system alphabet */
export interface Symbol {
	id: string; // Single character identifier
	params?: number[]; // Optional parameters for parametric L-systems
}

/** A production rule for D0L (deterministic, context-free) */
export interface D0LRule {
	predecessor: string; // Single symbol to match
	successor: Symbol[]; // Replacement symbols
}

/** A parametric rule with conditions and expressions */
export interface ParametricRule {
	predecessor: string;
	params: string[]; // Parameter names (e.g., ['l', 'w'])
	condition?: Expression; // Guard condition
	successor: ParametricSuccessor[];
	probability?: number; // For stochastic rules (1.0 = deterministic)
}

/** Successor symbol with parameter expressions */
export interface ParametricSuccessor {
	symbol: string;
	paramExpressions: Expression[]; // Expressions for each parameter
}

/** Expression AST node types */
export type Expression =
	| { type: 'literal'; value: number }
	| { type: 'param'; name: string }
	| { type: 'binary'; op: BinaryOp; left: Expression; right: Expression }
	| { type: 'unary'; op: UnaryOp; operand: Expression };

export type BinaryOp = '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '==' | '!=' | '&&' | '||';
export type UnaryOp = '-' | '!';

/** Complete L-system grammar */
export interface Grammar {
	axiom: Symbol[];
	rules: D0LRule[];
	// Future: parametricRules, contextRules
}

/** Parsed rule result from parser */
export interface ParsedRule {
	type: 'd0l' | 'parametric';
	rule: D0LRule | ParametricRule;
}

/** Parser error */
export interface ParseError {
	message: string;
	line: number;
	column: number;
}

/** Standard L-system symbols */
export const StandardSymbols = {
	// Movement
	F: 'F', // Move forward and draw
	f: 'f', // Move forward without drawing
	G: 'G', // Move forward and draw (alternative)

	// Rotation (2D)
	PLUS: '+', // Turn left by angle
	MINUS: '-', // Turn right by angle

	// Rotation (3D)
	AMPERSAND: '&', // Pitch down
	CARET: '^', // Pitch up
	BACKSLASH: '\\', // Roll left
	SLASH: '/', // Roll right
	PIPE: '|', // Turn around (180°)

	// Branching
	BRANCH_OPEN: '[', // Push state onto stack
	BRANCH_CLOSE: ']', // Pop state from stack

	// Polygon
	BRACE_OPEN: '{', // Start polygon
	BRACE_CLOSE: '}', // End polygon
	DOT: '.', // Record vertex
} as const;

/** Check if a symbol is drawable */
export function isDrawableSymbol(symbol: string): boolean {
	return symbol === 'F' || symbol === 'G';
}

/** Check if a symbol is a branch control */
export function isBranchSymbol(symbol: string): boolean {
	return symbol === '[' || symbol === ']';
}

/** Check if a symbol is a rotation */
export function isRotationSymbol(symbol: string): boolean {
	return ['+', '-', '&', '^', '\\', '/', '|'].includes(symbol);
}
