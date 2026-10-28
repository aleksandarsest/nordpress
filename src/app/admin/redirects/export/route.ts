import { hasCap } from "@/lib/capabilities";
import { csvCell } from "@/lib/forms/csv";
import { allRedirects } from "@/lib/redirects";
import { getViewer } from "@/lib/session";

// The same columns the import reads, so the file moves between sites
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "manage_options"))
    return new Response("Forbidden", { status: 403 });
  const rows = await allRedirects();
  const csv = [
    ["source", "target", "code", "hits"],
    ...rows.map((r) => [r.source, r.target, String(r.status), String(r.hits)]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="redirects.csv"',
      "Cache-Control": "no-store",
    },
  });
}
