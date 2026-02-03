/**
 * D0L Grammar Parser
 * Parses simple deterministic, context-free L-system rules
 */

import type { D0LRule, Grammar, ParseError, Symbol } from './types';

/** Token types for lexer */
type TokenType = 'SYMBOL' | 'ARROW' | 'NEWLINE' | 'EOF' | 'WHITESPACE' | 'COMMENT';

interface Token {
	type: TokenType;
	value: string;
	line: number;
	column: number;
}

/**
 * Tokenize a grammar string
 */
function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let line = 1;
	let column = 1;
	let i = 0;

	while (i < input.length) {
		const char = input[i];
		const nextChar = input[i + 1];

		// Skip whitespace (but track newlines)
		if (char === '\n') {
			tokens.push({ type: 'NEWLINE', value: '\n', line, column });
			line++;
			column = 1;
			i++;
			continue;
		}

		if (char === ' ' || char === '\t' || char === '\r') {
			i++;
			column++;
			continue;
		}

		// Comments (# to end of line)
		if (char === '#') {
			while (i < input.length && input[i] !== '\n') {
				i++;
			}
			continue;
		}

		// Arrow: -> or →
		if ((char === '-' && nextChar === '>') || char === '→') {
			tokens.push({ type: 'ARROW', value: '->', line, column });
			i += char === '→' ? 1 : 2;
			column += char === '→' ? 1 : 2;
			continue;
		}

		// Symbols: any valid L-system character
		if (isValidSymbol(char)) {
			tokens.push({ type: 'SYMBOL', value: char, line, column });
			i++;
			column++;
			continue;
		}

		// Unknown character - skip silently
		i++;
		column++;
	}

	tokens.push({ type: 'EOF', value: '', line, column });
	return tokens;
}

/**
 * Check if a character is a valid L-system symbol
 */
function isValidSymbol(char: string): boolean {
	// Standard symbols + uppercase letters + lowercase letters + digits + colon for "axiom:"
	const validChars = 'FfGg+-&^\\|/[]{}.:' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxyz';
	return validChars.includes(char);
}

/**
 * Parse a single symbol (D0L - no parameters)
 */
function parseSymbol(token: Token): Symbol {
	return { id: token.value };
}

/**
 * Parse grammar rules from text
 *
 * Format:
 *   axiom: F
 *   F -> F+F-F-F+F
 *   # Comments start with #
 */
export function parseGrammar(input: string): Grammar | ParseError {
	const tokens = tokenize(input);
	const rules: D0LRule[] = [];
	let axiom: Symbol[] = [];

	let i = 0;

	// Skip leading newlines
	while (tokens[i].type === 'NEWLINE') {
		i++;
	}

	// Helper to parse a sequence of symbols until newline or EOF
	function parseSymbolSequence(): Symbol[] {
		const symbols: Symbol[] = [];
		while (tokens[i].type === 'SYMBOL') {
			symbols.push(parseSymbol(tokens[i]));
			i++;
		}
		return symbols;
	}

	// Parse lines
	while (tokens[i].type !== 'EOF') {
		// Skip empty lines
		if (tokens[i].type === 'NEWLINE') {
			i++;
			continue;
		}

		// Check for axiom declaration
		if (
			tokens[i].type === 'SYMBOL' &&
			tokens[i].value.toLowerCase() === 'a' &&
			tokens[i + 1]?.type === 'SYMBOL' &&
			tokens[i + 1].value.toLowerCase() === 'x'
		) {
			// Check for "axiom:" pattern
			let j = i;
			let isAxiomDecl = false;

			// Try to match "axiom" followed by some symbols
			const potentialAxiom = [];
			while (tokens[j].type === 'SYMBOL') {
				potentialAxiom.push(tokens[j].value);
				j++;
			}

			const word = potentialAxiom.join('').toLowerCase();
			if (word === 'axiom' || word.startsWith('axiom')) {
				// Skip past "axiom" and any colon-like symbol
				i = j;
				if (tokens[i].type === 'SYMBOL' && tokens[i].value === ':') {
					i++;
				}
				// Skip whitespace handled by tokenizer
				axiom = parseSymbolSequence();
				// Skip newline
				if (tokens[i].type === 'NEWLINE') {
					i++;
				}
				continue;
			}
		}

		// Parse production rule: predecessor -> successor
		if (tokens[i].type === 'SYMBOL') {
			const predecessorToken = tokens[i];
			i++;

			// Expect arrow
			if (tokens[i].type !== 'ARROW') {
				// This might be an axiom if no rules defined yet
				if (rules.length === 0 && axiom.length === 0) {
					// Treat as axiom
					axiom = [parseSymbol(predecessorToken), ...parseSymbolSequence()];
					if (tokens[i].type === 'NEWLINE') {
						i++;
					}
					continue;
				}
				return {
					message: `Expected '->' after predecessor '${predecessorToken.value}'`,
					line: tokens[i].line,
					column: tokens[i].column,
				};
			}
			i++; // Skip arrow

			const successor = parseSymbolSequence();

			if (successor.length === 0) {
				return {
					message: `Expected successor symbols after '->'`,
					line: tokens[i].line,
					column: tokens[i].column,
				};
			}

			rules.push({
				predecessor: predecessorToken.value,
				successor,
			});

			// Skip newline
			if (tokens[i].type === 'NEWLINE') {
				i++;
			}
			continue;
		}

		// Unknown token
		return {
			message: `Unexpected token: ${tokens[i].value}`,
			line: tokens[i].line,
			column: tokens[i].column,
		};
	}

	// Default axiom if not specified
	if (axiom.length === 0) {
		// Use first rule's predecessor as axiom
		if (rules.length > 0) {
			axiom = [{ id: rules[0].predecessor }];
		} else {
			axiom = [{ id: 'F' }];
		}
	}

	return { axiom, rules };
}

/**
 * Check if result is an error
 */
export function isParseError(result: Grammar | ParseError): result is ParseError {
	return 'message' in result;
}

/**
 * Serialize grammar back to string
 */
export function serializeGrammar(grammar: Grammar): string {
	const lines: string[] = [];

	// Axiom
	lines.push(`axiom: ${grammar.axiom.map((s) => s.id).join('')}`);
	lines.push('');

	// Rules
	for (const rule of grammar.rules) {
		const successor = rule.successor.map((s) => s.id).join('');
		lines.push(`${rule.predecessor} -> ${successor}`);
	}

	return lines.join('\n');
}

/**
 * Simple grammar format for quick definition
 */
export function quickGrammar(axiom: string, rules: Record<string, string>): Grammar {
	return {
		axiom: axiom.split('').map((id) => ({ id })),
		rules: Object.entries(rules).map(([predecessor, successor]) => ({
			predecessor,
			successor: successor.split('').map((id) => ({ id })),
		})),
	};
}
