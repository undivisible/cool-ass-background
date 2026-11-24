export const DEFAULT_PALETTE = ['#183342', '#497889', '#b4bca0', '#dca56c', '#602d40'];

export function parsePalette(colors) {
  if (!Array.isArray(colors) || colors.length !== 5 ||
      !colors.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) {
    throw new TypeError('Expected exactly five #rrggbb colors');
  }
  return colors.flatMap(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255));
}

export class PaletteTransition {
  constructor(colors = DEFAULT_PALETTE, duration = 1800) {
    if (!Number.isFinite(duration) || duration < 0) throw new TypeError('Invalid fade duration');
    this.from = this.to = parsePalette(colors);
    this.start = 0;
    this.duration = duration;
  }
  at(now) {
    const progress = this.duration === 0 ? 1 : Math.min(1, Math.max(0, (now - this.start) / this.duration));
    const weight = progress * progress * (3 - 2 * progress);
    return this.from.map((c, i) => c + (this.to[i] - c) * weight);
  }
  set(colors, now) {
    const next = parsePalette(colors);
    this.from = this.at(now);
    this.to = next;
    this.start = now;
  }
}

// Quantized frequency buckets keep this cheap and deterministic for small artwork.
export function paletteFromPixels(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]].map(c => Math.min(255, Math.round(c / 32) * 32));
    const key = rgb.map(c => c.toString(16).padStart(2, '0')).join('');
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const ranked = [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => `#${key}`);
  if (!ranked.length) return [...DEFAULT_PALETTE];
  while (ranked.length < 5) ranked.push(ranked[ranked.length - 1]);
  return ranked.sort((a, b) => luminance(a) - luminance(b));
}
function luminance(hex) {
  return [1, 3, 5].reduce((sum, i, n) => sum + parseInt(hex.slice(i, i + 2), 16) * [0.299, 0.587, 0.114][n], 0);
}
