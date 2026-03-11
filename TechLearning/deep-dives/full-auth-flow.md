# Deep Dive — Full Auth Flow

> Files involved:
> - `src/modules/auth/routes.ts`
> - `src/modules/auth/service.ts`
> - `src/config/passport.ts`
> - `src/utils/jwt.ts`
> - `src/utils/session.ts`
> - `src/utils/errors.ts`

---

## The big picture first

This project uses a **dual-token auth system**:

```
ACCESS TOKEN   → short-lived (30 minutes), sent with every API request
REFRESH TOKEN  → long-lived (30 days), stored in an HttpOnly cookie, used only to renew the access token
```

Why two tokens?

```
If access tokens were permanent:
  Attacker steals token → can use it forever

With 30-minute access tokens:
  Attacker steals token → can only use it for up to 30 minutes

With refresh tokens (30 days, stored in HttpOnly cookie):
  JavaScript cannot read the cookie (httpOnly) → XSS attacks cannot steal it
  After 30 days → user must log in again
```

The five endpoints:

```
POST /auth/register       → create account, issue both tokens
POST /auth/login          → verify credentials, issue both tokens
POST /auth/refresh-token  → exchange old refresh token for new tokens
POST /auth/logout         → delete session, clear cookies
POST /auth/logout-all     → delete ALL sessions (all devices), clear cookies
```

---

## The two-table database design

Before reading the code, understand the data model:

```
Table: auth (AuthUser)               Table: profiles
┌──────────────────────────────┐     ┌───────────────────────────────┐
│ id           (UUID, PK)      │     │ id           (UUID, PK)        │
│ email        (unique)        │────▶│ fullName                       │
│ passwordHash                 │     │ email                          │
│ isActive     (bool)          │     │ userType     (student/admin)   │
│ profileId    (FK → profiles) │     └───────────────────────────────┘
└──────────────────────────────┘
          │
          │ one auth → many sessions
          ▼
Table: sessions
┌──────────────────────────────┐
│ id           (UUID, PK)      │
│ authId       (FK → auth)     │
│ refreshToken (unique, 128chr)│
│ expiresAt    (timestamp)     │
│ ipAddress                    │
│ userAgent                    │
└──────────────────────────────┘
```

Why separate `auth` and `profiles`?

- `auth` holds credentials (email, passwordHash) — security-sensitive
- `profiles` holds user data (name, role) — safe to expose in API responses
- One user can theoretically have multiple profiles in the future (student + teacher)
- Separation of concerns — auth logic never needs to know about `fullName`

Why a `sessions` table?

- Tracks every active login — "user is logged in from iPhone and MacBook"
- Lets users log out from a specific device or all devices
- Stores the refresh token — server can invalidate it by deleting the row

---

## AppError — how errors work

```ts
// src/utils/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

`AppError` is a custom error class. It carries an HTTP status code alongside the message. It is thrown from services like this:

```ts
throw new AppError(400, "Email already exists");
throw new AppError(401, "Refresh token expired");
throw new AppError(403, "User profile missing");
```

The global error handler in `app.ts` catches it:

```ts
app.use((err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  // Not an AppError → 500
  return res.status(500).json({ error: "Internal Server Error" });
});
```

This pattern means: services throw `AppError` for known business failures. The error handler converts them to HTTP responses. Controllers never need `if/else` for error responses — they just call `next(err)`.

---

## Flow 1 — REGISTER

### Route definition

```ts
// src/modules/auth/routes.ts
router.post(
  "/auth/register",
  authLimiter,                   // max 20 requests per 15 min
  validate({ body: registerBody }), // validates email, password, name
  async (req, res, next) => {
    try {
      const { email, password, name } = req.body;
      const { accessToken, refreshToken, user } = await authService.register(
        email, password, name, req.ip, req.headers["user-agent"]
      );
      setAuthCookies(res, refreshToken);
      return res.status(201).json({ message: "Registered & logged in", accessToken, user });
    } catch (err) {
      return next(err); // AppError → global handler → 400/401/etc
    }
  }
);
```

`req.ip` and `req.headers["user-agent"]` are passed to the service so the session can record where the login came from. Useful for "active sessions" features.

### The `registerBody` schema

```ts
// src/modules/auth/schemas.ts
export const registerBody = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name is required"),
});
```

Validation gate — invalid data never reaches `authService.register`.

### Inside `authService.register`

```ts
// src/modules/auth/service.ts
async function register(email, password, name, ip, userAgent): Promise<AuthResult> {

  // Step 1: Check if email is already taken
  const existing = await prisma.authUser.findUnique({ where: { email } });
  if (existing) throw new AppError(400, "Email already exists");
  //            ↑ throws → caught in route → next(err) → global handler → HTTP 400

  // Step 2: Hash the password (takes ~500ms intentionally)
  const passwordHash = await argon2.hash(password);

  // Step 3: Generate UUID for the profile
  const profileId = crypto.randomUUID();

  // Step 4: Create auth + profile in a single transaction
  const auth = await prisma.authUser.create({
    data: {
      email,
      passwordHash,
      isActive: true,
      profile: {
        create: {            // ← Prisma nested create — creates both rows atomically
          id: profileId,
          fullName: name,
          email,
          gender: "unspecified",
          userType: ROLES.student,
        },
      },
    },
    include: { profile: true }, // ← returns the created profile in the same query
  });

  // Step 5: Create session (DB row + Redis cache) and generate tokens
  const result = await createSession(auth, ip, userAgent);

  // Step 6: Queue a welcome email (fire and forget — don't await)
  queueWelcomeEmail(email, name).catch(() => {});
  // .catch(() => {}) ensures email failure never crashes registration

  return result;
}
```

### The Prisma nested create — atomic operation

```ts
prisma.authUser.create({
  data: {
    email,
    passwordHash,
    profile: {
      create: { ... }  // ← creates the profile row in the same transaction
    },
  },
})
```

This is equivalent to:
```sql
BEGIN;
  INSERT INTO auth (email, password_hash, ...) VALUES (...);
  INSERT INTO profiles (full_name, email, user_type, ...) VALUES (...);
COMMIT;
```

If the profile insert fails, the auth row is also rolled back. You never end up with a user who has an `auth` row but no `profile`.

### Inside `createSession`

```ts
async function createSession(auth, ip, userAgent): Promise<AuthResult> {

  // Step 1: Generate a cryptographically secure refresh token
  const refreshToken = generateRefreshToken();
  // crypto.randomBytes(64).toString("hex") → 128-character hex string
  // completely random, impossible to guess

  // Step 2: Calculate expiry (30 days from now)
  const expiresAt = getSessionExpiry(30);

  // Step 3: Persist session to PostgreSQL
  const session = await prisma.session.create({
    data: {
      authId: auth.id,
      refreshToken,       // stored as-is (not hashed — it's already random enough)
      expiresAt,
      ipAddress: ip,
      userAgent,
    },
  });

  // Step 4: Cache session data in Redis for fast lookup
  await cacheSession(auth.id, refreshToken, {
    id: session.id,
    authId: auth.id,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
    auth: {
      id: auth.id,
      profile: { id, fullName, email, userType },
    },
  });
  // Redis key: "session:uuid-123:abc...refreshtoken...def"
  // TTL: 30 days

  // Step 5: Generate the access token (JWT, 30 minutes)
  const accessToken = generateAccessToken({
    authId: auth.id,
    profileId: auth.profile.id,
    userType: auth.profile.userType,
  });

  return { accessToken, refreshToken, user: { id, name, email, role } };
}
```

### `generateRefreshToken` — what it produces

```ts
// src/utils/session.ts
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}
```

`crypto.randomBytes(64)` generates 64 random bytes from the OS's cryptographically secure random number generator. `.toString("hex")` converts those bytes to a 128-character hexadecimal string.

```
Example output:
"a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3"
```

This is practically impossible to brute-force. There are `2^512` possible values — more atoms than in the observable universe.

### `generateAccessToken` — what it produces

```ts
// src/utils/jwt.ts
export function generateAccessToken(params: JwtUserPayload) {
  return jwt.sign(
    {
      sub: params.authId,       // "subject" — the user's auth ID
      profileId: params.profileId,
      userType: params.userType,
    },
    process.env.JWT_SECRET!,    // secret key from .env
    { expiresIn: "30m" }        // expires in 30 minutes
  );
}
```

Produces a JWT like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1dWlkLTEyMyIsInByb2ZpbGVJZCI6InByb2ZpbGUtNDU2IiwidXNlclR5cGUiOiJzdHVkZW50IiwiZXhwIjoxNzE1MDAwMDAwfQ.SIGNATURE
```

Decoded payload:
```json
{
  "sub": "uuid-123",
  "profileId": "profile-456",
  "userType": "student",
  "exp": 1715000000,
  "iat": 1714998200
}
```

### `setAuthCookies` — back in the route

```ts
function setAuthCookies(res: Response, refreshToken: string) {
  // Cookie 1: the refresh token — HttpOnly (JS cannot read it)
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,        // ← JS cannot access via document.cookie
    secure: IS_PRODUCTION, // ← only sent over HTTPS in production
    sameSite: "strict",    // ← only sent for same-site requests (CSRF protection)
    path: "/api/v1/auth",  // ← only sent when URL starts with /api/v1/auth
    maxAge: REFRESH_TOKEN_MAX_AGE, // 30 days in milliseconds
  });

  // Cookie 2: a flag that frontend JS CAN read — tells it "user is logged in"
  res.cookie("is_authenticated", "true", {
    httpOnly: false,       // ← JS CAN read this one
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/",             // ← available everywhere
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}
```

Two cookies, two purposes:

| Cookie | `httpOnly` | Purpose |
|---|---|---|
| `refreshToken` | `true` | The actual secret — JS cannot steal it |
| `is_authenticated` | `false` | Frontend reads this to know if user is logged in |

`path: "/api/v1/auth"` on the `refreshToken` cookie is critical. The cookie is only attached to requests going to `/api/v1/auth/*`. This means it never gets sent to `/api/v1/curriculums` — even if those routes somehow tried to use it.

### Final response to the client

```json
HTTP 201 Created
Set-Cookie: refreshToken=a3f8b2...; HttpOnly; Path=/api/v1/auth; Max-Age=2592000
Set-Cookie: is_authenticated=true; Path=/; Max-Age=2592000

{
  "message": "Registered & logged in",
  "accessToken": "eyJhbGci...",
  "user": {
    "id": "profile-uuid-456",
    "name": "Alice",
    "email": "alice@example.com",
    "role": "student"
  }
}
```

The frontend stores `accessToken` in memory (a variable) — not localStorage (XSS vulnerable), not a cookie (CSRF vulnerable). It sends it as `Authorization: Bearer <token>` on every subsequent request.

---

## Flow 2 — LOGIN

### Route definition

```ts
router.post(
  "/auth/login",
  authLimiter,
  validate({ body: loginBody }),
  (req, res, next) => {
    // Custom passport callback — gives us full control over the response
    passport.authenticate("local", async (err, auth, info) => {
      if (err) return next(err);          // unexpected error → 500
      if (!auth) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      //         ↑ auth is false → passport strategy returned done(null, false)

      try {
        const { accessToken, refreshToken, user } = await authService.login(
          auth, req.ip, req.headers["user-agent"]
        );
        setAuthCookies(res, refreshToken);
        return res.json({ message: "Login successful", accessToken, user });
      } catch (error) {
        return next(error);
      }
    })(req, res, next); // ← immediately invoke — this is the IIFE pattern for passport
  }
);
```

### Inside passport's LocalStrategy

```ts
// src/config/passport.ts
passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      // Step 1: Find the user
      const auth = await prisma.authUser.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (!auth) {
        return done(null, false, { message: "Incorrect email" });
        // null = no error, false = auth failed, info = reason for frontend
      }

      // Step 2: Verify the password against the stored hash
      const match = await argon2.verify(auth.passwordHash!, password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }

      if (!auth.profile) {
        return done(null, false, { message: "User profile missing" });
      }

      // Step 3: All good — return the full auth object
      return done(null, auth);
      // null = no error, auth = the authenticated user → becomes the second arg in the callback
    } catch (err) {
      return done(err); // unexpected crash → becomes first arg (err) in callback
    }
  })
);
```

### `authService.login` — just calls `createSession`

```ts
async function login(auth, ip, userAgent): Promise<AuthResult> {
  return createSession(auth, ip, userAgent);
}
```

Login and register end at the same place — `createSession`. The difference is register also creates the user first.

---

## Flow 3 — USING THE ACCESS TOKEN (every API request)

After login, the frontend sends the access token with every request:

```
GET /api/v1/curriculums
Authorization: Bearer eyJhbGci...
```

The `requireAuth` middleware verifies it:

```ts
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing access token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    req.authUser = verifyAccessToken(token);
    // verifyAccessToken:
    //   jwt.verify(token, process.env.JWT_SECRET!)
    //   → throws if expired, tampered, wrong secret
    //   → returns payload: { authId, profileId, userType }
    next();
  } catch {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }
}
```

**No database hit.** The JWT signature proves the token was issued by this server. Identity is verified in microseconds.

---

## Flow 4 — REFRESH TOKEN ROTATION

After 30 minutes, the access token expires. The frontend gets a `401`. Instead of forcing a re-login, it silently calls `POST /auth/refresh-token`.

```ts
router.post(
  "/auth/refresh-token",
  refreshLimiter,          // 30 attempts per 15 minutes
  async (req, res, next) => {
    try {
      // The refresh token is read from the HttpOnly cookie
      // (Browser sends it automatically — frontend never touches it)
      const refreshToken = req.cookies.refreshToken as string | undefined;

      if (!refreshToken) {
        clearAuthCookies(res);
        return res.status(401).json({ message: "Refresh token missing" });
      }

      const { accessToken, refreshToken: newRefreshToken, user }
        = await authService.rotateRefreshToken(refreshToken);

      setAuthCookies(res, newRefreshToken); // sets NEW refresh token cookie
      return res.json({ accessToken, user });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 401) {
        clearAuthCookies(res);             // clear cookies on auth failure
        return res.status(401).json({ message: err.message });
      }
      return next(err);
    }
  }
);
```

### Inside `authService.rotateRefreshToken`

This is the most complex function. Read carefully:

```ts
async function rotateRefreshToken(token: string): Promise<AuthResult> {

  // Step 1: Try Redis cache first (fast — microseconds)
  let sessionData = await getCachedSession(token);

  // Step 2: Cache miss → fall back to PostgreSQL (slower — milliseconds)
  if (!sessionData) {
    const dbSession = await prisma.session.findUnique({
      where: { refreshToken: token },
      include: { auth: { include: { profile: true } } },
    });

    if (!dbSession?.auth?.profile) throw new AppError(401, "Invalid refresh token");
    // Token not found in DB either → it was already used, expired, or forged

    // Reconstruct the session data shape from DB
    sessionData = { id: dbSession.id, authId: ..., ... };
  }

  // Step 3: Check if expired (belt-and-suspenders check)
  if (new Date(sessionData.expiresAt) < new Date()) {
    await prisma.session.delete({ where: { id: sessionData.id } });
    await removeCachedSession(sessionData.authId, token);
    throw new AppError(401, "Refresh token expired");
    // Force re-login
  }

  // Step 4: Generate new tokens
  const newRefreshToken = generateRefreshToken();  // new 128-char random string
  const newExpiry = getSessionExpiry(30);          // 30 days from now

  // Step 5: Update the session in PostgreSQL (old token → new token)
  await prisma.session.update({
    where: { id: sessionData.id },
    data: { refreshToken: newRefreshToken, expiresAt: newExpiry },
  });

  // Step 6: Remove old session from Redis
  await removeCachedSession(sessionData.authId, token);

  // Step 7: Cache the new session in Redis
  await cacheSession(sessionData.authId, newRefreshToken, {
    ...sessionData,
    refreshToken: newRefreshToken,
    expiresAt: newExpiry.toISOString(),
  });

  // Step 8: Generate new access token (30-minute JWT)
  const accessToken = generateAccessToken({
    authId: sessionData.auth.id,
    profileId: sessionData.auth.profile.id,
    userType: sessionData.auth.profile.userType,
  });

  return { accessToken, refreshToken: newRefreshToken, user: { ... } };
}
```

### Token rotation — why the old token is replaced

Each time a refresh happens, the refresh token itself is **replaced**:

```
Login:          refreshToken = "abc..."   (stored in cookie + DB)
After 30 min:   POST /auth/refresh-token
                old token "abc..." → deleted
                new token "xyz..." → stored in cookie + DB
After 30 min:   POST /auth/refresh-token
                old token "xyz..." → deleted
                new token "mno..." → stored in cookie + DB
```

This is called **refresh token rotation**. The benefit: if an attacker steals a refresh token, they can only use it once — the next legitimate refresh will invalidate it and the attacker's stolen copy becomes useless.

### Redis + PostgreSQL — two-layer session storage

```
When rotateRefreshToken is called:

  1. Check Redis first:
     GET session:uuid-123:abc...token...def
     → if found: use it (no DB hit)

  2. Redis miss → check PostgreSQL:
     SELECT * FROM sessions WHERE refresh_token = 'abc...'
     → if found: use it, cache it in Redis

  3. If found in neither:
     → token is invalid → throw AppError(401)
```

Why store sessions in both Redis and PostgreSQL?

| | PostgreSQL | Redis |
|---|---|---|
| Durability | Survives server restart | Lost on Redis restart (unless configured) |
| Speed | ~5–20ms | ~0.1ms |
| Purpose | Source of truth | Fast cache |

PostgreSQL is the source of truth. Redis is just a performance optimization.

---

## Flow 5 — LOGOUT

```ts
router.post("/auth/logout", async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken as string | undefined;

    if (refreshToken) await authService.logout(refreshToken);
    // ↑ only delete if we have a token — graceful if cookie is already missing

    clearAuthCookies(res);
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
});
```

```ts
async function logout(refreshToken: string): Promise<void> {
  // Find and delete the session from PostgreSQL
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  await prisma.session.deleteMany({ where: { refreshToken } });

  // Remove from Redis cache
  if (session) await removeCachedSession(session.authId, refreshToken);
}
```

```ts
function clearAuthCookies(res: Response) {
  res.clearCookie("refreshToken", {
    httpOnly: true, secure: IS_PRODUCTION, sameSite: "strict", path: "/api/v1/auth",
  });
  res.clearCookie("is_authenticated", {
    httpOnly: false, secure: IS_PRODUCTION, sameSite: "strict", path: "/",
  });
}
```

`clearCookie` tells the browser to delete the cookie by setting its `maxAge` to 0. The options must match exactly what was used in `setAuthCookies` — if the `path` doesn't match, the browser won't delete it.

## Flow 6 — LOGOUT ALL DEVICES

```ts
router.post(
  "/auth/logout-all",
  requireAuth,                              // must be authenticated to call this
  async (req, res, next) => {
    try {
      await authService.logoutAll(req.authUser!.authId); // authId from JWT
      clearAuthCookies(res);
      return res.json({ message: "Logged out from all devices" });
    } catch (err) {
      return next(err);
    }
  }
);
```

```ts
async function logoutAll(authId: string): Promise<void> {
  // Delete ALL sessions for this user from PostgreSQL
  await prisma.session.deleteMany({ where: { authId } });

  // Delete ALL cached sessions from Redis
  await removeAllCachedSessions(authId);
  // scans "session:authId:*" and deletes all matching keys
}
```

`logoutAll` uses the `authId` from the JWT (set by `requireAuth` → `req.authUser.authId`). The DB deletes every session row for that user. Every device that tries to refresh will get `401 Invalid refresh token` because their tokens no longer exist in the DB.

---

## The complete picture — all flows together

```
                    REGISTER
Client ──────────────────────────────────────────────────────────────▶ Server
  POST /auth/register { email, password, name }
                                                authLimiter (20 req/15min)
                                                validate body (Zod)
                                                authService.register():
                                                  check email uniqueness
                                                  argon2.hash(password)
                                                  prisma.authUser.create() + profile.create() (atomic)
                                                  prisma.session.create()
                                                  cacheSession() in Redis
                                                  generateAccessToken() (JWT 30min)
                                                  queueWelcomeEmail() (BullMQ)
                                                setAuthCookies() (refreshToken + is_authenticated)
Client ◀──────────────────────────────────────────────────────────────
  201 { accessToken, user }
  Set-Cookie: refreshToken=abc... (HttpOnly)
  Set-Cookie: is_authenticated=true


                    EVERY API CALL (next 30 minutes)
Client ──────────────────────────────────────────────────────────────▶ Server
  GET /api/v1/curriculums
  Authorization: Bearer eyJhbGci...
                                                requireAuth():
                                                  jwt.verify(token, JWT_SECRET)
                                                  req.authUser = { authId, profileId, userType }
                                                  next()  [no DB hit]
                                                curriculumsController runs
Client ◀──────────────────────────────────────────────────────────────
  200 { data: [...] }


                    REFRESH (after 30 minutes)
Client ──────────────────────────────────────────────────────────────▶ Server
  POST /auth/refresh-token
  Cookie: refreshToken=abc...   (sent automatically by browser)
                                                refreshLimiter (30 req/15min)
                                                req.cookies.refreshToken = "abc..."
                                                authService.rotateRefreshToken("abc..."):
                                                  getCachedSession() from Redis  [fast]
                                                  OR findUnique() from PostgreSQL [fallback]
                                                  check expiresAt > now
                                                  generateRefreshToken() → "xyz..."
                                                  prisma.session.update() (old → new)
                                                  removeCachedSession("abc...")
                                                  cacheSession("xyz...")
                                                  generateAccessToken() (new JWT 30min)
                                                setAuthCookies() (new cookie)
Client ◀──────────────────────────────────────────────────────────────
  200 { accessToken: "new JWT...", user }
  Set-Cookie: refreshToken=xyz... (new token — old one deleted)


                    LOGOUT
Client ──────────────────────────────────────────────────────────────▶ Server
  POST /auth/logout
  Cookie: refreshToken=xyz...
                                                authService.logout("xyz..."):
                                                  prisma.session.deleteMany()
                                                  removeCachedSession()
                                                clearAuthCookies()
Client ◀──────────────────────────────────────────────────────────────
  200 { message: "Logged out successfully" }
  Set-Cookie: refreshToken=; MaxAge=0  (deleted)
  Set-Cookie: is_authenticated=; MaxAge=0 (deleted)
```

---

## Step-by-step practice tasks

**Task 1 — Trace a register request manually**

Using curl or Postman:
```bash
# Register a new user
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"secret123","name":"Alice"}'

# Look at the response:
# - accessToken in the body
# - is_authenticated cookie readable
# - refreshToken cookie: should be HttpOnly (not readable by JS)
```

**Task 2 — Use the access token**

```bash
# Save the accessToken from Task 1
ACCESS_TOKEN="eyJhbGci..."

# Call a protected route
curl http://localhost:4000/api/v1/curriculums \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Try without the token — should get 401
curl http://localhost:4000/api/v1/curriculums
```

**Task 3 — Observe token rotation**

```bash
# Refresh — uses the cookie saved in cookies.txt
curl -X POST http://localhost:4000/api/v1/auth/refresh-token \
  -b cookies.txt \
  -c cookies.txt

# Inspect cookies.txt before and after — the refreshToken value changes
cat cookies.txt
```

**Task 4 — Trigger each error case**

```bash
# Duplicate email
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123","name":"Alice"}'
# → 400 "Email already exists"

# Wrong password
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'
# → 401 "Incorrect password"

# Expired/invalid refresh token
curl -X POST http://localhost:4000/api/v1/auth/refresh-token \
  -H "Cookie: refreshToken=fakeinvalidtoken123"
# → 401 "Invalid refresh token"

# Missing Content-Type header
curl -X POST http://localhost:4000/api/v1/auth/login \
  -d '{"email":"test@example.com","password":"secret123"}'
# → 400 "Request body is missing. Ensure Content-Type: application/json is set."
```

**Task 5 — Understand what's in the database after register**

```bash
npx prisma studio
```

Open the `sessions` table — you should see your session row with:
- `authId` matching the `auth` table
- `refreshToken` as a 128-character hex string
- `expiresAt` 30 days in the future
- `ipAddress` and `userAgent` from your request

---

## Key takeaways

| Concept | How it works in this project |
|---|---|
| **Two tokens** | accessToken (30min JWT in memory), refreshToken (30d random string in HttpOnly cookie) |
| **HttpOnly cookie** | Browser sends it automatically, JS cannot read it — XSS-safe |
| **Token rotation** | Every refresh replaces the old token — stolen tokens become useless |
| **Argon2** | Password never stored plain — stored as a slow, salted hash |
| **Passport** | Handles email+password verification — returns `auth` object to the route |
| **Prisma nested create** | `auth` + `profile` created atomically — no partial state |
| **AppError** | Services throw it → routes catch it → global handler sends HTTP response |
| **Redis sessions** | Fast cache for refresh token lookups — PostgreSQL is the source of truth |
| **Two session tables** | Redis for speed, PostgreSQL for durability |
| **logout-all** | Deletes all session rows for the user — all devices force re-login |
