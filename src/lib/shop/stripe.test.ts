import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { verifyWebhook } = await import("./stripe");

const secret = "whsec_test";
const sign = (body: string, t: number, key = secret) =>
  `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;

describe("verifyWebhook", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
  });
  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  const now = () => Math.floor(Date.now() / 1000);

  it("accepts a correctly signed, recent payload", () => {
    expect(verifyWebhook('{"a":1}', sign('{"a":1}', now()))).toBe(true);
  });

  it("rejects tampering, wrong secrets and old timestamps", () => {
    expect(verifyWebhook('{"a":2}', sign('{"a":1}', now()))).toBe(false);
    expect(verifyWebhook('{"a":1}', sign('{"a":1}', now(), "other"))).toBe(
      false,
    );
    expect(verifyWebhook('{"a":1}', sign('{"a":1}', now() - 3600))).toBe(false);
    expect(verifyWebhook('{"a":1}', null)).toBe(false);
  });
});
