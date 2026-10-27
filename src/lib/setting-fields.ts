import type { PluginSettings, SettingField } from "./plugins/types";

// Reads and validates a settings form built from a field list (plugin
// settings, theme options).
export function parseSettingFields(
  fields: SettingField[],
  formData: FormData,
): PluginSettings {
  const values: PluginSettings = {};
  for (const field of fields) {
    const value = formData.get(field.key);
    const raw = typeof value === "string" ? value : "";
    switch (field.type) {
      case "checkbox":
        values[field.key] = value === "on";
        break;
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n))
          throw new Error(`${field.label} must be a number.`);
        if (field.min !== undefined && n < field.min)
          throw new Error(`${field.label} must be at least ${field.min}.`);
        if (field.max !== undefined && n > field.max)
          throw new Error(`${field.label} must be at most ${field.max}.`);
        values[field.key] = n;
        break;
      }
      case "url":
        if (raw && !/^https?:\/\//i.test(raw))
          throw new Error(`${field.label} must be a web address.`);
        values[field.key] = raw.trim();
        break;
      case "select":
        if (!field.options.some((o) => o.value === raw))
          throw new Error(`Choose a valid ${field.label.toLowerCase()}.`);
        values[field.key] = raw;
        break;
      default:
        values[field.key] = raw;
    }
  }
  return values;
}
