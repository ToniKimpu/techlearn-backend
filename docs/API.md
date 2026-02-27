# TechLearn API

**Base URL:** `http://localhost:4000/api/v1`

## Auth

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| POST | `/auth/logout` | No |
| POST | `/auth/logout-all` | Yes |
| POST | `/auth/refresh-token` | No |

## Curriculums

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/curriculums` | Yes |
| GET | `/curriculums` | Yes |
| GET | `/curriculums/:id` | Yes |
| PUT | `/curriculums/:id` | Yes |
| DELETE | `/curriculums/:id` | Yes |

## Grades

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/grades` | Yes |
| GET | `/grades` | Yes |
| GET | `/grades/:id` | Yes |
| PUT | `/grades/:id` | Yes |
| DELETE | `/grades/:id` | Yes |

## Subjects

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/subjects` | Yes |
| GET | `/subjects` | Yes |
| GET | `/subjects/:id` | Yes |
| PUT | `/subjects/:id` | Yes |
| DELETE | `/subjects/:id` | Yes |

## Chapters

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/chapters` | Yes |
| GET | `/chapters` | Yes |
| GET | `/chapters/:id` | Yes |
| PUT | `/chapters/:id` | Yes |
| DELETE | `/chapters/:id` | Yes |

## Upload

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/upload` | Yes |

---

**Total: 26 endpoints**

For detailed docs (body, query, response), see the [api/](./api/) folder.
