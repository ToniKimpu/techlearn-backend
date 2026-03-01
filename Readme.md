# techlearn-backend

Node.js REST API for the TechLearn platform.

**Stack:** Express · TypeScript · Prisma · PostgreSQL · Socket.IO · JWT Auth

---

## Environment Variables

Create a `.env` file in this directory:

```env
# Required
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?pgbouncer=true"
JWT_SECRET="your-secret-key-min-32-chars"

# Optional — used by Prisma migrate (direct connection, no pgbouncer)
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

# Optional — CORS origin for the frontend (default: http://localhost:3000)
FRONTEND_URL="http://localhost:3000"

# Optional — server port (default: 4000)
PORT=4000
```

> **Note:** `DATABASE_URL` is the pooled connection used at runtime.
> `DIRECT_URL` is the direct connection used by `prisma migrate` — set this if your DB uses a pooler (e.g. Supabase PgBouncer).

---

## Setup & Running

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

If running migrations for the first time (requires `DIRECT_URL`):

```bash
npx prisma migrate dev
```

If the database already has tables and you just need to sync the Prisma client:

```bash
npx prisma generate
```

### 3. Start the dev server

```bash
npm run dev
```

The server starts on **http://localhost:4000** (or the `PORT` you set).

You should see:

```
Server running on http://localhost:4000
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with hot-reload (uses `tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run the compiled build (`dist/server.js`) |
| `npm run typecheck` | Type-check without emitting files |
| `npm run test` | Run all unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

---

## API Endpoints

### Auth (public)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | `{ email, password, name }` | Register a new user |
| `POST` | `/auth/login` | `{ email, password }` | Login — returns tokens |
| `POST` | `/auth/logout` | `{ refreshToken }` | Invalidate a session |
| `POST` | `/auth/refresh-token` | `{ refreshToken }` | Get a new access token |

### Auth (protected — requires `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/logout-all` | Logout from all devices |

### Curriculums (protected)

| Method | Path | Query / Body | Description |
|--------|------|-------------|-------------|
| `GET` | `/curriculums` | `?page=1&limit=10&search=` | List (paginated + search) |
| `GET` | `/curriculums/:id` | — | Get single curriculum |
| `POST` | `/curriculums` | `{ name, description?, image? }` | Create |
| `PUT` | `/curriculums/:id` | `{ name?, description?, image? }` | Update |
| `DELETE` | `/curriculums/:id` | — | Soft delete |

### Auth token format

```
Authorization: Bearer <accessToken>
```

- **Access token** expires in **30 minutes**
- **Refresh token** expires in **30 days**

---

## Prisma Commands

```bash
# Format schema file
npx prisma format

# Validate schema
npx prisma validate

# Regenerate Prisma client after schema changes
npx prisma generate

# Create and apply a migration (needs DIRECT_URL)
npx prisma migrate dev --name <migration-name>

# Push schema changes without creating a migration file
npx prisma db push

# Open Prisma Studio (visual DB browser)
npx prisma studio
```

---

## Project Structure

```
src/
  config/
    env.ts          # Validates required env vars on startup
    passport.ts     # Passport Local strategy (email/password)
  database/
    prisma.ts       # Prisma client singleton
  middlewares/
    requireAuth.ts  # JWT auth middleware — sets req.authUser
  modules/
    auth/
      routes.ts     # All /auth/* endpoints
    curriculums/
      routes.ts     # All /curriculums/* endpoints
  types/
    jwt.ts          # JwtUserPayload type
    express.d.ts    # Express Request augmentation (req.authUser)
  utils/
    jwt.ts          # generateAccessToken / verifyAccessToken
    session.ts      # generateRefreshToken / getSessionExpiry
  app.ts            # Express app setup, CORS, routes
  server.ts         # HTTP server + Socket.IO bootstrap
prisma/
  schema.prisma     # Database schema
```
