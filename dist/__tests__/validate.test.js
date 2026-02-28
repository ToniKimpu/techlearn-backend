import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validate } from "../middlewares/validate.js";
function createMockReqRes(overrides = {}) {
    const req = {
        body: overrides.body || {},
        query: overrides.query || {},
        params: overrides.params || {},
    };
    const resBody = {};
    const locals = {};
    const res = {
        locals,
        status(code) {
            resBody.statusCode = code;
            return res;
        },
        json(data) {
            resBody.body = data;
            return res;
        },
    };
    return { req, res, resBody, locals };
}
describe("validate middleware", () => {
    const bodySchema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
    });
    const querySchema = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(10),
    });
    const paramsSchema = z.object({
        id: z.string().min(1),
    });
    it("validates body and calls next() on valid input", () => {
        const { req, res } = createMockReqRes({
            body: { name: "Test", email: "test@example.com" },
        });
        let called = false;
        const next = (() => { called = true; });
        validate({ body: bodySchema })(req, res, next);
        expect(called).toBe(true);
        expect(req.body.name).toBe("Test");
    });
    it("returns 400 with error message on invalid body", () => {
        const { req, res, resBody } = createMockReqRes({
            body: { name: "", email: "not-an-email" },
        });
        let called = false;
        const next = (() => { called = true; });
        validate({ body: bodySchema })(req, res, next);
        expect(called).toBe(false);
        expect(resBody.statusCode).toBe(400);
        expect(resBody.body?.message).toBeDefined();
    });
    it("validates params and assigns parsed values", () => {
        const { req, res } = createMockReqRes({
            params: { id: "123" },
        });
        let called = false;
        const next = (() => { called = true; });
        validate({ params: paramsSchema })(req, res, next);
        expect(called).toBe(true);
        expect(req.params.id).toBe("123");
    });
    it("stores parsed query on res.locals.query", () => {
        const { req, res, locals } = createMockReqRes({
            query: { page: "2", limit: "20" },
        });
        let called = false;
        const next = (() => { called = true; });
        validate({ query: querySchema })(req, res, next);
        expect(called).toBe(true);
        expect(locals.query).toEqual({ page: 2, limit: 20 });
    });
    it("applies query defaults when no query params provided", () => {
        const { req, res, locals } = createMockReqRes({ query: {} });
        let called = false;
        const next = (() => { called = true; });
        validate({ query: querySchema })(req, res, next);
        expect(called).toBe(true);
        expect(locals.query).toEqual({ page: 1, limit: 10 });
    });
    it("calls next() when no schemas provided", () => {
        const { req, res } = createMockReqRes();
        let called = false;
        const next = (() => { called = true; });
        validate({})(req, res, next);
        expect(called).toBe(true);
    });
});
//# sourceMappingURL=validate.test.js.map