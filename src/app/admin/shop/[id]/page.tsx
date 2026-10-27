import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getMedia, mediaUrl } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { getProduct } from "@/lib/shop";
import { centsToInput } from "@/lib/shop/money";
import { first } from "../../_components/screen";
import { ProductForm, type ProductFormValues } from "../product-form";

export const metadata: Metadata = { title: "Edit Product" };

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/admin/shop/[id]">) {
  await requireViewer("edit_others_pages");
  const { id } = await params;
  const settings = await getSettings();
  let product: ProductFormValues = {
    name: "",
    slug: "",
    summary: "",
    description: "",
    price: "",
    sku: "",
    stock: "",
    shippable: true,
    status: "draft",
    image: null,
  };
  if (id !== "new") {
    const row = Number.isInteger(Number(id))
      ? await getProduct(Number(id))
      : null;
    if (!row) notFound();
    const image = row.imageId ? await getMedia(row.imageId) : null;
    product = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      summary: row.summary,
      description: row.description,
      price: centsToInput(row.priceCents, settings.shopCurrency),
      sku: row.sku,
      stock: row.stock === null ? "" : String(row.stock),
      shippable: row.shippable,
      status: row.status,
      image: image ? { id: image.id, url: mediaUrl(image.path) } : null,
    };
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          {product.id ? "Edit Product" : "Add Product"}
        </h1>
        <Link
          href="/admin/shop"
          className="text-primary text-sm hover:underline"
        >
          All products
        </Link>
        {product.id && product.status === "active" && (
          <a
            href={`/shop/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-sm hover:underline"
          >
            View product
          </a>
        )}
      </div>
      {first((await searchParams).created) && (
        <Alert className="mb-4">
          <AlertDescription>Product created.</AlertDescription>
        </Alert>
      )}
      <ProductForm
        key={product.id ?? "new"}
        product={product}
        currency={settings.shopCurrency}
      />
    </>
  );
}
