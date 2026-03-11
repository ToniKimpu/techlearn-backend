# 01 — Node.js + TypeScript

## What is Node.js?

Node.js lets you run JavaScript on the server (outside the browser). Before Node.js existed, JavaScript could only run inside browsers. Node.js changed that.

Under the hood it uses the **V8 engine** (same engine Chrome uses) to execute JavaScript, plus a library called **libuv** that handles async I/O — reading files, making network requests, querying a database — without blocking the program.

```
Browser  →  JavaScript runs here (V8)
Node.js  →  JavaScript runs here too (V8 + libuv for async I/O)
```

---

## What is TypeScript?

TypeScript is JavaScript with a **type system** layered on top. You write `.ts` files, and the TypeScript compiler (`tsc`) checks your code for type errors and then compiles it to plain `.js` that Node.js can run.

```ts
// JavaScript — no errors caught until runtime
function greet(user) {
  return "Hello, " + user.name;
}
greet(null); // crashes at runtime: Cannot read property 'name' of null

// TypeScript — error caught at compile time
function greet(user: { name: string }) {
  return "Hello, " + user.name;
}
greet(null); // Error: Argument of type 'null' is not assignable to parameter
```

---

## How this project uses both

Every file in `techlearn-backend/src/` is TypeScript. The compiler is configured in [`tsconfig.json`](../tsconfig.json).

The entry point is [`src/server.ts`](../src/server.ts). Node.js cannot run `.ts` files directly — during development, the project uses **tsx** (a fast TS runner) so you don't need to compile first:

```json
// package.json scripts
"dev": "nodemon --exec tsx src/server.ts"
"build": "tsc"
"start": "node dist/server.js"
```

TypeScript gives the whole codebase strong typing. For example, in [`src/utils/jwt.ts`](../src/utils/jwt.ts):

```ts
// The return type is explicitly declared
export function verifyAccessToken(token: string): JwtUserPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  return {
    authId: payload.sub as string,
    profileId: payload.profileId as string,
    userType: payload.userType as string,
  };
}
```

If you try to use a property that does not exist on `JwtUserPayload`, TypeScript catches it before the code runs.

---

## Core concepts you must understand

### 1. The Event Loop

Node.js is **single-threaded** but handles thousands of concurrent requests. It does this with the event loop: when Node starts a slow operation (DB query, file read), it registers a callback and immediately moves on. When the operation finishes, the callback is placed in a queue and executed.

```
  ┌─────────────────┐
  │   Call Stack    │  ← Executes code right now
  └────────┬────────┘
           │ slow operation (DB query)
           ↓
  ┌─────────────────┐
  │   libuv I/O     │  ← Handles it in background
  └────────┬────────┘
           │ done
           ↓
  ┌─────────────────┐
  │  Callback Queue │  ← Waits here
  └────────┬────────┘
           │ stack empty
           ↓
  ┌─────────────────┐
  │   Call Stack    │  ← Picks up callback, runs it
  └─────────────────┘
```

### 2. async / await

`async/await` is the modern syntax for working with the event loop. Every async operation returns a **Promise**:

```ts
// Without async/await (callback hell)
db.query("SELECT * FROM users", (err, result) => {
  if (err) { ... }
  doSomething(result);
});

// With async/await (clean and readable)
async function getUsers() {
  const users = await db.query("SELECT * FROM users");
  return users;
}
```

In this project, virtually every function that touches the database or network is `async`:

```ts
// src/config/passport.ts
async (email, password, done) => {
  const auth = await prisma.authUser.findUnique({ where: { email } });
  const match = await argon2.verify(auth.passwordHash!, password);
  ...
}
```

### 3. TypeScript interfaces and types

```ts
// Define the shape once
interface User {
  id: string;
  email: string;
  role: "admin" | "student";
}

// Use it everywhere — TypeScript enforces consistency
function getUser(id: string): Promise<User> { ... }
function renderProfile(user: User): string { ... }
```

### 4. ES Modules

This project uses ESM (`"type": "module"` in package.json), not CommonJS. That means:

```ts
// ESM (this project)
import express from "express";
export const router = express.Router();

// CommonJS (older style — do NOT mix)
const express = require("express");
module.exports = { router };
```

---

## Step-by-step practice

**Task 1 — Hello TypeScript**
1. Create a new folder outside this project: `mkdir ts-practice && cd ts-practice`
2. Run `npm init -y && npm install typescript tsx`
3. Create `index.ts`:
```ts
interface Product {
  name: string;
  price: number;
  inStock: boolean;
}

const products: Product[] = [
  { name: "Notebook", price: 5, inStock: true },
  { name: "Pen", price: 1, inStock: false },
  { name: "Ruler", price: 2, inStock: true },
];

function getAvailable(items: Product[]): Product[] {
  return items.filter((p) => p.inStock);
}

console.log(getAvailable(products));
```
4. Run with `npx tsx index.ts`
5. Now break it intentionally: try `p.price.toUpperCase()` — observe the TypeScript error before running.

**Task 2 — async/await with a timer**
```ts
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchData(id: number): Promise<{ id: number; data: string }> {
  await delay(500); // simulates a DB query
  return { id, data: `Result for ${id}` };
}

async function main() {
  console.log("Fetching...");
  const result = await fetchData(42);
  console.log(result);
}

main();
```

**Task 3 — understand the event loop**
```ts
console.log("1 - start");

setTimeout(() => console.log("2 - timeout (async)"), 0);

Promise.resolve().then(() => console.log("3 - microtask"));

console.log("4 - end");

// Expected output:
// 1 - start
// 4 - end
// 3 - microtask
// 2 - timeout (async)
```
Run this and make sure you understand WHY it prints in that order.

---

## Key takeaways

- Node.js = JavaScript runtime on the server, non-blocking by default
- TypeScript = JavaScript + types, compiled to JS before running
- `async/await` is how you handle non-blocking operations cleanly
- This entire backend is TypeScript — understanding these basics unlocks everything else
