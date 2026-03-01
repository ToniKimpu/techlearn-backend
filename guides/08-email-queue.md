# 08 — Email Queue (BullMQ + Nodemailer)

## Goal

Set up a background job queue for sending emails asynchronously. When a user registers, queue a welcome email instead of sending it synchronously.

---

## 8.1 Why a Queue?

```
WITHOUT queue (synchronous):
  POST /register → hash password → save to DB → SEND EMAIL → respond
                                                  ↑
                                            Takes 2-5 seconds!
                                            User waits for email server.
                                            If SMTP is down, register fails.

WITH queue (asynchronous):
  POST /register → hash password → save to DB → ADD JOB TO QUEUE → respond (fast!)
                                                  ↓
                                            Background worker picks up job
                                            Sends email (with retries)
                                            User doesn't wait
```

**Benefits:**
- Faster response times (don't make user wait for email)
- Retry failed emails automatically
- If SMTP is down, jobs wait in the queue until it's back
- Scale workers independently from the web server

---

## 8.2 Install Dependencies

```bash
npm install bullmq nodemailer
npm install -D @types/nodemailer
```

| Package | Purpose |
|---------|---------|
| `bullmq` | Redis-backed job queue (successor to Bull) |
| `nodemailer` | Send emails via SMTP |

---

## 8.3 Email Transporter (Nodemailer)

Create `src/config/email.ts`:

```typescript
import nodemailer from "nodemailer";
import logger from "../utils/logger.js";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

export const SMTP_FROM = process.env.SMTP_FROM || "noreply@techlearn.app";

let transporter: nodemailer.Transporter | null = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  const port = parseInt(SMTP_PORT || "587");

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // true for port 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  logger.info("SMTP transporter configured");
} else {
  logger.warn("SMTP not configured — emails will not be sent");
}

export { transporter };
```

**Graceful degradation again:** If SMTP isn't configured, the transporter is null. The worker checks for this before trying to send.

---

## 8.4 Email Templates

Create `src/modules/email/templates.ts`:

```typescript
import xss from "xss";

interface EmailTemplate {
  subject: string;
  html: string;
}

export function welcomeEmail(name: string): EmailTemplate {
  const safeName = xss(name); // Sanitize to prevent XSS in emails

  return {
    subject: "Welcome to TechLearn!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Welcome, ${safeName}!</h1>
        <p>Thank you for joining TechLearn. We're excited to have you.</p>
        <p>Start exploring our curriculum and begin your learning journey today.</p>
        <br>
        <p>Best regards,</p>
        <p>The TechLearn Team</p>
      </div>
    `,
  };
}
```

**Why sanitize names in emails?** If someone registers with the name `<script>alert('xss')</script>`, that script could execute in email clients that render HTML.

---

## 8.5 Email Producer (Queue Jobs)

Create `src/modules/email/producer.ts`:

```typescript
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../config/redis.js";
import { redis } from "../../config/redis.js";
import logger from "../../utils/logger.js";

export interface WelcomeEmailJob {
  type: "welcome";
  to: string;
  name: string;
}

// Only create queue if Redis is available
const emailQueue = redis
  ? new Queue("email", { connection: redisConnectionOptions })
  : null;

export async function queueWelcomeEmail(to: string, name: string): Promise<void> {
  if (!emailQueue) {
    logger.warn("Email queue not available — skipping email");
    return;
  }

  await emailQueue.add(
    "welcome-email",
    { type: "welcome", to, name } satisfies WelcomeEmailJob,
    {
      attempts: 3,                          // Retry up to 3 times
      backoff: { type: "exponential", delay: 5000 }, // 5s, 10s, 20s
      removeOnComplete: true,               // Clean up completed jobs
      removeOnFail: true,                   // Clean up failed jobs after all retries
    }
  );

  logger.info({ to }, "Welcome email queued");
}

export { emailQueue };
```

**BullMQ job options:**
- `attempts: 3` — If SMTP fails, retry 3 times
- `backoff: exponential` — Wait 5s, then 10s, then 20s between retries
- `removeOnComplete/Fail` — Auto-cleanup to prevent Redis memory bloat

---

## 8.6 Email Worker (Process Jobs)

Create `src/config/queue.ts`:

```typescript
import { Worker, Job } from "bullmq";
import { redisConnectionOptions, redis } from "./redis.js";
import { transporter, SMTP_FROM } from "./email.js";
import { welcomeEmail } from "../modules/email/templates.js";
import logger from "../utils/logger.js";

// Process a single email job
export async function processEmailJob(job: Job): Promise<void> {
  const { type, to, name } = job.data;

  switch (type) {
    case "welcome": {
      if (!transporter) {
        logger.warn("No SMTP transporter — skipping email");
        return;
      }

      const template = welcomeEmail(name);
      await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: template.subject,
        html: template.html,
      });

      logger.info({ type, to }, "Email sent");
      break;
    }
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

// Only create worker if Redis is available
export const emailWorker = redis
  ? new Worker("email", processEmailJob, {
      connection: redisConnectionOptions,
      concurrency: 5, // Process up to 5 emails at once
    })
  : null;

if (emailWorker) {
  emailWorker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Email job completed");
  });

  emailWorker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, "Email job failed");
  });
}
```

**Concurrency: 5** — The worker processes up to 5 jobs simultaneously. If you have 100 emails queued, it processes them 5 at a time.

---

## 8.7 Email Health Check Endpoint

Create `src/modules/email/service.ts`:

```typescript
import { emailQueue } from "./producer.js";

export async function getQueueHealth() {
  if (!emailQueue) {
    return { status: "disabled", message: "Email queue not available" };
  }

  const counts = await emailQueue.getJobCounts();
  return {
    queueName: "email",
    jobCounts: counts,
  };
}
```

Create `src/modules/email/routes.ts`:

```typescript
import { Router } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import * as emailService from "./service.js";

const router = Router();

// GET /email/health — Admin only
router.get(
  "/health",
  requireAuth,
  requirePermission("email:admin"),
  async (_req, res) => {
    const health = await emailService.getQueueHealth();
    res.json(health);
  }
);

export default router;
```

---

## 8.8 Connect Welcome Email to Registration

In `src/modules/auth/service.ts`, add to the register function:

```typescript
import { queueWelcomeEmail } from "../email/producer.js";

// Inside register(), after creating the user:
await queueWelcomeEmail(email, name);
```

---

## 8.9 Mount Email Routes

In `src/app.ts`:

```typescript
import emailRoutes from "./modules/email/routes.js";

app.use("/api/v1/email", emailRoutes);
```

---

## 8.10 BullMQ Architecture

```
Web Server (Express)                Redis                    Worker
─────────────────────              ─────                    ──────
POST /register                        │
  → authService.register()            │
  → queueWelcomeEmail()  ──────►  email queue  ◄──────  emailWorker
                                      │                     │
                                   Job waiting              │
                                      │                     ▼
                                   Job active         processEmailJob()
                                      │                     │
                                   Job completed     transporter.sendMail()
                                      │                     │
                                   Job removed        Email sent!
```

**In production**, you could run the worker as a separate process. In this project, both the web server and worker run in the same process for simplicity.

---

## Checkpoint

- [x] Nodemailer SMTP transporter
- [x] HTML email template with XSS sanitization
- [x] BullMQ producer (queue jobs)
- [x] BullMQ worker (process jobs with retries)
- [x] Welcome email sent on registration
- [x] Email queue health endpoint (admin only)
- [x] Graceful degradation (works without Redis/SMTP)

**Commit:** `git commit -m "add BullMQ email queue with welcome email on registration"`

---

## Key Concepts to Understand

1. **Message queues** — Why async processing matters: https://www.cloudamqp.com/blog/what-is-message-queuing.html
2. **BullMQ** — Redis-backed queue: https://docs.bullmq.io/
3. **Exponential backoff** — Why retries wait longer each time: prevents thundering herd
4. **Nodemailer** — Email sending: https://nodemailer.com/about/
5. **Producer-Consumer pattern** — Producer adds jobs, consumer processes them. They're decoupled.
