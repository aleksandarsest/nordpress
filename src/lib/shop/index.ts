import "server-only";
import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  media,
  type Order,
  type OrderAddress,
  type OrderStatus,
  orders,
  type Product,
  products,
} from "@/db/schema";
import { htmlToDoc, renderContent } from "../content";
import { sendMail } from "../mail";
import { markdownToHtml } from "../markdown";
import { getSettings } from "../options";
import { siteUrl } from "../site-url";
import { slugify, uniqueSlug } from "../slug";
import { type CartLine, type CatalogItem, priceCart } from "./cart";
import { formatMoney } from "./money";
import { createCheckoutSession, stripeConfigured } from "./stripe";

export const SHOP_TAG = "shop";

export class ShopError extends Error {}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const productInput = z.object({
  name: z.string().trim().min(1, "Give the product a name.").max(200),
  slug: z.string().trim().max(200).default(""),
  summary: z.string().trim().max(500).default(""),
  description: z.string().max(50_000).default(""),
  priceCents: z
    .number()
    .int()
    .min(0, "The price can't be negative.")
    .max(100_000_000),
  imageId: z.number().int().positive().nullable().default(null),
  sku: z.string().trim().max(100).default(""),
  stock: z.number().int().min(0).nullable().default(null),
  shippable: z.boolean().default(true),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
});
export type ProductInput = z.input<typeof productInput>;

// Product descriptions are written in Markdown and kept to what the editor
// schema allows, like all other content.
const renderDescription = (markdown: string) =>
  renderContent(htmlToDoc(markdownToHtml(markdown))).html;

async function freeSlug(base: string, excludeId?: number) {
  return uniqueSlug(slugify(base) || "product", async (slug) => {
    const [hit] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug));
    return !!hit && hit.id !== excludeId;
  });
}

export async function saveProduct(
  input: ProductInput,
  id?: number,
  meta?: Record<string, unknown>,
) {
  const data = productInput.parse(input);
  const existing = id
    ? (await db.select().from(products).where(eq(products.id, id)))[0]
    : undefined;
  if (id && !existing) throw new ShopError("That product no longer exists.");
  const slug =
    data.slug && slugify(data.slug) === existing?.slug
      ? existing.slug
      : await freeSlug(data.slug || data.name, id);
  const values = {
    ...data,
    slug,
    descriptionHtml: renderDescription(data.description),
    ...(meta && { meta }),
  };
  const [saved] = existing
    ? await db
        .update(products)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(products.id, existing.id))
        .returning()
    : await db.insert(products).values(values).returning();
  return saved;
}

export async function getProduct(id: number) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row ?? null;
}

export async function adminListProducts() {
  return db
    .select({ product: products, imagePath: media.path })
    .from(products)
    .leftJoin(media, eq(media.id, products.imageId))
    .orderBy(desc(products.updatedAt));
}

export type ShopProduct = Product & {
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAlt: string | null;
};

// The public catalog: active products, cached until anything changes.
export async function listShopProducts(): Promise<ShopProduct[]> {
  "use cache";
  cacheTag(SHOP_TAG);
  cacheLife("hours");
  const rows = await db
    .select({
      product: products,
      imagePath: media.path,
      imageWidth: media.width,
      imageHeight: media.height,
      imageAlt: media.alt,
    })
    .from(products)
    .leftJoin(media, eq(media.id, products.imageId))
    .where(eq(products.status, "active"))
    .orderBy(asc(products.name));
  return rows.map((r) => ({
    ...r.product,
    imagePath: r.imagePath,
    imageWidth: r.imageWidth,
    imageHeight: r.imageHeight,
    imageAlt: r.imageAlt,
  }));
}

export async function getShopProduct(slug: string) {
  return (await listShopProducts()).find((p) => p.slug === slug) ?? null;
}

async function catalogFor(ids: number[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      sku: products.sku,
      priceCents: products.priceCents,
      stock: products.stock,
      shippable: products.shippable,
      status: products.status,
    })
    .from(products)
    .where(inArray(products.id, ids));
}

export async function priceLines(lines: CartLine[]) {
  const catalog = await catalogFor([...new Set(lines.map((l) => l.productId))]);
  return priceCart(lines, catalog);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const customerInput = z.object({
  email: z.email("Enter a valid email address.").max(320),
  name: z.string().trim().min(1, "Enter your name.").max(200),
  note: z.string().trim().max(2000).default(""),
  address: z
    .object({
      line1: z.string().trim().min(1, "Enter your street address.").max(200),
      line2: z.string().trim().max(200).default(""),
      city: z.string().trim().min(1, "Enter your city.").max(100),
      postalCode: z.string().trim().min(1, "Enter your postal code.").max(20),
      country: z.string().trim().min(2, "Enter your country.").max(60),
    })
    .nullable(),
});

export type PlacedOrder = { order: Order; redirectTo: string };

export async function placeOrder(
  lines: CartLine[],
  customer: z.input<typeof customerInput>,
): Promise<PlacedOrder> {
  const settings = await getSettings();
  const cart = await priceLines(lines);
  if (cart.problems.length) throw new ShopError(cart.problems.join(" "));
  if (cart.items.length === 0) throw new ShopError("Your cart is empty.");
  const who = customerInput.parse(customer);
  if (cart.needsShipping && !who.address)
    throw new ShopError("Enter a shipping address.");

  const payment = stripeConfigured() ? "stripe" : "manual";
  const order = await db.transaction(async (tx) => {
    // Reserve stock atomically: an update that only succeeds while enough is left
    for (const item of cart.items) {
      const [ok] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(
          and(
            eq(products.id, item.productId),
            or(isNull(products.stock), gte(products.stock, item.quantity)),
          ),
        )
        .returning({ id: products.id });
      if (!ok)
        throw new ShopError(
          `“${item.name}” just sold out. Please update your cart.`,
        );
    }
    const [created] = await tx
      .insert(orders)
      .values({
        token: randomBytes(18).toString("base64url"),
        email: who.email.toLowerCase(),
        name: who.name,
        note: who.note,
        address: cart.needsShipping ? (who.address as OrderAddress) : null,
        items: cart.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          priceCents: i.priceCents,
          quantity: i.quantity,
          shippable: i.shippable,
        })),
        totalCents: cart.totalCents,
        currency: settings.shopCurrency,
        payment,
      })
      .returning();
    return created;
  });

  if (payment === "stripe") {
    try {
      const session = await createCheckoutSession(order);
      await db
        .update(orders)
        .set({ paymentRef: session.id })
        .where(eq(orders.id, order.id));
      return { order, redirectTo: session.url };
    } catch (error) {
      await setOrderStatus(order.id, "cancelled");
      throw error;
    }
  }
  await notifyOrder(order, "placed");
  return { order, redirectTo: `/shop/order/${order.token}` };
}

export async function getOrderByToken(token: string) {
  const [row] = await db.select().from(orders).where(eq(orders.token, token));
  return row ?? null;
}

export async function getOrder(id: number) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row ?? null;
}

export async function listOrders(opts: {
  status?: OrderStatus;
  page?: number;
}) {
  const perPage = 25;
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.status ? eq(orders.status, opts.status) : undefined;
  const [items, [{ total }], counts] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ total: count() }).from(orders).where(where),
    db
      .select({ status: orders.status, n: count() })
      .from(orders)
      .groupBy(orders.status),
  ]);
  return {
    items,
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<
      Record<OrderStatus, number>
    >,
  };
}

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["fulfilled", "refunded", "cancelled"],
  fulfilled: ["refunded"],
  cancelled: [],
  refunded: [],
};

export async function setOrderStatus(
  id: number,
  status: OrderStatus,
  ref?: string,
) {
  const order = await getOrder(id);
  if (!order) throw new ShopError("That order no longer exists.");
  if (order.status === status) return order;
  if (!ALLOWED[order.status].includes(status))
    throw new ShopError(`A ${order.status} order can't become ${status}.`);
  const returnStock =
    (status === "cancelled" || status === "refunded") && !order.stockReturned;
  const updated = await db.transaction(async (tx) => {
    if (returnStock)
      for (const item of order.items)
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.quantity}` })
          .where(
            and(
              eq(products.id, item.productId),
              sql`${products.stock} is not null`,
            ),
          );
    const [row] = await tx
      .update(orders)
      .set({
        status,
        updatedAt: new Date(),
        ...(returnStock && { stockReturned: true }),
        ...(status === "paid" && { paidAt: new Date() }),
        ...(ref && { paymentRef: ref }),
      })
      .where(eq(orders.id, id))
      .returning();
    return row;
  });
  if (status === "paid") await notifyOrder(updated, "paid");
  if (status === "fulfilled") await notifyOrder(updated, "fulfilled");
  return updated;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const orderNumber = (order: Pick<Order, "id">) => `#${1000 + order.id}`;

function summary(order: Order) {
  const lines = order.items.map(
    (i) =>
      `${i.quantity} × ${i.name}  ${formatMoney(i.priceCents * i.quantity, order.currency)}`,
  );
  return [
    ...lines,
    "",
    `Total: ${formatMoney(order.totalCents, order.currency)}`,
  ].join("\n");
}

async function notifyOrder(
  order: Order,
  event: "placed" | "paid" | "fulfilled",
) {
  const settings = await getSettings();
  const link = siteUrl(`/shop/order/${order.token}`);
  const number = orderNumber(order);
  const customer = {
    placed: {
      subject: `Your order ${number} at ${settings.title}`,
      intro: `Thanks for your order! ${settings.shopPaymentInstructions ? `To complete it, please pay as follows:\n\n${settings.shopPaymentInstructions}\n` : "We'll be in touch about payment."}`,
    },
    paid: {
      subject: `Payment received for order ${number}`,
      intro:
        "Thanks! Your payment has been received, and we're preparing your order.",
    },
    fulfilled: {
      subject: `Order ${number} is on its way`,
      intro: "Good news: your order has been sent.",
    },
  }[event];
  try {
    await sendMail({
      to: order.email,
      subject: customer.subject,
      text: `Hi ${order.name},\n\n${customer.intro}\n\n${summary(order)}\n\nOrder details: ${link}\n`,
    });
    if (event !== "fulfilled")
      await sendMail({
        to: settings.adminEmail,
        subject: `[${settings.title}] ${event === "paid" ? "Paid" : "New"} order ${number}`,
        text: `${order.name} <${order.email}>\n\n${summary(order)}\n\n${siteUrl(`/admin/shop/orders/${order.id}`)}\n`,
      });
  } catch (error) {
    console.error("[shop] order email failed", error);
  }
}
