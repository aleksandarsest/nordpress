import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-24">
      <p className="font-medium text-muted-foreground text-sm">404</p>
      <h1 className="font-semibold text-3xl tracking-tight">
        This page doesn’t exist
      </h1>
      <p className="text-muted-foreground">
        It may have moved, or the link may be mistyped. Try searching for it:
      </p>
      <form action="/" className="flex gap-2">
        <label htmlFor="nf-search" className="sr-only">
          Search
        </label>
        <input
          id="nf-search"
          name="s"
          type="search"
          placeholder="Search…"
          className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-4 text-primary-foreground text-sm"
        >
          Search
        </button>
      </form>
      <Link href="/" className="text-primary text-sm hover:underline">
        ← Back to the homepage
      </Link>
    </main>
  );
}
