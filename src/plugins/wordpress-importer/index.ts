import { definePlugin } from "@/lib/plugins/types";
import { ImportScreen } from "./import-screen";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export default definePlugin({
  slug: "wordpress-importer",
  name: "WordPress Importer",
  version: "1.0.0",
  description:
    "Imports posts, pages, comments, categories, tags, authors and media from a WordPress export file (Tools → Export in WordPress).",
  author: "Nordpress",
  settings: [
    {
      type: "checkbox",
      key: "allowPrivateHosts",
      label: "Allow downloading media from private network addresses",
      help: "Only for importing from a WordPress site on your own network (e.g. localhost). Leave off otherwise.",
      default: false,
    },
  ],
  adminPages: [
    {
      path: "import",
      title: "Import from WordPress",
      cap: "manage_options",
      component: ImportScreen,
    },
  ],
  rest: [
    {
      // Multipart upload: file, author_mode, download_media
      method: "POST",
      path: "/import",
      handler: async ({ request, requireCap }) => {
        const viewer = await requireCap("manage_options");
        const { RestError } = await import("@/lib/rest/core");
        const form = await request.formData();
        const file = form.get("file");
        const siteUrl = String(form.get("site_url") ?? "").trim();
        const hasFile = file instanceof File && file.size > 0;
        if (!hasFile && !siteUrl)
          throw new RestError(
            "rest_upload_no_data",
            "Choose an export file or enter your site's address.",
            400,
          );
        if (hasFile && file.size > MAX_FILE_BYTES)
          throw new RestError(
            "rest_upload_too_large",
            "The export file is larger than 100 MB.",
            400,
          );

        const mode = String(form.get("author_mode") ?? "match");
        const { startImport } = await import("./importer");
        const { getPluginSettings } = await import("@/lib/plugins");
        const { after } = await import("next/server");
        const settings = await getPluginSettings("wordpress-importer");
        try {
          const { job, run } = startImport(
            hasFile ? { xml: await file.text() } : { siteUrl },
            viewer,
            {
              authorMode: mode === "me" || mode === "create" ? mode : "match",
              downloadMedia: form.get("download_media") === "on",
              allowPrivateHosts: Boolean(settings.allowPrivateHosts),
            },
          );
          // The import keeps running after the response; the screen polls /status
          after(run);
          return job;
        } catch (error) {
          throw new RestError(
            "rest_import_busy",
            (error as Error).message,
            409,
          );
        }
      },
    },
    {
      method: "GET",
      path: "/status",
      handler: async ({ requireCap }) => {
        await requireCap("manage_options");
        const { currentJob } = await import("./importer");
        return currentJob();
      },
    },
  ],
  register() {},
});
