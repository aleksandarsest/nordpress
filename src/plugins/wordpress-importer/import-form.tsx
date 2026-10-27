"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ImportJob } from "./importer";

const API = "/wp-json/wordpress-importer/v1";

const COUNT_LABELS: [keyof ImportJob["counts"], string][] = [
  ["posts", "Posts"],
  ["pages", "Pages"],
  ["comments", "Comments"],
  ["categories", "Categories"],
  ["tags", "Tags"],
  ["media", "Media files"],
  ["users", "New authors"],
  ["menus", "Menus"],
  ["skipped", "Skipped"],
  ["failed", "Failed"],
];

export function ImportForm() {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch(`${API}/status`, { cache: "no-store" });
    const data = (await res.json()) as ImportJob | null;
    setJob(data);
    if (data?.status === "running") timer.current = setTimeout(poll, 1500);
  }, []);

  useEffect(() => {
    poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  async function submit(form: HTMLFormElement) {
    setError("");
    setUploading(true);
    try {
      const res = await fetch(`${API}/import`, {
        method: "POST",
        body: new FormData(form),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message ?? "The import couldn't start.");
      setJob(data);
      timer.current = setTimeout(poll, 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const running = job?.status === "running";
  const pct = job?.progress.total
    ? Math.round((job.progress.done / job.progress.total) * 100)
    : 0;

  return (
    <div className="grid gap-8">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        className="grid gap-5 rounded-lg border bg-background p-5 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="wxr-file">Export file (.xml)</Label>
          <input
            id="wxr-file"
            name="file"
            type="file"
            accept=".xml,application/xml,text/xml"
            required
            disabled={running}
          />
        </div>
        <fieldset className="grid gap-2" disabled={running}>
          <legend className="mb-1 font-medium">Authors</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="author_mode"
              value="match"
              defaultChecked
            />{" "}
            Match existing users by email, otherwise assign to me
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="author_mode" value="create" /> Match by
            email, and create accounts for new authors
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="author_mode" value="me" /> Assign
            everything to me
          </label>
        </fieldset>
        <Label className="font-normal">
          <Checkbox name="download_media" defaultChecked disabled={running} />{" "}
          Download images and files from the old site
        </Label>
        <p className="-mt-3 ml-6 text-muted-foreground text-xs">
          The old site must still be online. If you skip this, posts keep
          pointing at images on the old site.
        </p>
        <div>
          <Button type="submit" disabled={uploading || running}>
            {uploading
              ? "Uploading…"
              : running
                ? "Import running…"
                : "Upload and import"}
          </Button>
        </div>
      </form>

      {job && (
        <section aria-live="polite" className="grid gap-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold text-base">
              {job.status === "running"
                ? "Importing"
                : job.status === "done"
                  ? "Import complete"
                  : "Import stopped"}
              {job.source ? ` from ${job.source}` : ""}
            </h2>
            <span className="text-muted-foreground">{job.phase}</span>
          </div>
          {job.status === "running" && (
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {COUNT_LABELS.filter(
              ([key]) =>
                job.counts[key] > 0 ||
                ["posts", "pages", "comments"].includes(key),
            ).map(([key, label]) => (
              <div key={key} className="rounded-md border bg-background p-3">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="font-semibold text-lg">{job.counts[key]}</dd>
              </div>
            ))}
          </dl>
          {job.log.length > 0 && (
            <details
              open={job.status !== "done"}
              className="rounded-md border bg-background p-3"
            >
              <summary className="cursor-pointer font-medium">
                Notes ({job.log.length})
              </summary>
              <ul className="mt-2 grid max-h-64 gap-1 overflow-y-auto text-muted-foreground text-xs">
                {job.log.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: log lines are append-only
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
          {job.status === "done" && (
            <div className="flex gap-4">
              <Link
                href="/admin/posts"
                className="text-primary hover:underline"
              >
                View posts
              </Link>
              <Link
                href="/admin/pages"
                className="text-primary hover:underline"
              >
                View pages
              </Link>
              <Link href="/" className="text-primary hover:underline">
                Visit site
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
