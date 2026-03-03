import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import pg from "pg";
import { PrismaClient } from "../../generated/prisma/index.js";

const { Pool } = pg;

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const isLocalDb =
  connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
