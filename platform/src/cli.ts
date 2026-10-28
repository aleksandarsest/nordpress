import { randomSecret } from "./auth.ts";
import { migrate, type Site, sql } from "./db.ts";
import { fetchBuild, restartSite, upgradeSites } from "./provision.ts";

// Running the platform by hand, on the server (np-platform loads its settings):
//   sudo np-platform invite [uses] [note]   make an invite code
//   sudo np-platform invites                list invite codes
//   sudo np-platform sites                  list sites
//   sudo np-platform template               download the build for this version
//   sudo np-platform upgrade                that, then every site gets it
//   sudo np-platform restart <subdomain>    restart one site

const [command, ...args] = process.argv.slice(2);

async function main() {
  await migrate();
  switch (command) {
    case "invite": {
      const code = randomSecret(9)
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10);
      const uses = Number(args[0] ?? 1);
      await sql`insert into invites (code, uses_left, note) values (${code}, ${uses}, ${args.slice(1).join(" ")})`;
      console.log(`Invite code: ${code} (${uses} use${uses === 1 ? "" : "s"})`);
      break;
    }
    case "invites":
      for (const i of await sql`select * from invites order by created_at`)
        console.log(`${i.code}\t${i.uses_left} left\t${i.note}`);
      break;
    case "sites":
      for (const s of await sql<(Site & { email: string })[]>`
        select sites.*, accounts.email from sites join accounts on accounts.id = account_id order by sites.id`)
        console.log(
          `${s.subdomain}\t${s.status}\t${s.email}\t${s.title}${s.error ? `\t${s.error}` : ""}`,
        );
      break;
    case "template":
      console.log(await fetchBuild());
      break;
    case "upgrade":
      console.log(await fetchBuild());
      await upgradeSites();
      console.log(
        "Every site starts on the new build from its next visit. Now run: systemctl restart nordpress-platform",
      );
      break;
    case "restart": {
      const [site] = await sql<
        Site[]
      >`select * from sites where subdomain = ${args[0] ?? ""}`;
      if (!site) throw new Error(`No site called ${args[0]}.`);
      await restartSite(site);
      console.log(`Restarted ${site.subdomain}.`);
      break;
    }
    default:
      console.log(
        "Commands: invite [uses] [note], invites, sites, template, upgrade, restart <subdomain>",
      );
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
