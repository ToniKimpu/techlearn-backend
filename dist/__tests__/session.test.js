import { describe, it, expect } from "vitest";
import { generateRefreshToken, getSessionExpiry } from "../utils/session.js";
describe("session utilities", () => {
    describe("generateRefreshToken", () => {
        it("returns a 128-character hex string", () => {
            const token = generateRefreshToken();
            expect(token).toMatch(/^[0-9a-f]{128}$/);
        });
        it("generates unique tokens", () => {
            const a = generateRefreshToken();
            const b = generateRefreshToken();
            expect(a).not.toBe(b);
        });
    });
    describe("getSessionExpiry", () => {
        it("returns a date in the future", () => {
            const expiry = getSessionExpiry(30);
            expect(expiry.getTime()).toBeGreaterThan(Date.now());
        });
        it("defaults to 30 days", () => {
            const expiry = getSessionExpiry();
            const diffDays = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            expect(diffDays).toBeGreaterThan(29);
            expect(diffDays).toBeLessThanOrEqual(30);
        });
        it("respects custom day count", () => {
            const expiry = getSessionExpiry(7);
            const diffDays = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            expect(diffDays).toBeGreaterThan(6);
            expect(diffDays).toBeLessThanOrEqual(7);
        });
    });
});
//# sourceMappingURL=session.test.js.map