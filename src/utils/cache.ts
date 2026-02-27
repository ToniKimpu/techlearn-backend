import { redis } from "../config/redis.js";

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;

  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;

  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch {
    // silently fail — caching is optional
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // silently fail
  }
}
