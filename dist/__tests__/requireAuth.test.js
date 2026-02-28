import { describe, it, expect, beforeAll } from "vitest";
import { requireAuth } from "../middlewares/requireAuth.js";
import { generateAccessToken } from "../utils/jwt.js";
beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
});
function createMockReqRes(authHeader) {
    const req = {
        headers: { authorization: authHeader },
    };
    const resBody = {};
    const res = {
        status(code) {
            resBody.statusCode = code;
            return res;
        },
        json(data) {
            resBody.body = data;
            return res;
        },
    };
    return { req, res, resBody };
}
describe("requireAuth middleware", () => {
    it("calls next() with a valid token", () => {
        const token = generateAccessToken({
            authId: "a1",
            profileId: "p1",
            userType: "student",
        });
        const { req, res } = createMockReqRes(`Bearer ${token}`);
        let called = false;
        const next = (() => { called = true; });
        requireAuth(req, res, next);
        expect(called).toBe(true);
        expect(req.authUser).toEqual({
            authId: "a1",
            profileId: "p1",
            userType: "student",
        });
    });
    it("returns 401 when no Authorization header", () => {
        const { req, res, resBody } = createMockReqRes(undefined);
        let called = false;
        const next = (() => { called = true; });
        requireAuth(req, res, next);
        expect(called).toBe(false);
        expect(resBody.statusCode).toBe(401);
        expect(resBody.body?.message).toMatch(/missing/i);
    });
    it("returns 401 with an invalid token", () => {
        const { req, res, resBody } = createMockReqRes("Bearer bad.token.here");
        let called = false;
        const next = (() => { called = true; });
        requireAuth(req, res, next);
        expect(called).toBe(false);
        expect(resBody.statusCode).toBe(401);
    });
    it("returns 401 when header is not Bearer scheme", () => {
        const { req, res, resBody } = createMockReqRes("Basic abc123");
        let called = false;
        const next = (() => { called = true; });
        requireAuth(req, res, next);
        expect(called).toBe(false);
        expect(resBody.statusCode).toBe(401);
    });
});
//# sourceMappingURL=requireAuth.test.js.map