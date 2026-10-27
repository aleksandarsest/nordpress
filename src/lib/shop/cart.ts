// Prices a cart against the current catalog. The browser only ever sends
// product ids and quantities; names and prices always come from here. Pure.

export type CartLine = { productId: number; quantity: number };

export type CatalogItem = {
  id: number;
  slug: string;
  name: string;
  sku: string;
  priceCents: number;
  stock: number | null;
  shippable: boolean;
  status: "draft" | "active" | "archived";
};

export type PricedLine = {
  productId: number;
  slug: string;
  name: string;
  sku: string;
  priceCents: number;
  quantity: number;
  shippable: boolean;
  lineCents: number;
};

export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;

export function priceCart(lines: CartLine[], catalog: CatalogItem[]) {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const merged = new Map<number, number>();
  for (const line of lines.slice(0, MAX_LINES)) {
    if (!Number.isInteger(line.productId) || !Number.isInteger(line.quantity))
      continue;
    merged.set(
      line.productId,
      (merged.get(line.productId) ?? 0) + line.quantity,
    );
  }
  const items: PricedLine[] = [];
  const problems: string[] = [];
  for (const [productId, wanted] of merged) {
    const product = byId.get(productId);
    if (product?.status !== "active") {
      problems.push(
        "An item in your cart is no longer available and was removed.",
      );
      continue;
    }
    let quantity = Math.min(Math.max(wanted, 0), MAX_QUANTITY);
    if (product.stock !== null && quantity > product.stock) {
      quantity = product.stock;
      problems.push(
        product.stock === 0
          ? `“${product.name}” is sold out and was removed.`
          : `Only ${product.stock} of “${product.name}” left; your cart was updated.`,
      );
    }
    if (quantity <= 0) continue;
    items.push({
      productId,
      slug: product.slug,
      name: product.name,
      sku: product.sku,
      priceCents: product.priceCents,
      quantity,
      shippable: product.shippable,
      lineCents: product.priceCents * quantity,
    });
  }
  return {
    items,
    problems,
    totalCents: items.reduce((n, i) => n + i.lineCents, 0),
    needsShipping: items.some((i) => i.shippable),
  };
}
