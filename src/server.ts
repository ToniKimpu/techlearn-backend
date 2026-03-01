import "./config/env.js";
import "./config/queue.js";
import http from "http";
import { Server } from "socket.io";
import app, { CORS_ORIGIN } from "./app.js";
import { redis } from "./config/redis.js";
import { prisma } from "./database/prisma.js";
import { logger } from "./utils/logger.js";
import { verifyAccessToken } from "./utils/jwt.js";

const PORT = process.env.PORT || 4000;

const httpServer = http.createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
});

app.set("io", io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Missing access token"));
  }

  try {
    socket.data.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  logger.info({ authId: socket.data.user?.authId }, "Socket connected");

  socket.on("disconnect", () => {
    logger.info({ authId: socket.data.user?.authId }, "Socket disconnected");
  });
});

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});

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
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
