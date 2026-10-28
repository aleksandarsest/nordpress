import {
  Archivo,
  Archivo_Black,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Inter,
  Lato,
  Nunito,
  Playfair_Display,
  Source_Serif_4,
  Space_Grotesk,
} from "next/font/google";

// The fonts design pairings use (see lib/design FONT_PAIRINGS). next/font
// downloads them at build time and serves them from the site itself, so
// visitors' browsers never contact Google. None is preloaded: a site uses
// one pairing, and preloading all twelve would make every page announce
// every font file (a 3 KB header, past some proxies' limit) and download them.

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-inter",
});
const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-fraunces",
});
const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-playfair",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-sourceSerif",
});
const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-nunito",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-spaceGrotesk",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  preload: false,
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
});
const lato = Lato({
  subsets: ["latin", "latin-ext"],
  preload: false,
  weight: ["400", "700"],
  variable: "--font-lato",
});
const archivoBlack = Archivo_Black({
  subsets: ["latin", "latin-ext"],
  preload: false,
  weight: "400",
  variable: "--font-archivoBlack",
});
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-archivo",
});
const dmSerif = DM_Serif_Display({
  subsets: ["latin", "latin-ext"],
  preload: false,
  weight: "400",
  variable: "--font-dmSerif",
});
const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-dmSans",
});

/** Class names that define every pairing font's CSS variable. */
export const fontVariables = [
  inter,
  fraunces,
  playfair,
  sourceSerif,
  nunito,
  spaceGrotesk,
  cormorant,
  lato,
  archivoBlack,
  archivo,
  dmSerif,
  dmSans,
]
  .map((f) => f.variable)
  .join(" ");
