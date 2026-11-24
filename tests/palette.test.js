import { test, expect } from 'bun:test';
import { PaletteTransition, parsePalette, paletteFromPixels, DEFAULT_PALETTE } from '../src/palette.js';
import presets from '../src/presets.json';
test('crossfades to all channels and interruptions start from the displayed color', () => {
  const black = Array(5).fill('#000000');
  const colors = ['#ff0080','#102030','#00ff00','#ffffff','#0000ff'];
  const p = new PaletteTransition(black, 1000);
  p.set(colors, 100);
  expect(p.at(100)).toEqual(Array(15).fill(0));
  expect(p.at(600)).toEqual(parsePalette(colors).map(c => c / 2));
  expect(p.at(1100)).toEqual(parsePalette(colors));
  p.set(black, 1100);
  const halfway = p.at(1600);
  p.set(colors, 1600);
  expect(p.at(1600)).toEqual(halfway);
  expect(p.at(2600)).toEqual(parsePalette(colors));
});
test('zero-duration reduced motion settles immediately; invalid palette is rejected atomically', () => {
  const p = new PaletteTransition(DEFAULT_PALETTE, 0);
  p.set(presets.Nord, 5);
  expect(p.at(5)).toEqual(parsePalette(presets.Nord));
  expect(() => p.set(['red'], 6)).toThrow();
  expect(p.at(6)).toEqual(parsePalette(presets.Nord));
});
test('presets are valid; artwork extraction keeps discrete accents, not an average', () => {
  Object.values(presets).forEach(p => expect(parsePalette(p)).toHaveLength(15));
  const pixels = new Uint8ClampedArray([0,0,255,255, 0,0,255,255, 255,0,0,255, 0,255,0,255, 255,0,255,255, 0,255,255,255]);
  const colors = paletteFromPixels(pixels);
  expect(new Set(colors).size).toBe(5);
  expect(colors).toContain('#0000ff'); expect(colors).toContain('#ff0000');
  expect(paletteFromPixels(new Uint8ClampedArray([255,0,0,0]))).toEqual(DEFAULT_PALETTE);
});
