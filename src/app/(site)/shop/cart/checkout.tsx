"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { PricedLine } from "@/lib/shop/cart";
import { formatMoney } from "@/lib/shop/money";
import { cart } from "../cart-store";
import { placeOrderAction, priceCartAction } from "../shop-actions";

type Priced = {
  items: PricedLine[];
  problems: string[];
  totalCents: number;
  needsShipping: boolean;
};

const input = "h-10 w-full rounded-lg border bg-background px-3 text-sm";

export function Checkout({
  currency,
  stripe,
}: {
  currency: string;
  stripe: boolean;
}) {
  const [priced, setPriced] = useState<Priced | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function refresh() {
    const result = await priceCartAction(cart.lines());
    // Keep the browser's cart in line with what can actually be bought
    cart.replace(
      result.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    );
    setPriced(result);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: price once on load
  useEffect(() => {
    void refresh();
  }, []);

  function change(productId: number, quantity: number) {
    cart.set(productId, quantity);
    start(refresh);
  }

  function submit(form: FormData) {
    setError(null);
    const value = (k: string) => String(form.get(k) ?? "");
    start(async () => {
      const result = await placeOrderAction(cart.lines(), {
        email: value("email"),
        name: value("name"),
        note: value("note"),
        address: priced?.needsShipping
          ? {
              line1: value("line1"),
              line2: value("line2"),
              city: value("city"),
              postalCode: value("postal_code"),
              country: value("country"),
            }
          : null,
      });
      if (result.error || !result.redirectTo) {
        setError(result.error ?? "Something went wrong.");
        await refresh();
        return;
      }
      cart.clear();
      window.location.assign(result.redirectTo);
    });
  }

  if (!priced)
    return <p className="text-muted-foreground">Loading your cart…</p>;
  if (priced.items.length === 0)
    return (
      <p>
        Your cart is empty.{" "}
        <Link href="/shop" className="underline">
          Browse the shop
        </Link>
        .
      </p>
    );

  return (
    <div className="grid gap-6">
      {priced.problems.map((p) => (
        <p
          key={p}
          role="status"
          className="rounded-md bg-muted px-3 py-2 text-sm"
        >
          {p}
        </p>
      ))}
      <ul className="divide-y rounded-xl border">
        {priced.items.map((item) => (
          <li
            key={item.productId}
            className="flex flex-wrap items-center gap-3 p-4 text-sm"
          >
            <Link
              href={`/shop/${item.slug}`}
              className="flex-1 font-medium hover:underline"
            >
              {item.name}
            </Link>
            <label className="flex items-center gap-2">
              <span className="sr-only">Quantity of {item.name}</span>
              <input
                type="number"
                min={0}
                max={99}
                defaultValue={item.quantity}
                onBlur={(e) =>
                  change(item.productId, Number(e.target.value) || 0)
                }
                className="h-9 w-16 rounded-lg border bg-background px-2"
              />
            </label>
            <span className="w-24 text-right tabular-nums">
              {formatMoney(item.lineCents, currency)}
            </span>
            <button
              type="button"
              onClick={() => change(item.productId, 0)}
              className="text-muted-foreground text-xs hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
        <li className="flex justify-between p-4 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">
            {formatMoney(priced.totalCents, currency)}
          </span>
        </li>
      </ul>

      <form action={submit} className="grid gap-4 text-sm">
        <h2 className="font-semibold text-lg">Your details</h2>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-destructive"
          >
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="font-medium">Name</span>
            <input name="name" required autoComplete="name" className={input} />
          </label>
          <label className="grid gap-1.5">
            <span className="font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={input}
            />
          </label>
        </div>
        {priced.needsShipping && (
          <fieldset className="grid gap-4">
            <legend className="mb-2 font-medium">Shipping address</legend>
            <input
              name="line1"
              required
              autoComplete="address-line1"
              placeholder="Street and number"
              aria-label="Street and number"
              className={input}
            />
            <input
              name="line2"
              autoComplete="address-line2"
              placeholder="Apartment, floor (optional)"
              aria-label="Apartment, floor"
              className={input}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <input
                name="postal_code"
                required
                autoComplete="postal-code"
                placeholder="Postal code"
                aria-label="Postal code"
                className={input}
              />
              <input
                name="city"
                required
                autoComplete="address-level2"
                placeholder="City"
                aria-label="City"
                className={input}
              />
              <input
                name="country"
                required
                autoComplete="country-name"
                placeholder="Country"
                aria-label="Country"
                className={input}
              />
            </div>
          </fieldset>
        )}
        <label className="grid gap-1.5">
          <span className="font-medium">Note (optional)</span>
          <textarea
            name="note"
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-lg bg-primary px-6 font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending
              ? "Placing your order…"
              : stripe
                ? "Continue to payment"
                : "Place order"}
          </button>
          <p className="mt-2 text-muted-foreground text-xs">
            {stripe
              ? "You'll pay securely on Stripe's checkout page."
              : "You'll get payment instructions after placing the order."}
          </p>
        </div>
      </form>
    </div>
  );
}
