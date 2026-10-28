import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { SubscriberStatus } from "@/db/schema";
import { hasCap } from "@/lib/capabilities";
import { formatInZone } from "@/lib/dates";
import { mailConfigured } from "@/lib/mail";
import {
  kickNewsletters,
  listNewsletters,
  listSubscribers,
  subscriberCounts,
} from "@/lib/newsletter";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import {
  cancelNewsletterAction,
  deleteSubscriberAction,
  importSubscribersAction,
  saveNewsletterSettingsAction,
} from "./actions";

export const metadata: Metadata = { title: "Newsletter" };

const STATUSES: SubscriberStatus[] = ["active", "pending", "unsubscribed"];
const STATUS_LABELS: Record<string, string> = {
  active: "Subscribed",
  pending: "Not confirmed",
  unsubscribed: "Unsubscribed",
  queued: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
};

export default async function NewsletterAdminPage({
  searchParams,
}: PageProps<"/admin/newsletter">) {
  const viewer = await requireViewer("edit_others_posts");
  const query = await searchParams;
  const status = STATUSES.find((s) => s === query.status);
  const search = typeof query.s === "string" ? query.s.trim() : "";
  const page = Number(query.page) || 1;
  const [settings, counts, sends, list] = await Promise.all([
    getSettings(),
    subscriberCounts(),
    listNewsletters(),
    listSubscribers({ status, search, page }),
  ]);
  // Picks up anything due that no cron has sent yet
  kickNewsletters();
  const date = (d: Date) =>
    formatInZone(d, settings.timezone, `${settings.dateFormat} HH:mm`);
  const pageLink = (n: number) =>
    `/admin/newsletter?${new URLSearchParams({
      ...(status && { status }),
      ...(search && { s: search }),
      page: String(n),
    })}`;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Newsletter</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Readers subscribe at <code>/newsletter</code>, after each post, or
          from their account, and confirm by email. Send a post from its editor
          (the <strong>Newsletter</strong> card), or turn on automatic sending
          below. Members-only posts reach members in full and everyone else as a
          teaser.
        </p>
      </div>

      {!settings.newsletterEnabled && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          The newsletter is off: signup forms are hidden and nothing is sent.
          Turn it on under Settings below.
        </p>
      )}
      {!mailConfigured() && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
          Email isn't set up, so newsletters only go to the server log. Set{" "}
          <code>SMTP_URL</code> (any provider: Postmark, Resend, SES, Mailgun…)
          and <code>MAIL_FROM</code>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Subscribers", counts.active],
            ["Waiting to confirm", counts.pending],
            ["Unsubscribed", counts.unsubscribed],
          ] as const
        ).map(([label, n]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="font-normal text-muted-foreground text-sm">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="font-semibold text-3xl">{n}</CardContent>
          </Card>
        ))}
      </div>

      <section className="grid gap-3">
        <h2 className="font-semibold text-lg">Sent and scheduled</h2>
        {sends.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing sent yet. Open a published post and use its Newsletter card.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>When</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sends.map(({ newsletter: n, postTitle }) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <div className="font-medium">{n.subject}</div>
                    {n.postId && postTitle !== n.subject && (
                      <Link
                        href={`/admin/posts/${n.postId}`}
                        className="text-muted-foreground text-xs hover:underline"
                      >
                        {postTitle}
                      </Link>
                    )}
                    {n.audience === "members" && (
                      <div className="text-muted-foreground text-xs">
                        Members only
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={n.status === "sent" ? "secondary" : "outline"}
                    >
                      {STATUS_LABELS[n.status]}
                    </Badge>
                    {n.error && (
                      <div className="mt-1 max-w-xs text-destructive text-xs">
                        {n.error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {n.sent}
                    {n.failed > 0 && (
                      <span className="text-destructive">
                        {" "}
                        · {n.failed} failed
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {date(n.finishedAt ?? n.sendAt)}
                  </TableCell>
                  <TableCell>
                    {n.status === "queued" && (
                      <form action={cancelNewsletterAction}>
                        <input type="hidden" name="id" value={n.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Cancel
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">Subscribers</h2>
          <a
            href="/admin/newsletter/export"
            className="text-sm underline-offset-4 hover:underline"
          >
            Export CSV
          </a>
        </div>
        <form className="flex flex-wrap gap-2 text-sm">
          <Input
            name="s"
            defaultValue={search}
            placeholder="Search email or name"
            aria-label="Search subscribers"
            className="h-8 w-64"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            aria-label="Status"
            className="h-8 rounded-lg border bg-transparent px-2"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Filter
          </Button>
        </form>
        {list.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No subscribers found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    {STATUS_LABELS[s.status]}
                    {s.source !== "form" && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · {s.source}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {date(s.createdAt)}
                  </TableCell>
                  <TableCell>
                    <form action={deleteSubscriberAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {list.pages > 1 && (
          <nav className="flex items-center gap-3 text-sm">
            {page > 1 && <Link href={pageLink(page - 1)}>← Newer</Link>}
            <span className="text-muted-foreground">
              Page {page} of {list.pages}
            </span>
            {page < list.pages && (
              <Link href={pageLink(page + 1)}>Older →</Link>
            )}
          </nav>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Import subscribers</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={importSubscribersAction}
              className="grid gap-3 text-sm"
            >
              <p className="text-muted-foreground">
                A CSV export from Mailchimp, Substack, Ghost or WordPress, or
                one address per line (optionally with a name after a comma).
              </p>
              <Textarea
                name="list"
                rows={5}
                placeholder={"ana@example.com, Ana\nbo@example.com"}
                aria-label="Addresses"
              />
              <Input
                name="file"
                type="file"
                accept=".csv,.txt,text/csv"
                aria-label="CSV file"
              />
              <Label className="flex items-start gap-2 font-normal">
                <Checkbox name="consent" className="mt-0.5" />
                These people agreed to get this newsletter. They're added as
                subscribed, without a confirmation email.
              </Label>
              <SubmitButton
                size="sm"
                className="justify-self-start"
                pendingLabel="Importing…"
              >
                Import
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        {hasCap(viewer, "manage_options") && (
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={saveNewsletterSettingsAction}
                className="grid gap-3 text-sm"
              >
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    name="newsletterEnabled"
                    defaultChecked={settings.newsletterEnabled}
                  />
                  Newsletter on
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    name="newsletterAutoSend"
                    defaultChecked={settings.newsletterAutoSend}
                  />
                  Email every new post when it's published
                </Label>
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    name="newsletterSignupAfterPosts"
                    defaultChecked={settings.newsletterSignupAfterPosts}
                  />
                  Show a signup box after each post
                </Label>
                <div className="grid gap-1.5">
                  <Label htmlFor="newsletter-footer">Email footer</Label>
                  <Textarea
                    id="newsletter-footer"
                    name="newsletterFooter"
                    rows={3}
                    defaultValue={settings.newsletterFooter}
                    placeholder={"Example Ltd\n1 Main Street, Ljubljana"}
                  />
                  <p className="text-muted-foreground text-xs">
                    Who sends it and a postal address. Anti-spam laws in many
                    countries (CAN-SPAM, for one) require it.
                  </p>
                </div>
                <SubmitButton size="sm" className="justify-self-start">
                  Save settings
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
