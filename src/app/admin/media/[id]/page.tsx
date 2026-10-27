import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supportsAltText } from "@/lib/ai/alt-text";
import { aiConfigured } from "@/lib/ai/client";
import { getMedia, mediaUrl } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { AltTextFields } from "../../_components/alt-text-fields";
import { deleteMediaAction, updateMediaAction } from "../actions";

export const metadata: Metadata = { title: "Edit Media" };

export default async function EditMediaPage({
  params,
}: PageProps<"/admin/media/[id]">) {
  await requireViewer("upload_files");
  const item = await getMedia(Number((await params).id) || 0);
  if (!item) notFound();
  const ai = (await getSettings()).aiEnabled && aiConfigured();
  const url = mediaUrl(item.path);
  const isImage = item.mimeType.startsWith("image/");

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">Edit Media</h1>
        <Link
          href="/admin/media"
          className="text-primary text-sm hover:underline"
        >
          ← Media Library
        </Link>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex items-start justify-center rounded-lg border bg-background p-4">
          {isImage ? (
            // biome-ignore lint/performance/noImgElement: arbitrary user uploads
            <img
              src={url}
              alt={item.alt || item.title}
              className="max-h-[70vh] max-w-full"
            />
          ) : (
            <a href={url} className="text-primary underline">
              {item.filename}
            </a>
          )}
        </div>
        <div className="grid content-start gap-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Uploaded</dt>
            <dd>{format(item.createdAt, "MMMM d, yyyy")}</dd>
            <dt className="text-muted-foreground">File</dt>
            <dd className="break-all">{item.filename}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd>{item.mimeType}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{(item.size / 1024).toFixed(0)} KB</dd>
            {item.width && (
              <>
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd>
                  {item.width} × {item.height} pixels
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">URL</dt>
            <dd className="break-all">
              <a href={url} className="text-primary underline">
                {url}
              </a>
            </dd>
          </dl>
          <ActionForm action={updateMediaAction} className="grid gap-4">
            <input type="hidden" name="id" value={item.id} />
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" defaultValue={item.title} />
            </div>
            <AltTextFields
              mediaId={item.id}
              alt={item.alt}
              caption={item.caption}
              isImage={isImage}
              ai={ai && supportsAltText(item)}
            />
            <div>
              <SubmitButton>Update</SubmitButton>
            </div>
          </ActionForm>
          <form action={deleteMediaAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="destructive" size="sm">
              Delete permanently
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
