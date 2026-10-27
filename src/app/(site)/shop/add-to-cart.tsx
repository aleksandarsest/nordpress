"use client";

import Link from "next/link";
import { useState } from "react";
import { cart } from "./cart-store";

export function AddToCart({
  productId,
  available,
}: {
  productId: number;
  /** Units left, or null for unlimited. */
  available: number | null;
}) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  if (available === 0)
    return <p className="font-medium text-muted-foreground">Sold out</p>;
  const max = Math.min(available ?? 99, 99);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        Quantity
        <input
          type="number"
          min={1}
          max={max}
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.max(1, Math.min(max, Number(e.target.value) || 1)))
          }
          className="h-10 w-20 rounded-lg border bg-background px-3"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          cart.add(productId, quantity);
          setAdded(true);
        }}
        className="h-10 rounded-lg bg-primary px-5 font-medium text-primary-foreground text-sm"
      >
        Add to cart
      </button>
      {added && (
        <span role="status" className="text-sm">
          Added.{" "}
          <Link href="/shop/cart" className="underline">
            View cart
          </Link>
        </span>
      )}
    </div>
  );
}
