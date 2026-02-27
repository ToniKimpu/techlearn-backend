import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    console.warn("[Redis] Connection error:", err.message);
    redis = null;
  });

  redis.on("connect", () => {
    console.log("[Redis] Connected");
  });

  await redis.connect();
} catch {
  console.warn("[Redis] Not available, caching disabled");
  redis = null;
}

export { redis };
