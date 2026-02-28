import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";
function createRedisStore(prefix) {
    if (!redis)
        return undefined;
    return new RedisStore({
        sendCommand: (...args) => redis.call(args[0], ...args.slice(1)),
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
//# sourceMappingURL=rateLimiter.js.map