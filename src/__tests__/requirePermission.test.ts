import { describe, it, expect, beforeAll } from "vitest";
import { requirePermission } from "../middlewares/requirePermission.js";
import type { Request, Response, NextFunction } from "express";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
});

function createMockReqRes(userType?: string) {
  const req = {
    authUser: userType ? { authId: "a1", profileId: "p1", userType } : undefined,
  } as unknown as Request;

  const resBody: { statusCode?: number; body?: any } = {};
  const res = {
    status(code: number) {
      resBody.statusCode = code;
      return res;
    },
    json(data: any) {
      resBody.body = data;
      return res;
    },
  } as unknown as Response;

  return { req, res, resBody };
}

describe("requirePermission middleware", () => {
  it("calls next() when user has the required permission", () => {
    const { req, res } = createMockReqRes("admin");
    let called = false;
    const next: NextFunction = (() => {
      called = true;
    }) as any;

    requirePermission("curriculum:write")(req, res, next);

    expect(called).toBe(true);
  });

  it("returns 403 when teacher does not have write permission", () => {
    const { req, res, resBody } = createMockReqRes("teacher");
    let called = false;
    const next: NextFunction = (() => {
      called = true;
    }) as any;

    requirePermission("curriculum:write")(req, res, next);

    expect(called).toBe(false);
    expect(resBody.statusCode).toBe(403);
    expect(resBody.body?.message).toBe("Forbidden: insufficient permissions");
  });

  it("returns 403 when student does not have write permission", () => {
    const { req, res, resBody } = createMockReqRes("student");
    let called = false;
    const next: NextFunction = (() => {
      called = true;
    }) as any;

    requirePermission("chapter:write")(req, res, next);

    expect(called).toBe(false);
    expect(resBody.statusCode).toBe(403);
  });

  it("returns 403 when authUser is undefined", () => {
    const { req, res, resBody } = createMockReqRes(undefined);
    let called = false;
    const next: NextFunction = (() => {
      called = true;
    }) as any;

    requirePermission("grade:write")(req, res, next);

    expect(called).toBe(false);
    expect(resBody.statusCode).toBe(403);
  });

  it("enforces email:admin permission correctly", () => {
    const { req: adminReq, res: adminRes } = createMockReqRes("admin");
    let adminCalled = false;
    requirePermission("email:admin")(adminReq, adminRes, (() => {
      adminCalled = true;
    }) as any);
    expect(adminCalled).toBe(true);

    const { req: teacherReq, res: teacherRes, resBody } = createMockReqRes("teacher");
    let teacherCalled = false;
    requirePermission("email:admin")(teacherReq, teacherRes, (() => {
      teacherCalled = true;
    }) as any);
    expect(teacherCalled).toBe(false);
    expect(resBody.statusCode).toBe(403);
  });
});
