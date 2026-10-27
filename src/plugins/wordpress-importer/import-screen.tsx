import { ImportForm } from "./import-form";

export function ImportScreen() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">
        Import from WordPress
      </h1>
      <p className="mb-6 text-muted-foreground text-sm">
        In your WordPress dashboard, go to <strong>Tools → Export</strong>,
        choose <strong>All content</strong> and download the file. Then upload
        it here. Posts, pages, comments, categories, tags and authors are
        imported; media can be downloaded from the old site. Running the same
        import again skips anything already imported.
      </p>
      <ImportForm />
    </div>
  );
}
