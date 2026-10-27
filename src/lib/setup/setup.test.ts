import { describe, expect, it } from "vitest";
import { SITE_KINDS, type SiteKind, sitePlanSchema } from "./plan";
import { templatePlan } from "./templates";

describe("starter templates", () => {
  for (const kind of Object.keys(SITE_KINDS) as SiteKind[]) {
    it(`${kind} is a valid plan`, () => {
      const plan = sitePlanSchema.parse(templatePlan(kind, "Acme"));
      expect(plan.title).toBe("Acme");
      expect(plan.pages.length + plan.posts.length).toBeGreaterThan(0);
      // A static front page needs a page to show
      if (plan.homepage === "page")
        expect(plan.pages.some((p) => p.role === "home")).toBe(true);
      // A form is only offered with somewhere to put it
      if (plan.contact_form.include)
        expect(plan.pages.some((p) => p.role === "contact")).toBe(true);
    });
  }
});
