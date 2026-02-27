# Curriculums API

**Base URL:** `/api/v1`
**Auth Required:** Yes — `Authorization: Bearer <accessToken>`

---

## Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/curriculums` |
| GET | `/curriculums` |
| GET | `/curriculums/:id` |
| PUT | `/curriculums/:id` |
| DELETE | `/curriculums/:id` |

---

## POST `/curriculums`

**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| name | string | Yes | Min 1 char, trimmed |
| description | string | No | Trimmed |
| image | string | No | Trimmed |

**Response (201):**

```json
{
  "message": "Curriculum created",
  "data": {
    "id": "1",
    "name": "Myanmar Curriculum",
    "description": "National curriculum",
    "image": "",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `409` — Curriculum name already exists

---

## GET `/curriculums`

**Query:**

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| page | number | 1 | Positive integer |
| limit | number | 10 | Positive integer, max 100 |
| search | string | — | Searches name & description |

**Response (200):**

```json
{
  "data": [
    {
      "id": "1",
      "name": "Myanmar Curriculum",
      "description": "National curriculum",
      "image": "",
      "isDeleted": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

---

## GET `/curriculums/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "data": {
    "id": "1",
    "name": "Myanmar Curriculum",
    "description": "National curriculum",
    "image": "",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Curriculum not found

---

## PUT `/curriculums/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Body (all optional):**

| Field | Type | Rules |
|-------|------|-------|
| name | string | Min 1 char, trimmed |
| description | string | Trimmed |
| image | string | Trimmed |

**Response (200):**

```json
{
  "message": "Curriculum updated",
  "data": { ... }
}
```

**Errors:**
- `404` — Curriculum not found
- `409` — Curriculum name already exists

---

## DELETE `/curriculums/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{ "message": "Curriculum deleted" }
```

**Errors:**
- `404` — Curriculum not found
