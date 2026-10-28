// Applies database migrations without drizzle-kit, for production servers
// and scripts/serve.sh: node scripts/migrate.mjs
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// The database may still be starting: retry briefly
const client = postgres(url, { max: 1, onnotice: () => {} });
for (let attempt = 1; ; attempt++) {
  try {
    await client`select 1`;
    break;
  } catch (error) {
    if (attempt >= 30) throw error;
    console.log(`Waiting for the database (${error.code ?? error.message})…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await migrate(drizzle(client), {
  migrationsFolder: new URL("../src/db/migrations", import.meta.url).pathname,
});
console.log("Database is up to date.");
await client.end();
