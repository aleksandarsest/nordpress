import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { saveDiscussionAction } from "../actions";

export const metadata: Metadata = { title: "Discussion Settings" };

export default async function DiscussionSettingsPage() {
  await requireViewer("manage_options");
  const s = await getSettings();

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Discussion Settings
      </h1>
      <ActionForm
        action={saveDiscussionAction}
        className="grid max-w-xl gap-8 text-sm"
      >
        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">Default post settings</legend>
          <Label className="font-normal">
            <Checkbox
              name="default_comment_status"
              defaultChecked={s.defaultCommentStatus === "open"}
            />{" "}
            Allow people to submit comments on new posts
          </Label>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">Other comment settings</legend>
          <Label className="font-normal">
            <Checkbox
              name="require_name_email"
              defaultChecked={s.requireNameEmail}
            />{" "}
            Comment author must fill out name and email
          </Label>
          <Label className="font-normal">
            <Checkbox
              name="comment_registration"
              defaultChecked={s.commentRegistration}
            />{" "}
            Users must be registered and logged in to comment
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="font-normal">
              <Checkbox
                name="close_comments"
                defaultChecked={s.closeCommentsDaysOld > 0}
              />{" "}
              Automatically close comments on posts older than
            </Label>
            <Input
              name="close_comments_days_old"
              type="number"
              min={1}
              defaultValue={s.closeCommentsDaysOld || 14}
              aria-label="Days"
              className="h-8 w-20"
            />
            days
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="thread_depth" className="font-normal">
              Thread comments up to
            </Label>
            <select
              id="thread_depth"
              name="thread_depth"
              defaultValue={s.threadDepth}
              className="h-8 rounded-lg border bg-transparent px-2"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            levels deep
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">Before a comment appears</legend>
          <Label className="font-normal">
            <Checkbox
              name="comment_moderation"
              defaultChecked={s.commentModeration}
            />{" "}
            Comment must be manually approved
          </Label>
          <Label className="font-normal">
            <Checkbox
              name="comment_previously_approved"
              defaultChecked={s.commentPreviouslyApproved}
            />{" "}
            Comment author must have a previously approved comment
          </Label>
          <p className="text-muted-foreground text-xs">
            Comments with more than two links are always held for moderation.
          </p>
        </fieldset>

        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
