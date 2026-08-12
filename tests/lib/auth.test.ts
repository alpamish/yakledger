import { hashPassword, verifyPassword, generateToken, verifyToken, getTokenFromHeaders } from "@/lib/auth";

describe("auth.hashPassword / verifyPassword", () => {
  it("produces a bcrypt hash that verifies against the original password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toBe("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("auth.generateToken / verifyToken", () => {
  const payload = { userId: "u_123", email: "admin@local", role: "ADMIN" };

  it("signs a token that verifies with the original payload", () => {
    const token = generateToken(payload);
    const verified = verifyToken(token);
    expect(verified).toMatchObject(payload);
  });

  it("returns null for a tampered token", () => {
    const token = generateToken(payload);
    const tampered = token.slice(0, -2) + "00";
    expect(verifyToken(tampered)).toBeNull();
  });

  it("returns null for a garbage string", () => {
    expect(verifyToken("not.a.jwt")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});

describe("auth.getTokenFromHeaders", () => {
  it("extracts a Bearer token", () => {
    const headers = new Headers({ authorization: "Bearer abc123" });
    expect(getTokenFromHeaders(headers)).toBe("abc123");
  });

  it("returns null when authorization header is missing", () => {
    expect(getTokenFromHeaders(new Headers())).toBeNull();
  });

  it("returns null for non-Bearer headers", () => {
    const headers = new Headers({ authorization: "Basic abc123" });
    expect(getTokenFromHeaders(headers)).toBeNull();
  });
});
