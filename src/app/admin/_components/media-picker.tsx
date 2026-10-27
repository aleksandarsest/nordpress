"use client";

import { Upload } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type PickerItem, pickMediaAction } from "../media/actions";

export async function uploadFiles(files: FileList | File[]) {
  const body = new FormData();
  for (const file of files) body.append("file", file);
  const res = await fetch("/api/media", { method: "POST", body });
  const data = (await res.json()) as {
    uploaded?: PickerItem[];
    errors?: string[];
    error?: string;
  };
  for (const message of data.errors ?? []) toast.error(message);
  if (data.error) toast.error(data.error);
  return data.uploaded ?? [];
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Select an image",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: PickerItem) => void;
  title?: string;
}) {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickerItem | null>(null);
  const [loading, startLoading] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    startLoading(async () => {
      const result = await pickMediaAction(search);
      setItems(result.items);
    });
  }, [open, search]);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles(files);
      setItems((prev) => [...uploaded, ...prev]);
      if (uploaded[0]) setSelected(uploaded[0]);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Search media"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload /> {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              onDoubleClick={() => onSelect(item)}
              className={cn(
                "aspect-square overflow-hidden rounded-md border-2 bg-muted",
                selected?.id === item.id
                  ? "border-primary"
                  : "border-transparent",
              )}
            >
              {/* biome-ignore lint/performance/noImgElement: arbitrary user uploads */}
              <img
                src={item.url}
                alt={item.alt || item.title}
                className="size-full object-cover"
              />
            </button>
          ))}
          {!loading && items.length === 0 && (
            <p className="col-span-full py-8 text-center text-muted-foreground text-sm">
              No images found. Upload one to get started.
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
          >
            Select
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
