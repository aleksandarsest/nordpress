"use client";

import {
  AlertTriangle,
  Check,
  CircleX,
  Loader2,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionPreview } from "@/lib/agent/tools";
import { cn } from "@/lib/utils";

// Loose shapes of the Messages API transcript; the server owns its meaning.
type Block = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};
type Message = { role: "user" | "assistant"; content: string | Block[] };
type Pending = {
  id: string;
  tool: string;
  title: string;
  preview: ActionPreview;
};

const SUGGESTIONS = [
  "What's waiting for me: drafts, pending posts and comments?",
  "Draft a post announcing our new contact form",
  "Find posts with no excerpt and suggest one for each",
  "Summarize this week's form responses",
];

const q = (v: unknown) => (v ? `“${String(v)}”` : "");

// A change the user turned down, in the present tense: it never happened.
function describeDeclined(name: string, input: Record<string, unknown> = {}) {
  switch (name) {
    case "create_post":
      return `create ${input.type === "page" ? "page" : "post"} ${q(input.title)}`;
    case "update_post":
      return `update item #${input.id}`;
    case "trash_post":
      return `move item #${input.id} to the trash`;
    case "moderate_comment":
      return `${input.action} comment #${input.id}`;
    case "reply_to_comment":
      return `reply to comment #${input.comment_id}`;
    default:
      return name;
  }
}

// What each tool call looks like in the transcript once it has run.
function describe(name: string, input: Record<string, unknown> = {}) {
  switch (name) {
    case "get_site_info":
      return "Checked the site and your permissions";
    case "search_content":
      return `Searched ${input.type === "page" ? "pages" : "posts"}${input.query ? ` for ${q(input.query)}` : ""}`;
    case "get_post":
      return `Read item #${input.id}`;
    case "list_categories_and_tags":
      return "Listed categories and tags";
    case "create_post":
      return `Created ${input.type === "page" ? "page" : "post"} ${q(input.title)}`;
    case "update_post":
      return `Updated item #${input.id}`;
    case "trash_post":
      return `Moved item #${input.id} to the trash`;
    case "list_comments":
      return `Looked at ${input.status ?? "pending"} comments`;
    case "moderate_comment":
      return `Comment #${input.id}: ${input.action}`;
    case "reply_to_comment":
      return `Replied to comment #${input.comment_id}`;
    case "get_form_responses":
      return input.form_id
        ? `Read responses to form #${input.form_id}`
        : "Listed forms";
    default:
      return name;
  }
}

// Plain text with clickable links; model output is never treated as HTML.
function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)<>"]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

function resultText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((c) => (c as Block).text ?? "").join("");
  return "";
}

const storageKey = (user: string) => `nordpress-assistant:${user}`;

export function AssistantChat({ userKey }: { userKey: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");
  // Saving waits until the saved conversation has been read back
  const [restored, setRestored] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Restore this tab's conversation after a reload
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(userKey));
      if (saved) {
        const data = JSON.parse(saved);
        setMessages(data.messages ?? []);
        setPending(data.pending ?? []);
      }
    } catch {
      // Storage may be unavailable; start fresh
    }
    setRestored(true);
  }, [userKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        storageKey(userKey),
        JSON.stringify({ messages, pending }),
      );
    } catch {
      // Not critical
    }
  }, [messages, pending, userKey, restored]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the transcript grows
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, busy]);

  async function send(payload: {
    input?: string;
    decisions?: Record<string, boolean>;
  }) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const optimistic = payload.input
      ? [...messages, { role: "user" as const, content: payload.input }]
      : messages;
    if (payload.input) setMessages(optimistic);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          input: payload.input,
          decisions: payload.decisions ?? {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Keep the transcript as it was; the user's text goes back in the box
        setMessages(messages);
        if (payload.input) setInput(payload.input);
        setError(data.error ?? "The assistant failed.");
        return;
      }
      setMessages(data.messages);
      setPending(data.pending ?? []);
      setDecisions({});
      if (data.notice) setNotice(data.notice);
    } catch {
      setMessages(messages);
      if (payload.input) setInput(payload.input);
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy || pending.length) return;
    setInput("");
    void send({ input: text });
  }

  function decide(id: string, approved: boolean) {
    const next = { ...decisions, [id]: approved };
    setDecisions(next);
    // Carry on once every proposed change has an answer
    if (pending.every((p) => next[p.id] !== undefined))
      void send({ decisions: next });
  }

  function decideAll(approved: boolean) {
    void send({
      decisions: Object.fromEntries(pending.map((p) => [p.id, approved])),
    });
  }

  function reset() {
    setMessages([]);
    setPending([]);
    setDecisions({});
    setError(null);
    setNotice(null);
  }

  // Pair each tool call with its result for the activity rows
  const results = new Map<string, Block>();
  for (const m of messages)
    if (m.role === "user" && Array.isArray(m.content))
      for (const b of m.content)
        if (b.type === "tool_result" && b.tool_use_id)
          results.set(b.tool_use_id, b);
  const pendingIds = new Set(pending.map((p) => p.id));

  const rows: ReactNode[] = [];
  messages.forEach((m, mi) => {
    const blocks: Block[] =
      typeof m.content === "string"
        ? [{ type: "text", text: m.content }]
        : m.content;
    blocks.forEach((b, bi) => {
      const key = `${mi}-${bi}`;
      if (b.type === "text" && b.text?.trim()) {
        rows.push(
          m.role === "user" ? (
            <div key={key} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground text-sm">
                {b.text}
              </p>
            </div>
          ) : (
            <p
              key={key}
              className="max-w-[90%] whitespace-pre-wrap break-words text-sm leading-relaxed"
            >
              <RichText text={b.text} />
            </p>
          ),
        );
      } else if (b.type === "tool_use" && b.id && !pendingIds.has(b.id)) {
        const result = results.get(b.id);
        const failed = result?.is_error;
        const declined =
          failed && resultText(result.content).startsWith("The user declined");
        rows.push(
          <div
            key={key}
            className="flex items-start gap-2 text-muted-foreground text-xs"
          >
            {!result ? (
              <Loader2 className="mt-0.5 size-3.5 animate-spin" />
            ) : declined ? (
              <X className="mt-0.5 size-3.5" />
            ) : failed ? (
              <CircleX className="mt-0.5 size-3.5 text-destructive" />
            ) : (
              <Check className="mt-0.5 size-3.5 text-emerald-600" />
            )}
            <span>
              {declined
                ? `You declined: ${describeDeclined(b.name ?? "", b.input)}`
                : describe(b.name ?? "", b.input)}
              {failed && !declined && (
                <span className="block text-destructive">
                  {resultText(result.content)}
                </span>
              )}
            </span>
          </div>,
        );
      }
    });
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-background">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="grid gap-2 py-6">
            <p className="text-center text-muted-foreground text-sm">
              Try one of these, or ask anything about your site.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send({ input: s })}
                  disabled={busy}
                  className="rounded-lg border p-3 text-left text-sm hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {rows}
        {pending.map((p) => (
          <ApprovalCard
            key={p.id}
            action={p}
            decision={decisions[p.id]}
            disabled={busy}
            onDecide={(approved) => decide(p.id, approved)}
          />
        ))}
        {pending.length > 1 && (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => decideAll(true)}>
              Approve all {pending.length}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => decideAll(false)}
            >
              Decline all
            </Button>
          </div>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Working…
          </p>
        )}
        {notice && (
          <p className="text-muted-foreground text-sm italic">{notice}</p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
        <Textarea
          aria-label="Message the assistant"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            pending.length
              ? "Approve or decline the proposed change first"
              : "Ask the assistant…"
          }
          disabled={busy || pending.length > 0}
          className="min-h-0 resize-none"
        />
        <div className="flex flex-col gap-1">
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={busy || pending.length > 0 || !input.trim()}
          >
            <Send />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="New conversation"
            title="New conversation"
            disabled={busy || messages.length === 0}
            onClick={reset}
          >
            <RotateCcw />
          </Button>
        </div>
      </form>
    </div>
  );
}

function ApprovalCard({
  action,
  decision,
  disabled,
  onDecide,
}: {
  action: Pending;
  decision: boolean | undefined;
  disabled: boolean;
  onDecide: (approved: boolean) => void;
}) {
  const { preview } = action;
  return (
    <section
      aria-label={`Proposed change: ${preview.summary}`}
      className={cn(
        "grid gap-3 rounded-lg border-2 p-4 text-sm",
        decision === undefined
          ? "border-primary/40 bg-primary/5"
          : decision
            ? "border-emerald-500/40"
            : "border-muted opacity-60",
      )}
    >
      <p className="font-medium">{preview.summary}</p>
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
      {decision === undefined ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => onDecide(true)}>
            <Check /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onDecide(false)}
          >
            <X /> Decline
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {decision ? "Approved" : "Declined"}
        </p>
      )}
    </section>
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
