# Chapters API

**Base URL:** `/api/v1`
**Auth Required:** Yes — `Authorization: Bearer <accessToken>`

---

## Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/chapters` |
| GET | `/chapters` |
| GET | `/chapters/:id` |
| PUT | `/chapters/:id` |
| DELETE | `/chapters/:id` |

---

## POST `/chapters`

**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| title | string | Yes | Min 1 char, trimmed |
| sortOrder | number | Yes | — |
| imageUrl | string | No | Trimmed |
| label | string | No | Trimmed |
| content | string | No | Trimmed |
| teacherGuide | string | No | Trimmed |
| subjectId | string \| number | Yes | Valid positive BigInt |

**Response (201):**

```json
{
  "message": "Chapter created",
  "data": {
    "id": "1",
    "title": "Introduction",
    "sortOrder": 1,
    "imageUrl": null,
    "label": null,
    "content": null,
    "teacherGuide": null,
    "subjectId": "1",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Subject not found

---

## GET `/chapters`

**Query:**

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| page | number | 1 | Positive integer |
| limit | number | 10 | Positive integer, max 100 |
| search | string | — | Searches title & label |
| subjectId | string \| number | — | Filter by subject |

**Response (200):**

```json
{
  "data": [
    {
      "id": "1",
      "title": "Introduction",
      "sortOrder": 1,
      "imageUrl": null,
      "label": null,
      "content": null,
      "teacherGuide": null,
      "subjectId": "1",
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

## GET `/chapters/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "data": {
    "id": "1",
    "title": "Introduction",
    "sortOrder": 1,
    "imageUrl": null,
    "label": null,
    "content": null,
    "teacherGuide": null,
    "subjectId": "1",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Chapter not found

---

## PUT `/chapters/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Body (all optional):**

| Field | Type | Rules |
|-------|------|-------|
| title | string | Min 1 char, trimmed |
| sortOrder | number | — |
| imageUrl | string | Trimmed |
| label | string | Trimmed |
| content | string | Trimmed |
| teacherGuide | string | Trimmed |
| subjectId | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "message": "Chapter updated",
  "data": { ... }
}
```

**Errors:**
- `404` — Chapter not found / Subject not found

---

## DELETE `/chapters/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{ "message": "Chapter deleted" }
```

**Errors:**
- `404` — Chapter not found
