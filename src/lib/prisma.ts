import { PrismaPg } from '@prisma/adapter-pg';
import "dotenv/config";
import pg from 'pg';
import { PrismaClient } from "../generated/prisma/index.js";

const { Pool } = pg;
const connectionString = `${process.env.DATABASE_URL}`;

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export { prisma };

