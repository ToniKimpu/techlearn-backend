import { emailQueue } from "./producer.js";

async function getQueueHealth() {
  if (!emailQueue) {
    return { status: "disabled", message: "Email queue not available (Redis not connected)" };
  }

  const counts = await emailQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed"
  );
  return { status: "active", queue: "email", jobs: counts };
}

export const emailService = { getQueueHealth };
