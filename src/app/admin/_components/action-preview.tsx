import { AlertTriangle } from "lucide-react";
import type { ActionPreview } from "@/lib/agent/tools";
import { cn } from "@/lib/utils";

// What an AI-proposed change will do, shown before a person approves it.
// Used by the admin assistant and the AI inbox.
export function ActionPreviewView({
  preview,
  showSummary = true,
}: {
  preview: ActionPreview;
  showSummary?: boolean;
}) {
  return (
    <>
      {showSummary && <p className="font-medium">{preview.summary}</p>}
      {preview.image && (
        // biome-ignore lint/performance/noImgElement: a small preview of an uploaded image
        <img
          src={preview.image}
          alt=""
          className="max-h-40 w-auto self-start rounded-md border"
        />
      )}
      {preview.warning && (
        <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {preview.warning}
        </p>
      )}
      {preview.details.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {preview.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd>
                {d.before !== undefined && (
                  <>
                    <span className="text-muted-foreground line-through">
                      {d.before || "(empty)"}
                    </span>{" "}
                    →{" "}
                  </>
                )}
                {d.after || "(empty)"}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {preview.body && (
        <div
          className={cn(
            "grid gap-2",
            preview.body.before !== undefined && "md:grid-cols-2",
          )}
        >
          {preview.body.before !== undefined && (
            <BodyPane label="Before" text={preview.body.before} muted />
          )}
          <BodyPane
            label={preview.body.before !== undefined ? "After" : "Content"}
            text={preview.body.after}
          />
        </div>
      )}
    </>
  );
}

function BodyPane({
  label,
  text,
  muted,
}: {
  label: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <pre
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-sans text-xs leading-relaxed",
          muted && "text-muted-foreground",
        )}
      >
        {text || "(empty)"}
      </pre>
    </div>
  );
}
