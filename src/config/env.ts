import "dotenv/config";

const required = ["JWT_SECRET", "DATABASE_URL"] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required env var ${key}`);
    process.exit(1);
  }
}
