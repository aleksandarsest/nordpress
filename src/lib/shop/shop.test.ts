import { describe, expect, it } from "vitest";
import { type CatalogItem, priceCart } from "./cart";
import { formatMoney, parseMoney } from "./money";

const catalog: CatalogItem[] = [
  {
    id: 1,
    slug: "mug",
    name: "Mug",
    sku: "M1",
    priceCents: 1250,
    stock: null,
    shippable: true,
    status: "active",
  },
  {
    id: 2,
    slug: "ebook",
    name: "E-book",
    sku: "",
    priceCents: 900,
    stock: null,
    shippable: false,
    status: "active",
  },
  {
    id: 3,
    slug: "poster",
    name: "Poster",
    sku: "",
    priceCents: 2000,
    stock: 2,
    shippable: true,
    status: "active",
  },
  {
    id: 4,
    slug: "old",
    name: "Old",
    sku: "",
    priceCents: 100,
    stock: null,
    shippable: true,
    status: "archived",
  },
  {
    id: 5,
    slug: "gone",
    name: "Gone",
    sku: "",
    priceCents: 100,
    stock: 0,
    shippable: true,
    status: "active",
  },
];

describe("money", () => {
  it("parses prices people type", () => {
    expect(parseMoney("12.5", "EUR")).toBe(1250);
    expect(parseMoney("12,50", "EUR")).toBe(1250);
    expect(parseMoney("1 299", "EUR")).toBe(129900);
    expect(parseMoney("1299", "JPY")).toBe(1299);
    expect(parseMoney("12.345", "EUR")).toBeNull();
    expect(parseMoney("-3", "EUR")).toBeNull();
  });

  it("formats in the store currency", () => {
    expect(formatMoney(1250, "EUR")).toBe("€12.50");
    expect(formatMoney(1299, "JPY")).toBe("¥1,299");
  });
});

describe("priceCart", () => {
  it("prices from the catalog, merging lines", () => {
    const cart = priceCart(
      [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
        { productId: 1, quantity: 1 },
      ],
      catalog,
    );
    expect(cart.items.map((i) => [i.name, i.quantity, i.lineCents])).toEqual([
      ["Mug", 3, 3750],
      ["E-book", 1, 900],
    ]);
    expect(cart.totalCents).toBe(4650);
    expect(cart.needsShipping).toBe(true);
    expect(cart.problems).toEqual([]);
  });

  it("drops unavailable items and caps quantities at stock", () => {
    const cart = priceCart(
      [
        { productId: 3, quantity: 5 },
        { productId: 4, quantity: 1 },
        { productId: 5, quantity: 1 },
        { productId: 99, quantity: 1 },
        { productId: 2, quantity: -4 },
      ],
      catalog,
    );
    expect(cart.items.map((i) => [i.name, i.quantity])).toEqual([
      ["Poster", 2],
    ]);
    expect(cart.problems).toHaveLength(4);
    expect(cart.needsShipping).toBe(true);
  });
});
