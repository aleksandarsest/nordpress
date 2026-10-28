import { formatDistanceToNow } from "date-fns";
import { Circle, CircleCheck } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runScheduledBackupIfDue } from "@/lib/backup";
import { hasCap } from "@/lib/capabilities";
import { countPendingComments } from "@/lib/comments";
import { runSiteChecksIfDue } from "@/lib/inbox";
import { onboardingSteps } from "@/lib/onboarding";
import { getSettings } from "@/lib/options";
import { dashboardStats, recentDrafts } from "@/lib/posts";
import { requireViewer } from "@/lib/session";
import { first } from "./_components/screen";
import { quickDraft } from "./posts/actions";
import { dismissChecklistAction } from "./settings/actions";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/admin">) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const canWrite = hasCap(viewer, "edit_posts");
  const [stats, drafts] = canWrite
    ? await Promise.all([dashboardStats(), recentDrafts(viewer.id)])
    : [null, []];
  // The inbox checks and scheduled backups run after this page has been sent
  if (hasCap(viewer, "manage_options"))
    after(async () => {
      await runSiteChecksIfDue().catch((error) =>
        console.error("[inbox] daily checks failed", error),
      );
      await runScheduledBackupIfDue().catch((error) =>
        console.error("[backup] scheduled backup failed", error),
      );
    });
  const settings = await getSettings();
  const steps =
    hasCap(viewer, "manage_options") && !settings.checklistDismissed
      ? await onboardingSteps(settings, viewer.id)
      : [];
  const doneCount = steps.filter((s) => s.done).length;
  const pendingComments = hasCap(viewer, "moderate_comments")
    ? await countPendingComments()
    : null;

  return (
    <div className="grid gap-6">
      <h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>

      {steps.length > 0 && doneCount < steps.length && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Getting started</CardTitle>
            <span className="text-muted-foreground text-sm">
              {doneCount} of {steps.length} done
            </span>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <ul className="grid gap-2">
              {steps.map((step) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-background"
                    {...(step.href.startsWith("http") && {
                      target: "_blank",
                      rel: "noreferrer",
                    })}
                  >
                    {step.done ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="grid">
                      <span
                        className={
                          step.done
                            ? "text-muted-foreground line-through"
                            : "font-medium"
                        }
                      >
                        {step.title}
                      </span>
                      {!step.done && (
                        <span className="text-muted-foreground text-xs">
                          {step.detail}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <form action={dismissChecklistAction}>
              <button
                type="submit"
                className="text-muted-foreground text-xs hover:underline"
              >
                Hide this list
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {first(params.installed) && (
        <Alert>
          <AlertDescription>
            Your site is installed. Welcome aboard!
          </AlertDescription>
        </Alert>
      )}
      {first(params.denied) && (
        <Alert variant="destructive">
          <AlertDescription>
            Sorry, you are not allowed to access that page.
          </AlertDescription>
        </Alert>
      )}

      {stats && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>At a Glance</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Link
                href="/admin/posts?status=publish"
                className="hover:underline"
              >
                {stats.posts} Posts
              </Link>
              <Link
                href="/admin/pages?status=publish"
                className="hover:underline"
              >
                {stats.pages} Pages
              </Link>
              <Link
                href="/admin/posts?status=draft"
                className="hover:underline"
              >
                {stats.drafts} Drafts
              </Link>
              <Link
                href="/admin/posts?status=pending"
                className="hover:underline"
              >
                {stats.pending} Pending review
              </Link>
              {pendingComments !== null && (
                <Link
                  href="/admin/comments/?status=pending"
                  className="hover:underline"
                >
                  {pendingComments} Comments in moderation
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Draft</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={quickDraft} className="grid gap-3">
                <Input
                  name="title"
                  placeholder="Title"
                  aria-label="Title"
                  required
                />
                <Textarea
                  name="body"
                  placeholder="What’s on your mind?"
                  aria-label="Content"
                  rows={4}
                />
                <div>
                  <SubmitButton>Save Draft</SubmitButton>
                </div>
              </ActionForm>
              {drafts.length > 0 && (
                <div className="mt-6 grid gap-2 text-sm">
                  <h3 className="font-medium">Your Recent Drafts</h3>
                  {drafts.map((d) => (
                    <div key={d.id} className="flex justify-between gap-4">
                      <Link
                        href={`/admin/posts/${d.id}`}
                        className="truncate text-primary hover:underline"
                      >
                        {d.title || "(no title)"}
                      </Link>
                      <span className="shrink-0 text-muted-foreground">
                        {formatDistanceToNow(d.updatedAt, { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!canWrite && (
        <Card>
          <CardContent className="text-sm">
            Welcome, {viewer.name}. You can update your{" "}
            <Link
              href="/admin/profile"
              className="text-primary hover:underline"
            >
              profile
            </Link>{" "}
            here.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
