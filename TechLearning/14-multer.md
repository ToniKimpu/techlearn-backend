# 14 — Multer (File Uploads)

## What is Multer?

Multer is an Express middleware for handling file uploads. When a user submits a form with a file, the browser encodes it as `multipart/form-data` — a binary format that Express's JSON parser cannot handle. Multer parses this format and makes the file available in your route handler.

```
Browser (multipart/form-data):
  ──────────────────────────────
  Content-Disposition: form-data; name="file"; filename="photo.jpg"
  Content-Type: image/jpeg
  [binary image data]
  ──────────────────────────────

Without Multer: req.body is undefined (Express can't parse binary)
With Multer:    req.file = { originalname, mimetype, size, buffer, ... }
```

---

## How this project uses Multer

[`src/middlewares/upload.ts`](../src/middlewares/upload.ts):

```ts
import multer from "multer";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(), // store in memory as Buffer (not on disk)
  limits: {
    fileSize: MAX_SIZE,            // reject files larger than 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);              // accept the file
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
    }
  },
});

export const uploadSingle = upload.single("file"); // expects a field named "file"
```

Used in the upload route:
```ts
router.post(
  "/upload",
  requireAuth,
  uploadSingle,           // ← Multer middleware
  uploadController        // ← handler receives req.file
);
```

Inside the upload controller, the file is available as:
```ts
async function uploadController(req: Request, res: Response) {
  const file = req.file;
  // file.originalname → "photo.jpg"
  // file.mimetype     → "image/jpeg"
  // file.size         → 245678 (bytes)
  // file.buffer       → <Buffer ff d8 ff e0 ...> (raw image bytes)

  // Upload the buffer to Supabase Storage
  const url = await uploadToSupabase(file.buffer, file.originalname, file.mimetype);
  res.json({ url });
}
```

---

## Storage options

### Memory storage (this project)

The file is stored as a `Buffer` in `req.file.buffer`. Good for processing the file before saving it elsewhere (e.g., uploading to cloud storage like S3, Supabase).

```ts
multer({ storage: multer.memoryStorage() })
```

### Disk storage

The file is saved to the local filesystem. Good for simple apps without cloud storage.

```ts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/"); // save to this folder
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({ storage });
```

---

## What `req.file` contains

After Multer processes the upload:

```ts
req.file = {
  fieldname: "file",           // the form field name
  originalname: "photo.jpg",   // the original filename from the user's computer
  encoding: "7bit",
  mimetype: "image/jpeg",      // the file type
  buffer: <Buffer ...>,        // the file content (memory storage only)
  size: 245678,                // file size in bytes
  // or for disk storage:
  // path: "/uploads/123-photo.jpg"
  // filename: "123-photo.jpg"
}
```

For multiple files, use `upload.array("files", 5)` and access `req.files` (an array).

---

## Step-by-step practice

**Task 1 — Accept a single file upload**

```ts
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG files are allowed"));
    }
  },
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const { originalname, mimetype, size, buffer } = req.file;

  // Save to disk from memory buffer
  fs.mkdirSync("./uploads", { recursive: true });
  fs.writeFileSync(`./uploads/${originalname}`, buffer);

  res.json({
    message: "Upload successful",
    file: { name: originalname, type: mimetype, size },
  });
});

app.listen(3001);
```

Test with curl:
```bash
# Create a test image
echo "fake image data" > test.jpg

# Upload it
curl -X POST http://localhost:3001/upload \
  -F "file=@test.jpg;type=image/jpeg"
```

**Task 2 — Upload multiple files**

```ts
app.post("/upload-many", upload.array("files", 5), (req, res) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files provided" });
  }

  const info = files.map(f => ({
    name: f.originalname,
    size: f.size,
    type: f.mimetype,
  }));

  res.json({ uploaded: info.length, files: info });
});
```

**Task 3 — Validate file content (not just mimetype)**

Mimetype can be spoofed — a user could rename `malware.exe` to `image.jpg`. Check the file signature (magic bytes):

```ts
app.post("/upload-safe", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const buffer = req.file.buffer;

  // JPEG files start with bytes: FF D8 FF
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

  // PNG files start with bytes: 89 50 4E 47
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 &&
                buffer[2] === 0x4E && buffer[3] === 0x47;

  if (!isJpeg && !isPng) {
    return res.status(400).json({ error: "File content is not a valid image" });
  }

  res.json({ message: "Valid image received", size: buffer.length });
});
```

---

## Key takeaways

- Multer parses `multipart/form-data` — the encoding browsers use for file uploads
- `memoryStorage()` stores the file as a `Buffer` (good for cloud uploads)
- `diskStorage()` saves directly to the filesystem (good for simple apps)
- Always validate mimetype AND consider checking magic bytes for security
- Set `limits.fileSize` to prevent users from uploading huge files
- `req.file` = single file, `req.files` = multiple files (when using `.array()`)
