import "dotenv/config";

const required = [
  "JWT_SECRET",
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console -- fatal bootstrap error, logger may not be ready
    console.error(`FATAL: Missing required env var ${key}`);
    process.exit(1);
  }
}
