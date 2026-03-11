# 13 — Socket.io

## What is Socket.io?

Socket.io enables **real-time, bidirectional communication** between server and client. Unlike HTTP (where the client must always initiate), Socket.io allows the server to push data to clients at any time.

```
HTTP (request-response):
  Client → "Give me updates" → Server → "Here they are"
  (must ask repeatedly — polling)

Socket.io (persistent connection):
  Client ←→ Server   (both can send at any time)
  Server → "New message!" → Client  (no asking needed)
```

### When to use Socket.io

- Live notifications (new assignment, grade published)
- Chat systems
- Real-time collaboration
- Progress bars for long-running tasks
- Live dashboards updating without refresh

---

## How Socket.io works

Socket.io establishes a **WebSocket** connection (a persistent TCP connection). If WebSockets are unavailable (some proxies block them), it falls back to HTTP long-polling automatically.

```
1. Client connects → persistent connection established
2. Client emits "join-room" event → server receives it
3. Server emits "new-message" event → all clients in room receive it
4. Connection stays open until explicitly closed
```

---

## How this project uses Socket.io

Set up in [`src/server.ts`](../src/server.ts):

```ts
import { Server } from "socket.io";
import app, { CORS_ORIGIN } from "./app.js";
import { verifyAccessToken } from "./utils/jwt.js";

// Attach Socket.io to the existing HTTP server
export const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
});

// Make io accessible in route handlers
app.set("io", io);

// JWT authentication middleware for all socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Missing access token"));
  }

  try {
    socket.data.user = verifyAccessToken(token); // attach user to socket
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
});

// Connection handler
io.on("connection", (socket) => {
  logger.info({ authId: socket.data.user?.authId }, "Socket connected");

  socket.on("disconnect", () => {
    logger.info({ authId: socket.data.user?.authId }, "Socket disconnected");
  });
});
```

The `io` instance is attached to the Express app (`app.set("io", io)`) so route handlers can emit events to connected clients:

```ts
// From any route handler:
const io = req.app.get("io");
io.emit("notification", { message: "New curriculum added!" });
```

---

## Core Socket.io concepts

### Events

Everything in Socket.io is event-based. You **emit** events and **listen** for events:

```ts
// Server side
socket.emit("message", { text: "Hello!" });         // send to this client
socket.broadcast.emit("message", { text: "Hi!" });  // send to everyone except this client
io.emit("message", { text: "Hey!" });               // send to ALL clients

// Listen
socket.on("chat-message", (data) => {
  console.log(data.text);
});
```

```js
// Client side (browser)
const socket = io("http://localhost:4000", {
  auth: { token: "your-jwt-token" }
});

socket.emit("chat-message", { text: "Hello!" });

socket.on("message", (data) => {
  console.log("Received:", data.text);
});
```

### Rooms

Rooms let you group sockets and broadcast to specific groups:

```ts
// Server: join a room
socket.join("class-room-42");

// Emit to everyone in a room
io.to("class-room-42").emit("new-assignment", { title: "Chapter 5 Quiz" });

// Emit to everyone in a room except the sender
socket.to("class-room-42").emit("user-joined", { name: "Alice" });

// Leave a room
socket.leave("class-room-42");
```

### Namespaces

Namespaces separate different parts of your app:

```ts
const chatNs = io.of("/chat");
const notificationsNs = io.of("/notifications");

chatNs.on("connection", (socket) => { ... });
notificationsNs.on("connection", (socket) => { ... });
```

```js
// Client connects to a specific namespace
const chatSocket = io("http://localhost:4000/chat");
```

---

## Step-by-step practice

**Task 1 — Build a simple broadcast server**

```ts
// server.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

let connectedCount = 0;

io.on("connection", (socket) => {
  connectedCount++;
  console.log(`User connected. Total: ${connectedCount}`);

  // Tell everyone a new user joined
  io.emit("user-count", { count: connectedCount });

  // Listen for messages from this client
  socket.on("chat", (data) => {
    console.log(`Message from ${socket.id}: ${data.message}`);
    // Broadcast to all OTHER clients
    socket.broadcast.emit("chat", {
      from: socket.id.slice(0, 6),
      message: data.message,
    });
  });

  socket.on("disconnect", () => {
    connectedCount--;
    io.emit("user-count", { count: connectedCount });
    console.log(`User disconnected. Total: ${connectedCount}`);
  });
});

httpServer.listen(4000, () => console.log("Server running on :4000"));
```

**Task 2 — Connect from a browser**

Create `client.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <div id="count"></div>
  <ul id="messages"></ul>
  <input id="input" type="text" placeholder="Type a message..." />
  <button onclick="sendMessage()">Send</button>

  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <script>
    const socket = io("http://localhost:4000");

    socket.on("user-count", ({ count }) => {
      document.getElementById("count").textContent = `Online: ${count}`;
    });

    socket.on("chat", ({ from, message }) => {
      const li = document.createElement("li");
      li.textContent = `${from}: ${message}`;
      document.getElementById("messages").appendChild(li);
    });

    function sendMessage() {
      const input = document.getElementById("input");
      socket.emit("chat", { message: input.value });
      input.value = "";
    }
  </script>
</body>
</html>
```

Open this file in two browser windows and observe real-time messaging.

**Task 3 — Add room support**

```ts
// Server
socket.on("join-room", (room) => {
  socket.join(room);
  socket.to(room).emit("user-joined", { id: socket.id });
  console.log(`${socket.id} joined room: ${room}`);
});

socket.on("room-message", ({ room, message }) => {
  io.to(room).emit("room-message", {
    from: socket.id.slice(0, 6),
    message,
    room,
  });
});
```

```js
// Client
socket.emit("join-room", "math-class");
socket.emit("room-message", { room: "math-class", message: "Hello everyone!" });
socket.on("room-message", (data) => console.log(`[${data.room}] ${data.from}: ${data.message}`));
```

---

## Key takeaways

- Socket.io maintains persistent connections — both server and client can push data
- This project uses JWT authentication for sockets (`socket.handshake.auth.token`)
- The `io` instance is stored on the Express app so route handlers can emit events
- Rooms let you broadcast to specific groups (classes, users, channels)
- Every connected socket gets a unique `socket.id`
- Socket.io automatically falls back to HTTP polling if WebSockets are unavailable
