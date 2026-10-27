"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { altTextAction } from "../ai/actions";

// Alt text and caption fields, with an optional AI button that fills them in
// for review before saving.
export function AltTextFields({
  mediaId,
  alt: initialAlt,
  caption: initialCaption,
  isImage,
  ai,
}: {
  mediaId: number;
  alt: string;
  caption: string;
  isImage: boolean;
  ai: boolean;
}) {
  const [alt, setAlt] = useState(initialAlt);
  const [caption, setCaption] = useState(initialCaption);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function generate() {
    setNote("");
    startTransition(async () => {
      const res = await altTextAction(mediaId);
      if (!res.ok) {
        setNote(res.error);
        return;
      }
      setAlt(res.data.alt);
      if (!caption && res.data.caption) setCaption(res.data.caption);
      setNote(
        res.data.decorative
          ? "The AI thinks this image is decorative, so it left the alt text empty. Review, then click Update."
          : "Review the suggestion, then click Update to save it.",
      );
    });
  }

  return (
    <>
      {isImage && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="alt">Alternative Text</Label>
            {ai && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={generate}
                disabled={pending}
                className="text-violet-600 dark:text-violet-400"
              >
                <Sparkles /> {pending ? "Looking…" : "Generate with AI"}
              </Button>
            )}
          </div>
          <Textarea
            id="alt"
            name="alt"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            rows={2}
          />
          <span className="text-muted-foreground text-xs" aria-live="polite">
            {note ||
              "Describe the purpose of the image. Leave empty if it is purely decorative."}
          </span>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="caption">Caption</Label>
        <Textarea
          id="caption"
          name="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
        />
      </div>
    </>
  );
}
