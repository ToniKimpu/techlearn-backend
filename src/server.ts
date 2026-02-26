import "./config/env.js";
import http from "http";
import { Server } from "socket.io";
import app, { CORS_ORIGIN } from "./app.js";
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
  console.log("Socket connected:", socket.data.user?.authId);

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
