# 09 — File Upload (Multer + Supabase)

## Goal

Add file upload capability — accept images via multipart form data, validate them, and store them in Supabase cloud storage.

---

## 9.1 Install Dependencies

```bash
npm install multer
npm install -D @types/multer
```

| Package | Purpose |
|---------|---------|
| `multer` | Multipart form data parser (file uploads) |

**Supabase** — We use the Supabase Storage REST API directly (no SDK). This keeps dependencies light and teaches you how REST APIs work.

---

## 9.2 Understand the Upload Flow

```
Client sends: POST /upload (multipart/form-data)
  │  Fields: file (binary), bucket (string, e.g. "avatars")
  │
  ├── Multer middleware
  │     ├── Parses multipart form data
  │     ├── Stores file in memory (not disk)
  │     ├── Validates: max 5 MB, image types only
  │     └── Sets req.file = { buffer, mimetype, size, ... }
  │
  ├── Route handler
  │     ├── Validates: file exists, bucket provided
  │     └── Calls uploadService.uploadFile()
  │
  ├── Service
  │     ├── Generates UUID filename (prevents collisions)
  │     ├── Maps MIME type to extension
  │     └── Calls uploadToStorage() → Supabase REST API
  │
  └── Response: { url: "https://your-project.supabase.co/storage/v1/object/public/avatars/abc123.jpg" }
```

---

## 9.3 Supabase Storage Client

Create `src/database/supabase.ts`:

```typescript
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function uploadToStorage(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
    },
    body: buffer,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Storage upload failed: ${error.message || response.statusText}`);
  }

  // Return public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
```

**Why no Supabase SDK?** The SDK adds ~200KB to your bundle. For a single REST call, `fetch` is simpler and teaches you what the SDK does under the hood.

**Service role key** — This is an admin key that bypasses Row Level Security. Only use it server-side, never expose to clients.

---

## 9.4 Multer Middleware

Create `src/middlewares/upload.ts`:

```typescript
import multer from "multer";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage(); // Store in memory (Buffer), not on disk

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);  // Accept
    } else {
      cb(new Error("Only image files (JPEG, PNG, WebP, GIF) are allowed"));
    }
  },
});

// Middleware for single file upload
export const uploadSingle = upload.single("file");
```

**Memory storage vs disk storage:**
- **Memory** — File stored as `Buffer` in RAM. Good for small files that you immediately upload elsewhere.
- **Disk** — File written to temp directory. Better for large files or processing.
- We use memory because we immediately upload to Supabase.

---

## 9.5 Upload Service

Create `src/modules/upload/service.ts`:

```typescript
import crypto from "node:crypto";
import { uploadToStorage } from "../../database/supabase.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadFile(
  file: Express.Multer.File,
  bucket: string
): Promise<{ url: string }> {
  const ext = MIME_TO_EXT[file.mimetype] || "bin";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${bucket}/${filename}`;

  const url = await uploadToStorage(bucket, filename, file.buffer, file.mimetype);

  return { url };
}
```

**UUID filenames** — `crypto.randomUUID()` generates a unique filename like `a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`. This prevents filename collisions and avoids issues with special characters in original filenames.

---

## 9.6 Upload Routes

Create `src/modules/upload/routes.ts`:

```typescript
import { Router, Request, Response } from "express";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { uploadSingle } from "../../middlewares/upload.js";
import * as uploadService from "./service.js";
import multer from "multer";

const router = Router();

// POST /upload — Upload a file
router.post("/", requireAuth, (req: Request, res: Response, next) => {
  // Wrap multer to catch file size errors
  uploadSingle(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ message: "File size exceeds 5 MB" });
        return;
      }
      res.status(400).json({ message: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ message: err.message });
      return;
    }

    // Validate file and bucket
    if (!req.file) {
      res.status(400).json({ message: "File is required" });
      return;
    }

    const bucket = req.body.bucket;
    if (!bucket) {
      res.status(400).json({ message: "Bucket name is required" });
      return;
    }

    const result = await uploadService.uploadFile(req.file, bucket);
    res.status(201).json({
      message: "File uploaded successfully",
      data: result,
    });
  });
});

export default router;
```

**Why wrap multer?** Multer's error handling is callback-based. We wrap it to catch `LIMIT_FILE_SIZE` errors and return friendly messages.

---

## 9.7 Mount Upload Routes

In `src/app.ts`:

```typescript
import uploadRoutes from "./modules/upload/routes.js";

app.use("/api/v1/upload", uploadRoutes);
```

---

## 9.8 Test It

```bash
# Upload a file
curl -X POST http://localhost:4000/api/v1/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@./test-image.jpg" \
  -F "bucket=avatars"

# Response:
# {
#   "message": "File uploaded successfully",
#   "data": {
#     "url": "https://your-project.supabase.co/storage/v1/object/public/avatars/abc123.jpg"
#   }
# }
```

**Note:** You need to create the "avatars" bucket in Supabase Dashboard first (Storage → New Bucket → set to public).

---

## 9.9 Supabase Setup

1. Go to https://supabase.com and create a free project
2. Go to Settings → API → copy the Project URL and service_role key
3. Set them in your `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
4. Go to Storage → New Bucket → name it "avatars" → make it public
5. Set up a Storage Policy to allow uploads (or use service_role key which bypasses policies)

---

## Checkpoint

- [x] Multer middleware (memory storage, 5MB limit, image types only)
- [x] Supabase Storage integration (REST API, no SDK)
- [x] UUID filenames (collision-free)
- [x] File upload endpoint (authenticated)
- [x] Error handling for file size and type

**Commit:** `git commit -m "add file upload with Multer and Supabase Storage"`

---

## Key Concepts to Understand

1. **Multipart form data** — How file uploads work in HTTP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/POST
2. **Multer** — Express middleware for file uploads: https://github.com/expressjs/multer
3. **Memory vs disk storage** — When to use each
4. **Supabase Storage** — S3-compatible storage: https://supabase.com/docs/guides/storage
5. **Content-Type for uploads** — `multipart/form-data` vs `application/json` — you can't send files with JSON
