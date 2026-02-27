import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import pg from "pg";
import { PrismaClient } from "../../generated/prisma/index.js";

const { Pool } = pg;

const isLocalDb = process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("db:5432");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
