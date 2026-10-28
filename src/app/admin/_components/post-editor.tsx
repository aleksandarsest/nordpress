"use client";

import { generateText, type JSONContent } from "@tiptap/core";
import { format } from "date-fns";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PostStatus } from "@/db/schema";
import { editorExtensions } from "@/lib/editor-extensions";
import type { TranslationLink } from "@/lib/translations";
import { createPreviewAction, savePostAction } from "../posts/actions";
import { AiAssistant } from "./ai-assistant";
import { AiSuggestions, type SuggestionTargets } from "./ai-suggestions";
import { MediaPicker } from "./media-picker";
import { NewsletterCard, type NewsletterInfo } from "./newsletter-card";
import { RichTextEditor } from "./rich-text-editor";
import { TranslationsCard } from "./translations-card";

export type EditorPost = {
  id?: number;
  type: "post" | "page";
  status: PostStatus;
  title: string;
  slug: string;
  content: JSONContent | null;
  excerpt: string;
  publishedAt: string | null;
  parentId: number | null;
  menuOrder: number;
  featuredMediaId: number | null;
  featuredUrl: string | null;
  commentStatus: "open" | "closed";
  sticky: boolean;
  categoryIds: number[];
  tags: string[];
  /** Only members see the full content. */
  membersOnly: boolean;
};

export type EditorOptions = {
  canPublish: boolean;
  canSticky: boolean;
  categories: { id: number; name: string; parentId: number | null }[];
  parents: { id: number; title: string }[];
  permalinkBase: string;
  viewUrl: string | null;
  /** Whether the AI writing tools are available to this user. */
  ai: boolean;
  /** Forms the editor can embed. */
  forms: { id: number; title: string }[];
  /** The site's language and the ones content can be translated into. */
  defaultLanguage: string;
  languages: string[];
  /** This post and its translations (empty for unsaved posts). */
  translations: TranslationLink[];
  /** Emailing this post; null when the newsletter is off or not allowed. */
  newsletter: NewsletterInfo | null;
};

const STATUS_TEXT: Record<PostStatus, string> = {
  publish: "Published",
  future: "Scheduled",
  draft: "Draft",
  pending: "Pending Review",
  private: "Privately Published",
  trash: "Trash",
};

// datetime-local wants "yyyy-MM-ddTHH:mm" in local time
const toLocalInput = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";

export function PostEditor({
  post,
  options,
}: {
  post: EditorPost;
  options: EditorOptions;
}) {
  const [state, formAction, pending] = useActionState(savePostAction, null);
  const [content, setContent] = useState<JSONContent | null>(post.content);
  const [dirty, setDirty] = useState(false);
  // Whether AI text was accepted into this post since it was opened
  const [aiAssisted, setAiAssisted] = useState(false);
  const [visibility, setVisibility] = useState(
    post.status === "private" ? "private" : "public",
  );
  const [publishAt, setPublishAt] = useState(toLocalInput(post.publishedAt));
  const [featured, setFeatured] = useState({
    id: post.featuredMediaId,
    url: post.featuredUrl,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [tags, setTags] = useState(post.tags.join(", "));
  const [categoryIds, setCategoryIds] = useState(post.categoryIds);
  const [previewError, setPreviewError] = useState("");

  // Opens the tab right away (popup blockers allow it during the click),
  // then points it at a snapshot of the current, possibly unsaved, state.
  async function openPreview() {
    setPreviewError("");
    const tab = window.open("about:blank", "_blank");
    const result = await createPreviewAction({
      postId: post.id ?? null,
      type: post.type,
      title,
      content: content ? JSON.stringify(content) : "",
      excerpt,
      featuredMediaId: featured.id,
      categoryIds,
      tags,
    });
    if (result.token) {
      if (tab) tab.location.href = `/preview/${result.token}`;
      else window.location.href = `/preview/${result.token}`;
    } else {
      tab?.close();
      setPreviewError(result.error ?? "The preview couldn't be created.");
    }
  }

  // Applies AI suggestions; tags and categories are merged, not replaced
  function applySuggestion(patch: Partial<SuggestionTargets>) {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.slug !== undefined) setSlug(patch.slug);
    if (patch.excerpt !== undefined) setExcerpt(patch.excerpt);
    if (patch.categoryIds)
      setCategoryIds((prev) => [
        ...new Set([...prev, ...(patch.categoryIds ?? [])]),
      ]);
    if (patch.tags) {
      setTags((prev) => {
        const current = prev
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const lower = new Set(current.map((t) => t.toLowerCase()));
        return [
          ...current,
          ...(patch.tags ?? []).filter((t) => !lower.has(t.toLowerCase())),
        ].join(", ");
      });
    }
    setDirty(true);
  }

  const isLive = ["publish", "future", "private"].includes(post.status);
  const scheduled = publishAt && new Date(publishAt) > new Date();
  const label = post.type === "page" ? "Page" : "Post";

  useEffect(() => {
    if (state?.message) setDirty(false);
  }, [state]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const primary = !options.canPublish
    ? { intent: "pending", text: "Submit for Review" }
    : visibility === "private"
      ? { intent: "private", text: isLive ? "Update" : "Publish" }
      : {
          intent: "publish",
          text: isLive ? "Update" : scheduled ? "Schedule" : "Publish",
        };

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      className="grid gap-6 lg:grid-cols-[1fr_300px]"
    >
      {post.id && <input type="hidden" name="id" value={post.id} />}
      <input type="hidden" name="type" value={post.type} />
      {aiAssisted && <input type="hidden" name="ai_assisted" value="1" />}
      <input
        type="hidden"
        name="content"
        value={content ? JSON.stringify(content) : ""}
      />
      <input type="hidden" name="featured_media_id" value={featured.id ?? ""} />
      <input
        type="hidden"
        name="published_at"
        value={publishAt ? new Date(publishAt).toISOString() : ""}
      />

      <div className="grid min-w-0 content-start gap-4">
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.message && (
          <Alert>
            <AlertDescription>
              {state.message}{" "}
              {options.viewUrl && (
                <Link href={options.viewUrl} className="text-primary underline">
                  View {label.toLowerCase()}
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )}
        <Input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add title"
          aria-label="Title"
          className="h-12 bg-background font-semibold text-2xl md:text-2xl"
        />
        <RichTextEditor
          initialContent={post.content}
          forms={options.forms}
          onChange={(doc) => {
            setContent(doc);
            setDirty(true);
          }}
          toolbarEnd={
            options.ai
              ? (editor) => (
                  <AiAssistant
                    editor={editor}
                    title={() => title}
                    onExcerpt={(text) => {
                      setExcerpt(text);
                      setDirty(true);
                    }}
                    onApplied={() => setAiAssisted(true)}
                  />
                )
              : undefined
          }
        />
        <Card>
          <CardHeader>
            <CardTitle>Excerpt</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              aria-label="Excerpt"
            />
            <p className="mt-2 text-muted-foreground text-xs">
              Excerpts are optional hand-crafted summaries of your content.
              Leave empty to generate one automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Publish</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              Status: <strong>{STATUS_TEXT[post.status]}</strong>
            </div>
            {options.canPublish && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="visibility">Visibility</Label>
                  <select
                    id="visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                    className="h-8 rounded-lg border bg-transparent px-2"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="publish-at">Publish on</Label>
                  <Input
                    id="publish-at"
                    type="datetime-local"
                    value={publishAt}
                    onChange={(e) => setPublishAt(e.target.value)}
                  />
                  <span className="text-muted-foreground text-xs">
                    Leave empty to publish immediately.
                  </span>
                </div>
              </>
            )}
            <Label className="items-start font-normal">
              <Checkbox name="members_only" defaultChecked={post.membersOnly} />
              <span>
                Members only
                <span className="block text-muted-foreground text-xs">
                  Others see the excerpt and an invitation to join.
                </span>
              </span>
            </Label>
            {post.type === "post" && options.canSticky && (
              <Label className="font-normal">
                <Checkbox name="sticky" defaultChecked={post.sticky} /> Stick to
                the top of the blog
              </Label>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={openPreview}
                className="w-full"
              >
                Preview
              </Button>
              {previewError && (
                <p role="alert" className="w-full text-destructive text-xs">
                  {previewError}
                </p>
              )}
              {!isLive && (
                <Button
                  type="submit"
                  name="intent"
                  value="draft"
                  variant="outline"
                  disabled={pending}
                >
                  Save Draft
                </Button>
              )}
              {isLive && (
                <Button
                  type="submit"
                  name="intent"
                  value="draft"
                  variant="ghost"
                  disabled={pending}
                >
                  Switch to Draft
                </Button>
              )}
              <Button
                type="submit"
                name="intent"
                value={primary.intent}
                disabled={pending}
              >
                {pending ? "Saving…" : primary.text}
              </Button>
            </div>
          </CardContent>
        </Card>

        {options.ai && (
          <AiSuggestions
            postType={post.type}
            read={() => ({
              title,
              contentText: content
                ? generateText(content, editorExtensions, {
                    blockSeparator: "\n\n",
                  })
                : "",
            })}
            apply={applySuggestion}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Permalink</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="generated-from-title"
            />
            <span className="break-all text-muted-foreground text-xs">
              {options.permalinkBase}
              {slug || "…"}
            </span>
          </CardContent>
        </Card>

        {post.type === "post" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent className="grid max-h-60 gap-2 overflow-y-auto text-sm">
                {options.categories.length === 0 && (
                  <span className="text-muted-foreground">
                    No categories yet.
                  </span>
                )}
                {sortTree(options.categories).map(({ item, depth }) => (
                  <Label
                    key={item.id}
                    className="font-normal"
                    style={{ paddingLeft: depth * 16 }}
                  >
                    <Checkbox
                      name="category"
                      value={String(item.id)}
                      checked={categoryIds.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setCategoryIds((prev) =>
                          checked
                            ? [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.name}
                  </Label>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                <Input
                  name="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  aria-label="Tags"
                />
                <span className="text-muted-foreground text-xs">
                  Separate tags with commas.
                </span>
              </CardContent>
            </Card>
          </>
        )}

        {post.type === "page" && (
          <Card>
            <CardHeader>
              <CardTitle>Page Attributes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid gap-1.5">
                <Label htmlFor="parent">Parent</Label>
                <select
                  id="parent"
                  name="parent_id"
                  defaultValue={post.parentId ?? ""}
                  className="h-8 rounded-lg border bg-transparent px-2"
                >
                  <option value="">(no parent)</option>
                  {options.parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || "(no title)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="menu-order">Order</Label>
                <Input
                  id="menu-order"
                  name="menu_order"
                  type="number"
                  defaultValue={post.menuOrder}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Featured Image</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {featured.url && (
              // biome-ignore lint/performance/noImgElement: arbitrary user uploads
              <img
                src={featured.url}
                alt=""
                className="w-full rounded-md border"
              />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                {featured.id ? "Replace" : "Set featured image"}
              </Button>
              {featured.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFeatured({ id: null, url: null });
                    setDirty(true);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {post.id && options.newsletter && (
          <NewsletterCard
            postId={post.id}
            title={post.title}
            status={post.status}
            membersOnly={post.membersOnly}
            ai={options.ai}
            info={options.newsletter}
          />
        )}

        {post.id && options.languages.length > 0 && (
          <TranslationsCard postId={post.id} options={options} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Discussion</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="font-normal">
              <Checkbox
                name="comment_status"
                defaultChecked={post.commentStatus === "open"}
              />{" "}
              Allow comments
            </Label>
          </CardContent>
        </Card>
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Featured image"
        onSelect={(item) => {
          setFeatured({ id: item.id, url: item.url });
          setDirty(true);
          setPickerOpen(false);
        }}
      />
    </form>
  );
}

type TreeItem = { id: number; parentId: number | null };

function sortTree<T extends TreeItem>(items: T[]) {
  const out: { item: T; depth: number }[] = [];
  const ids = new Set(items.map((i) => i.id));
  const walk = (parentId: number | null, depth: number) => {
    for (const item of items) {
      const parent =
        item.parentId && ids.has(item.parentId) ? item.parentId : null;
      if (parent === parentId) {
        out.push({ item, depth });
        walk(item.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return out;
}
