import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { backupStore } from "@/lib/backup";
import { formatInZone } from "@/lib/dates";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import {
  createBackupAction,
  deleteBackupAction,
  restoreStoredBackupAction,
  saveBackupSettingsAction,
} from "./actions";
import { RestoreUpload } from "./restore-upload";

export const metadata: Metadata = { title: "Backups" };

// Lists files on disk or in the bucket, so it renders on each request
export const instant = false;

const size = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const KIND: Record<string, string> = {
  auto: "Scheduled",
  "before-restore": "Before a restore",
};

export default async function BackupsPage() {
  await requireViewer("manage_options");
  const settings = await getSettings();
  const store = backupStore();
  let backups: Awaited<ReturnType<typeof store.list>> = [];
  let listError: string | null = null;
  try {
    backups = await store.list();
  } catch (error) {
    listError = (error as Error).message;
  }
  const kindOf = (name: string) =>
    KIND[name.match(/-([a-z-]+)\.tar\.gz$/)?.[1] ?? ""] ?? "Manual";

  return (
    <div className="grid max-w-4xl gap-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Backups</h1>
        <p className="text-muted-foreground text-sm">
          A backup is the whole site in one file: posts, pages, comments, users,
          settings, forms, the shop and every media file. Download one before
          big changes, or let Nordpress make them on a schedule. Backups include
          password hashes and members' email addresses, so keep them somewhere
          private.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/admin/backups/download" className={buttonVariants()}>
          Download a backup now
        </a>
        <ActionForm action={createBackupAction}>
          <SubmitButton variant="outline" pendingLabel="Making a backup…">
            Save a backup on the server
          </SubmitButton>
        </ActionForm>
      </div>

      <section className="grid gap-3">
        <h2 className="font-semibold text-lg">Saved backups</h2>
        <p className="text-muted-foreground text-sm">
          Kept in <code>{store.where}</code>.
        </p>
        {listError ? (
          <p className="text-destructive text-sm">
            Couldn't read the backups: {listError}
          </p>
        ) : backups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No saved backups yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Made</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Size</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="whitespace-nowrap">
                    {formatInZone(
                      b.createdAt,
                      settings.timezone,
                      `${settings.dateFormat} HH:mm`,
                    )}
                  </TableCell>
                  <TableCell>{kindOf(b.name)}</TableCell>
                  <TableCell>{size(b.size)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <a
                        href={`/admin/backups/file/${b.name}`}
                        className={buttonVariants({
                          size: "sm",
                          variant: "ghost",
                        })}
                      >
                        Download
                      </a>
                      <form action={deleteBackupAction}>
                        <input type="hidden" name="name" value={b.name} />
                        <Button type="submit" size="sm" variant="ghost">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={saveBackupSettingsAction}
              className="grid gap-3 text-sm"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="backup-schedule">Make a backup</Label>
                <select
                  id="backup-schedule"
                  name="backupSchedule"
                  defaultValue={settings.backupSchedule}
                  className="h-8 max-w-xs rounded-lg border bg-transparent px-2"
                >
                  <option value="off">Only when I ask</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="backup-keep">Keep the newest</Label>
                <Input
                  id="backup-keep"
                  name="backupKeep"
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={settings.backupKeep}
                  className="max-w-24"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Scheduled backups run when an administrator opens the dashboard,
                or on time with a cron call to <code>/api/cron/backup</code>{" "}
                (see the docs). Backups you make by hand are never deleted
                automatically.
              </p>
              <SubmitButton size="sm" className="justify-self-start">
                Save
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restore</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 text-sm">
            <p className="text-muted-foreground">
              Restoring <strong>replaces everything</strong> on this site with
              the backup. The current site is saved as a backup first, so you
              can go back.
            </p>
            {backups.length > 0 && (
              <ActionForm
                action={restoreStoredBackupAction}
                className="grid gap-3"
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="restore-name">From a saved backup</Label>
                  <select
                    id="restore-name"
                    name="name"
                    className="h-8 rounded-lg border bg-transparent px-2"
                  >
                    {backups.map((b) => (
                      <option key={b.name} value={b.name}>
                        {formatInZone(
                          b.createdAt,
                          settings.timezone,
                          `${settings.dateFormat} HH:mm`,
                        )}{" "}
                        · {kindOf(b.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="restore-confirm">
                    Type the site title, “{settings.title}”, to confirm
                  </Label>
                  <Input
                    id="restore-confirm"
                    name="confirm"
                    autoComplete="off"
                    className="max-w-xs"
                  />
                </div>
                <SubmitButton
                  variant="destructive"
                  size="sm"
                  className="justify-self-start"
                  pendingLabel="Restoring…"
                >
                  Restore this backup
                </SubmitButton>
              </ActionForm>
            )}
            <div className="grid gap-2">
              <p className="font-medium">From a file</p>
              <RestoreUpload siteTitle={settings.title} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
