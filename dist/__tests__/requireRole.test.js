import { describe, it, expect, beforeAll } from "vitest";
import { requireRole } from "../middlewares/requireRole.js";
beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
});
function createMockReqRes(userType) {
    const req = {
        authUser: userType ? { authId: "a1", profileId: "p1", userType } : undefined,
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
describe("requireRole middleware", () => {
    it("calls next() when user role matches", () => {
        const { req, res } = createMockReqRes("admin");
        let called = false;
        const next = (() => { called = true; });
        requireRole("admin")(req, res, next);
        expect(called).toBe(true);
    });
    it("calls next() when user role is one of multiple allowed roles", () => {
        const { req, res } = createMockReqRes("teacher");
        let called = false;
        const next = (() => { called = true; });
        requireRole("admin", "teacher")(req, res, next);
        expect(called).toBe(true);
    });
    it("returns 403 when user role is not allowed", () => {
        const { req, res, resBody } = createMockReqRes("student");
        let called = false;
        const next = (() => { called = true; });
        requireRole("admin")(req, res, next);
        expect(called).toBe(false);
        expect(resBody.statusCode).toBe(403);
        expect(resBody.body?.message).toBe("Forbidden");
    });
    it("returns 403 when authUser is undefined", () => {
        const { req, res, resBody } = createMockReqRes(undefined);
        let called = false;
        const next = (() => { called = true; });
        requireRole("admin")(req, res, next);
        expect(called).toBe(false);
        expect(resBody.statusCode).toBe(403);
    });
});
//# sourceMappingURL=requireRole.test.js.map