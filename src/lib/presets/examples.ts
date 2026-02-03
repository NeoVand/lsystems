/**
 * Classic L-system Presets
 * Collection of well-known L-systems for testing and demonstration
 */

import type { Grammar } from '../grammar/types';
import { quickGrammar } from '../grammar/parser';

export interface Preset {
	name: string;
	description: string;
	grammar: Grammar;
	angle: number;
	iterations: number;
}

/**
 * Koch Snowflake
 * Classic fractal curve
 */
export const kochSnowflake: Preset = {
	name: 'Koch Snowflake',
	description: 'Classic fractal snowflake curve',
	grammar: quickGrammar('F--F--F', {
		F: 'F+F--F+F',
	}),
	angle: 60,
	iterations: 4,
};

/**
 * Koch Curve (single edge)
 */
export const kochCurve: Preset = {
	name: 'Koch Curve',
	description: 'Single edge of Koch snowflake',
	grammar: quickGrammar('F', {
		F: 'F+F-F-F+F',
	}),
	angle: 90,
	iterations: 4,
};

/**
 * Dragon Curve
 * Classic space-filling curve
 */
export const dragonCurve: Preset = {
	name: 'Dragon Curve',
	description: 'Heighway dragon curve',
	grammar: quickGrammar('FX', {
		X: 'X+YF+',
		Y: '-FX-Y',
	}),
	angle: 90,
	iterations: 10,
};

/**
 * Sierpinski Triangle
 * Classic fractal triangle
 */
export const sierpinskiTriangle: Preset = {
	name: 'Sierpinski Triangle',
	description: 'Sierpinski gasket/triangle',
	grammar: quickGrammar('F-G-G', {
		F: 'F-G+F+G-F',
		G: 'GG',
	}),
	angle: 120,
	iterations: 6,
};

/**
 * Sierpinski Arrowhead
 */
export const sierpinskiArrowhead: Preset = {
	name: 'Sierpinski Arrowhead',
	description: 'Alternative Sierpinski construction',
	grammar: quickGrammar('A', {
		A: 'B-A-B',
		B: 'A+B+A',
	}),
	angle: 60,
	iterations: 7,
};

/**
 * Hilbert Curve
 * Space-filling curve
 */
export const hilbertCurve: Preset = {
	name: 'Hilbert Curve',
	description: 'Space-filling Hilbert curve',
	grammar: quickGrammar('A', {
		A: '-BF+AFA+FB-',
		B: '+AF-BFB-FA+',
	}),
	angle: 90,
	iterations: 5,
};

/**
 * Gosper Curve (Flowsnake)
 */
export const gosperCurve: Preset = {
	name: 'Gosper Curve',
	description: 'Flowsnake / Peano-Gosper curve',
	grammar: quickGrammar('A', {
		A: 'A-B--B+A++AA+B-',
		B: '+A-BB--B-A++A+B',
	}),
	angle: 60,
	iterations: 4,
};

/**
 * Binary Tree
 * Simple fractal tree
 */
export const binaryTree: Preset = {
	name: 'Binary Tree',
	description: 'Simple symmetric binary tree',
	grammar: quickGrammar('F', {
		F: 'FF+[+F-F-F]-[-F+F+F]',
	}),
	angle: 22.5,
	iterations: 4,
};

/**
 * Plant 1 (Bracketed)
 * Realistic-looking plant
 */
export const plant1: Preset = {
	name: 'Plant 1',
	description: 'Simple bracketed plant',
	grammar: quickGrammar('X', {
		X: 'F+[[X]-X]-F[-FX]+X',
		F: 'FF',
	}),
	angle: 25,
	iterations: 5,
};

/**
 * Plant 2 (Stochastic-like appearance)
 */
export const plant2: Preset = {
	name: 'Plant 2',
	description: 'More complex plant structure',
	grammar: quickGrammar('F', {
		F: 'F[+F]F[-F]F',
	}),
	angle: 25.7,
	iterations: 5,
};

/**
 * Penrose Tiling (P3)
 */
export const penroseTiling: Preset = {
	name: 'Penrose Tiling',
	description: 'Aperiodic Penrose tiling pattern',
	grammar: quickGrammar('[N]++[N]++[N]++[N]++[N]', {
		M: 'OF++PF----NF[-OF----MF]++',
		N: '+OF--PF[---MF--NF]+',
		O: '-MF++NF[+++OF++PF]-',
		P: '--OF++++MF[+PF++++NF]--NF',
		F: '',
	}),
	angle: 36,
	iterations: 4,
};

/**
 * Quadratic Koch Island
 */
export const quadraticKoch: Preset = {
	name: 'Quadratic Koch',
	description: 'Quadratic Koch island',
	grammar: quickGrammar('F+F+F+F', {
		F: 'F+F-F-FF+F+F-F',
	}),
	angle: 90,
	iterations: 3,
};

/**
 * Crystal
 */
export const crystal: Preset = {
	name: 'Crystal',
	description: 'Crystal-like growth pattern',
	grammar: quickGrammar('F+F+F+F', {
		F: 'FF+F++F+F',
	}),
	angle: 90,
	iterations: 4,
};

/**
 * Lévy C Curve
 */
export const levyCurve: Preset = {
	name: 'Lévy C Curve',
	description: 'Self-similar fractal curve',
	grammar: quickGrammar('F', {
		F: '+F--F+',
	}),
	angle: 45,
	iterations: 12,
};

/**
 * 32-Segment Curve
 */
export const segment32: Preset = {
	name: '32-Segment Curve',
	description: 'Detailed fractal edge replacement',
	grammar: quickGrammar('F+F+F+F', {
		F: '-F+F-F-F+F+FF-F+F+FF+F-F-FF+FF-FF+F+F-FF-F-F+FF-F-F+F+F-F+',
	}),
	angle: 90,
	iterations: 2,
};

/**
 * Board Pattern
 */
export const boardPattern: Preset = {
	name: 'Board Pattern',
	description: 'Grid-like fractal pattern',
	grammar: quickGrammar('F+F+F+F', {
		F: 'FF+F+F+F+FF',
	}),
	angle: 90,
	iterations: 4,
};

/**
 * Parametric Tree - branches taper with depth
 */
export const parametricTree: Preset = {
	name: 'Parametric Tree',
	description: 'Tree with tapering branches using parameters',
	grammar: {
		axiom: [{ id: 'A', params: [10] }],
		rules: [],
		parametricRules: [
			{
				predecessor: 'A',
				params: ['l'],
				condition: { type: 'binary', op: '>', left: { type: 'variable', name: 'l' }, right: { type: 'number', value: 1 } },
				successor: [
					{ symbol: 'F', params: [{ type: 'variable', name: 'l' }] },
					{ symbol: '[', params: [] },
					{ symbol: '+', params: [{ type: 'number', value: 25 }] },
					{ symbol: 'A', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 'l' }, right: { type: 'number', value: 0.7 } }] },
					{ symbol: ']', params: [] },
					{ symbol: '[', params: [] },
					{ symbol: '-', params: [{ type: 'number', value: 25 }] },
					{ symbol: 'A', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 'l' }, right: { type: 'number', value: 0.7 } }] },
					{ symbol: ']', params: [] },
				],
			},
			{
				predecessor: 'A',
				params: ['l'],
				successor: [
					{ symbol: 'F', params: [{ type: 'variable', name: 'l' }] },
				],
			},
		],
	},
	angle: 25,
	iterations: 8,
};

/**
 * Parametric Bush - asymmetric branching
 */
export const parametricBush: Preset = {
	name: 'Parametric Bush',
	description: 'Bush with asymmetric parametric branching',
	grammar: {
		axiom: [{ id: 'F', params: [8] }],
		rules: [],
		parametricRules: [
			{
				predecessor: 'F',
				params: ['s'],
				condition: { type: 'binary', op: '>=', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 1 } },
				successor: [
					{ symbol: 'F', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.6 } }] },
					{ symbol: '+', params: [] },
					{ symbol: '[', params: [] },
					{ symbol: '+', params: [] },
					{ symbol: 'F', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.5 } }] },
					{ symbol: ']', params: [] },
					{ symbol: '-', params: [] },
					{ symbol: '-', params: [] },
					{ symbol: 'F', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.8 } }] },
					{ symbol: '[', params: [] },
					{ symbol: '-', params: [] },
					{ symbol: 'F', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.4 } }] },
					{ symbol: ']', params: [] },
					{ symbol: '+', params: [] },
					{ symbol: 'F', params: [{ type: 'binary', op: '*', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.5 } }] },
				],
			},
		],
	},
	angle: 22,
	iterations: 5,
};

/**
 * Spiral with decreasing step
 */
export const parametricSpiral: Preset = {
	name: 'Parametric Spiral',
	description: 'Spiral with decreasing step size',
	grammar: {
		axiom: [{ id: 'A', params: [15] }],
		rules: [],
		parametricRules: [
			{
				predecessor: 'A',
				params: ['s'],
				condition: { type: 'binary', op: '>', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.3 } },
				successor: [
					{ symbol: 'F', params: [{ type: 'variable', name: 's' }] },
					{ symbol: '+', params: [] },
					{ symbol: 'A', params: [
						{ type: 'binary', op: '*', left: { type: 'variable', name: 's' }, right: { type: 'number', value: 0.97 } },
					]},
				],
			},
		],
	},
	angle: 15,
	iterations: 100,
};

/**
 * All presets as array
 */
export const allPresets: Preset[] = [
	kochSnowflake,
	kochCurve,
	dragonCurve,
	sierpinskiTriangle,
	sierpinskiArrowhead,
	hilbertCurve,
	gosperCurve,
	binaryTree,
	plant1,
	plant2,
	penroseTiling,
	quadraticKoch,
	crystal,
	levyCurve,
	segment32,
	boardPattern,
	parametricTree,
	parametricBush,
	parametricSpiral,
];

/**
 * Get preset by name
 */
export function getPreset(name: string): Preset | undefined {
	return allPresets.find((p) => p.name.toLowerCase() === name.toLowerCase());
}
