import "server-only";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { db } from "@/db";
import { ALLOWED_TYPES } from "../media";
import { getSettings, saveSettings } from "../options";
import { ALL_CACHE_TAGS, invalidate } from "../rest/core";
import { siteUrl } from "../site-url";
import { safeKey, storage } from "../storage";
import { type BackupStore, backupStore, isBackupName } from "./store";
import { readAll, readTar, TAR_END, tarHeader, tarPadding } from "./tar";

export { backupStore, isBackupName } from "./store";

// Backups: the whole site in one .tar.gz, the database as one JSON object per
// row (so no pg_dump is needed and restoring works across Postgres versions)
// plus every media file. Restoring replaces the database in one transaction.

export class BackupError extends Error {}

const FORMAT = 1;
const ROWS_PER_FILE = 2000;
// Sign-in sessions, one-time tokens and counters don't belong in a backup;
// the search index is rebuilt from the posts afterwards.
const SKIPPED = new Set([
  "session",
  "verification",
  "rate_limit",
  "rate_limits",
  "post_chunks",
]);

type Manifest = {
  format: number;
  app: "nordpress";
  createdAt: string;
  site: { title: string; url: string };
  /** The newest database migration when the backup was made. */
  migration: number;
  /** Table → columns, in the order to restore them. */
  tables: { name: string; columns: string[] }[];
  media: number;
};

const sql = () => db.$client;
const encoder = new TextEncoder();
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function latestMigration() {
  const [row] = await sql().unsafe(
    "select coalesce(max(created_at), 0)::bigint as at from drizzle.__drizzle_migrations",
  );
  return Number(row?.at ?? 0);
}

// The site's tables, parents before children, with the columns that can be
// written (generated ones like the search vector are left out)
async function siteTables() {
  const [columns, keys] = await Promise.all([
    sql().unsafe<{ table: string; column: string }[]>(
      `select c.table_name as "table", c.column_name as "column"
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
         and c.is_generated = 'NEVER'
       order by c.table_name, c.ordinal_position`,
    ),
    sql().unsafe<{ child: string; parent: string }[]>(
      `select conrelid::regclass::text as child, confrelid::regclass::text as parent
       from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`,
    ),
  ]);
  const byTable = new Map<string, string[]>();
  for (const { table, column } of columns) {
    if (SKIPPED.has(table)) continue;
    byTable.set(table, [...(byTable.get(table) ?? []), column]);
  }
  const unquote = (s: string) => s.replace(/^"|"$/g, "");
  const parents = new Map<string, Set<string>>();
  for (const { child, parent } of keys) {
    const c = unquote(child);
    const p = unquote(parent);
    if (c !== p) parents.set(c, (parents.get(c) ?? new Set()).add(p));
  }
  const ordered: string[] = [];
  const visit = (name: string, path: Set<string>) => {
    if (ordered.includes(name) || path.has(name)) return;
    path.add(name);
    for (const p of parents.get(name) ?? []) if (byTable.has(p)) visit(p, path);
    ordered.push(name);
  };
  for (const name of [...byTable.keys()].sort()) visit(name, new Set());
  return ordered.map((name) => ({ name, columns: byTable.get(name) ?? [] }));
}

function* entry(name: string, bytes: Uint8Array) {
  yield tarHeader(name, bytes.length);
  yield bytes;
  yield tarPadding(bytes.length);
}

/** The archive, uncompressed: manifest, database, then media files. */
async function* archive(): AsyncGenerator<Uint8Array> {
  const settings = await getSettings();
  const tables = await siteTables();
  const media = await sql().unsafe<{ path: string }[]>(
    "select path from media order by id",
  );
  const manifest: Manifest = {
    format: FORMAT,
    app: "nordpress",
    createdAt: new Date().toISOString(),
    site: { title: settings.title, url: siteUrl("/") },
    migration: await latestMigration(),
    tables,
    media: media.length,
  };
  yield* entry(
    "backup.json",
    encoder.encode(JSON.stringify(manifest, null, 2)),
  );

  for (const table of tables) {
    let part = 0;
    const cursor = sql()
      .unsafe<{ j: string }[]>(
        `select row_to_json(t)::text as j from ${quote(table.name)} t`,
      )
      .cursor(ROWS_PER_FILE);
    for await (const rows of cursor) {
      part++;
      const name = `db/${table.name}.${String(part).padStart(4, "0")}.ndjson`;
      yield* entry(
        name,
        encoder.encode(`${rows.map((r) => r.j).join("\n")}\n`),
      );
    }
  }

  for (const { path: key } of media) {
    const file = await storage().get(key);
    if (!file) continue;
    yield tarHeader(`uploads/${key}`, file.size);
    let written = 0;
    for await (const chunk of file.body as unknown as AsyncIterable<Uint8Array>) {
      written += chunk.length;
      yield chunk;
    }
    if (written !== file.size)
      throw new BackupError(
        `The file ${key} changed while it was being backed up.`,
      );
    yield tarPadding(file.size);
  }
  yield TAR_END;
}

/** A compressed backup, for downloading straight to the browser. */
export function backupStream() {
  return Readable.from(archive()).pipe(createGzip());
}

export function backupName(kind?: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `nordpress-${stamp}${kind ? `-${kind}` : ""}.tar.gz`;
}

/** Makes a backup and keeps it in the backup folder or bucket. */
export async function createStoredBackup(kind?: string) {
  const name = backupName(kind);
  const temp = path.join(tmpdir(), `${name}.partial`);
  try {
    await pipeline(backupStream(), createWriteStream(temp));
    await backupStore().save(name, temp);
  } finally {
    await rm(temp, { force: true });
  }
  return name;
}

/** Keeps the newest `keep` scheduled backups; manual ones stay. */
export async function pruneBackups(
  keep: number,
  store: BackupStore = backupStore(),
) {
  const scheduled = (await store.list()).filter((b) =>
    b.name.endsWith("-auto.tar.gz"),
  );
  for (const old of scheduled.slice(Math.max(1, keep)))
    await store.remove(old.name);
}

const DAY = 24 * 60 * 60 * 1000;

/** Runs the scheduled backup if one is due; returns its name. */
export async function runScheduledBackupIfDue() {
  const settings = await getSettings();
  if (settings.backupSchedule === "off") return null;
  const every = settings.backupSchedule === "weekly" ? 7 * DAY : DAY;
  const last = settings.backupLastRun ? Date.parse(settings.backupLastRun) : 0;
  if (Date.now() - last < every - 60 * 60 * 1000) return null;
  // Claim the run first, so simultaneous requests don't start two
  await saveSettings({ backupLastRun: new Date().toISOString() });
  invalidate("options");
  try {
    const name = await createStoredBackup("auto");
    await pruneBackups(settings.backupKeep);
    return name;
  } catch (error) {
    // Try again on the next visit rather than in a day
    await saveSettings({ backupLastRun: settings.backupLastRun });
    invalidate("options");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Restoring
// ---------------------------------------------------------------------------

function parseManifest(bytes: Uint8Array): Manifest {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BackupError("This isn't a Nordpress backup.");
  }
  if (manifest?.app !== "nordpress" || !Array.isArray(manifest.tables))
    throw new BackupError("This isn't a Nordpress backup.");
  if (manifest.format > FORMAT)
    throw new BackupError(
      "This backup is from a newer Nordpress. Update first.",
    );
  return manifest;
}

/**
 * Replaces the site with the backup in `source` (a .tar.gz stream). The
 * database is replaced in one transaction, so a damaged backup changes
 * nothing; media files are written after it succeeds.
 */
export async function restoreBackup(
  source: AsyncIterable<Uint8Array>,
  options: {
    /** Runs once the file is known to be a usable backup, before any change. */
    beforeReplace?: () => Promise<unknown>;
  } = {},
) {
  const gunzipped = Readable.from(source).pipe(createGunzip());
  const entries = readTar(gunzipped as unknown as AsyncIterable<Uint8Array>);
  const first = await entries.next();
  if (first.done || first.value.name !== "backup.json")
    throw new BackupError("This isn't a Nordpress backup.");
  const manifest = parseManifest(await readAll(first.value.body));
  if (manifest.migration > (await latestMigration()))
    throw new BackupError(
      "This backup was made with a newer version of Nordpress. Update this site first, then restore.",
    );

  await options.beforeReplace?.();
  const current = new Map((await siteTables()).map((t) => [t.name, t.columns]));
  const restored = new Set<string>();
  let pending: IteratorResult<
    Awaited<ReturnType<typeof entries.next>>["value"]
  > | null = null;
  let rows = 0;

  await sql().begin(async (tx) => {
    // CASCADE also clears sign-in sessions and the search index, which point
    // at these tables. Sessions are put back for accounts the backup has, so
    // whoever is restoring stays signed in.
    await tx.unsafe(
      "create temporary table kept_sessions on commit drop as select * from session",
    );
    await tx.unsafe(
      `truncate ${[...current.keys()].map(quote).join(", ")} restart identity cascade`,
    );
    for (;;) {
      const next = await entries.next();
      if (next.done || !next.value.name.startsWith("db/")) {
        pending = next;
        break;
      }
      const table = next.value.name.slice(3).replace(/\.\d+\.ndjson$/, "");
      const have = current.get(table);
      const text = new TextDecoder().decode(await readAll(next.value.body));
      if (!have) continue; // a table this version no longer has
      const saved =
        manifest.tables.find((t) => t.name === table)?.columns ?? [];
      // Columns added since the backup keep their defaults
      const columns = saved
        .filter((c) => have.includes(c))
        .map(quote)
        .join(", ");
      const lines = text.split("\n").filter(Boolean);
      for (let i = 0; i < lines.length; i += 500) {
        const batch = `[${lines.slice(i, i + 500).join(",")}]`;
        await tx.unsafe(
          `insert into ${quote(table)} (${columns})
           select ${columns} from json_populate_recordset(null::${quote(table)}, $1::json)`,
          [batch],
        );
      }
      rows += lines.length;
      restored.add(table);
    }
    await tx.unsafe(
      `insert into session select k.* from kept_sessions k
       where exists (select 1 from "user" u where u.id = k.user_id)`,
    );
    // New rows continue after the restored ids
    const serials = await tx.unsafe<{ table: string; column: string }[]>(
      `select table_name as "table", column_name as "column" from information_schema.columns
       where table_schema = 'public' and column_default like 'nextval%'`,
    );
    for (const { table, column } of serials) {
      if (!current.has(table)) continue;
      await tx.unsafe(
        `select setval(pg_get_serial_sequence($1, $2),
           coalesce((select max(${quote(column)}) from ${quote(table)}), 0) + 1, false)`,
        [table, column],
      );
    }
  });

  let files = 0;
  let next = pending as IteratorResult<{
    name: string;
    size: number;
    body: AsyncIterable<Uint8Array>;
  }> | null;
  while (next && !next.done) {
    const { name, body } = next.value;
    const key = name.startsWith("uploads/") ? safeKey(name.slice(8)) : null;
    const ext = key?.split(".").pop()?.toLowerCase() ?? "";
    const type = Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext)?.[0];
    // Only files the uploads route would serve anyway
    if (key && type) {
      await storage().put(key, await readAll(body), type);
      files++;
    }
    next = await entries.next();
  }

  invalidate(...ALL_CACHE_TAGS);
  return {
    tables: restored.size,
    rows,
    files,
    from: manifest.createdAt,
    site: manifest.site,
  };
}

/** Restores one of the backups kept in the backup folder or bucket. */
export async function restoreStoredBackup(
  name: string,
  options?: Parameters<typeof restoreBackup>[1],
) {
  if (!isBackupName(name)) throw new BackupError("There is no such backup.");
  const file = await backupStore().open(name);
  if (!file) throw new BackupError("There is no such backup.");
  return restoreBackup(file.body, options);
}
