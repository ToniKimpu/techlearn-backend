import { Worker, type Job } from "bullmq";
import { redis, redisConnectionOptions } from "./redis.js";
import { transporter, SMTP_FROM } from "./email.js";
import { welcomeEmail } from "../modules/email/templates.js";
import type { EmailJobData } from "../modules/email/producer.js";

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  if (!transporter) {
    console.warn("[Worker] SMTP not configured, skipping email job:", job.name);
    return;
  }

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

  console.log(`[Worker] Email sent: ${data.type} to ${data.to}`);
}

let emailWorker: Worker | null = null;

if (redis) {
  emailWorker = new Worker<EmailJobData>("email", processEmailJob, {
    connection: redisConnectionOptions,
    concurrency: 5,
  });

  emailWorker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  emailWorker.on("failed", (job, error) => {
    console.error(`[Worker] Job ${job?.id} failed:`, error.message);
  });

  console.log("[Worker] Email worker started");
}

export { emailWorker };
