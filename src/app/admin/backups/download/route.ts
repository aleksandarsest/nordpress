import { Readable } from "node:stream";
import { backupName, backupStream } from "@/lib/backup";
import { hasCap } from "@/lib/capabilities";
import { getViewer } from "@/lib/session";

// A fresh backup, streamed straight to the browser as it's made
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "manage_options"))
    return new Response("Forbidden", { status: 403 });
  return new Response(Readable.toWeb(backupStream()) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${backupName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
