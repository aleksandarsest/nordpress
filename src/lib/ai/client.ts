import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { type AiModel, getSettings } from "../options";

// The SDK also reads `ant auth login` profiles, but only an env credential
// can be detected cheaply, so that is what gates the UI.
export function aiConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;
export function anthropic() {
  client ??= new Anthropic();
  return client;
}

export class AiError extends Error {}

// Everything a feature needs before calling the model.
export async function aiContext() {
  const settings = await getSettings();
  if (!settings.aiEnabled)
    throw new AiError("AI features are turned off in Settings → AI.");
  if (!aiConfigured()) {
    throw new AiError(
      "AI isn't set up yet: add ANTHROPIC_API_KEY to the server environment.",
    );
  }
  return { client: anthropic(), model: settings.aiModel, settings };
}

// Opts declined requests into Anthropic's recommended fallback model.
// Haiku has no server-side fallback, so it simply reports the refusal.
export function fallbackParams(model: AiModel) {
  if (model === "claude-haiku-5-5") return { betas: [] as string[] };
  return {
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
}

export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export async function recordUsage(entry: {
  userId: string | null;
  feature: string;
  model: string;
  usage?: Usage | null;
  outcome?: "ok" | "refused" | "error";
}) {
  try {
    await db.insert(aiUsage).values({
      userId: entry.userId,
      feature: entry.feature,
      model: entry.model,
      inputTokens: entry.usage?.input_tokens ?? 0,
      outputTokens: entry.usage?.output_tokens ?? 0,
      cacheReadTokens: entry.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: entry.usage?.cache_creation_input_tokens ?? 0,
      outcome: entry.outcome ?? "ok",
    });
  } catch (error) {
    // Logging must never break the feature itself
    console.error("[ai] failed to record usage", error);
  }
}

export const REFUSAL_MESSAGE =
  "The AI declined this request. Try rephrasing it or editing the content.";

// Turns SDK errors into messages an editor can act on.
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError(
      "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.",
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("This API key isn't allowed to use the selected model.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError(
      "The AI service is busy right now. Please try again in a moment.",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", error.message);
    return new AiError("The AI couldn't process this content.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError(
      "Couldn't reach the AI service. Check the server's network connection.",
    );
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[ai] API error", error.status, error.message);
    return new AiError("The AI service had a problem. Please try again.");
  }
  console.error("[ai] unexpected error", error);
  return new AiError("Something went wrong with the AI request.");
}
