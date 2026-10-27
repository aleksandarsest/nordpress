import { describe, expect, it } from "vitest";
import {
  languageName,
  normalizeLanguageCode,
  translationGroup,
  translationLang,
} from "./i18n";

describe("i18n", () => {
  it("normalizes language codes", () => {
    expect(normalizeLanguageCode(" DE ")).toBe("de");
    expect(normalizeLanguageCode("pt_BR")).toBe("pt-br");
    expect(normalizeLanguageCode("german")).toBeNull();
    expect(normalizeLanguageCode("../x")).toBeNull();
  });

  it("reads a post's language and translation group", () => {
    expect(translationLang({ lang: "de" })).toBe("de");
    expect(translationLang({})).toBeNull();
    expect(translationGroup({ id: 9, meta: { translationOf: 3 } })).toBe(3);
    expect(translationGroup({ id: 3, meta: {} })).toBe(3);
  });

  it("names languages in their own language", () => {
    expect(languageName("de")).toBe("Deutsch");
    expect(languageName("fr")).toBe("Français");
  });
});
