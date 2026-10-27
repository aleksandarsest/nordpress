import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrderStatus } from "@/db/schema";
import { formatInZone } from "@/lib/dates";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { listOrders, orderNumber } from "@/lib/shop";
import { formatMoney } from "@/lib/shop/money";
import { first } from "../../_components/screen";
import { ORDER_STATUS_LABELS } from "../order-labels";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: PageProps<"/admin/shop/orders">) {
  await requireViewer("manage_options");
  const query = await searchParams;
  const status = first(query.status) as OrderStatus | undefined;
  const valid = status && status in ORDER_STATUS_LABELS ? status : undefined;
  const [result, settings] = await Promise.all([
    listOrders({ status: valid, page: Number(first(query.page)) || 1 }),
    getSettings(),
  ]);
  return (
    <>
      <h1 className="mb-4 font-semibold text-2xl tracking-tight">Orders</h1>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link
          href="/admin/shop/orders"
          className={!valid ? "font-semibold" : "text-primary hover:underline"}
        >
          All
        </Link>
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
          <Link
            key={s}
            href={`/admin/shop/orders?status=${s}`}
            className={
              valid === s ? "font-semibold" : "text-primary hover:underline"
            }
          >
            {ORDER_STATUS_LABELS[s]} ({result.counts[s] ?? 0})
          </Link>
        ))}
      </div>
      {result.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No orders.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link
                    href={`/admin/shop/orders/${o.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {orderNumber(o)}
                  </Link>
                </TableCell>
                <TableCell>
                  {o.name}
                  <span className="block text-muted-foreground text-xs">
                    {o.email}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatInZone(
                    o.createdAt,
                    settings.timezone,
                    `${settings.dateFormat}, HH:mm`,
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      o.status === "paid"
                        ? "default"
                        : o.status === "pending"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {ORDER_STATUS_LABELS[o.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(o.totalCents, o.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
