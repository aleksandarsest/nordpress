import { describe, expect, it } from "vitest";
import {
  contrast,
  ensureContrast,
  fromOklch,
  parseHex,
  toHex,
  toOklch,
} from "./color";
import { brandFromPixels } from "./extract";
import {
  DEFAULT_DESIGN,
  designSchema,
  designVars,
  PRESETS,
  palette,
  readDesign,
  type SiteDesign,
  shuffleDesign,
} from "./index";

describe("color", () => {
  it("parses and prints hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("3b82f6")).toEqual([59, 130, 246]);
    expect(parseHex("blue")).toBeNull();
    expect(toHex([59, 130, 246])).toBe("#3b82f6");
  });

  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("round-trips through OKLCH", () => {
    for (const color of ["#3b82f6", "#b5542d", "#2f855a", "#111111", "#fafafa"])
      expect(contrast(fromOklch(toOklch(color)), color)).toBeLessThan(1.02);
  });

  it("adjusts a color until it reads, keeping its hue", () => {
    const yellow = "#f5d000";
    const fixed = ensureContrast(yellow, "#ffffff", 4.5);
    expect(contrast(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(toOklch(fixed).h - toOklch(yellow).h)).toBeLessThan(12);
  });
});

// Every preset and a range of awkward brand colors, in both modes
const brands = [
  "#5e81ac",
  "#ffff00",
  "#00ff00",
  "#ffffff",
  "#000000",
  "#e2b714",
  "#db2777",
];
const designs: SiteDesign[] = [
  ...Object.values(PRESETS).map((p) => p.design),
  ...brands.flatMap((brand) =>
    (["light", "dark"] as const).flatMap((mode) =>
      (["plain", "brand", "contrast"] as const).map((header) => ({
        ...DEFAULT_DESIGN,
        brand,
        mode,
        header,
      })),
    ),
  ),
];

describe("palette", () => {
  it("is always readable", () => {
    for (const d of designs) {
      const p = palette(d);
      const label = `${d.brand} ${d.mode} ${d.header}`;
      expect(contrast(p.text, p.bg), label).toBeGreaterThanOrEqual(7);
      expect(contrast(p.text, p.surface), label).toBeGreaterThanOrEqual(7);
      expect(contrast(p.muted, p.bg), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.link, p.bg), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.onAccent, p.accent), label).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.headerText, p.headerBg), label).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("keeps a usable brand color as the accent", () => {
    expect(palette({ ...DEFAULT_DESIGN, brand: "#5e81ac" }).accent).toBe(
      "#5e81ac",
    );
  });

  it("makes a dark site dark", () => {
    const p = palette({ ...DEFAULT_DESIGN, mode: "dark" });
    expect(toOklch(p.bg).l).toBeLessThan(0.3);
    expect(toOklch(p.text).l).toBeGreaterThan(0.85);
  });
});

describe("designs", () => {
  it("all presets are valid", () => {
    for (const p of Object.values(PRESETS))
      expect(designSchema.parse(p.design)).toEqual(p.design);
  });

  it("falls back to the default for missing or old data", () => {
    expect(readDesign(null)).toEqual(DEFAULT_DESIGN);
    expect(readDesign({ brand: "red" })).toEqual(DEFAULT_DESIGN);
  });

  it("turns a design into CSS variables", () => {
    const vars = designVars(PRESETS.bakery.design);
    expect(vars["--d-font-heading"]).toBe("var(--font-dmSerif)");
    expect(vars["--d-button-radius"]).toBe("999px");
    expect(vars["--d-accent"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("shuffles into another valid design with the same brand", () => {
    let seed = 1;
    // A seeded generator, so the test is the same every run
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 20; i++) {
      const next = shuffleDesign(PRESETS.fresh.design, random);
      expect(designSchema.parse(next).brand).toBe("#2f855a");
    }
  });
});

describe("brandFromPixels", () => {
  const pixels = (colors: [number, number, number, number][], each: number) =>
    colors.flatMap((c) => Array.from({ length: each }, () => c)).flat();

  it("picks the main color, ignoring white, black and transparent", () => {
    const logo = pixels(
      [
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [200, 60, 40, 255],
        [30, 120, 200, 0],
      ],
      100,
    );
    const brand = brandFromPixels(logo);
    expect(brand).not.toBeNull();
    expect(
      Math.abs(toOklch(brand as string).h - toOklch("#c83c28").h),
    ).toBeLessThan(5);
  });

  it("returns nothing for a black and white logo", () => {
    expect(
      brandFromPixels(
        pixels(
          [
            [255, 255, 255, 255],
            [10, 10, 10, 255],
          ],
          50,
        ),
      ),
    ).toBeNull();
  });
});
