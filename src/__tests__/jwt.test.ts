import { describe, it, expect, beforeAll } from "vitest";
import { generateAccessToken, verifyAccessToken } from "../utils/jwt.js";
import type { JwtUserPayload } from "../types/jwt.js";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
});

const mockPayload: JwtUserPayload = {
  authId: "auth-123",
  profileId: "profile-456",
  userType: "student",
};

describe("JWT utilities", () => {
  it("generates a token string", () => {
    const token = generateAccessToken(mockPayload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifies a token and returns the payload", () => {
    const token = generateAccessToken(mockPayload);
    const decoded = verifyAccessToken(token);

    expect(decoded.authId).toBe(mockPayload.authId);
    expect(decoded.profileId).toBe(mockPayload.profileId);
    expect(decoded.userType).toBe(mockPayload.userType);
  });

  it("throws on an invalid token", () => {
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });

  it("throws on a token signed with a different secret", () => {
    const token = generateAccessToken(mockPayload);
    process.env.JWT_SECRET = "different-secret";
    expect(() => verifyAccessToken(token)).toThrow();
    process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  });
});
