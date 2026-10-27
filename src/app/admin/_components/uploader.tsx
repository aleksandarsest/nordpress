"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadFiles } from "./media-picker";

export function Uploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded = await uploadFiles(files);
      if (uploaded.length)
        toast.success(
          `Uploaded ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}.`,
        );
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section
      aria-label="Upload files"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        upload(e.dataTransfer.files);
      }}
      className={cn(
        "mb-6 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-background p-8 text-center text-sm",
        dragging && "border-primary bg-primary/5",
      )}
    >
      <p className="font-medium">Drop files to upload</p>
      <p className="text-muted-foreground">or</p>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Upload /> {busy ? "Uploading…" : "Select Files"}
      </Button>
      <p className="text-muted-foreground text-xs">
        Maximum upload file size: 20 MB.
      </p>
    </section>
  );
}
