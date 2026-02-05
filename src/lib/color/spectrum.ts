/**
 * Color Spectrum System
 * Flexible gradient-based color system for L-system visualization
 */

/** A single stop in a color gradient */
export interface ColorStop {
	position: number;  // 0-1, position along the gradient
	color: [number, number, number];  // RGB values (0-1 range)
}

/** Types of color spectrums */
export type SpectrumType = 'preset' | 'two-color' | 'multi-stop';

/** Color spectrum definition */
export interface ColorSpectrum {
	type: SpectrumType;
	name?: string;  // Name for preset spectrums
	stops: ColorStop[];
}

/**
 * Sample a color from a spectrum at position t (0-1)
 * Uses linear interpolation between stops
 */
export function sampleSpectrum(spectrum: ColorSpectrum, t: number): [number, number, number] {
	const { stops } = spectrum;
	
	// Edge cases
	if (stops.length === 0) return [0.5, 0.5, 0.5];
	if (stops.length === 1) return [...stops[0].color] as [number, number, number];
	
	// Clamp t to [0, 1]
	t = Math.max(0, Math.min(1, t));
	
	// Find the two stops to interpolate between
	let left = stops[0];
	let right = stops[stops.length - 1];
	
	for (let i = 0; i < stops.length - 1; i++) {
		if (t >= stops[i].position && t <= stops[i + 1].position) {
			left = stops[i];
			right = stops[i + 1];
			break;
		}
	}
	
	// Calculate interpolation factor
	const range = right.position - left.position;
	const factor = range > 0 ? (t - left.position) / range : 0;
	
	// Linear interpolation
	return [
		left.color[0] + (right.color[0] - left.color[0]) * factor,
		left.color[1] + (right.color[1] - left.color[1]) * factor,
		left.color[2] + (right.color[2] - left.color[2]) * factor,
	];
}

/**
 * Create a two-color gradient spectrum
 */
export function createTwoColorSpectrum(
	startColor: [number, number, number],
	endColor: [number, number, number],
	name?: string
): ColorSpectrum {
	return {
		type: 'two-color',
		name,
		stops: [
			{ position: 0, color: startColor },
			{ position: 1, color: endColor },
		],
	};
}

/**
 * Create a multi-stop gradient spectrum
 */
export function createMultiStopSpectrum(
	stops: ColorStop[],
	name?: string
): ColorSpectrum {
	// Sort stops by position
	const sortedStops = [...stops].sort((a, b) => a.position - b.position);
	
	return {
		type: 'multi-stop',
		name,
		stops: sortedStops,
	};
}

/**
 * Convert hex color to RGB array (0-1 range)
 */
export function hexToRgb(hex: string): [number, number, number] {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return [0.5, 0.5, 0.5];
	return [
		parseInt(result[1], 16) / 255,
		parseInt(result[2], 16) / 255,
		parseInt(result[3], 16) / 255,
	];
}

/**
 * Convert RGB array (0-1 range) to hex color
 */
export function rgbToHex(rgb: [number, number, number]): string {
	const toHex = (n: number) => {
		const hex = Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	};
	return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/**
 * Convert HSL to RGB (h: 0-360, s: 0-1, l: 0-1)
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
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
 * Create a rainbow spectrum using HSL interpolation
 */
export function createRainbowSpectrum(): ColorSpectrum {
	const stops: ColorStop[] = [];
	const numStops = 7;
	
	for (let i = 0; i < numStops; i++) {
		const t = i / (numStops - 1);
		const hue = t * 300; // 0-300 to avoid wrapping back to red
		stops.push({
			position: t,
			color: hslToRgb(hue, 0.8, 0.5),
		});
	}
	
	return {
		type: 'preset',
		name: 'Rainbow',
		stops,
	};
}

/**
 * Default spectrum (for backwards compatibility)
 * Matches the previous depth-based HSL coloring
 */
export function createDefaultSpectrum(): ColorSpectrum {
	return createRainbowSpectrum();
}
