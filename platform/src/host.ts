import { spawn } from "node:child_process";
import { config } from "./config.ts";

// Runs the root helper (platform/bin/np-site) through sudo. It's the only
// thing the platform's user may run as root, and it checks every name.

export class HostError extends Error {}

export function npSite(
  action:
    | "create"
    | "start"
    | "stop"
    | "restart"
    | "status"
    | "update"
    | "remove"
    | "template",
  name?: string,
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-n", config.helper, action, ...(name ? [name] : [])];
    const child = spawn("sudo", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(
            new HostError(err.trim() || `np-site ${action} failed (${code})`),
          ),
    );
    child.stdin.end(input ?? "");
  });
}

/** A site's settings as a systemd environment file. Values are ours (secrets, URLs, the title), one per line. */
export function envFile(env: Record<string, string>) {
  return Object.entries(env)
    .map(
      ([key, value]) =>
        `${key}=${JSON.stringify(value.replace(/[\r\n]+/g, " "))}`,
    )
    .join("\n")
    .concat("\n");
}
