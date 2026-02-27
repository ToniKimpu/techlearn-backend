# Auth API

**Base URL:** `/api/v1`
**Rate Limited:** Register & Login — 20 requests per 15 minutes

---

## Endpoints

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| POST | `/auth/logout` | No |
| POST | `/auth/logout-all` | Yes |
| POST | `/auth/refresh-token` | No |

---

## POST `/auth/register`

**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| email | string | Yes | Valid email |
| password | string | Yes | Min 6 characters |
| name | string | Yes | Non-empty, trimmed |

**Response (201):**

```json
{
  "message": "Registered & logged in",
  "accessToken": "jwt-token",
  "refreshToken": "random-token",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "student"
  }
}
```

**Errors:**
- `400` — Email already exists

---

## POST `/auth/login`

**Body:**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| email | string | Yes | Valid email |
| password | string | Yes | Min 1 character |

**Response (200):**

```json
{
  "message": "Login successful",
  "accessToken": "jwt-token",
  "refreshToken": "random-token",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "student"
  }
}
```

**Errors:**
- `401` — Invalid credentials

---

## POST `/auth/logout`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| refreshToken | string | Yes |

**Response (200):**

```json
{ "message": "Logged out successfully" }
```

---

## POST `/auth/logout-all`

**Headers:** `Authorization: Bearer <accessToken>`

**Response (200):**

```json
{ "message": "Logged out from all devices" }
```

---

## POST `/auth/refresh-token`

**Body:**

| Field | Type | Required |
|-------|------|----------|
| refreshToken | string | Yes |

**Response (200):**

```json
{
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-token",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "student"
  }
}
```

**Errors:**
- `401` — Invalid or expired refresh token
