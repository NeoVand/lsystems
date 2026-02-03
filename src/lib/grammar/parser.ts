/**
 * L-System Grammar Parser
 * Parses D0L and parametric L-system rules
 */

import type { D0LRule, Grammar, ParseError, ParametricRule, ParametricSuccessor, Symbol } from './types';
import { parseExpression, type Expression } from './expression';

/** Token types for lexer */
type TokenType = 'SYMBOL' | 'ARROW' | 'NEWLINE' | 'EOF' | 'WHITESPACE' | 'COMMENT' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COLON' | 'NUMBER' | 'EXPR';

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

		// Parentheses for parametric rules
		if (char === '(') {
			tokens.push({ type: 'LPAREN', value: '(', line, column });
			i++;
			column++;
			continue;
		}

		if (char === ')') {
			tokens.push({ type: 'RPAREN', value: ')', line, column });
			i++;
			column++;
			continue;
		}

		// Comma for parameter separation
		if (char === ',') {
			tokens.push({ type: 'COMMA', value: ',', line, column });
			i++;
			column++;
			continue;
		}

		// Colon for conditions
		if (char === ':') {
			tokens.push({ type: 'COLON', value: ':', line, column });
			i++;
			column++;
			continue;
		}

		// Numbers (for parameters in axiom like F(1))
		if (/\d/.test(char) || (char === '.' && /\d/.test(nextChar || ''))) {
			let num = '';
			const startCol = column;
			while (i < input.length && (/\d/.test(input[i]) || input[i] === '.')) {
				num += input[i];
				i++;
				column++;
			}
			tokens.push({ type: 'NUMBER', value: num, line, column: startCol });
			continue;
		}

		// Expression operators (only those not used as L-system symbols)
		// Note: ^, &, /, | are L-system symbols, so they're handled below as SYMBOL
		if ('*%<>=!'.includes(char)) {
			// Multi-char operators
			const twoChar = input.slice(i, i + 2);
			if (['<=', '>=', '==', '!='].includes(twoChar)) {
				tokens.push({ type: 'EXPR', value: twoChar, line, column });
				i += 2;
				column += 2;
			} else {
				tokens.push({ type: 'EXPR', value: char, line, column });
				i++;
				column++;
			}
			continue;
		}

		// Rotation/movement symbols are always symbols in grammar context
		// +/- = yaw (turn left/right)
		// &/^ = pitch (tilt down/up)
		// \// = roll (roll left/right)
		// | = turn around
		if ('+−&^/|'.includes(char) || char === '\\') {
			tokens.push({ type: 'SYMBOL', value: char, line, column });
			i++;
			column++;
			continue;
		}
		
		// Also handle regular minus
		if (char === '-') {
			tokens.push({ type: 'SYMBOL', value: char, line, column });
			i++;
			column++;
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
 * Formats supported:
 *   axiom: F
 *   axiom: F(1,0.5)         # Parametric axiom
 *   F -> F+F-F-F+F          # D0L rule
 *   F(l) -> F(l*0.9)        # Parametric rule
 *   A(t) : t > 0 -> F A(t-1) # Conditional rule
 *   # Comments start with #
 */
export function parseGrammar(input: string): Grammar | ParseError {
	const tokens = tokenize(input);
	const rules: D0LRule[] = [];
	const parametricRules: ParametricRule[] = [];
	let axiom: Symbol[] = [];

	let i = 0;

	// Skip leading newlines
	while (tokens[i].type === 'NEWLINE') {
		i++;
	}

	// Helper to collect expression content between parens
	function collectExpression(): string {
		let expr = '';
		let parenDepth = 0;
		
		while (i < tokens.length) {
			const t = tokens[i];
			if (t.type === 'LPAREN') {
				parenDepth++;
				if (parenDepth > 1) expr += '(';
				i++;
			} else if (t.type === 'RPAREN') {
				parenDepth--;
				if (parenDepth < 0) break;
				if (parenDepth > 0) expr += ')';
				else { i++; break; }
				i++;
			} else if (t.type === 'COMMA' && parenDepth === 1) {
				break; // Will handle comma at call site
			} else if (t.type === 'NEWLINE' || t.type === 'EOF') {
				break;
			} else {
				expr += t.value;
				i++;
			}
		}
		return expr.trim();
	}

	// Parse a symbol potentially with parameters: F or F(expr, expr, ...)
	function parseParametricSymbol(): { symbol: string; params: string[] } | null {
		if (tokens[i].type !== 'SYMBOL') return null;
		
		const symbol = tokens[i].value;
		i++;
		
		const params: string[] = [];
		
		if (tokens[i].type === 'LPAREN') {
			i++; // skip '('
			
			while (tokens[i].type !== 'RPAREN' && tokens[i].type !== 'EOF' && tokens[i].type !== 'NEWLINE') {
				const expr = collectExpression();
				if (expr) params.push(expr);
				
				if (tokens[i].type === 'COMMA') {
					i++; // skip ','
				} else if (tokens[i].type === 'RPAREN') {
					i++; // skip ')'
					break;
				}
			}
		}
		
		return { symbol, params };
	}

	// Parse a sequence of parametric symbols
	function parseParametricSequence(): ParametricSuccessor[] {
		const successors: ParametricSuccessor[] = [];
		
		while (tokens[i].type === 'SYMBOL') {
			const result = parseParametricSymbol();
			if (!result) break;
			
			successors.push({
				symbol: result.symbol,
				params: result.params.map(expr => {
					try {
						return parseExpression(expr);
					} catch {
						return { type: 'number', value: 0 } as Expression;
					}
				}),
			});
		}
		
		return successors;
	}

	// Parse a sequence of simple symbols until newline or EOF
	function parseSymbolSequence(): Symbol[] {
		const symbols: Symbol[] = [];
		while (tokens[i].type === 'SYMBOL') {
			// Check for parametric symbol
			if (tokens[i + 1]?.type === 'LPAREN') {
				const result = parseParametricSymbol();
				if (result) {
					symbols.push({
						id: result.symbol,
						params: result.params.map(p => {
							try {
								return parseFloat(p) || 0;
							} catch {
								return 0;
							}
						}),
					});
					continue;
				}
			}
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

			// Try to match "axiom" followed by some symbols
			const potentialAxiom = [];
			while (tokens[j].type === 'SYMBOL') {
				potentialAxiom.push(tokens[j].value);
				j++;
			}

			const word = potentialAxiom.join('').toLowerCase();
			if (word === 'axiom' || word.startsWith('axiom')) {
				// Skip past "axiom"
				i = j;
				// Skip colon if present
				if (tokens[i].type === 'COLON') {
					i++;
				}
				// Parse axiom (may be parametric)
				axiom = parseSymbolSequence();
				// Skip newline
				if (tokens[i].type === 'NEWLINE') {
					i++;
				}
				continue;
			}
		}

		// Parse production rule
		if (tokens[i].type === 'SYMBOL') {
			const predecessorToken = tokens[i];
			i++;

			// Check for parametric rule: F(l,w) ...
			let paramNames: string[] = [];
			if (tokens[i].type === 'LPAREN') {
				i++; // skip '('
				while (tokens[i].type === 'SYMBOL' || tokens[i].type === 'COMMA') {
					if (tokens[i].type === 'SYMBOL') {
						paramNames.push(tokens[i].value);
					}
					i++;
					if (tokens[i].type === 'RPAREN') {
						i++;
						break;
					}
				}
			}

			// Check for condition: F(l) : l > 0 -> ...
			let condition: Expression | undefined;
			if (tokens[i].type === 'COLON') {
				i++; // skip ':'
				// Collect condition expression until ARROW
				let condExpr = '';
				while (tokens[i].type !== 'ARROW' && tokens[i].type !== 'EOF' && tokens[i].type !== 'NEWLINE') {
					condExpr += tokens[i].value;
					i++;
				}
				if (condExpr.trim()) {
					try {
						condition = parseExpression(condExpr.trim());
					} catch {
						// Ignore parse errors in condition
					}
				}
			}

			// Expect arrow
			if (tokens[i].type !== 'ARROW') {
				// This might be an axiom if no rules defined yet
				if (rules.length === 0 && parametricRules.length === 0 && axiom.length === 0) {
					// Treat as axiom - go back and reparse
					i = 0;
					while (tokens[i].type === 'NEWLINE') i++;
					axiom = parseSymbolSequence();
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

			// Parse successor
			if (paramNames.length > 0) {
				// Parametric rule
				const successor = parseParametricSequence();
				
				if (successor.length === 0) {
					return {
						message: `Expected successor symbols after '->'`,
						line: tokens[i].line,
						column: tokens[i].column,
					};
				}

				// Check for probability: (0.5) at end of rule
				let probability: number | undefined;
				if (tokens[i].type === 'LPAREN' && tokens[i + 1]?.type === 'NUMBER' && tokens[i + 2]?.type === 'RPAREN') {
					i++; // skip (
					probability = parseFloat(tokens[i].value);
					i++; // skip number
					i++; // skip )
				}

				parametricRules.push({
					predecessor: predecessorToken.value,
					params: paramNames,
					condition,
					successor,
					probability,
				});
			} else {
				// D0L rule
				const successor = parseSymbolSequence();

				if (successor.length === 0) {
					return {
						message: `Expected successor symbols after '->'`,
						line: tokens[i].line,
						column: tokens[i].column,
					};
				}

				// Check for probability: (0.5) at end of rule
				let probability: number | undefined;
				if (tokens[i].type === 'LPAREN' && tokens[i + 1]?.type === 'NUMBER' && tokens[i + 2]?.type === 'RPAREN') {
					i++; // skip (
					probability = parseFloat(tokens[i].value);
					i++; // skip number
					i++; // skip )
				}

				rules.push({
					predecessor: predecessorToken.value,
					successor,
					probability,
				});
			}

			// Skip newline
			if (tokens[i].type === 'NEWLINE') {
				i++;
			}
			continue;
		}

		// Unknown token - try to skip
		i++;
	}

	// Default axiom if not specified
	if (axiom.length === 0) {
		// Use first rule's predecessor as axiom
		if (rules.length > 0) {
			axiom = [{ id: rules[0].predecessor }];
		} else if (parametricRules.length > 0) {
			axiom = [{ id: parametricRules[0].predecessor, params: [1] }];
		} else {
			axiom = [{ id: 'F' }];
		}
	}

	return { axiom, rules, parametricRules };
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
	const axiomStr = grammar.axiom.map((s) => {
		if (s.params && s.params.length > 0) {
			return `${s.id}(${s.params.join(',')})`;
		}
		return s.id;
	}).join('');
	lines.push(`axiom: ${axiomStr}`);
	lines.push('');

	// D0L Rules
	for (const rule of grammar.rules) {
		const successor = rule.successor.map((s) => s.id).join('');
		const prob = rule.probability !== undefined && rule.probability !== 1 ? ` (${rule.probability})` : '';
		lines.push(`${rule.predecessor} -> ${successor}${prob}`);
	}

	// Parametric Rules
	for (const rule of grammar.parametricRules) {
		const params = rule.params.length > 0 ? `(${rule.params.join(',')})` : '';
		const condition = rule.condition ? ` : ${stringifyExpr(rule.condition)}` : '';
		const successor = rule.successor.map((s) => {
			if (s.params.length > 0) {
				return `${s.symbol}(${s.params.map(stringifyExpr).join(',')})`;
			}
			return s.symbol;
		}).join('');
		const prob = rule.probability !== undefined && rule.probability !== 1 ? ` (${rule.probability})` : '';
		lines.push(`${rule.predecessor}${params}${condition} -> ${successor}${prob}`);
	}

	return lines.join('\n');
}

/**
 * Stringify an expression (simplified)
 */
function stringifyExpr(expr: Expression): string {
	switch (expr.type) {
		case 'number': return String(expr.value);
		case 'variable': return expr.name;
		case 'binary': return `(${stringifyExpr(expr.left)}${expr.op}${stringifyExpr(expr.right)})`;
		case 'unary': return `${expr.op}${stringifyExpr(expr.operand)}`;
		case 'call': return `${expr.name}(${expr.args.map(stringifyExpr).join(',')})`;
		default: return '0';
	}
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
		parametricRules: [],
	};
}
