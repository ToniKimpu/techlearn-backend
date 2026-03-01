# 01 — Project Setup

## Goal

Set up a Node.js + TypeScript project with ES modules, folder structure, and code quality tools.

---

## 1.1 Initialize the Project

```bash
mkdir techlearn-backend && cd techlearn-backend
npm init -y
git init
```

Edit `package.json` — add `"type": "module"` (this enables ES module imports):

```json
{
  "name": "techlearn-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {}
}
```

**Why ES modules?** Node.js supports two module systems: CommonJS (`require()`) and ESM (`import`). ESM is the standard going forward. TypeScript's `NodeNext` module mode works best with it.

---

## 1.2 Install TypeScript

```bash
npm install -D typescript tsx @types/node
```

| Package | Purpose |
|---------|---------|
| `typescript` | The compiler — turns .ts into .js |
| `tsx` | Runs .ts files directly (for development) |
| `@types/node` | Type definitions for Node.js built-in modules |

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/legacy"]
}
```

**Key settings to understand:**

- `target: ES2022` — What JS version to compile to. ES2022 supports top-level await, private fields, etc.
- `module: NodeNext` — Use Node.js ESM module system. Requires `.js` extensions in imports.
- `strict: true` — Enables all strict type checks. This is non-negotiable for serious projects.
- `rootDir/outDir` — Source code lives in `src/`, compiled JS goes to `dist/`.
- `sourceMap: true` — Maps compiled JS back to TS for debugging.

**Important:** With `NodeNext`, you must use `.js` extensions in imports even though the files are `.ts`:
```typescript
// Correct
import { prisma } from "../database/prisma.js";
// Wrong (will fail at runtime)
import { prisma } from "../database/prisma";
```

---

## 1.3 Create Folder Structure

```bash
mkdir -p src/{config,database,middlewares,modules,types,utils,schemas,openapi,__tests__}
mkdir -p src/modules/{auth,curriculums,grades,subjects,chapters,email,upload}
mkdir -p prisma
```

The structure:

```
src/
  config/         ← Configuration (env, redis, passport, email, queue, roles)
  database/       ← Database clients (Prisma, Supabase)
  middlewares/    ← Express middlewares (auth, validation, rate limiting)
  modules/        ← Feature modules (each has routes, service, schemas)
    auth/
    curriculums/
    grades/
    subjects/
    chapters/
    email/
    upload/
  openapi/        ← OpenAPI/Swagger setup
  schemas/        ← Shared Zod schemas
  types/          ← TypeScript type declarations
  utils/          ← Utility functions (errors, jwt, cache, logger)
  __tests__/      ← Test files
  app.ts          ← Express app setup
  server.ts       ← Entry point (creates HTTP server)
  instrumentation.ts ← OpenTelemetry (added later)
prisma/
  schema.prisma   ← Database schema
```

**Why this structure?** Grouping by feature (modules) instead of by type (all routes in one folder, all services in another) keeps related code together. When you work on "grades", everything is in `src/modules/grades/`.

---

## 1.4 Add Scripts to package.json

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "npx prisma generate && tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "prepare": "husky"
  }
}
```

- `dev` — Hot-reloading dev server (tsx watches for file changes)
- `build` — Generate Prisma client + compile TypeScript to JS
- `start` — Run compiled production code
- `typecheck` — Check types without producing output (useful in CI)

---

## 1.5 Create .env and .env.example

Create `.env.example` (committed to git — shows what vars are needed):

```env
# Database
DATABASE_URL=postgresql://techlearn:techlearn@localhost:5432/techlearn?sslmode=disable
DIRECT_URL=postgresql://techlearn:techlearn@localhost:5432/techlearn?sslmode=disable

# Auth
JWT_SECRET=your-secret-key-at-least-32-characters-long

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Frontend
FRONTEND_URL=http://localhost:3000

# Redis (optional — app works without it, just no caching)
REDIS_URL=redis://localhost:6379

# Server
PORT=4000

# Email (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@techlearn.app

# Observability (optional)
LOG_LEVEL=info
OTEL_SDK_DISABLED=true
OTEL_SERVICE_NAME=techlearn-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

Create `.env` (NOT committed — has your real values):

```bash
cp .env.example .env
# Edit .env with your actual values
```

---

## 1.6 Create .gitignore

```gitignore
node_modules/
dist/
.env
*.log
src/generated/
```

---

## 1.7 Set Up ESLint (Flat Config)

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-config-prettier
```

Create `eslint.config.js`:

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default [
  // Global ignores
  {
    ignores: ["dist/", "src/generated/", "legacy/", "src/legacy/", "node_modules/"],
  },

  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  // Project-wide rules
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Test file overrides
  {
    files: ["src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];
```

**What each rule does:**

- `no-console: warn` — Reminds you to use a proper logger instead of `console.log`
- `no-unused-vars: error` — Catches dead code. `_` prefix means intentionally unused.
- `no-explicit-any: warn` — Nudges you toward proper types, but doesn't block you.
- `prettierConfig` — Disables ESLint rules that conflict with Prettier formatting.

---

## 1.8 Set Up Prettier

```bash
npm install -D prettier
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "crlf"
}
```

Create `.prettierignore`:

```
dist/
node_modules/
src/generated/
```

**Prettier vs ESLint:** Prettier handles formatting (spaces, commas, line length). ESLint handles logic (unused vars, type safety). They complement each other — `eslint-config-prettier` prevents conflicts.

---

## 1.9 Set Up Husky + lint-staged (Pre-commit Hooks)

```bash
npm install -D husky lint-staged
npx husky init
```

Edit `.husky/pre-commit`:

```bash
npx lint-staged
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "src/**/*.ts": [
      "prettier --write",
      "eslint --fix"
    ]
  }
}
```

**What this does:** Every time you `git commit`, Husky runs lint-staged which:
1. Formats staged `.ts` files with Prettier
2. Fixes lint issues with ESLint
3. If either fails, the commit is blocked

This guarantees no poorly formatted code gets committed.

---

## 1.10 Verify Everything Works

Create a quick test file `src/server.ts`:

```typescript
console.log("Hello from TypeScript!");
```

Run it:

```bash
npx tsx src/server.ts
# Should print: Hello from TypeScript!
```

Test the build:

```bash
npx tsc
# Should create dist/server.js
```

Test linting:

```bash
npm run lint
# Should warn about console.log
```

Test formatting:

```bash
npm run format:check
# Should pass
```

Clean up — we'll replace `src/server.ts` content in the next guide.

---

## Checkpoint

At this point you should have:

- [x] Node.js project with `"type": "module"`
- [x] TypeScript with strict mode
- [x] Folder structure matching the architecture
- [x] ESLint flat config with TypeScript support
- [x] Prettier for formatting
- [x] Husky pre-commit hooks
- [x] `.env.example` documenting all variables
- [x] `.gitignore` excluding dist, node_modules, .env
- [x] Scripts: dev, build, start, lint, format, test

**Commit:** `git add -A && git commit -m "init project with TypeScript, ESLint, Prettier, Husky"`

---

## Key Concepts to Understand

1. **ES Modules vs CommonJS** — Read: https://nodejs.org/api/esm.html
2. **tsconfig.json options** — Read: https://www.typescriptlang.org/tsconfig
3. **ESLint flat config** — Read: https://eslint.org/docs/latest/use/configure/configuration-files
4. **Why strict TypeScript?** — Catches null/undefined errors, enforces type safety, prevents entire categories of bugs at compile time.
