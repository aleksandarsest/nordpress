import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { UploadImage } from "@/components/upload-image";
import { mediaUrl } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { getShopProduct } from "@/lib/shop";
import { formatMoney } from "@/lib/shop/money";
import { siteUrl } from "@/lib/site-url";
import { AddToCart } from "../add-to-cart";

type Props = PageProps<"/shop/[slug]">;

// Resolved before anything streams, so unknown products get a real 404
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getShopProduct((await params).slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.summary || undefined,
    alternates: { types: { "text/markdown": `/shop/${product.slug}.md` } },
  };
}

export default async function ProductPage({ params }: Props) {
  const [product, settings] = await Promise.all([
    getShopProduct((await params).slug),
    getSettings(),
  ]);
  if (!product) notFound();
  const price = formatMoney(product.priceCents, settings.shopCurrency);

  return (
    <article className="grid gap-8 md:grid-cols-2">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          ...(product.summary && { description: product.summary }),
          ...(product.sku && { sku: product.sku }),
          ...(product.imagePath && {
            image: siteUrl(mediaUrl(product.imagePath)),
          }),
          url: siteUrl(`/shop/${product.slug}`),
          offers: {
            "@type": "Offer",
            price: (product.priceCents / 100).toFixed(2),
            priceCurrency: settings.shopCurrency,
            availability:
              product.stock === 0
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            url: siteUrl(`/shop/${product.slug}`),
          },
        }}
      />
      {product.imagePath ? (
        <UploadImage
          path={product.imagePath}
          alt={product.imageAlt ?? ""}
          width={product.imageWidth}
          height={product.imageHeight}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="h-auto w-full rounded-xl"
          priority
        />
      ) : (
        <div aria-hidden className="aspect-square w-full rounded-xl bg-muted" />
      )}
      <div className="grid content-start gap-4">
        <Link
          href="/shop"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Shop
        </Link>
        <h1 className="font-semibold text-3xl tracking-tight">
          {product.name}
        </h1>
        <p className="text-xl">{price}</p>
        {product.summary && (
          <p className="text-muted-foreground">{product.summary}</p>
        )}
        <AddToCart productId={product.id} available={product.stock} />
        {product.stock !== null && product.stock > 0 && product.stock <= 5 && (
          <p className="text-muted-foreground text-sm">
            Only {product.stock} left.
          </p>
        )}
        {product.descriptionHtml && (
          <div
            className="prose prose-neutral dark:prose-invert mt-4 max-w-none"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered from Markdown through the editor schema, which drops scripts and unknown markup
            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
          />
        )}
      </div>
    </article>
  );
}
