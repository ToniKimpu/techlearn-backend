# 02 — Express.js

## What is Express?

Express is a minimal web framework for Node.js. It does one job well: take an incoming HTTP request, pass it through a chain of functions (called **middleware**), and eventually send a response back.

Without Express, you would write raw Node.js HTTP servers:

```ts
// Raw Node.js — verbose and painful
import http from "http";

const server = http.createServer((req, res) => {
  if (req.url === "/users" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ users: [] }));
  }
});
server.listen(4000);
```

With Express, this becomes clean and composable:

```ts
import express from "express";
const app = express();

app.get("/users", (req, res) => {
  res.json({ users: [] });
});

app.listen(4000);
```

---

## How this project uses Express

The entire app is set up in [`src/app.ts`](../src/app.ts). The pattern is:

```
1. Create the app          →  const app = express()
2. Attach global middleware →  app.use(helmet()), app.use(cors()), etc.
3. Mount route modules      →  app.use("/api/v1", authRoutes)
4. Add error handler        →  app.use((err, req, res, next) => ...)
```

```ts
// src/app.ts
const app = express();

// Global middleware — runs on EVERY request
app.use(helmet());
app.use(compression());
app.use(express.json());       // parses JSON request body
app.use(cookieParser());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(pinoHttp({ logger })); // logs every request
app.use(passport.initialize());
app.use(globalLimiter);        // rate limiting

// Route modules
app.use("/api/v1", authRoutes);
app.use("/api/v1", curriculumRoutes);
app.use("/api/v1", gradeRoutes);
// ...

// Error handler — catches anything thrown with next(err)
app.use((err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  return res.status(500).json({ error: "Internal Server Error" });
});
```

---

## The three core concepts

### 1. Middleware

A middleware is just a function with three parameters: `(req, res, next)`.

- `req` — the incoming request (headers, body, params, etc.)
- `res` — the outgoing response (send JSON, set status, etc.)
- `next` — call this to pass control to the next middleware in the chain

```
Request  →  [middleware 1]  →  [middleware 2]  →  [route handler]  →  Response
               calls next()      calls next()        sends res.json()
```

Example: every request in this project passes through the `requireAuth` middleware before hitting protected routes:

```ts
// src/middlewares/requireAuth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing access token" });
    // ↑ stops here — next() is NOT called
  }

  const token = authHeader.split(" ")[1];
  try {
    req.authUser = verifyAccessToken(token);
    next(); // ← passes to the next handler
  } catch {
    return res.status(401).json({ message: "Access token expired or invalid" });
  }
}
```

### 2. Routing

Routes map an HTTP method + URL pattern to a handler function:

```ts
router.get("/curriculums", handler);         // GET /api/v1/curriculums
router.post("/curriculums", handler);        // POST /api/v1/curriculums
router.put("/curriculums/:id", handler);     // PUT /api/v1/curriculums/42
router.delete("/curriculums/:id", handler);  // DELETE /api/v1/curriculums/42
```

URL parameters are accessible via `req.params`:
```ts
app.get("/users/:id", (req, res) => {
  console.log(req.params.id); // e.g. "42"
});
```

Query strings are accessible via `req.query`:
```ts
// GET /users?page=2&limit=10
app.get("/users", (req, res) => {
  console.log(req.query.page);  // "2"
  console.log(req.query.limit); // "10"
});
```

### 3. Error handling

Express has a special 4-argument error handler. When any middleware calls `next(error)`, Express skips all regular middleware and jumps straight to this handler:

```ts
// Throw an error from anywhere
throw new AppError("Not found", 404);
// OR
next(new AppError("Not found", 404));

// Caught here — at the bottom of app.ts
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ error: "Internal Server Error" });
});
```

---

## The request lifecycle in this project

When a request hits `POST /api/v1/auth/login`:

```
1. helmet()           → adds security headers
2. compression()      → enables gzip
3. express.json()     → parses JSON body
4. cookieParser()     → parses cookies
5. cors()             → validates Origin header
6. pino-http          → logs the incoming request
7. passport.init()    → initializes passport
8. globalLimiter      → checks rate limit
9. authLimiter        → login-specific rate limit
10. validate(loginBody) → validates email + password with Zod
11. passport.authenticate() → checks email + password
12. loginController   → issues JWT + refresh token
13. res.json(...)     → sends response
```

---

## Step-by-step practice

**Task 1 — Build a products API from scratch**

```ts
import express, { Request, Response } from "express";

interface Product {
  id: number;
  name: string;
  price: number;
}

const app = express();
app.use(express.json());

let products: Product[] = [
  { id: 1, name: "Notebook", price: 5 },
  { id: 2, name: "Pen", price: 1 },
];

// GET all
app.get("/products", (_req: Request, res: Response) => {
  res.json(products);
});

// GET one
app.get("/products/:id", (req: Request, res: Response) => {
  const product = products.find((p) => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(product);
});

// POST create
app.post("/products", (req: Request, res: Response) => {
  const newProduct = { id: Date.now(), ...req.body };
  products.push(newProduct);
  res.status(201).json(newProduct);
});

// PUT update
app.put("/products/:id", (req: Request, res: Response) => {
  const index = products.findIndex((p) => p.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ message: "Not found" });
  products[index] = { ...products[index], ...req.body };
  res.json(products[index]);
});

// DELETE
app.delete("/products/:id", (req: Request, res: Response) => {
  products = products.filter((p) => p.id !== Number(req.params.id));
  res.status(204).send();
});

app.listen(3001, () => console.log("Running on http://localhost:3001"));
```

Test it using curl or Postman:
```bash
curl http://localhost:3001/products
curl -X POST http://localhost:3001/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Ruler","price":2}'
```

**Task 2 — Write a logging middleware**

Add this before your routes and see it print every request:

```ts
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} — ${Date.now() - start}ms`);
  });
  next();
});
```

**Task 3 — Add error handling**

```ts
class AppError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message);
  }
}

app.get("/products/:id", (req, res, next) => {
  const product = products.find((p) => p.id === Number(req.params.id));
  if (!product) return next(new AppError("Product not found", 404));
  res.json(product);
});

// Error handler — must be LAST
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  res.status(500).json({ error: "Internal Server Error" });
});
```

---

## Key takeaways

- Express = middleware pipeline + routing
- Every request flows top-to-bottom through `app.use()` calls
- `next()` passes control forward; `res.json()` ends the chain
- The 4-arg error handler catches anything thrown with `next(err)`
- This project mounts all routes under `/api/v1` via separate Router modules
