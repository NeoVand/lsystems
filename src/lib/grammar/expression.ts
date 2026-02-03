/**
 * Expression System for Parametric L-Systems
 * Supports arithmetic expressions with variables
 */

// Expression AST nodes
export type Expression =
	| { type: 'number'; value: number }
	| { type: 'variable'; name: string }
	| { type: 'binary'; op: BinaryOp; left: Expression; right: Expression }
	| { type: 'unary'; op: UnaryOp; operand: Expression }
	| { type: 'call'; name: string; args: Expression[] };

export type BinaryOp = '+' | '-' | '*' | '/' | '%' | '^' | '<' | '>' | '<=' | '>=' | '==' | '!=' | '&&' | '||';
export type UnaryOp = '-' | '!';

// Built-in functions
const BUILTINS: Record<string, (args: number[]) => number> = {
	sin: (a) => Math.sin(a[0]),
	cos: (a) => Math.cos(a[0]),
	tan: (a) => Math.tan(a[0]),
	sqrt: (a) => Math.sqrt(a[0]),
	abs: (a) => Math.abs(a[0]),
	floor: (a) => Math.floor(a[0]),
	ceil: (a) => Math.ceil(a[0]),
	round: (a) => Math.round(a[0]),
	min: (a) => Math.min(...a),
	max: (a) => Math.max(...a),
	pow: (a) => Math.pow(a[0], a[1]),
	log: (a) => Math.log(a[0]),
	exp: (a) => Math.exp(a[0]),
	random: () => Math.random(),
};

/**
 * Parse an expression string into AST
 */
export function parseExpression(input: string): Expression {
	const tokens = tokenizeExpression(input);
	const parser = new ExpressionParser(tokens);
	return parser.parse();
}

/**
 * Evaluate an expression with given variable bindings
 */
export function evaluateExpression(expr: Expression, vars: Record<string, number>): number {
	switch (expr.type) {
		case 'number':
			return expr.value;
		
		case 'variable':
			if (expr.name in vars) {
				return vars[expr.name];
			}
			throw new Error(`Unknown variable: ${expr.name}`);
		
		case 'binary': {
			const left = evaluateExpression(expr.left, vars);
			const right = evaluateExpression(expr.right, vars);
			switch (expr.op) {
				case '+': return left + right;
				case '-': return left - right;
				case '*': return left * right;
				case '/': return right !== 0 ? left / right : 0;
				case '%': return left % right;
				case '^': return Math.pow(left, right);
				case '<': return left < right ? 1 : 0;
				case '>': return left > right ? 1 : 0;
				case '<=': return left <= right ? 1 : 0;
				case '>=': return left >= right ? 1 : 0;
				case '==': return left === right ? 1 : 0;
				case '!=': return left !== right ? 1 : 0;
				case '&&': return (left && right) ? 1 : 0;
				case '||': return (left || right) ? 1 : 0;
				default: return 0;
			}
		}
		
		case 'unary': {
			const operand = evaluateExpression(expr.operand, vars);
			switch (expr.op) {
				case '-': return -operand;
				case '!': return operand ? 0 : 1;
				default: return 0;
			}
		}
		
		case 'call': {
			const fn = BUILTINS[expr.name];
			if (!fn) {
				throw new Error(`Unknown function: ${expr.name}`);
			}
			const args = expr.args.map(a => evaluateExpression(a, vars));
			return fn(args);
		}
	}
}

/**
 * Stringify an expression back to text
 */
export function stringifyExpression(expr: Expression): string {
	switch (expr.type) {
		case 'number':
			return expr.value.toString();
		case 'variable':
			return expr.name;
		case 'binary':
			return `(${stringifyExpression(expr.left)} ${expr.op} ${stringifyExpression(expr.right)})`;
		case 'unary':
			return `${expr.op}${stringifyExpression(expr.operand)}`;
		case 'call':
			return `${expr.name}(${expr.args.map(stringifyExpression).join(', ')})`;
	}
}

// Token types
interface BaseToken {
	type: string;
	value?: string | number;
}

type Token =
	| { type: 'number'; value: number }
	| { type: 'ident'; value: string }
	| { type: 'op'; value: string }
	| { type: 'lparen'; value?: undefined }
	| { type: 'rparen'; value?: undefined }
	| { type: 'comma'; value?: undefined }
	| { type: 'eof'; value?: undefined };

/**
 * Tokenize expression string
 */
function tokenizeExpression(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	
	while (i < input.length) {
		const c = input[i];
		
		// Skip whitespace
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		
		// Numbers (including decimals)
		if (/\d/.test(c) || (c === '.' && /\d/.test(input[i + 1]))) {
			let num = '';
			while (i < input.length && (/\d/.test(input[i]) || input[i] === '.')) {
				num += input[i++];
			}
			tokens.push({ type: 'number', value: parseFloat(num) });
			continue;
		}
		
		// Identifiers (variables and functions)
		if (/[a-zA-Z_]/.test(c)) {
			let ident = '';
			while (i < input.length && /[a-zA-Z_0-9]/.test(input[i])) {
				ident += input[i++];
			}
			tokens.push({ type: 'ident', value: ident });
			continue;
		}
		
		// Two-character operators
		const twoChar = input.slice(i, i + 2);
		if (['<=', '>=', '==', '!=', '&&', '||'].includes(twoChar)) {
			tokens.push({ type: 'op', value: twoChar });
			i += 2;
			continue;
		}
		
		// Single-character operators and punctuation
		if ('+-*/%^<>!'.includes(c)) {
			tokens.push({ type: 'op', value: c });
			i++;
			continue;
		}
		
		if (c === '(') {
			tokens.push({ type: 'lparen' });
			i++;
			continue;
		}
		
		if (c === ')') {
			tokens.push({ type: 'rparen' });
			i++;
			continue;
		}
		
		if (c === ',') {
			tokens.push({ type: 'comma' });
			i++;
			continue;
		}
		
		// Unknown character - skip
		i++;
	}
	
	tokens.push({ type: 'eof' });
	return tokens;
}

/**
 * Recursive descent parser for expressions
 */
class ExpressionParser {
	private pos = 0;
	
	constructor(private tokens: Token[]) {}
	
	parse(): Expression {
		return this.parseOr();
	}
	
	private current(): Token {
		return this.tokens[this.pos] || { type: 'eof' };
	}
	
	private advance(): Token {
		return this.tokens[this.pos++] || { type: 'eof' };
	}
	
	private getOpValue(): string | undefined {
		const t = this.current();
		return t.type === 'op' ? t.value : undefined;
	}

	private parseOr(): Expression {
		let left = this.parseAnd();
		while (this.getOpValue() === '||') {
			this.advance();
			const right = this.parseAnd();
			left = { type: 'binary', op: '||', left, right };
		}
		return left;
	}
	
	private parseAnd(): Expression {
		let left = this.parseComparison();
		while (this.getOpValue() === '&&') {
			this.advance();
			const right = this.parseComparison();
			left = { type: 'binary', op: '&&', left, right };
		}
		return left;
	}
	
	private parseComparison(): Expression {
		let left = this.parseAddSub();
		const ops = ['<', '>', '<=', '>=', '==', '!='];
		let opVal = this.getOpValue();
		while (opVal && ops.includes(opVal)) {
			const op = opVal as BinaryOp;
			this.advance();
			const right = this.parseAddSub();
			left = { type: 'binary', op, left, right };
			opVal = this.getOpValue();
		}
		return left;
	}
	
	private parseAddSub(): Expression {
		let left = this.parseMulDiv();
		let opVal = this.getOpValue();
		while (opVal === '+' || opVal === '-') {
			const op = opVal as BinaryOp;
			this.advance();
			const right = this.parseMulDiv();
			left = { type: 'binary', op, left, right };
			opVal = this.getOpValue();
		}
		return left;
	}
	
	private parseMulDiv(): Expression {
		let left = this.parsePower();
		let opVal = this.getOpValue();
		while (opVal === '*' || opVal === '/' || opVal === '%') {
			const op = opVal as BinaryOp;
			this.advance();
			const right = this.parsePower();
			left = { type: 'binary', op, left, right };
			opVal = this.getOpValue();
		}
		return left;
	}
	
	private parsePower(): Expression {
		let left = this.parseUnary();
		if (this.getOpValue() === '^') {
			this.advance();
			const right = this.parsePower(); // Right associative
			return { type: 'binary', op: '^', left, right };
		}
		return left;
	}
	
	private parseUnary(): Expression {
		const opVal = this.getOpValue();
		if (opVal === '-' || opVal === '!') {
			const op = opVal as UnaryOp;
			this.advance();
			const operand = this.parseUnary();
			return { type: 'unary', op, operand };
		}
		return this.parsePrimary();
	}
	
	private parsePrimary(): Expression {
		const token = this.current();
		
		if (token.type === 'number') {
			this.advance();
			return { type: 'number', value: token.value };
		}
		
		if (token.type === 'ident') {
			this.advance();
			// Check if it's a function call
			if (this.current().type === 'lparen') {
				this.advance(); // consume '('
				const args: Expression[] = [];
				if (this.current().type !== 'rparen') {
					args.push(this.parse());
					while (this.current().type === 'comma') {
						this.advance();
						args.push(this.parse());
					}
				}
				if (this.current().type === 'rparen') {
					this.advance();
				}
				return { type: 'call', name: token.value, args };
			}
			return { type: 'variable', name: token.value };
		}
		
		if (token.type === 'lparen') {
			this.advance();
			const expr = this.parse();
			if (this.current().type === 'rparen') {
				this.advance();
			}
			return expr;
		}
		
		// Default to 0
		return { type: 'number', value: 0 };
	}
}
