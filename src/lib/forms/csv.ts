import type { FormField, SubmissionData } from "./fields";

// Spreadsheet apps run cells starting with these as formulas
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: string) {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function submissionsCsv(
  fields: FormField[],
  rows: {
    createdAt: Date;
    status: string;
    data: SubmissionData;
    aiSummary: string | null;
  }[],
) {
  const header = [
    "Submitted",
    "Status",
    ...fields.map((f) => f.label),
    "AI summary",
  ];
  const lines = rows.map((r) => [
    r.createdAt.toISOString(),
    r.status,
    ...fields.map((f) => {
      const v = r.data[f.key];
      return Array.isArray(v) ? v.join("; ") : (v ?? "");
    }),
    r.aiSummary ?? "",
  ]);
  // A BOM makes Excel read the file as UTF-8
  return `﻿${[header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
