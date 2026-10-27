import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hasCap } from "@/lib/capabilities";
import { OAuthError, validateAuthorizeRequest } from "@/lib/oauth";
import { getSettings } from "@/lib/options";
import { getViewer } from "@/lib/session";
import { approveAction, denyAction } from "./actions";

export const metadata: Metadata = {
  title: "Connect an app",
  robots: { index: false },
};

export const instant = false;

// The consent screen an MCP client (Claude, ...) sends people to.
export default async function AuthorizePage({
  searchParams,
}: PageProps<"/oauth/authorize">) {
  const raw = await searchParams;
  const params = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v]] : [],
    ),
  );
  const viewer = await getViewer();
  if (!viewer)
    redirect(
      `/login?redirect_to=${encodeURIComponent(`/oauth/authorize?${params}`)}`,
    );
  const settings = await getSettings();

  let client: Awaited<ReturnType<typeof validateAuthorizeRequest>>["client"];
  try {
    if (!settings.mcpEnabled)
      throw new OAuthError(
        "access_denied",
        "Agent access is turned off for this site.",
      );
    ({ client } = await validateAuthorizeRequest(params));
  } catch (error) {
    return (
      <Card>
        <CardContent className="grid gap-2 text-sm">
          <p className="font-semibold">This connection can't be made</p>
          <p className="text-muted-foreground">
            {error instanceof OAuthError
              ? error.message
              : "The request is invalid."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const can = [
    hasCap(viewer, "edit_posts") && "find, read and draft posts and pages",
    hasCap(viewer, "moderate_comments") && "moderate comments",
    hasCap(viewer, "edit_others_pages") &&
      "manage products and read form responses",
    hasCap(viewer, "manage_options") && "see shop orders",
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="grid gap-4 text-sm">
        <p className="text-base">
          <strong>{client.name}</strong> wants to work on{" "}
          <strong>{settings.title}</strong> as you, {viewer.name}.
        </p>
        {can.length > 0 && (
          <div className="grid gap-1">
            <p>With your role ({viewer.role}) it will be able to:</p>
            <ul className="ml-5 list-disc text-muted-foreground">
              {can.map((c) => (
                <li key={String(c)}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-muted-foreground">
          {settings.agentsCanPublish
            ? "Agents may publish and change live content on this site."
            : "It can't publish or change live content: what it wants to publish waits for review."}{" "}
          Everything it changes is logged, and you can disconnect it any time
          from your profile.
        </p>
        <p className="break-all text-muted-foreground text-xs">
          You'll be sent back to{" "}
          {new URL(params.get("redirect_uri") ?? "").host}.
        </p>
        <div className="flex gap-2">
          <form action={approveAction}>
            <input type="hidden" name="request" value={params.toString()} />
            <Button type="submit">Allow</Button>
          </form>
          <form action={denyAction}>
            <input type="hidden" name="request" value={params.toString()} />
            <Button type="submit" variant="outline">
              Deny
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
