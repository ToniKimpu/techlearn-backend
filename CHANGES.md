# Techlearn Backend — Refactor Summary

## 1. IMMEDIATE — Credential cleanup

- Removed `credential.md`, `all_tables.txt`, `tables_structure.txt` from git tracking (`git rm --cached`)
- Added all three to `.gitignore`
- **ACTION REQUIRED**: Rotate the database password on Supabase Dashboard > Settings > Database, then update your `.env` file. The old password was exposed in git history.

## 2. SOON — Architecture fixes

| File | What changed |
|------|-------------|
| `src/config/env.ts` | **New** — validates `JWT_SECRET` and `DATABASE_URL` exist at startup, crashes immediately if missing |
| `src/app.ts` | Removed `express-session`, `passport.session()`, movies import. Exported `CORS_ORIGIN` for reuse. Removed duplicate `dotenv.config()` |
| `src/server.ts` | Socket.IO CORS now uses same `CORS_ORIGIN` (was `"*"`). Imports `env.ts` first for startup validation |
| `src/config/passport.ts` | Removed `serializeUser`/`deserializeUser` — unused since auth is JWT-based |
| `src/modules/auth/routes.ts` | Added `requireAuth` middleware to `/logout-all` (was unprotected). Fixed field names to match schema (`fullName`, `userType`) |
| `package.json` | Removed `express-session` + `@types/express-session` |

## 3. OVER TIME — Quality improvements

| Change | Details |
|--------|---------|
| **Rate limiting** | `express-rate-limit` on `/auth/register` and `/auth/login` — 20 requests per 15 minutes per IP |
| **Password validation** | Minimum 8 characters on registration |
| **Unified naming** | All Prisma schema fields now use camelCase (`fullName`, `userType`, `isDeleted`, `createdAt`, etc.) with `@map("snake_case")` to preserve existing DB column names |
| **Route consistency** | `POST /curriculum` fixed to `POST /curriculums` (plural, matching all other routes) |
| **Dead code removed** | Deleted entire `src/modules/movies/` module |
| **Tests** | Added vitest + 13 unit tests across 3 test files — JWT generation/verification, session token utilities, and requireAuth middleware |
| **Test scripts** | `npm test` now runs vitest; `npm run test:watch` for dev mode |

## Packages added

- `express-rate-limit` — auth route brute-force protection
- `vitest` — test runner
- `supertest` + `@types/supertest` — HTTP assertion library (available for future integration tests)

## Packages removed

- `express-session` + `@types/express-session` — no longer needed since auth is fully JWT-based
