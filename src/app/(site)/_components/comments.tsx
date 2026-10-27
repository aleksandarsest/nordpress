import { Suspense } from "react";
import { getApprovedComments, type PublicComment } from "@/lib/comments";
import type { SiteSettings } from "@/lib/options";
import { getViewer } from "@/lib/session";
import { formatDate } from "@/lib/themes/helpers";
import { CommentForm } from "./comment-form";
import { CommentThread, type ThreadNode } from "./comment-thread";

function buildTree(
  list: PublicComment[],
  settings: SiteSettings,
): ThreadNode[] {
  const nodes = new Map<number, ThreadNode>();
  for (const c of list) {
    nodes.set(c.id, {
      id: c.id,
      authorName: c.authorName,
      authorUrl: c.authorUrl,
      isStaff: c.isStaff,
      date: formatDate(c.createdAt, settings),
      isoDate: c.createdAt.toISOString(),
      content: c.content,
      children: [],
    });
  }
  const roots: ThreadNode[] = [];
  for (const c of list) {
    const node = nodes.get(c.id) as ThreadNode;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function Comments({
  post,
  settings,
}: {
  post: {
    id: number;
    title: string;
    commentStatus: "open" | "closed";
    publishedAt: Date | null;
  };
  settings: SiteSettings;
}) {
  const list = await getApprovedComments(post.id);
  const open = post.commentStatus === "open";
  if (!open && list.length === 0) return null;
  const tree = buildTree(list, settings);
  const heading =
    list.length === 0
      ? null
      : list.length === 1
        ? `One response to “${post.title}”`
        : `${list.length} responses to “${post.title}”`;

  return (
    <section
      id="comments"
      aria-label="Comments"
      className="mt-6 grid gap-8 border-t pt-8"
    >
      {heading && <h2 className="font-semibold text-xl">{heading}</h2>}
      <Suspense
        fallback={
          <CommentThread
            nodes={tree}
            form={null}
            maxDepth={settings.threadDepth}
          />
        }
      >
        <InteractiveComments
          post={post}
          settings={settings}
          tree={tree}
          open={open}
        />
      </Suspense>
    </section>
  );
}

// Reads the session, so it streams in after the cached comment list.
async function InteractiveComments({
  post,
  settings,
  tree,
  open,
}: {
  post: { id: number; publishedAt: Date | null };
  settings: SiteSettings;
  tree: ThreadNode[];
  open: boolean;
}) {
  const viewer = await getViewer();
  const closeAt =
    settings.closeCommentsDaysOld && post.publishedAt
      ? post.publishedAt.getTime() + settings.closeCommentsDaysOld * 86_400_000
      : null;
  const accepting = open && (!closeAt || closeAt > Date.now());
  const form = accepting
    ? {
        postId: post.id,
        viewerName: viewer?.name ?? null,
        requireNameEmail: settings.requireNameEmail,
        loginRequired: settings.commentRegistration,
      }
    : null;

  return (
    <>
      {tree.length > 0 && (
        <CommentThread
          nodes={tree}
          form={form}
          maxDepth={settings.threadDepth}
        />
      )}
      {form ? (
        <div className="grid gap-3">
          <h2 className="font-semibold text-xl">Leave a Reply</h2>
          <CommentForm {...form} />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Comments are closed.</p>
      )}
    </>
  );
}
