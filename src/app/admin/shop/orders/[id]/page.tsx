import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderStatus } from "@/db/schema";
import { formatInZone } from "@/lib/dates";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { getOrder, orderNumber } from "@/lib/shop";
import { formatMoney } from "@/lib/shop/money";
import { setOrderStatusAction } from "../../actions";
import { ORDER_STATUS_LABELS } from "../../order-labels";

export const metadata: Metadata = { title: "Order" };

const NEXT: Record<
  OrderStatus,
  { status: OrderStatus; label: string; destructive?: boolean }[]
> = {
  pending: [
    { status: "paid", label: "Mark as paid" },
    { status: "cancelled", label: "Cancel order", destructive: true },
  ],
  paid: [
    { status: "fulfilled", label: "Mark as fulfilled" },
    { status: "refunded", label: "Mark as refunded", destructive: true },
  ],
  fulfilled: [
    { status: "refunded", label: "Mark as refunded", destructive: true },
  ],
  cancelled: [],
  refunded: [],
};

export default async function OrderPage({
  params,
}: PageProps<"/admin/shop/orders/[id]">) {
  await requireViewer("manage_options");
  const id = Number((await params).id);
  const [order, settings] = await Promise.all([
    Number.isInteger(id) ? getOrder(id) : null,
    getSettings(),
  ]);
  if (!order) notFound();
  const money = (cents: number) => formatMoney(cents, order.currency);
  const when = (d: Date) =>
    formatInZone(d, settings.timezone, `${settings.dateFormat}, HH:mm`);

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">
          Order {orderNumber(order)}
        </h1>
        <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
        <Link
          href="/admin/shop/orders"
          className="text-primary text-sm hover:underline"
        >
          All orders
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {NEXT[order.status].map((n) => (
          <form key={n.status} action={setOrderStatusAction}>
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value={n.status} />
            <Button
              type="submit"
              size="sm"
              variant={n.destructive ? "outline" : "default"}
            >
              {n.label}
            </Button>
          </form>
        ))}
      </div>
      {order.status === "refunded" && order.payment === "stripe" && (
        <p className="text-muted-foreground text-sm">
          Marking an order refunded doesn't move money: refund it in your Stripe
          dashboard too.
        </p>
      )}
      <Card>
        <CardContent className="grid gap-2 text-sm">
          {order.items.map((item) => (
            <div key={item.productId} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
                {item.sku && (
                  <span className="ml-2 text-muted-foreground text-xs">
                    {item.sku}
                  </span>
                )}
              </span>
              <span className="tabular-nums">
                {money(item.priceCents * item.quantity)}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(order.totalCents)}</span>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Customer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <span>{order.name}</span>
            <a
              href={`mailto:${order.email}`}
              className="text-primary hover:underline"
            >
              {order.email}
            </a>
            {order.address && (
              <address className="mt-2 not-italic text-muted-foreground">
                {order.address.line1}
                {order.address.line2 && (
                  <>
                    <br />
                    {order.address.line2}
                  </>
                )}
                <br />
                {order.address.postalCode} {order.address.city}
                <br />
                {order.address.country}
              </address>
            )}
            {order.note && (
              <p className="mt-2 whitespace-pre-wrap">“{order.note}”</p>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-muted-foreground text-sm">
            <span>
              {order.payment === "stripe"
                ? "Stripe"
                : "Manual (instructions sent)"}
            </span>
            {order.paymentRef && (
              <code className="text-xs">{order.paymentRef}</code>
            )}
            <span>Placed {when(order.createdAt)}</span>
            {order.paidAt && <span>Paid {when(order.paidAt)}</span>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
