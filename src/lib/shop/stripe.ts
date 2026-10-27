import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Order } from "@/db/schema";
import { siteUrl } from "../site-url";

// Stripe Checkout over its REST API: customers pay on Stripe's page, so
// card details never reach this server. Set STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET to turn it on.

const API = () => process.env.STRIPE_API_BASE ?? "https://api.stripe.com";

export function stripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export class StripeError extends Error {}

export async function createCheckoutSession(order: Order) {
  const form = new URLSearchParams({
    mode: "payment",
    customer_email: order.email,
    client_reference_id: String(order.id),
    "metadata[order_id]": String(order.id),
    success_url: siteUrl(`/shop/order/${order.token}?paid=1`),
    cancel_url: siteUrl(`/shop/order/${order.token}?cancelled=1`),
    // Unpaid sessions expire, and their reserved stock goes back
    expires_at: String(Math.floor(Date.now() / 1000) + 60 * 60),
  });
  order.items.forEach((item, i) => {
    form.set(`line_items[${i}][quantity]`, String(item.quantity));
    form.set(
      `line_items[${i}][price_data][currency]`,
      order.currency.toLowerCase(),
    );
    form.set(
      `line_items[${i}][price_data][unit_amount]`,
      String(item.priceCents),
    );
    form.set(`line_items[${i}][price_data][product_data][name]`, item.name);
  });
  // The shipping address stays with the order here; Stripe only takes payment
  const res = await fetch(`${API()}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Retrying the same order never creates a second session
      "Idempotency-Key": `order-${order.id}-${order.token}`,
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.url || !data.id) {
    console.error(
      "[shop] Stripe session failed",
      res.status,
      data.error?.message,
    );
    throw new StripeError("Payment couldn't be started. Please try again.");
  }
  return { id: data.id, url: data.url };
}

const TOLERANCE_SECONDS = 300;

// Checks the Stripe-Signature header: "t=<time>,v1=<hmac of `${t}.${body}`>".
export function verifyWebhook(body: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = Number(parts.t);
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  return signatures.some(
    (s) =>
      s.length === expected.length &&
      timingSafeEqual(Buffer.from(s), Buffer.from(expected)),
  );
}
