import { after } from "next/server";
import { BackupError, createStoredBackup, restoreBackup } from "@/lib/backup";
import { hasCap } from "@/lib/capabilities";
import { getViewer } from "@/lib/session";

// Restores an uploaded backup. The file is the request body, streamed, so
// backups of any size work (server actions cap uploads at a few MB). The
// custom header can't be sent by another site's form, which blocks CSRF.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "manage_options"))
    return Response.json({ error: "Forbidden." }, { status: 403 });
  if (request.headers.get("x-nordpress-restore") !== "yes" || !request.body)
    return Response.json({ error: "Bad request." }, { status: 400 });
  try {
    let safety = "";
    const result = await restoreBackup(
      request.body as unknown as AsyncIterable<Uint8Array>,
      {
        // A way back, in case this backup isn't the one they wanted
        beforeReplace: async () => {
          safety = await createStoredBackup("before-restore");
        },
      },
    );
    after(rebuildSearch);
    return Response.json({ ...result, safety });
  } catch (error) {
    if (
      error instanceof BackupError ||
      /gzip|header|incorrect/i.test(String(error))
    )
      return Response.json(
        {
          error:
            error instanceof BackupError
              ? error.message
              : "This file isn't a valid backup.",
        },
        { status: 400 },
      );
    console.error("[backup] restore failed", error);
    return Response.json(
      { error: "Restoring failed; the site wasn't changed." },
      { status: 500 },
    );
  }
}

// The search index isn't in backups; rebuild it when it's configured
async function rebuildSearch() {
  const { embeddingsConfigured, rebuildIndex } = await import(
    "@/lib/ai/embeddings"
  );
  if (embeddingsConfigured()) await rebuildIndex();
}
