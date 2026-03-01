import { Queue } from "bullmq";
import { redis, redisConnectionOptions } from "../../config/redis.js";
import { logger } from "../../utils/logger.js";

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
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  logger.info("[Queue] Email queue created");
}

export { emailQueue };

export async function queueWelcomeEmail(to: string, name: string): Promise<void> {
  if (!emailQueue) {
    logger.warn("[Queue] Email queue not available, skipping welcome email");
    return;
  }

  try {
    await emailQueue.add("welcome-email", { type: "welcome", to, name });
    logger.info("[Queue] Welcome email queued for %s", to);
  } catch (error) {
    logger.error({ err: error }, "[Queue] Failed to queue welcome email");
  }
}
