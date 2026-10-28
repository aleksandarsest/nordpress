"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Uploads with fetch instead of a form: backups are often larger than server
// actions accept, and the route streams the file instead of buffering it.
export function RestoreUpload({ siteTitle }: { siteTitle: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(
    null,
  );

  async function restore() {
    if (!file) return;
    setPending(true);
    setNote(null);
    try {
      const res = await fetch("/admin/backups/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/gzip",
          "X-Nordpress-Restore": "yes",
        },
        body: file,
      });
      const data = await res.json();
      if (!res.ok)
        setNote({ text: data.error ?? "Restoring failed.", error: true });
      else {
        setNote({
          text: `Restored the backup from ${new Date(data.from).toLocaleString()}: ${data.rows} rows and ${data.files} files. The site as it was is saved as ${data.safety}.`,
        });
        router.refresh();
      }
    } catch {
      setNote({
        text: "The upload was interrupted. Nothing was changed.",
        error: true,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      {note && (
        <Alert variant={note.error ? "destructive" : "default"}>
          <AlertDescription>{note.text}</AlertDescription>
        </Alert>
      )}
      <Input
        type="file"
        accept=".gz,application/gzip"
        aria-label="Backup file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="restore-upload-confirm">
          Type the site title, “{siteTitle}”, to confirm
        </Label>
        <Input
          id="restore-upload-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="justify-self-start"
        disabled={!file || confirm.trim() !== siteTitle.trim() || pending}
        onClick={restore}
      >
        {pending
          ? "Restoring… keep this page open"
          : "Replace the site with this backup"}
      </Button>
    </div>
  );
}
