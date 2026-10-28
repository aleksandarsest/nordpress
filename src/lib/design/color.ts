// Color math for site designs: parsing, WCAG contrast, and OKLCH, a color
// space where changing lightness keeps the hue looking the same. Pure.

export type Rgb = [number, number, number];

export function parseHex(input: string): Rgb | null {
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function toHex([r, g, b]: Rgb) {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Oklch = { l: number; c: number; h: number };

export function toOklch(hex: string): Oklch {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map(toLinear);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** OKLCH to hex, lowering chroma until the color fits in sRGB. */
export function fromOklch(color: Oklch) {
  let c = color.c;
  for (let i = 0; i < 30; i++) {
    const rgb = oklchToLinear({ ...color, c });
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005))
      return toHex(
        rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb,
      );
    c *= 0.9;
  }
  return toHex(
    oklchToLinear({ ...color, c: 0 }).map((v) =>
      fromLinear(Math.min(1, Math.max(0, v))),
    ) as Rgb,
  );
}

/** The same hue at another lightness (0–1) and, optionally, chroma. */
export function shade(hex: string, l: number, c?: number) {
  const o = toOklch(hex);
  return fromOklch({ l, c: c ?? o.c, h: o.h });
}

/**
 * `fg` darkened or lightened just enough to reach `ratio` against `bg`,
 * keeping its hue. Brand colors stay recognizable but always readable.
 */
export function ensureContrast(fg: string, bg: string, ratio: number) {
  if (contrast(fg, bg) >= ratio) return fg;
  const o = toOklch(fg);
  const darker = luminance(bg) > 0.5;
  for (let step = 1; step <= 50; step++) {
    const l = darker ? o.l - step * 0.02 : o.l + step * 0.02;
    const candidate = fromOklch({ ...o, l: Math.min(1, Math.max(0, l)) });
    if (contrast(candidate, bg) >= ratio) return candidate;
  }
  return darker ? "#000000" : "#ffffff";
}

/** Near-white or near-black text, whichever reads better on `bg`. */
export function textOn(bg: string) {
  const dark = "#111318";
  const light = "#ffffff";
  return contrast(dark, bg) >= contrast(light, bg) ? dark : light;
}
