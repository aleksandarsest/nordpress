import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/options";
import { getOrderByToken, orderNumber } from "@/lib/shop";
import { formatMoney } from "@/lib/shop/money";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false },
};

// Per-customer and always current, so it renders on each request
export const instant = false;

const STATUS: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid, being prepared",
  fulfilled: "Sent",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/shop/order/[token]">) {
  const [order, settings, query] = await Promise.all([
    getOrderByToken((await params).token),
    getSettings(),
    searchParams,
  ]);
  if (!order) notFound();
  const money = (cents: number) => formatMoney(cents, order.currency);

  return (
    <div className="mx-auto grid max-w-2xl gap-6 text-sm">
      <h1 className="font-semibold text-3xl tracking-tight">
        {query.paid && order.status === "pending"
          ? "Thanks! Confirming your payment…"
          : `Order ${orderNumber(order)}`}
      </h1>
      <p>
        Status: <strong>{STATUS[order.status]}</strong>. A confirmation was sent
        to {order.email}.
      </p>
      {query.cancelled && order.status === "pending" && (
        <p className="rounded-md bg-muted px-3 py-2">
          Payment was cancelled. Your items are reserved for a little while;
          place the order again from the shop to pay.
        </p>
      )}
      {order.status === "pending" &&
        order.payment === "manual" &&
        settings.shopPaymentInstructions && (
          <section className="grid gap-2 rounded-xl border p-4">
            <h2 className="font-semibold">How to pay</h2>
            <p className="whitespace-pre-wrap">
              {settings.shopPaymentInstructions}
            </p>
            <p className="text-muted-foreground">
              Please mention order {orderNumber(order)} with your payment.
            </p>
          </section>
        )}
      <ul className="divide-y rounded-xl border">
        {order.items.map((item) => (
          <li key={item.productId} className="flex justify-between gap-3 p-4">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span className="tabular-nums">
              {money(item.priceCents * item.quantity)}
            </span>
          </li>
        ))}
        <li className="flex justify-between p-4 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(order.totalCents)}</span>
        </li>
      </ul>
      {order.address && (
        <p className="text-muted-foreground">
          Shipping to {order.name}, {order.address.line1}
          {order.address.line2 && `, ${order.address.line2}`},{" "}
          {order.address.postalCode} {order.address.city},{" "}
          {order.address.country}
        </p>
      )}
    </div>
  );
}
