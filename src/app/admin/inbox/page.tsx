import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { aiConfigured } from "@/lib/ai/client";
import { listOpenSuggestions } from "@/lib/inbox";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { ActionPreviewView } from "../_components/action-preview";
import {
  applySuggestionAction,
  dismissSuggestionAction,
  runChecksAction,
} from "./actions";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const viewer = await requireViewer("edit_others_posts");
  const [items, settings] = await Promise.all([
    listOpenSuggestions(viewer),
    getSettings(),
  ]);
  const ai = settings.aiEnabled && aiConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">Inbox</h1>
      <p className="mb-4 text-muted-foreground text-sm">
        Nordpress checks the site every day for posts missing an excerpt, images
        without alt text, links that lead nowhere, and work waiting for you.
        {ai
          ? " Where it can, Claude drafts the fix; nothing changes until you approve it."
          : " With ANTHROPIC_API_KEY set, Claude also drafts excerpts and alt text for you to approve."}
      </p>
      <ActionForm
        action={runChecksAction}
        className="mb-8 flex flex-wrap items-center gap-3 text-sm"
      >
        <SubmitButton size="sm" variant="outline" pendingLabel="Checking…">
          Run checks now
        </SubmitButton>
        <span className="text-muted-foreground">
          {settings.inboxLastRun
            ? `Last checked ${formatDistanceToNow(new Date(settings.inboxLastRun), { addSuffix: true })}.`
            : "Not checked yet."}
          {!settings.inboxEnabled && " Daily checks are off (Settings → AI)."}
        </span>
      </ActionForm>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          Nothing needs your attention.
        </p>
      ) : (
        <ol className="grid gap-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 rounded-lg border bg-background p-4 text-sm"
            >
              <div className="flex flex-wrap items-start gap-2">
                <p className="font-medium">{item.title}</p>
                {item.link && (
                  <Link
                    href={item.link}
                    className="ml-auto flex items-center gap-1 text-primary text-xs hover:underline"
                  >
                    Open <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
              {item.detail && (
                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                  {item.detail}
                </p>
              )}
              {item.preview?.ok && (
                <div className="grid gap-3 rounded-md border-2 border-primary/30 bg-primary/5 p-3">
                  <span className="text-muted-foreground text-xs">
                    Proposed fix
                  </span>
                  <ActionPreviewView
                    preview={item.preview.preview}
                    showSummary={false}
                  />
                </div>
              )}
              {item.preview && !item.preview.ok && (
                <p className="text-destructive text-xs">
                  This fix can't be applied any more: {item.preview.text}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {item.preview?.ok && (
                  <ActionForm action={applySuggestionAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <SubmitButton size="sm" pendingLabel="Applying…">
                      Approve
                    </SubmitButton>
                  </ActionForm>
                )}
                <form action={dismissSuggestionAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Dismiss
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
