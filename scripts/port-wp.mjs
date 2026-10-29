// Reports what a WordPress plugin or theme uses and where each piece goes in
// Nordpress; with --scaffold, also creates the Nordpress plugin or theme and
// a PORTING.md checklist in it.
//   pnpm port:wp <plugin-or-theme folder | file.php> [--scaffold <slug>]
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import {
  BUILT_IN_PLUGINS,
  parseHeader,
  scanPhp,
  summarize,
  THEME_FILES,
} from "./wp-port.mjs";

const args = process.argv.slice(2);
const scaffoldAt = args.indexOf("--scaffold");
const slug = scaffoldAt >= 0 ? args[scaffoldAt + 1] : null;
const target = args.find(
  (a, i) => !a.startsWith("--") && (scaffoldAt < 0 || i !== scaffoldAt + 1),
);
if (!target || !existsSync(target) || (scaffoldAt >= 0 && !slug)) {
  console.error(
    "Usage: pnpm port:wp <plugin-or-theme folder | file.php> [--scaffold <slug>]",
  );
  process.exit(1);
}
if (slug && !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(
    `Invalid slug "${slug}": use lowercase letters, digits and dashes.`,
  );
  process.exit(1);
}

const SKIP = new Set([
  "vendor",
  "node_modules",
  ".git",
  "tests",
  "test",
  "languages",
]);
function phpFiles(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((d) => {
    if (d.isDirectory())
      return SKIP.has(d.name) ? [] : phpFiles(join(path, d.name));
    return /\.(php|css)$/.test(d.name) || d.name === "theme.json"
      ? [join(path, d.name)]
      : [];
  });
}

const root = statSync(target).isFile() ? join(target, "..") : target;
// The header lives in style.css or the main plugin file, at the top level
const depth = (f) => relative(root, f).split("/").length;
const files = phpFiles(target).sort(
  (a, b) =>
    depth(a) - depth(b) ||
    Number(basename(b) === "style.css") - Number(basename(a) === "style.css"),
);
let header = null;
let isTheme = false;
const findings = [];
const templates = [];
for (const file of files) {
  const rel = relative(root, file);
  const source = readFileSync(file, "utf8");
  const h = parseHeader(source);
  if (h && !header) {
    header = h;
    isTheme = /Theme Name:/i.test(source.slice(0, 8192));
  }
  if (THEME_FILES[basename(file)] && !rel.includes("/")) templates.push(rel);
  if (file.endsWith(".php"))
    for (const f of scanPhp(source))
      findings.push({ ...f, place: `${rel}:${f.line}` });
}
isTheme ||= templates.includes("style.css") && templates.includes("index.php");

const name = header?.name ?? basename(root);
const groups = summarize(findings);
const counts = { api: 0, "built-in": 0, missing: 0 };
for (const g of groups) counts[g.entry.status]++;
const LABEL = {
  api: "Use instead",
  "built-in": "Built in, delete",
  missing: "No equivalent yet",
};

function places(g) {
  const shown = g.places.slice(0, 4).join(", ");
  return g.places.length > 4
    ? `${shown} and ${g.places.length - 4} more`
    : shown;
}

// The same content as a terminal report and as PORTING.md
const lines = [
  `# Porting ${name} to Nordpress`,
  "",
  `${isTheme ? "Theme" : "Plugin"} \`${basename(root)}\`, ${files.length} files scanned. ` +
    `Maps to a Nordpress API: ${counts.api}. Built in: ${counts["built-in"]}. No equivalent yet: ${counts.missing}.`,
  "",
  "Guide: docs/porting-from-wordpress.md.",
];
const builtIn = !isTheme && BUILT_IN_PLUGINS[basename(root)];
if (builtIn)
  lines.push(
    "",
    `> Nordpress already has this built in: ${builtIn}. Check whether that covers what you use before porting it.`,
  );
if (isTheme && templates.length) {
  lines.push("", "## Templates", "");
  for (const t of templates) lines.push(`- [ ] \`${t}\` → ${THEME_FILES[t]}`);
}
for (const status of ["missing", "api", "built-in"]) {
  const list = groups.filter((g) => g.entry.status === status);
  if (!list.length) continue;
  lines.push("", `## ${LABEL[status]}`, "");
  for (const g of list)
    lines.push(
      `- [ ] \`${[...g.names].join("`, `")}\` (${places(g)})`,
      `  → ${g.entry.nordpress}`,
    );
}
if (!groups.length)
  lines.push("", "No WordPress APIs found. Is this the plugin's main folder?");
const report = `${lines.join("\n")}\n`;
console.log(report);

if (slug) {
  const display = header?.name ?? slug;
  const kind = isTheme ? "theme" : "plugin";
  const dir = `src/${kind}s/${slug}`;
  execFileSync(
    "node",
    isTheme
      ? ["scripts/new-theme.mjs", slug, display, "--from", "classic"]
      : ["scripts/new-plugin.mjs", slug, display],
    { stdio: "inherit" },
  );
  // Carry the WordPress header over into the definition
  const index = `${dir}/index.ts`;
  let source = readFileSync(index, "utf8")
    .replace(
      /^\/\/ .*: describe what it does here\.[^\n]*\n\/\/[^\n]*\n/m,
      `// Ported from the WordPress ${kind} "${display}"; PORTING.md lists what's left.\n// Hooks, settings and routes are in src/lib/${kind}s/types.ts.\n`,
    )
    .replace(
      /version: "[^"]*"/,
      `version: ${JSON.stringify(header?.version ?? "0.1.0")}`,
    )
    .replace(
      /author: "[^"]*"/,
      `author: ${JSON.stringify(header?.author ?? "")}`,
    );
  if (header?.description)
    source = source.replace(
      /description:\s*"[^"]*"/,
      `description: ${JSON.stringify(header.description.replace(/<[^>]*>/g, ""))}`,
    );
  writeFileSync(index, source);
  writeFileSync(`${dir}/PORTING.md`, report);
  execFileSync("node_modules/.bin/biome", ["format", "--write", dir], {
    stdio: "ignore",
  });
  console.log(
    `Wrote ${dir}/PORTING.md. Delete it once everything is ticked off.`,
  );
}
