# Graceful Shutdown

## The Problem Without It

When you deploy a new version, the platform (Render, Railway, Docker) sends `SIGTERM` to the running process. Without a handler, Node.js exits immediately — dropping any in-flight HTTP requests. Students loading a curriculum page would see a sudden network error mid-response.

Additionally, abrupt exits leave database connections open. PostgreSQL has a connection limit (typically 20–100 on Supabase free tier). If connections are never released, the pool exhausts and new connections fail.

## How It Works

```
Platform sends SIGTERM
       ↓
process.on("SIGTERM") fires
       ↓
httpServer.close()          ← stops accepting NEW requests
       ↓                       in-flight requests continue
All active requests finish
       ↓
prisma.$disconnect()        ← releases all DB connections
redis.disconnect()          ← closes Redis connection
       ↓
process.exit(0)             ← clean exit
```

A 10-second safety timeout forces exit if something hangs (e.g., a long-running query blocks shutdown forever).

## Implementation

Located in `src/server.ts`:

```ts
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received");

  httpServer.close(async () => {
    await prisma.$disconnect();
    redis?.disconnect();
    logger.info("Server shut down cleanly");
    process.exit(0);
  });

  // Force exit if shutdown takes longer than 10s
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref(); // .unref() prevents this timer from keeping the process alive
}

process.on("SIGTERM", () => shutdown("SIGTERM")); // sent by Docker, Render, Railway
process.on("SIGINT",  () => shutdown("SIGINT"));  // sent by Ctrl+C in terminal
```

## Signals

| Signal | Sent by | Meaning |
|---|---|---|
| `SIGTERM` | Docker, Render, Railway, Kubernetes | Please shut down gracefully |
| `SIGINT` | `Ctrl+C` in terminal | User interrupted the process |

Both are handled identically — they trigger the same `shutdown()` function.

## `.unref()` on the Timeout

Without `.unref()`, the 10-second timeout would keep the Node.js event loop alive even after all connections close, delaying exit. `.unref()` tells Node to exit normally if the timeout is the only thing keeping the process running.

## Shutdown Log Output

On a clean shutdown:

```
INFO  Shutdown signal received  { signal: "SIGTERM" }
INFO  Server shut down cleanly
```

On a forced shutdown (something hung for 10s):

```
INFO  Shutdown signal received  { signal: "SIGTERM" }
ERROR Forced shutdown after timeout
```

## Zero-Downtime Deploys

Platforms like Render implement zero-downtime deploys by:

1. Starting the **new** instance and waiting for it to pass health checks
2. Sending `SIGTERM` to the **old** instance
3. The old instance drains its active requests (graceful shutdown)
4. The platform stops routing traffic to the old instance

Without graceful shutdown, step 3 is instant and requests are dropped. With it, users experience no interruption.

## What Is NOT Handled

- **WebSocket connections** — existing Socket.IO connections are cut when `httpServer.close()` is called. For production WebSocket apps, you would send a disconnect event to clients before closing.
- **BullMQ workers** — the email queue worker (`src/config/queue.ts`) is not explicitly closed. For long-running jobs this could cause duplicate processing. In a future improvement, call `worker.close()` in the shutdown handler.
