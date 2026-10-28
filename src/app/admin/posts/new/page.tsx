import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { aiConfigured } from "@/lib/ai/client";
import { getSettings } from "@/lib/options";
import { isPostType, POST_TYPES } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { editorOptions } from "../../_components/editor-data";
import { PostEditor } from "../../_components/post-editor";
import { first } from "../../_components/screen";
import { createPageWithAiAction } from "../actions";

export const metadata: Metadata = { title: "Add New" };

export default async function NewPostPage({
  searchParams,
}: PageProps<"/admin/posts/new">) {
  const requested = first((await searchParams).type) ?? "post";
  const type = isPostType(requested) ? requested : "post";
  const viewer = await requireViewer(
    type === "page" ? "edit_pages" : "edit_posts",
  );
  const settings = await getSettings();
  const draft = {
    type,
    status: "draft",
    slug: "",
    authorId: viewer.id,
    publishedAt: null,
    parentId: null,
  } as const;

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Add New {POST_TYPES[type].singular}
      </h1>
      {type === "page" && settings.aiEnabled && aiConfigured() ? (
        <details className="mb-6 rounded-lg border bg-card p-4">
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-sm">
            <Sparkles className="size-4" /> Describe the page, and AI writes it
          </summary>
          <ActionForm
            action={createPageWithAiAction}
            className="mt-3 grid gap-3"
          >
            <Label htmlFor="page-description" className="sr-only">
              What should the page say?
            </Label>
            <Textarea
              id="page-description"
              name="description"
              rows={4}
              required
              placeholder="A page about our catering for weddings and company events: menus for 20 to 200 guests, we bring staff and tableware, and people should ask for an offer. Prices start at €25 per guest."
            />
            <div>
              <SubmitButton pendingLabel="Writing the page… (about a minute)">
                Write the page
              </SubmitButton>
            </div>
            <p className="text-muted-foreground text-xs">
              It's built from sections in your site's design and saved as a
              draft for you to read and change. Facts it doesn't have, like
              phone numbers, are left in [brackets] for you to fill in.
            </p>
          </ActionForm>
        </details>
      ) : null}
      <PostEditor
        options={await editorOptions(viewer, draft)}
        post={{
          ...draft,
          title: "",
          content: null,
          excerpt: "",
          menuOrder: 0,
          featuredMediaId: null,
          featuredUrl: null,
          commentStatus: settings.defaultCommentStatus,
          sticky: false,
          membersOnly: false,
          seo: {
            title: "",
            description: "",
            imageId: null,
            imageUrl: null,
            noindex: false,
          },
          categoryIds: settings.defaultCategory
            ? [settings.defaultCategory]
            : [],
          tags: [],
        }}
      />
    </>
  );
}
