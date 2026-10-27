import type { Metadata } from "next";
import Link from "next/link";
import { UploadImage } from "@/components/upload-image";
import { getSettings } from "@/lib/options";
import { listShopProducts } from "@/lib/shop";
import { formatMoney } from "@/lib/shop/money";
import { activeTheme, getThemeOptions } from "@/lib/themes";

export const metadata: Metadata = { title: "Shop" };

export default async function ShopPage() {
  const [items, settings, theme] = await Promise.all([
    listShopProducts(),
    getSettings(),
    activeTheme(),
  ]);
  const options = await getThemeOptions(theme.slug);
  const { ArchiveHeader, Empty } = theme.components;
  return (
    <>
      <ArchiveHeader title="Shop" options={options} />
      {items.length === 0 ? (
        <Empty message="Nothing for sale yet." />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="grid content-start gap-3">
              <Link href={`/shop/${p.slug}`} className="group grid gap-3">
                {p.imagePath ? (
                  <UploadImage
                    path={p.imagePath}
                    alt={p.imageAlt ?? ""}
                    width={p.imageWidth}
                    height={p.imageHeight}
                    sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                    className="aspect-square h-auto w-full rounded-xl object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="aspect-square w-full rounded-xl bg-muted"
                  />
                )}
                <span className="font-semibold group-hover:underline">
                  {p.name}
                </span>
              </Link>
              <span className="text-sm">
                {formatMoney(p.priceCents, settings.shopCurrency)}
                {p.stock === 0 && (
                  <span className="text-muted-foreground"> · Sold out</span>
                )}
              </span>
              {p.summary && (
                <p className="text-muted-foreground text-sm">{p.summary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
