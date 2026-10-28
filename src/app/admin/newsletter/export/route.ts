import { hasCap } from "@/lib/capabilities";
import { csvCell } from "@/lib/forms/csv";
import { allSubscribers } from "@/lib/newsletter";
import { getViewer } from "@/lib/session";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "edit_others_posts"))
    return new Response("Forbidden", { status: 403 });
  const rows = await allSubscribers();
  const csv = [
    ["email", "name", "status", "source", "subscribed", "unsubscribed"],
    ...rows.map((s) => [
      s.email,
      s.name,
      s.status,
      s.source,
      s.confirmedAt?.toISOString() ?? "",
      s.unsubscribedAt?.toISOString() ?? "",
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
