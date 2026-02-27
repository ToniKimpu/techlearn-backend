# Subjects API

**Base URL:** `/api/v1`
**Auth Required:** Yes — `Authorization: Bearer <accessToken>`

---

## Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/subjects` |
| GET | `/subjects` |
| GET | `/subjects/:id` |
| PUT | `/subjects/:id` |
| DELETE | `/subjects/:id` |

---

## POST `/subjects`

**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| name | string | Yes | Min 1 char, trimmed |
| description | string | No | Trimmed |
| image | string | No | Trimmed |
| gradeId | string \| number | Yes | Valid positive BigInt |

**Response (201):**

```json
{
  "message": "Subject created",
  "data": {
    "id": "1",
    "name": "Mathematics",
    "description": null,
    "image": null,
    "gradeId": "1",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Grade not found

---

## GET `/subjects`

**Query:**

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| page | number | 1 | Positive integer |
| limit | number | 10 | Positive integer, max 100 |
| search | string | — | Searches name & description |
| gradeId | string \| number | — | Filter by grade |

**Response (200):**

```json
{
  "data": [
    {
      "id": "1",
      "name": "Mathematics",
      "description": null,
      "image": null,
      "gradeId": "1",
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

## GET `/subjects/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "data": {
    "id": "1",
    "name": "Mathematics",
    "description": null,
    "image": null,
    "gradeId": "1",
    "isDeleted": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Errors:**
- `404` — Subject not found

---

## PUT `/subjects/:id`

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
| gradeId | string \| number | Valid positive BigInt |

**Response (200):**

```json
{
  "message": "Subject updated",
  "data": { ... }
}
```

**Errors:**
- `404` — Subject not found / Grade not found

---

## DELETE `/subjects/:id`

**Params:**

| Field | Type | Rules |
|-------|------|-------|
| id | string \| number | Valid positive BigInt |

**Response (200):**

```json
{ "message": "Subject deleted" }
```

**Errors:**
- `404` — Subject not found
