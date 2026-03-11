# 05 — JWT (JSON Web Tokens)

## What is a JWT?

A JWT (JSON Web Token) is a compact, self-contained way to represent user identity. It is a string you can generate on the server, send to the client, and then verify later without hitting the database.

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsInVzZXJUeXBlIjoic3R1ZGVudCIsImV4cCI6MTcxNTAwMDAwMH0.abc123signature
```

A JWT has three parts separated by dots:

```
HEADER.PAYLOAD.SIGNATURE

HEADER    → { alg: "HS256", typ: "JWT" }     (base64url encoded)
PAYLOAD   → { sub: "user_123", exp: 1715... } (base64url encoded)
SIGNATURE → HMAC(header + "." + payload, secret)
```

The signature is generated using a **secret key** only the server knows. This makes it impossible to forge or tamper with a token without knowing the secret.

---

## How JWTs enable stateless auth

**Traditional session-based auth:**
```
1. User logs in → server creates session in DB → sends session ID cookie
2. Every request → server looks up session ID in DB → is it valid?
```
Problem: every request hits the database. Doesn't scale.

**JWT-based auth (this project):**
```
1. User logs in → server signs a JWT with user data → sends it back
2. Every request → server verifies the JWT signature → no DB needed
```
The server trusts the token because only it could have signed it.

---

## How this project uses JWT

The JWT logic is in [`src/utils/jwt.ts`](../src/utils/jwt.ts):

```ts
import jwt from "jsonwebtoken";
import type { JwtUserPayload } from "../types/jwt.js";

const ACCESS_TOKEN_EXPIRES_IN = "30m";

// Called after login — creates a new access token
export function generateAccessToken(params: JwtUserPayload) {
  return jwt.sign(
    {
      sub: params.authId,        // "sub" = subject (the user's ID)
      profileId: params.profileId,
      userType: params.userType,
    },
    process.env.JWT_SECRET!,     // ← secret key from environment
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN } // ← expires in 30 minutes
  );
}

// Called on every protected request — verifies the token
export function verifyAccessToken(token: string): JwtUserPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  return {
    authId: payload.sub as string,
    profileId: payload.profileId as string,
    userType: payload.userType as string,
  };
}
```

The `requireAuth` middleware in [`src/middlewares/requireAuth.ts`](../src/middlewares/requireAuth.ts) protects every route:

```ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing access token" });
  }

  const token = authHeader.split(" ")[1]; // "Bearer <token>" → "<token>"

  try {
    req.authUser = verifyAccessToken(token); // puts user data on the request
    next();
  } catch {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }
}
```

Socket.io also validates JWTs — from [`src/server.ts`](../src/server.ts):

```ts
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Missing access token"));

  try {
    socket.data.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
});
```

---

## The access token + refresh token pattern

Access tokens are short-lived (30 minutes in this project). If they were permanent, a stolen token could be abused indefinitely.

```
ACCESS TOKEN   → short-lived (30m), sent with every request
REFRESH TOKEN  → long-lived (30 days), stored in DB, used only to get new access tokens
```

Flow:
```
1. Login → server issues both tokens
2. Client uses access token for every API call
3. After 30 min, access token expires → 401 response
4. Client sends refresh token to /auth/refresh-token
5. Server checks refresh token in DB → issues new access token
6. If refresh token is also expired → force re-login
```

This way, even if an access token is stolen, it only works for at most 30 minutes.

---

## Step-by-step practice

**Task 1 — Sign and decode a token manually**

```ts
import jwt from "jsonwebtoken";

const SECRET = "my-super-secret-key-change-this-in-production";

// Sign a token
const token = jwt.sign(
  { sub: "user_123", role: "admin" },
  SECRET,
  { expiresIn: "1h" }
);
console.log("Token:", token);

// Decode without verifying (just to see the payload — NOT SAFE)
const decoded = jwt.decode(token);
console.log("Decoded:", decoded);

// Verify (safe)
try {
  const payload = jwt.verify(token, SECRET);
  console.log("Verified:", payload);
} catch (err) {
  console.log("Invalid:", err.message);
}
```

**Task 2 — Test token tampering**

```ts
// Take the token from Task 1 and change one character in the payload part
const [header, payload, signature] = token.split(".");
const tamperedToken = `${header}.TAMPERED${payload}.${signature}`;

try {
  jwt.verify(tamperedToken, SECRET);
} catch (err) {
  console.log("Caught tampering:", err.message);
  // "invalid signature"
}
```

**Task 3 — Test an expired token**

```ts
const shortToken = jwt.sign({ sub: "user_123" }, SECRET, { expiresIn: "1s" });

await new Promise((resolve) => setTimeout(resolve, 1500)); // wait 1.5 seconds

try {
  jwt.verify(shortToken, SECRET);
} catch (err) {
  console.log("Expired:", err.message);
  // "jwt expired"
}
```

**Task 4 — Build an Express route that issues and verifies a JWT**

```ts
import express from "express";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const SECRET = "dev-secret";

// Login — issue a token
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (email === "admin@test.com" && password === "password") {
    const token = jwt.sign({ sub: "user_1", role: "admin" }, SECRET, { expiresIn: "1h" });
    return res.json({ token });
  }
  res.status(401).json({ message: "Invalid credentials" });
});

// Protected route — requires valid token
app.get("/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  try {
    const payload = jwt.verify(auth.split(" ")[1], SECRET);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

app.listen(3001);
```

Test:
```bash
# Get token
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password"}'

# Use token
curl http://localhost:3001/me \
  -H "Authorization: Bearer <paste-token-here>"
```

---

## Key takeaways

- A JWT is a signed token containing user data — the server can verify it without a DB lookup
- It has 3 parts: header, payload, signature — the signature proves it wasn't tampered with
- Access tokens are short-lived (30m); refresh tokens are long-lived (30d) and stored in the DB
- `jwt.sign()` creates a token; `jwt.verify()` validates it and returns the payload
- Never store sensitive data in the payload — it is base64 encoded, not encrypted (anyone can decode it)
- The secret key must be long, random, and kept private in environment variables
