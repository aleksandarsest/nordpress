import { z } from "zod";
import { streamWrite } from "@/lib/ai/write";
import { WRITE_ACTIONS, type WriteAction } from "@/lib/ai/write-prompts";
import { hasCap } from "@/lib/capabilities";
import { getViewer } from "@/lib/session";

const body = z.object({
  action: z.enum(Object.keys(WRITE_ACTIONS) as [WriteAction, ...WriteAction[]]),
  title: z.string().max(1000).default(""),
  documentText: z.string().max(400_000).default(""),
  selectionHtml: z.string().max(200_000).default(""),
  instruction: z.string().max(2000).optional(),
});

// Streams the writing assistant's answer as newline-delimited JSON events.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "edit_posts")) {
    return Response.json(
      { error: "Sorry, you are not allowed to use the writing assistant." },
      { status: 403 },
    );
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid request." }, { status: 400 });

  const encoder = new TextEncoder();
  const events = streamWrite(parsed.data, viewer.id);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
