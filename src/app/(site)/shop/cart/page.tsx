import type { Metadata } from "next";
import { getSettings } from "@/lib/options";
import { stripeConfigured } from "@/lib/shop/stripe";
import { Checkout } from "./checkout";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false },
};

export default async function CartPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="font-semibold text-3xl tracking-tight">Your cart</h1>
      <Checkout currency={settings.shopCurrency} stripe={stripeConfigured()} />
    </div>
  );
}
