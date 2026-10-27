"use client";

import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import {
  type Editor,
  EditorContent,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import {
  Bold,
  ClipboardList,
  Code,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  SquareCode,
  Strikethrough,
  Underline,
  Undo,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { editorExtensions } from "@/lib/editor-extensions";
import { cn } from "@/lib/utils";
import { MediaPicker } from "./media-picker";

export function RichTextEditor({
  initialContent,
  onChange,
  toolbarEnd,
  forms = [],
}: {
  initialContent: JSONContent | null;
  /** Forms that can be embedded with the toolbar's Form button. */
  forms?: { id: number; title: string }[];
  onChange: (doc: JSONContent) => void;
  /** Extra controls rendered at the end of the toolbar (e.g. the AI menu). */
  toolbarEnd?: (editor: Editor) => ReactNode;
}) {
  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[50vh] px-6 py-5 outline-none",
        "aria-label": "Content",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  return (
    <div className="rounded-lg border bg-background">
      {editor && (
        <Toolbar editor={editor} end={toolbarEnd?.(editor)} forms={forms} />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({
  editor,
  end,
  forms,
}: {
  editor: Editor;
  end?: ReactNode;
  forms: { id: number; title: string }[];
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function openLink() {
    setLinkHref(editor.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  function applyLink() {
    const href = linkHref.trim();
    if (href) chain().extendMarkRange("link").setLink({ href }).run();
    else chain().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap gap-0.5 border-b bg-background/95 p-1 backdrop-blur">
      <Tool
        label="Bold"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold />
      </Tool>
      <Tool
        label="Italic"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </Tool>
      <Tool
        label="Underline"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <Underline />
      </Tool>
      <Tool
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough />
      </Tool>
      <Tool
        label="Inline code"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <Code />
      </Tool>
      <Tool label="Link" active={state.link} onClick={openLink}>
        <Link2 />
      </Tool>
      <Divider />
      <Tool
        label="Heading 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </Tool>
      <Tool
        label="Heading 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </Tool>
      <Tool
        label="Bulleted list"
        active={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List />
      </Tool>
      <Tool
        label="Numbered list"
        active={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered />
      </Tool>
      <Tool
        label="Quote"
        active={state.quote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <Quote />
      </Tool>
      <Tool
        label="Code block"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      >
        <SquareCode />
      </Tool>
      <Tool label="Separator" onClick={() => chain().setHorizontalRule().run()}>
        <Minus />
      </Tool>
      <Tool label="Image" onClick={() => setPickerOpen(true)}>
        <ImageIcon />
      </Tool>
      <Tool label="Form" onClick={() => setFormsOpen(true)}>
        <ClipboardList />
      </Tool>
      <Divider />
      <Tool
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Undo />
      </Tool>
      <Tool
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Redo />
      </Tool>

      {end && <div className="ml-auto flex items-center">{end}</div>}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="https://example.com"
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLinkOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={applyLink}>
              {linkHref ? "Apply" : "Remove link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={formsOpen} onOpenChange={setFormsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert form</DialogTitle>
          </DialogHeader>
          {forms.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              There are no forms yet.{" "}
              <a href="/admin/forms" className="text-primary underline">
                Create one under Forms
              </a>
              .
            </p>
          ) : (
            <ul className="grid max-h-80 gap-1 overflow-y-auto">
              {forms.map((form) => (
                <li key={form.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      // Forms live at the top level of the document
                      chain()
                        .insertContent({
                          type: "formEmbed",
                          attrs: { formId: form.id, title: form.title },
                        })
                        .run();
                      setFormsOpen(false);
                    }}
                  >
                    <ClipboardList /> {form.title}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Insert image"
        onSelect={(item) => {
          chain()
            .setImage({ src: item.url, alt: item.alt || item.title })
            .run();
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <div className="mx-1 w-px self-stretch bg-border" />;
}
