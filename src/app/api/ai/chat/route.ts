import {
  chatAvailable,
  chatQuotaLeft,
  chatRequest,
  streamChat,
} from "@/lib/ai/chat";
import { rateLimit } from "@/lib/rate-limit";

const PER_VISITOR = { limit: 12, windowMs: 10 * 60_000 };

const json = (error: string, status: number, headers?: HeadersInit) =>
  Response.json({ error }, { status, headers });

// Public "Ask this site" endpoint. Streams newline-delimited JSON events.
export async function POST(request: Request) {
  if (!(await chatAvailable()))
    return json("The assistant is not available.", 404);

  // Only this site's own pages may use the endpoint
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (site !== "same-origin" && origin !== new URL(request.url).origin) {
    return json("Cross-site requests are not allowed.", 403);
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimit(
    `chat:${ip}`,
    PER_VISITOR.limit,
    PER_VISITOR.windowMs,
  );
  if (!limited.ok) {
    return json(
      "You've asked a lot of questions in a short time. Please wait a few minutes.",
      429,
      {
        "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)),
      },
    );
  }
  if ((await chatQuotaLeft()) <= 0) {
    return json(
      "The assistant has answered all the questions it can today. Please come back tomorrow.",
      429,
    );
  }

  const parsed = chatRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json("Please send a question of up to 2,000 characters.", 400);

  const encoder = new TextEncoder();
  const events = streamChat(parsed.data);
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
