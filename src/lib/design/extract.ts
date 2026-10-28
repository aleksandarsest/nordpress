import { toHex, toOklch } from "./color";

// Picks a brand color from a logo's pixels: the most common color that isn't
// close to white, black or grey. Pure, so it runs in the browser on canvas
// data and in tests.

export function brandFromPixels(
  rgba: Uint8ClampedArray | number[],
): string | null {
  const buckets = new Map<
    string,
    { n: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    if (a < 128) continue;
    // Coarse buckets, so anti-aliased edges count towards their main color
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best: { score: number; hex: string } | null = null;
  for (const bucket of buckets.values()) {
    const hex = toHex([
      bucket.r / bucket.n,
      bucket.g / bucket.n,
      bucket.b / bucket.n,
    ]);
    const { l, c } = toOklch(hex);
    // Greys, near-white and near-black make poor brand colors
    if (c < 0.05 || l > 0.95 || l < 0.15) continue;
    const score = bucket.n * (0.5 + c);
    if (!best || score > best.score) best = { score, hex };
  }
  return best?.hex ?? null;
}
