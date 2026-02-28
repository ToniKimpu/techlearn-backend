import crypto from "crypto";
import { redis } from "../config/redis.js";
export function generateRefreshToken() {
    return crypto.randomBytes(64).toString("hex");
}
export function getSessionExpiry(days = 30) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
}
const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
function sessionKey(authId, refreshToken) {
    return `session:${authId}:${refreshToken}`;
}
export async function cacheSession(authId, refreshToken, data) {
    if (!redis)
        return;
    try {
        await redis.set(sessionKey(authId, refreshToken), JSON.stringify(data), "EX", SESSION_TTL);
    }
    catch {
        // silently fail
    }
}
export async function getCachedSession(refreshToken) {
    if (!redis)
        return null;
    try {
        // We don't know the authId, so scan for the token
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `session:*:${refreshToken}`, "COUNT", 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                const raw = await redis.get(keys[0]);
                return raw ? JSON.parse(raw) : null;
            }
        } while (cursor !== "0");
        return null;
    }
    catch {
        return null;
    }
}
export async function removeCachedSession(authId, refreshToken) {
    if (!redis)
        return;
    try {
        await redis.del(sessionKey(authId, refreshToken));
    }
    catch {
        // silently fail
    }
}
export async function removeAllCachedSessions(authId) {
    if (!redis)
        return;
    try {
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `session:${authId}:*`, "COUNT", 100);
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
//# sourceMappingURL=session.js.map