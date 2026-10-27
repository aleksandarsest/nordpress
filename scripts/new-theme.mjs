// Scaffolds a theme from an existing one:
//   pnpm new:theme <slug> ["Display name"] [--from classic|nord]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  camel,
  refuseExisting,
  register,
  slugArg,
  title,
} from "./scaffold.mjs";

const slug = slugArg("theme");
const args = process.argv.slice(3);
const fromAt = args.indexOf("--from");
const from = fromAt >= 0 ? args[fromAt + 1] : "classic";
const name =
  args.find((a, i) => !a.startsWith("--") && i !== fromAt + 1) ?? title(slug);
if (!["classic", "nord"].includes(from)) {
  console.error('--from must be "classic" or "nord".');
  process.exit(1);
}
const dir = `src/themes/${slug}`;
refuseExisting(dir);
mkdirSync(dir, { recursive: true });

const ident = camel(slug);
const components = readFileSync(
  `src/themes/${from}/components.tsx`,
  "utf8",
).replaceAll(`${from}Components`, `${ident}Components`);
const index = readFileSync(`src/themes/${from}/index.ts`, "utf8")
  .replaceAll(`${from}Components`, `${ident}Components`)
  .replace(/slug: "[^"]+"/, `slug: "${slug}"`)
  .replace(/name: "[^"]+"/, `name: ${JSON.stringify(name)}`)
  .replace(/version: "[^"]+"/, `version: "0.1.0"`)
  .replace(/author: "[^"]+"/, `author: ""`);
writeFileSync(`${dir}/components.tsx`, components);
writeFileSync(`${dir}/index.ts`, index);

register("src/themes/index.ts", "installedThemes", ident, slug);
console.log(`Created ${dir} (a copy of ${from}) and registered it in src/themes/index.ts.
Switch to it under Admin → Appearance → Themes, then make it your own.`);
