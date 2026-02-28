# Email Queue Guide (BullMQ + Nodemailer)

## What is a Job Queue?

Without a queue, sending an email blocks the API response:

```
Client → POST /auth/register → Create user → Send email (2-5s) → Response (slow)
```

With BullMQ, the email is added to a Redis queue and processed in the background. The API responds immediately:

```
Client → POST /auth/register → Create user → Add job to queue → Response (fast)
                                                     ↓
                                              Worker picks up job
                                                     ↓
                                              Nodemailer → SMTP → Email delivered
```

If sending fails (SMTP timeout, network error), BullMQ automatically retries with exponential backoff.

---

## How It Works in Our Project

### Step 1: Nodemailer Transporter (`src/config/email.ts`)

Creates an SMTP connection for sending emails. If SMTP env vars are not set, email sending is disabled but the app still works.

```ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
```

### Step 2: Email Templates (`src/modules/email/templates.ts`)

Pure functions that take data and return `{ subject, html }`. User input is escaped to prevent XSS:

```ts
welcomeEmail("John Doe")
// Returns:
// {
//   subject: "Welcome to TechLearn!",
//   html: "<div>...Welcome to TechLearn, John Doe!...</div>"
// }
```

To add a new email type, create a new function:

```ts
export function passwordResetEmail(name: string, resetLink: string): EmailTemplate {
  return {
    subject: "Reset your TechLearn password",
    html: `<p>Hi ${escapeHtml(name)}, click <a href="${resetLink}">here</a> to reset your password.</p>`,
  };
}
```

### Step 3: Queue Producer (`src/modules/email/producer.ts`)

Creates the BullMQ queue and exports functions to add jobs:

```ts
// Add a welcome email job to the queue
await queueWelcomeEmail("user@example.com", "John Doe");
```

This function is fire-and-forget — it never throws. If Redis is down or queueing fails, the error is logged but the calling code (registration) continues normally.

Job configuration:
- **3 retry attempts** with exponential backoff (5s → 10s → 20s)
- **Auto-cleanup**: keeps last 100 completed and 500 failed jobs in Redis

### Step 4: Worker (`src/config/queue.ts`)

The worker processes jobs from the queue. It matches on `job.data.type` to pick the right template:

```ts
switch (data.type) {
  case "welcome":
    // Build template → send via Nodemailer
    break;
  // Add new cases here for new email types
}
```

The worker starts automatically when the server boots (imported in `src/server.ts`). It processes up to 5 emails in parallel.

### Step 5: Integration (`src/modules/auth/routes.ts`)

The welcome email is queued after a successful registration:

```ts
router.post("/auth/register", async (req, res) => {
  // ... create user, session, token ...

  // Queue welcome email (non-blocking)
  queueWelcomeEmail(email, name).catch(() => {});

  return res.status(201).json({ ... });
});
```

The `.catch(() => {})` is a safety net — registration never fails because of email.

---

## Adding a New Email Type

Follow these 3 steps:

### 1. Add the template in `src/modules/email/templates.ts`

```ts
export function passwordResetEmail(name: string, resetUrl: string): EmailTemplate {
  return {
    subject: "Reset your TechLearn password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Password Reset</h1>
        <p>Hi ${escapeHtml(name)}, click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
      </div>
    `,
  };
}
```

### 2. Add the job type in `src/modules/email/producer.ts`

```ts
// Add to the union type
export interface PasswordResetEmailJob {
  type: "password-reset";
  to: string;
  name: string;
  resetUrl: string;
}

export type EmailJobData = WelcomeEmailJob | PasswordResetEmailJob;

// Add producer function
export async function queuePasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
  if (!emailQueue) return;
  try {
    await emailQueue.add("password-reset-email", { type: "password-reset", to, name, resetUrl });
  } catch (error) {
    console.error("[Queue] Failed to queue password reset email:", error);
  }
}
```

### 3. Handle it in the worker (`src/config/queue.ts`)

```ts
switch (data.type) {
  case "welcome": { ... }
  case "password-reset": {
    const template = passwordResetEmail(data.name, data.resetUrl);
    await transporter.sendMail({
      from: SMTP_FROM,
      to: data.to,
      subject: template.subject,
      html: template.html,
    });
    break;
  }
}
```

---

## Admin Endpoint

### Queue Health Check

```
GET /api/v1/email/health
Authorization: Bearer <admin-token>
```

Response:

```json
{
  "status": "active",
  "queue": "email",
  "jobs": {
    "waiting": 2,
    "active": 1,
    "completed": 45,
    "failed": 0,
    "delayed": 0
  }
}
```

If Redis is not connected:

```json
{
  "status": "disabled",
  "message": "Email queue not available (Redis not connected)"
}
```

---

## SMTP Configuration

Add these to your `.env` file:

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="noreply@techlearn.app"
```

### Gmail Setup

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification
3. Go to **App passwords** → generate a password for "Mail"
4. Use that 16-character password as `SMTP_PASS`

### Other Providers

| Provider | SMTP_HOST | SMTP_PORT |
|----------|-----------|-----------|
| Gmail | smtp.gmail.com | 587 |
| Outlook | smtp-mail.outlook.com | 587 |
| SendGrid | smtp.sendgrid.net | 587 |
| Mailgun | smtp.mailgun.org | 587 |
| Mailtrap (testing) | sandbox.smtp.mailtrap.io | 587 |

### No SMTP? No Problem

If SMTP env vars are not set, you'll see this log on startup:

```
[Email] SMTP not configured, email sending disabled
```

The app works normally. Jobs are still queued and processed, but the worker skips sending. This is useful during development.

---

## Retry & Error Handling

BullMQ handles retries automatically:

| Attempt | Delay | What happens |
|---------|-------|--------------|
| 1st | Immediate | Job is processed |
| 2nd | 5 seconds | First retry after failure |
| 3rd | 10 seconds | Second retry |
| 4th | — | Job marked as failed, kept in Redis |

Failed jobs are kept in Redis (last 500) for inspection. Completed jobs auto-clean (last 100 kept).

---

## Graceful Degradation

The email system handles failures at every level:

| Scenario | Behavior |
|----------|----------|
| Redis not running | Queue not created, emails skipped silently |
| SMTP not configured | Worker processes jobs but skips sending |
| SMTP server down | BullMQ retries 3 times with backoff |
| Queue add fails | Error logged, registration still succeeds |

The registration endpoint **never fails** because of the email system.

---

## Testing

Redis and BullMQ are mocked in tests — no real Redis or SMTP needed:

```ts
vi.mock("../config/redis.js", () => ({
  redis: null,
  redisConnectionOptions: { host: "localhost", port: 6379, maxRetriesPerRequest: null },
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));
```

Run email tests:

```bash
npm test -- email
```

---

## Files

| File | Purpose |
|------|---------|
| `src/config/email.ts` | Nodemailer SMTP transporter |
| `src/config/queue.ts` | BullMQ Worker (processes email jobs) |
| `src/modules/email/templates.ts` | HTML email template functions |
| `src/modules/email/producer.ts` | BullMQ Queue + producer functions |
| `src/modules/email/routes.ts` | Admin health endpoint |
| `src/__tests__/email.test.ts` | Tests for templates, producer, worker |

---

## Summary

```
Registration → queueWelcomeEmail() → Redis Queue → Worker → Nodemailer → SMTP
     ↓ (instant response)                          ↓
  201 Created                              Retries on failure (3x)

No Redis → emails skipped, app works fine
No SMTP  → jobs processed but sending skipped
```
