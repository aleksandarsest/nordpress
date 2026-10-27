import { llmsFullTxt } from "@/lib/ai-readable";
import { getSettings } from "@/lib/options";

export async function GET() {
  const settings = await getSettings();
  if (!settings.blogPublic) return new Response("Not found\n", { status: 404 });
  return new Response(await llmsFullTxt(settings), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
