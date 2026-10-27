import "server-only";
import {
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";
import { withGuidance } from "./voice";
import {
  buildWriteMessage,
  WRITE_SYSTEM,
  type WriteRequest,
} from "./write-prompts";

// Events streamed to the editor as newline-delimited JSON.
export type WriteEvent =
  | { type: "delta"; text: string }
  // The first model declined mid-answer and a fallback model took over:
  // drop what was shown so far.
  | { type: "reset" }
  | { type: "error"; message: string }
  | { type: "done" };

export async function* streamWrite(
  req: WriteRequest,
  userId: string,
): AsyncGenerator<WriteEvent> {
  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const stream = ctx.client.beta.messages.stream({
      model: ctx.model,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system: withGuidance(WRITE_SYSTEM, ctx.settings),
      messages: [{ role: "user", content: buildWriteMessage(req) }],
      ...fallbackParams(ctx.model),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_start" &&
        event.content_block.type === "fallback"
      ) {
        yield { type: "reset" };
      } else if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "delta", text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      await recordUsage({
        userId,
        feature: "write",
        model,
        usage: final.usage,
        outcome: "refused",
      });
      yield { type: "reset" };
      yield { type: "error", message: REFUSAL_MESSAGE };
      return;
    }
    await recordUsage({
      userId,
      feature: "write",
      model: final.model,
      usage: final.usage,
    });
    yield { type: "done" };
  } catch (error) {
    if (model)
      await recordUsage({ userId, feature: "write", model, outcome: "error" });
    yield { type: "error", message: toAiError(error).message };
  }
}
