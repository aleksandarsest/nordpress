import { revalidateTag } from "next/cache";
import { getOrder, SHOP_TAG, ShopError, setOrderStatus } from "@/lib/shop";
import { verifyWebhook } from "@/lib/shop/stripe";

// Stripe webhook: point an endpoint at /api/shop/stripe for the events
// checkout.session.completed, .async_payment_succeeded and .expired.
type Session = {
  metadata?: { order_id?: string };
  payment_status?: string;
  payment_intent?: string | null;
  id?: string;
};

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyWebhook(body, request.headers.get("stripe-signature")))
    return Response.json({ error: "Invalid signature." }, { status: 400 });

  const event = JSON.parse(body) as { type: string; data: { object: Session } };
  const session = event.data.object;
  const order = await getOrder(Number(session.metadata?.order_id));
  if (!order)
    return Response.json({ received: true, ignored: "unknown order" });

  try {
    if (
      (event.type === "checkout.session.completed" &&
        session.payment_status === "paid") ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (order.status === "pending")
        await setOrderStatus(
          order.id,
          "paid",
          session.payment_intent ?? session.id,
        );
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      // Unpaid: the reserved stock goes back
      if (order.status === "pending") {
        await setOrderStatus(order.id, "cancelled");
        revalidateTag(SHOP_TAG, { expire: 0 });
      }
    }
  } catch (error) {
    if (!(error instanceof ShopError)) throw error;
  }
  return Response.json({ received: true });
}
