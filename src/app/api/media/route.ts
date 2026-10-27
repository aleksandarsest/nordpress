import { queueAutoAltText } from "@/lib/ai/alt-text";
import { hasCap } from "@/lib/capabilities";
import { mediaUrl, storeUpload, UploadError } from "@/lib/media";
import { getViewer } from "@/lib/session";

// Uploads go through a Route Handler rather than a Server Action so large
// files aren't held to the Server Action body size limit.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, "upload_files")) {
    return Response.json(
      { error: "Sorry, you are not allowed to upload files." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0)
    return Response.json({ error: "No file was uploaded." }, { status: 400 });

  const uploaded = [];
  const stored = [];
  const errors = [];
  for (const file of files) {
    try {
      const row = await storeUpload(file, viewer.id);
      stored.push(row);
      uploaded.push({
        id: row.id,
        url: mediaUrl(row.path),
        title: row.title,
        alt: row.alt,
        mimeType: row.mimeType,
      });
    } catch (error) {
      errors.push(
        `${file.name}: ${error instanceof UploadError ? error.message : "upload failed."}`,
      );
    }
  }
  await queueAutoAltText(stored, viewer.id);
  return Response.json(
    { uploaded, errors },
    { status: uploaded.length ? 201 : 400 },
  );
}
