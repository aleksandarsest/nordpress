// Installed themes. To install one, add its folder under src/themes and list
// it here; switch themes under Admin → Appearance → Themes.
import type { ThemeDefinition } from "@/lib/themes/types";
import classic from "./classic";

export const installedThemes: ThemeDefinition[] = [classic];
