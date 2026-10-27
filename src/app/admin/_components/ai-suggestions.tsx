"use client";

import { Check, Plus, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostSuggestions } from "@/lib/ai/suggest";
import { suggestPostAction } from "../ai/actions";

export type SuggestionTargets = {
  title: string;
  slug: string;
  excerpt: string;
  categoryIds: number[];
  tags: string[];
};

export function AiSuggestions({
  postType,
  read,
  apply,
}: {
  postType: "post" | "page";
  /** Current title and plain-text content, read when suggestions are requested. */
  read: () => { title: string; contentText: string };
  apply: (patch: Partial<SuggestionTargets>) => void;
}) {
  const [result, setResult] = useState<PostSuggestions | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function suggest() {
    setError("");
    startTransition(async () => {
      const res = await suggestPostAction(read());
      if (res.ok) {
        setResult(res.data);
        setApplied(new Set());
      } else {
        setError(res.error);
      }
    });
  }

  function mark(key: string, patch: Partial<SuggestionTargets>) {
    apply(patch);
    setApplied((prev) => new Set(prev).add(key));
  }

  const done = (key: string) => applied.has(key);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-600" /> AI Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {!result && (
          <p className="text-muted-foreground text-xs">
            Suggest titles, an excerpt, a slug
            {postType === "post" ? ", categories and tags" : ""} from your
            content. Nothing changes until you apply it.
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <>
            {result.titles.length > 0 && (
              <Section label="Titles">
                {result.titles.map((title, i) => (
                  <ApplyRow
                    key={title}
                    done={done(`title-${i}`)}
                    onApply={() => mark(`title-${i}`, { title })}
                  >
                    {title}
                  </ApplyRow>
                ))}
              </Section>
            )}
            {result.excerpt && (
              <Section label="Excerpt">
                <ApplyRow
                  done={done("excerpt")}
                  onApply={() => mark("excerpt", { excerpt: result.excerpt })}
                >
                  <span className="text-muted-foreground">
                    {result.excerpt}
                  </span>
                </ApplyRow>
              </Section>
            )}
            {result.slug && (
              <Section label="Slug">
                <ApplyRow
                  done={done("slug")}
                  onApply={() => mark("slug", { slug: result.slug })}
                >
                  <code className="text-xs">{result.slug}</code>
                </ApplyRow>
              </Section>
            )}
            {postType === "post" && result.categories.length > 0 && (
              <Section label="Categories">
                <ApplyRow
                  done={done("categories")}
                  onApply={() =>
                    mark("categories", {
                      categoryIds: result.categories.map((c) => c.id),
                    })
                  }
                >
                  {result.categories.map((c) => c.name).join(", ")}
                </ApplyRow>
              </Section>
            )}
            {postType === "post" && result.tags.length > 0 && (
              <Section label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((t) => (
                    <Badge
                      key={t.name}
                      variant={t.isNew ? "outline" : "secondary"}
                      title={t.isNew ? "New tag" : "Existing tag"}
                    >
                      {t.name}
                      {t.isNew && <span className="sr-only"> (new)</span>}
                    </Badge>
                  ))}
                </div>
                <ApplyRow
                  done={done("tags")}
                  onApply={() =>
                    mark("tags", { tags: result.tags.map((t) => t.name) })
                  }
                >
                  <span className="text-muted-foreground text-xs">
                    Add all tags
                  </span>
                </ApplyRow>
              </Section>
            )}
          </>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={suggest}
        >
          <Sparkles />{" "}
          {pending ? "Thinking…" : result ? "Suggest again" : "Suggest"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ApplyRow({
  children,
  done,
  onApply,
}: {
  children: React.ReactNode;
  done: boolean;
  onApply: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 break-words">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onApply}
        aria-label={done ? "Applied" : "Apply"}
        title={done ? "Applied" : "Apply"}
      >
        {done ? <Check className="text-green-600" /> : <Plus />}
      </Button>
    </div>
  );
}
