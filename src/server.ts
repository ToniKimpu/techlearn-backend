import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { verifyAccessToken } from "./lib/verifyAccessToken.js";


const PORT = process.env.PORT || 4000;

// 1️⃣ Create HTTP server
const httpServer = http.createServer(app);

// 2️⃣ Attach Socket.IO
export const io = new Server(httpServer, {
  cors: {
    origin: "*", // restrict in prod
  },
});
app.set("io", io);

// 3️⃣ Socket authentication (JWT)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Missing access token"));
  }
  try {
    socket.data.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
});

// 4️⃣ Handle connections
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.data.user?.userId);

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });
});

// 5️⃣ Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
