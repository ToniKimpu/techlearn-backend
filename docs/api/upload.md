# Upload API

**Base URL:** `/api/v1`
**Auth Required:** Yes — `Authorization: Bearer <accessToken>`

---

## Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/upload` |

---

## POST `/upload`

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| file | File | Yes | Max 5MB. Allowed: jpeg, png, webp, gif |
| bucket | string | Yes | Supabase Storage bucket name |

**Response (201):**

```json
{
  "message": "File uploaded",
  "data": {
    "url": "https://your-project.supabase.co/storage/v1/object/public/curriculums/uuid.jpg"
  }
}
```

**Errors:**
- `400` — Missing file, missing bucket, wrong file type, or file too large
- `401` — Missing or invalid token

---

## Bucket Names

Create these buckets in **Supabase Dashboard > Storage > New Bucket** (set to public):

| Bucket | Used for |
|--------|----------|
| `curriculums` | Curriculum images |
| `grades` | Grade images |
| `subjects` | Subject images |
| `chapters` | Chapter images |
| `profile-avatars` | User profile pictures |

---

## Frontend Example

```js
const uploadImage = async (file, bucket, accessToken) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);

  const res = await fetch("http://localhost:4000/api/v1/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const json = await res.json();
  return json.data.url;
};
```

## Workflow

1. User picks a file on the frontend
2. Frontend calls `POST /api/v1/upload` with the file and bucket name
3. Backend uploads to Supabase Storage and returns the public URL
4. Frontend uses that URL in subsequent API calls (e.g. create curriculum with `image` field)
