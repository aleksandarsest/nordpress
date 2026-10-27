import { format } from "date-fns";
import type { Metadata } from "next";
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
import type { CommentStatus } from "@/db/schema";
import { adminListComments, type ModerationAction } from "@/lib/comments";
import { getSettings } from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { requireViewer } from "@/lib/session";
import {
  FilterLinks,
  first,
  Pagination,
  ScreenHeader,
  withParams,
} from "../_components/screen";
import { bulkModerateAction, moderateCommentAction } from "./actions";

export const metadata: Metadata = { title: "Comments" };

const LABELS: Record<CommentStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  spam: "Spam",
  trash: "Trash",
};

const ROW_ACTIONS: Record<
  CommentStatus,
  { do: ModerationAction; label: string; destructive?: boolean }[]
> = {
  pending: [
    { do: "approve", label: "Approve" },
    { do: "spam", label: "Spam", destructive: true },
    { do: "trash", label: "Trash", destructive: true },
  ],
  approved: [
    { do: "unapprove", label: "Unapprove" },
    { do: "spam", label: "Spam", destructive: true },
    { do: "trash", label: "Trash", destructive: true },
  ],
  spam: [
    { do: "unspam", label: "Not Spam" },
    { do: "delete", label: "Delete Permanently", destructive: true },
  ],
  trash: [
    { do: "restore", label: "Restore" },
    { do: "delete", label: "Delete Permanently", destructive: true },
  ],
};

const BULK: Record<
  CommentStatus | "all",
  { do: ModerationAction; label: string }[]
> = {
  all: [
    { do: "approve", label: "Approve" },
    { do: "unapprove", label: "Unapprove" },
    { do: "spam", label: "Mark as spam" },
    { do: "trash", label: "Move to Trash" },
  ],
  pending: [
    { do: "approve", label: "Approve" },
    { do: "spam", label: "Mark as spam" },
    { do: "trash", label: "Move to Trash" },
  ],
  approved: [
    { do: "unapprove", label: "Unapprove" },
    { do: "spam", label: "Mark as spam" },
    { do: "trash", label: "Move to Trash" },
  ],
  spam: [
    { do: "unspam", label: "Not spam" },
    { do: "delete", label: "Delete permanently" },
  ],
  trash: [
    { do: "restore", label: "Restore" },
    { do: "delete", label: "Delete permanently" },
  ],
};

export default async function CommentsPage({
  searchParams,
}: PageProps<"/admin/comments">) {
  await requireViewer("moderate_comments");
  const params = await searchParams;
  const raw = first(params.status);
  const status = raw && raw in LABELS ? (raw as CommentStatus) : undefined;
  const search = first(params.s) ?? "";
  const page = Number(first(params.paged)) || 1;
  const [list, settings] = await Promise.all([
    adminListComments({ status: status ?? "all", search, page }),
    getSettings(),
  ]);
  const here = withParams("/admin/comments", {
    status,
    s: search,
    paged: page,
  });

  return (
    <>
      <ScreenHeader title="Comments" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterLinks
          links={[
            {
              label: "All",
              href: "/admin/comments",
              count: (list.counts.approved ?? 0) + (list.counts.pending ?? 0),
              active: !status,
            },
            ...(Object.keys(LABELS) as CommentStatus[]).map((s) => ({
              label: LABELS[s],
              href: withParams("/admin/comments", { status: s }),
              count: list.counts[s] ?? 0,
              active: status === s,
            })),
          ]}
        />
        <form className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <Input
            name="s"
            defaultValue={search}
            placeholder="Search comments"
            className="h-8 w-56"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>
      </div>

      <form action={bulkModerateAction}>
        <input type="hidden" name="back" value={here} />
        <div className="mb-3 flex items-center gap-2">
          <select
            name="do"
            aria-label="Bulk action"
            className="h-8 rounded-lg border bg-background px-2 text-sm"
          >
            {BULK[status ?? "all"].map((b) => (
              <option key={b.do} value={b.do}>
                {b.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </div>
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>In response to</TableHead>
                <TableHead>Submitted on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No comments found.
                  </TableCell>
                </TableRow>
              )}
              {list.items.map(
                ({
                  comment: c,
                  postTitle,
                  postType,
                  postSlug,
                  postPublishedAt,
                }) => (
                  <TableRow
                    key={c.id}
                    className={
                      c.status === "pending"
                        ? "group bg-amber-50/60 align-top dark:bg-amber-950/20"
                        : "group align-top"
                    }
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        name="ids"
                        value={c.id}
                        aria-label={`Select comment by ${c.authorName}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{c.authorName}</div>
                      {c.authorEmail && (
                        <div className="text-muted-foreground text-xs">
                          {c.authorEmail}
                        </div>
                      )}
                      {c.ipAddress && (
                        <div className="text-muted-foreground text-xs">
                          {c.ipAddress}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-lg whitespace-normal text-sm">
                      {c.status === "pending" && (
                        <Badge variant="secondary" className="mb-1">
                          Pending
                        </Badge>
                      )}
                      <p className="line-clamp-4 whitespace-pre-line">
                        {c.content}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        {ROW_ACTIONS[c.status].map((a) => (
                          <button
                            key={a.do}
                            type="submit"
                            form={`row-${c.id}-${a.do}`}
                            className={
                              a.destructive
                                ? "text-destructive hover:underline"
                                : "text-primary hover:underline"
                            }
                          >
                            {a.label}
                          </button>
                        ))}
                        {c.status !== "trash" && c.status !== "spam" && (
                          <Link
                            href={`/admin/comments/${c.id}`}
                            className="text-primary hover:underline"
                          >
                            Edit &amp; Reply
                          </Link>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={`/admin/posts/${c.postId}`}
                        className="text-primary hover:underline"
                      >
                        {postTitle || "(no title)"}
                      </Link>
                      <div>
                        <Link
                          href={postPath(
                            {
                              id: c.postId,
                              type: postType,
                              slug: postSlug,
                              publishedAt: postPublishedAt,
                            },
                            settings.permalinkStructure,
                          )}
                          className="text-muted-foreground text-xs hover:underline"
                        >
                          View post
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(c.createdAt, "yyyy/MM/dd 'at' h:mm a")}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </form>
      {/* Row buttons sit inside the bulk form, so each targets its own form here */}
      {list.items.flatMap(({ comment: c }) =>
        ROW_ACTIONS[c.status].map((a) => (
          <form
            key={`${c.id}-${a.do}`}
            id={`row-${c.id}-${a.do}`}
            action={moderateCommentAction}
            hidden
          >
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="do" value={a.do} />
            <input type="hidden" name="back" value={here} />
          </form>
        )),
      )}
      <Pagination
        page={list.page}
        pages={list.pages}
        hrefFor={(p) =>
          withParams("/admin/comments", { status, s: search, paged: p })
        }
      />
    </>
  );
}
