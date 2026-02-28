import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

vi.mock("../config/redis.js", () => ({ redis: null }));

vi.mock("../database/prisma.js", () => ({
  prisma: {
    authUser: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../config/passport.js", () => {
  const passport = {
    initialize: () => (_req: any, _res: any, next: any) => next(),
    use: vi.fn(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
    authenticate: vi.fn(),
  };
  return { default: passport };
});

import request from "supertest";
import app from "../app.js";
import { prisma } from "../database/prisma.js";

const mockPrisma = vi.mocked(prisma);

describe("Auth API", () => {
  describe("POST /api/v1/auth/register", () => {
    it("returns 400 for missing fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "not-an-email", password: "123456", name: "Test" });

      expect(res.status).toBe(400);
    });

    it("returns 400 for short password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "123", name: "Test" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when email already exists", async () => {
      mockPrisma.authUser.findUnique.mockResolvedValue({
        id: "existing-id",
        email: "test@example.com",
        passwordHash: "hash",
        emailVerifiedAt: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileId: "p1",
      });

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "test@example.com", password: "123456", name: "Test" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Email already exists");
    });

    it("returns 201 for valid registration", async () => {
      mockPrisma.authUser.findUnique.mockResolvedValue(null);
      mockPrisma.authUser.create.mockResolvedValue({
        id: "auth-1",
        email: "new@example.com",
        passwordHash: "hashed",
        emailVerifiedAt: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileId: "p1",
        profile: {
          id: "p1",
          fullName: "New User",
          email: "new@example.com",
          userType: "student",
        },
      } as any);
      mockPrisma.session.create.mockResolvedValue({} as any);

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "new@example.com", password: "123456", name: "New User" });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe("new@example.com");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("returns 400 for missing refresh token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/logout")
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 200 for valid logout", async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken: "some-valid-token" });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Logged out successfully");
    });
  });
});
