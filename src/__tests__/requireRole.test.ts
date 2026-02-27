import { describe, it, expect, beforeAll } from "vitest";
import { requireRole } from "../middlewares/requireRole.js";
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

describe("requireRole middleware", () => {
  it("calls next() when user role matches", () => {
    const { req, res } = createMockReqRes("admin");
    let called = false;
    const next: NextFunction = (() => { called = true; }) as any;

    requireRole("admin")(req, res, next);

    expect(called).toBe(true);
  });

  it("calls next() when user role is one of multiple allowed roles", () => {
    const { req, res } = createMockReqRes("teacher");
    let called = false;
    const next: NextFunction = (() => { called = true; }) as any;

    requireRole("admin", "teacher")(req, res, next);

    expect(called).toBe(true);
  });

  it("returns 403 when user role is not allowed", () => {
    const { req, res, resBody } = createMockReqRes("student");
    let called = false;
    const next: NextFunction = (() => { called = true; }) as any;

    requireRole("admin")(req, res, next);

    expect(called).toBe(false);
    expect(resBody.statusCode).toBe(403);
    expect(resBody.body?.message).toBe("Forbidden");
  });

  it("returns 403 when authUser is undefined", () => {
    const { req, res, resBody } = createMockReqRes(undefined);
    let called = false;
    const next: NextFunction = (() => { called = true; }) as any;

    requireRole("admin")(req, res, next);

    expect(called).toBe(false);
    expect(resBody.statusCode).toBe(403);
  });
});
