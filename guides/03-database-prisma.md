# 03 — Database & Prisma

## Goal

Set up PostgreSQL with Docker, define the full Prisma schema (16 models), and connect it to Express.

---

## 3.1 Start PostgreSQL with Docker

Create `docker-compose.yml` (start with just the database):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: techlearn
      POSTGRES_PASSWORD: techlearn
      POSTGRES_DB: techlearn
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
docker compose up -d db
```

Verify it's running:
```bash
docker compose ps
# db should be "Up"
```

---

## 3.2 Install Prisma

```bash
npm install prisma @prisma/client @prisma/adapter-pg pg
npm install -D @types/pg
```

| Package | Purpose |
|---------|---------|
| `prisma` | CLI tool for migrations, schema management |
| `@prisma/client` | Auto-generated type-safe database client |
| `@prisma/adapter-pg` | Uses native `pg` driver instead of Prisma's binary engine |
| `pg` | PostgreSQL driver for Node.js |

Initialize Prisma:
```bash
npx prisma init
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

---

## 3.3 Understanding the Data Model

Before writing the schema, understand what you're modeling:

```
Authentication:
  AuthUser (email, password) ──→ Profile (name, avatar, userType)
  AuthUser ──→ Session[] (refresh tokens)
  AuthUser ──→ Identity[] (OAuth providers: email, google, github)

Educational Hierarchy:
  Curriculum ──→ Grade[] ──→ Subject[] ──→ Chapter[]
  Curriculum ──→ AcademicYear[]

User-Content Mapping (many-to-many):
  Profile ←→ Curriculum (via UserCurriculumMapping)
  Profile ←→ Grade (via UserGradeMapping)
  Profile ←→ Subject (via UserSubjectMapping)
  Profile ←→ AcademicYear (via UserAcademicYearMapping)

Location & School:
  Location ──→ Profile[]
  Profile ──→ School[]
```

**Key design decisions:**
- Auth and Profile are separate tables (separation of concerns: auth data vs profile data)
- UUIDs for user-related tables (security: can't guess user IDs)
- BigInt auto-increment for content tables (simple, sortable, efficient)
- Soft delete (`isDeleted` flag) instead of hard delete (data recovery)
- `@map` for snake_case table/column names (PostgreSQL convention)

---

## 3.4 Write the Prisma Schema

Replace `prisma/schema.prisma` with the full schema. **Type this yourself** — understanding each model and relation is crucial.

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// --- Enums ---

enum AuthProvider {
  email
  google
  github
}

// --- Auth & Identity ---

model AuthUser {
  id              String     @id @default(uuid())
  email           String     @unique
  passwordHash    String?    @map("password_hash")
  emailVerifiedAt DateTime?  @map("email_verified_at") @db.Timestamptz()
  isActive        Boolean    @default(true) @map("is_active")
  profileId       String?    @unique @map("profile_id")
  createdAt       DateTime   @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime   @updatedAt @map("updated_at") @db.Timestamptz()

  // Relations
  sessions   Session[]
  identities Identity[]
  profile    Profile?   @relation(fields: [profileId], references: [id])

  @@map("auth")
}

model Session {
  id           String   @id @default(uuid())
  authId       String   @map("auth_id")
  refreshToken String   @unique @map("refresh_token")
  expiresAt    DateTime @map("expires_at") @db.Timestamptz()
  ipAddress    String?  @map("ip_address")
  userAgent    String?  @map("user_agent")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()

  // Relations
  auth AuthUser @relation(fields: [authId], references: [id])

  @@map("sessions")
}

model Identity {
  id         String       @id @default(uuid())
  provider   AuthProvider
  providerId String       @map("provider_id")
  authId     String       @map("auth_id")
  createdAt  DateTime     @default(now()) @map("created_at") @db.Timestamptz()

  // Relations
  auth AuthUser @relation(fields: [authId], references: [id])

  @@unique([provider, providerId])
  @@map("identities")
}

// --- User Profile ---

model Profile {
  id                    String    @id @default(uuid())
  fullName              String    @map("full_name")
  avatarUrl             String?   @map("avatar_url")
  phoneNumber           String?   @map("phone_number")
  email                 String?
  gender                String    @default("")
  dob                   DateTime? @db.Date
  userType              String    @default("student") @map("user_type")
  locationId            BigInt?   @map("location_id")
  deviceId              String    @default("device_id") @map("device_id")
  fcmDeviceToken        String?   @map("fcm_device_token")
  isNotificationEnabled Boolean   @default(true) @map("is_notification_enabled")
  isDeleted             Boolean   @default(false) @map("is_deleted")
  isDeactivated         Boolean   @default(false) @map("is_deactivated")
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  // Relations
  location        Location?                @relation(fields: [locationId], references: [id])
  schools         School[]
  userCurriculums UserCurriculumMapping[]
  userGrades      UserGradeMapping[]
  userSubjects    UserSubjectMapping[]
  academicYears   UserAcademicYearMapping[]
  authUser        AuthUser?

  @@map("profiles")
}

// --- Educational Content ---

model Curriculum {
  id          BigInt   @id @default(autoincrement())
  name        String?  @unique
  description String?
  image       String   @default("")
  isDeleted   Boolean  @default(false) @map("is_deleted")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  // Relations
  academicYears AcademicYear[]
  grades        Grade[]
  users         UserCurriculumMapping[]

  @@map("curriculums")
}

model AcademicYear {
  id              BigInt    @id @default(autoincrement())
  name            String?
  startDate       DateTime  @map("start_date") @db.Date
  endDate         DateTime  @map("end_date") @db.Date
  isActiveSession Boolean?  @default(false) @map("is_active_session")
  isDeleted       Boolean?  @default(false) @map("is_deleted")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz()
  curriculumId    BigInt?   @map("curriculum_id")

  // Relations
  curriculum Curriculum?              @relation(fields: [curriculumId], references: [id])
  users      UserAcademicYearMapping[]

  @@map("academic_years")
}

model Grade {
  id           BigInt   @id @default(autoincrement())
  name         String?
  description  String?
  image        String?
  isDeleted    Boolean  @default(false) @map("is_deleted")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()
  curriculumId BigInt?  @map("curriculum_id")

  // Relations
  curriculum           Curriculum?              @relation(fields: [curriculumId], references: [id], onDelete: Restrict)
  subjects             Subject[]
  academicYearMappings UserAcademicYearMapping[]
  userGradeMappings    UserGradeMapping[]

  @@map("grades")
}

model Subject {
  id          BigInt   @id @default(autoincrement())
  name        String?
  description String?
  image       String?
  isDeleted   Boolean  @default(false) @map("is_deleted")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()
  gradeId     BigInt?  @map("grade_id")

  // Relations
  grade    Grade?                @relation(fields: [gradeId], references: [id], onDelete: Restrict)
  chapters Chapter[]
  users    UserSubjectMapping[]

  @@map("subjects")
}

model Chapter {
  id           BigInt   @id @default(autoincrement())
  title        String
  sortOrder    Decimal  @map("sort_order")
  imageUrl     String?  @map("image_url")
  label        String?
  content      String?
  teacherGuide String?  @map("teacher_guide")
  isDeleted    Boolean  @default(false) @map("is_deleted")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamp(3)
  subjectId    BigInt?  @map("subject_id")

  // Relations
  subject Subject? @relation(fields: [subjectId], references: [id], onDelete: Restrict)

  @@map("chapters")
}

// --- Location & School ---

model Location {
  id          BigInt   @id @default(autoincrement())
  name        String   @unique
  description String?
  isDeleted   Boolean  @default(false) @map("is_deleted")
  sortOrder   BigInt   @default(1) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz()

  // Relations
  profiles Profile[]

  @@map("locations")
}

model School {
  id         BigInt   @id @default(autoincrement())
  schoolName String   @map("school_name")
  userId     String   @map("user_id")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  // Relations
  user Profile @relation(fields: [userId], references: [id])

  @@map("schools")
}

// --- Join Tables (Many-to-Many) ---

model UserCurriculumMapping {
  userId       String @map("user_id")
  curriculumId BigInt @map("curriculum_id")

  user       Profile    @relation(fields: [userId], references: [id])
  curriculum Curriculum @relation(fields: [curriculumId], references: [id])

  @@id([userId, curriculumId])
  @@map("user_curriculum_mapping")
}

model UserGradeMapping {
  userId  String @map("user_id")
  gradeId BigInt @map("grade_id")

  user  Profile @relation(fields: [userId], references: [id])
  grade Grade   @relation(fields: [gradeId], references: [id])

  @@id([userId, gradeId])
  @@map("user_grade_mapping")
}

model UserSubjectMapping {
  userId    String @map("user_id")
  subjectId BigInt @map("subject_id")

  user    Profile @relation(fields: [userId], references: [id])
  subject Subject @relation(fields: [subjectId], references: [id])

  @@id([userId, subjectId])
  @@map("user_subject_mapping")
}

model UserAcademicYearMapping {
  id             BigInt  @id @default(autoincrement())
  userId         String  @map("user_id")
  studentGradeId BigInt? @map("student_grade_id")
  academicYearId BigInt? @map("academic_year_id")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz()

  user          Profile       @relation(fields: [userId], references: [id])
  studentGrade  Grade?        @relation(fields: [studentGradeId], references: [id])
  academicYear  AcademicYear? @relation(fields: [academicYearId], references: [id])

  @@map("user_academic_year_mapping")
}
```

---

## 3.5 Key Schema Concepts to Understand

### @map — Snake Case Naming
```prisma
model AuthUser {
  passwordHash String? @map("password_hash")  // Column in DB is "password_hash"
  @@map("auth")                                // Table in DB is "auth"
}
```
Prisma uses camelCase in code, but PostgreSQL convention is snake_case. `@map` bridges the gap.

### Relations
```prisma
// One-to-one: AuthUser has exactly one Profile
model AuthUser {
  profileId String? @unique @map("profile_id")
  profile   Profile? @relation(fields: [profileId], references: [id])
}

// One-to-many: Curriculum has many Grades
model Grade {
  curriculumId BigInt? @map("curriculum_id")
  curriculum   Curriculum? @relation(fields: [curriculumId], references: [id], onDelete: Restrict)
}

// Many-to-many: Profile ←→ Curriculum (via join table)
model UserCurriculumMapping {
  userId       String
  curriculumId BigInt
  @@id([userId, curriculumId])  // Composite primary key
}
```

### onDelete: Restrict
```prisma
grade Grade? @relation(fields: [gradeId], references: [id], onDelete: Restrict)
```
This means: **You cannot delete a Grade if any Subjects reference it.** The database will reject the delete. This prevents orphaned data.

### UUID vs BigInt IDs
- **UUID** (`@default(uuid())`) for auth/profile — Can't be guessed, good for user-facing IDs
- **BigInt** (`@default(autoincrement())`) for content — Simple, sortable, efficient for internal data

---

## 3.6 Generate Prisma Client & Run Migration

```bash
# Generate the type-safe client (outputs to src/generated/prisma/)
npx prisma generate

# Create and apply the migration
npx prisma migrate dev --name init
```

The migration creates all tables in your PostgreSQL database. Prisma stores migration SQL in `prisma/migrations/`.

To view your database:
```bash
npx prisma studio
# Opens a web UI at http://localhost:5555
```

---

## 3.7 Create the Prisma Client Module

Create `src/database/prisma.ts`:

```typescript
import { PrismaClient } from "../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL!;

// Use native pg driver with Prisma adapter
// This gives you connection pooling and more control
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("db:5432")
    ? undefined
    : { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
```

**Why use the pg adapter?**
- Prisma's default binary engine is large and platform-specific
- The pg adapter uses the standard `pg` driver (smaller, more compatible)
- Gives you proper connection pooling via `pg.Pool`
- The SSL logic: skip SSL for local development, require it for production

---

## 3.8 Update Health Check

Now update `src/app.ts` to test the database in the health check:

```typescript
import { prisma } from "./database/prisma.js";

// Update the health check route:
app.get("/health", async (_req: Request, res: Response) => {
  const health: Record<string, string> = {};

  // Test database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = "ok";
  } catch {
    health.database = "error";
  }

  const isHealthy = Object.values(health).every((v) => v === "ok");

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    uptime: process.uptime(),
    checks: health,
  });
});
```

---

## 3.9 Update Graceful Shutdown

In `src/server.ts`, add Prisma disconnect:

```typescript
import { prisma } from "./database/prisma.js";

// Inside the shutdown function:
await prisma.$disconnect();
```

---

## 3.10 Test It

```bash
# Make sure PostgreSQL is running
docker compose up -d db

# Start the dev server
npm run dev

# Test health check (should show database: ok)
curl http://localhost:4000/health
```

---

## Checkpoint

- [x] PostgreSQL running in Docker
- [x] Full Prisma schema with 16 models
- [x] Relations: one-to-one, one-to-many, many-to-many
- [x] Snake_case DB naming with @map
- [x] Prisma client with pg adapter
- [x] Health check tests database
- [x] Graceful shutdown disconnects Prisma

**Commit:** `git commit -m "add PostgreSQL, Prisma schema with 16 models, database health check"`

---

## Key Concepts to Understand

1. **Prisma schema language** — Read: https://www.prisma.io/docs/orm/prisma-schema
2. **Database relations** — Read: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations
3. **Migrations** — Read: https://www.prisma.io/docs/orm/prisma-migrate
4. **Connection pooling** — Why it matters: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections
5. **UUID vs auto-increment** — Trade-offs: https://www.cybertec-postgresql.com/en/uuid-serial-or-identity-columns-for-postgresql-auto-generated-primary-keys/
