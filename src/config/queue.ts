import { Worker, type Job } from "bullmq";
import { redis, redisConnectionOptions } from "./redis.js";
import { transporter, SMTP_FROM } from "./email.js";
import { welcomeEmail } from "../modules/email/templates.js";
import { logger } from "../utils/logger.js";
import type { EmailJobData } from "../modules/email/producer.js";

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  if (!transporter) {
    logger.warn("[Worker] SMTP not configured, skipping email job: %s", job.name);
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

  logger.info("[Worker] Email sent: %s to %s", data.type, data.to);
}

let emailWorker: Worker | null = null;

if (redis) {
  emailWorker = new Worker<EmailJobData>("email", processEmailJob, {
    connection: redisConnectionOptions,
    concurrency: 5,
  });

  emailWorker.on("completed", (job) => {
    logger.info("[Worker] Job %s completed", job.id);
  });

  emailWorker.on("failed", (job, error) => {
    logger.error("[Worker] Job %s failed: %s", job?.id, error.message);
  });

  logger.info("[Worker] Email worker started");
}

export { emailWorker };
