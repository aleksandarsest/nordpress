import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { UploadImage } from "@/components/upload-image";
import { aiConfigured } from "@/lib/ai/client";
import { countMissingAltText, listMedia } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { BulkAltText } from "../_components/bulk-alt-text";
import {
  first,
  Pagination,
  ScreenHeader,
  withParams,
} from "../_components/screen";
import { Uploader } from "../_components/uploader";

export const metadata: Metadata = { title: "Media Library" };

export default async function MediaPage({
  searchParams,
}: PageProps<"/admin/media">) {
  await requireViewer("upload_files");
  const params = await searchParams;
  const search = first(params.s) ?? "";
  const page = Number(first(params.paged)) || 1;
  const [list, settings] = await Promise.all([
    listMedia({ search, page }),
    getSettings(),
  ]);
  const ai = settings.aiEnabled && aiConfigured();
  const missingAlt = ai ? await countMissingAltText() : 0;

  return (
    <>
      <ScreenHeader title="Media Library" />
      {first(params.deleted) && (
        <Alert className="mb-4">
          <AlertDescription>Media file permanently deleted.</AlertDescription>
        </Alert>
      )}
      <Uploader />
      {ai && <BulkAltText missing={missingAlt} />}
      <form className="mb-4 flex justify-end">
        <Input
          name="s"
          defaultValue={search}
          placeholder="Search media"
          className="h-8 w-56"
        />
      </form>
      {list.items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          No media files found.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {list.items.map((item) => (
            <Link
              key={item.id}
              href={`/admin/media/${item.id}`}
              className="group aspect-square overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              title={item.title}
            >
              {item.mimeType.startsWith("image/") ? (
                <UploadImage
                  path={item.path}
                  alt={item.alt || item.title}
                  width={item.width}
                  height={item.height}
                  sizes="(min-width: 1280px) 160px, (min-width: 640px) 25vw, 50vw"
                  className="size-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-xs">
                  <FileText className="size-8 text-muted-foreground" />
                  <span className="line-clamp-2 break-all">
                    {item.filename}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
      <Pagination
        page={list.page}
        pages={list.pages}
        hrefFor={(p) => withParams("/admin/media", { s: search, paged: p })}
      />
    </>
  );
}
