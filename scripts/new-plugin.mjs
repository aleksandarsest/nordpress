// Scaffolds a plugin: pnpm new:plugin <slug> ["Display name"]
import { mkdirSync, writeFileSync } from "node:fs";
import {
  camel,
  refuseExisting,
  register,
  slugArg,
  title,
} from "./scaffold.mjs";

const slug = slugArg("plugin");
const name = process.argv[3] ?? title(slug);
const dir = `src/plugins/${slug}`;
refuseExisting(dir);
mkdirSync(dir, { recursive: true });

writeFileSync(
  `${dir}/index.ts`,
  `import { definePlugin } from "@/lib/plugins/types";

// ${name}: describe what it does here. Hooks, settings and routes are listed
// in src/lib/plugins/types.ts; AGENTS.md explains the conventions.
export default definePlugin({
  slug: "${slug}",
  name: ${JSON.stringify(name)},
  version: "0.1.0",
  description: "What this plugin does, in one sentence.",
  author: "",
  // Shown under Admin → Plugins → ${name}; read them with api.settings()
  settings: [
    {
      type: "text",
      key: "greeting",
      label: "Greeting",
      default: "Hello from ${name}",
    },
  ],
  // Served at /wp-json/${slug}/v1/...
  rest: [
    {
      method: "GET",
      path: "/status",
      handler: async () => ({ ok: true }),
    },
  ],
  register(api) {
    // Filters change a value and return it
    api.addFilter("post.contentHtml", async (html) => html);

    // Actions react to events; slow work belongs in api.defer()
    api.addAction("post.saved", async ({ post, source }) => {
      if (source === "import") return;
      api.log(\`saved \${post.type} \${post.id}\`);
    });
  },
});
`,
);

register("src/plugins/index.ts", "installedPlugins", camel(slug), slug);
console.log(`Created ${dir}/index.ts and registered it in src/plugins/index.ts.
Activate it under Admin → Plugins.`);
