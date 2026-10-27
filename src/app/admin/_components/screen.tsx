import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
      {action && (
        <Link
          href={action.href}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {action.label}
        </Link>
      )}
      {children}
    </div>
  );
}

export function FilterLinks({
  links,
}: {
  links: { label: string; href: string; count?: number; active: boolean }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-1 text-sm">
      {links.map((link, i) => (
        <span key={link.href} className="text-muted-foreground">
          {i > 0 && <span className="mx-1">|</span>}
          <Link
            href={link.href}
            className={cn(
              "hover:underline",
              link.active ? "font-semibold text-foreground" : "text-primary",
            )}
          >
            {link.label}
          </Link>
          {link.count !== undefined && ` (${link.count})`}
        </span>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      {page > 1 && (
        <Link
          href={hrefFor(page - 1)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          ‹ Previous
        </Link>
      )}
      <span className="text-muted-foreground">
        {page} of {pages}
      </span>
      {page < pages && (
        <Link
          href={hrefFor(page + 1)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Next ›
        </Link>
      )}
    </div>
  );
}

// Builds a URL from a base path and the non-empty entries of `params`.
export function withParams(
  base: string,
  params: Record<string, string | number | undefined>,
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== 1) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
