import type { Metadata } from "next";
import { getSettings } from "@/lib/options";
import { isPostType, POST_TYPES } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { editorOptions } from "../../_components/editor-data";
import { PostEditor } from "../../_components/post-editor";
import { first } from "../../_components/screen";

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
