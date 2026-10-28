// Installed themes. To install one, add its folder under src/themes and list
// it here; switch themes under Admin → Appearance → Themes.
import type { ThemeDefinition } from "@/lib/themes/types";
import classic from "./classic";
import nord from "./nord";
import studio from "./studio";

export const installedThemes: ThemeDefinition[] = [studio, classic, nord];
