import { ImportForm } from "./import-form";

export function ImportScreen() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">
        Copy your existing site
      </h1>
      <p className="mb-6 text-muted-foreground text-sm">
        Enter the address of the site you have now. WordPress sites are read
        through their API, with posts, pages, comments, categories and tags. Any
        other site (Wix, Squarespace, Webflow, Jimdo or hand-made) is copied
        page by page: the text of each page, its images, blog posts with their
        dates, and the menu. Old addresses redirect to the new ones, so links
        and search results keep working when your domain moves here. Running it
        again skips what's already been copied.
      </p>
      <ImportForm />
    </div>
  );
}
