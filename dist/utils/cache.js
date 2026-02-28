import { redis } from "../config/redis.js";
export async function getCache(key) {
    if (!redis)
        return { data: null, hit: false };
    try {
        const raw = await redis.get(key);
        if (raw)
            return { data: JSON.parse(raw), hit: true };
        return { data: null, hit: false };
    }
    catch {
        return { data: null, hit: false };
    }
}
export async function setCache(key, data, ttlSeconds) {
    if (!redis)
        return;
    try {
        await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
    }
    catch {
        // silently fail — caching is optional
    }
}
export async function invalidateCache(pattern) {
    if (!redis)
        return;
    try {
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== "0");
    }
    catch {
        // silently fail
    }
}
//# sourceMappingURL=cache.js.map