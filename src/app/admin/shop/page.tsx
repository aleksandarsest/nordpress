import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mediaUrl } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { adminListProducts } from "@/lib/shop";
import { formatMoney } from "@/lib/shop/money";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireViewer("edit_others_pages");
  const [rows, settings] = await Promise.all([
    adminListProducts(),
    getSettings(),
  ]);
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">Products</h1>
        <Link
          href="/admin/shop/new"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Add New Product
        </Link>
        <a
          href="/shop"
          target="_blank"
          rel="noreferrer"
          className="text-primary text-sm hover:underline"
        >
          View shop
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No products yet. Add one and it appears at <code>/shop</code> once
          it's active.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14" />
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ product: p, imagePath }) => (
              <TableRow key={p.id}>
                <TableCell>
                  {imagePath ? (
                    // biome-ignore lint/performance/noImgElement: a small admin thumbnail
                    <img
                      src={mediaUrl(imagePath)}
                      alt=""
                      className="size-10 rounded object-cover"
                    />
                  ) : (
                    <div className="size-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/shop/${p.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.sku && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      {p.sku}
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.priceCents, settings.shopCurrency)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {p.stock === null ? (
                    "∞"
                  ) : p.stock === 0 ? (
                    <Badge variant="destructive">Sold out</Badge>
                  ) : (
                    p.stock
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={p.status === "active" ? "secondary" : "outline"}
                  >
                    {p.status === "active"
                      ? "Active"
                      : p.status === "draft"
                        ? "Draft"
                        : "Archived"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
