// Redirect rules: normalizing what people type, matching a request path, and
// reading the CSV that WordPress's Redirection plugin exports. Pure.

export type Rule = { source: string; target: string; status: number };

export class RedirectRuleError extends Error {}

/**
 * "/Old-Post/", "old-post" or "https://example.com/old-post?x=1" → "/old-post".
 * The query string is dropped; trailing slashes too, since URLs here have none.
 */
export function normalizeSource(input: string, siteOrigin?: string) {
  let value = input.trim();
  if (!value) throw new RedirectRuleError("Enter the old address.");
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (siteOrigin && url.origin !== siteOrigin)
      throw new RedirectRuleError(
        "The old address must be on this site, e.g. /old-post.",
      );
    value = url.pathname;
  }
  value = value.split(/[?#]/)[0];
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/{2,}/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  if (value.includes("*") && !/^[^*]*\*$/.test(value))
    throw new RedirectRuleError("Use * only at the end, e.g. /old-blog/*.");
  if (value === "/*" || value === "*")
    throw new RedirectRuleError(
      "Redirecting every address would lock you out.",
    );
  for (const reserved of [
    "/admin",
    "/api",
    "/login",
    "/uploads",
    "/wp-json",
    "/mcp",
  ])
    if (value === reserved || value.startsWith(`${reserved}/`))
      throw new RedirectRuleError(
        `Addresses under ${reserved} can't be redirected.`,
      );
  if (value.length > 500)
    throw new RedirectRuleError("That address is too long.");
  return value;
}

/** A site path ("/new") or a full http(s) URL. */
export function normalizeTarget(input: string) {
  const value = input.trim();
  if (!value) throw new RedirectRuleError("Enter the new address.");
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).toString();
    } catch {
      throw new RedirectRuleError("The new address isn't a valid URL.");
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//"))
    throw new RedirectRuleError(
      "Use a path like /new-post or a full https:// URL.",
    );
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.length > 1 && !path.includes("?")
    ? path.replace(/\/+$/, "")
    : path;
}

export function normalizeStatus(input: unknown) {
  const n = Number(input);
  return n === 302 || n === 307 ? 302 : 301;
}

/**
 * The rule for `path`, exact matches first, then the longest wildcard.
 * Returns where to send the visitor, or null.
 */
export function matchRedirect(rules: Rule[], path: string) {
  const exact = rules.find((r) => !r.source.endsWith("*") && r.source === path);
  if (exact) return { rule: exact, to: exact.target };
  let best: { rule: Rule; rest: string } | null = null;
  for (const rule of rules) {
    if (!rule.source.endsWith("*")) continue;
    const prefix = rule.source.slice(0, -1);
    const base = prefix.replace(/\/$/, "");
    // "/old-blog/*" matches "/old-blog" itself and everything below it
    if (path !== base && !path.startsWith(prefix)) continue;
    if (!best || prefix.length > best.rule.source.length - 1)
      best = { rule, rest: path === base ? "" : path.slice(prefix.length) };
  }
  if (!best) return null;
  const to = best.rule.target.includes("*")
    ? best.rule.target.replace("*", best.rest)
    : best.rule.target;
  return {
    rule: best.rule,
    to:
      to.startsWith("/") && to.length > 1 ? to.replace(/\/+$/, "") || "/" : to,
  };
}

/** Whether following rules from `source` would come back to it. */
export function createsLoop(rules: Rule[], source: string, target: string) {
  const seen = new Set([source]);
  let next: string | null = target;
  for (let i = 0; i < 20 && next?.startsWith("/"); i++) {
    if (seen.has(next)) return true;
    seen.add(next);
    const hit = matchRedirect(
      rules.filter((r) => r.source !== source),
      next,
    );
    next = hit?.to ?? null;
  }
  return false;
}

/**
 * Rows from a CSV: "source,target[,status]" per line, as exported by the
 * Redirection plugin or written by hand. Header rows are skipped.
 */
export function parseRedirectCsv(input: string) {
  const rows: { source: string; target: string; status: number }[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = splitCsv(line);
    if (/^(source|from|url|old)/i.test(cells[0] ?? "")) continue;
    const [source, target] = cells;
    // Redirection's export has the code in a later column ("regex" comes first)
    const status = cells.slice(2).find((c) => /^30[1278]$/.test(c));
    if (!source || !target) {
      invalid.push(line);
      continue;
    }
    try {
      rows.push({
        source: normalizeSource(source),
        target: normalizeTarget(target),
        status: normalizeStatus(status ?? 301),
      });
    } catch {
      invalid.push(line);
    }
  }
  return { rows, invalid };
}

function splitCsv(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      cells.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

/** Words in a missing path, for finding the post it probably meant. */
export function pathWords(path: string) {
  return path
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, "")
    .split(/[/\-_.+%0-9]+/)
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          "wp",
          "content",
          "uploads",
          "category",
          "tag",
          "page",
          "index",
        ].includes(w),
    );
}
