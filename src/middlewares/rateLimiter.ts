import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { redis } from "../config/redis.js";

function createRedisStore(prefix: string) {
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as any,
    prefix,
  });
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: createRedisStore("rl:global:"),
  message: { message: "Too many requests, please try again later" },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: createRedisStore("rl:auth:"),
  message: { message: "Too many attempts, please try again later" },
});

// Per-user rate limiter — limits authenticated users regardless of IP
// Use after requireAuth middleware so req.authUser is available
export function userLimiter(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.authUser?.authId;
    if (!userId || !redis) return next();

    const key = `rl:user:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, windowMs);

    if (count > maxRequests) {
      return res.status(429).json({ message: "Too many requests, please try again later" });
    }
    return next();
  };
}
