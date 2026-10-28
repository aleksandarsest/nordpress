"use client";

import { useActionState } from "react";
import { type SubscribeState, subscribeAction } from "./actions";

const control =
  "h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function NewsletterSignup({
  title,
  description,
  compact = false,
}: {
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(
    subscribeAction,
    null,
  );
  return (
    <section
      aria-label="Newsletter"
      className="not-prose my-10 grid gap-3 rounded-xl border p-6 text-sm"
    >
      {title && <h2 className="font-semibold text-lg">{title}</h2>}
      {description && <p className="text-muted-foreground">{description}</p>}
      {state?.ok ? (
        <p role="status" className="rounded-md bg-muted/60 px-3 py-2">
          Almost done: check your inbox and click the link to confirm.
        </p>
      ) : (
        <form action={action} className="grid gap-3 sm:flex sm:items-end">
          <div aria-hidden className="absolute -left-[9999px]">
            <label>
              Leave this empty
              <input name="_hp" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {!compact && (
            <label className="grid gap-1 sm:flex-1">
              <span>Name (optional)</span>
              <input name="name" autoComplete="name" className={control} />
            </label>
          )}
          <label className="grid gap-1 sm:flex-[2]">
            <span className={compact ? "sr-only" : undefined}>Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={control}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-foreground px-4 font-medium text-background disabled:opacity-60"
          >
            {pending ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
      )}
      {state?.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
    </section>
  );
}
