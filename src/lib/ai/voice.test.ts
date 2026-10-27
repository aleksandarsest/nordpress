import { describe, expect, it } from "vitest";
import type { SiteSettings } from "../options";
import { siteGuidance, withGuidance } from "./voice";

// Only the two guidance fields matter here
const DEFAULT_SETTINGS = { siteAbout: "", brandVoice: "" } as SiteSettings;

describe("site guidance", () => {
  it("is empty until an administrator writes some", () => {
    expect(siteGuidance(DEFAULT_SETTINGS)).toBe("");
    expect(withGuidance("Base", DEFAULT_SETTINGS)).toEqual([
      { type: "text", text: "Base" },
    ]);
  });

  it("adds the description and style guide as a second block", () => {
    const blocks = withGuidance("Base", {
      ...DEFAULT_SETTINGS,
      siteAbout: " A bakery. ",
      brandVoice: "Warm and plain.",
    });
    expect(blocks[0]).toEqual({ type: "text", text: "Base" });
    expect(blocks[1].text).toContain(
      "<about_the_site>\nA bakery.\n</about_the_site>",
    );
    expect(blocks[1].text).toContain(
      "<voice_and_style_guide>\nWarm and plain.",
    );
  });
});
