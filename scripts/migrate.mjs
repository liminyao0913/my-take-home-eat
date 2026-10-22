import Sqlite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const filename = resolve(process.env.DATABASE_PATH || ".data/lets-eat.sqlite");
mkdirSync(dirname(filename), { recursive: true });
const sqlite = new Sqlite(filename);
try {
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = FULL");
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");
} finally { sqlite.close(); }
