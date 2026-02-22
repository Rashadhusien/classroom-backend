import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

// Try to load .env from multiple possible locations
config({ path: resolve(__dirname, ".env") });
// Fallback to current directory if above doesn't work
if (!process.env.DATABASE_URL) {
  config();
}
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

console.log(process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);
