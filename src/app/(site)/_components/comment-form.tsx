"use client";

import { useActionState, useEffect, useRef } from "react";
import { postComment } from "../actions";

export type CommentFormProps = {
  postId: number;
  parentId?: number;
  viewerName: string | null;
  requireNameEmail: boolean;
  loginRequired: boolean;
  onDone?: () => void;
  onCancel?: () => void;
};

const field = "h-9 w-full rounded-lg border bg-background px-3 text-sm";

export function CommentForm({
  postId,
  parentId,
  viewerName,
  requireNameEmail,
  loginRequired,
  onDone,
  onCancel,
}: CommentFormProps) {
  const [state, action, pending] = useActionState(postComment, null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.message) {
      form.current?.reset();
      onDone?.();
    }
  }, [state, onDone]);

  if (loginRequired && !viewerName) {
    return (
      <p className="text-sm">
        You must be{" "}
        <a href="/login" className="text-primary underline">
          logged in
        </a>{" "}
        to post a comment.
      </p>
    );
  }

  const idFor = (name: string) => `${name}-${parentId ?? "root"}`;

  return (
    <form ref={form} action={action} className="grid gap-3 text-sm">
      <input type="hidden" name="post_id" value={postId} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Leave this empty
          <input name="hp_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-destructive"
        >
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-md bg-muted px-3 py-2">
          {state.message}
        </p>
      )}

      {viewerName ? (
        <p className="text-muted-foreground">Logged in as {viewerName}.</p>
      ) : (
        <p className="text-muted-foreground">
          Your email address will not be published.
          {requireNameEmail && " Name and email are required."}
        </p>
      )}

      <label htmlFor={idFor("comment")} className="grid gap-1.5">
        <span className="font-medium">Comment</span>
        <textarea
          id={idFor("comment")}
          name="comment"
          required
          rows={5}
          maxLength={65525}
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
      </label>

      {!viewerName && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label htmlFor={idFor("author")} className="grid gap-1.5">
            <span className="font-medium">Name{requireNameEmail && " *"}</span>
            <input
              id={idFor("author")}
              name="author"
              autoComplete="name"
              required={requireNameEmail}
              className={field}
            />
          </label>
          <label htmlFor={idFor("email")} className="grid gap-1.5">
            <span className="font-medium">Email{requireNameEmail && " *"}</span>
            <input
              id={idFor("email")}
              name="email"
              type="email"
              autoComplete="email"
              required={requireNameEmail}
              className={field}
            />
          </label>
          <label htmlFor={idFor("url")} className="grid gap-1.5">
            <span className="font-medium">Website</span>
            <input
              id={idFor("url")}
              name="url"
              type="url"
              autoComplete="url"
              className={field}
            />
          </label>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Posting…" : parentId ? "Post Reply" : "Post Comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:underline"
          >
            Cancel reply
          </button>
        )}
      </div>
    </form>
  );
}
