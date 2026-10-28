// Runs a command with the built-in database: PostgreSQL compiled to
// WebAssembly (PGlite), kept in one folder, so a site needs no database
// server. It listens on a local port for the command's lifetime, and the
// command gets DATABASE_URL pointing at it:
//
//   node scripts/embedded-db.mjs pnpm start
//
// EMBEDDED_DB_DIR is the folder (default ./storage/db). Only this process
// opens it; the site and its build connect over the PostgreSQL protocol.
//
// PGlite has one session, so connections take turns: each request (the
// messages up to a Sync, or a simple query) runs whole. While a transaction
// is open only its own connection's requests run, and so does a query's
// second half: postgres.js first asks the server to describe a query, then
// binds and runs it in a separate request. If a transaction's connection
// goes quiet while others wait (code waiting on a query outside the
// transaction, which a real server would run alongside), the others run
// inside it rather than everything stopping.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/embedded-db.mjs <command> [args…]");
  process.exit(1);
}

const dir = process.env.EMBEDDED_DB_DIR || "./storage/db";
mkdirSync(dir, { recursive: true });
const db = await PGlite.create(dir, { extensions: { vector } });

const SSL_REQUEST = 80877103;
const GSS_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;

/** Requests waiting their turn: { conn, bytes, describe } */
const queue = [];
let owner = null; // the connection whose transaction is open
let describing = null; // { conn, until }: a query described but not yet run
let running = false;
let retry = null;
let stalledSince = 0; // when others started waiting on a quiet transaction

async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const now = Date.now();
      if (describing && now > describing.until) describing = null;
      const turn = describing?.conn ?? (db.isInTransaction() ? owner : null);
      let i = turn ? queue.findIndex((r) => r.conn === turn) : 0;
      if (i === -1 && !describing) {
        stalledSince ||= now;
        if (now - stalledSince > 100) i = 0;
      }
      if (i === -1) {
        // Its next request hasn't arrived yet; others wait a little
        const wait = describing ? describing.until - now : 100;
        if (!retry)
          retry = setTimeout(() => {
            retry = null;
            void run();
          }, wait + 5);
        break;
      }
      if (!turn || queue[i].conn === turn) stalledSince = 0;
      const [{ conn, bytes, describe }] = queue.splice(i, 1);
      if (conn.destroyed) continue;
      const inTransaction = db.isInTransaction();
      await db.runExclusive(() =>
        db.execProtocolRawStream(bytes, {
          onRawData: (data) => {
            if (!conn.destroyed) conn.write(Buffer.from(data));
          },
        }),
      );
      // The transaction belongs to whoever began it, not to a guest
      if (!inTransaction) owner = conn;
      describing = describe ? { conn, until: Date.now() + 2000 } : null;
    }
  } finally {
    running = false;
  }
}

function serve(conn) {
  let buffer = Buffer.alloc(0);
  let batch = [];
  let types = "";
  let started = false;
  conn.setNoDelay(true);

  conn.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (!started) {
        // Startup messages have no type byte: length, then a code
        if (buffer.length < 8) return;
        const length = buffer.readInt32BE(0);
        if (buffer.length < length) return;
        const code = buffer.readInt32BE(4);
        const message = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        if (code === SSL_REQUEST || code === GSS_REQUEST) {
          conn.write("N"); // no encryption on the local port
          continue;
        }
        if (code === CANCEL_REQUEST) {
          conn.end();
          return;
        }
        started = true;
        queue.push({ conn, bytes: new Uint8Array(message) });
        void run();
        continue;
      }
      if (buffer.length < 5) return;
      const type = String.fromCharCode(buffer[0]);
      const length = 1 + buffer.readInt32BE(1);
      if (buffer.length < length) return;
      const message = buffer.subarray(0, length);
      buffer = buffer.subarray(length);
      if (type === "X") {
        conn.end();
        return;
      }
      batch.push(message);
      types += type;
      // A request ends with Sync (extended protocol) or is one simple Query
      if (type === "S" || type === "Q" || type === "H") {
        queue.push({
          conn,
          bytes: new Uint8Array(Buffer.concat(batch)),
          // Parse without Execute: the Bind and Execute follow separately
          describe: types.includes("P") && !types.includes("E"),
        });
        batch = [];
        types = "";
        void run();
      }
    }
  });

  const gone = async () => {
    for (let i = queue.length - 1; i >= 0; i--)
      if (queue[i].conn === conn) queue.splice(i, 1);
    // A transaction left open by a closed connection is rolled back
    if (describing?.conn === conn) describing = null;
    if (owner === conn) {
      owner = null;
      if (db.isInTransaction())
        await db.runExclusive(() => db.exec("rollback")).catch(() => {});
    }
    void run();
  };
  conn.on("close", gone);
  conn.on("error", () => conn.destroy());
}

const server = createServer(serve);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
console.log(`[db] built-in database in ${dir}`);

const child = spawn(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
  },
});

// Close the database cleanly however the command ends, so nothing is lost
let closing = false;
async function close(code) {
  if (closing) return;
  closing = true;
  server.close();
  await db.close().catch((error) => console.error("[db] closing:", error));
  process.exit(code);
}
child.on("exit", (code, signal) => close(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => child.kill(signal));
