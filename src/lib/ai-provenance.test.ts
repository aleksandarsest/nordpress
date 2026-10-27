import { describe, expect, it } from "vitest";
import { aiProvenance, describeAiSources, withAiSource } from "./ai-provenance";

describe("AI provenance", () => {
  it("records sources once, keeping the first time", () => {
    const first = withAiSource(
      { wpId: 4 },
      "writing-assistant",
      new Date("2026-01-01"),
    );
    const second = withAiSource(first, "agent", new Date("2026-02-01"));
    const third = withAiSource(
      second,
      "writing-assistant",
      new Date("2026-03-01"),
    );
    expect(third).toMatchObject({
      wpId: 4,
      ai: {
        sources: ["writing-assistant", "agent"],
        firstAt: "2026-01-01T00:00:00.000Z",
        lastAt: "2026-03-01T00:00:00.000Z",
      },
    });
  });

  it("reads nothing from posts without AI", () => {
    expect(aiProvenance({})).toBeNull();
    expect(aiProvenance(null)).toBeNull();
  });

  it("describes the sources in a sentence", () => {
    expect(
      describeAiSources(["writing-assistant", "agent", "site-setup"]),
    ).toBe("the writing assistant, an AI agent and AI site setup");
  });
});
