import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getComment } from "@/lib/comments";
import { requireViewer } from "@/lib/session";
import { replyToCommentAction, updateCommentAction } from "../actions";

export const metadata: Metadata = { title: "Edit Comment" };

export default async function EditCommentPage({
  params,
}: PageProps<"/admin/comments/[id]">) {
  await requireViewer("moderate_comments");
  const comment = await getComment(Number((await params).id) || 0);
  if (!comment) notFound();

  return (
    <div className="grid max-w-2xl gap-10">
      <div>
        <div className="mb-6 flex items-center gap-4">
          <h1 className="font-semibold text-2xl tracking-tight">
            Edit Comment
          </h1>
          <Link
            href="/admin/comments"
            className="text-primary text-sm hover:underline"
          >
            ← Comments
          </Link>
        </div>
        <ActionForm action={updateCommentAction} className="grid gap-4">
          <input type="hidden" name="id" value={comment.id} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="author_name">Name</Label>
              <Input
                id="author_name"
                name="author_name"
                defaultValue={comment.authorName}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="author_email">Email</Label>
              <Input
                id="author_email"
                name="author_email"
                type="email"
                defaultValue={comment.authorEmail}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="author_url">URL</Label>
              <Input
                id="author_url"
                name="author_url"
                type="url"
                defaultValue={comment.authorUrl}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="content">Comment</Label>
            <Textarea
              id="content"
              name="content"
              defaultValue={comment.content}
              rows={8}
              required
            />
          </div>
          <div>
            <SubmitButton>Update</SubmitButton>
          </div>
        </ActionForm>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Reply to Comment</h2>
        <ActionForm action={replyToCommentAction} className="grid gap-3">
          <input type="hidden" name="id" value={comment.id} />
          <Textarea name="content" rows={4} required aria-label="Reply" />
          <div>
            <SubmitButton pendingLabel="Replying…">
              {comment.status === "pending" ? "Approve and Reply" : "Reply"}
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
