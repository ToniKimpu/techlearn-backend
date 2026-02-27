# Grades API

**Base URL:** `/api/v1`
**Auth Required:** Yes — `Authorization: Bearer <accessToken>`

---

## Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/grades` |
| GET | `/grades` |
| GET | `/grades/:id` |
| PUT | `/grades/:id` |
| DELETE | `/grades/:id` |

---

## POST `/grades`

**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| name | string | Yes | Min 1 char, trimmed |
| description | string | No | Trimmed |
| image | string | No | Trimmed |
| curriculumId | string \| number | Yes | Valid positive BigInt |

**Response (201):**

```json
{
  "message": "Grade created",
  "data": {
    "id": "1",
    "name": "Grade 1",
    "description": null,
    "image": null,
    "curriculumId": "1",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Curriculum not found

---

## GET `/grades`

**Query:**

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| page | number | 1 | Positive integer |
| limit | number | 10 | Positive integer, max 100 |
| search | string | — | Searches name & description |
| curriculumId | string \| number | — | Filter by curriculum |

**Response (200):**

```json
{
  "data": [
    {
      "id": "1",
      "name": "Grade 1",
      "description": null,
      "image": null,
      "curriculumId": "1",
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

## GET `/grades/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "data": {
    "id": "1",
    "name": "Grade 1",
    "description": null,
    "image": null,
    "curriculumId": "1",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Grade not found

---

## PUT `/grades/:id`

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
| curriculumId | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "message": "Grade updated",
  "data": { ... }
}
```

**Errors:**
- `404` — Grade not found / Curriculum not found

---

## DELETE `/grades/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{ "message": "Grade deleted" }
```

**Errors:**
- `404` — Grade not found
