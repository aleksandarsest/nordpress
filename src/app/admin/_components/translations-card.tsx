"use client";

import { Languages } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { languageName } from "@/lib/i18n";
import { createTranslationAction } from "../posts/actions";
import type { EditorOptions } from "./post-editor";

// Lives inside the editor's form: its buttons call the action directly
// instead of submitting the post.
export function TranslationsCard({
  postId,
  options,
}: {
  postId: number;
  options: EditorOptions;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const have = new Map(options.translations.map((t) => [t.lang, t]));
  const missing = options.languages.filter((l) => !have.has(l));

  function translate(lang: string) {
    setError(null);
    setWorking(lang);
    start(async () => {
      const result = await createTranslationAction(postId, lang);
      setWorking(null);
      if (result.error || !result.id)
        setError(result.error ?? "Something went wrong.");
      else router.push(`/admin/posts/${result.id}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-4" /> Translations
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {options.translations.length > 1 && (
          <ul className="grid gap-1">
            {options.translations.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2"
              >
                {t.id === postId ? (
                  <span className="font-medium">
                    {languageName(t.lang, "en")} (this)
                  </span>
                ) : (
                  <Link
                    href={`/admin/posts/${t.id}`}
                    className="text-primary hover:underline"
                  >
                    {languageName(t.lang, "en")}
                  </Link>
                )}
                <span className="text-muted-foreground text-xs">
                  {t.status === "publish" ? "Published" : "Draft"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {missing.map((lang) => (
          <Button
            key={lang}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => translate(lang)}
          >
            {working === lang
              ? options.ai
                ? "Translating…"
                : "Creating…"
              : `${options.ai ? "Translate" : "Add translation"}: ${languageName(lang, "en")}`}
          </Button>
        ))}
        {missing.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {options.ai
              ? "Claude drafts it in your brand voice; you review and publish."
              : "Creates a draft copy to translate."}{" "}
            Save your changes first.
          </p>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}
