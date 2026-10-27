import type { Metadata } from "next";
import Link from "next/link";
import { aiConfigured } from "@/lib/ai/client";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { AssistantChat } from "./assistant-chat";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const viewer = await requireViewer("edit_posts");
  const settings = await getSettings();
  const ready = settings.aiEnabled && aiConfigured();

  return (
    <div className="mx-auto flex h-[calc(100svh-7rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="font-semibold text-2xl tracking-tight">Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Ask Claude to find, write or tidy up content, work through comments or
          summarize form responses. You approve every change before it happens.
        </p>
      </div>
      {ready ? (
        <AssistantChat userKey={viewer.id} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
          The assistant needs AI turned on and ANTHROPIC_API_KEY set.{" "}
          <Link href="/admin/settings/ai" className="text-primary underline">
            Settings → AI
          </Link>
        </p>
      )}
    </div>
  );
}
