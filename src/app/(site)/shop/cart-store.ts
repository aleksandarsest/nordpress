"use client";

import { useSyncExternalStore } from "react";
import type { CartLine } from "@/lib/shop/cart";

// The cart lives in the browser: just product ids and quantities. Prices and
// names always come from the server when the cart is shown or ordered.

const KEY = "nordpress-cart";
const EVENT = "nordpress-cart";

function read(): CartLine[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(lines.filter((l) => l.quantity > 0)),
    );
  } catch {
    // Storage may be blocked; the cart just won't persist
  }
  window.dispatchEvent(new Event(EVENT));
}

export const cart = {
  lines: read,
  add(productId: number, quantity = 1) {
    const lines = read();
    const line = lines.find((l) => l.productId === productId);
    if (line) line.quantity += quantity;
    else lines.push({ productId, quantity });
    write(lines);
  },
  set(productId: number, quantity: number) {
    write(
      read().map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );
  },
  replace: write,
  clear: () => write([]),
};

let snapshot = "";
function subscribe(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Number of items in the cart, kept in sync across components and tabs. */
export function useCartCount() {
  return useSyncExternalStore(
    subscribe,
    () => {
      const n = String(read().reduce((sum, l) => sum + l.quantity, 0));
      if (n !== snapshot) snapshot = n;
      return snapshot;
    },
    () => "0",
  );
}
