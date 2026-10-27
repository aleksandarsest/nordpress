import { defineTheme } from "@/lib/themes/types";
import { nordComponents } from "./components";

export default defineTheme({
  slug: "nord",
  name: "Nord",
  version: "1.0.0",
  description:
    "A calm, arctic theme with a dark header, card grid and the Nord color palette.",
  author: "Nordpress",
  menuLocations: { primary: "Header menu", footer: "Footer menu" },
  settings: [
    {
      type: "select",
      key: "accent",
      label: "Accent color",
      default: "frost",
      options: [
        { value: "frost", label: "Frost blue" },
        { value: "green", label: "Aurora green" },
        { value: "purple", label: "Aurora purple" },
        { value: "orange", label: "Aurora orange" },
        { value: "red", label: "Aurora red" },
      ],
    },
    {
      type: "select",
      key: "listLayout",
      label: "Post list layout",
      default: "grid",
      options: [
        { value: "grid", label: "Two-column cards" },
        { value: "list", label: "Single column" },
      ],
    },
    {
      type: "checkbox",
      key: "featuredOnSingle",
      label: "Show the featured image at the top of posts",
      default: true,
    },
    {
      type: "text",
      key: "footerText",
      label: "Footer text",
      help: "Leave empty for “© Site title”.",
      default: "",
    },
  ],
  components: nordComponents,
});
