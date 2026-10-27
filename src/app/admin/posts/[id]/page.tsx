import { format } from "date-fns";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canOnPost } from "@/lib/capabilities";
import { getPostForEdit, POST_TYPES, type PostType } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { editorOptions, featuredUrl } from "../../_components/editor-data";
import { PostEditor } from "../../_components/post-editor";
import { first } from "../../_components/screen";
import { restoreRevisionAction, trashPostAction } from "../actions";

export const metadata: Metadata = { title: "Edit" };

export default async function EditPostPage({
  params,
  searchParams,
}: PageProps<"/admin/posts/[id]">) {
  const viewer = await requireViewer("edit_posts");
  const id = Number((await params).id);
  const query = await searchParams;
  const data = Number.isInteger(id) ? await getPostForEdit(id) : null;
  if (!data) notFound();
  const { post } = data;
  if (!canOnPost(viewer, "edit", post)) redirect("/admin?denied=1");
  if (post.status === "trash")
    redirect(
      post.type === "page"
        ? "/admin/pages?status=trash"
        : "/admin/posts?status=trash",
    );

  const type = post.type as PostType;
  const canDelete = canOnPost(viewer, "delete", post);

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Edit {POST_TYPES[type].singular}
      </h1>
      {first(query.created) && (
        <Alert className="mb-4">
          <AlertDescription>
            {POST_TYPES[type].singular} saved.
          </AlertDescription>
        </Alert>
      )}
      {first(query.restored) && (
        <Alert className="mb-4">
          <AlertDescription>Revision restored.</AlertDescription>
        </Alert>
      )}
      <PostEditor
        options={await editorOptions(viewer, { ...post, type })}
        post={{
          id: post.id,
          type,
          status: post.status,
          title: post.title,
          slug: post.slug,
          content: post.content,
          excerpt: post.excerpt,
          publishedAt: post.publishedAt?.toISOString() ?? null,
          parentId: post.parentId,
          menuOrder: post.menuOrder,
          featuredMediaId: post.featuredMediaId,
          featuredUrl: await featuredUrl(post.featuredMediaId),
          commentStatus: post.commentStatus,
          sticky: post.sticky,
          categoryIds: data.categoryIds,
          tags: data.tags,
        }}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Revisions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.revisions.length === 0 && (
              <span className="text-muted-foreground">
                No earlier revisions yet.
              </span>
            )}
            {data.revisions.map((rev) => (
              <form
                key={rev.id}
                action={restoreRevisionAction}
                className="flex items-center justify-between gap-4"
              >
                <input type="hidden" name="revision_id" value={rev.id} />
                <span>
                  {rev.authorName ?? "Unknown"},{" "}
                  {format(rev.createdAt, "MMMM d, yyyy 'at' h:mm a")}
                </span>
                <Button type="submit" variant="outline" size="xs">
                  Restore
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>
        {canDelete && (
          <form action={trashPostAction} className="self-start">
            <input type="hidden" name="id" value={post.id} />
            <Button type="submit" variant="destructive" className="w-full">
              Move to Trash
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
