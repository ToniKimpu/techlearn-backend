# 18 — ESLint + Prettier + Husky + lint-staged

## The problem these tools solve

On a team without code quality tools:
- Developer A uses 2-space indentation, Developer B uses 4-space
- Developer C commits unused variables that cause runtime errors
- Code reviews waste time on formatting debates instead of logic
- A missing `await` on an async call causes subtle bugs

These four tools enforce consistent standards **automatically**, before any code reaches the repository.

---

## ESLint — find bugs before they happen

ESLint is a **static analyzer** — it reads your code and finds problems without running it.

```ts
// ESLint catches these:
const user = getUser(); // missing await — returns Promise, not User
if (user.name) { ... }  // error: Cannot read property 'name' of [object Promise]

const unusedVar = 42;   // defined but never used — dead code
```

### How this project configures ESLint

`eslint.config.mjs` in the backend root:

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,          // standard JS rules
  ...tseslint.configs.recommended,     // TypeScript-specific rules
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",       // warn on `any` type
      "@typescript-eslint/no-unused-vars": "error",       // error on unused vars
      // add your own rules here
    },
  }
);
```

### Running ESLint

```bash
npm run lint          # check all files
npm run lint -- --fix # auto-fix fixable issues
```

### Common ESLint rules to know

```ts
// no-unused-vars — catches dead code
const result = getValue(); // "result" declared but never used → error

// @typescript-eslint/no-explicit-any — discourages bypassing type safety
function process(data: any) { ... } // → warning (use unknown instead)

// no-console — forces use of a proper logger
console.log("debug"); // → warning

// require-await — catches async functions that don't actually await anything
async function getUser() { // this is sync, just returns a value
  return { name: "Alice" }; // → warning: remove async
}
```

---

## Prettier — automatic formatting

Prettier is an **opinionated code formatter**. It ignores your formatting and reprints the code in a consistent style.

```ts
// You write:
const user={name:'Alice',email:'alice@example.com',role:'admin'}

// Prettier reformats to:
const user = {
  name: "Alice",
  email: "alice@example.com",
  role: "admin",
};
```

The key point: you stop thinking about formatting entirely. Save the file, Prettier fixes it.

### How this project configures Prettier

`.prettierrc` (or `prettier.config.mjs`):

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Running Prettier

```bash
npm run format            # format all files
npx prettier --check .    # check without changing (useful in CI)
```

### ESLint + Prettier integration

They could conflict — ESLint has some formatting rules, Prettier has different opinions. `eslint-config-prettier` disables all ESLint formatting rules, letting Prettier win:

```js
// eslint.config.mjs
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig, // ← disables ESLint formatting rules
);
```

Rule of thumb: **ESLint for bugs, Prettier for formatting**. They do different jobs.

---

## Husky — Git hooks

Husky runs scripts automatically when Git events occur. The most common hook is `pre-commit` — runs before every `git commit`.

```
git commit -m "Add feature"
    ↓
Husky: pre-commit hook fires
    ↓
lint-staged runs
    ↓
ESLint + Prettier check staged files
    ↓
If errors: commit is blocked
If clean: commit proceeds
```

### How this project uses Husky

`.husky/pre-commit`:
```bash
npx lint-staged
```

This runs lint-staged on every commit.

### Setting up Husky (for reference)

```bash
npm install --save-dev husky
npx husky init
# Creates .husky/pre-commit
```

---

## lint-staged — run tools only on changed files

Running ESLint on the entire codebase on every commit would be slow. `lint-staged` only runs on files that are **staged for commit** (changed files).

### Configuration in `package.json`

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

This means:
- For every `.ts` file you staged: run ESLint (auto-fix) then Prettier
- For every `.json` or `.md` file: run Prettier
- Only files you changed — fast!

---

## The full workflow in practice

```
1. You edit src/modules/curriculums/service.ts
2. You run: git add src/modules/curriculums/service.ts
3. You run: git commit -m "Fix curriculum query"
4. Husky fires: pre-commit
5. lint-staged runs on service.ts only:
   a. ESLint: finds unused variable → auto-fixes it
   b. Prettier: reformats the file
6. lint-staged re-stages the fixed file automatically
7. Commit proceeds with clean code
```

If ESLint finds an error it cannot auto-fix, the commit is blocked until you fix it manually.

---

## Step-by-step practice

**Task 1 — Trigger an ESLint error**

In any TypeScript file, add:
```ts
const unusedVariable = "I am never used";
```

Then run:
```bash
npm run lint
```

Observe the error: `'unusedVariable' is assigned a value but never used`.

Now fix it by removing the variable, then run lint again to see it pass.

**Task 2 — See Prettier in action**

Take a TypeScript file and intentionally mess up the formatting:
```ts
const x={a:1,b:2,c:3}
function doSomething(a:string,b:number,c:boolean){return a+b+c}
```

Then run:
```bash
npx prettier --write src/path/to/file.ts
```

Watch Prettier reformat it correctly.

**Task 3 — Test the commit hook**

Add an ESLint error (unfixable by `--fix`) to a staged file:

```ts
// Add this to any file you're about to commit
const x: any = getValue(); // using `any` triggers the rule
x.nonexistentMethod();
```

Stage it and try to commit:
```bash
git add .
git commit -m "test"
```

The commit should be blocked with the ESLint error. Fix the error, then commit successfully.

**Task 4 — Write a custom ESLint rule (conceptual)**

Understanding how rules work:

```js
// In eslint.config.mjs, add a custom rule
{
  rules: {
    "no-console": "error",           // disallow console.log
    "prefer-const": "error",         // always use const instead of let when possible
    "no-var": "error",               // ban var, use let/const
    "eqeqeq": "error",              // ban ==, use ===
    "@typescript-eslint/no-explicit-any": "error", // ban any type
  }
}
```

After adding rules, run `npm run lint` and see how many violations exist in the codebase. Fix them one by one.

---

## Key takeaways

- **ESLint** finds bugs and code quality issues before runtime
- **Prettier** enforces consistent formatting — you stop arguing about style
- **`eslint-config-prettier`** prevents ESLint and Prettier from conflicting
- **Husky** runs checks automatically before every commit — no manual step needed
- **lint-staged** runs tools only on changed files — keeps commits fast
- The workflow: write code → commit → hooks run → errors fixed or blocked → clean commit lands
- This combination is standard across the industry — you will see it in every serious Node.js project
