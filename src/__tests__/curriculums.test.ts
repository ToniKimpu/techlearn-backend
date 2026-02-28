import { describe, it, expect, beforeAll, vi } from "vitest";

// Set env vars before any app imports
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

// Mock Prisma before importing app
vi.mock("../database/prisma.js", () => ({
  prisma: {
    curriculum: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock Redis — no real Redis needed for tests
vi.mock("../config/redis.js", () => ({ redis: null }));

// Mock passport to avoid DB connection during import
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
import { generateAccessToken } from "../utils/jwt.js";
import { prisma } from "../database/prisma.js";

const mockPrisma = vi.mocked(prisma);

function getToken(userType: string) {
  return generateAccessToken({ authId: "a1", profileId: "p1", userType });
}

describe("Curriculums API", () => {
  describe("GET /api/v1/curriculums", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/v1/curriculums");
      expect(res.status).toBe(401);
    });

    it("returns list for authenticated student", async () => {
      const mockItems = [
        { id: 1n, name: "Curriculum 1", description: null, image: "", isDeleted: false, createdAt: new Date(), updatedAt: new Date() },
      ];
      mockPrisma.curriculum.findMany.mockResolvedValue(mockItems);
      mockPrisma.curriculum.count.mockResolvedValue(1);

      const res = await request(app)
        .get("/api/v1/curriculums")
        .set("Authorization", `Bearer ${getToken("student")}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
    });

    it("returns list for authenticated admin", async () => {
      mockPrisma.curriculum.findMany.mockResolvedValue([]);
      mockPrisma.curriculum.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/api/v1/curriculums")
        .set("Authorization", `Bearer ${getToken("admin")}`);

      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/v1/curriculums", () => {
    it("returns 403 for student", async () => {
      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${getToken("student")}`)
        .send({ name: "Test Curriculum" });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Forbidden: insufficient permissions");
    });

    it("returns 403 for teacher", async () => {
      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${getToken("teacher")}`)
        .send({ name: "Test Curriculum" });

      expect(res.status).toBe(403);
    });

    it("returns 201 for admin", async () => {
      const mockCurriculum = {
        id: 1n, name: "Test Curriculum", description: null, image: "", isDeleted: false, createdAt: new Date(), updatedAt: new Date(),
      };
      mockPrisma.curriculum.create.mockResolvedValue(mockCurriculum);

      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${getToken("admin")}`)
        .send({ name: "Test Curriculum" });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Curriculum created");
    });

    it("returns 400 for missing name", async () => {
      const res = await request(app)
        .post("/api/v1/curriculums")
        .set("Authorization", `Bearer ${getToken("admin")}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/v1/curriculums/:id", () => {
    it("returns 403 for student", async () => {
      const res = await request(app)
        .put("/api/v1/curriculums/1")
        .set("Authorization", `Bearer ${getToken("student")}`)
        .send({ name: "Updated" });

      expect(res.status).toBe(403);
    });

    it("returns 200 for admin with valid update", async () => {
      const mockCurriculum = {
        id: 1n, name: "Old Name", description: null, image: "", isDeleted: false, createdAt: new Date(), updatedAt: new Date(),
      };
      mockPrisma.curriculum.findFirst.mockResolvedValue(mockCurriculum);
      mockPrisma.curriculum.update.mockResolvedValue({ ...mockCurriculum, name: "Updated" });

      const res = await request(app)
        .put("/api/v1/curriculums/1")
        .set("Authorization", `Bearer ${getToken("admin")}`)
        .send({ name: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Curriculum updated");
    });
  });

  describe("DELETE /api/v1/curriculums/:id", () => {
    it("returns 403 for student", async () => {
      const res = await request(app)
        .delete("/api/v1/curriculums/1")
        .set("Authorization", `Bearer ${getToken("student")}`);

      expect(res.status).toBe(403);
    });

    it("returns 200 for admin", async () => {
      const mockCurriculum = {
        id: 1n, name: "To Delete", description: null, image: "", isDeleted: false, createdAt: new Date(), updatedAt: new Date(),
      };
      mockPrisma.curriculum.findFirst.mockResolvedValue(mockCurriculum);
      mockPrisma.curriculum.update.mockResolvedValue({ ...mockCurriculum, isDeleted: true });

      const res = await request(app)
        .delete("/api/v1/curriculums/1")
        .set("Authorization", `Bearer ${getToken("admin")}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Curriculum deleted");
    });

    it("returns 404 when curriculum not found", async () => {
      mockPrisma.curriculum.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete("/api/v1/curriculums/999")
        .set("Authorization", `Bearer ${getToken("admin")}`);

      expect(res.status).toBe(404);
    });
  });
});
