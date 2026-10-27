import "server-only";
import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  like,
  type SQL,
} from "drizzle-orm";
import { imageSize } from "image-size";
import { db } from "@/db";
import { media } from "@/db/schema";
import { doAction } from "./plugins";
import { slugify } from "./slug";
import { storage } from "./storage";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// SVG is excluded on purpose: it can carry script, as in WordPress.
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function mediaUrl(relPath: string) {
  return `/uploads/${relPath}`;
}

export class UploadError extends Error {}

export async function storeUpload(file: File, uploaderId: string) {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext)
    throw new UploadError(
      `Sorry, ${file.type || "this file type"} is not allowed.`,
    );
  if (file.size > MAX_UPLOAD_BYTES)
    throw new UploadError("The file is larger than 20 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  let width: number | null = null;
  let height: number | null = null;
  if (file.type.startsWith("image/")) {
    try {
      ({ width, height } = imageSize(bytes));
    } catch {
      throw new UploadError("The image appears to be damaged.");
    }
  }

  const now = new Date();
  const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "file";
  const relPath = `${dir}/${base}-${randomUUID().slice(0, 8)}.${ext}`;

  await storage().put(relPath, bytes, file.type);

  const [row] = await db
    .insert(media)
    .values({
      uploaderId,
      path: relPath,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      width,
      height,
      title: file.name.replace(/\.[^.]+$/, ""),
    })
    .returning();
  await doAction("media.uploaded", row);
  return row;
}

export async function listMedia(q: {
  search?: string;
  type?: string;
  page?: number;
  perPage?: number;
}) {
  const perPage = q.perPage ?? 40;
  const page = Math.max(1, q.page ?? 1);
  const where: SQL[] = [];
  if (q.search) where.push(ilike(media.title, `%${q.search}%`));
  if (q.type) where.push(like(media.mimeType, `${q.type}/%`));

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(media)
      .where(and(...where))
      .orderBy(desc(media.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ total: count() })
      .from(media)
      .where(and(...where)),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getMedia(id: number) {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  return row ?? null;
}

export async function updateMedia(
  id: number,
  values: { title: string; alt: string; caption: string },
) {
  const [row] = await db
    .update(media)
    .set(values)
    .where(eq(media.id, id))
    .returning();
  return row;
}

export async function deleteMedia(id: number) {
  const row = await getMedia(id);
  if (!row) return;
  await db.delete(media).where(eq(media.id, id));
  await storage().remove(row.path);
}

// Images the AI can describe (see lib/ai/alt-text.ts) that have no alt text.
export async function countMissingAltText() {
  return db.$count(
    media,
    and(
      eq(media.alt, ""),
      inArray(media.mimeType, [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ]),
    ),
  );
}
