import { describe, expect, it } from "vitest";
import { allowedRedirectUri, pkceChallenge, verifyPkce } from "./oauth-pkce";

describe("PKCE", () => {
  // The example from RFC 7636, appendix B
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("matches the RFC's example", () => {
    expect(pkceChallenge(verifier)).toBe(challenge);
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("rejects wrong or malformed verifiers", () => {
    expect(verifyPkce(`${verifier.slice(0, -1)}A`, challenge)).toBe(false);
    expect(verifyPkce("short", challenge)).toBe(false);
  });
});

describe("allowedRedirectUri", () => {
  it("allows https and loopback http only", () => {
    expect(allowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(
      true,
    );
    expect(allowedRedirectUri("http://localhost:6274/callback")).toBe(true);
    expect(allowedRedirectUri("http://127.0.0.1:33418/cb")).toBe(true);
    expect(allowedRedirectUri("http://evil.example/cb")).toBe(false);
    expect(allowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(allowedRedirectUri("https://a.example/cb#frag")).toBe(false);
  });
});
