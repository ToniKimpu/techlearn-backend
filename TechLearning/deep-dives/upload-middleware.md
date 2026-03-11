# Deep Dive — `upload` Middleware (Multer)

> File: `src/middlewares/upload.ts`

---

## Why Express needs Multer

When a browser submits a JSON form (login, registration), Express's built-in `express.json()` handles it:

```
POST /api/v1/auth/login
Content-Type: application/json
Body: { "email": "alice@test.com", "password": "secret" }

→ express.json() parses this → req.body = { email: "...", password: "..." }
```

When a browser uploads a **file**, the encoding is completely different:

```
POST /api/v1/upload
Content-Type: multipart/form-data; boundary=----FormBoundary7MA4YWxk

----FormBoundary7MA4YWxk
Content-Disposition: form-data; name="file"; filename="photo.jpg"
Content-Type: image/jpeg

ÿØÿà JFIF [thousands of raw binary bytes...]
----FormBoundary7MA4YWxk--
```

`express.json()` cannot parse this format. Without Multer, `req.body` is `undefined` and the file is lost.

**Multer** is the parser for `multipart/form-data`. It reads the binary stream, extracts the file, and places it on `req.file`.

---

## How file uploads work in HTTP — step by step

```
1. User picks a file: <input type="file" name="file" />

2. Browser reads the file into memory

3. Browser encodes it as multipart/form-data:
   - Generates a random "boundary" separator string
   - Writes part headers: Content-Disposition, Content-Type
   - Appends the raw binary file bytes

4. Browser sends the HTTP POST

5. Express receives a stream of binary bytes

6. Multer intercepts the stream and parses it chunk by chunk

7. Multer checks:
   a. fileFilter  → is the MIME type allowed?
   b. limits      → is the file size within the limit?

8. Multer stores the file (in memory as Buffer, or on disk)

9. Multer puts the result on req.file

10. Your route handler runs — req.file is available
```

---

## Full source code with annotations

```ts
import multer from "multer";

// Allowed MIME types — anything else is rejected
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// 5 MB in bytes: 5 × 1024 × 1024 = 5,242,880
const MAX_SIZE = 5 * 1024 * 1024;

const upload = multer({

  // ── storage ───────────────────────────────────────────────────────
  // memoryStorage: keep the file as a Buffer in RAM
  // (alternative: diskStorage — saves file to the filesystem)
  storage: multer.memoryStorage(),

  // ── limits ────────────────────────────────────────────────────────
  // Enforced DURING streaming — Multer cuts the connection the moment
  // the byte count exceeds MAX_SIZE. The full file is never received.
  limits: { fileSize: MAX_SIZE },

  // ── fileFilter ────────────────────────────────────────────────────
  // Runs for every file BEFORE it is stored
  // file contains metadata only (no binary data yet)
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);                                           // accept
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed")); // reject with error
    }
  },
});

// upload.single("file") → returns Express middleware
// "file" = the expected form field name (<input name="file" />)
// One file per request
export const uploadSingle = upload.single("file");
```

---

## The three storage options

### `memoryStorage()` — used in this project

```ts
storage: multer.memoryStorage()
```

File is kept in RAM as a Node.js `Buffer`. Never written to disk.

```ts
req.file.buffer = <Buffer ff d8 ff e0 00 10 4a 46 49 46 ...>
// ↑ raw image bytes, ready to send to cloud storage
```

**Use when**: you need to forward the file to another service (Supabase, S3, Cloudinary) immediately.

**Downside**: for large files, it consumes server RAM. The `MAX_SIZE` limit prevents abuse.

### `diskStorage()` — not used here

```ts
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
```

File is saved to the local filesystem. `req.file.path` contains the file path.

**Use when**: you serve files directly from your server without a cloud provider.

### Custom storage engines

You can write your own storage engine that uploads directly to S3 or Supabase during the stream, without buffering in RAM at all. For advanced use cases only.

---

## What `req.file` contains after Multer runs

After `uploadSingle` processes a request, your controller has access to:

```ts
req.file = {
  fieldname:    "file",                   // the form field name (<input name="file">)
  originalname: "vacation-photo.jpg",     // filename from user's computer
  encoding:     "7bit",
  mimetype:     "image/jpeg",             // MIME type declared by the browser
  buffer:       <Buffer ff d8 ff e0 ...>, // raw file bytes (memoryStorage only)
  size:         245678,                   // file size in bytes
}
```

For `diskStorage`, you'd get:
```ts
req.file = {
  // ... same as above, plus:
  destination: "./uploads/",
  filename:    "1715000000-vacation-photo.jpg",
  path:        "uploads/1715000000-vacation-photo.jpg",
  // buffer is ABSENT — file is on disk, not in memory
}
```

---

## What `req.files` contains (multiple uploads)

When using `upload.array("files", 5)`:

```ts
req.files = [
  { fieldname: "files", originalname: "photo1.jpg", buffer: ..., size: 120000 },
  { fieldname: "files", originalname: "photo2.png", buffer: ..., size: 89000 },
  { fieldname: "files", originalname: "photo3.webp", buffer: ..., size: 45000 },
]
```

---

## How `uploadSingle` is used in routes

```ts
// src/modules/upload/routes.ts
router.post(
  "/upload",
  requireAuth,     // Step 1 — authenticate the user
  uploadSingle,    // Step 2 — parse the multipart file → req.file
  uploadController // Step 3 — use req.file.buffer to upload to cloud
);
```

The full middleware chain for `POST /api/v1/upload`:

```
POST /api/v1/upload
multipart/form-data containing photo.jpg

Step 1 — requireAuth:
  Reads Authorization header
  Verifies JWT
  Sets req.authUser = { authId: "uuid-123", ... }
  next()

Step 2 — uploadSingle (Multer):
  Parses the multipart stream
  fileFilter: "image/jpeg" is in ALLOWED_TYPES → accept
  limits: 240KB < 5MB → accept
  Stores bytes in memory
  Sets req.file = { buffer: <Buffer...>, mimetype: "image/jpeg", size: 245678 }
  next()

Step 3 — uploadController:
  req.authUser available (from requireAuth)
  req.file available (from uploadSingle)
  Uploads req.file.buffer to Supabase
  Returns: { url: "https://..." }
```

---

## What happens when validation fails

### File too large (> 5 MB)

Multer cuts the connection mid-stream and throws `MulterError`:
```
HTTP 413
Error: File too large
```
Caught by the global error handler in `app.ts`.

### Wrong MIME type

`fileFilter` calls `cb(new Error(...))`:
```
HTTP 400 (or 500 depending on error handler)
Error: Only JPEG, PNG, WebP, and GIF images are allowed
```

### No file in the request

`req.file` is `undefined`. Your controller must check:
```ts
async function uploadController(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "No file provided" });
  }
  // proceed with req.file.buffer
}
```

### Wrong field name

If the client sends `name="image"` but Multer expects `name="file"`:
```ts
upload.single("file") // expects field named "file"
// Client sends:        name="image"
// Result:              req.file = undefined
```

---

## Security consideration — MIME type spoofing

`file.mimetype` comes from the browser and **can be faked**. A user can rename `malware.exe` to `photo.jpg` and the browser may send `Content-Type: image/jpeg`.

For stronger validation, check the actual file bytes (magic bytes):

```ts
// JPEG magic bytes: FF D8 FF
// PNG magic bytes:  89 50 4E 47
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === "image/jpeg") {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (mimetype === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 &&
           buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  return false;
}

// In controller:
if (!validateMagicBytes(req.file.buffer, req.file.mimetype)) {
  return res.status(400).json({ message: "File content does not match its declared type" });
}
```

---

## Step-by-step practice tasks

**Task 1 — Basic single file upload**

```ts
import express from "express";
import multer from "multer";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("JPEG and PNG only"));
    }
  },
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  res.json({
    name: req.file.originalname,
    type: req.file.mimetype,
    size: `${(req.file.size / 1024).toFixed(1)} KB`,
    bytes: req.file.buffer.length,
  });
});

app.listen(3001);
```

Test with curl:
```bash
# Create a test file
echo "fake jpeg" > test.jpg

# Upload it
curl -X POST http://localhost:3001/upload \
  -F "file=@test.jpg;type=image/jpeg"

# Try wrong field name — req.file will be undefined
curl -X POST http://localhost:3001/upload \
  -F "image=@test.jpg;type=image/jpeg"

# Try wrong type
curl -X POST http://localhost:3001/upload \
  -F "file=@test.jpg;type=application/pdf"
```

**Task 2 — Multiple file upload**

```ts
app.post("/upload-many", upload.array("files", 5), (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: "No files" });

  res.json({
    count: files.length,
    files: files.map((f) => ({ name: f.originalname, size: f.size })),
  });
});
```

**Task 3 — Observe what fileFilter receives**

```ts
fileFilter: (_req, file, cb) => {
  // Print everything available at this point
  console.log({
    fieldname:    file.fieldname,    // "file"
    originalname: file.originalname, // "photo.jpg"
    mimetype:     file.mimetype,     // "image/jpeg"
    encoding:     file.encoding,     // "7bit"
    // NOTE: file.buffer is NOT here yet — data hasn't been read
  });
  cb(null, true); // always accept for this exercise
},
```

---

## Key takeaways

- `multipart/form-data` is the browser encoding for file uploads — `express.json()` cannot parse it
- Multer is the parser: it extracts files and puts them on `req.file` / `req.files`
- `memoryStorage()` → file as `Buffer` in RAM (use when forwarding to cloud storage)
- `diskStorage()` → file saved to filesystem (use for local file serving)
- `fileFilter` runs on metadata only — the binary data is not yet in memory at that point
- `limits.fileSize` is enforced during streaming — the connection is cut mid-stream if exceeded
- Always check `if (!req.file)` in your controller — the client might not send a file
- MIME type can be spoofed — for sensitive uploads, validate magic bytes in the controller
