import { z } from "zod";
import {
  contrast,
  ensureContrast,
  fromOklch,
  parseHex,
  textOn,
  toOklch,
} from "./color";

// A site's design: a handful of choices (brand color, fonts, shapes, layout)
// that the Studio theme turns into CSS variables. Choices, not raw values,
// so every combination looks deliberate and stays readable. Pure.

export const FONT_PAIRINGS = {
  modern: { label: "Modern", heading: "inter", body: "inter" },
  editorial: { label: "Editorial", heading: "fraunces", body: "inter" },
  classic: { label: "Classic", heading: "playfair", body: "sourceSerif" },
  friendly: { label: "Friendly", heading: "nunito", body: "nunito" },
  tech: { label: "Technical", heading: "spaceGrotesk", body: "inter" },
  elegant: { label: "Elegant", heading: "cormorant", body: "lato" },
  bold: { label: "Bold", heading: "archivoBlack", body: "archivo" },
  warm: { label: "Warm", heading: "dmSerif", body: "dmSans" },
} as const;

export type FontPairing = keyof typeof FONT_PAIRINGS;
export type FontKey = (typeof FONT_PAIRINGS)[FontPairing][keyof Omit<
  (typeof FONT_PAIRINGS)[FontPairing],
  "label"
>];

const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a color like #3b82f6.")
  .transform((s) => s.toLowerCase());

export const designSchema = z.object({
  preset: z.string().max(40).default("custom"),
  mode: z.enum(["light", "dark"]),
  brand: hex,
  /** How the backgrounds lean: plain grey, warm, cool, or towards the brand. */
  tint: z.enum(["neutral", "warm", "cool", "brand"]),
  /** The header's background. */
  header: z.enum(["plain", "brand", "contrast"]),
  fonts: z.enum(Object.keys(FONT_PAIRINGS) as [FontPairing, ...FontPairing[]]),
  size: z.enum(["s", "m", "l"]),
  radius: z.enum(["none", "soft", "round"]),
  buttons: z.enum(["solid", "outline", "pill"]),
  width: z.enum(["narrow", "normal", "wide"]),
  /** Logo and menu: side by side, centered, or the menu on its own row. */
  headerLayout: z.enum(["split", "centered", "stacked"]),
  density: z.enum(["compact", "comfortable", "airy"]),
  /** How post lists look. */
  posts: z.enum(["cards", "list", "magazine"]),
});

export type SiteDesign = z.infer<typeof designSchema>;

export const PRESETS: Record<string, { label: string; design: SiteDesign }> = {
  nordic: {
    label: "Nordic",
    design: {
      preset: "nordic",
      mode: "light",
      brand: "#5e81ac",
      tint: "cool",
      header: "contrast",
      fonts: "modern",
      size: "m",
      radius: "soft",
      buttons: "solid",
      width: "normal",
      headerLayout: "split",
      density: "comfortable",
      posts: "cards",
    },
  },
  bakery: {
    label: "Bakery",
    design: {
      preset: "bakery",
      mode: "light",
      brand: "#b5542d",
      tint: "warm",
      header: "plain",
      fonts: "warm",
      size: "m",
      radius: "round",
      buttons: "pill",
      width: "normal",
      headerLayout: "centered",
      density: "airy",
      posts: "cards",
    },
  },
  noir: {
    label: "Noir",
    design: {
      preset: "noir",
      mode: "dark",
      brand: "#e2b714",
      tint: "neutral",
      header: "plain",
      fonts: "editorial",
      size: "l",
      radius: "none",
      buttons: "outline",
      width: "wide",
      headerLayout: "split",
      density: "airy",
      posts: "magazine",
    },
  },
  fresh: {
    label: "Fresh",
    design: {
      preset: "fresh",
      mode: "light",
      brand: "#2f855a",
      tint: "brand",
      header: "brand",
      fonts: "friendly",
      size: "m",
      radius: "round",
      buttons: "solid",
      width: "normal",
      headerLayout: "split",
      density: "comfortable",
      posts: "cards",
    },
  },
  elegant: {
    label: "Elegant",
    design: {
      preset: "elegant",
      mode: "light",
      brand: "#7b4f74",
      tint: "warm",
      header: "plain",
      fonts: "elegant",
      size: "l",
      radius: "none",
      buttons: "outline",
      width: "narrow",
      headerLayout: "stacked",
      density: "airy",
      posts: "list",
    },
  },
  tech: {
    label: "Tech",
    design: {
      preset: "tech",
      mode: "dark",
      brand: "#8b7cf6",
      tint: "cool",
      header: "plain",
      fonts: "tech",
      size: "m",
      radius: "soft",
      buttons: "solid",
      width: "wide",
      headerLayout: "split",
      density: "compact",
      posts: "cards",
    },
  },
  newspaper: {
    label: "Newspaper",
    design: {
      preset: "newspaper",
      mode: "light",
      brand: "#1d4ed8",
      tint: "neutral",
      header: "plain",
      fonts: "classic",
      size: "m",
      radius: "none",
      buttons: "solid",
      width: "wide",
      headerLayout: "stacked",
      density: "compact",
      posts: "magazine",
    },
  },
  playful: {
    label: "Playful",
    design: {
      preset: "playful",
      mode: "light",
      brand: "#db2777",
      tint: "brand",
      header: "plain",
      fonts: "bold",
      size: "m",
      radius: "round",
      buttons: "pill",
      width: "normal",
      headerLayout: "centered",
      density: "comfortable",
      posts: "cards",
    },
  },
};

export const DEFAULT_DESIGN: SiteDesign = PRESETS.nordic.design;

/** A saved design, or the default when it's missing or out of date. */
export function readDesign(input: unknown): SiteDesign {
  const parsed = designSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_DESIGN;
}

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  link: string;
  headerBg: string;
  headerText: string;
  headerMuted: string;
};

// Background hue and chroma for each tint
function backgroundBase(d: SiteDesign) {
  const brand = toOklch(d.brand);
  switch (d.tint) {
    case "warm":
      return { h: 70, c: 0.018 };
    case "cool":
      return { h: 250, c: 0.016 };
    case "brand":
      return { h: brand.h, c: Math.min(0.03, brand.c * 0.25) };
    default:
      return { h: brand.h, c: 0.003 };
  }
}

/**
 * Every color the theme uses, derived from the brand color and mode. Text,
 * links and buttons always reach WCAG AA contrast (4.5:1) on their background.
 */
export function palette(d: SiteDesign): Palette {
  const base = backgroundBase(d);
  const light = d.mode === "light";
  const bg = shadeOf(base, light ? 0.985 : 0.19);
  const surface = shadeOf(base, light ? 1 : 0.235);
  const surface2 = shadeOf(base, light ? 0.955 : 0.28);
  const text = shadeOf(
    { h: base.h, c: Math.min(base.c, 0.02) },
    light ? 0.24 : 0.94,
  );
  const muted = ensureContrast(
    shadeOf({ h: base.h, c: Math.min(base.c, 0.02) }, light ? 0.5 : 0.72),
    bg,
    4.5,
  );
  const border = shadeOf(base, light ? 0.9 : 0.34);
  // The brand color as given for buttons, text on it chosen to read well;
  // a brand color too close to the background is pushed until it stands out
  const accent =
    contrast(d.brand, bg) >= 1.6 ? d.brand : ensureContrast(d.brand, bg, 3);
  const onAccent = textOn(accent);
  const link = ensureContrast(d.brand, bg, 4.5);
  const headerBg =
    d.header === "brand"
      ? accent
      : d.header === "contrast"
        ? shadeOf(
            { h: base.h, c: Math.min(base.c * 2, 0.04) },
            light ? 0.26 : 0.12,
          )
        : bg;
  const headerText = d.header === "plain" ? text : textOn(headerBg);
  const headerMuted = d.header === "plain" ? muted : headerText;
  return {
    bg,
    surface,
    surface2,
    text,
    muted,
    border,
    accent,
    onAccent,
    link,
    headerBg,
    headerText,
    headerMuted,
  };
}

// A color at lightness `l` with the base's hue and chroma
const shadeOf = (base: { h: number; c: number }, l: number) =>
  fromOklch({ l, c: base.c, h: base.h });

const RADIUS = { none: "0px", soft: "10px", round: "22px" };
const BUTTON_RADIUS = { solid: null, outline: null, pill: "999px" };
const BASE_SIZE = { s: "15px", m: "17px", l: "18.5px" };
const WIDTH = { narrow: "44rem", normal: "64rem", wide: "78rem" };
const SPACE = { compact: "0.75", comfortable: "1", airy: "1.35" };

/** CSS custom properties for the design, set on the site's root element. */
export function designVars(d: SiteDesign): Record<string, string> {
  const p = palette(d);
  const fonts = FONT_PAIRINGS[d.fonts];
  return {
    "--d-bg": p.bg,
    "--d-surface": p.surface,
    "--d-surface-2": p.surface2,
    "--d-text": p.text,
    "--d-muted": p.muted,
    "--d-border": p.border,
    "--d-accent": p.accent,
    "--d-on-accent": p.onAccent,
    "--d-link": p.link,
    "--d-header-bg": p.headerBg,
    "--d-header-text": p.headerText,
    "--d-header-muted": p.headerMuted,
    "--d-font-heading": `var(--font-${fonts.heading})`,
    "--d-font-body": `var(--font-${fonts.body})`,
    "--d-size": BASE_SIZE[d.size],
    "--d-radius": RADIUS[d.radius],
    "--d-button-radius": BUTTON_RADIUS[d.buttons] ?? RADIUS[d.radius],
    "--d-width": WIDTH[d.width],
    "--d-space": SPACE[d.density],
    "color-scheme": d.mode,
  };
}

/** Attributes that switch layouts in the theme's CSS. */
export function designAttributes(d: SiteDesign) {
  return {
    "data-header": d.headerLayout,
    "data-buttons": d.buttons,
    "data-posts": d.posts,
    "data-mode": d.mode,
  };
}

export function designStyle(d: SiteDesign) {
  return Object.entries(designVars(d))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/** A different, still coherent design: keeps the brand color, varies the rest. */
export function shuffleDesign(d: SiteDesign, random = Math.random): SiteDesign {
  const pick = <T>(options: readonly T[]) =>
    options[Math.floor(random() * options.length)];
  return {
    ...d,
    preset: "custom",
    tint: pick(["neutral", "warm", "cool", "brand"] as const),
    header: pick(["plain", "brand", "contrast"] as const),
    fonts: pick(Object.keys(FONT_PAIRINGS) as FontPairing[]),
    radius: pick(["none", "soft", "round"] as const),
    buttons: pick(["solid", "outline", "pill"] as const),
    headerLayout: pick(["split", "centered", "stacked"] as const),
    density: pick(["compact", "comfortable", "airy"] as const),
    posts: pick(["cards", "list", "magazine"] as const),
  };
}

/** Whether a typed color is usable. */
export const isHexColor = (s: string) => parseHex(s) !== null && /^#/.test(s);

export const PRESET_KEYS = Object.keys(PRESETS) as [string, ...string[]];
