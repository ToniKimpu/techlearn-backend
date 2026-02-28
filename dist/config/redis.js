import Redis from "ioredis";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const parsedUrl = new URL(REDIS_URL);
export const redisConnectionOptions = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || "6379"),
    password: parsedUrl.password || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
};
let redis = null;
try {
    const client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: () => null,
        lazyConnect: true,
    });
    client.on("error", () => { });
    await client.connect();
    redis = client;
    console.log("[Redis] Connected");
}
catch {
    console.warn("[Redis] Not available, caching disabled");
    redis = null;
}
export { redis };
//# sourceMappingURL=redis.js.map