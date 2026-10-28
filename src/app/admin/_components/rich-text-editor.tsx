"use client";

import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { NodeSelection } from "@tiptap/pm/state";
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
  LayoutTemplate,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pencil,
  Quote,
  Redo,
  SquareCode,
  Strikethrough,
  Underline,
  Undo,
  Video,
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
import {
  cleanSection,
  isSectionKind,
  SECTION_DEFAULTS,
  SECTION_LABELS,
  type SectionData,
  type SectionKind,
} from "@/lib/sections";
import { cn } from "@/lib/utils";
import { parseVideoUrl } from "@/lib/video-embed";
import { MediaPicker } from "./media-picker";
import { SectionEditor } from "./section-editor";

const SECTION_HINTS: Record<SectionKind, string> = {
  hero: "A big headline, text and buttons, with an optional image",
  features: "Services, benefits or steps in columns",
  gallery: "A grid of photos",
  testimonials: "Quotes from happy customers",
  faq: "Questions that open to show their answers",
  pricing: "Plans or packages side by side",
  cta: "A closing invitation with a button",
};

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
  // The section being edited: where it is in the document, and its content
  const [sectionEdit, setSectionEdit] = useState<{
    pos: number;
    kind: SectionKind;
    data: SectionData;
  } | null>(null);

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
      // Double-clicking a section opens its form
      handleDoubleClickOn: (_view, pos, node, nodePos, direct) => {
        if (!direct || node.type.name !== "section") return false;
        if (!isSectionKind(node.attrs.kind)) return false;
        setSectionEdit({
          pos: nodePos,
          kind: node.attrs.kind,
          data: cleanSection(node.attrs.kind, node.attrs.data),
        });
        return pos >= 0;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  return (
    <div className="rounded-lg border bg-background">
      {editor && (
        <Toolbar
          editor={editor}
          end={toolbarEnd?.(editor)}
          forms={forms}
          onEditSection={setSectionEdit}
        />
      )}
      <EditorContent editor={editor} />
      {editor && sectionEdit && (
        <SectionEditor
          // A fresh form for each section
          key={`${sectionEdit.pos}:${sectionEdit.kind}`}
          kind={sectionEdit.kind}
          initial={sectionEdit.data}
          open
          onOpenChange={(open) => !open && setSectionEdit(null)}
          onSave={(data) => {
            editor
              .chain()
              .focus()
              .setNodeSelection(sectionEdit.pos)
              .updateAttributes("section", { data })
              .run();
          }}
        />
      )}
    </div>
  );
}

type SectionEdit = { pos: number; kind: SectionKind; data: SectionData };

function Toolbar({
  editor,
  end,
  forms,
  onEditSection,
}: {
  editor: Editor;
  end?: ReactNode;
  forms: { id: number; title: string }[];
  onEditSection: (edit: SectionEdit) => void;
}) {
  const [sectionsOpen, setSectionsOpen] = useState(false);

  function insertSection(kind: SectionKind) {
    setSectionsOpen(false);
    const data = SECTION_DEFAULTS[kind];
    const { selection } = editor.state;
    // With a whole block selected (another section, say), add after it
    // rather than replacing it
    const from =
      selection instanceof NodeSelection ? selection.to : selection.from;
    // Sections live at the top level of the document
    editor
      .chain()
      .focus()
      .insertContentAt(
        selection instanceof NodeSelection ? from : { from, to: selection.to },
        { type: "section", attrs: { kind, data } },
      )
      .run();
    // Open the form for the new section: the one of this kind nearest to
    // where the cursor was
    let at = -1;
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name === "section" && node.attrs.kind === kind)
        if (at < 0 || Math.abs(offset - from) < Math.abs(at - from))
          at = offset;
    });
    if (at >= 0) onEditSection({ pos: at, kind, data });
  }

  function editSelectedSection() {
    const { selection } = editor.state;
    const node = editor.state.doc.nodeAt(selection.from);
    if (node?.type.name !== "section" || !isSectionKind(node.attrs.kind))
      return;
    onEditSection({
      pos: selection.from,
      kind: node.attrs.kind,
      data: cleanSection(node.attrs.kind, node.attrs.data),
    });
  }
  const [linkOpen, setLinkOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const video = parseVideoUrl(videoUrl);

  function insertVideo() {
    if (!video) return;
    // Embeds live at the top level of the document
    chain().insertContent({ type: "videoEmbed", attrs: video }).run();
    setVideoOpen(false);
    setVideoUrl("");
  }
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
      section: e.isActive("section"),
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
      <Tool label="Video" onClick={() => setVideoOpen(true)}>
        <Video />
      </Tool>
      <Tool label="Form" onClick={() => setFormsOpen(true)}>
        <ClipboardList />
      </Tool>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setSectionsOpen(true)}
        className="h-8"
      >
        <LayoutTemplate /> Section
      </Button>
      {state.section && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={editSelectedSection}
          className="h-8"
        >
          <Pencil /> Edit section
        </Button>
      )}
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

      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Embed a video</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Video address"
            placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/…"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertVideo();
              }
            }}
          />
          <p className="text-muted-foreground text-xs">
            {videoUrl && !video
              ? "That isn't a YouTube or Vimeo video address."
              : "YouTube and Vimeo. Videos use YouTube's privacy-enhanced mode and Vimeo's do-not-track option."}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVideoOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={insertVideo} disabled={!video}>
              Embed
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

      <Dialog open={sectionsOpen} onOpenChange={setSectionsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Designed blocks that follow your site's design. Double-click a
            section in the editor to change it.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(SECTION_LABELS) as SectionKind[]).map((kind) => (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => insertSection(kind)}
                  className="grid w-full gap-0.5 rounded-lg border p-3 text-left text-sm transition hover:border-foreground/40 hover:bg-muted/40"
                >
                  <span className="font-medium">{SECTION_LABELS[kind]}</span>
                  <span className="text-muted-foreground text-xs">
                    {SECTION_HINTS[kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
