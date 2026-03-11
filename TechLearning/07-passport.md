# 07 — Passport.js

## What is Passport?

Passport is an **authentication middleware** for Express. It provides a plug-and-play system of **strategies** — each strategy handles a different way of authenticating a user.

```
Passport strategies:
  passport-local    → email + password (this project)
  passport-google   → Google OAuth
  passport-github   → GitHub OAuth
  passport-jwt      → JWT token auth
  (100+ more)
```

The idea: your Express app does not care *how* the user authenticated. Passport normalizes it into a consistent interface.

---

## How this project uses Passport

This project uses only **passport-local** for email + password authentication.

The strategy is configured in [`src/config/passport.ts`](../src/config/passport.ts):

```ts
import argon2 from "argon2";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { prisma } from "../database/prisma.js";

passport.use(
  new LocalStrategy(
    { usernameField: "email" }, // ← tell passport to use "email" not "username"
    async (email, password, done) => {
      try {
        // Step 1: Find user in the database
        const auth = await prisma.authUser.findUnique({
          where: { email },
          include: { profile: true },
        });

        if (!auth) {
          return done(null, false, { message: "Incorrect email" });
          // done(error, user, info)
          // null = no error, false = auth failed, info = reason
        }

        // Step 2: Check password
        const match = await argon2.verify(auth.passwordHash!, password);
        if (!match) {
          return done(null, false, { message: "Incorrect password" });
        }

        if (!auth.profile) {
          return done(null, false, { message: "User profile missing" });
        }

        // Step 3: Authentication succeeded
        return done(null, auth); // null = no error, auth = authenticated user
      } catch (err) {
        return done(err); // unexpected error
      }
    }
  )
);

export default passport;
```

Passport is then initialized as middleware in [`src/app.ts`](../src/app.ts):

```ts
app.use(passport.initialize());
```

And used in the login route:

```ts
// In auth routes
router.post(
  "/auth/login",
  authLimiter,
  validate({ body: loginBody }),
  passport.authenticate("local", { session: false }), // ← triggers the strategy
  loginController
);
```

When `passport.authenticate("local", { session: false })` runs:
1. It reads `req.body.email` and `req.body.password`
2. Passes them to the LocalStrategy callback
3. If `done(null, user)` is called → sets `req.user = user` and calls `next()`
4. If `done(null, false, info)` is called → returns 401

---

## The `done` callback pattern

Every Passport strategy uses `done(error, user, info)`:

```ts
done(null, false, { message: "Incorrect email" })
// └─────  └─────  └── reason for failure (optional)
//  no error  auth failed

done(null, auth)
// └─────  └── the authenticated user object
//  no error  auth succeeded

done(err)
// └── unexpected error → results in 500
```

---

## Why use Passport instead of writing auth manually?

You *could* write authentication logic directly in your route handler. Passport adds value when:

1. **Consistency** — all auth flows (local, OAuth, JWT) share the same interface
2. **Extensibility** — adding Google OAuth later means adding one strategy, not rewriting auth logic
3. **Separation of concerns** — the strategy knows *how* to authenticate; the route handler just calls `.authenticate()`

For small projects with only local auth, Passport is optional. This project uses it as good practice for when multiple strategies are needed.

---

## Step-by-step practice

**Task 1 — Replicate the strategy with a mock database**

```ts
import express from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import argon2 from "argon2";

const app = express();
app.use(express.json());
app.use(passport.initialize());

// Mock user database
const users = [
  {
    id: "1",
    email: "admin@test.com",
    passwordHash: await argon2.hash("password123"),
  },
];

// Configure the strategy
passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      const user = users.find((u) => u.email === email);

      if (!user) {
        return done(null, false, { message: "Email not found" });
      }

      const match = await argon2.verify(user.passwordHash, password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }

      return done(null, user);
    }
  )
);

// Login route
app.post(
  "/login",
  passport.authenticate("local", { session: false }),
  (req, res) => {
    // req.user is set by passport
    res.json({ message: "Logged in", user: req.user });
  }
);

app.listen(3001);
```

Test:
```bash
# Valid credentials
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}'

# Invalid credentials
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"wrong"}'
```

**Task 2 — Handle auth failures with a custom callback**

The default behavior on failure is to return `401 Unauthorized`. You can customize this:

```ts
app.post("/login", (req, res, next) => {
  passport.authenticate("local", { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ message: info?.message || "Auth failed" });
    }
    // User authenticated — issue JWT
    res.json({ message: "Logged in", userId: user.id });
  })(req, res, next);
});
```

This pattern gives you full control over the response.

---

## Key takeaways

- Passport standardizes authentication across different strategies
- `passport-local` handles email + password login
- The `done(error, user, info)` callback signals the result to Passport
- `passport.authenticate("local", { session: false })` runs the strategy and sets `req.user`
- `{ session: false }` is important here — this project uses JWT, not server-side sessions
- Adding a new auth method (Google, GitHub) means adding a strategy, not changing existing routes
