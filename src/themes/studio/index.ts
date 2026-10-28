import { defineTheme } from "@/lib/themes/types";
import { studioComponents } from "./components";

export default defineTheme({
  slug: "studio",
  name: "Studio",
  version: "1.0.0",
  description:
    "Make it yours: colors, fonts, shapes and layout are set under Appearance → Design, with a live preview. Responsive and always readable.",
  author: "Nordpress",
  menuLocations: { primary: "Header menu", footer: "Footer menu" },
  settings: [],
  components: studioComponents,
});
