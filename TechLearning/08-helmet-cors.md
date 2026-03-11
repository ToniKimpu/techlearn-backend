# 08 — Helmet + CORS

## Helmet

### What is Helmet?

Helmet is an Express middleware that automatically sets **HTTP security response headers**. These headers tell the browser how to handle your content safely.

Without Helmet, your API is vulnerable to several well-known attacks. Adding Helmet is a single line of code that blocks entire attack categories.

### How this project uses Helmet

```ts
// src/app.ts
import helmet from "helmet";

app.use(helmet()); // sets ~12 security headers automatically
```

### What headers does Helmet set?

Run your server with and without Helmet, then compare headers using:
```bash
curl -I http://localhost:4000/health
```

Key headers Helmet adds:

| Header | What it prevents |
|---|---|
| `Content-Security-Policy` | XSS attacks (controls what scripts can run) |
| `X-Frame-Options: DENY` | Clickjacking (prevents your page being embedded in iframes) |
| `X-Content-Type-Options: nosniff` | MIME sniffing attacks |
| `Strict-Transport-Security` | Forces HTTPS (prevents downgrade to HTTP) |
| `Referrer-Policy` | Leaking URLs in the `Referer` header |
| `X-DNS-Prefetch-Control` | DNS prefetch leaks |

### Practice — see the difference

```ts
import express from "express";
import helmet from "helmet";

const withHelmet = express();
withHelmet.use(helmet());
withHelmet.get("/", (_, res) => res.send("with helmet"));
withHelmet.listen(3001);

const withoutHelmet = express();
withoutHelmet.get("/", (_, res) => res.send("without helmet"));
withoutHelmet.listen(3002);
```

```bash
curl -I http://localhost:3001/    # inspect headers
curl -I http://localhost:3002/    # compare — missing security headers
```

---

## CORS

### What is CORS?

CORS (Cross-Origin Resource Sharing) is a browser security feature that **blocks web pages from making API requests to a different domain** than the one they loaded from.

```
Frontend: http://localhost:3000
Backend:  http://localhost:4000

Without CORS headers → browser BLOCKS the request
With CORS headers    → browser ALLOWS it
```

This exists because without it, a malicious website could make API calls on behalf of a logged-in user (CSRF attack).

### Same-origin vs cross-origin

```
Same origin:
  Frontend: https://app.techlearn.com
  API:      https://app.techlearn.com/api  ← same domain, allowed

Cross-origin:
  Frontend: https://app.techlearn.com
  API:      https://api.techlearn.com      ← different subdomain = blocked by default
```

Two URLs are the same origin only if protocol + domain + port all match.

### How this project uses CORS

```ts
// src/app.ts
export const CORS_ORIGIN = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(
  cors({
    origin: CORS_ORIGIN,    // only this domain may call the API
    credentials: true,      // allow cookies and Authorization headers
  })
);
```

The `credentials: true` flag is required because this project sends cookies (for refresh tokens) and the `Authorization` header. Without it, browsers block credential-bearing requests even if the origin is allowed.

### What CORS actually adds

When the browser sees a cross-origin request, it first sends a **preflight** OPTIONS request to check if it's allowed:

```
Browser:  OPTIONS /api/v1/curriculums
          Origin: http://localhost:3000

Server:   Access-Control-Allow-Origin: http://localhost:3000
          Access-Control-Allow-Credentials: true
          Access-Control-Allow-Methods: GET,POST,PUT,DELETE

Browser:  OK — sends the actual request
```

### Practice — see CORS in action

```ts
import express from "express";
import cors from "cors";

const app = express();

// Only allow requests from port 3000
app.use(cors({ origin: "http://localhost:3000", credentials: true }));

app.get("/data", (_, res) => {
  res.json({ message: "Data fetched successfully" });
});

app.listen(4000);
```

Now open a browser console on any site that is NOT localhost:3000 and run:
```js
fetch("http://localhost:4000/data", { credentials: "include" })
  .then(r => r.json())
  .then(console.log);
```
It will be blocked. If you run it from localhost:3000, it will succeed.

### Multiple allowed origins

```ts
const allowedOrigins = [
  "http://localhost:3000",
  "https://app.techlearn.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);
```

---

## Step-by-step practice

**Task 1 — Observe headers with and without Helmet**

1. Create two Express servers on ports 3001 and 3002 (one with Helmet, one without)
2. Run both and use `curl -I` to inspect response headers
3. List which security headers are missing without Helmet

**Task 2 — Trigger a CORS error**

1. Start the backend at port 4000 with CORS only allowing `http://localhost:3000`
2. Open your browser and go to `http://localhost:4001` (a different port)
3. Open DevTools → Console and run:
   ```js
   fetch("http://localhost:4000/health").then(r => r.json()).then(console.log)
   ```
4. Observe the CORS error in the console
5. Now open `http://localhost:3000` and run the same fetch — it succeeds

**Task 3 — Configure CORS for multiple environments**

```ts
const origins: Record<string, string> = {
  development: "http://localhost:3000",
  staging: "https://staging.techlearn.com",
  production: "https://app.techlearn.com",
};

app.use(
  cors({
    origin: origins[process.env.NODE_ENV || "development"],
    credentials: true,
  })
);
```

---

## Key takeaways

- **Helmet**: sets 12+ security headers in one line — always add it to every Express app
- **CORS**: browsers block cross-origin requests by default — you must explicitly allow your frontend's origin
- `credentials: true` is required for cookies and Authorization headers to work cross-origin
- The frontend URL should come from an environment variable, not be hardcoded
- CORS is a browser feature — it does NOT protect your API from server-to-server calls (curl, Postman)
