"use client";

import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Source = { title: string; url: string };
type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: boolean;
};

let nextId = 0;

export function SiteChat({ siteTitle }: { siteTitle: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the transcript changes
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function patchLast(update: (m: Message) => Message) {
    setMessages((prev) => [
      ...prev.slice(0, -1),
      update(prev[prev.length - 1]),
    ]);
  }

  async function ask() {
    const question = input.trim();
    if (!question || busy) return;
    const history = [
      ...messages.filter((m) => !m.error),
      { role: "user" as const, content: question },
    ];
    setMessages([
      ...messages,
      { id: nextId++, role: "user", content: question },
      { id: nextId++, role: "assistant", content: "", sources: [] },
    ]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the most recent turns are needed for context
        body: JSON.stringify({
          messages: history
            .slice(-11)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? "The assistant is unavailable right now.",
        );
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "delta")
            patchLast((m) => ({ ...m, content: m.content + event.text }));
          else if (event.type === "source")
            patchLast((m) => ({
              ...m,
              sources: [
                ...(m.sources ?? []),
                { title: event.title, url: event.url },
              ],
            }));
          else if (event.type === "reset")
            patchLast((m) => ({ ...m, content: "", sources: [] }));
          else if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (error) {
      patchLast((m) => ({
        id: m.id,
        role: "assistant",
        content: (error as Error).message,
        error: true,
      }));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground text-sm shadow-lg hover:bg-primary/90"
      >
        <MessageCircle className="size-4" /> Ask this site
      </button>
    );
  }

  return (
    <section
      aria-label={`Ask ${siteTitle}`}
      className="fixed right-4 bottom-4 z-40 flex h-[min(560px,calc(100svh-2rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-semibold text-sm">Ask {siteTitle}</h2>
          <p className="text-muted-foreground text-xs">
            AI answers from this site's content. They can be wrong.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded-md p-1 hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </header>

      <div
        ref={scroller}
        className="flex-1 space-y-4 overflow-y-auto p-4 text-sm"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-muted-foreground">
            Ask a question about anything published here, and I'll answer with
            links to the source.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={m.id}
              className="ml-8 rounded-lg bg-primary px-3 py-2 text-primary-foreground"
            >
              {m.content}
            </p>
          ) : (
            <div key={m.id} className="mr-8 space-y-2">
              <p
                className={
                  m.error
                    ? "rounded-lg bg-destructive/10 px-3 py-2 text-destructive"
                    : "whitespace-pre-wrap rounded-lg bg-muted px-3 py-2"
                }
              >
                {m.content ||
                  (busy && i === messages.length - 1 ? (
                    <span className="animate-pulse text-muted-foreground">
                      Searching…
                    </span>
                  ) : (
                    ""
                  ))}
              </p>
              {m.sources && m.sources.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {m.sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        className="block max-w-[16rem] truncate rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <label htmlFor="site-chat-input" className="sr-only">
          Your question
        </label>
        <textarea
          id="site-chat-input"
          ref={inputRef}
          rows={1}
          maxLength={2000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder="Ask a question…"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </section>
  );
}
