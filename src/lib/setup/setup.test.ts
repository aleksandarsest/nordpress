import { describe, expect, it } from "vitest";
import { slugify } from "../slug";
import {
  EMPTY_ANSWERS,
  SITE_KINDS,
  type SiteKind,
  sitePlanSchema,
} from "./plan";
import { splitPrice, templatePlan } from "./templates";

const kinds = Object.keys(SITE_KINDS) as SiteKind[];

const full = {
  title: "Pekara Sunce",
  offer: "Sourdough bread and baking classes",
  about: "two sisters bake every morning since 2019",
  location: "Trubarjeva 5, Ljubljana",
  email: "hello@example.com",
  phone: "+386 1 234 5678",
  hours: "Mon–Fri 7:00–15:00\nSat 8:00–13:00",
  date: "12 June 2027",
  items: ["Sourdough loaf — 5.50", "Croissant", "Baking class: 45"],
};

describe("starter templates", () => {
  for (const kind of kinds) {
    for (const [label, answers] of [
      ["with answers", full],
      ["without answers", { ...EMPTY_ANSWERS, title: "Acme" }],
    ] as const) {
      it(`${kind} ${label} is a finished, valid plan`, () => {
        const plan = sitePlanSchema.parse(templatePlan(kind, answers));
        expect(plan.pages.length + plan.posts.length).toBeGreaterThan(0);
        if (plan.homepage === "page")
          expect(plan.pages.some((p) => p.role === "home")).toBe(true);
        if (plan.contact_form.include)
          expect(plan.pages.some((p) => p.role === "contact")).toBe(true);

        const text = JSON.stringify(plan);
        // No placeholders left for the owner to find and replace
        expect(text).not.toMatch(/\[[a-z ]+\](?!\()/i);
        expect(text).not.toMatch(/undefined|null|\.\./);

        // Every link to a page goes somewhere that will exist
        const slugs = new Set(plan.pages.map((p) => slugify(p.title)));
        const bodies = [...plan.pages, ...plan.posts].map((p) => p.content);
        const links = bodies.flatMap((body) => [
          ...[...body.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]),
          // Buttons inside sections
          ...[...body.matchAll(/&quot;url&quot;:&quot;(\/[^&]*)&quot;/g)].map(
            (m) => m[1],
          ),
        ]);
        for (const path of links)
          expect(path === "/shop" || slugs.has(path.slice(1)), path).toBe(true);
      });
    }
  }

  it("uses the answers", () => {
    const plan = templatePlan("restaurant", full);
    const text = JSON.stringify(plan);
    expect(text).toContain("Trubarjeva 5, Ljubljana");
    expect(text).toContain("Sat 8:00–13:00");
    expect(text).toContain("tel:+38612345678");
    expect(plan.title).toBe("Pekara Sunce");
    expect(plan.tagline).toBe("Sourdough bread and baking classes");
  });

  it("turns shop lines into products", () => {
    const plan = templatePlan("shop", full);
    expect(plan.products).toEqual([
      { name: "Sourdough loaf", price: "5.50", summary: "" },
      { name: "Croissant", price: "", summary: "" },
      { name: "Baking class", price: "45", summary: "" },
    ]);
  });
});

describe("splitPrice", () => {
  it("reads common ways of writing a price", () => {
    expect(splitPrice("Candle — 18.00")).toEqual({
      name: "Candle",
      price: "18.00",
    });
    expect(splitPrice("Candle - €18,5")).toEqual({
      name: "Candle",
      price: "18.5",
    });
    expect(splitPrice("Mug: 12 EUR")).toEqual({ name: "Mug", price: "12" });
    expect(splitPrice("Gift card")).toEqual({ name: "Gift card", price: "" });
    expect(splitPrice("T-shirt")).toEqual({ name: "T-shirt", price: "" });
  });
});
