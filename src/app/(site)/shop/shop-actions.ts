"use server";

import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { placeOrder, priceLines, SHOP_TAG, ShopError } from "@/lib/shop";
import type { CartLine } from "@/lib/shop/cart";
import { StripeError } from "@/lib/shop/stripe";

const clean = (lines: CartLine[]) =>
  (Array.isArray(lines) ? lines : []).slice(0, 50).map((l) => ({
    productId: Number(l.productId),
    quantity: Number(l.quantity),
  }));

export async function priceCartAction(lines: CartLine[]) {
  return priceLines(clean(lines));
}

export async function placeOrderAction(
  lines: CartLine[],
  customer: {
    email: string;
    name: string;
    note: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      postalCode: string;
      country: string;
    } | null;
  },
): Promise<{ redirectTo?: string; error?: string }> {
  const ip = clientIp(await headers());
  const limit = await rateLimit(`order:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.ok)
    return { error: "Too many orders from here. Please try again later." };
  try {
    const { redirectTo } = await placeOrder(clean(lines), customer);
    // Stock changed
    revalidateTag(SHOP_TAG, { expire: 0 });
    return { redirectTo };
  } catch (error) {
    if (error instanceof ShopError || error instanceof StripeError)
      return { error: error.message };
    if (error instanceof Error && error.name === "ZodError")
      return {
        error: (error as unknown as { issues: { message: string }[] }).issues
          .map((i) => i.message)
          .join(" "),
      };
    console.error("[shop] order failed", error);
    return {
      error: "Something went wrong placing your order. Please try again.",
    };
  }
}
