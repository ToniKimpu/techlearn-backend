import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-key-for-unit-tests";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

vi.mock("../config/redis.js", () => ({
  redis: null,
  redisConnectionOptions: { host: "localhost", port: 6379, maxRetriesPerRequest: null },
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "mock-id" });

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mockSendMail,
    }),
  },
}));

import { welcomeEmail } from "../modules/email/templates.js";

describe("Email Templates", () => {
  describe("welcomeEmail", () => {
    it("returns subject and html with user name", () => {
      const result = welcomeEmail("John Doe");

      expect(result.subject).toBe("Welcome to TechLearn!");
      expect(result.html).toContain("John Doe");
    });

    it("escapes HTML in user name to prevent XSS", () => {
      const result = welcomeEmail('<script>alert("xss")</script>');

      expect(result.html).not.toContain("<script>");
      expect(result.html).toContain("&lt;script&gt;");
    });

    it("escapes ampersands and quotes", () => {
      const result = welcomeEmail('Tom & "Jerry"');

      expect(result.html).toContain("Tom &amp; &quot;Jerry&quot;");
    });
  });
});

describe("Email Producer", () => {
  it("queueWelcomeEmail does not throw when queue is null", async () => {
    const { queueWelcomeEmail } = await import("../modules/email/producer.js");

    await expect(
      queueWelcomeEmail("test@example.com", "Test User")
    ).resolves.not.toThrow();
  });
});

describe("Email Worker", () => {
  it("processEmailJob sends welcome email via transporter", async () => {
    process.env.SMTP_HOST = "smtp.test.com";
    process.env.SMTP_USER = "test@test.com";
    process.env.SMTP_PASS = "password";

    const { processEmailJob } = await import("../config/queue.js");

    const mockJob = {
      id: "test-job-1",
      name: "welcome-email",
      data: { type: "welcome" as const, to: "user@example.com", name: "Test User" },
    } as any;

    await processEmailJob(mockJob);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Welcome to TechLearn!",
      })
    );
  });
});
