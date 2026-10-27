import { hasCap } from "@/lib/capabilities";
import { allSubmissions, getForm } from "@/lib/forms";
import { submissionsCsv } from "@/lib/forms/csv";
import { getViewer } from "@/lib/session";
import { slugify } from "@/lib/slug";

export async function GET(
  _: Request,
  { params }: RouteContext<"/admin/forms/[id]/export">,
) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "edit_others_pages"))
    return new Response("Forbidden", { status: 403 });
  const form = await getForm(Number((await params).id));
  if (!form) return new Response("Not found", { status: 404 });

  const rows = await allSubmissions(form.id);
  return new Response(submissionsCsv(form.fields, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(form.title) || "form"}-responses.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
