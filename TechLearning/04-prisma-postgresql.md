# 04 — Prisma + PostgreSQL

## What is PostgreSQL?

PostgreSQL is a relational database. Data is stored in **tables** (like spreadsheets) with rows and columns. Tables relate to each other through foreign keys.

```
Table: auth                    Table: profiles
┌──────────────────────┐       ┌──────────────────────────┐
│ id   email    ...    │       │ id       full_name  ...  │
│ uuid alice@..  ...   │──────▶│ uuid     Alice      ...  │
└──────────────────────┘       └──────────────────────────┘
      (auth.profile_id = profiles.id)
```

You communicate with PostgreSQL using **SQL** (Structured Query Language).

---

## What is Prisma?

Prisma is an **ORM** (Object Relational Mapper). It sits between your Node.js code and the database:

```
Node.js code
    ↓
Prisma Client  (type-safe, auto-generated)
    ↓
PostgreSQL
```

Instead of writing raw SQL, you write TypeScript. Prisma translates it to SQL for you:

```ts
// Prisma (what you write)
const user = await prisma.authUser.findUnique({
  where: { email: "alice@example.com" },
});

// SQL (what Prisma generates)
SELECT * FROM "auth" WHERE email = 'alice@example.com' LIMIT 1;
```

Benefits:
- **Type-safe**: autocomplete on models, TypeScript errors for wrong field names
- **Migrations**: schema changes are versioned and tracked
- **Readable**: code reads like English, not SQL

---

## How this project uses Prisma

### The schema

[`prisma/schema.prisma`](../prisma/schema.prisma) defines every table. Here is a simplified view of the auth tables:

```prisma
model AuthUser {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?   @map("password_hash")
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())

  sessions Session[]    // one AuthUser → many Sessions
  profileId String?     @unique
  profile   Profile?    @relation(fields: [profileId], references: [id])

  @@map("auth")          // the actual table name in PostgreSQL
}

model Session {
  id           String   @id @default(uuid())
  authId       String   @map("auth_id")
  refreshToken String   @unique @map("refresh_token")
  expiresAt    DateTime @map("expires_at")
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  auth AuthUser @relation(fields: [authId], references: [id])

  @@map("sessions")
}
```

Notice:
- `@id` marks the primary key
- `@unique` adds a unique constraint
- `@default(uuid())` auto-generates UUIDs
- `@map("column_name")` maps camelCase TS names to snake_case DB columns
- `@@map("table_name")` maps the model name to the actual table name
- Relations are declared with `@relation(fields: [...], references: [...])`

### The client

[`src/database/prisma.ts`](../src/database/prisma.ts) creates the single shared Prisma client:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../../generated/prisma/index.js";

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
```

This `prisma` object is imported throughout the app whenever a database operation is needed.

---

## Core Prisma operations

### Create

```ts
const newUser = await prisma.authUser.create({
  data: {
    email: "alice@example.com",
    passwordHash: hashedPassword,
  },
});
// Returns the created row as a typed object
```

### Find one

```ts
// Throws if not found? No — returns null
const user = await prisma.authUser.findUnique({
  where: { email: "alice@example.com" },
});

// Throws if not found
const user = await prisma.authUser.findUniqueOrThrow({
  where: { id: userId },
});
```

### Find many with filters

```ts
const sessions = await prisma.session.findMany({
  where: {
    authId: userId,
    expiresAt: { gt: new Date() }, // expiresAt > now
  },
  orderBy: { createdAt: "desc" },
  take: 10,
  skip: 0,
});
```

### Update

```ts
const updated = await prisma.authUser.update({
  where: { id: userId },
  data: {
    isActive: false,
    updatedAt: new Date(),
  },
});
```

### Delete

```ts
await prisma.session.delete({
  where: { refreshToken: token },
});

// Delete many
await prisma.session.deleteMany({
  where: { authId: userId },
});
```

### Relations — include related data

```ts
const user = await prisma.authUser.findUnique({
  where: { email },
  include: {
    profile: true,    // join the profile table
    sessions: true,   // join all sessions
  },
});

// user.profile.fullName ← fully typed
// user.sessions[0].ipAddress ← fully typed
```

### Transactions

When multiple operations must succeed or fail together:

```ts
const [auth, profile] = await prisma.$transaction([
  prisma.authUser.create({ data: { email, passwordHash } }),
  prisma.profile.create({ data: { fullName, gender, userType: "student" } }),
]);
// If either fails, both are rolled back
```

---

## Migrations

When you change `schema.prisma`, you need to create a migration:

```bash
# Creates a new migration file and applies it to the database
npx prisma migrate dev --name add_phone_field

# Apply pending migrations (production)
npx prisma migrate deploy

# Reset the database (dev only — DELETES ALL DATA)
npx prisma migrate reset

# Open a browser-based database viewer
npx prisma studio
```

---

## Step-by-step practice

**Task 1 — Set up a fresh Prisma project**

```bash
mkdir prisma-practice && cd prisma-practice
npm init -y
npm install prisma @prisma/client
npm install -D typescript tsx
npx prisma init
```

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

```bash
# Create the table in your database
npx prisma migrate dev --name init

# Generate the client
npx prisma generate
```

**Task 2 — Write a service**

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create
  const post = await prisma.post.create({
    data: { title: "Hello Prisma", content: "My first post" },
  });
  console.log("Created:", post);

  // Read all
  const allPosts = await prisma.post.findMany();
  console.log("All posts:", allPosts);

  // Update
  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { published: true },
  });
  console.log("Published:", updated);

  // Delete
  await prisma.post.delete({ where: { id: post.id } });
  console.log("Deleted");
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

**Task 3 — Add a relation**

Add a `Comment` model with a foreign key to `Post`:

```prisma
model Post {
  id       Int       @id @default(autoincrement())
  title    String
  comments Comment[]
}

model Comment {
  id      Int    @id @default(autoincrement())
  text    String
  postId  Int
  post    Post   @relation(fields: [postId], references: [id])
}
```

Run `npx prisma migrate dev --name add_comments` and then:

```ts
// Create a post with a comment in one query
const post = await prisma.post.create({
  data: {
    title: "With comments",
    comments: {
      create: [{ text: "Great post!" }],
    },
  },
  include: { comments: true },
});
console.log(post.comments); // [{ id: 1, text: "Great post!", postId: 1 }]
```

---

## Key takeaways

- PostgreSQL stores data in tables; Prisma maps TypeScript objects to those tables
- `schema.prisma` is the single source of truth for your database structure
- Migrations track every schema change — never edit the database manually
- `prisma.model.findMany/findUnique/create/update/delete` are the main operations
- `include` joins related tables in a single query
- `$transaction` ensures multiple operations succeed or fail together
