import { defineTheme } from "@/lib/themes/types";
import { classicComponents } from "./components";

export default defineTheme({
  slug: "classic",
  name: "Classic",
  version: "1.0.0",
  description: "A clean, single-column blog theme focused on reading.",
  author: "Nordpress",
  menuLocations: { primary: "Primary menu", footer: "Footer menu" },
  settings: [
    {
      type: "checkbox",
      key: "showTagline",
      label: "Show the tagline under the site title",
      default: true,
    },
    {
      type: "checkbox",
      key: "showAuthorBio",
      label: "Show the author's bio under posts",
      default: true,
    },
    {
      type: "text",
      key: "footerText",
      label: "Footer text",
      help: "Leave empty to show the site title.",
      default: "",
    },
  ],
  components: classicComponents,
});
