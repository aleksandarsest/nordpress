"use client";

import { useState } from "react";
import { CommentForm, type CommentFormProps } from "./comment-form";

export type ThreadNode = {
  id: number;
  authorName: string;
  authorUrl: string;
  isStaff: boolean;
  date: string;
  isoDate: string;
  content: string;
  children: ThreadNode[];
};

type FormSettings = Omit<CommentFormProps, "parentId" | "onDone" | "onCancel">;

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/g;

// Plain text with paragraphs and links; React escapes everything else.
// Splits text into chunks tagged with their offset, which makes a stable key.
function chunks(text: string, pattern: RegExp) {
  let offset = 0;
  return text.split(pattern).map((value, index) => {
    const chunk = { value, index, offset };
    offset += value.length;
    return chunk;
  });
}

function CommentBody({ text }: { text: string }) {
  return chunks(text, /(\n{2,})/)
    .filter((p) => p.index % 2 === 0 && p.value.trim())
    .map((para) => (
      <p key={para.offset} className="whitespace-pre-line">
        {chunks(para.value, URL_PATTERN).map((part) =>
          part.index % 2 === 1 ? (
            <a
              key={part.offset}
              href={part.value}
              rel="nofollow ugc noopener"
              className="text-primary underline"
            >
              {part.value}
            </a>
          ) : (
            part.value
          ),
        )}
      </p>
    ));
}

export function CommentThread({
  nodes,
  form,
  depth = 1,
  maxDepth,
}: {
  nodes: ThreadNode[];
  form: FormSettings | null;
  depth?: number;
  maxDepth: number;
}) {
  const [replyTo, setReplyTo] = useState<number | null>(null);

  return (
    <ol className={depth > 1 ? "mt-4 grid gap-4 border-l pl-5" : "grid gap-6"}>
      {nodes.map((node) => (
        <li key={node.id} id={`comment-${node.id}`}>
          <article className="grid gap-2">
            <header className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-muted font-medium text-xs"
              >
                {node.authorName.slice(0, 1).toUpperCase()}
              </span>
              <span className="font-medium">
                {node.authorUrl ? (
                  <a
                    href={node.authorUrl}
                    rel="nofollow ugc noopener"
                    className="hover:underline"
                  >
                    {node.authorName}
                  </a>
                ) : (
                  node.authorName
                )}
              </span>
              {node.isStaff && (
                <span className="rounded bg-muted px-1.5 text-muted-foreground text-xs">
                  Author
                </span>
              )}
              <a
                href={`#comment-${node.id}`}
                className="text-muted-foreground text-xs hover:underline"
              >
                <time dateTime={node.isoDate}>{node.date}</time>
              </a>
            </header>
            <div className="grid gap-2 text-foreground/90 text-sm leading-relaxed">
              <CommentBody text={node.content} />
            </div>
            {form && depth < maxDepth && replyTo !== node.id && (
              <button
                type="button"
                onClick={() => setReplyTo(node.id)}
                className="justify-self-start text-primary text-xs hover:underline"
              >
                Reply<span className="sr-only"> to {node.authorName}</span>
              </button>
            )}
            {form && replyTo === node.id && (
              <div className="mt-2 rounded-lg border p-4">
                <CommentForm
                  {...form}
                  parentId={node.id}
                  onCancel={() => setReplyTo(null)}
                />
              </div>
            )}
          </article>
          {node.children.length > 0 && (
            <CommentThread
              nodes={node.children}
              form={form}
              depth={depth + 1}
              maxDepth={maxDepth}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
