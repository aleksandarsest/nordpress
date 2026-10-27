"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartCount } from "./cart-store";

// A floating cart link, shown on every page once something is in the cart,
// so it works with any theme.
export function CartButton() {
  const count = Number(useCartCount());
  const path = usePathname();
  if (!count || path.startsWith("/shop/cart")) return null;
  return (
    <Link
      href="/shop/cart"
      className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 font-medium text-primary-foreground text-sm shadow-lg"
    >
      <ShoppingBag className="size-4" />
      Cart ({count})
    </Link>
  );
}
