import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { email, password } from "@/lib/form";
import { installSite, isInstalled } from "@/lib/install";
import { ALL_CACHE_TAGS, invalidate } from "@/lib/rest/core";

// Installs a hosted site for its new owner, called once by the platform that
// created it (see platform/). The same as the /install form, without the
// page: the owner's password goes straight from their signup to here.
const input = z.object({
  title: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email,
  password,
});

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !secret ||
    !given ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  )
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (await isInstalled())
    return Response.json({ error: "Already installed." }, { status: 409 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 },
    );
  await installSite({ ...parsed.data, blogPublic: true });
  invalidate(...ALL_CACHE_TAGS);
  return Response.json({ installed: true });
}
