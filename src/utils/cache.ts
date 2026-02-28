import { redis } from "../config/redis.js";

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
}

export async function getCache<T>(key: string): Promise<CacheResult<T>> {
  if (!redis) return { data: null, hit: false };

  try {
    const raw = await redis.get(key);
    if (raw) return { data: JSON.parse(raw), hit: true };
    return { data: null, hit: false };
  } catch {
    return { data: null, hit: false };
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
