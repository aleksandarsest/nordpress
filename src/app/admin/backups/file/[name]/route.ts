import { Readable } from "node:stream";
import { backupStore, isBackupName } from "@/lib/backup";
import { hasCap } from "@/lib/capabilities";
import { getViewer } from "@/lib/session";

export async function GET(
  _: Request,
  { params }: RouteContext<"/admin/backups/file/[name]">,
) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "manage_options"))
    return new Response("Forbidden", { status: 403 });
  const { name } = await params;
  const file = isBackupName(name) ? await backupStore().open(name) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Readable.toWeb(file.body) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}"`,
      ...(file.size ? { "Content-Length": String(file.size) } : {}),
      "Cache-Control": "no-store",
    },
  });
}
