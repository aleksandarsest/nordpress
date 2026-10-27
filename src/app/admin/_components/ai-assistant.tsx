"use client";

import { getHTMLFromFragment } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html";
import type { Editor } from "@tiptap/react";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  stripFences,
  WRITE_ACTIONS,
  type WriteAction,
} from "@/lib/ai/write-prompts";
import { editorExtensions } from "@/lib/editor-extensions";
import { cn } from "@/lib/utils";

type Target = { from: number; to: number; hasSelection: boolean };
type Run = {
  action: WriteAction;
  instruction?: string;
  target: Target;
  selectionHtml: string;
};
type Status = "idle" | "streaming" | "done" | "error";

const REWRITE: WriteAction[] = [
  "improve",
  "fix",
  "shorter",
  "longer",
  "simplify",
  "professional",
  "friendly",
];

// Model output is untrusted: round-trip it through the editor schema so only
// supported, inert markup survives.
function sanitize(html: string) {
  try {
    return generateHTML(generateJSON(html, editorExtensions), editorExtensions);
  } catch {
    return "";
  }
}

export function AiAssistant({
  editor,
  title,
  onExcerpt,
  onApplied,
}: {
  editor: Editor;
  title: () => string;
  onExcerpt: (text: string) => void;
  /** Called when AI text is accepted into the post or its excerpt. */
  onApplied?: () => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  function captureTarget(): Omit<Run, "action" | "instruction"> {
    const { from, to, empty } = editor.state.selection;
    const doc = editor.state.doc;
    const target = empty
      ? { from: 0, to: doc.content.size, hasSelection: false }
      : { from, to, hasSelection: true };
    const selectionHtml = empty
      ? ""
      : getHTMLFromFragment(doc.slice(from, to).content, editor.schema);
    return { target, selectionHtml };
  }

  async function start(next: Run) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRun(next);
    setOutput("");
    setError("");
    setStatus("streaming");

    try {
      const res = await fetch("/api/ai/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: next.action,
          instruction: next.instruction,
          title: title(),
          documentText: editor.getText({ blockSeparator: "\n\n" }),
          selectionHtml: next.selectionHtml,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "The writing assistant is unavailable.");
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            text?: string;
            message?: string;
          };
          if (event.type === "delta") text += event.text ?? "";
          else if (event.type === "reset") text = "";
          else if (event.type === "error") throw new Error(event.message);
          setOutput(text);
        }
      }
      setStatus("done");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError((err as Error).message);
      setStatus("error");
    }
  }

  function choose(action: WriteAction) {
    if (action === "custom") {
      setAskOpen(true);
      return;
    }
    start({ action, ...captureTarget() });
  }

  function close() {
    abort.current?.abort();
    setRun(null);
    setStatus("idle");
  }

  const clean = stripFences(output);
  const isExcerpt = run?.action === "excerpt";
  const html = isExcerpt ? "" : sanitize(clean);

  function apply(mode: "replace" | "below") {
    if (!run) return;
    if (isExcerpt) {
      onExcerpt(clean);
    } else if (run.action === "continue") {
      editor
        .chain()
        .focus()
        .insertContentAt(editor.state.doc.content.size, html)
        .run();
    } else if (mode === "replace") {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: run.target.from, to: run.target.to }, html)
        .run();
    } else {
      editor.chain().focus().insertContentAt(run.target.to, html).run();
    }
    onApplied?.();
    close();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1 text-violet-600 dark:text-violet-400",
          )}
          aria-label="AI writing assistant"
        >
          <Sparkles /> AI
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {REWRITE.map((action) => (
            <DropdownMenuItem key={action} onClick={() => choose(action)}>
              {WRITE_ACTIONS[action]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => choose("continue")}>
            {WRITE_ACTIONS.continue}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => choose("excerpt")}>
            {WRITE_ACTIONS.excerpt}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => choose("custom")}>
            {WRITE_ACTIONS.custom}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask AI</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Applies to{" "}
            {editor.state.selection.empty
              ? "the whole post"
              : "the selected text"}
            .
          </p>
          <Textarea
            autoFocus
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Turn this into a bulleted list, or translate to Spanish"
            aria-label="Instruction"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!instruction.trim()}
              onClick={() => {
                setAskOpen(false);
                start({ action: "custom", instruction, ...captureTarget() });
              }}
            >
              Generate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={run !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-600" />
              {run ? WRITE_ACTIONS[run.action] : ""}
            </DialogTitle>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div
              aria-live="polite"
              className="max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-4"
            >
              {status === "streaming" && !clean && (
                <p className="animate-pulse text-muted-foreground text-sm">
                  Writing…
                </p>
              )}
              {isExcerpt || status === "streaming" ? (
                <p className="whitespace-pre-wrap text-sm">{clean}</p>
              ) : (
                <div
                  className="prose prose-sm prose-neutral dark:prose-invert max-w-none"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized through the editor schema above
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Discard
              </Button>
              {run && status !== "streaming" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => start(run)}
                >
                  Try again
                </Button>
              )}
            </div>
            {status === "done" && clean && (
              <div className="flex gap-2">
                {isExcerpt ? (
                  <Button type="button" onClick={() => apply("replace")}>
                    Use as excerpt
                  </Button>
                ) : run?.action === "continue" ? (
                  <Button type="button" onClick={() => apply("below")}>
                    Insert at end
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => apply("below")}
                    >
                      Insert below
                    </Button>
                    <Button type="button" onClick={() => apply("replace")}>
                      {run?.target.hasSelection
                        ? "Replace selection"
                        : "Replace post"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
