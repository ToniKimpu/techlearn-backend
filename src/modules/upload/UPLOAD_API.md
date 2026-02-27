# Upload API

## Endpoint

```
POST /upload
```

**Auth:** Requires `Authorization: Bearer <access_token>` header.

## Request

**Content-Type:** `multipart/form-data`

| Field    | Type   | Required | Description                                           |
| -------- | ------ | -------- | ----------------------------------------------------- |
| `file`   | File   | Yes      | Image file (JPEG, PNG, WebP, or GIF). Max size: 5 MB. |
| `bucket` | String | Yes      | Supabase Storage bucket name (e.g. `curriculum-images`). |

## Response

**201 Created**

```json
{
  "message": "File uploaded",
  "data": {
    "url": "https://qeidjlbonuvktrvmsjqj.supabase.co/storage/v1/object/public/curriculum-images/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg"
  }
}
```

**400 Bad Request** — missing file, missing bucket, wrong file type, or file too large.

**401 Unauthorized** — missing or invalid token.

## Frontend Examples

### JavaScript (fetch)

```js
const uploadImage = async (file, bucket, accessToken) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);

  const res = await fetch("http://localhost:4000/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const json = await res.json();
  return json.data.url; // the public image URL
};

// Usage with an <input type="file">
const fileInput = document.querySelector('input[type="file"]');
const url = await uploadImage(fileInput.files[0], "curriculum-images", token);
```

### React Example

```jsx
const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = await uploadImage(file, "curriculums", accessToken);

  // Now use the URL in a create/update request
  await fetch("http://localhost:4000/curriculums", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: "My Curriculum",
      image: url,
    }),
  });
};
```

## Workflow

1. User picks a file on the frontend.
2. Frontend calls `POST /upload` with the file and bucket name.
3. Backend uploads to Supabase Storage and returns the public URL.
4. Frontend uses that URL in subsequent API calls (e.g. create/update curriculum, profile, etc.).

## Bucket Names

Create these buckets in **Supabase Dashboard → Storage → New Bucket** and set them to **public**.

| Bucket               | Used for               |
| -------------------- | ---------------------- |
| `curriculums`  | Curriculum images      |
| `grades`       | Grade images           |
| `subjects`     | Subject images         |
| `chapters`     | Chapter images         |
| `profile-avatars`    | User profile pictures  |

You can create any bucket name — the frontend decides which one to use.
