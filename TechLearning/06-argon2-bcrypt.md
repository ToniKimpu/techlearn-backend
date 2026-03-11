# 06 — Argon2 / bcrypt (Password Hashing)

## Why you never store plain passwords

If your database is breached and passwords are stored as plain text, every user's account on every other website is compromised (most people reuse passwords).

The solution: store a **hash** — a one-way transformation of the password. You cannot reverse a hash back to the original password.

```
Plain password  →  hash function  →  stored hash
"mysecret123"   →  argon2         →  "$argon2id$v=19$m=65536..."

Login attempt:
"mysecret123"   →  argon2         →  same hash?  → YES → access
"wrongpassword" →  argon2         →  same hash?  → NO  → reject
```

---

## Why simple hashes (MD5, SHA256) are NOT safe for passwords

SHA256 is fast — that is its problem for passwords. An attacker with a GPU can compute **billions** of hashes per second and brute-force common passwords.

Password hashing algorithms like Argon2 and bcrypt are **intentionally slow and memory-intensive**:
- Argon2: takes ~500ms and 64MB RAM per hash → GPU attacks become impractical
- bcrypt: takes ~100ms per hash → 10,000× slower than SHA256

---

## Argon2 vs bcrypt

| Feature | Argon2 | bcrypt |
|---|---|---|
| Standard | Modern (2015 winner of Password Hashing Competition) | Older (1999) |
| Memory hardness | Yes (resists GPU/ASIC attacks) | No |
| Recommended | Yes (first choice) | Yes (fallback) |
| This project | Primary | Fallback |

---

## How this project uses Argon2

In [`src/config/passport.ts`](../src/config/passport.ts):

```ts
import argon2 from "argon2";

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      // 1. Find the user by email
      const auth = await prisma.authUser.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (!auth) {
        return done(null, false, { message: "Incorrect email" });
      }

      // 2. Compare the submitted password against the stored hash
      const match = await argon2.verify(auth.passwordHash!, password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }

      // 3. Password matches — authentication succeeds
      return done(null, auth);
    } catch (err) {
      return done(err);
    }
  })
);
```

When a user registers, the password is hashed before storing:
```ts
const passwordHash = await argon2.hash(password);
await prisma.authUser.create({
  data: { email, passwordHash },
});
```

---

## How hashing works internally

```
argon2.hash("mysecret123")
  → generates a random salt  (e.g. "randomBytes16")
  → runs the argon2 algorithm (uses 65MB RAM, multiple iterations)
  → produces:  "$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>"
```

The output includes the **salt** (random bytes mixed in before hashing). The salt means:
- Two users with the same password get different hashes
- Pre-computed attack tables (rainbow tables) are useless

```
argon2.verify("$argon2id$...$<salt>$<hash>", "mysecret123")
  → extracts salt from the stored hash
  → re-runs argon2 with the same salt and the submitted password
  → compares the result to the stored hash
  → returns true or false
```

---

## Step-by-step practice

**Task 1 — Hash and verify a password**

```ts
import argon2 from "argon2";

async function main() {
  const password = "MySecurePassword123";

  // Hash it — takes ~500ms deliberately
  console.time("hash");
  const hash = await argon2.hash(password);
  console.timeEnd("hash");
  console.log("Hash:", hash);
  // $argon2id$v=19$m=65536,t=3,p=4$...

  // Verify correct password
  const correct = await argon2.verify(hash, password);
  console.log("Correct password:", correct); // true

  // Verify wrong password
  const wrong = await argon2.verify(hash, "WrongPassword");
  console.log("Wrong password:", wrong); // false

  // Hash the same password again — different result (different salt)
  const hash2 = await argon2.hash(password);
  console.log("Same hash?", hash === hash2); // false — salts differ
}

main();
```

**Task 2 — Simulate a registration + login flow**

```ts
import argon2 from "argon2";

// Simulated database
const users: { email: string; passwordHash: string }[] = [];

async function register(email: string, password: string) {
  const passwordHash = await argon2.hash(password);
  users.push({ email, passwordHash });
  console.log(`Registered: ${email}`);
}

async function login(email: string, password: string): Promise<boolean> {
  const user = users.find((u) => u.email === email);
  if (!user) {
    console.log("User not found");
    return false;
  }

  const match = await argon2.verify(user.passwordHash, password);
  console.log(match ? "Login successful" : "Wrong password");
  return match;
}

await register("alice@example.com", "secret123");
await login("alice@example.com", "secret123");  // Login successful
await login("alice@example.com", "wrong");       // Wrong password
await login("bob@example.com", "secret123");     // User not found
```

**Task 3 — See why timing matters (constant-time comparison)**

When comparing passwords, you must not return early. The time difference between "email not found" and "wrong password" can leak information to attackers. Notice this project always calls `argon2.verify` even if the user doesn't exist (by using a dummy hash), to make both cases take the same amount of time.

Compare these:
```ts
// BAD: leaks timing information
if (!user) return false;         // returns immediately
if (!argon2.verify(...)) return false; // takes 500ms

// GOOD: constant time
const match = user ? await argon2.verify(hash, password) : false;
// Takes ~500ms in both cases
```

---

## Key takeaways

- Never store plain text passwords — always hash them
- Argon2 is memory-hard: makes GPU/ASIC brute-force attacks impractical
- `argon2.hash(password)` → creates hash with random salt embedded
- `argon2.verify(hash, password)` → safely checks if the password matches
- bcrypt is a solid fallback if argon2 is not available
- Always use a timing-safe comparison to avoid leaking whether a user exists
