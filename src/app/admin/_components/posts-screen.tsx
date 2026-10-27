import { format } from "date-fns";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PostStatus } from "@/db/schema";
import { aiProvenance, describeAiSources } from "@/lib/ai-provenance";
import { canOnPost, hasCap } from "@/lib/capabilities";
import { getSettings } from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { adminListPosts, POST_TYPES, type PostType } from "@/lib/posts";
import type { Viewer } from "@/lib/session";
import {
  deletePostAction,
  restorePostAction,
  trashPostAction,
} from "../posts/actions";
import {
  FilterLinks,
  first,
  Pagination,
  ScreenHeader,
  withParams,
} from "./screen";

const STATUS_LABELS: Record<PostStatus, string> = {
  publish: "Published",
  future: "Scheduled",
  draft: "Draft",
  pending: "Pending",
  private: "Private",
  trash: "Trash",
};

export async function PostsScreen({
  type,
  viewer,
  searchParams,
}: {
  type: PostType;
  viewer: Viewer;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const base = type === "page" ? "/admin/pages" : "/admin/posts";
  const status = first(searchParams.status) as PostStatus | undefined;
  const search = first(searchParams.s) ?? "";
  const page = Number(first(searchParams.paged)) || 1;
  const mine = first(searchParams.author) === "me";

  const [list, settings] = await Promise.all([
    adminListPosts({
      type,
      status: status && status in STATUS_LABELS ? status : "all",
      search,
      page,
      authorId: mine ? viewer.id : undefined,
    }),
    getSettings(),
  ]);
  const totalLive = Object.entries(list.counts)
    .filter(([s]) => s !== "trash")
    .reduce((sum, [, n]) => sum + (n ?? 0), 0);
  const here = withParams(base, { status, s: search, paged: page });
  const labels = POST_TYPES[type];

  return (
    <>
      <ScreenHeader
        title={labels.label}
        action={{
          label: `Add New ${labels.singular}`,
          href:
            type === "page" ? "/admin/posts/new?type=page" : "/admin/posts/new",
        }}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterLinks
          links={[
            {
              label: "All",
              href: base,
              count: totalLive,
              active: !status && !mine,
            },
            {
              label: "Mine",
              href: withParams(base, { author: "me" }),
              active: mine,
            },
            ...(Object.keys(STATUS_LABELS) as PostStatus[])
              .filter((s) => list.counts[s])
              .map((s) => ({
                label: STATUS_LABELS[s],
                href: withParams(base, { status: s }),
                count: list.counts[s],
                active: status === s,
              })),
          ]}
        />
        <form className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <Input
            name="s"
            defaultValue={search}
            placeholder={`Search ${labels.label.toLowerCase()}`}
            className="h-8 w-56"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              {type === "post" && <TableHead>Categories</TableHead>}
              {type === "post" && <TableHead>Tags</TableHead>}
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  No {labels.label.toLowerCase()} found.
                </TableCell>
              </TableRow>
            )}
            {list.items.map((post) => {
              const canEdit = canOnPost(viewer, "edit", post);
              const canDelete = canOnPost(
                viewer,
                "delete",
                post.status === "trash"
                  ? { ...post, status: post.trashedStatus ?? "draft" }
                  : post,
              );
              const cats = post.terms.filter((t) => t.taxonomy === "category");
              const tags = post.terms.filter((t) => t.taxonomy === "post_tag");
              return (
                <TableRow key={post.id} className="group align-top">
                  <TableCell className="max-w-md whitespace-normal">
                    <div className="font-medium">
                      {canEdit && post.status !== "trash" ? (
                        <Link
                          href={`/admin/posts/${post.id}`}
                          className="text-primary hover:underline"
                        >
                          {post.title || "(no title)"}
                        </Link>
                      ) : (
                        post.title || "(no title)"
                      )}
                      {post.status !== "publish" && post.status !== "trash" && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {STATUS_LABELS[post.status]}
                        </span>
                      )}
                      {post.sticky && (
                        <Badge variant="secondary" className="ml-2">
                          Sticky
                        </Badge>
                      )}
                      {aiProvenance(post.meta) && (
                        <Badge
                          variant="outline"
                          className="ml-2"
                          title={`Written with help from ${describeAiSources(aiProvenance(post.meta)?.sources ?? [])}`}
                        >
                          AI-assisted
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex gap-2 text-xs opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      {post.status === "trash" ? (
                        canDelete && (
                          <>
                            <RowAction
                              action={restorePostAction}
                              id={post.id}
                              back={here}
                              label="Restore"
                            />
                            <RowAction
                              action={deletePostAction}
                              id={post.id}
                              back={here}
                              label="Delete Permanently"
                              destructive
                            />
                          </>
                        )
                      ) : (
                        <>
                          {canEdit && (
                            <Link
                              href={`/admin/posts/${post.id}`}
                              className="text-primary hover:underline"
                            >
                              Edit
                            </Link>
                          )}
                          {canDelete && (
                            <RowAction
                              action={trashPostAction}
                              id={post.id}
                              back={here}
                              label="Trash"
                              destructive
                            />
                          )}
                          {post.status === "publish" && (
                            <Link
                              href={postPath(post, settings.permalinkStructure)}
                              className="text-primary hover:underline"
                            >
                              View
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{post.authorName ?? "—"}</TableCell>
                  {type === "post" && (
                    <TableCell className="whitespace-normal">
                      {cats.map((t) => t.name).join(", ") || "—"}
                    </TableCell>
                  )}
                  {type === "post" && (
                    <TableCell className="whitespace-normal">
                      {tags.map((t) => t.name).join(", ") || "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground text-xs">
                    {post.publishedAt ? (
                      <>
                        {post.status === "future"
                          ? "Scheduled"
                          : post.status === "publish"
                            ? "Published"
                            : "Last Modified"}
                        <br />
                        {format(
                          post.status === "draft"
                            ? post.updatedAt
                            : post.publishedAt,
                          "yyyy/MM/dd 'at' h:mm a",
                        )}
                      </>
                    ) : (
                      <>
                        Last Modified
                        <br />
                        {format(post.updatedAt, "yyyy/MM/dd 'at' h:mm a")}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={list.page}
        pages={list.pages}
        hrefFor={(p) => withParams(base, { status, s: search, paged: p })}
      />
      {hasCap(viewer, "edit_posts") &&
      list.counts.trash &&
      status !== "trash" ? (
        <p className="mt-4 text-muted-foreground text-xs">
          <Link
            href={withParams(base, { status: "trash" })}
            className="hover:underline"
          >
            View trash ({list.counts.trash})
          </Link>
        </p>
      ) : null}
    </>
  );
}

function RowAction({
  action,
  id,
  back,
  label,
  destructive,
}: {
  action: (formData: FormData) => Promise<void>;
  id: number;
  back: string;
  label: string;
  destructive?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        className={
          destructive
            ? "text-destructive hover:underline"
            : "text-primary hover:underline"
        }
      >
        {label}
      </button>
    </form>
  );
}
