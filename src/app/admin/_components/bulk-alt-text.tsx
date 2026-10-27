"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkAltTextAction } from "../ai/actions";

export function BulkAltText({ missing }: { missing: number }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  if (missing === 0 && !message) return null;

  function run() {
    setMessage("");
    startTransition(async () => {
      const res = await bulkAltTextAction();
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const { updated, failed, remaining } = res.data;
      setMessage(
        [
          `Added alt text to ${updated} image${updated === 1 ? "" : "s"}.`,
          failed ? `${failed} couldn't be processed.` : "",
          remaining ? "Run again to continue with the rest." : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm dark:border-violet-900 dark:bg-violet-950/30">
      <Sparkles className="size-4 text-violet-600" />
      <span className="flex-1" aria-live="polite">
        {message ||
          `${missing} image${missing === 1 ? " is" : "s are"} missing alt text.`}
      </span>
      {missing > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={run}
          disabled={pending}
        >
          {pending ? "Generating…" : "Generate with AI"}
        </Button>
      )}
    </div>
  );
}
