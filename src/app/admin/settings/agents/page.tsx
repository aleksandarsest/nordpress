import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recentAgentActions } from "@/lib/agent/audit";
import { formatInZone } from "@/lib/dates";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { saveAgentsAction } from "../actions";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsSettingsPage() {
  const viewer = await requireViewer("manage_options");
  const [s, actions] = await Promise.all([
    getSettings(),
    recentAgentActions(100),
  ]);
  const endpoint = siteUrl("/mcp");

  return (
    <>
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">Agents</h1>
      <p className="mb-6 max-w-2xl text-muted-foreground text-sm">
        AI agents such as Claude Code and Claude Desktop can manage this site
        over the Model Context Protocol (MCP): find, write and edit posts and
        pages, moderate comments and read form responses. They act as the user
        whose application password they use, with that user&apos;s role, and
        every change is logged below.
      </p>

      <ActionForm
        action={saveAgentsAction}
        className="mb-10 grid max-w-2xl gap-4"
      >
        <Label className="items-start font-normal">
          <Checkbox name="mcp_enabled" defaultChecked={s.mcpEnabled} />
          <span>
            Allow agents to connect
            <span className="block text-muted-foreground text-xs">
              At <code>{endpoint}</code>, with an application password.
            </span>
          </span>
        </Label>
        <Label className="items-start font-normal">
          <Checkbox
            name="agents_can_publish"
            defaultChecked={s.agentsCanPublish}
          />
          <span>
            Let agents change the live site
            <span className="block text-muted-foreground text-xs">
              Publish, edit or trash published content and reply to comments.
              When off, anything an agent wants to publish waits in Pending
              Review for a person, and published content is read-only to agents.
            </span>
          </span>
        </Label>
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>

      <section className="mb-10 grid max-w-3xl gap-3 text-sm">
        <h2 className="font-semibold text-lg">Connect an agent</h2>
        <p>
          Give your MCP client this address: <code>{endpoint}</code>. In Claude,
          add it as a custom connector. The client registers itself, you sign in
          here and choose <strong>Allow</strong>, and it acts with your role.
          Connected apps are listed under{" "}
          <Link href="/admin/profile" className="text-primary underline">
            Profile
          </Link>
          , where you can disconnect them.
        </p>
        <p className="text-muted-foreground">
          For scripts and clients without OAuth, create an application password
          under Profile and send it as Basic auth:
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {`claude mcp add --transport http nordpress ${endpoint} \\\n  --header "Authorization: Basic $(printf '%s' '${viewer.email}:<app password>' | base64)"`}
        </pre>
        <p className="text-muted-foreground">
          Revoking the application password disconnects the agent immediately.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold text-lg">Activity</h2>
        <p className="text-muted-foreground text-sm">
          The latest 100 changes and refused or failed calls. Lookups are not
          logged.
        </p>
        {actions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            No agent activity yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                    {formatInZone(
                      a.createdAt,
                      s.timezone,
                      `${s.dateFormat}, HH:mm`,
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.userName ?? "Deleted user"}
                    {a.credential && (
                      <span className="block text-muted-foreground">
                        via {a.credential}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md text-xs">
                    <code className="font-medium">{a.tool}</code>
                    {a.target && (
                      <span className="ml-2 text-muted-foreground">
                        {a.target}
                      </span>
                    )}
                    <span className="mt-1 block break-words text-muted-foreground">
                      {JSON.stringify(a.args)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs text-xs">
                    <Badge
                      variant={
                        a.outcome === "ok"
                          ? "secondary"
                          : a.outcome === "denied"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {a.outcome === "ok"
                        ? "Done"
                        : a.outcome === "denied"
                          ? "Refused"
                          : "Failed"}
                    </Badge>
                    {a.message && (
                      <span className="mt-1 block text-muted-foreground">
                        {a.message}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
