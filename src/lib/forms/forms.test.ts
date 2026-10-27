import { describe, expect, it } from "vitest";
import { htmlToDoc, renderContent } from "../content";
import { submissionsCsv } from "./csv";
import { replaceFormEmbeds, splitFormEmbeds } from "./embed";
import {
  formJsonSchema,
  normalizeFields,
  normalizeSettings,
  validateSubmission,
} from "./fields";

const fields = normalizeFields([
  { label: "Your name", type: "text", required: true },
  { label: "Email", type: "email", required: true },
  { label: "Budget", type: "select", options: ["< $5k", "$5k+", " ", "$5k+"] },
  { label: "Services", type: "checkbox", options: ["Design", "Code"] },
  { label: "Email", type: "url" },
]);

const getter = (values: Record<string, string | string[]>) => (key: string) => {
  const v = values[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
};

describe("normalizeFields", () => {
  it("assigns unique keys and cleans choices", () => {
    expect(fields.map((f) => f.key)).toEqual([
      "your_name",
      "email",
      "budget",
      "services",
      "email_2",
    ]);
    expect(fields[2].options).toEqual(["< $5k", "$5k+"]);
  });

  it("rejects fields without labels or choices", () => {
    expect(() => normalizeFields([{ label: "" }])).toThrow(/label/);
    expect(() => normalizeFields([{ label: "Pick", type: "radio" }])).toThrow(
      /choice/,
    );
  });

  it("falls back to safe settings", () => {
    expect(normalizeSettings({ submitLabel: "  " })).toMatchObject({
      submitLabel: "Send",
      open: true,
      aiTriage: true,
    });
    expect(() => normalizeSettings({ notifyEmail: "nope" })).toThrow();
  });
});

describe("validateSubmission", () => {
  it("accepts valid values and drops unknown keys", () => {
    const result = validateSubmission(
      fields,
      getter({
        your_name: " Ada ",
        email: "ada@example.com",
        budget: "$5k+",
        services: ["Code", "Code"],
        extra: "ignored",
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        your_name: "Ada",
        email: "ada@example.com",
        budget: "$5k+",
        services: ["Code"],
      },
    });
  });

  it("reports missing and invalid fields", () => {
    const result = validateSubmission(
      fields,
      getter({
        email: "nope",
        budget: "free",
        services: ["Hacking"],
        email_2: "x",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual([
        "budget",
        "email",
        "email_2",
        "services",
        "your_name",
      ]);
  });
});

describe("formJsonSchema", () => {
  it("describes the form for agents", () => {
    const schema = formJsonSchema(fields);
    expect(schema.required).toEqual(["your_name", "email"]);
    expect(schema.properties.budget).toMatchObject({ enum: ["< $5k", "$5k+"] });
    expect(schema.properties.services).toMatchObject({ type: "array" });
    expect(schema.properties.email).toMatchObject({ format: "email" });
  });
});

describe("form embeds", () => {
  const doc = htmlToDoc(
    '<p>Before</p><div data-form="7" data-title="Contact"></div><p>After</p>',
  );

  it("round-trips through the editor schema", () => {
    expect(doc.content?.[1]).toEqual({
      type: "formEmbed",
      attrs: { formId: 7, title: "Contact" },
    });
    expect(renderContent(doc).text).toBe("Before\n\nAfter");
  });

  it("splits rendered HTML around forms", () => {
    const { html } = renderContent(doc);
    expect(splitFormEmbeds(html)).toEqual([
      { at: 0, html: "<p>Before</p>" },
      { at: 13, formId: 7 },
      { at: 59, html: "<p>After</p>" },
    ]);
    expect(replaceFormEmbeds(html, "<p>[form]</p>")).toBe(
      "<p>Before</p><p>[form]</p><p>After</p>",
    );
  });

  it("never nests a form inside other blocks", () => {
    const nested = htmlToDoc(
      '<blockquote><div data-form="7"></div><p>Quote</p></blockquote>',
    );
    expect(nested.content?.map((n) => n.type)).toEqual([
      "blockquote",
      "formEmbed",
      "paragraph",
    ]);
    expect(JSON.stringify(nested.content?.[0])).not.toContain("formEmbed");
  });
});

describe("submissionsCsv", () => {
  it("quotes, joins choices and defuses formulas", () => {
    const csv = submissionsCsv(fields, [
      {
        createdAt: new Date("2026-01-02T03:04:05Z"),
        status: "new",
        data: {
          your_name: '=HYPERLINK("x")',
          email: "a@b.co",
          services: ["Design", "Code"],
        },
        aiSummary: "Wants, a site",
      },
    ]);
    const [, row] = csv.replace("﻿", "").split("\r\n");
    expect(row).toBe(
      `2026-01-02T03:04:05.000Z,new,"'=HYPERLINK(""x"")",a@b.co,,Design; Code,,"Wants, a site"`,
    );
  });
});
