# 04 — Authentication Module

## Goal

Build a complete auth system: registration, login, logout, refresh tokens, and JWT-based authentication middleware.

---

## 4.1 Install Dependencies

```bash
npm install passport passport-local jsonwebtoken argon2 bcrypt
npm install -D @types/passport @types/passport-local @types/jsonwebtoken @types/bcrypt
```

| Package | Purpose |
|---------|---------|
| `passport` | Authentication framework (pluggable strategies) |
| `passport-local` | Username/password strategy for Passport |
| `jsonwebtoken` | Create and verify JWT tokens |
| `argon2` | Password hashing (more secure than bcrypt) |
| `bcrypt` | Alternative password hashing (simpler API) |

**argon2 vs bcrypt:** argon2 is the winner of the Password Hashing Competition (2015). It's more resistant to GPU attacks because it's memory-hard. bcrypt is still fine, but argon2 is the modern choice.

---

## 4.2 Understand the Auth Flow

```
REGISTER:
  Client sends { email, password, name }
  → Hash password with argon2
  → Create AuthUser + Profile in database
  → Create Session (refresh token) in DB + Redis
  → Generate JWT access token (30-min expiry)
  → Return { accessToken, refreshToken, user }

LOGIN:
  Client sends { email, password }
  → Passport local strategy verifies credentials
  → Create Session + generate tokens (same as register)
  → Return { accessToken, refreshToken, user }

AUTHENTICATED REQUEST:
  Client sends: Authorization: Bearer <accessToken>
  → requireAuth middleware verifies JWT
  → Sets req.authUser = { authId, profileId, userType }
  → Route handler has access to authenticated user

REFRESH TOKEN:
  Access token expired → Client sends { refreshToken }
  → Verify refresh token exists in DB and hasn't expired
  → Generate NEW access token + NEW refresh token (rotation)
  → Delete old session, create new one
  → Return { accessToken, refreshToken }

LOGOUT:
  Client sends { refreshToken }
  → Delete session from DB + Redis cache
```

**Why refresh token rotation?** If someone steals a refresh token, the next time the real user tries to refresh, the stolen token is already used/deleted. This limits the damage window.

---

## 4.3 TypeScript Types

Create `src/types/jwt.ts`:

```typescript
export interface JwtUserPayload {
  authId: string;
  profileId: string;
  userType: string;
}
```

Create `src/types/express.d.ts` (augments Express types):

```typescript
import { JwtUserPayload } from "./jwt.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: JwtUserPayload;
    }
  }
}
```

This lets you do `req.authUser` in any route handler without TypeScript complaining.

---

## 4.4 JWT Utilities

Create `src/utils/jwt.ts`:

```typescript
import jwt from "jsonwebtoken";
import { JwtUserPayload } from "../types/jwt.js";

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_EXPIRES_IN = "30m";

interface TokenParams {
  authId: string;
  profileId: string;
  userType: string;
}

export function generateAccessToken(params: TokenParams): string {
  return jwt.sign(
    {
      sub: params.authId,
      profileId: params.profileId,
      userType: params.userType,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

export function verifyAccessToken(token: string): JwtUserPayload {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  return {
    authId: payload.sub as string,
    profileId: payload.profileId as string,
    userType: payload.userType as string,
  };
}
```

**JWT anatomy:** A JWT has 3 parts: `header.payload.signature`
- **Header:** Algorithm (HS256) and type (JWT)
- **Payload:** Your data (authId, profileId, userType, expiry)
- **Signature:** HMAC of header+payload using your secret — proves the token hasn't been tampered with

**30-minute expiry:** Short-lived access tokens limit damage if stolen. Users refresh silently using the refresh token.

---

## 4.5 Session Utilities

Create `src/utils/session.ts`:

```typescript
import crypto from "node:crypto";
import { redis } from "../config/redis.js"; // We'll create this next
import logger from "./logger.js";

const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export interface CachedSession {
  id: string;
  authId: string;
  refreshToken: string;
  expiresAt: string;
  auth: {
    id: string;
    email: string;
    profile: {
      id: string;
      fullName: string;
      userType: string;
    } | null;
  };
}

// Generate a cryptographically secure refresh token
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex"); // 128-char hex string
}

// Calculate session expiry date
export function getSessionExpiry(days: number = 30): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

// Store session in Redis for fast lookup
export async function cacheSession(
  authId: string,
  refreshToken: string,
  data: CachedSession
): Promise<void> {
  if (!redis) return;
  const key = `session:${authId}:${refreshToken}`;
  await redis.set(key, JSON.stringify(data), "EX", SESSION_TTL);
  logger.debug({ key }, "Session cached");
}

// Find a session by refresh token (scans Redis keys)
export async function getCachedSession(
  refreshToken: string
): Promise<CachedSession | null> {
  if (!redis) return null;

  // SCAN for the session key pattern
  const stream = redis.scanStream({ match: `session:*:${refreshToken}`, count: 100 });

  return new Promise((resolve) => {
    stream.on("data", async (keys: string[]) => {
      if (keys.length > 0) {
        const data = await redis!.get(keys[0]);
        if (data) {
          resolve(JSON.parse(data));
          stream.destroy();
          return;
        }
      }
    });
    stream.on("end", () => resolve(null));
  });
}

// Remove a specific session
export async function removeCachedSession(
  authId: string,
  refreshToken: string
): Promise<void> {
  if (!redis) return;
  await redis.del(`session:${authId}:${refreshToken}`);
}

// Remove all sessions for a user (logout all devices)
export async function removeAllCachedSessions(authId: string): Promise<void> {
  if (!redis) return;

  const stream = redis.scanStream({ match: `session:${authId}:*`, count: 100 });
  stream.on("data", async (keys: string[]) => {
    if (keys.length > 0) {
      await redis!.del(...keys);
    }
  });
}
```

**Why Redis for sessions?**
- JWT access tokens are stateless — you can't revoke them (they're valid until they expire)
- Refresh tokens need to be revocable (user logs out → delete the token)
- Redis is fast for key-value lookups and supports TTL (auto-expiry)

**Why SCAN instead of KEYS?** `KEYS` blocks Redis and scans the entire keyspace. `SCAN` iterates in batches, so it's safe for production.

---

## 4.6 Passport Strategy

Create `src/config/passport.ts`:

```typescript
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import argon2 from "argon2";
import { prisma } from "../database/prisma.js";

passport.use(
  new LocalStrategy(
    { usernameField: "email" }, // Use "email" field instead of default "username"
    async (email, password, done) => {
      try {
        // 1. Find user by email
        const auth = await prisma.authUser.findUnique({
          where: { email },
          include: { profile: true },
        });

        if (!auth) {
          return done(null, false, { message: "Incorrect email" });
        }

        // 2. Verify password
        if (!auth.passwordHash) {
          return done(null, false, { message: "Incorrect password" });
        }

        const isValid = await argon2.verify(auth.passwordHash, password);
        if (!isValid) {
          return done(null, false, { message: "Incorrect password" });
        }

        // 3. Check profile exists
        if (!auth.profile) {
          return done(null, false, { message: "User profile missing" });
        }

        // 4. Success — return the auth object
        return done(null, auth);
      } catch (error) {
        return done(error);
      }
    }
  )
);

export default passport;
```

**Passport's callback pattern:**
- `done(error)` — Something broke (database error)
- `done(null, false, { message })` — Auth failed (wrong password)
- `done(null, user)` — Auth succeeded

---

## 4.7 Auth Middleware

Create `src/middlewares/requireAuth.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Access token missing" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    req.authUser = payload;
    next();
  } catch {
    res.status(401).json({ message: "Access token expired or invalid" });
  }
}
```

**How it works:**
1. Client sends `Authorization: Bearer eyJhbGciOi...`
2. Middleware extracts the token after "Bearer "
3. `verifyAccessToken` decodes and validates it (checks signature + expiry)
4. If valid: sets `req.authUser` and continues
5. If invalid/expired: returns 401

---

## 4.8 Role & Permission Middlewares

Create `src/config/roles.ts`:

```typescript
// Define what each role can do
export const PERMISSIONS: Record<string, string[]> = {
  admin: ["curriculum:write", "grade:write", "subject:write", "chapter:write", "email:admin"],
  teacher: [],
  student: [],
};
```

Create `src/middlewares/requireRole.ts`:

```typescript
import { Request, Response, NextFunction } from "express";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser || !allowedRoles.includes(req.authUser.userType)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  };
}
```

Create `src/middlewares/requirePermission.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import { PERMISSIONS } from "../config/roles.js";

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userType = req.authUser?.userType;
    if (!userType || !PERMISSIONS[userType]?.includes(permission)) {
      res.status(403).json({ message: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}
```

**Role vs Permission:**
- `requireRole("admin")` — Only admins can access
- `requirePermission("curriculum:write")` — Anyone with the permission can access (currently only admin, but extensible)

Permissions are more flexible. If you later want teachers to manage grades, just add "grade:write" to the teacher role.

---

## 4.9 Auth Service

Create `src/modules/auth/service.ts`:

```typescript
import argon2 from "argon2";
import { prisma } from "../../database/prisma.js";
import { generateAccessToken } from "../../utils/jwt.js";
import {
  generateRefreshToken,
  getSessionExpiry,
  cacheSession,
  removeCachedSession,
  removeAllCachedSessions,
  getCachedSession,
  CachedSession,
} from "../../utils/session.js";
import { AppError } from "../../utils/errors.js";
import logger from "../../utils/logger.js";

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    authId: string;
    profileId: string;
    userType: string;
  };
}

// Helper: Create a session and return tokens
async function createSession(auth: any): Promise<AuthResult> {
  const refreshToken = generateRefreshToken();
  const expiresAt = getSessionExpiry();

  // Store session in database (persistent)
  const session = await prisma.session.create({
    data: {
      authId: auth.id,
      refreshToken,
      expiresAt,
    },
  });

  // Cache session in Redis (fast lookup)
  await cacheSession(auth.id, refreshToken, {
    id: session.id,
    authId: auth.id,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
    auth: {
      id: auth.id,
      email: auth.email,
      profile: auth.profile,
    },
  });

  // Generate JWT access token
  const accessToken = generateAccessToken({
    authId: auth.id,
    profileId: auth.profile.id,
    userType: auth.profile.userType,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      authId: auth.id,
      profileId: auth.profile.id,
      userType: auth.profile.userType,
    },
  };
}

// REGISTER
export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResult> {
  // Check if email already exists
  const existing = await prisma.authUser.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }

  // Hash password
  const passwordHash = await argon2.hash(password);

  // Create auth user + profile in a single transaction
  const auth = await prisma.authUser.create({
    data: {
      email,
      passwordHash,
      profile: {
        create: {
          fullName: name,
          email,
          userType: "student", // Default role
        },
      },
    },
    include: { profile: true },
  });

  // Update the profileId foreign key
  await prisma.authUser.update({
    where: { id: auth.id },
    data: { profileId: auth.profile!.id },
  });

  logger.info({ email }, "New user registered");

  // Queue welcome email here (added in guide 08)
  // await queueWelcomeEmail(email, name);

  return createSession(auth);
}

// LOGIN (called after Passport validates credentials)
export async function login(auth: any): Promise<AuthResult> {
  return createSession(auth);
}

// LOGOUT (single device)
export async function logout(refreshToken: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { refreshToken },
  });

  if (session) {
    await prisma.session.delete({ where: { id: session.id } });
    await removeCachedSession(session.authId, refreshToken);
  }
}

// LOGOUT ALL (all devices)
export async function logoutAll(authId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { authId } });
  await removeAllCachedSessions(authId);
}

// REFRESH TOKEN (rotate)
export async function rotateRefreshToken(
  oldRefreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // Find the existing session
  const session = await prisma.session.findUnique({
    where: { refreshToken: oldRefreshToken },
    include: { auth: { include: { profile: true } } },
  });

  if (!session) {
    throw new AppError(401, "Invalid refresh token");
  }

  if (session.expiresAt < new Date()) {
    // Token expired — delete it and reject
    await prisma.session.delete({ where: { id: session.id } });
    await removeCachedSession(session.authId, oldRefreshToken);
    throw new AppError(401, "Refresh token expired");
  }

  // Delete old session
  await prisma.session.delete({ where: { id: session.id } });
  await removeCachedSession(session.authId, oldRefreshToken);

  // Create new session with new refresh token
  const newRefreshToken = generateRefreshToken();
  const expiresAt = getSessionExpiry();

  const newSession = await prisma.session.create({
    data: {
      authId: session.authId,
      refreshToken: newRefreshToken,
      expiresAt,
    },
  });

  // Cache the new session
  await cacheSession(session.authId, newRefreshToken, {
    id: newSession.id,
    authId: session.authId,
    refreshToken: newRefreshToken,
    expiresAt: expiresAt.toISOString(),
    auth: {
      id: session.auth.id,
      email: session.auth.email,
      profile: session.auth.profile,
    },
  });

  // Generate new access token
  const accessToken = generateAccessToken({
    authId: session.auth.id,
    profileId: session.auth.profile!.id,
    userType: session.auth.profile!.userType,
  });

  return { accessToken, refreshToken: newRefreshToken };
}
```

---

## 4.10 Auth Routes

Create `src/modules/auth/routes.ts`:

```typescript
import { Router, Request, Response, NextFunction } from "express";
import passport from "../../config/passport.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import * as authService from "./service.js";

const router = Router();

// POST /auth/register
router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  const result = await authService.register(email, password, name);
  res.status(201).json({
    message: "Registration successful",
    ...result,
  });
});

// POST /auth/login
router.post("/login", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", { session: false }, async (err: Error, user: any, info: any) => {
    if (err) return next(err);
    if (!user) {
      res.status(401).json({ message: info?.message || "Login failed" });
      return;
    }

    const result = await authService.login(user);
    res.json({
      message: "Login successful",
      ...result,
    });
  })(req, res, next);
});

// POST /auth/logout
router.post("/logout", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: "Refresh token required" });
    return;
  }

  await authService.logout(refreshToken);
  res.json({ message: "Logged out successfully" });
});

// POST /auth/logout-all
router.post("/logout-all", requireAuth, async (req: Request, res: Response) => {
  await authService.logoutAll(req.authUser!.authId);
  res.json({ message: "Logged out from all devices" });
});

// POST /auth/refresh-token
router.post("/refresh-token", async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: "Refresh token required" });
    return;
  }

  const result = await authService.rotateRefreshToken(refreshToken);
  res.json(result);
});

export default router;
```

---

## 4.11 Mount Auth Routes

In `src/app.ts`, add:

```typescript
import passport from "./config/passport.js";
import authRoutes from "./modules/auth/routes.js";

// After other middleware:
app.use(passport.initialize());

// Mount routes:
app.use("/api/v1/auth", authRoutes);
```

---

## 4.12 Test the Auth Flow

```bash
npm run dev
```

```bash
# Register
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test User"}'

# Login
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# Use the accessToken from login response:
curl http://localhost:4000/api/v1/curriculums \
  -H "Authorization: Bearer <your-access-token>"

# Refresh (use refreshToken from login response):
curl -X POST http://localhost:4000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'
```

---

## Checkpoint

- [x] JWT access tokens (30-min expiry)
- [x] Refresh token rotation (30-day expiry)
- [x] Password hashing with argon2
- [x] Passport local strategy
- [x] Redis session caching
- [x] requireAuth middleware
- [x] requireRole and requirePermission middlewares
- [x] RBAC: admin, teacher, student roles
- [x] 5 auth endpoints: register, login, logout, logout-all, refresh-token

**Commit:** `git commit -m "add authentication with JWT, refresh tokens, argon2, RBAC"`

---

## Key Concepts to Understand

1. **JWT (JSON Web Tokens)** — Read: https://jwt.io/introduction
2. **Refresh token rotation** — Read: https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
3. **argon2 password hashing** — Read: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
4. **Passport.js strategies** — Read: https://www.passportjs.org/concepts/authentication/strategies/
5. **Stateless vs stateful auth** — JWT is stateless (no server lookup needed for access tokens), but refresh tokens are stateful (stored in DB/Redis for revocation)
