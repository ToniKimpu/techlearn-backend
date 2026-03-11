# 11 — BullMQ (Job Queues)

## What is a job queue?

A job queue lets you defer work to a background process. Instead of doing slow or unreliable work inside an HTTP request handler, you add a **job** to a queue and return immediately. A separate **worker** picks up the job and processes it.

```
Without queue:
  POST /register → hash password → save user → send email (500ms) → respond
  ↑ User waits for the email to send

With queue:
  POST /register → hash password → save user → add email job → respond (fast)
                                                 ↑
                                         Worker picks this up later
                                         and sends the email
```

The key benefits:
- **Fast responses** — HTTP handler returns instantly
- **Retry on failure** — if email fails, job retries automatically
- **Concurrency control** — process N jobs at a time, not infinite
- **Visibility** — you can inspect, pause, retry jobs in a dashboard

---

## How this project uses BullMQ

BullMQ uses Redis to store jobs. The queue and worker are in separate files.

### The queue (producer)

[`src/modules/email/producer.ts`](../src/modules/email/producer.ts) creates the queue and provides a function to add jobs:

```ts
import { Queue } from "bullmq";
import { redis, redisConnectionOptions } from "../../config/redis.js";

export interface WelcomeEmailJob {
  type: "welcome";
  to: string;
  name: string;
}

export type EmailJobData = WelcomeEmailJob;

let emailQueue: Queue<EmailJobData> | null = null;

if (redis) {
  emailQueue = new Queue<EmailJobData>("email", {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,             // retry up to 3 times on failure
      backoff: {
        type: "exponential",
        delay: 5000,           // 5s, 10s, 20s between retries
      },
      removeOnComplete: { count: 100 }, // keep last 100 completed jobs
      removeOnFail: { count: 500 },     // keep last 500 failed jobs
    },
  });
}

// Called from route handlers
export async function queueWelcomeEmail(to: string, name: string): Promise<void> {
  if (!emailQueue) return; // gracefully skip if Redis unavailable

  await emailQueue.add("welcome-email", { type: "welcome", to, name });
  logger.info("[Queue] Welcome email queued for %s", to);
}
```

### The worker (consumer)

[`src/config/queue.ts`](../src/config/queue.ts) creates the worker that processes jobs:

```ts
import { Worker, type Job } from "bullmq";

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { data } = job;

  switch (data.type) {
    case "welcome": {
      const template = welcomeEmail(data.name);
      await transporter.sendMail({
        from: SMTP_FROM,
        to: data.to,
        subject: template.subject,
        html: template.html,
      });
      break;
    }
    default:
      throw new Error(`Unknown email type: ${(data as any).type}`);
  }

  logger.info("[Worker] Email sent: %s to %s", data.type, data.to);
}

// Create the worker — processes jobs from the "email" queue
if (redis) {
  const emailWorker = new Worker<EmailJobData>("email", processEmailJob, {
    connection: redisConnectionOptions,
    concurrency: 5, // process up to 5 jobs simultaneously
  });

  emailWorker.on("completed", (job) => {
    logger.info("[Worker] Job %s completed", job.id);
  });

  emailWorker.on("failed", (job, error) => {
    logger.error("[Worker] Job %s failed: %s", job?.id, error.message);
  });
}
```

---

## How BullMQ works internally

Jobs flow through these states:

```
add()    →  [waiting]  →  [active]  →  [completed]
                              ↓ (on error)
                          [failed]  →  retry?  →  [waiting]
                                     (if attempts exhausted)
                          [failed permanently]
```

All of this state is stored in Redis as sorted sets:
```
bull:email:waiting   → jobs waiting to be processed
bull:email:active    → jobs currently being processed
bull:email:completed → finished jobs
bull:email:failed    → failed jobs
```

---

## Why exponential backoff on retries?

If the email service is temporarily down, retrying immediately will just fail again. Exponential backoff waits longer between each retry:

```
Attempt 1: fails → wait 5s
Attempt 2: fails → wait 10s
Attempt 3: fails → wait 20s
Attempt 4: job moved to failed permanently
```

This gives the external service time to recover.

---

## Step-by-step practice

**Task 1 — Build a simple greeting queue**

```ts
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

const connection = { host: "localhost", port: 6379 };

// Producer — adds jobs
const greetQueue = new Queue("greet", { connection });

// Worker — processes jobs
const worker = new Worker(
  "greet",
  async (job) => {
    console.log(`Processing job ${job.id}...`);
    await new Promise(r => setTimeout(r, 500)); // simulate work
    console.log(`Hello, ${job.data.name}!`);
  },
  { connection, concurrency: 2 }
);

worker.on("completed", (job) => console.log(`Job ${job.id} done`));
worker.on("failed", (job, err) => console.log(`Job ${job?.id} failed: ${err.message}`));

// Add jobs
await greetQueue.add("greet-job", { name: "Alice" });
await greetQueue.add("greet-job", { name: "Bob" });
await greetQueue.add("greet-job", { name: "Charlie" });

console.log("Jobs added. Worker will process them...");
// Wait a moment to see output, then cleanup
await new Promise(r => setTimeout(r, 3000));
await worker.close();
await greetQueue.close();
```

**Task 2 — Add retry logic and observe it**

```ts
const worker = new Worker(
  "greet",
  async (job) => {
    console.log(`Attempt ${job.attemptsMade + 1} for job ${job.id}`);

    // Fail on first two attempts
    if (job.attemptsMade < 2) {
      throw new Error("Simulated failure");
    }

    console.log(`Hello, ${job.data.name}! (succeeded on attempt 3)`);
  },
  { connection }
);

await greetQueue.add("greet-job", { name: "Alice" }, {
  attempts: 3,
  backoff: { type: "fixed", delay: 1000 }, // retry every 1 second
});
```

**Task 3 — Inspect the queue in BullMQ Board (optional visual dashboard)**

```bash
npm install @bull-board/express @bull-board/api
```

```ts
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(greetQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());
// Open http://localhost:3001/admin/queues in your browser
```

---

## Key takeaways

- A job queue decouples slow/unreliable work from HTTP request handlers
- **Producer** adds jobs; **Worker** processes them — both connect to the same Redis queue
- Automatic retry with exponential backoff handles transient failures
- Jobs go through states: waiting → active → completed/failed
- BullMQ is backed by Redis — if Redis is unavailable, the queue gracefully degrades
- This project uses it exclusively for email — a perfect use case (slow, can fail, should retry)
