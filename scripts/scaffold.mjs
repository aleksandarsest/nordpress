// Shared helpers for the plugin and theme generators.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function slugArg(kind) {
  const slug = process.argv[2];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(
      `Usage: pnpm new:${kind} <slug> ["Display name"]\nThe slug uses lowercase letters, digits and dashes, e.g. "event-calendar".`,
    );
    process.exit(1);
  }
  return slug;
}

export const camel = (slug) =>
  slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

export const title = (slug) =>
  slug
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export function refuseExisting(dir) {
  if (existsSync(dir)) {
    console.error(`${dir} already exists.`);
    process.exit(1);
  }
}

// Adds `import ident from "./slug";` and `ident` to the registry array.
export function register(registryPath, arrayName, ident, slug) {
  let source = readFileSync(registryPath, "utf8");
  const importLine = `import ${ident} from "./${slug}";\n`;
  const lastImport = source.lastIndexOf("\nimport ");
  const lineEnd = source.indexOf("\n", lastImport + 1);
  source =
    source.slice(0, lineEnd + 1) + importLine + source.slice(lineEnd + 1);
  const arrayStart = source.indexOf(`${arrayName}`);
  const close = source.indexOf("];", arrayStart);
  const body = source.slice(source.indexOf("[", arrayStart) + 1, close).trim();
  const items = body ? `${body.replace(/,\s*$/, "")}, ${ident}` : ident;
  source = `${source.slice(0, source.indexOf("[", arrayStart) + 1)}${items}${source.slice(close)}`;
  writeFileSync(registryPath, source);
}
