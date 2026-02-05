/**
 * Preset Color Spectrums
 * Curated gradient palettes for L-system visualization
 */

import type { ColorSpectrum, ColorStop } from './spectrum';
import { hslToRgb, hexToRgb } from './spectrum';

/** Helper to create a spectrum from hex colors */
function createPreset(name: string, hexColors: string[]): ColorSpectrum {
	const stops: ColorStop[] = hexColors.map((hex, i) => ({
		position: i / (hexColors.length - 1),
		color: hexToRgb(hex),
	}));
	
	return {
		type: 'preset',
		name,
		stops,
	};
}

// ============ Nature-Inspired Gradients ============

/** Forest: Dark brown -> Green -> Light green */
export const forest: ColorSpectrum = createPreset('Forest', [
	'#3d2817',  // Dark brown (trunk)
	'#4a6741',  // Dark green
	'#6b8e23',  // Olive green
	'#90c944',  // Light green
	'#c5e17a',  // Pale green (new growth)
]);

/** Autumn: Brown -> Orange -> Yellow -> Red */
export const autumn: ColorSpectrum = createPreset('Autumn', [
	'#4a3728',  // Dark brown
	'#8b4513',  // Saddle brown
	'#d2691e',  // Chocolate
	'#ff8c00',  // Dark orange
	'#ffd700',  // Gold
	'#ff4500',  // Orange red
]);

/** Ocean: Deep blue -> Cyan -> White (foam) */
export const ocean: ColorSpectrum = createPreset('Ocean', [
	'#0a1628',  // Midnight blue
	'#1a4b6d',  // Deep sea blue
	'#2e8b9a',  // Teal
	'#48d1cc',  // Medium turquoise
	'#87ceeb',  // Sky blue
	'#e0ffff',  // Light cyan (foam)
]);

/** Earth: Browns and greens */
export const earth: ColorSpectrum = createPreset('Earth', [
	'#2c1810',  // Dark soil
	'#5c4033',  // Brown earth
	'#8b7355',  // Tan
	'#6b8e23',  // Olive drab
	'#556b2f',  // Dark olive green
]);

/** Coral: Pinks, oranges, teals */
export const coral: ColorSpectrum = createPreset('Coral', [
	'#ff6b6b',  // Coral pink
	'#ffa07a',  // Light salmon
	'#ff7f50',  // Coral
	'#40e0d0',  // Turquoise
	'#20b2aa',  // Light sea green
]);

// ============ Sky/Atmosphere Gradients ============

/** Sunset: Purple -> Orange -> Pink -> Yellow */
export const sunset: ColorSpectrum = createPreset('Sunset', [
	'#2c003e',  // Deep purple
	'#7b2869',  // Dark magenta
	'#f85f73',  // Coral
	'#ff9a56',  // Orange
	'#ffb627',  // Amber
	'#ffe66d',  // Light yellow
]);

/** Sunrise: Deep blue -> Pink -> Orange -> Yellow */
export const sunrise: ColorSpectrum = createPreset('Sunrise', [
	'#0d1b2a',  // Night blue
	'#1b263b',  // Dark blue
	'#6b2d5c',  // Plum
	'#f55d3e',  // Vermillion
	'#f7a072',  // Coral
	'#ffc857',  // Yellow
]);

/** Northern Lights: Dark to vibrant greens and purples */
export const northernLights: ColorSpectrum = createPreset('Northern Lights', [
	'#0a0a14',  // Night sky
	'#1a472a',  // Dark green
	'#32cd32',  // Lime green
	'#00fa9a',  // Medium spring green
	'#9370db',  // Medium purple
	'#4169e1',  // Royal blue
]);

// ============ Fire/Energy Gradients ============

/** Fire: Black -> Red -> Orange -> Yellow -> White */
export const fire: ColorSpectrum = createPreset('Fire', [
	'#1a0a00',  // Near black
	'#660000',  // Dark red
	'#cc3300',  // Red
	'#ff6600',  // Orange
	'#ffcc00',  // Yellow
	'#ffffcc',  // Pale yellow (hot core)
]);

/** Lava: Deep red to bright orange */
export const lava: ColorSpectrum = createPreset('Lava', [
	'#1a0500',  // Near black
	'#4a0e0e',  // Dark red
	'#8b0000',  // Dark red
	'#dc143c',  // Crimson
	'#ff4500',  // Orange red
	'#ff8c00',  // Dark orange
]);

/** Electric: Dark blue to cyan to white */
export const electric: ColorSpectrum = createPreset('Electric', [
	'#000033',  // Dark blue
	'#0066ff',  // Blue
	'#00ccff',  // Cyan
	'#00ffff',  // Aqua
	'#ccffff',  // Light cyan
	'#ffffff',  // White
]);

// ============ Classic/Neutral Gradients ============

/** Monochrome: Black -> White */
export const monochrome: ColorSpectrum = createPreset('Monochrome', [
	'#000000',  // Black
	'#404040',  // Dark gray
	'#808080',  // Gray
	'#c0c0c0',  // Silver
	'#ffffff',  // White
]);

/** Sepia: Vintage tones */
export const sepia: ColorSpectrum = createPreset('Sepia', [
	'#2b1810',  // Dark sepia
	'#704214',  // Brown
	'#a0522d',  // Sienna
	'#d2b48c',  // Tan
	'#f5deb3',  // Wheat
]);

/** Rainbow: Full spectrum (HSL-based) */
export const rainbow: ColorSpectrum = {
	type: 'preset',
	name: 'Rainbow',
	stops: [
		{ position: 0.0, color: hslToRgb(0, 0.8, 0.5) },    // Red
		{ position: 0.17, color: hslToRgb(60, 0.8, 0.5) },  // Yellow
		{ position: 0.33, color: hslToRgb(120, 0.8, 0.5) }, // Green
		{ position: 0.5, color: hslToRgb(180, 0.8, 0.5) },  // Cyan
		{ position: 0.67, color: hslToRgb(240, 0.8, 0.5) }, // Blue
		{ position: 0.83, color: hslToRgb(300, 0.8, 0.5) }, // Magenta
		{ position: 1.0, color: hslToRgb(360, 0.8, 0.5) },  // Red
	],
};

// ============ Vibrant/Artistic Gradients ============

/** Neon: Bright vibrant colors */
export const neon: ColorSpectrum = createPreset('Neon', [
	'#ff00ff',  // Magenta
	'#00ffff',  // Cyan
	'#00ff00',  // Lime
	'#ffff00',  // Yellow
	'#ff0066',  // Pink
]);

/** Pastel: Soft muted colors */
export const pastel: ColorSpectrum = createPreset('Pastel', [
	'#ffd1dc',  // Pink
	'#c5a3ff',  // Lavender
	'#a3d9ff',  // Light blue
	'#b5ffb5',  // Mint
	'#ffffa3',  // Cream
]);

/** Cyberpunk: Dark with neon accents */
export const cyberpunk: ColorSpectrum = createPreset('Cyberpunk', [
	'#0d0221',  // Deep purple-black
	'#0f084b',  // Dark blue
	'#26081c',  // Dark purple
	'#ff2a6d',  // Hot pink
	'#05d9e8',  // Cyan
	'#d1f7ff',  // Light cyan
]);

// ============ All Presets ============

/** All preset spectrums */
export const presetSpectrums: ColorSpectrum[] = [
	// Nature
	forest,
	autumn,
	ocean,
	earth,
	coral,
	// Sky
	sunset,
	sunrise,
	northernLights,
	// Fire
	fire,
	lava,
	electric,
	// Classic
	rainbow,
	monochrome,
	sepia,
	// Artistic
	neon,
	pastel,
	cyberpunk,
];

/** Get a preset spectrum by name */
export function getPresetSpectrum(name: string): ColorSpectrum | undefined {
	return presetSpectrums.find(s => s.name?.toLowerCase() === name.toLowerCase());
}

/** Default spectrum for initialization */
export const defaultSpectrum = forest;
