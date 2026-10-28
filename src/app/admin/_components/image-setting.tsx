"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "./media-picker";

// An image chosen from the media library, submitted with the surrounding
// form as a hidden media id.
export function ImageSetting({
  name,
  initial,
  title,
  className = "h-12 max-w-48",
}: {
  name: string;
  initial: { id: number; url: string } | null;
  title: string;
  className?: string;
}) {
  const [image, setImage] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={name} value={image?.id ?? ""} />
      {image && (
        // biome-ignore lint/performance/noImgElement: the owner's own upload
        <img
          src={image.url}
          alt=""
          className={`${className} rounded border object-contain`}
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {image ? "Change" : "Choose"}
      </Button>
      {image && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setImage(null)}
        >
          Remove
        </Button>
      )}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        title={title}
        onSelect={(item) => {
          setImage({ id: item.id, url: item.url });
          setOpen(false);
        }}
      />
    </div>
  );
}
