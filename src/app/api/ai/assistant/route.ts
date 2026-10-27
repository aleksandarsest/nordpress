import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { runAssistant } from "@/lib/agent/assistant";
import { AiError } from "@/lib/ai/client";
import { hasCap } from "@/lib/capabilities";
import { clientIp } from "@/lib/rate-limit";
import { getViewer } from "@/lib/session";

// The conversation lives in the browser and is sent back whole each turn,
// unchanged, so cached prompts and the model's reasoning stay valid.
const body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([
          z.string(),
          z.array(z.record(z.string(), z.unknown())),
        ]),
      }),
    )
    .max(400),
  /** A new message from the user, if this turn has one. */
  input: z.string().trim().max(20_000).optional(),
  decisions: z.record(z.string(), z.boolean()).default({}),
});

const MAX_BODY = 4_000_000;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "edit_posts"))
    return Response.json(
      { error: "Sorry, you are not allowed to use the assistant." },
      { status: 403 },
    );
  // Only the admin itself may drive the assistant with this session
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "Cross-site request refused." },
      { status: 403 },
    );

  const raw = await request.text();
  if (raw.length > MAX_BODY)
    return Response.json(
      { error: "This conversation is too long. Start a new one." },
      { status: 413 },
    );
  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages = parsed.messages as BetaMessageParam[];
  if (parsed.input) messages.push({ role: "user", content: parsed.input });
  if (messages.length === 0)
    return Response.json({ error: "Say what you need." }, { status: 400 });

  try {
    const result = await runAssistant({
      viewer,
      messages,
      decisions: parsed.decisions,
      ip: (() => {
        const ip = clientIp(request.headers);
        return ip === "unknown" ? null : ip;
      })(),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof AiError ? error.message : "The assistant failed.";
    if (!(error instanceof AiError)) console.error("[assistant]", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
