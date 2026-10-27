// Money is whole cents in the store's currency. Pure.

export const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "CAD",
  "AUD",
  "JPY",
] as const;
export type Currency = (typeof CURRENCIES)[number];

// Currencies without minor units (yen) are still stored as "cents" = units
const ZERO_DECIMAL = new Set(["JPY"]);

export function formatMoney(cents: number, currency: string, locale = "en") {
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ZERO_DECIMAL.has(currency) ? cents : cents / 100);
}

/** "12.5", "12,50" or "1 299" → cents; null when it isn't a price. */
export function parseMoney(input: string, currency: string): number | null {
  const clean = input.trim().replace(/[\s']/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return ZERO_DECIMAL.has(currency)
    ? Math.round(value)
    : Math.round(value * 100);
}

/** The value Stripe expects: smallest unit, as stored. */
export const toMinorUnits = (cents: number) => cents;

export const centsToInput = (cents: number, currency: string) =>
  ZERO_DECIMAL.has(currency) ? String(cents) : (cents / 100).toFixed(2);
